const { logger } = require('../utils/logger');

/**
 * 智能菜单导航器 - 处理复杂的菜单路径导航
 * 解决"更多"菜单状态变化导致的导航问题
 */
class MenuNavigator {
  constructor(agent, page, config) {
    this.agent = agent;
    this.page = page; // 直接使用传入的 page 对象
    this.config = config;
    this.moreMenuState = {
      isExpanded: false,
      currentSelectedItem: null
    };
    this.navigationHistory = [];
    this.currentPage = 'home'; // 当前页面状态
  }

  /**
   * 智能导航到目标菜单
   * @param {object} targetMenu - 目标菜单（包含完整路径信息）
   */
  async navigateToMenu(targetMenu) {
    logger.debug(`导航到菜单: ${targetMenu.text} (路径: ${targetMenu.path?.join(' → ') || targetMenu.text})`);
    
    try {
      // 如果路径包含"more"，需要特殊处理
      if (targetMenu.path && targetMenu.path.includes('more')) {
        await this.navigateToMoreMenuItem(targetMenu);
      } else if (targetMenu.isDropdownItem) {
        await this.navigateToMoreMenuItem(targetMenu);
      } else {
        await this.navigateToDirectMenuItem(targetMenu);
      }
      
      // 记录导航历史
      this.navigationHistory.push({
        menu: targetMenu,
        timestamp: Date.now(),
        fromPage: this.currentPage
      });
      
      this.currentPage = targetMenu.text;
      
    } catch (error) {
      throw new Error(`导航到菜单 "${targetMenu.text}" 失败: ${error.message}`);
    }
  }

  /**
   * 导航到"更多"菜单中的项目
   * @param {object} targetMenu - 目标菜单
   */
  async navigateToMoreMenuItem(targetMenu) {
    logger.debug(`导航到"更多"菜单项: ${targetMenu.text}`);
    
    // 1. 确保"更多"菜单处于展开状态
    await this.ensureMoreMenuExpanded();
    
    // 2. 检查目标菜单是否已经被选中（导致"更多"文字变化）
    const isCurrentlySelected = await this.isMenuCurrentlySelected(targetMenu.text);
    
    if (isCurrentlySelected) {
      logger.debug(`菜单 "${targetMenu.text}" 已被选中，无需重复点击`);
      return;
    }
    
    // 3. 点击目标菜单
    await this.agent.aiTap(`点击"更多"下拉菜单中的"${targetMenu.text}"`);
    
    // 4. 更新"更多"菜单状态
    this.moreMenuState.currentSelectedItem = targetMenu.text;
    this.moreMenuState.isExpanded = false; // 点击后通常会收起
    
    await this.waitForNavigation();
  }

  /**
   * 导航到直接可见的菜单项
   * @param {object} targetMenu - 目标菜单
   */
  async navigateToDirectMenuItem(targetMenu) {
    logger.debug(`导航到直接菜单项: ${targetMenu.text}`);
    await this.agent.aiTap(`点击菜单项"${targetMenu.text}"`);
    await this.waitForNavigation();
  }

  /**
   * 确保"更多"菜单处于展开状态（使用DOM操作）
   */
  async ensureMoreMenuExpanded() {
    try {
      // 1. 检查更多按钮是否存在
      const moreButtonExists = await this.page.locator('#nav_top_menu_more').count() > 0;
      
      if (!moreButtonExists) {
        logger.debug('更多按钮不存在，跳过展开');
        return;
      }
      
      // 2. 检查是否已经展开（检查内部 i 标签的 rotate 类）
      const isExpanded = await this.page.locator('#nav_top_menu_more i.rotate').count() > 0;
      
      if (isExpanded) {
        logger.debug('更多菜单已展开（检测到内部 i 标签的 rotate 类）');
        this.moreMenuState.isExpanded = true;
        return;
      }
      
      // 3. 点击展开更多菜单
      logger.debug('点击展开更多菜单...');
      await this.page.locator('#nav_top_menu_more').click();
      
      // 4. 等待展开动画完成（等待内部 i 标签的 rotate 类出现）
      try {
        await this.page.locator('#nav_top_menu_more i.rotate').waitFor({ timeout: 2000 });
        this.moreMenuState.isExpanded = true;
        logger.debug('更多菜单展开成功');
      } catch (waitError) {
        // 如果没有rotate类，可能展开方式不同，再等一下
        logger.debug('未检测到rotate类，使用备用等待方式');
        await new Promise(resolve => setTimeout(resolve, 500));
        this.moreMenuState.isExpanded = true;
      }
      
    } catch (error) {
      logger.debug(`展开更多菜单失败: ${error.message}`);
      // 即使失败也不抛错，让后续流程继续
    }
  }

