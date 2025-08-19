const { logger } = require('../utils/logger');

class MenuDiscovery {
  constructor(agent, config) {
    this.agent = agent;
    this.config = config;
    this.skipPatterns = this.parsePatterns(config.skip);
    this.includePatterns = this.parsePatterns(config.include);
    this.discoveredMenus = new Map();
    this.currentContext = null; // 当前菜单上下文
    this.expandedDropdowns = new Set(); // 已展开的下拉菜单
  }

  /**
   * Parse comma-separated patterns into array
   * @param {string} patterns - Comma-separated patterns
   * @returns {Array} Array of patterns
   */
  parsePatterns(patterns) {
    if (!patterns || patterns === '*') return [];
    return patterns.split(',').map(p => p.trim().toLowerCase());
  }

  /**
   * 新的入口方法：智能菜单发现
   * @returns {Array} 顶级菜单列表
   */
  async discoverTopLevelMenus() {
    logger.progress('Discovering top-level menus...');
    
    try {
      // 1. 首先展开所有下拉菜单（包括"更多"）
      await this.expandAllDropdownMenus();
      
      // 2. 发现所有顶级菜单
      const topMenus = await this.findTopLevelMenus();
      
      if (topMenus.length === 0) {
        logger.warning('No top-level menus found');
        return [];
      }

      logger.success(`Found ${topMenus.length} top-level menu items`);
      return this.filterMenus(topMenus);
      
    } catch (error) {
      logger.error(`Failed to discover top-level menus: ${error.message}`);
      throw error;
    }
  }

