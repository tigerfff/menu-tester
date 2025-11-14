const { logger } = require('../utils/logger');
const EnhancedPageValidator = require('./EnhancedPageValidator');
const LayeredPageValidator = require('./LayeredPageValidator');
const { ScreenshotComparator } = require('./ScreenshotComparator');

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
    
    // 初始化增强的页面验证器
    this.enhancedValidator = new EnhancedPageValidator(agent, page, config);
    // 初始化分层验证器
    this.layeredValidator = new LayeredPageValidator(agent, page, config);
    // 初始化截图对比器
    if (config.screenshotComparison?.enabled) {
      this.screenshotComparator = new ScreenshotComparator(config);
      logger.debug('截图对比功能已启用');
    }
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
    // 首先快速检查导航结果（最重要的）
    const navigationCheck = await this.checkNavigation(initialUrl);
    
    // 如果已经检测到导航或内容变化，继续进行页面内容验证
    if (navigationCheck.navigated || navigationCheck.contentChanged) {
      logger.debug(`菜单 "${menu.text}" 导航成功 - URL变化: ${navigationCheck.navigated}, 内容变化: ${navigationCheck.contentChanged}`);
      
      // 如果启用了分层验证，执行完整的页面内容验证
      if (this.config.pageAssertions?.enabled) {
        logger.info('performQuickValidation - 执行分层验证...');
        const layeredResult = await this.layeredValidator.validatePageWithLayers();
        
        if (!layeredResult.success) {
          return {
            success: false,
            error: layeredResult.failureReason,
            errorType: 'content_validation_failed',
            pageUrl: navigationCheck.currentUrl,
            urlChanged: navigationCheck.navigated,
            contentChanged: navigationCheck.contentChanged,
            hasErrors: true,
            isCrossDomain: false,
            details: layeredResult.layers,
            warnings: layeredResult.summary.warnings
          };
        }
        
        // 分层验证通过
        return {
          success: true,
          error: null,
          errorType: null,
          pageUrl: navigationCheck.currentUrl,
          urlChanged: navigationCheck.navigated,
          contentChanged: navigationCheck.contentChanged,
          hasErrors: false,
          isCrossDomain: false,
          details: layeredResult.layers,
          insights: layeredResult.summary.insights
        };
      }
      
      // 没有启用分层验证，返回原有的成功结果
      return {
        success: true,
        error: null,
        errorType: null,
        pageUrl: navigationCheck.currentUrl,
        urlChanged: navigationCheck.navigated,
        contentChanged: navigationCheck.contentChanged,
        hasErrors: false,
        isCrossDomain: false
      };
    }
    
    // 只有在没有明显变化时才进行错误检查（快速检查）
    const errorCheck = await this.checkForErrorPage();
    if (!errorCheck.success) {
      return errorCheck;
    }
    
    // 如果没有导航、内容变化，也没有错误，可能是点击无效
    return {
      success: false,
      error: 'No page change detected after menu click',
      errorType: 'no_navigation',
      pageUrl: navigationCheck.currentUrl,
      urlChanged: false,
      contentChanged: false,
      hasErrors: false,
      isCrossDomain: false
    };
  }

  /**
   * 为竞态创建超时结果
   * @returns {Promise<object>} 1秒后的超时结果
   */
  async createTimeoutResult() {
    await new Promise(resolve => setTimeout(resolve, 300000)); // 改为30秒
    
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
      // 添加调试日志
      logger.debug(`PageValidator.checkForErrorPage - pageAssertions.enabled: ${this.config.pageAssertions?.enabled}`);
      
      // 如果启用了分层验证，使用新的验证逻辑
      if (this.config.pageAssertions?.enabled) {
        logger.info('PageValidator.checkForErrorPage - 使用分层验证进行错误页面检查...');
        const layeredResult = await this.layeredValidator.validatePageWithLayers();
        
        if (!layeredResult.success) {
          return {
            success: false,
            error: layeredResult.failureReason,
            errorType: 'layered_validation_failed',
            hasErrors: true,
            details: layeredResult.layers,
            warnings: layeredResult.summary.warnings
          };
        }
        
        // 分层验证通过，页面正常
        return {
          success: true,
          details: layeredResult.layers,
          insights: layeredResult.summary.insights
        };
      }
      
      // 降级到原有的简单AI检查
      logger.debug('PageValidator.checkForErrorPage - 使用原有AI检查...');
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
   * 增强的页面验证（替换原有的checkBasicPageFunction）
   */
  async checkBasicPageFunction() {
    try {
      // 添加调试日志
      logger.debug(`PageValidator - pageAssertions.enabled: ${this.config.pageAssertions?.enabled}`);
      logger.debug(`PageValidator - config.pageAssertions:`, JSON.stringify(this.config.pageAssertions, null, 2));
      
      // 如果启用了分层验证，使用新的验证逻辑
      if (this.config.pageAssertions?.enabled) {
        logger.debug('PageValidator - 开始执行分层验证...');
        const layeredResult = await this.layeredValidator.validatePageWithLayers();
        
        if (!layeredResult.success) {
          return {
            success: false,
            error: layeredResult.failureReason,
            errorType: 'layered_validation_failed',
            hasErrors: true,
            details: layeredResult.layers,
            warnings: layeredResult.summary.warnings
          };
        }

        return {
          success: true,
          details: layeredResult.layers,
          insights: layeredResult.summary.insights
        };
      }
      
      // 降级到原有的验证逻辑
      return await this.performLegacyValidation();
      
    } catch (error) {
      logger.debug(`分层验证失败，降级处理: ${error.message}`);
      return await this.performLegacyValidation();
    }
  }

  /**
   * 原有的验证逻辑（作为降级方案）
   */
  async performLegacyValidation() {
    try {
      // 使用原有的增强验证器或AI检测
      if (this.enhancedValidator) {
        const enhancedResult = await this.enhancedValidator.performAssertions();
        
        if (!enhancedResult.success) {
          return {
            success: false,
            error: enhancedResult.errors.join('; '),
            errorType: 'enhanced_validation_failed',
            hasErrors: true,
            details: enhancedResult.details,
            warnings: enhancedResult.warnings
          };
        }

        return {
          success: true,
          details: enhancedResult.details,
          warnings: enhancedResult.warnings
        };
      }

      // 最后的降级：原有的AI检测
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
    } catch (fallbackError) {
      logger.debug(`降级检测也失败: ${fallbackError.message}`);
      return { success: true }; // 最终降级：假设成功
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
   * 检查页面内容是否发生变化（快速 DOM 检查，不用 AI）
   * @returns {boolean} 内容是否变化
   */
  async checkContentChange() {
    try {
      // 使用快速的 DOM 检查替代 AI 调用
      const contentChanged = await this.page.evaluate(() => {
        // 检查是否有主要内容区域
        const mainContent = document.querySelector('main, .main, .content, .container, .page-content');
        if (mainContent && mainContent.textContent.trim().length > 50) {
          return true;
        }
        
        // 检查是否有标题
        const title = document.querySelector('h1, h2, h3, .title, .page-title');
        if (title && title.textContent.trim().length > 0) {
          return true;
        }
        
        // 检查是否有导航菜单
        const nav = document.querySelector('nav, .nav, .menu, .sidebar');
        if (nav && nav.children.length > 0) {
          return true;
        }
        
        // 检查是否有表格或列表内容
        const table = document.querySelector('table, .table, .el-table');
        if (table && table.rows && table.rows.length > 1) {
          return true;
        }
        
        // 检查是否有按钮或交互元素
        const buttons = document.querySelectorAll('button, .btn, .el-button, input[type="submit"]');
        if (buttons.length > 0) {
          return true;
        }
        
        return false;
      });
      
      if (contentChanged) {
        logger.debug('检测到页面内容变化（DOM检查）');
      }
      
      return contentChanged;
    } catch (error) {
      logger.debug(`内容变化检查失败: ${error.message}`);
      // 如果检查失败，假设有变化（避免误判）
      return true;
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
   * Take screenshot for evidence (with optional comparison)
   * @param {object} menu - Menu item
   * @param {boolean} success - Whether validation was successful
   * @param {string} description - Optional scenario description for filename
   * @returns {string|object} Screenshot path or comparison result
   */
  async takeScreenshot(menu, success, description = null) {
    if (!this.config.screenshots) {
      return null;
    }

    try {
      // 确保菜单对象包含URL信息
      const menuWithUrl = {
        ...menu,
        url: menu.url || this.page.url()
      };

      // 生成场景标识（用于文件名）
      const scenarioSuffix = description 
        ? `-${description.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().substring(0, 30)}`
        : '';

      // 如果启用了截图对比功能
      if (this.screenshotComparator) {
        // 获取截图 buffer
        const screenshot = await this.page.screenshot({ fullPage: false });
        
        // 创建带场景信息的菜单对象用于对比
        const menuForComparison = {
          ...menuWithUrl,
          scenario: description || 'default'
        };
        
        // 执行对比或保存基线
        const comparisonResult = await this.screenshotComparator.compareOrSaveBaseline(
          menuForComparison, 
          screenshot
        );
        
        // 记录到 Midscene 日志
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const status = success ? 'success' : 'failed';
        const filename = `menu-${comparisonResult.key}${scenarioSuffix}-${status}-${timestamp}`;
        
        await this.agent.logScreenshot(filename, {
          content: `Menu: ${menuWithUrl.text}${description ? ` - ${description}` : ''}, Status: ${status}, Comparison: ${comparisonResult.type}`
        });
        
        // 如果是对比模式且发现差异
        if (comparisonResult.type === 'comparison') {
          if (comparisonResult.match) {
            logger.info(`✅ 截图对比通过: ${comparisonResult.key}${description ? ` (${description})` : ''} (差异 ${comparisonResult.diffPercentage}%)`);
          } else {
            logger.warn(`⚠️  截图差异检测: ${comparisonResult.key}${description ? ` (${description})` : ''} (差异 ${comparisonResult.diffPercentage}%)`);
            if (comparisonResult.diffPath) {
              logger.warn(`   差异图: ${comparisonResult.diffPath}`);
            }
            
            // 如果配置了差异即失败
            if (this.screenshotComparator.failOnDiff) {
              throw new Error(`截图对比失败: 差异 ${comparisonResult.diffPercentage}%`);
            }
          }
        } else if (comparisonResult.type === 'baseline') {
          logger.info(`📸 ${comparisonResult.message}: ${comparisonResult.key}${description ? ` (${description})` : ''}`);
        }
        
        return {
          filename,
          comparison: comparisonResult
        };
      }
      
      // 原有的简单截图逻辑
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const status = success ? 'success' : 'failed';
      const filename = `menu-${menuWithUrl.id || 'unknown'}${scenarioSuffix}-${status}-${timestamp}`;
      
      await this.agent.logScreenshot(filename, {
        content: `Menu: ${menuWithUrl.text}${description ? ` - ${description}` : ''}, Status: ${status}`
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