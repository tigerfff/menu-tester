const { chromium } = require('playwright');
const { PlaywrightAgent } = require('@midscene/web/playwright');

const TokenInjector = require('./utils/tokenInjector');
const MenuDiscovery = require('./core/MenuDiscovery');
const PageValidator = require('./core/PageValidator');
const ExceptionHandler = require('./core/ExceptionHandler');
const ProgressTracker = require('./core/ProgressTracker');
const MenuNavigator = require('./core/MenuNavigator');
const MenuCache = require('./core/MenuCache');
const { logger } = require('./utils/logger');

class MenuTester {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.page = null;
    this.agent = null;
    this.tokenInjector = null;
    this.menuDiscovery = null;
    this.pageValidator = null;
    this.exceptionHandler = null;
    this.progressTracker = null;
    this.menuNavigator = null;
    this.menuCache = null;
    this.mainPageUrl = config.url; // 主页面URL，用于跨域返回
    
    // Set logger verbosity
    logger.setVerbose(config.verbose || false);
  }

  /**
   * Start the menu testing process
   */
  async start() {
    try {
      logger.info('Initializing menu tester...');
      
      // Initialize progress tracker
      this.progressTracker = new ProgressTracker(this.config);
      
      // Initialize menu cache
      this.menuCache = new MenuCache(this.config);
      
      // Clean up old sessions
      await this.progressTracker.cleanupOldSessions();
      
      // Initialize browser and page
      await this.initializeBrowser();
      
      // Initialize token injector
      this.tokenInjector = new TokenInjector(this.config);
      
      // Initialize core modules
      this.menuDiscovery = new MenuDiscovery(this.agent, this.page, this.config);
      this.pageValidator = new PageValidator(this.agent, this.page, this.config);
      this.exceptionHandler = new ExceptionHandler(this.agent, this.page, this.config);
      this.menuNavigator = new MenuNavigator(this.agent, this.page, this.config);
      
      // Navigate to target URL and inject token
      await this.setupPage();
      
      // 新流程：根据配置选择测试模式
      await this.executeMenuTesting();
      
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

  /**
   * 执行菜单测试 - 根据配置选择模式
   */
  async executeMenuTesting() {
    const mode = this.config.testMode || 'hybrid'; // 默认混合模式
    
    logger.info(`使用测试模式: ${mode}`);
    
    switch (mode) {
      case 'route':
        await this.executeRouteModeTesting();
        break;
      case 'ai':
        await this.executeSmartMenuTestingWithCache();
        break;
      case 'hybrid':
        await this.executeHybridModeTesting();
        break;
      default:
        logger.warning(`未知测试模式: ${mode}，使用混合模式`);
        await this.executeHybridModeTesting();
    }
  }

  /**
   * 执行路由模式测试
   */
  async executeRouteModeTesting() {
    try {
      await this.progressTracker.updateStep('route_mode_testing');
      
      // 1. 从缓存加载路由表
      const routes = await this.loadRoutesFromCache();
      
      if (routes.length === 0) {
        throw new Error('未找到路由缓存，请先运行 AI 模式建立路由缓存，或手动导入路由配置');
      }
      
      logger.success(`加载了 ${routes.length} 个路由进行测试`);
      
      // 2. 初始化进度跟踪
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
      
      // 3. 逐个测试路由
      for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        logger.info(`测试路由 ${i + 1}/${routes.length}: ${route.menuText} -> ${route.url}`);
        
        await this.testSingleRoute(route, routeMenus[i]);
        
        // 短暂延迟避免请求过快
        if (i < routes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // 4. 生成测试报告
      const summary = this.generateRouteModeTestSummary(routeMenus);
      await this.progressTracker.complete(summary);
      
    } catch (error) {
      throw new Error(`路由模式测试失败: ${error.message}`);
    }
  }

  /**
   * 执行混合模式测试
   */
  async executeHybridModeTesting() {
    try {
      await this.progressTracker.updateStep('hybrid_mode_testing');
      
      // 1. 尝试路由模式
      const routes = await this.loadRoutesFromCache();
      
      if (routes.length > 0) {
        logger.info('混合模式：优先使用路由测试');
        
        // 使用路由模式测试已知路由
        await this.executeRouteModeTesting();
        
        // 可选：运行AI发现来验证是否有新菜单
        if (this.config.hybridVerifyNew !== false) {
          logger.info('验证是否有新增菜单...');
          await this.verifyNewMenusWithAI();
        }
        
      } else {
        logger.info('混合模式：未找到路由缓存，使用 AI 模式');
        await this.executeSmartMenuTestingWithCache();
      }
      
    } catch (error) {
      throw new Error(`混合模式测试失败: ${error.message}`);
    }
  }

  /**
   * 从缓存加载路由表
   * @returns {Array} 路由列表
   */
  async loadRoutesFromCache() {
    try {
      // 使用专门的路由缓存加载逻辑（不要求顶级菜单存在）
      await this.loadCacheForRoutes();
      return this.menuCache.getAllRoutes();
    } catch (error) {
      logger.debug(`加载路由缓存失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 为路由测试加载缓存文件（不要求顶级菜单存在）
   */
  async loadCacheForRoutes() {
    try {
      const fs = require('fs-extra');
      const cacheFile = this.menuCache.cacheFile;
      
      if (!await fs.pathExists(cacheFile)) {
        logger.debug('路由缓存文件不存在');
        return;
      }

      const cacheData = await fs.readJson(cacheFile);
      
      // 检查URL是否匹配
      if (cacheData.url !== this.config.url) {
        logger.debug('缓存URL不匹配，使用空缓存');
        return;
      }

      // 重新构建缓存对象，特别处理路由数据
      this.menuCache.cache = {
        ...cacheData,
        menus: {
          topLevel: cacheData.menus.topLevel || [],
          subMenus: new Map()
        },
        routes: {
          menuRoutes: new Map(),
          routeValidation: new Map(),
          hierarchy: [],
          parameters: new Map()
        }
      };

      // 安全地转换路由数据
      if (cacheData.routes) {
        // 转换 menuRoutes
        if (cacheData.routes.menuRoutes) {
          if (typeof cacheData.routes.menuRoutes === 'object' && !Array.isArray(cacheData.routes.menuRoutes)) {
            this.menuCache.cache.routes.menuRoutes = new Map(Object.entries(cacheData.routes.menuRoutes));
          }
        }
        
        // 转换 routeValidation
        if (cacheData.routes.routeValidation) {
          if (typeof cacheData.routes.routeValidation === 'object' && !Array.isArray(cacheData.routes.routeValidation)) {
            this.menuCache.cache.routes.routeValidation = new Map(Object.entries(cacheData.routes.routeValidation));
          }
        }
        
        // 其他路由数据
        this.menuCache.cache.routes.hierarchy = cacheData.routes.hierarchy || [];
        
        if (cacheData.routes.parameters) {
          if (typeof cacheData.routes.parameters === 'object' && !Array.isArray(cacheData.routes.parameters)) {
            this.menuCache.cache.routes.parameters = new Map(Object.entries(cacheData.routes.parameters));
          }
        }
      }

      const routeCount = this.menuCache.cache.routes.menuRoutes.size;
      if (routeCount > 0) {
        logger.debug(`成功加载路由缓存: ${routeCount} 个路由映射`);
      }
      
    } catch (error) {
      logger.debug(`加载路由缓存失败: ${error.message}`);
    }
  }

  /**
   * 测试单个路由
   * @param {object} route - 路由信息
   * @param {object} menuItem - 菜单项对象
   */
  async testSingleRoute(route, menuItem) {
    try {
      await this.progressTracker.startMenu(menuItem.id);
      
      // 1. 直接导航到路由URL
      logger.debug(`导航到路由: ${route.url}`);
      await this.page.goto(route.url, {
        waitUntil: 'load',
        timeout: this.config.timeout
      });
      
      // 2. 等待页面稳定
      await this.waitForPageStable();
      
      // 3. 验证页面加载
      const validationResult = await this.validateRoutePage(route);
      
      // 4. 截图（如果配置了）
      let screenshot = null;
      if (this.config.screenshots) {
        screenshot = await this.pageValidator.takeScreenshot(menuItem, validationResult.success);
      }
      
      // 5. 记录测试结果
      const testResult = {
        success: validationResult.success,
        error: validationResult.error,
        screenshot,
        details: validationResult,
        url: route.url,
        mode: 'route'
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
        url: route.url,
        mode: 'route'
      };
      
      await this.progressTracker.completeMenu(menuItem.id, failResult);
      logger.error(`✗ ${route.menuText}: ${error.message}`);
    }
  }

  /**
   * 验证路由页面
   * @param {object} route - 路由信息
   * @returns {object} 验证结果
   */
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

  /**
   * 执行路由特定的验证
   * @param {object} route - 路由信息
   * @returns {object} 验证结果
   */
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

  /**
   * 用AI验证是否有新菜单
   */
  async verifyNewMenusWithAI() {
    try {
      logger.info('使用 AI 验证是否有新增菜单...');
      
      // 运行简化的AI发现流程
      const discoveredMenus = await this.discoverTopLevelMenus();
      const cachedRoutes = this.menuCache.getAllRoutes();
      
      // 找出新菜单
      const newMenus = discoveredMenus.filter(menu => 
        !cachedRoutes.some(route => route.menuText === menu.text)
      );
      
      if (newMenus.length > 0) {
        logger.warning(`发现 ${newMenus.length} 个新菜单，建议更新路由缓存`);
        
        // 可选：自动将新菜单添加到测试队列
        if (this.config.autoTestNewMenus !== false) {
          logger.info('自动测试新发现的菜单...');
          for (const menu of newMenus) {
            await this.testMenuBranchRecursivelyWithCache(menu, 1);
          }
        }
      } else {
        logger.success('未发现新菜单，路由缓存完整');
      }
      
    } catch (error) {
      logger.warning(`AI验证新菜单失败: ${error.message}`);
    }
  }

  /**
   * 生成路由模式测试汇总
   * @param {Array} routeMenus - 路由菜单列表
   * @returns {object} 汇总信息
   */
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

  /**
   * 执行智能菜单测试（带缓存优化）
   */
  async executeSmartMenuTestingWithCache() {
    try {
      await this.progressTracker.updateStep('smart_menu_testing_with_cache');
      
      let rootMenus = [];
      const discoveryStartTime = Date.now();
      
      // 1. 尝试从缓存加载菜单
      if (this.config.useCache !== false) { // 默认启用缓存
        logger.info('尝试从缓存加载菜单结构...');
        const cachedData = await this.menuCache.loadCachedMenus();
        
        if (cachedData && cachedData.topLevelMenus) {
          rootMenus = cachedData.topLevelMenus;
          logger.success(`从缓存加载了 ${rootMenus.length} 个顶级菜单，跳过发现阶段`);
          
          // 显示缓存统计信息
          const stats = this.menuCache.getStats();
          logger.info(`缓存统计: 顶级菜单 ${stats.topLevelCount} 个，子菜单组 ${stats.subMenusCount} 个`);
        }
      }
      
      // 2. 如果缓存未命中，进行菜单发现
      if (rootMenus.length === 0) {
        logger.info('缓存未命中或被禁用，开始发现菜单...');
        rootMenus = await this.discoverTopLevelMenus();
        
        const discoveryDuration = Date.now() - discoveryStartTime;
        
        if (rootMenus.length === 0) {
          throw new Error('未发现任何菜单项');
        }
        
        // 3. 保存新发现的菜单到缓存
        if (this.config.useCache !== false) {
          logger.info('保存菜单结构到缓存...');
          await this.menuCache.saveMenusToCache(rootMenus, new Map(), discoveryDuration);
        }
      }
      
      // 4. 初始化进度跟踪
      await this.progressTracker.initialize(rootMenus);
      
      // 5. 对每个根菜单进行深度优先测试（带缓存支持）
      for (let i = 0; i < rootMenus.length; i++) {
        const rootMenu = rootMenus[i];
        logger.info(`开始测试第 ${i + 1}/${rootMenus.length} 个根菜单: ${rootMenu.text}`);
        
        await this.testMenuBranchRecursivelyWithCache(rootMenu, 1);
        
        // 完成一个根菜单分支后，返回首页准备下一个分支
        if (i < rootMenus.length - 1) {
          await this.menuNavigator.navigateToHome();
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // 6. 生成最终报告
      const summary = this.generateFinalSummary();
      await this.progressTracker.complete(summary);
      
    } catch (error) {
      throw new Error(`智能菜单测试失败: ${error.message}`);
    }
  }

  /**
   * 执行智能菜单测试（边发现边测试模式）- 原版本保留
   */
  async executeSmartMenuTesting() {
    try {
      await this.progressTracker.updateStep('smart_menu_testing');
      
      // 1. 发现顶级菜单
      const rootMenus = await this.discoverTopLevelMenus();
      
      if (rootMenus.length === 0) {
        throw new Error('未发现任何菜单项');
      }
      
      // 2. 初始化进度跟踪（仅用已知的根菜单）
      await this.progressTracker.initialize(rootMenus);
      
      // 3. 对每个根菜单进行深度优先测试（边发现边测试）
      for (let i = 0; i < rootMenus.length; i++) {
        const rootMenu = rootMenus[i];
        logger.info(`开始测试第 ${i + 1}/${rootMenus.length} 个根菜单: ${rootMenu.text}`);
        
        await this.testMenuBranchRecursively(rootMenu, 1);
        
        // 完成一个根菜单分支后，返回首页准备下一个分支
        if (i < rootMenus.length - 1) {
          await this.menuNavigator.navigateToHome();
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // 4. 生成最终报告
      const summary = this.generateFinalSummary();
      await this.progressTracker.complete(summary);
      
    } catch (error) {
      throw new Error(`智能菜单测试失败: ${error.message}`);
    }
  }

  /**
   * 发现顶级菜单
   */
  async discoverTopLevelMenus() {
    try {
      await this.progressTracker.updateStep('top_menu_discovery');
      
      logger.info('发现顶级菜单...');
      const topMenus = await this.menuDiscovery.discoverTopLevelMenus();
      
      // 为根菜单添加路径信息
      const normalizedMenus = topMenus.map((menu, index) => ({
        ...menu,
        id: menu.id || `root-menu-${index}`,
        level: 1,
        path: menu.isDropdownItem ? ['more', menu.text] : [menu.text],
        parent: null,
        tested: false,
        success: null,
        error: null
      }));
      
      logger.success(`发现 ${normalizedMenus.length} 个顶级菜单项`);
      return normalizedMenus;
      
    } catch (error) {
      throw new Error(`顶级菜单发现失败: ${error.message}`);
    }
  }

  /**
   * 递归测试菜单分支（带缓存支持）
   * @param {object} menu - 当前菜单
   * @param {number} level - 菜单层级
   */
  async testMenuBranchRecursivelyWithCache(menu, level) {
    try {
      logger.progress(`测试 L${level} 菜单: ${menu.text} (路径: ${menu.path?.join(' → ') || menu.text})`);
      
      // 1. 测试当前菜单
      const testResult = await this.testSingleMenuWithContext(menu, level);
      
      // 2. 如果测试成功且不是跨域，且未达到最大深度，尝试发现并测试子菜单
      if (testResult.success && 
          !testResult.isCrossDomain && 
          level < this.config.depth &&
          !await this.isBackToMainPage(menu)) {
        
        // 3. 尝试从缓存获取子菜单
        const menuKey = this.menuCache.generateMenuKey(menu);
        let subMenus = [];
        
        if (this.config.useCache !== false) {
          subMenus = this.menuCache.getCachedSubMenus(menuKey);
          if (subMenus.length > 0) {
            logger.debug(`从缓存加载了 "${menu.text}" 的 ${subMenus.length} 个子菜单`);
          }
        }
        
        // 4. 如果缓存中没有子菜单，则进行发现
        if (subMenus.length === 0) {
          subMenus = await this.discoverCurrentSubMenus(menu, level);
          
          // 将新发现的子菜单添加到缓存
          if (subMenus.length > 0 && this.config.useCache !== false) {
            await this.menuCache.addSubMenusToCache(menuKey, subMenus);
            logger.debug(`缓存了 "${menu.text}" 的 ${subMenus.length} 个子菜单`);
          }
        }
        
        if (subMenus.length > 0) {
          logger.info(`在 "${menu.text}" 下发现 ${subMenus.length} 个子菜单`);
          
          // 5. 动态添加子菜单到进度跟踪
          await this.progressTracker.addDiscoveredMenus(subMenus);
          
          // 6. 递归测试每个子菜单
          for (let i = 0; i < subMenus.length; i++) {
            const subMenu = subMenus[i];
            // 测试子菜单
            await this.testMenuBranchRecursivelyWithCache(subMenu, level + 1);
            
            // 在测试子菜单之间返回当前菜单页面（除非是最后一个）
            if (i < subMenus.length - 1) {
              await this.navigateBackToParentMenu(menu);
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        } else {
          logger.debug(`菜单 "${menu.text}" 下无子菜单`);
        }
      }
      
      // 7. 如果不是根菜单且有父菜单，准备返回（由调用者处理）
      if (level > 1 && menu.parent) {
        logger.debug(`完成菜单 "${menu.text}" 测试，准备返回上级`);
      } else if (level === 1) {
        logger.debug(`完成根菜单 "${menu.text}" 的整个分支测试`);
      }
      
    } catch (error) {
      logger.error(`测试菜单分支 "${menu.text}" 失败: ${error.message}`);
      
      // 记录失败结果
      const failResult = {
        success: false,
        error: error.message,
        screenshot: null
      };
      
      if (menu.id && this.progressTracker.progress.menus[menu.id]) {
        await this.progressTracker.completeMenu(menu.id, failResult);
      }
    }
  }

  /**
   * 递归测试菜单分支（边发现边测试的核心方法）- 原版本保留
   * @param {object} menu - 当前菜单
   * @param {number} level - 菜单层级
   */
  async testMenuBranchRecursively(menu, level) {
    try {
      logger.progress(`测试 L${level} 菜单: ${menu.text} (路径: ${menu.path?.join(' → ') || menu.text})`);
      
      // 1. 测试当前菜单
      const testResult = await this.testSingleMenuWithContext(menu, level);
      
      // 2. 如果测试成功且不是跨域，且未达到最大深度，尝试发现并测试子菜单
      if (testResult.success && 
          !testResult.isCrossDomain && 
          level < this.config.depth &&
          !await this.isBackToMainPage(menu)) {
        
        // 3. 发现当前页面的子菜单
        const subMenus = await this.discoverCurrentSubMenus(menu, level);
        
        if (subMenus.length > 0) {
          logger.info(`在 "${menu.text}" 下发现 ${subMenus.length} 个子菜单`);
          
          // 4. 动态添加子菜单到进度跟踪
          await this.progressTracker.addDiscoveredMenus(subMenus);
          
          // 5. 递归测试每个子菜单
          for (let i = 0; i < subMenus.length; i++) {
            const subMenu = subMenus[i];
            // 测试子菜单
            await this.testMenuBranchRecursively(subMenu, level + 1);
            
            // 在测试子菜单之间返回当前菜单页面（除非是最后一个）
            if (i < subMenus.length - 1) {
              await this.navigateBackToParentMenu(menu);
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        } else {
          logger.debug(`菜单 "${menu.text}" 下无子菜单`);
        }
      }
      
      // 6. 如果不是根菜单且有父菜单，准备返回（由调用者处理）
      if (level > 1 && menu.parent) {
        logger.debug(`完成菜单 "${menu.text}" 测试，准备返回上级`);
      } else if (level === 1) {
        logger.debug(`完成根菜单 "${menu.text}" 的整个分支测试`);
      }
      
    } catch (error) {
      logger.error(`测试菜单分支 "${menu.text}" 失败: ${error.message}`);
      
      // 记录失败结果
      const failResult = {
        success: false,
        error: error.message,
        screenshot: null
      };
      
      if (menu.id && this.progressTracker.progress.menus[menu.id]) {
        await this.progressTracker.completeMenu(menu.id, failResult);
      }
    }
  }

  /**
   * 递归展开和发现深层级菜单
   * @param {Array} menuItems - 菜单项列表
   * @param {object} parentMenu - 父菜单
   * @param {number} currentLevel - 当前层级
   * @param {number} maxDepth - 最大深度
   * @returns {Array} 所有发现的菜单项
   */
  async discoverDeepMenusRecursively(menuItems, parentMenu, currentLevel, maxDepth = 3) {
    const allDiscoveredMenus = [];
    
    for (const menu of menuItems) {
      if (menu.isSubmenu && currentLevel < maxDepth) {
        logger.debug(`尝试递归展开深层菜单: ${menu.text} (层级: ${currentLevel})`);
        
        // 确保菜单可见并展开
        await this.menuDiscovery.ensureMenuVisible(menu.text);
        const expanded = await this.menuDiscovery.expandSubMenu(menu.text);
        
        if (expanded) {
          // 发现展开后的子菜单项
          const subItems = await this.menuDiscovery.discoverExpandedSubMenuItems(menu.text);
          
          if (subItems.length > 0) {
            // 递归处理子菜单项
            const deepMenus = await this.discoverDeepMenusRecursively(
              subItems, 
              parentMenu, 
              currentLevel + 1, 
              maxDepth
            );
            
            allDiscoveredMenus.push(...deepMenus);
          }
          
          // 将子菜单项添加到结果中
          subItems.forEach(subItem => {
            allDiscoveredMenus.push({
              id: `${parentMenu.id}-deep-${allDiscoveredMenus.length}`,
              text: subItem.text,
              level: currentLevel + 1,
              parent: parentMenu,
              path: [...(parentMenu.path || [parentMenu.text]), menu.text, subItem.text],
              area: `sidebar-level-${currentLevel + 1}`,
              isDropdownItem: false,
              parentSubmenu: menu.text,
              isSubmenu: subItem.isSubmenu || false,
              tested: false,
              success: null,
              error: null
            });
          });
        }
      } else {
        // 普通菜单项或已达到最大深度
        allDiscoveredMenus.push({
          id: `${parentMenu.id}-item-${allDiscoveredMenus.length}`,
          text: menu.text,
          level: currentLevel,
          parent: parentMenu,
          path: [...(parentMenu.path || [parentMenu.text]), menu.text],
          area: `sidebar-level-${currentLevel}`,
          isDropdownItem: false,
          isSubmenu: menu.isSubmenu || false,
          tested: false,
          success: null,
          error: null
        });
      }
    }
    
    return allDiscoveredMenus;
  }

  /**
   * 发现当前页面的子菜单
   * @param {object} parentMenu - 父菜单
   * @param {number} currentLevel - 当前层级
   * @returns {Array} 子菜单列表
   */
  async discoverCurrentSubMenus(parentMenu, currentLevel) {
    try {
      // 等待页面稳定
      await this.waitForPageStable();
      
      // 发现左侧菜单（主要的子菜单来源）
      const sidebarMenus = await this.menuDiscovery.discoverCurrentPageSubMenus();
      
      // 递归发现和展开深层级菜单
      const allSubMenus = await this.discoverDeepMenusRecursively(
        sidebarMenus, 
        parentMenu, 
        currentLevel + 1,
        this.config.depth || 3
      );
      
      logger.debug(`总共发现 ${allSubMenus.length} 个子菜单项（包含深层级）`);
      return allSubMenus;
      
    } catch (error) {
      logger.debug(`发现 "${parentMenu.text}" 的子菜单失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 等待页面稳定
   */
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

  /**
   * 测试单个菜单（包含上下文处理）
   * @param {object} menu - 菜单项
   * @param {number} level - 菜单层级
   */
  async testSingleMenuWithContext(menu, level) {
    try {
      await this.progressTracker.startMenu(menu.id);
      
      // 1. 使用智能导航器导航到菜单
      await this.menuNavigator.navigateToMenu(menu);
      
      // 2. 获取导航后的URL并记录路由映射
      const currentUrl = await this.getCurrentUrl();
      await this.recordMenuRoute(menu, currentUrl, level);
      
      // 3. 验证页面响应
      const initialUrl = currentUrl;
      const validationResult = await this.pageValidator.validatePageLoad(menu, initialUrl);
      
      // 4. 截图（如果配置了）
      let screenshot = null;
      if (this.config.screenshots) {
        screenshot = await this.pageValidator.takeScreenshot(menu, validationResult.success);
      }
      
      // 5. 构建测试结果
      const testResult = {
        success: validationResult.success,
        error: validationResult.error,
        screenshot,
        details: validationResult,
        isCrossDomain: validationResult.isCrossDomain,
        recordedRoute: currentUrl
      };
      
      // 6. 记录测试结果
      await this.progressTracker.completeMenu(menu.id, testResult);
      
      return testResult;
      
    } catch (error) {
      const failResult = {
        success: false,
        error: error.message,
        screenshot: null
      };
      
      await this.progressTracker.completeMenu(menu.id, failResult);
      return failResult;
    }
  }

  /**
   * 记录菜单到路由的映射
   * @param {object} menu - 菜单对象
   * @param {string} currentUrl - 当前URL
   * @param {number} level - 菜单层级
   */
  async recordMenuRoute(menu, currentUrl, level) {
    try {
      // 只在AI模式下记录路由
      if (this.config.testMode === 'ai' || this.config.testMode === 'hybrid' || !this.config.testMode) {
        const validationRules = {
          pageTitle: await this.page.title(),
          timestamp: new Date().toISOString(),
          userAgent: this.config.userAgent
        };
        
        await this.menuCache.recordMenuRoute(
          menu.text,
          currentUrl,
          validationRules,
          level
        );
        
        logger.debug(`记录路由: ${menu.text} -> ${currentUrl}`);
      }
    } catch (error) {
      logger.debug(`记录路由失败: ${error.message}`);
    }
  }

  /**
   * 返回到父菜单页面
   * @param {object} parentMenu - 父菜单
   */
  async navigateBackToParentMenu(parentMenu) {
    try {
      logger.debug(`返回到父菜单: ${parentMenu.text}`);
      await this.menuNavigator.navigateToMenu(parentMenu);
    } catch (error) {
      logger.debug(`返回父菜单失败: ${error.message}，尝试浏览器后退`);
      try {
        await this.page.goBack({ waitUntil: 'networkidle', timeout: 3000 });
      } catch (backError) {
        logger.debug(`浏览器后退也失败: ${backError.message}`);
      }
    }
  }

  /**
   * 生成最终汇总报告
   * @returns {object} 汇总信息
   */
  generateFinalSummary() {
    const allMenus = Object.values(this.progressTracker.progress.menus);
    
    const byLevel = {
      level1: allMenus.filter(m => m.level === 1).length,
      level2: allMenus.filter(m => m.level === 2).length,
      level3: allMenus.filter(m => m.level === 3).length
    };
    
    const byResult = {
      successful: allMenus.filter(m => {
        const menuResult = this.progressTracker.progress.menus[m.id];
        return menuResult && menuResult.status === 'completed';
      }).length,
      failed: allMenus.filter(m => {
        const menuResult = this.progressTracker.progress.menus[m.id];
        return menuResult && menuResult.status === 'failed';
      }).length,
      pending: allMenus.filter(m => {
        const menuResult = this.progressTracker.progress.menus[m.id];
        return menuResult && menuResult.status === 'pending';
      }).length
    };
    
    return {
      totalMenus: allMenus.length,
      ...byLevel,
      ...byResult,
      successRate: allMenus.length > 0 ? (byResult.successful / allMenus.length * 100).toFixed(1) + '%' : '0%'
    };
  }

  /**
   * 原有的分层测试方法（保留作为备用）
   */
  async executeLayeredTesting(topLevelMenus) {
    try {
      logger.info(`Starting layered testing for ${topLevelMenus.length} top-level menus...`);
      
      // 分离下拉菜单项和常规菜单项
      const regularMenus = topLevelMenus.filter(menu => !menu.isDropdownItem);
      const dropdownMenus = topLevelMenus.filter(menu => menu.isDropdownItem);
      
      // 先测试常规菜单
      for (const topMenu of regularMenus) {
        await this.testMenuWithContext(topMenu, 1);
        
        // 短暂延迟，避免操作过快
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // 然后测试下拉菜单项（需要重新展开）
      if (dropdownMenus.length > 0) {
        logger.info(`Testing ${dropdownMenus.length} dropdown menu items...`);
        
        // 重新发现下拉菜单以确保"更多"菜单是展开的
        const rediscoveredMenus = await this.menuDiscovery.rediscoverDropdownMenus();
        
        // 合并原有的下拉菜单和重新发现的菜单
        const allDropdownMenus = [...dropdownMenus];
        for (const rediscovered of rediscoveredMenus) {
          if (!allDropdownMenus.find(menu => menu.text === rediscovered.text)) {
            allDropdownMenus.push(rediscovered);
          }
        }
        
        for (const dropdownMenu of allDropdownMenus) {
          await this.testMenuWithContext(dropdownMenu, 1);
          
          // 短暂延迟，避免操作过快
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      logger.success('Layered testing completed');
      
    } catch (error) {
      throw new Error(`Layered testing failed: ${error.message}`);
    }
  }

  /**
   * 测试菜单及其上下文（递归测试多层级）
   * @param {object} menu - 菜单项
   * @param {number} level - 当前层级
   */
  async testMenuWithContext(menu, level) {
    try {
      await this.progressTracker.startMenu(menu.id);
      
      // 确保下拉菜单展开（如果需要）
      if (menu.accessPath && menu.accessPath.length > 0) {
        await this.menuDiscovery.ensureDropdownExpanded(menu.accessPath);
      }
      
      // 设置当前上下文
      this.menuDiscovery.setCurrentContext(menu.text);
      
      // 测试当前菜单
      const testResult = await this.executeMenuTest(menu, level);
      await this.progressTracker.completeMenu(menu.id, testResult);
      
      // 如果是一级菜单且测试成功，发现并测试子菜单
      if (level === 1 && testResult.success && !testResult.isCrossDomain && !(await this.isBackToMainPage(menu))) {
        await this.discoverAndTestSubMenus(menu, level + 1);
      }
      
    } catch (error) {
      const failResult = {
        success: false,
        error: error.message,
        screenshot: null
      };
      
      await this.progressTracker.completeMenu(menu.id, failResult);
    }
  }

  /**
   * 发现并测试子菜单
   * @param {object} parentMenu - 父菜单
   * @param {number} level - 子菜单层级
   */
  async discoverAndTestSubMenus(parentMenu, level) {
    try {
      logger.debug(`Discovering level ${level} menus for: ${parentMenu.text}`);
      
      // 等待页面稳定后发现子菜单
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const subMenus = await this.menuDiscovery.discoverContextMenus(level);
      
      if (subMenus.length === 0) {
        logger.debug(`No level ${level} menus found for: ${parentMenu.text}`);
        return;
      }
      
      logger.success(`Found ${subMenus.length} level ${level} menus for: ${parentMenu.text}`);
      
      // 将子菜单添加到父菜单
      parentMenu.children = subMenus;
      
      // 添加子菜单到进度跟踪
      for (const subMenu of subMenus) {
        this.progressTracker.progress.menus[subMenu.id] = {
          id: subMenu.id,
          text: subMenu.text,
          level: subMenu.level,
          parentContext: subMenu.parentContext,
          status: 'pending',
          attempts: 0,
          error: null,
          startTime: null,
          endTime: null,
          duration: null,
          screenshot: null
        };
        this.progressTracker.progress.totalMenus++;
      }
      
      // 测试所有子菜单
      logger.info(`开始测试 ${subMenus.length} 个 L${level} 菜单项`);
      for (let i = 0; i < subMenus.length; i++) {
        const subMenu = subMenus[i];
        logger.progress(`测试 L${level} 菜单 ${i + 1}/${subMenus.length}: ${subMenu.text}`);
        
        // 更新菜单状态为测试中
        if (this.progressTracker.progress.menus[subMenu.id]) {
          this.progressTracker.progress.menus[subMenu.id].status = 'testing';
          this.progressTracker.progress.menus[subMenu.id].startTime = Date.now();
        }
        
        await this.testMenuWithContext(subMenu, level);
        
        // 在测试子菜单之间短暂延迟
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // 如果有三级菜单需求且当前是二级菜单，继续递归
      if (level === 2 && this.config.depth >= 3) {
        for (const subMenu of subMenus) {
          if (subMenu.success && !subMenu.isCrossDomain) {
            await this.discoverAndTestSubMenus(subMenu, level + 1);
          }
        }
      }
      
    } catch (error) {
      logger.debug(`Failed to discover/test sub-menus for ${parentMenu.text}: ${error.message}`);
    }
  }

  /**
   * 执行单个菜单测试
   * @param {object} menu - 菜单项
   * @param {number} level - 菜单层级
   */
  async executeMenuTest(menu, level) {
    try {
      const result = await this.exceptionHandler.executeWithRetry(
        async () => {
          return await this.performMenuTest(menu, level);
        },
        {
          menu,
          page: this.page,
          context: this.page.context(),
          tokenInjector: this.tokenInjector,
          initialUrl: this.page.url(),
          level
        },
        `Testing ${level === 1 ? 'top-level' : `level-${level}`} menu: ${menu.text}`
      );
      
      return result.success ? result.data : result;
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        screenshot: null
      };
    }
  }

  /**
   * 执行菜单测试的核心逻辑
   * @param {object} menu - 菜单项
   * @param {number} level - 菜单层级
   */
  async performMenuTest(menu, level) {
    const initialUrl = this.page.url();
    
    // 使用智能点击方法处理菜单项（包括下拉菜单项）
    await this.menuDiscovery.smartClickMenu(menu);
    
    // 验证页面响应
    const validationResult = await this.pageValidator.validatePageLoad(menu, initialUrl);
    
    // 截图（如果配置了）
    let screenshot = null;
    if (this.config.screenshots) {
      screenshot = await this.pageValidator.takeScreenshot(menu, validationResult.success);
    }
    
    // 处理导航结果
    await this.handleNavigationResult(validationResult, initialUrl, level);
    
    return {
      success: validationResult.success,
      error: validationResult.error,
      screenshot,
      details: validationResult,
      isCrossDomain: validationResult.isCrossDomain  // 确保跨域标记被传递
    };
  }

  /**
   * 处理导航结果
   * @param {object} validationResult - 验证结果
   * @param {string} initialUrl - 初始URL
   * @param {number} level - 菜单层级
   */
  async handleNavigationResult(validationResult, initialUrl, level) {
    try {
      // 如果是跨域导航，PageValidator已经处理了返回，但我们需要确保真的回到了主页面
      if (validationResult.isCrossDomain) {
        logger.info(`Cross-domain navigation detected for level ${level} menu`);
        
        // 验证是否真的回到了主页面，如果没有，强制导航回去
        const currentUrl = await this.getCurrentUrl();
        if (!this.isWithinMainDomain(currentUrl)) {
          logger.warning('Cross-domain return failed, forcing navigation back to main page');
          await this.forceNavigateBackToMain();
        }
        return;
      }
      
      // 如果URL或内容发生变化，且不是跨域，需要智能处理返回
      if (validationResult.urlChanged || validationResult.contentChanged) {
        const currentUrl = await this.getCurrentUrl();
        
        // 对于一级菜单，检查是否真的需要停留在新页面
        if (level === 1) {
          // 如果当前页面看起来不像是有子菜单的页面，应该返回主页面
          const hasSubMenus = await this.checkForSubMenus();
          if (!hasSubMenus) {
            logger.debug('No sub-menus detected, navigating back to main page');
            await this.navigateBackToMain(initialUrl);
          } else {
            logger.debug('Sub-menus detected, staying on current page');
          }
          return;
        }
        
        // 对于二级、三级菜单，测试完成后需要返回上一级
        if (level > 1) {
          await this.navigateBackToContext(initialUrl);
        }
      }
      
    } catch (error) {
      logger.debug(`Failed to handle navigation result: ${error.message}`);
    }
  }

  /**
   * 导航回到上下文页面
   * @param {string} contextUrl - 上下文URL
   */
  async navigateBackToContext(contextUrl) {
    try {
      const currentUrl = this.page.url();
      
      // 如果已经在正确的页面，无需导航
      if (currentUrl === contextUrl) {
        return;
      }
      
      // 尝试使用浏览器后退
      await this.page.goBack({ waitUntil: 'networkidle', timeout: 3000 });
      
      // 验证是否成功返回
      const newUrl = this.page.url();
      if (newUrl !== contextUrl) {
        // 如果后退失败，直接导航
        await this.page.goto(contextUrl, { waitUntil: 'networkidle', timeout: 3000 });
      }
      
      // 等待页面稳定
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      logger.debug(`Failed to navigate back to context: ${error.message}`);
    }
  }

  /**
   * 导航回到主页面
   * @param {string} mainUrl - 主页面URL
   */
  async navigateBackToMain(mainUrl) {
    try {
      const currentUrl = this.page.url();
      
      // 如果已经在主页面，无需导航
      if (currentUrl === mainUrl) {
        return;
      }
      
      logger.debug(`Navigating back to main page: ${mainUrl}`);
      
      // 尝试使用浏览器后退
      try {
        await this.page.goBack({ waitUntil: 'networkidle', timeout: 3000 });
        
        // 验证是否成功返回
        const newUrl = this.page.url();
        if (newUrl === mainUrl) {
          logger.debug('Successfully navigated back via goBack');
          return;
        }
      } catch (error) {
        logger.debug(`GoBack failed: ${error.message}, trying direct navigation`);
      }
      
      // 如果后退失败，直接导航到主页面
      await this.page.goto(mainUrl, { waitUntil: 'networkidle', timeout: this.config.timeout });
      
      // 等待页面稳定
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      logger.debug('Successfully navigated back to main page');
      
    } catch (error) {
      logger.warning(`Failed to navigate back to main page: ${error.message}`);
    }
  }

  /**
   * 强制导航回到主页面（用于跨域返回失败的情况）
   */
  async forceNavigateBackToMain() {
    try {
      logger.debug('Force navigating back to main page');
      
      await this.page.goto(this.mainPageUrl, { 
        waitUntil: 'networkidle', 
        timeout: this.config.timeout 
      });
      
      // 等待页面稳定
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      logger.success('Force navigation to main page completed');
      
    } catch (error) {
      logger.error(`Force navigation failed: ${error.message}`);
    }
  }

  /**
   * 检查当前页面是否有子菜单
   * @returns {boolean} 是否有子菜单
   */
  async checkForSubMenus() {
    try {
      const hasLeftMenu = await this.agent.aiBoolean(
        '当前页面是否有左侧菜单区域或侧边栏菜单'
      );
      
      if (hasLeftMenu) {
        const menuCount = await this.agent.aiQuery(`
          number,
          计算左侧菜单区域有多少个可点击的菜单项
        `);
        
        return typeof menuCount === 'number' && menuCount > 0;
      }
      
      return false;
    } catch (error) {
      logger.debug(`Failed to check for sub-menus: ${error.message}`);
      return false; // 默认认为没有子菜单，会导航回主页面
    }
  }

  /**
   * 检查URL是否在主域名范围内
   * @param {string} url - 要检查的URL
   * @returns {boolean} 是否在主域名内
   */
  isWithinMainDomain(url) {
    const domainPatterns = this.config.domainPatterns || ['/chain/'];
    return domainPatterns.some(pattern => url.includes(pattern));
  }

  /**
   * 获取当前页面URL
   * @returns {string} 当前URL
   */
  async getCurrentUrl() {
    try {
      return this.page.url();
    } catch (error) {
      logger.debug(`Failed to get current URL: ${error.message}`);
      return 'unknown';
    }
  }

  /**
   * 检查是否已经回到主页面（避免将主页面菜单误认为子菜单）
   * @param {object} originalMenu - 原始点击的菜单
   * @returns {boolean} 是否回到了主页面
   */
  async isBackToMainPage(originalMenu) {
    try {
      const currentUrl = this.page.url();
      const mainUrl = this.config.url;
      
      // 如果URL回到了主页面，说明是跨域返回
      if (currentUrl === mainUrl || currentUrl.includes('#/home')) {
        logger.debug(`Detected return to main page after clicking ${originalMenu.text}, skipping sub-menu discovery`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.debug(`Failed to check main page: ${error.message}`);
      return false;
    }
  }

  /**
   * Initialize browser and page
   */
  async initializeBrowser() {
    try {
      logger.debug('Launching browser...');
      
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: this.config.userAgent || undefined
      });
      
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

  /**
   * Setup page - navigate and inject token
   */
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

  /**
   * Generate layered summary
   * @param {Array} topLevelMenus - Top level menus with children
   * @returns {object} Summary object
   */
  generateLayeredSummary(topLevelMenus) {
    const allMenus = this.getAllMenusFlat(topLevelMenus);
    
    const byLevel = {
      level1: topLevelMenus.length,
      level2: allMenus.filter(m => m.level === 2).length,
      level3: allMenus.filter(m => m.level === 3).length
    };
    
    const byResult = {
      successful: allMenus.filter(m => m.success === true).length,
      failed: allMenus.filter(m => m.success === false).length,
      crossDomain: allMenus.filter(m => m.details && m.details.isCrossDomain).length
    };
    
    return {
      totalMenus: allMenus.length,
      ...byLevel,
      ...byResult,
      successRate: allMenus.length > 0 ? (byResult.successful / allMenus.length * 100).toFixed(1) + '%' : '0%'
    };
  }

  /**
   * Get all menus flattened
   * @param {Array} menus - Menu tree
   * @returns {Array} Flattened menu array
   */
  getAllMenusFlat(menus) {
    const flattened = [];
    
    for (const menu of menus) {
      flattened.push(menu);
      if (menu.children && menu.children.length > 0) {
        flattened.push(...this.getAllMenusFlat(menu.children));
      }
    }
    
    return flattened;
  }

  /**
   * Resume an interrupted session
   * @param {string} sessionId - Session ID to resume
   */
  async resumeSession(sessionId) {
    try {
      logger.info(`Resuming session: ${sessionId}`);
      
      // Initialize progress tracker and load existing progress
      this.progressTracker = new ProgressTracker(this.config);
      const loadedProgress = await this.progressTracker.loadProgress(sessionId);
      
      if (!loadedProgress) {
        throw new Error(`Cannot load session: ${sessionId}`);
      }
      
      // Resume from loaded progress
      this.progressTracker.resumeFromProgress(loadedProgress);
      
      // Initialize browser and modules
      await this.initializeBrowser();
      this.tokenInjector = new TokenInjector(this.config);
      this.menuDiscovery = new MenuDiscovery(this.agent, this.page, this.config);
      this.pageValidator = new PageValidator(this.agent, this.page, this.config);
      this.exceptionHandler = new ExceptionHandler(this.agent, this.page, this.config);
      this.menuNavigator = new MenuNavigator(this.agent, this.page, this.config);
      
      // Setup page
      await this.setupPage();
      
      // Get resumable menus and continue testing
      const resumableMenus = this.progressTracker.getResumableMenus(loadedProgress);
      
      if (resumableMenus.length === 0) {
        logger.success('All menus have been tested. Session already completed.');
        return;
      }
      
      logger.info(`Resuming ${resumableMenus.length} remaining menu tests...`);
      
      // Continue with smart testing for remaining menus
      await this.executeLayeredTesting(resumableMenus);
      
      const summary = this.generateLayeredSummary(resumableMenus);
      await this.progressTracker.complete(summary);
      
    } catch (error) {
      logger.error(`Failed to resume session: ${error.message}`);
      
      if (this.progressTracker) {
        await this.progressTracker.fail(error);
      }
      
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Cleanup resources
   */
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
   * Get current status
   * @returns {object} Current status
   */
  getStatus() {
    if (this.progressTracker) {
      return this.progressTracker.getStatus();
    }
    
    return {
      status: 'not_started',
      progress: { percentage: 0 }
    };
  }

  /**
   * List available sessions for resuming
   * @returns {Array} Available sessions
   */
  async listSessions() {
    const tracker = new ProgressTracker(this.config);
    return await tracker.listAvailableSessions();
  }
}

module.exports = MenuTester; 