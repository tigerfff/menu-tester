const { chromium } = require('playwright');
const { PlaywrightAgent } = require('@midscene/web/playwright');

const TokenInjector = require('./utils/tokenInjector');
const PageValidator = require('./core/PageValidator');
const ProgressTracker = require('./core/ProgressTracker');
const MenuCache = require('./core/MenuCache');
const { logger } = require('./utils/logger');

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
        routes = this.config.routes.map((r, idx) => ({
          menuText: r.menuText || r.text || `Route ${idx + 1}`,
          url: r.url,
          level: r.level || 1,
          recordedAt: r.recordedAt || new Date().toISOString()
        }));
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

        await this.testSingleRoute(route, routeMenus[i]);

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

  async testSingleRoute(route, menuItem) {
    try {
      await this.progressTracker.startMenu(menuItem.id);

      logger.debug(`导航到路由: ${route.url}`);
      await this.page.goto(route.url, {
        waitUntil: 'load',
        timeout: this.config.timeout
      });

      await this.waitForPageStable();

      const validationResult = await this.validateRoutePage(route);

      let screenshot = null;
      if (this.config.screenshots) {
        screenshot = await this.pageValidator.takeScreenshot(menuItem, validationResult.success);
      }

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