  /**
   * 获取当前"更多"按钮的文本（使用DOM操作）
   * @returns {string} 按钮文本
   */
  async getCurrentMoreButtonText() {
    try {
      // 获取 select-name span 中的文本内容（当前选中的菜单名）
      const buttonText = await this.page.locator('#nav_top_menu_more .select-name').textContent();
      return buttonText?.trim() || '更多';
    } catch (error) {
      logger.debug(`获取更多按钮文本失败: ${error.message}`);   
      return '更多';
    }
  }

  /**
   * 检查菜单是否已被选中
   * @param {string} menuText - 菜单文本
   * @returns {boolean} 是否已选中
   */
  async isMenuCurrentlySelected(menuText) {
    try {
      const isSelected = await this.agent.aiBoolean(`
        顶部导航栏的"更多"按钮是否显示为"${menuText}"，
        表示该菜单项当前已被选中
      `);
      return isSelected;
    } catch (error) {
      return false;
    }
  }

  /**
   * 等待导航完成
   */
  async waitForNavigation() {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      await this.agent.aiWaitFor(
        '页面导航完成，内容已加载',
        { timeout: 3000 }
      );
    } catch (error) {
      logger.debug('等待导航超时，继续执行');
    }
  }

  /**
   * 导航回到上一级（智能返回策略）
   * @param {object} targetMenu - 目标返回的菜单（可选）
   */
  async navigateBack(targetMenu = null) {
    try {
      if (targetMenu) {
        logger.debug(`返回到指定菜单: ${targetMenu.text}`);
        await this.navigateToMenu(targetMenu);
        return;
      }

      if (this.navigationHistory.length === 0) {
        logger.debug('无导航历史，返回首页');
        await this.navigateToHome();
        return;
      }
      
      const lastNavigation = this.navigationHistory.pop();
      logger.debug(`返回上一级，从 "${lastNavigation.menu.text}"`);
      
      // 尝试浏览器后退
      await this.page.goBack({ waitUntil: 'networkidle', timeout: 3000 });
      
      this.currentPage = lastNavigation.fromPage;
      
    } catch (error) {
      logger.debug('浏览器后退失败，尝试导航到首页');
      await this.navigateToHome();
    }
  }

  /**
   * 导航到首页
   */
  async navigateToHome() {
    try {
      const homeUrl = this.config.url;
      logger.debug(`导航到首页: ${homeUrl}`);
      
      await this.page.goto(homeUrl, { 
        waitUntil: 'networkidle', 
        timeout: this.config.timeout 
      });
      
      await this.waitForNavigation();
      
      this.currentPage = 'home';
      this.resetNavigationState();
      
    } catch (error) {
      logger.error(`导航到首页失败: ${error.message}`);
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
   * 重置导航状态
   */
  resetNavigationState() {
    this.moreMenuState = {
      isExpanded: false,
      currentSelectedItem: null
    };
    this.navigationHistory = [];
  }

  /**
   * 获取当前导航状态
   * @returns {object} 导航状态信息
   */
  getCurrentState() {
    return {
      currentPage: this.currentPage,
      navigationDepth: this.navigationHistory.length,
      moreMenuState: this.moreMenuState,
      lastNavigation: this.navigationHistory[this.navigationHistory.length - 1] || null
    };
  }
}

module.exports = MenuNavigator; 