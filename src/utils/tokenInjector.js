const { logger } = require('./logger');

class TokenInjector {
  constructor(config) {
    this.token = config.token || process.env.ACCESS_TOKEN;
    this.method = config.tokenMethod || 'cookie';
    this.tokenName = 'accessToken';
    this.url = config.url;
  }

  /**
   * Inject token into page/browser context
   * @param {object} page - Playwright page object
   * @param {object} context - Playwright browser context
   */
  async inject(page, context) {
    if (!this.token) {
      throw new Error('No access token provided');
    }

    logger.debug(`Injecting token using method: ${this.method}`);

    try {
      // 在导航前就设置 Cookie 和 localStorage
    //   await this.injectCookie(context);
      
      // 设置 localStorage 的 initScript（会在每次导航时自动执行）
      await page.addInitScript(() => {
        if (window.location.hostname.includes('hik-cloud.com')) {
          localStorage.setItem('Chain_FullScreenGuide', '1');
          localStorage.setItem('Chain_IntelliInspect_addMode', '1');
          localStorage.setItem('Chain_MenuConfigEnter', '1');
          localStorage.setItem('Chain_SceneVideoMenuGuideShown', '1');
          localStorage.setItem('Chain_SceneVideoRightMenuGuideShown', '1');
          localStorage.setItem('Chain_StoreActionMoreBtn', '1');
          localStorage.setItem('Chain_SubmenuFAQGuide', '1');
          localStorage.setItem('Chain_TopMenuGuide', '1');
          localStorage.setItem('Chain_VideoSceneLeftResizeGuide', '1');
        }
      });

      switch (this.method) {
        case 'cookie':
          await this.injectCookie(context);
          break;
        case 'localStorage':
          await this.injectLocalStorage(page);
          break;
        case 'header':
          await this.injectHeader(page);
          break;
        default:
          throw new Error(`Unknown token injection method: ${this.method}`);
      }

      logger.success(`Token injected successfully via ${this.method}`);
    } catch (error) {
      logger.error(`Failed to inject token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Inject token as cookie
   * @param {object} context - Playwright browser context
   */
  async injectCookie(context) {
    const url = new URL(this.url);
    
    // 确定要使用的域名
    let domain = url.hostname;
    
    // 特殊处理：如果是 hik-cloud.com 的子域名，使用父域名
    if (url.hostname.includes('hik-cloud.com')) {
      domain = '.hik-cloud.com';
    }
    
    await context.addCookies([{
      name: this.tokenName,
      value: this.token,
      domain: domain,
      path: '/',
      httpOnly: false,
      secure: url.protocol === 'https:',
      sameSite: 'Lax'
    }]);

    logger.debug(`Cookie set: ${this.tokenName} on domain ${domain}`);
  }

  /**
   * Inject token into localStorage
   * @param {object} page - Playwright page object
   */
  async injectLocalStorage(page) {
    await page.addInitScript((tokenData) => {
      localStorage.setItem(tokenData.name, tokenData.value);
    }, { name: this.tokenName, value: this.token });

    // Also set after navigation for existing pages
    await page.evaluate((tokenData) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(tokenData.name, tokenData.value);
      }
    }, { name: this.tokenName, value: this.token });

    logger.debug(`LocalStorage set: ${this.tokenName}`);
  }

  /**
   * Inject token as HTTP header
   * @param {object} page - Playwright page object
   */
  async injectHeader(page) {
    await page.setExtraHTTPHeaders({
      'Authorization': `Bearer ${this.token}`
    });

    logger.debug('Authorization header set');
  }

  /**
   * Verify token is properly injected and working
   * @param {object} page - Playwright page object
   */
  async verify(page) {
    try {
      logger.debug('Verifying token injection...');

      switch (this.method) {
        case 'cookie':
          return await this.verifyCookie(page);
        case 'localStorage':
          return await this.verifyLocalStorage(page);
        case 'header':
          return await this.verifyHeader(page);
        default:
          return false;
      }
    } catch (error) {
      logger.debug(`Token verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Verify cookie token
   * @param {object} page - Playwright page object
   */
  async verifyCookie(page) {
    const cookies = await page.context().cookies(this.url);
    const tokenCookie = cookies.find(cookie => cookie.name === this.tokenName);
    
    if (tokenCookie && tokenCookie.value === this.token) {
      logger.debug('Cookie token verified successfully');
      return true;
    }
    
    return false;
  }

  /**
   * Verify localStorage token
   * @param {object} page - Playwright page object
   */
  async verifyLocalStorage(page) {
    const storedToken = await page.evaluate((tokenName) => {
      return localStorage.getItem(tokenName);
    }, this.tokenName);

    if (storedToken === this.token) {
      logger.debug('LocalStorage token verified successfully');
      return true;
    }

    return false;
  }

  /**
   * Verify header token
   * @param {object} page - Playwright page object
   */
  async verifyHeader(page) {
    // For headers, we can't directly verify, so we assume success
    // The actual verification will happen when making requests
    logger.debug('Header token assumed to be set correctly');
    return true;
  }

  /**
   * Clean up injected token (for security)
   * @param {object} page - Playwright page object
   * @param {object} context - Playwright browser context
   */
  async cleanup(page, context) {
    try {
      switch (this.method) {
        case 'cookie':
          await this.cleanupCookie(context);
          break;
        case 'localStorage':
          await this.cleanupLocalStorage(page);
          break;
        case 'header':
          // Headers are automatically cleared when page is closed
          break;
      }
      
      logger.debug('Token cleanup completed');
    } catch (error) {
      logger.debug(`Token cleanup failed: ${error.message}`);
    }
  }

  /**
   * Remove token cookie
   * @param {object} context - Playwright browser context
   */
  async cleanupCookie(context) {
    const url = new URL(this.url);
    
    await context.addCookies([{
      name: this.tokenName,
      value: '',
      domain: url.hostname,
      path: '/',
      expires: 0 // Expire immediately
    }]);
  }

  /**
   * Remove token from localStorage
   * @param {object} page - Playwright page object
   */
  async cleanupLocalStorage(page) {
    await page.evaluate((tokenName) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(tokenName);
      }
    }, this.tokenName);
  }
}

module.exports = TokenInjector; 