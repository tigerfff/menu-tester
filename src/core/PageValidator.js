const { logger } = require('../utils/logger');

class PageValidator {
  constructor(agent, page, config) {
    this.agent = agent;
    this.page = page;
    this.config = config;
    this.timeout = config.timeout || 6000;
    // 定义主域名模式
    this.mainDomainPatterns = config.domainPatterns || ['/chain/'];
    this.crossDomainTimeout = config.crossDomainTimeout || 8000;
    this.maxReturnAttempts = config.maxReturnAttempts || 2;
  }

  /**
   * Validate if a page loaded successfully after menu click
   * @param {object} menu - Menu item that was clicked
   * @param {string} initialUrl - URL before menu click
   * @returns {object} Validation result with success, error, and details
   */
  async validatePageLoad(menu, initialUrl) {
    const startTime = Date.now();
    
    try {
      logger.debug(`校验页面加载: ${menu.text}`);

      // Wait for potential navigation
      await this.waitForNavigation();

      // Get current URL for cross-domain detection
      const currentUrl = await this.getCurrentUrl();
      
      // Check for cross-domain navigation
      const crossDomainResult = await this.detectCrossDomain(initialUrl, currentUrl);
      if (crossDomainResult.isCrossDomain) {
        return await this.handleCrossDomainNavigation(menu, initialUrl, currentUrl, startTime);
      }

      // Quick validation within 1 second for same-domain navigation
      const validationResult = await Promise.race([
        this.performQuickValidation(menu, initialUrl),
        this.createTimeoutResult()
      ]);

      const duration = Date.now() - startTime;
        
      return {
        ...validationResult,
        duration,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      return {
        success: false,
        error: error.message,
        errorType: 'validation_error',
        duration, 
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 检测是否发生跨域导航
   * @param {string} initialUrl - 初始URL
   * @param {string} currentUrl - 当前URL
   * @returns {object} 跨域检测结果
   */
  async detectCrossDomain(initialUrl, currentUrl) {
    try {
      // 检查URL是否在主域名模式内
      const isInitialInMainDomain = this.isWithinMainDomain(initialUrl);
      const isCurrentInMainDomain = this.isWithinMainDomain(currentUrl);
      
      const isCrossDomain = isInitialInMainDomain && !isCurrentInMainDomain;
      
      if (isCrossDomain) {
        logger.debug(`检测到跨域导航: ${initialUrl} → ${currentUrl}`);
      }
      
      return {
        isCrossDomain,
        initialUrl,
        currentUrl,
        targetSystem: this.extractSystemName(currentUrl)
      };
    } catch (error) {
      logger.debug(`跨域检测失败: ${error.message}`);
      return { isCrossDomain: false, initialUrl, currentUrl };
    }
  }

  /**
   * 检查URL是否在主域名范围内
   * @param {string} url - 要检查的URL
   * @returns {boolean} 是否在主域名内
   */
  isWithinMainDomain(url) {
    return this.mainDomainPatterns.some(pattern => url.includes(pattern));
  }

  /**
   * 提取系统名称
   * @param {string} url - URL
   * @returns {string} 系统名称
   */
  extractSystemName(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(part => part);
      return pathParts.length > 0 ? pathParts[0] : 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * 处理跨域导航
   * @param {object} menu - 菜单项
   * @param {string} initialUrl - 初始URL
   * @param {string} currentUrl - 当前URL
   * @param {number} startTime - 开始时间
   * @returns {object} 处理结果
   */
  async handleCrossDomainNavigation(menu, initialUrl, currentUrl, startTime) {
    try {
      logger.info(`菜单 "${menu.text}" 跳转到外部系统: ${this.extractSystemName(currentUrl)}`);
      
      // 尝试返回主系统
      const returnResult = await this.handleCrossDomainReturn(initialUrl);
      
      const duration = Date.now() - startTime;
      
      return {
        success: true, // 跨域导航被认为是成功的
        error: null,
        errorType: null,
        pageUrl: currentUrl,
        urlChanged: true,
        contentChanged: true,
        hasErrors: false,
        isCrossDomain: true,
        targetSystem: this.extractSystemName(currentUrl),
        returnSuccess: returnResult.success,
        duration, 
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      return {
        success: false,
        error: `跨域导航处理失败: ${error.message}`,
        errorType: 'cross_domain_error',
        isCrossDomain: true,
        targetSystem: this.extractSystemName(currentUrl),
        duration,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 处理跨域返回
   * @param {string} targetUrl - 目标返回URL
   * @returns {object} 返回结果
   */
  async handleCrossDomainReturn(targetUrl) {
    let attempt = 0;
    
    while (attempt < this.maxReturnAttempts) {
      attempt++;
      
      try {
        logger.debug(`尝试返回主系统（第 ${attempt}/${this.maxReturnAttempts} 次）`);
        
        // 策略1: 尝试浏览器后退
        if (attempt === 1) {
          await this.page.goBack({ 
            waitUntil: 'networkidle',
            timeout: this.crossDomainTimeout    
          });
        }
        // 策略2: 直接导航到目标URL
        else {
          await this.page.goto(targetUrl, {
            waitUntil: 'networkidle',
            timeout: this.crossDomainTimeout
          });
        }
        
        // 等待页面稳定
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 验证是否成功返回主系统
        const currentUrl = await this.getCurrentUrl();
        if (this.isWithinMainDomain(currentUrl)) {
          logger.success(`已返回主系统（方式：${attempt === 1 ? '后退' : '直接导航'}）`);
          return { success: true, method: attempt === 1 ? 'goBack' : 'directNavigation' };
        }
        
      } catch (error) {
        logger.debug(`Return attempt ${attempt} failed: ${error.message}`);
      }
    }
    
    logger.warning('多次尝试仍未返回主系统');
    return { success: false, attempts: this.maxReturnAttempts };
  }

  /**
   * Wait for potential page navigation
   */
  async waitForNavigation() {
    try {
      // 等待网络活动稳定
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 检查是否仍在加载
      const isLoading = await this.agent.aiBoolean(
        '页面是否还在加载中（显示加载动画或加载指示器）'
      );

      if (isLoading) {
        // 最多再等 3 秒以完成加载
        await this.agent.aiWaitFor(
          '页面加载完成（没有加载动画）',
          { timeout: 3000 }
        );
      }
    } catch (error) {
      logger.debug(`导航等待失败: ${error.message}`);
    }
  }

  /**
   * 快速校验页面状态
   * @param {object} menu - 点击的菜单项
   * @param {string} initialUrl - 点击前的URL
   * @returns {object} 校验结果
   */
  async performQuickValidation(menu, initialUrl) {
          // 优先检查常见错误页（最快）
    const errorCheck = await this.checkForErrorPage();
    if (!errorCheck.success) {
      return errorCheck;
    }

    // 检查页面基础可用性
    const basicCheck = await this.checkBasicPageFunction();
    if (!basicCheck.success) {
      return basicCheck;
    }

    // 检查是否发生了跳转或内容变化
    const navigationCheck = await this.checkNavigation(initialUrl);
    
    // 根据跳转或内容变化判定成功
    const success = navigationCheck.navigated || navigationCheck.contentChanged;
    
    return {
      success,
      error: success ? null : 'No page change detected after menu click',
      errorType: success ? null : 'no_navigation',
      pageUrl: navigationCheck.currentUrl,
      urlChanged: navigationCheck.navigated,
      contentChanged: navigationCheck.contentChanged,
      hasErrors: false,
      isCrossDomain: false
    };
  }

  /**
   * 为竞态创建超时结果
   * @returns {Promise<object>} 1秒后的超时结果
   */
  async createTimeoutResult() {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      success: false,
      error: 'Page validation timeout',
      errorType: 'timeout',
      hasErrors: false,
      isCrossDomain: false
    };
  }

  /**
   * 检查常见错误页面
   * @returns {object} 错误检查结果
   */
  async checkForErrorPage() {
    try {
      // Check for common error indicators
      const hasError = await this.agent.aiBoolean(`
        页面是否显示错误信息，包括：
        - 404 页面未找到
        - 500 服务器错误  
        - 403 权限不足
        - 网络连接错误
        - 系统维护提示
        - 登录失效提示
      `);

      if (hasError) {
        // Try to get specific error message
        const errorMessage = await this.getErrorMessage();
        
        return {
          success: false,
          error: errorMessage || '检测到错误页面',
          errorType: 'error_page',
          hasErrors: true
        };
      }

      return { success: true };
    } catch (error) {
      logger.debug(`错误页面检查失败: ${error.message}`);
      return { success: true }; // Assume no error if check fails
    }
  }

  /**
   * 从错误页面提取具体错误信息
   * @returns {string} 错误信息或 null
   */
  async getErrorMessage() {
    try {
      const errorMessage = await this.agent.aiQuery(`
        string,
        提取页面中的错误信息文本，如果是错误页面请返回具体的错误消息
      `);

      return typeof errorMessage === 'string' ? errorMessage : null;
    } catch (error) {
      logger.debug(`提取错误信息失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 检查页面基础功能
   * @returns {object} 基础功能检查结果
   */
  async checkBasicPageFunction() {
    try {
      // Check if page has basic interactive elements
      const hasBasicFunction = await this.agent.aiBoolean(`
        页面是否正常显示内容，包括：
        - 页面有正常的文本内容
        - 页面布局正常显示
        - 没有显示空白页面
        - 没有显示"加载失败"等错误信息
      `);

      if (!hasBasicFunction) {
        return {
          success: false,
          error: '页面疑似空白或异常',
          errorType: 'blank_page',
          hasErrors: true
        };
      }

      return { success: true };
    } catch (error) {
      logger.debug(`基础功能检测失败: ${error.message}`);
      return { success: true }; // Assume success if check fails
    }
  }

  /**
   * 检查是否发生导航或内容变化
   * @param {string} initialUrl - 点击前的URL
   * @returns {object} 检查结果
   */
  async checkNavigation(initialUrl) {
    try {
      // 获取当前 URL
      const currentUrl = await this.getCurrentUrl();
      const navigated = currentUrl !== initialUrl;

      // 如果 URL 未变化，检查是否是 SPA 内容变化
      let contentChanged = false;
      if (!navigated) {
        contentChanged = await this.checkContentChange();
      }

      return {
        navigated,
        contentChanged,
        currentUrl,
        initialUrl
      };
    } catch (error) {
      logger.debug(`导航检查失败: ${error.message}`);
      return {
        navigated: false,
        contentChanged: false,
        currentUrl: initialUrl,
        initialUrl
      };
    }
  }

  /**
   * 获取当前页面 URL
   * @returns {string} 当前 URL
   */
  async getCurrentUrl() {
    try {
      // 通过 agent 的 page 获取 URL
      return await this.page.url();
    } catch (error) {
      logger.debug(`获取当前 URL 失败: ${error.message}`);
      return 'unknown';
    }
  }

  /**
   * Check if page content changed (for SPAs)
   * @returns {boolean} Whether content changed
   */
  async checkContentChange() {
    try {
      // Use AI to detect if main content area has changed
      const contentChanged = await this.agent.aiBoolean(`
        页面的主要内容区域是否发生了变化，比如：
        - 显示了新的页面内容
        - 主要区域内容更新了
        - 页面标题或导航状态发生变化
      `);

      return contentChanged;
    } catch (error) {
      logger.debug(`Content change check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Perform detailed page analysis (for debugging)
   * @param {object} menu - Menu item
   * @returns {object} Detailed analysis result
   */
  async performDetailedAnalysis(menu) {
    try {
      logger.debug(`Performing detailed analysis for menu: ${menu.text}`);

      const analysis = await this.agent.aiQuery(`
        {
          pageTitle: string,
          hasContent: boolean,
          hasErrors: boolean,
          errorMessage: string,
          mainContentType: string,
          interactiveElements: number,
          pageType: string
        },
        分析当前页面的详细信息，包括页面标题、是否有内容、是否有错误、主要内容类型、交互元素数量、页面类型等
      `);

      return {
        success: true,
        analysis: analysis || {},
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Take screenshot for evidence
   * @param {object} menu - Menu item
   * @param {boolean} success - Whether validation was successful
   * @returns {string} Screenshot path or null
   */
  async takeScreenshot(menu, success) {
    if (!this.config.screenshots) {
      return null;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const status = success ? 'success' : 'failed';
      const filename = `menu-${menu.id}-${status}-${timestamp}`;
      
      await this.agent.logScreenshot(filename, {
        content: `Menu: ${menu.text}, Status: ${status}`
      });

      return filename;
    } catch (error) {
      logger.debug(`Screenshot failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if current page requires authentication
   * @returns {boolean} Whether page needs authentication
   */
  async requiresAuthentication() {
    try {
      const needsAuth = await this.agent.aiBoolean(`
        页面是否显示需要登录或认证的信息，比如：
        - 登录表单
        - "请先登录" 提示
        - 认证错误信息
        - 会话过期提示
      `);

      return needsAuth;
    } catch (error) {
      logger.debug(`Authentication check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get validation summary for multiple menu tests
   * @param {Array} results - Array of validation results
   * @returns {object} Summary statistics
   */
  getValidationSummary(results) {
    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const errors = results.filter(r => r.hasErrors).length;
    const timeouts = results.filter(r => r.errorType === 'timeout').length;
    const crossDomain = results.filter(r => r.isCrossDomain).length;
    
    const avgDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0) / total;
    
    const errorTypes = {};
    results.forEach(r => {
      if (r.errorType) {
        errorTypes[r.errorType] = (errorTypes[r.errorType] || 0) + 1;
      }
    });

    return {
      total,
      successful,
      failed,
      errors,
      timeouts,
      crossDomain,
      successRate: (successful / total * 100).toFixed(1) + '%',
      avgDuration: Math.round(avgDuration),
      errorTypes
    };
  }
}

module.exports = PageValidator; 