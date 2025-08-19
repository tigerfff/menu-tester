const { logger } = require('../utils/logger');

class ExceptionHandler {
  constructor(agent, config) {
    this.agent = agent;
    this.config = config;
    this.maxRetries = config.retry || 2;
    this.retryDelay = 1000; // 1 second delay between retries
  }

  /**
   * Execute a function with retry mechanism and exception handling
   * @param {Function} fn - Function to execute
   * @param {object} context - Context for the operation
   * @param {string} operation - Description of the operation
   * @returns {Promise<object>} Result with success status and data
   */
  async executeWithRetry(fn, context = {}, operation = 'operation') {
    let lastError = null;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        logger.debug(`${operation} - Attempt ${attempt + 1}/${this.maxRetries + 1}`);
        
        // Handle page exceptions before executing
        await this.handlePageExceptions();
        
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
   * Handle general page exceptions
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
   * Handle popup windows and modals
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
   * Handle page errors and loading issues
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
   * Handle network-related issues
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
   * Handle specific exceptions based on error type
   * @param {Error} error - The caught error
   * @param {object} context - Operation context
   * @returns {object} Handling result
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
   * Handle timeout errors
   * @param {Error} error - Timeout error
   * @param {object} context - Operation context
   * @returns {object} Handling result
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
   * Handle element not found errors
   * @param {Error} error - Element error
   * @param {object} context - Operation context
   * @returns {object} Handling result
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
   * Handle navigation errors
   * @param {Error} error - Navigation error
   * @param {object} context - Operation context
   * @returns {object} Handling result
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
   * Handle authentication errors
   * @param {Error} error - Auth error
   * @param {object} context - Operation context
   * @returns {object} Handling result
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
   * Handle generic errors
   * @param {Error} error - Generic error
   * @param {object} context - Operation context
   * @returns {object} Handling result
   */
  async handleGenericError(error, context) {
    logger.debug('Handling generic error...');
    
    // Basic recovery: wait and check page state
    await this.delay(1000);
    
    const pageOk = await this.checkPageResponsiveness();
    
    return { recovered: pageOk, action: 'basic_recovery' };
  }

  /**
   * Check if page is responsive
   * @returns {boolean} Whether page is responsive
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
   * Wait for page to stabilize
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
   * Try to scroll to find an element
   * @param {object} menu - Menu item to find
   * @returns {boolean} Whether element was found after scrolling
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
   * Refresh the current page
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
   * Navigate to a specific URL
   * @param {string} url - URL to navigate to
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
   * Retry network action
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
   * Create a delay
   * @param {number} ms - Milliseconds to delay
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get error statistics for a session
   * @param {Array} errors - Array of error objects
   * @returns {object} Error statistics
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
   * Check if an error is recoverable
   * @param {Error} error - Error to check
   * @returns {boolean} Whether error is potentially recoverable
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