  /**
   * 展开所有下拉菜单（包括"更多"按钮）
   */
  async expandAllDropdownMenus() {
    try {
      logger.debug('Expanding all dropdown menus...');
      
      // 检测并点击"更多"类型的按钮
      const dropdownTriggers = ['更多', 'More', '展开', '▼', '...'];
      
      for (const trigger of dropdownTriggers) {
        try {
          const hasDropdown = await this.agent.aiBoolean(
            `页面是否有包含"${trigger}"文字或类似含义的下拉菜单按钮`
          );
          
          if (hasDropdown) {
            await this.agent.aiTap(`点击"${trigger}"按钮展开下拉菜单`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 等待展开动画
            this.expandedDropdowns.add(trigger);
            logger.debug(`Expanded dropdown: ${trigger}`);
          }
        } catch (error) {
          logger.debug(`Failed to expand dropdown ${trigger}: ${error.message}`);
        }
      }
      
      // 检测其他可能的折叠菜单
      await this.expandOtherCollapsibleMenus();
      
    } catch (error) {
      logger.debug(`Failed to expand dropdown menus: ${error.message}`);
    }
  }

  /**
   * 展开其他可能的折叠菜单
   */
  async expandOtherCollapsibleMenus() {
    try {
      const hasCollapsible = await this.agent.aiBoolean(
        '页面是否有其他折叠的导航菜单或可展开的菜单区域'
      );
      
      if (hasCollapsible) {
        await this.agent.aiTap('点击展开所有折叠的菜单区域');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger.debug(`Failed to expand collapsible menus: ${error.message}`);
    }
  }

  /**
   * 发现顶级菜单项
   * @returns {Array} 顶级菜单列表
   */
  async findTopLevelMenus() {
    try {
      const menuQuery = `
        {
          text: string,
          isDropdownItem: boolean,
          accessPath: string[],
          area: string
        }[],
        找到页面中所有的顶级主导航菜单项，要求：
        - 顶部导航栏的主要功能菜单（如：工作台、巡查、监控等）
        - "更多"下拉菜单中的主要功能选项
        - 排除：登录、注册、下载、帮助等辅助链接
        - 排除：页脚链接、广告链接、外部链接
        对每个主要菜单项返回其文本内容、是否来自下拉菜单、访问路径、所在区域
      `;

      const menuItems = await this.agent.aiQuery(menuQuery);
      
      if (!Array.isArray(menuItems)) {
        logger.warning('AI query returned non-array result, falling back to basic detection');
        return await this.fallbackTopMenuDetection();
      }

      return menuItems.map((item, index) => ({
        id: `top-menu-${index}`,
        text: item.text || '',
        level: 1,
        isDropdownItem: item.isDropdownItem || false,
        accessPath: item.accessPath || [],
        area: item.area || 'top-navigation',
        tested: false,
        success: null,
        error: null,
        children: []
      }));

    } catch (error) {
      logger.debug(`AI top menu detection failed: ${error.message}, falling back`);
      return await this.fallbackTopMenuDetection();
    }
  }

  /**
   * 基于上下文动态发现子菜单
   * @param {number} level - 菜单层级（2=二级菜单，3=三级菜单）
   * @returns {Array} 子菜单列表
   */
  async discoverContextMenus(level = 2) {
    try {
      logger.debug(`Discovering level ${level} menus in current context...`);
      
      const menuArea = level === 2 ? '左侧菜单' : '子菜单';
      const menuQuery = `
        {
          text: string,
          isVisible: boolean,
          isClickable: boolean
        }[],
        在当前页面上下文中，找到${menuArea}区域的所有可点击菜单项
      `;

      const contextMenus = await this.agent.aiQuery(menuQuery);
      
      if (!Array.isArray(contextMenus)) {
        return [];
      }

      return contextMenus
        .filter(item => item.isVisible && item.isClickable)
        .map((item, index) => ({
          id: `level${level}-menu-${index}`,
          text: item.text || '',
          level: level,
          parentContext: this.currentContext,
          tested: false,
          success: null,
          error: null,
          children: []
        }));

    } catch (error) {
      logger.debug(`Failed to discover level ${level} menus: ${error.message}`);
      return [];
    }
  }

  /**
   * 设置当前菜单上下文
   * @param {string} context - 当前上下文（如："巡查"）
   */
  setCurrentContext(context) {
    this.currentContext = context;
    logger.debug(`Menu context set to: ${context}`);
  }

  /**
   * 确保下拉菜单保持展开状态
   * @param {Array} accessPath - 菜单访问路径
   */
  async ensureDropdownExpanded(accessPath) {
    if (!accessPath || accessPath.length === 0) return;
    
    // 跳过复杂的访问路径，因为很多时候这些路径只是描述性的，不是实际的操作步骤
    if (accessPath.includes('header') || accessPath.includes('register') || accessPath.includes('download')) {
      logger.debug('Skipping complex access path - not a dropdown menu');
      return;
    }
    
    for (const pathItem of accessPath) {
      if (!this.expandedDropdowns.has(pathItem)) {
        try {
          // 只处理明确的下拉菜单触发器
          const dropdownTriggers = ['更多', 'More', '展开', '▼', '...'];
          if (dropdownTriggers.includes(pathItem)) {
            await this.agent.aiTap(`点击"${pathItem}"按钮展开菜单`);
            await new Promise(resolve => setTimeout(resolve, 500));
            this.expandedDropdowns.add(pathItem);
            logger.debug(`Re-expanded dropdown: ${pathItem}`);
          }
        } catch (error) {
          logger.debug(`Failed to re-expand ${pathItem}: ${error.message}`);
        }
      }
    }
  }

  /**
   * 备用的顶级菜单检测
   * @returns {Array} 菜单列表
   */
  async fallbackTopMenuDetection() {
    try {
      const clickableElements = await this.agent.aiQuery(`
        string[], 
        找到页面顶部导航区域的所有可点击菜单项的文本内容
      `);

      if (!Array.isArray(clickableElements)) {
        return [];
      }

      return clickableElements.map((text, index) => ({
        id: `fallback-menu-${index}`,
        text: text || '',
        level: 1,
        isDropdownItem: false,
        accessPath: [],
        area: 'top-navigation',
        tested: false,
        success: null,
        error: null,
        children: []
      }));

    } catch (error) {
      logger.warning(`Fallback menu detection also failed: ${error.message}`);
      return [];
    }
  }

  // 保留原有的 filterMenus 方法
  filterMenus(menus) {
    let filtered = menus.filter(menu => menu.text && menu.text.trim() !== '');

    // Apply skip patterns
    if (this.skipPatterns.length > 0) {
      filtered = filtered.filter(menu => {
        const menuText = menu.text.toLowerCase();
        return !this.skipPatterns.some(pattern => 
          menuText.includes(pattern)
        );
      });
    }

    // Apply include patterns
    if (this.includePatterns.length > 0) {
      filtered = filtered.filter(menu => {
        const menuText = menu.text.toLowerCase();
        return this.includePatterns.some(pattern => 
          menuText.includes(pattern)
        );
      });
    }

    logger.info(`Filtered to ${filtered.length} menu items for testing`);
    
    if (this.config.verbose) {
      filtered.forEach((menu, index) => {
        const pathInfo = menu.accessPath && menu.accessPath.length > 0 
          ? ` (via: ${menu.accessPath.join(' → ')})` 
          : '';
        logger.debug(`  ${index + 1}. ${menu.text}${pathInfo}`);
      });
    }

    return filtered;
  }

  // 保留原有的统计方法
  getFlattenedMenus(menus) {
    const flattened = [];
    
    for (const menu of menus) {
      flattened.push(menu);
      if (menu.children && menu.children.length > 0) {
        flattened.push(...this.getFlattenedMenus(menu.children));
      }
    }
    
    return flattened;
  }

  getMenuStats(menus) {
    const flattened = this.getFlattenedMenus(menus);
    
    return {
      total: flattened.length,
      level1: menus.length,
      expandable: flattened.filter(m => m.children && m.children.length > 0).length,
      tested: flattened.filter(m => m.tested).length,
      successful: flattened.filter(m => m.success === true).length,
      failed: flattened.filter(m => m.success === false).length
    };
  }

  // 兼容性方法：保持向后兼容
  async discoverMenus(depth = 1) {
    logger.warning('discoverMenus is deprecated, use discoverTopLevelMenus instead');
    return await this.discoverTopLevelMenus();
  }

  // 保留原有的fallbackMenuDetection方法用于兼容
  async fallbackMenuDetection() {
    return await this.fallbackTopMenuDetection();
  }
}

module.exports = MenuDiscovery; 