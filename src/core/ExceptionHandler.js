const { logger } = require('../utils/logger');

class ExceptionHandler {
  constructor(agent, config) {
    this.agent = agent;
    this.config = config;
    this.maxRetries = config.retry || 2;
    this.retryDelay = 1000; // 1 second delay between retries
  }

  /**
   * 使用重试机制和异常处理执行函数
   * @param {Function} fn - 要执行的函数
   * @param {object} context - 操作上下文
   * @param {string} operation - 操作描述
   * @returns {Promise<object>} 包含成功状态和数据的结果
   */
  async executeWithRetry(fn, context = {}, operation = 'operation') {
    let lastError = null;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        logger.debug(`${operation} - Attempt ${attempt + 1}/${this.maxRetries + 1}`);
        
        // Handle page exceptions only when necessary (first attempt or forced)
        if (attempt === 0 || context.forcePageExceptionCheck) {
          await this.handlePageExceptions();
        }
        
        // Execute the function
        const result = await fn();
        
        // If successful, return result
        return {
          success: true,
          data: result,
          attempt: attempt + 1,
          error: null
        };

      } catch (error) {
        lastError = error;
        attempt++;
        
        logger.warning(`${operation} failed on attempt ${attempt}: ${error.message}`);
        
        // Handle specific exceptions
        const handled = await this.handleSpecificException(error, context);
        
        if (handled.recovered && attempt <= this.maxRetries) {
          logger.info(`Exception handled, retrying ${operation}...`);
          await this.delay(this.retryDelay);  
          continue;
        }
        
        if (attempt <= this.maxRetries) {
          logger.info(`Retrying ${operation} in ${this.retryDelay}ms...`);
          await this.delay(this.retryDelay);
        }
      }
    }

    // All retries exhausted
    return {
      success: false,
      data: null,
      attempt: attempt,
      error: lastError?.message || 'Unknown error'
    };
  }

  /**
   * 处理一般页面异常
   */
  async handlePageExceptions() {
    try {
      // Check for and handle common page issues
      await this.handlePopups();
      await this.handlePageErrors();
      await this.handleNetworkIssues();
    } catch (error) {
      logger.debug(`Page exception handling failed: ${error.message}`);
    }
  }

  /**
   * 处理弹窗和模态框
   */
  async handlePopups() {
    try {
      const hasPopup = await this.agent.aiBoolean(`
        页面是否有弹窗或模态框需要关闭，包括：
        - 确认对话框
        - 警告弹窗
        - 广告弹窗
        - 操作确认框
        - 遮罩层
      `);

      if (hasPopup) {
        logger.debug('Detected popup, attempting to close...');
        
        // Try to close popup
        await this.agent.aiTap('关闭弹窗或点击确定按钮');
        
        // Wait for popup to close
        await new Promise(resolve => setTimeout(resolve, 500));
        
        logger.debug('Popup handled successfully');
      }
    } catch (error) {
      logger.debug(`Popup handling failed: ${error.message}`);
    }
  }

  /**
   * 处理页面错误和加载问题
   */
  async handlePageErrors() {
    try {
      const hasPageError = await this.agent.aiBoolean(`
        页面是否显示加载错误或异常状态，需要刷新或重试：
        - 页面加载失败
        - 网络连接错误
        - 页面崩溃提示
        - 脚本错误提示
      `);

      if (hasPageError) {
        logger.debug('Page error detected, attempting recovery...');
        
        // Try to refresh the page or retry
        await this.refreshPage();
        
        logger.debug('Page error recovery attempted');
      }
    } catch (error) {
      logger.debug(`Page error handling failed: ${error.message}`);
    }
  }

  /**
   * 处理网络相关问题
   */
  async handleNetworkIssues() {
    try {
      const hasNetworkIssue = await this.agent.aiBoolean(`
        页面是否显示网络相关问题：
        - 网络连接超时
        - 请求失败提示
        - 无法连接服务器
        - 数据加载失败
      `);

      if (hasNetworkIssue) {
        logger.debug('Network issue detected, waiting for recovery...');
        
        // Wait a bit longer for network to recover
        await this.delay(2000);
        
        // Try to reload content
        await this.retryNetworkAction();
        
        logger.debug('Network issue recovery attempted');
      }
    } catch (error) {
      logger.debug(`Network issue handling failed: ${error.message}`);
    }
  }

  /**
   * 根据错误类型处理特定异常
   * @param {Error} error - 捕获的错误
   * @param {object} context - 操作上下文
   * @returns {object} 处理结果
   */
  async handleSpecificException(error, context) {
    const errorMessage = error.message.toLowerCase();
    
    try {
      // Handle timeout errors
      if (errorMessage.includes('timeout')) {
        return await this.handleTimeoutError(error, context);
      }
      
      // Handle element not found errors
      if (errorMessage.includes('element') || errorMessage.includes('selector')) {
        return await this.handleElementError(error, context);
      }
      
      // Handle navigation errors
      if (errorMessage.includes('navigation') || errorMessage.includes('page')) {
        return await this.handleNavigationError(error, context);
      }
      
      // Handle authentication errors
      if (errorMessage.includes('auth') || errorMessage.includes('login')) {
        return await this.handleAuthError(error, context);
      }
      
      // Generic error handling
      return await this.handleGenericError(error, context);
      
    } catch (handlingError) {
      logger.debug(`Exception handling failed: ${handlingError.message}`);
      return { recovered: false, action: 'none' };
    }
  }

  /**
   * 处理超时错误
   * @param {Error} error - 超时错误
   * @param {object} context - 操作上下文
   * @returns {object} 处理结果
   */
  async handleTimeoutError(error, context) {
    logger.debug('Handling timeout error...');
    
    // Check if page is still responsive
    const pageResponsive = await this.checkPageResponsiveness();
    
    if (!pageResponsive) {
      // Try to refresh the page
      await this.refreshPage();
      return { recovered: true, action: 'page_refresh' };
    }
    
    // Just wait a bit longer
    await this.delay(2000);
    return { recovered: true, action: 'extended_wait' };
  }

  /**
   * 处理元素未找到错误
   * @param {Error} error - 元素错误
   * @param {object} context - 操作上下文
   * @returns {object} 处理结果
   */
  async handleElementError(error, context) {
    logger.debug('Handling element error...');
    
    // Wait for page to stabilize
    await this.waitForPageStability();
    
    // Check if we need to scroll to find the element
    if (context.menu) {
      const scrolled = await this.scrollToFindElement(context.menu);
      if (scrolled) {
        return { recovered: true, action: 'scroll_to_element' };
      }
    }
    
    return { recovered: false, action: 'element_not_found' };
  }

  /**
   * 处理导航错误
   * @param {Error} error - 导航错误
   * @param {object} context - 操作上下文
   * @returns {object} 处理结果
   */
  async handleNavigationError(error, context) {
    logger.debug('Handling navigation error...');
    
    // Try to navigate back to a stable state
    if (context.initialUrl) {
      await this.navigateToUrl(context.initialUrl);
      return { recovered: true, action: 'navigate_back' };
    }
    
    // Refresh current page
    await this.refreshPage();
    return { recovered: true, action: 'page_refresh' };
  }

  /**
   * 处理认证错误
   * @param {Error} error - 认证错误
   * @param {object} context - 操作上下文
   * @returns {object} 处理结果
   */
  async handleAuthError(error, context) {
    logger.debug('Handling authentication error...');
    
    // Check if token needs to be re-injected
    if (context.tokenInjector) {
      await context.tokenInjector.inject(context.page, context.context);
      return { recovered: true, action: 'token_reinjected' };
    }
    
    return { recovered: false, action: 'auth_failed' };
  }

  /**
   * 处理通用错误
   * @param {Error} error - 通用错误
   * @param {object} context - 操作上下文
   * @returns {object} 处理结果
   */
  async handleGenericError(error, context) {
    logger.debug('Handling generic error...');
    
    // Basic recovery: wait and check page state
    await this.delay(1000);
    
    const pageOk = await this.checkPageResponsiveness();
    
    return { recovered: pageOk, action: 'basic_recovery' };
  }

  /**
   * 检查页面是否响应
   * @returns {boolean} 页面是否响应
   */
  async checkPageResponsiveness() {
    try {
      // Quick check if page can respond to basic queries
      await this.agent.aiBoolean('页面是否正常显示内容', { timeout: 2000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 等待页面稳定
   */
  async waitForPageStability() {
    try {
      await this.agent.aiWaitFor(
        '页面加载完成且内容稳定显示',
        { timeout: 3000 }
      );
    } catch (error) {
      logger.debug('Page stability wait failed, continuing...');
    }
  }

  /**
   * 尝试滚动查找元素
   * @param {object} menu - 要查找的菜单项
   * @returns {boolean} 滚动后是否找到元素
   */
  async scrollToFindElement(menu) {
    try {
      // Try scrolling down first
      await this.agent.aiScroll({
        direction: 'down',
        scrollType: 'once',
        distance: 300
      });
      
      await this.delay(500);
      
      // Check if element is now visible
      const found = await this.agent.aiBoolean(`是否能看到 "${menu.text}" 菜单项`);
      
      return found;
    } catch (error) {
      logger.debug(`Scroll to find element failed: ${error.message}`);
      return false;
    }
  }

  /**
   * 刷新当前页面
   */
  async refreshPage() {
    try {
      // Get page object from agent and refresh
      await this.agent.page.reload({ waitUntil: 'networkidle' });
      
      // Wait for page to load after refresh
      await this.delay(3000);
      
      logger.debug('Page refreshed successfully');
      
    } catch (error) {
      logger.debug(`Page refresh failed: ${error.message}`);
    }
  }

  /**
   * 导航到特定URL
   * @param {string} url - 要导航到的URL
   */
  async navigateToUrl(url) {
    try {
      // Get page object from agent and navigate
      await this.agent.page.goto(url, { waitUntil: 'networkidle' });
      
      // Wait for navigation to complete
      await this.delay(2000);
      
      logger.debug(`Navigated to ${url} successfully`);
      
    } catch (error) {
      logger.debug(`Navigation failed: ${error.message}`);
    }
  }

  /**
   * 重试网络操作
   */
  async retryNetworkAction() {
    try {
      // Try to trigger a page refresh or retry button
      const hasRetryButton = await this.agent.aiBoolean('页面是否有重试或刷新按钮');
      
      if (hasRetryButton) {
        await this.agent.aiTap('点击重试或刷新按钮');
      } else {
        // Just wait for network to recover
        await this.delay(2000);
      }
    } catch (error) {
      logger.debug(`Network retry failed: ${error.message}`);
    }
  }

  /**
   * 创建延迟
   * @param {number} ms - 延迟的毫秒数
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取会话的错误统计
   * @param {Array} errors - 错误对象数组
   * @returns {object} 错误统计
   */
  getErrorStats(errors) {
    const total = errors.length;
    
    if (total === 0) {
      return {
        total: 0,
        byType: {},
        byAction: {},
        recoveryRate: '100%'
      };
    }
    
    const byType = {};
    const byAction = {};
    let recovered = 0;
    
    errors.forEach(error => {
      // Count by error type
      const type = error.type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
      
      // Count by recovery action
      const action = error.action || 'none';
      byAction[action] = (byAction[action] || 0) + 1;
      
      // Count recoveries
      if (error.recovered) {
        recovered++;
      }
    });
    
    return {
      total,
      byType,
      byAction,
      recovered,
      recoveryRate: ((recovered / total) * 100).toFixed(1) + '%'
    };
  }

  /**
   * 检查错误是否可恢复
   * @param {Error} error - 要检查的错误
   * @returns {boolean} 错误是否可能恢复
   */
  isRecoverableError(error) {
    const errorMessage = error.message.toLowerCase();
    
    // Non-recoverable errors
    const nonRecoverablePatterns = [
      'permission denied',
      'access forbidden',
      'authentication failed',
      'network error',
      'connection refused'
    ];
    
    return !nonRecoverablePatterns.some(pattern => 
      errorMessage.includes(pattern)
    );
  }
}

module.exports = ExceptionHandler; 