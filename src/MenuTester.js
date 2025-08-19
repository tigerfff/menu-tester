const { chromium } = require('playwright');
const { PlaywrightAgent } = require('@midscene/web/playwright');

const TokenInjector = require('./utils/tokenInjector');
const MenuDiscovery = require('./core/MenuDiscovery');
const PageValidator = require('./core/PageValidator');
const ExceptionHandler = require('./core/ExceptionHandler');
const ProgressTracker = require('./core/ProgressTracker');
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
      
      // Clean up old sessions
      await this.progressTracker.cleanupOldSessions();
      
      // Initialize browser and page
      await this.initializeBrowser();
      
      // Initialize token injector
      this.tokenInjector = new TokenInjector(this.config);
      
      // Initialize core modules
      this.menuDiscovery = new MenuDiscovery(this.agent, this.config);
      this.pageValidator = new PageValidator(this.agent, this.config);
      this.exceptionHandler = new ExceptionHandler(this.agent, this.config);
      
      // Navigate to target URL and inject token
      await this.setupPage();
      
      // 新流程：智能菜单发现和测试
      await this.executeSmartMenuTesting();
      
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
   * 执行智能菜单测试（新的核心流程）
   */
  async executeSmartMenuTesting() {
    try {
      await this.progressTracker.updateStep('smart_menu_testing');
      
      // 1. 发现顶级菜单
      const topLevelMenus = await this.discoverTopLevelMenus();
      
      if (topLevelMenus.length === 0) {
        throw new Error('No top-level menus found on the page');
      }
      
      // 2. 初始化进度跟踪
      await this.progressTracker.initialize(topLevelMenus);
      
      // 3. 执行分层测试
      await this.executeLayeredTesting(topLevelMenus);
      
      // 4. 生成最终报告
      const summary = this.generateLayeredSummary(topLevelMenus);
      await this.progressTracker.complete(summary);
      
    } catch (error) {
      throw new Error(`Smart menu testing failed: ${error.message}`);
    }
  }

  /**
   * 发现顶级菜单
   */
  async discoverTopLevelMenus() {
    try {
      await this.progressTracker.updateStep('top_menu_discovery');
      
      logger.info('Discovering top-level menus...');
      const topMenus = await this.menuDiscovery.discoverTopLevelMenus();
      
      logger.success(`Discovered ${topMenus.length} top-level menu items`);
      return topMenus;
      
    } catch (error) {
      throw new Error(`Top-level menu discovery failed: ${error.message}`);
    }
  }

  /**
   * 执行分层测试
   */
  async executeLayeredTesting(topLevelMenus) {
    try {
      logger.info(`Starting layered testing for ${topLevelMenus.length} top-level menus...`);
      
      for (const topMenu of topLevelMenus) {
        await this.testMenuWithContext(topMenu, 1);
        
        // 短暂延迟，避免操作过快
        await new Promise(resolve => setTimeout(resolve, 500));
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
      if (level === 1 && testResult.success && !testResult.isCrossDomain) {
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
      for (const subMenu of subMenus) {
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
    
    // 点击菜单项
    await this.agent.aiTap(`点击 "${menu.text}" 菜单`);
    
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
      details: validationResult
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
        viewport: { width: 1280, height: 768 },
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
      
      // 等待页面完全稳定
      await this.page.waitForLoadState('networkidle');
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
      this.menuDiscovery = new MenuDiscovery(this.agent, this.config);
      this.pageValidator = new PageValidator(this.agent, this.config);
      this.exceptionHandler = new ExceptionHandler(this.agent, this.config);
      
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