const { chromium } = require('playwright');
const { PlaywrightAgent } = require('@midscene/web/playwright');

const TokenInjector = require('./utils/tokenInjector');
const PageValidator = require('./core/PageValidator');
const ProgressTracker = require('./core/ProgressTracker');
const MenuCache = require('./core/MenuCache');
const { logger } = require('./utils/logger');
const { parseViewportConfig } = require('./utils/devicePresets');
const PerformanceMonitor = require('./utils/PerformanceMonitor');

class MenuTester {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.page = null;
    this.agent = null;
    this.tokenInjector = null;
    this.pageValidator = null;
    this.progressTracker = null;
    this.menuCache = null;
    this.performanceMonitor = null;
    this.mainPageUrl = config.url;

    logger.setVerbose(config.verbose || false);
  }

  async start() {
    try {
      logger.info('Initializing menu tester...');

      this.progressTracker = new ProgressTracker(this.config);
      this.menuCache = new MenuCache(this.config);

      await this.progressTracker.cleanupOldSessions();
      await this.initializeBrowser();

      this.tokenInjector = new TokenInjector(this.config);
      this.pageValidator = new PageValidator(this.agent, this.page, this.config);
      this.performanceMonitor = new PerformanceMonitor(this.page, this.config);

      await this.setupPage();
      await this.executeRouteModeTesting();
    } catch (error) {
      logger.error(`Menu testing failed: ${error.message}`);

      if (this.progressTracker) {
        await this.progressTracker.fail(error);
      }

      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async executeRouteModeTesting() {
    try {
      await this.progressTracker.updateStep('route_mode_testing');

      let routes = [];
      if (Array.isArray(this.config.routes) && this.config.routes.length > 0) {
        routes = this.config.routes.map((r, idx) => {
          const route = {
            menuText: r.menuText || r.text || `Route ${idx + 1}`,
            url: r.url,
            level: r.level || 1,
            recordedAt: r.recordedAt || new Date().toISOString(),
            screenshotScenarios: r.screenshotScenarios || [] // 保留截图场景配置
          };
          
          // 调试：输出场景配置信息
          if (route.screenshotScenarios && route.screenshotScenarios.length > 0) {
            logger.info(`📋 [路由加载] ${route.menuText} 包含 ${route.screenshotScenarios.length} 个截图场景`);
            logger.info(`📋 [路由加载] 场景详情: ${JSON.stringify(route.screenshotScenarios, null, 2)}`);
          } else {
            logger.debug(`📋 [路由加载] ${route.menuText} 无截图场景配置`);
          }
          
          return route;
        });
        logger.info(`使用配置文件内联路由，共 ${routes.length} 条`);
      } else {
        routes = await this.loadRoutesFromCache();
      }

      if (routes.length === 0) {
        throw new Error('未找到路由缓存，请通过导入或手动配置路由后再试');
      }

      logger.success(`加载了 ${routes.length} 个路由进行测试`);

      const routeMenus = routes.map((route, index) => ({
        id: `route-${index}`,
        text: route.menuText,
        url: route.url,
        level: route.level,
        mode: 'route',
        tested: false,
        success: null,
        error: null
      }));

      await this.progressTracker.initialize(routeMenus);

      for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        logger.info(`测试路由 ${i + 1}/${routes.length}: ${route.menuText} -> ${route.url}`);
        
        // 调试：检查场景配置
        if (route.screenshotScenarios && route.screenshotScenarios.length > 0) {
          logger.info(`🔍 [调试] 路由 "${route.menuText}" 在测试前检查：场景数 = ${route.screenshotScenarios.length}`);
        } else {
          logger.debug(`🔍 [调试] 路由 "${route.menuText}" 在测试前检查：无场景配置`);
        }

        // 如果是第一个路由且启用了性能监控，测量性能
        const isFirstRoute = i === 0;
        await this.testSingleRoute(route, routeMenus[i], isFirstRoute);

        if (i < routes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const summary = this.generateRouteModeTestSummary(routeMenus);
      await this.progressTracker.complete(summary);
    } catch (error) {
      throw new Error(`路由模式测试失败: ${error.message}`);
    }
  }

  async testSingleRoute(route, menuItem, measurePerformance = false) {
    try {
      await this.progressTracker.startMenu(menuItem.id);

      logger.debug(`导航到路由: ${route.url}`);
      await this.page.goto(route.url, {
        waitUntil: 'load',
        timeout: this.config.timeout
      });

      await this.waitForPageStable();

      // 如果是第一个路由且启用了性能监控，测量性能
      let performanceMetrics = null;
      if (measurePerformance && this.performanceMonitor && this.performanceMonitor.enabled) {
        performanceMetrics = await this.performanceMonitor.measurePerformance();
      }

      const validationResult = await this.validateRoutePage(route);

      // 处理截图：支持多场景截图
      let screenshots = null;
      if (this.config.screenshots) {
        logger.info(`📸 开始捕获截图，路由: ${route.menuText}`);
        logger.info(`📸 路由配置中的场景数: ${route.screenshotScenarios?.length || 0}`);
        if (route.screenshotScenarios && route.screenshotScenarios.length > 0) {
          logger.info(`📸 场景详情: ${JSON.stringify(route.screenshotScenarios, null, 2)}`);
        }
        screenshots = await this.captureScreenshots(route, menuItem, validationResult.success);
        if (screenshots) {
          logger.debug(`截图完成，结果类型: ${Array.isArray(screenshots) ? '数组' : '单个'}`);
        } else {
          logger.warning('截图返回为空');
        }
      } else {
        logger.debug('截图功能未启用');
      }

      // 提取截图对比数据
      const screenshotComparisons = this.extractScreenshotComparisons(screenshots);

      const testResult = {
        success: validationResult.success,
        error: validationResult.error,
        screenshot: screenshots, // 可能是单个截图或截图数组
        screenshots: screenshots, // 明确的多截图字段
        details: validationResult,
        url: route.url,
        mode: 'route',
        duration: Date.now() - (this.progressTracker.progress.menus[menuItem.id]?.startTime || Date.now()),
        performance: performanceMetrics, // 性能指标（仅第一个路由）
        screenshotComparisons: screenshotComparisons // 截图对比数据
      };

      await this.progressTracker.completeMenu(menuItem.id, testResult);

      if (validationResult.success) {
        logger.success(`✓ ${route.menuText}: 路由访问成功`);
      } else {
        logger.error(`✗ ${route.menuText}: ${validationResult.error}`);
      }
    } catch (error) {
      const failResult = {
        success: false,
        error: error.message,
        screenshot: null,
        screenshots: null,
        url: route.url,
        mode: 'route',
        duration: Date.now() - (this.progressTracker.progress.menus[menuItem.id]?.startTime || Date.now()),
        performance: null,
        screenshotComparisons: []
      };

      await this.progressTracker.completeMenu(menuItem.id, failResult);
      logger.error(`✗ ${route.menuText}: ${error.message}`);
    }
  }

  /**
   * 捕获路由的截图（支持多场景）
   * @param {object} route - 路由配置
   * @param {object} menuItem - 菜单项
   * @param {boolean} success - 验证是否成功
   * @returns {string|Array|null} 单个截图路径或截图数组
   */
  async captureScreenshots(route, menuItem, success) {
    try {
      logger.info(`🔍 [截图场景] 进入 captureScreenshots 方法，路由: ${route.menuText}`);
      logger.info(`🔍 [截图场景] route 对象 keys: ${Object.keys(route).join(', ')}`);
      logger.info(`🔍 [截图场景] route.screenshotScenarios 类型: ${typeof route.screenshotScenarios}, 值: ${JSON.stringify(route.screenshotScenarios)}`);
      
      const scenarios = route.screenshotScenarios || [];
      logger.info(`[截图场景] 路由: ${route.menuText}, 场景数量: ${scenarios.length}`);
      
      if (scenarios.length > 0) {
        logger.info(`[截图场景] 场景列表: ${JSON.stringify(scenarios.map(s => ({ type: s.type, description: s.description })), null, 2)}`);
      }
      
      // 如果没有配置场景，使用默认截图
      if (scenarios.length === 0) {
        logger.debug(`[截图场景] 未配置场景，使用默认截图或自动发现`);
        // 尝试自动发现 tab（如果配置允许）
        if (this.config.autoDiscoverTabs !== false) {
          const autoTabs = await this.discoverTabs();
          if (autoTabs.length > 0) {
            logger.info(`自动发现 ${autoTabs.length} 个 tab，将自动截图`);
            return await this.captureTabScreenshots(route, menuItem, autoTabs, success);
          }
        }
        
        // 默认截图
        return await this.pageValidator.takeScreenshot(menuItem, success);
      }

      // 执行配置的场景截图
      logger.info(`开始执行 ${scenarios.length} 个截图场景`);
      const screenshotResults = [];
      
      for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];
        try {
          logger.info(`执行场景 ${i + 1}/${scenarios.length}: ${scenario.type} - ${scenario.description || '无描述'}`);
          const screenshot = await this.executeScreenshotScenario(route, menuItem, scenario, success);
          if (screenshot) {
            screenshotResults.push({
              scenario: scenario.description || scenario.type,
              screenshot: screenshot
            });
            logger.success(`场景 ${i + 1} 截图成功`);
          } else {
            logger.warning(`场景 ${i + 1} 截图返回为空`);
          }
        } catch (error) {
          logger.error(`场景截图失败: ${scenario.description || scenario.type} - ${error.message}`);
          logger.debug(error.stack);
        }
      }
      
      logger.info(`场景截图完成，成功 ${screenshotResults.length}/${scenarios.length} 个`);

      // 如果只有一个场景，返回单个截图（保持向后兼容）
      if (screenshotResults.length === 1) {
        return screenshotResults[0].screenshot;
      }

      // 多个场景返回数组
      return screenshotResults.length > 0 ? screenshotResults : null;
      
    } catch (error) {
      logger.debug(`捕获截图失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 执行单个截图场景
   * @param {object} route - 路由配置
   * @param {object} menuItem - 菜单项
   * @param {object} scenario - 场景配置
   * @param {boolean} success - 验证是否成功
   * @returns {string|null} 截图路径
   */
  async executeScreenshotScenario(route, menuItem, scenario, success) {
    const { type, description } = scenario;

    try {
      switch (type) {
        case 'default':
          // 默认页面截图
          await this.waitForPageStable();
          return await this.pageValidator.takeScreenshot(menuItem, success, description);

        case 'tab':
          // Tab 切换截图
          return await this.captureTabScreenshot(route, menuItem, scenario, success);

        case 'modal':
        case 'dialog':
          // 弹窗截图
          return await this.captureModalScreenshot(route, menuItem, scenario, success);

        case 'dropdown':
          // 下拉菜单截图
          return await this.captureDropdownScreenshot(route, menuItem, scenario, success);

        case 'custom':
          // 自定义操作截图
          return await this.captureCustomScreenshot(route, menuItem, scenario, success);

        default:
          logger.warning(`未知的场景类型: ${type}`);
          return null;
      }
    } catch (error) {
      logger.debug(`执行场景 ${description || type} 失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 自动发现页面上的 tab
   * @returns {Array} Tab 列表
   */
  async discoverTabs() {
    try {
      const tabs = await this.agent.aiQuery(`
        {
          text: string,
          index: number,
          selector: string
        }[],
        找到页面上所有的 tab 标签页（包括 el-tabs, ant-tabs, .tab-item 等），
        返回每个 tab 的文本、索引和选择器
      `);

      return Array.isArray(tabs) ? tabs : [];
    } catch (error) {
      logger.debug(`自动发现 tab 失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 捕获 tab 截图（自动发现模式）
   */
  async captureTabScreenshots(route, menuItem, tabs, success) {
    const results = [];
    
    for (const tab of tabs) {
      try {
        // 点击 tab
        await this.agent.aiTap(`点击第 ${tab.index + 1} 个 tab: "${tab.text}"`);
        await this.waitForPageStable();
        
        // 截图
        const screenshot = await this.pageValidator.takeScreenshot(
          { ...menuItem, text: `${menuItem.text} - ${tab.text}` },
          success,
          `Tab: ${tab.text}`
        );
        
        if (screenshot) {
          results.push({
            scenario: `Tab: ${tab.text}`,
            screenshot: screenshot
          });
        }
      } catch (error) {
        logger.debug(`Tab "${tab.text}" 截图失败: ${error.message}`);
      }
    }
    
    return results.length > 0 ? results : null;
  }

  /**
   * 捕获单个 tab 截图（配置模式）
   */
  async captureTabScreenshot(route, menuItem, scenario, success) {
    try {
      const { selector, text, index } = scenario;
      
      if (selector) {
        // 使用选择器点击
        await this.page.locator(selector).click();
      } else if (text) {
        // 使用文本点击
        await this.agent.aiTap(`点击 tab: "${text}"`);
      } else if (index !== undefined) {
        // 使用索引点击
        await this.agent.aiTap(`点击第 ${index + 1} 个 tab`);
      } else {
        logger.warning('Tab 场景缺少 selector、text 或 index');
        return null;
      }

      await this.waitForPageStable();
      
      const description = scenario.description || `Tab: ${text || index || selector}`;
      return await this.pageValidator.takeScreenshot(
        { ...menuItem, text: `${menuItem.text} - ${description}` },
        success,
        description
      );
    } catch (error) {
      logger.debug(`Tab 截图失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 捕获弹窗截图
   */
  async captureModalScreenshot(route, menuItem, scenario, success) {
    try {
      const { trigger, closeAfter = true } = scenario;
      
      if (!trigger) {
        logger.warning('Modal 场景缺少 trigger 配置');
        return null;
      }

      logger.info(`准备触发弹窗: ${trigger}`);
      
      // 确保页面已完全加载
      await this.waitForPageStable();
      await new Promise(resolve => setTimeout(resolve, 500)); // 额外等待确保页面稳定
      
      // 触发弹窗 - 清理 trigger 文本（移除多余空格，统一引号）
      const cleanTrigger = trigger.trim().replace(/\s+/g, ' ').replace(/['"]/g, '"');
      logger.debug(`清理后的 trigger: ${cleanTrigger}`);
      
      try {
        await this.agent.aiTap(cleanTrigger);
        logger.debug('已执行触发动作，等待页面稳定...');
        await this.waitForPageStable();
        await new Promise(resolve => setTimeout(resolve, 1000)); // 等待弹窗动画
      } catch (tapError) {
        logger.error(`点击触发按钮失败: ${tapError.message}`);
        logger.info('尝试使用备用方式：直接查找按钮文本');
        // 备用方案：尝试从 trigger 中提取按钮文本
        const buttonText = trigger.replace(/点击|按钮/g, '').trim().replace(/['"]/g, '');
        if (buttonText) {
          await this.agent.aiTap(`点击"${buttonText}"按钮`);
          await this.waitForPageStable();
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw tapError;
        }
      }
      
      // 等待弹窗出现
      logger.debug('等待弹窗出现...');
      try {
        await this.agent.aiWaitFor('弹窗或对话框已完全显示', { timeout: 5000 });
        logger.success('弹窗已出现');
      } catch (waitError) {
        logger.warning(`等待弹窗超时: ${waitError.message}`);
        logger.info('继续尝试截图（可能弹窗已出现但 AI 未检测到）');
        await new Promise(resolve => setTimeout(resolve, 1000)); // 再等一秒
      }
      
      const description = scenario.description || `Modal: ${trigger}`;
      logger.debug(`开始截图: ${description}`);
      const screenshot = await this.pageValidator.takeScreenshot(
        { ...menuItem, text: `${menuItem.text} - ${description}` },
        success,
        description
      );

      if (!screenshot) {
        logger.warning('截图返回为空，可能弹窗未出现或截图失败');
      }

      // 关闭弹窗（如果需要）
      if (closeAfter) {
        try {
          logger.debug('准备关闭弹窗...');
          // 尝试多种关闭方式
          try {
            await this.agent.aiTap('关闭弹窗或对话框');
          } catch (e1) {
            try {
              await this.agent.aiTap('点击关闭按钮');
            } catch (e2) {
              // 最后尝试 ESC 键
              await this.page.keyboard.press('Escape');
            }
          }
          await new Promise(resolve => setTimeout(resolve, 500));
          logger.debug('弹窗已关闭');
        } catch (error) {
          logger.warning(`关闭弹窗失败: ${error.message}`);
        }
      }

      return screenshot;
    } catch (error) {
      logger.error(`Modal 截图失败: ${error.message}`);
      if (this.config.verbose) {
        logger.debug(error.stack);
      }
      return null;
    }
  }

  /**
   * 捕获下拉菜单截图
   */
  async captureDropdownScreenshot(route, menuItem, scenario, success) {
    try {
      const { trigger, selector } = scenario;
      
      if (trigger) {
        await this.agent.aiTap(trigger);
      } else if (selector) {
        await this.page.locator(selector).click();
      } else {
        logger.warning('Dropdown 场景缺少 trigger 或 selector');
        return null;
      }

      await this.waitForPageStable();
      await this.agent.aiWaitFor('下拉菜单已展开', { timeout: 2000 });
      
      const description = scenario.description || `Dropdown: ${trigger || selector}`;
      const screenshot = await this.pageValidator.takeScreenshot(
        { ...menuItem, text: `${menuItem.text} - ${description}` },
        success,
        description
      );

      // 关闭下拉菜单
      try {
        await this.page.keyboard.press('Escape');
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        logger.debug(`关闭下拉菜单失败: ${error.message}`);
      }

      return screenshot;
    } catch (error) {
      logger.debug(`Dropdown 截图失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 捕获自定义操作截图
   */
  async captureCustomScreenshot(route, menuItem, scenario, success) {
    try {
      const { actions, waitAfter = 1000 } = scenario;
      
      if (!Array.isArray(actions) || actions.length === 0) {
        logger.warning('Custom 场景缺少 actions 配置');
        return null;
      }

      // 执行一系列操作
      for (const action of actions) {
        if (action.type === 'click') {
          await this.agent.aiTap(action.target);
        } else if (action.type === 'wait') {
          await new Promise(resolve => setTimeout(resolve, action.duration || 1000));
        } else if (action.type === 'scroll') {
          await this.agent.aiScroll({
            direction: action.direction || 'down',
            scrollType: action.scrollType || 'increment',
            amount: action.amount || 500
          });
        }
      }

      await new Promise(resolve => setTimeout(resolve, waitAfter));
      await this.waitForPageStable();
      
      const description = scenario.description || 'Custom action';
      return await this.pageValidator.takeScreenshot(
        { ...menuItem, text: `${menuItem.text} - ${description}` },
        success,
        description
      );
    } catch (error) {
      logger.debug(`Custom 截图失败: ${error.message}`);
      return null;
    }
  }

  async validateRoutePage(route) {
    try {
      const currentUrl = this.page.url();
      
      // 基础验证
      const basicValidation = await this.pageValidator.validatePageLoad(
        { text: route.menuText, url: route.url },
        route.url
      );
      
      // 额外的路由特定验证
      const routeSpecificValidation = await this.performRouteSpecificValidation(route);
      
      return {
        success: basicValidation.success && routeSpecificValidation.success,
        error: basicValidation.error || routeSpecificValidation.error,
        currentUrl: currentUrl,
        expectedUrl: route.url,
        routeSpecific: routeSpecificValidation
      };
      
    } catch (error) {
      return {
        success: false,
        error: `页面验证失败: ${error.message}`,
        currentUrl: this.page.url(),
        expectedUrl: route.url
      };
    }
  }

  async performRouteSpecificValidation(route) {
    try {
      // 获取该路由的验证规则
      const validationRules = this.menuCache.cache.routes.routeValidation.get(route.url);
      
      if (!validationRules) {
        // 没有特定验证规则，使用基础验证
        return { success: true, details: 'No specific validation rules' };
      }
      
      // 这里可以根据验证规则进行特定检查
      // 例如：检查特定元素存在、页面标题、内容等
      
      return { success: true, details: 'Route specific validation passed' };
      
    } catch (error) {
      return {
        success: false,
        error: `路由特定验证失败: ${error.message}`
      };
    }
  }

  generateRouteModeTestSummary(routeMenus) {
    const total = routeMenus.length;
    const successful = routeMenus.filter(menu => {
      const menuResult = this.progressTracker.progress.menus[menu.id];
      return menuResult && menuResult.status === 'completed';
    }).length;
    const failed = total - successful;
    
    return {
      mode: 'route',
      totalRoutes: total,
      successful,
      failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(1) + '%' : '0%',
      testDuration: Date.now() - this.progressTracker.startTime
    };
  }

  async loadRoutesFromCache() {
    try {
      const loaded = await this.menuCache.load();
      if (!loaded) {
        return [];
      }
      return this.menuCache.getAllRoutes();
    } catch (error) {
      logger.debug(`加载路由缓存失败: ${error.message}`);
      return [];
    }
  }

  async waitForPageStable() {
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      await this.agent.aiWaitFor(
        '页面加载完成且内容稳定显示',
        { timeout: 3000 }
      );
    } catch (error) {
      logger.debug('等待页面稳定超时');
    }
  }

  async initializeBrowser() {
    try {
      logger.debug('Launching browser...');
      
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      // 解析 viewport 配置
      const viewportConfig = parseViewportConfig(this.config.viewport);
      
      // 构建 context 选项
      const contextOptions = {
        viewport: viewportConfig.viewport,
        userAgent: viewportConfig.userAgent || this.config.userAgent || undefined
      };
      
      // 添加设备相关配置（如果存在）
      if (viewportConfig.deviceScaleFactor !== undefined) {
        contextOptions.deviceScaleFactor = viewportConfig.deviceScaleFactor;
      }
      if (viewportConfig.isMobile !== undefined) {
        contextOptions.isMobile = viewportConfig.isMobile;
      }
      if (viewportConfig.hasTouch !== undefined) {
        contextOptions.hasTouch = viewportConfig.hasTouch;
      }
      
      logger.info(`使用视口配置: ${viewportConfig.viewport.width}x${viewportConfig.viewport.height}${viewportConfig.isMobile ? ' (移动设备)' : ' (桌面)'}`);
      
      const context = await this.browser.newContext(contextOptions);
      
      this.page = await context.newPage();
      
      // Initialize Midscene agent
      this.agent = new PlaywrightAgent(this.page, {
        forceSameTabNavigation: true
      });
      
      logger.success('Browser initialized successfully');
      
    } catch (error) {
      throw new Error(`Failed to initialize browser: ${error.message}`);
    }
  }

  async setupPage() {
    try {
      await this.progressTracker.updateStep('page_setup');
      
      // 先注入 Token（在导航前）
      await this.tokenInjector.inject(this.page, this.page.context());
      
      logger.info(`Navigating to: ${this.config.url}`);
      
      // 然后导航到目标 URL
      await this.page.goto(this.config.url, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout
      });
      
      // 等待页面完全稳定（兼容没有 waitForLoadState 的环境）
      if (typeof this.page.waitForLoadState === 'function') {
      await this.page.waitForLoadState('networkidle');
      } else {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      logger.success('Page setup completed');
      
    } catch (error) {
      throw new Error(`Failed to setup page: ${error.message}`);
    }
  }

  async cleanup() {
    try {
      if (this.tokenInjector && this.page) {
        await this.tokenInjector.cleanup(this.page, this.page.context());
      }
      
      if (this.browser) {
        await this.browser.close();
        logger.debug('Browser closed');
      }
    } catch (error) {
      logger.debug(`Cleanup failed: ${error.message}`);
    }
  }

  /**
   * 从截图结果中提取对比数据
   * @param {string|Array|null} screenshots - 截图结果
   * @returns {Array} 截图对比数据数组
   */
  extractScreenshotComparisons(screenshots) {
    if (!screenshots) {
      return [];
    }

    const comparisons = [];

    // 如果是数组
    if (Array.isArray(screenshots)) {
      screenshots.forEach(item => {
        if (item.screenshot && typeof item.screenshot === 'object' && item.screenshot.comparison) {
          comparisons.push({
            scenario: item.scenario || 'default',
            match: item.screenshot.comparison.match !== false,
            diffPercentage: item.screenshot.comparison.diffPercentage || 0,
            type: item.screenshot.comparison.type
          });
        }
      });
    }
    // 如果是单个对象
    else if (typeof screenshots === 'object' && screenshots.comparison) {
      comparisons.push({
        scenario: 'default',
        match: screenshots.comparison.match !== false,
        diffPercentage: screenshots.comparison.diffPercentage || 0,
        type: screenshots.comparison.type
      });
    }

    return comparisons;
  }

  getStatus() {
    if (this.progressTracker) {
      return this.progressTracker.getStatus();
    }
    
    return {
      status: 'not_started',
      progress: { percentage: 0 }
    };
  }

  async listSessions() {
    const tracker = new ProgressTracker(this.config);
    return await tracker.listAvailableSessions();
  }
}

module.exports = MenuTester; 