const { logger } = require('../utils/logger');

const MORE_TRIGGER = '#nav_top_menu_more'; // 顶部“更多”固定锚点
const SIDEBAR_SELECTOR = '.el-menu.el-menu-vertical'; // 左侧菜单根容器选择器

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
   * 将用，分割字符串
   * @param {string} patterns - 以逗号分隔的匹配串
   * @returns {Array} 匹配规则数组
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
    logger.progress('开始发现顶级菜单...');
    try {
      // 1) 优先尝试顶部
      logger.debug('尝试展开顶部下拉菜单...');
      await this.expandDropdownWithMultipleStrategies();
      await new Promise(r => setTimeout(r, 200));

      logger.debug('确保"更多"下拉菜单展开...');
      await this.ensureMoreOpen();
      
      // 增加额外等待时间，确保下拉菜单完全展开
      await new Promise(r => setTimeout(r, 500));
      logger.debug('下拉菜单展开完成，开始发现菜单项...');

      const topMenus = await this.findTopLevelMenus();

      if (Array.isArray(topMenus) && topMenus.length > 0) {
        logger.success(`找到 ${topMenus.length} 顶部菜单`);
        return this.filterMenus(topMenus);
      }

      // 2) 顶部没有 → 尝试作为侧栏"一级入口"
      logger.info('未检测到顶部菜单，尝试发现左侧菜单作为一级入口');
      const sidebarMenus = await this.discoverSidebarRootMenus();

      if (Array.isArray(sidebarMenus) && sidebarMenus.length > 0) {
        logger.success(`发现 ${sidebarMenus.length} 个左侧一级菜单`);
        return this.filterMenus(sidebarMenus);
      }

      logger.warning('找不到顶级菜单（顶部与左侧都为空）');
      return [];
    } catch (error) {
      logger.error(`没有找到顶级菜单: ${error.message}`);
      throw error;
    }
  }

  /**
   * 确保顶部“更多”下拉处于展开状态（不依赖动态文案）
   */
  async ensureMoreOpen() {
    try {
      // 优先用 DOM 精确判断，避免 AI 配额/回答误差
      const page = this.agent?.page; // PlaywrightAgent 通常暴露 page
      if (page) {
        // 等待元素出现（短超时）
        await page.waitForSelector('#nav_top_menu_more', { timeout: 1500 });

        // 检查是否已展开：class 包含 selected 或 aria-expanded=true
        const isOpened = await page.evaluate(() => {
          const el = document.getElementById('nav_top_menu_more');
          if (!el) return null;
          const aria = el.getAttribute('aria-expanded');
          return el.classList.contains('selected') || aria === 'true';
        });

        if (isOpened === true) return true;

        // 未展开则点击展开（幂等）
        await page.click('#nav_top_menu_more', { timeout: 1500 });
        // 等待展开态生效
        await page.waitForFunction(() => {
          const el = document.getElementById('nav_top_menu_more');
          if (!el) return false;
          const aria = el.getAttribute('aria-expanded');
          return el.classList.contains('selected') || aria === 'true';
        }, { timeout: 1500 });

        await new Promise(r => setTimeout(r, 300));
        return true;
      }

      // Fallback：在拿不到 page 时，回退到 AI 路径（保留原逻辑）
      const exists = await this.agent.aiBoolean(`
        页面是否存在 id 为 "nav_top_menu_more" 的顶部下拉按钮
      `);
      if (!exists) return false;

      const opened = await this.agent.aiBoolean(`
        顶部 id 为 "nav_top_menu_more" 的按钮当前是否处于展开状态
        （例如存在 selected 类或 aria-expanded=true）
      `);

      if (!opened) {
        await this.agent.aiTap('点击 id 为 "nav_top_menu_more" 的按钮以展开下拉菜单');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return true;
    } catch (error) {
      logger.debug(`ensureMoreOpen failed: ${error.message}`);
      return false;
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
        - 顶部导航栏的主要功能菜单
        - "更多"下拉菜单中的主要功能选项（注意：更多下拉菜单已经展开，请包含其中的所有可见菜单项）
        - 排除：登录、注册、下载、帮助、待办、消息等辅助链接
        - 排除：页脚链接、广告链接、外部链接
        对每个主要菜单项返回其文本内容、是否来自下拉菜单、访问路径、所在区域
      `;

      const menuItems = await this.agent.aiQuery(menuQuery);

      if (!Array.isArray(menuItems)) {
        logger.warning('AI query returned non-array result, falling back to basic detection');
        return await this.fallbackTopMenuDetection();
      }

      // 统一映射 & 规范化 accessPath：来自"更多"的项，固定锚点为 #nav_top_menu_more
      return menuItems.map((item, index) => ({
        id: `top-menu-${index}`,
        text: item.text || '',
        level: 1,
        isDropdownItem: item.isDropdownItem || false,
        accessPath: item.isDropdownItem ? [MORE_TRIGGER] : (item.accessPath || []),
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
   * 发现侧栏根容器的一级入口（用于无顶栏场景，将其视为全局 L1）
   * @returns {Array} 侧栏一级菜单
   */
  async discoverSidebarRootMenus() {
    try {
      // 侧栏是否存在
      const hasSidebar = await this.agent.aiBoolean(`
        页面中是否存在类名为 "el-menu el-menu-vertical" 的左侧菜单根容器
      `);
      if (!hasSidebar) {
        return [];
      }

      // 从侧栏根容器收集“可见且可点击”的一级入口（不展开子级，只拿第一层）
      const sidebarRootQuery = `
        {
          text: string,
          isVisible: boolean,
          isClickable: boolean
        }[],
        在左侧 ".el-menu.el-menu-vertical" 根容器中，列出最外层所有可见且可点击的菜单项（仅第一层，不展开）
      `;
      const items = await this.agent.aiQuery(sidebarRootQuery);
      if (!Array.isArray(items)) {
        return [];
      }

      // 映射为“全局一级菜单”
      return items
        .filter(it => it.isVisible && it.isClickable && it.text && it.text.trim() !== '')
        .map((item, index) => ({
          id: `sidebar-root-${index}`,
          text: item.text || '',
          level: 1,                 // 无顶栏时，侧栏第一层作为全局 L1
          isDropdownItem: false,
          accessPath: [ 'sidebar_root' ], // 语义标记（不用于点击，仅用于上下文/统计）
          area: 'sidebar',
          tested: false,
          success: null,
          error: null,
          children: []
        }));
    } catch (error) {
      logger.debug(`discoverSidebarRootMenus failed: ${error.message}`);
      return [];
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

    // 包含固定锚点：更多 → 确保展开
    if (accessPath.includes(MORE_TRIGGER)) {
      await this.ensureMoreOpen();
      return;
    }

    // 侧栏根标记无需展开动作（由点击时定位）
    if (accessPath.includes('sidebar_root')) {
      return;
    }

    // 兼容：历史依赖文本的访问路径，统一走固定锚点保证稳定性
    const dropdownTriggers = ['更多', 'More', '展开', '▼', '...'];
    if (accessPath.some(item => dropdownTriggers.includes(item))) {
      await this.ensureMoreOpen();
      return;
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

    // 应用跳过规则
    if (this.skipPatterns.length > 0) {
      filtered = filtered.filter(menu => {
        const menuText = menu.text.toLowerCase();
        return !this.skipPatterns.some(pattern => menuText.includes(pattern));
      });
    }

    // 应用包含规则
    if (this.includePatterns.length > 0) {
      filtered = filtered.filter(menu => {
        const menuText = menu.text.toLowerCase();
        return this.includePatterns.some(pattern => menuText.includes(pattern));
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

  /**
   * 智能点击菜单项（处理下拉菜单中的项目）
   * @param {object} menu - 菜单项
   */
  async smartClickMenu(menu) {
    try {
      // 顶栏下拉项：点击前幂等展开
      if (menu.isDropdownItem) {
        await this.ensureMoreOpen();
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      logger.debug(`Attempting to click menu: ${menu.text}`);
      await this.agent.aiTap(`点击菜单项"${menu.text}"`);

      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      throw new Error(`Failed to click menu ${menu.text}: ${error.message}`);
    }
  }

  /**
   * 重新发现"更多"菜单中的项目
   */
  async rediscoverDropdownMenus() {
    try {
      logger.debug('Re-discovering dropdown menu items...');

      // 先确保“更多”展开，再重新发现
      await this.ensureMoreOpen();

      const newMenus = await this.findTopLevelMenus();
      return newMenus.filter(menu => menu.isDropdownItem);
    } catch (error) {
      logger.debug(`Failed to rediscover dropdown menus: ${error.message}`);
      return [];
    }
  }

  /**
   * 发现当前页面的子菜单（边发现边测试模式）
   * @returns {Array} 当前页面的子菜单列表
   */
  async discoverCurrentPageSubMenus() {
    try {
      logger.debug('发现当前页面的子菜单...');
      
      // 检查是否有左侧菜单
      const hasSidebar = await this.agent.aiBoolean(`
        当前页面是否有左侧菜单栏或侧边导航菜单
      `);
      
      if (!hasSidebar) {
        logger.debug('当前页面无左侧菜单');
        return [];
      }
      
      const sidebarQuery = `
        {
          text: string,
          isVisible: boolean,
          isClickable: boolean,
          isExpanded: boolean
        }[],
        列出当前页面左侧菜单中所有可见且可点击的菜单项，
        只返回第一层菜单项，不要展开子菜单
      `;
      
      const menus = await this.agent.aiQuery(sidebarQuery);
      
      if (!Array.isArray(menus)) {
        logger.debug('AI 查询返回非数组结果');
        return [];
      }
      
      const filteredMenus = menus
        .filter(menu => menu.isVisible && menu.isClickable && menu.text && menu.text.trim() !== '')
        .map((menu, index) => ({
          id: `sidebar-${Date.now()}-${index}`,
          text: menu.text.trim(),
          isVisible: menu.isVisible,
          isClickable: menu.isClickable,
          isExpanded: menu.isExpanded || false,
          area: 'sidebar'
        }));
      
      logger.debug(`发现 ${filteredMenus.length} 个左侧菜单项`);
      return this.filterMenus(filteredMenus);
      
    } catch (error) {
      logger.debug(`发现当前页面子菜单失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 检查当前页面是否有更深层的子菜单
   * @param {object} menuItem - 当前菜单项
   * @returns {boolean} 是否有子菜单
   */
  async hasSubMenus(menuItem) {
    try {
      const hasSubMenus = await this.agent.aiBoolean(`
        点击菜单项"${menuItem.text}"后，是否会显示更多的子菜单或下级菜单
      `);
      
      return hasSubMenus;
    } catch (error) {
      logger.debug(`检查菜单"${menuItem.text}"的子菜单失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 发现特定菜单项下的子菜单
   * @param {object} parentMenu - 父菜单项
   * @returns {Array} 子菜单列表
   */
  async discoverSubMenusOf(parentMenu) {
    try {
      logger.debug(`发现菜单"${parentMenu.text}"的子菜单...`);
      
      // 检查是否有展开的子菜单
      const hasExpandedSubMenus = await this.agent.aiBoolean(`
        菜单项"${parentMenu.text}"是否已展开并显示了子菜单项
      `);
      
      if (!hasExpandedSubMenus) {
        logger.debug(`菜单"${parentMenu.text}"无展开的子菜单`);
        return [];
      }
      
      const subMenuQuery = `
        {
          text: string,
          isVisible: boolean,
          isClickable: boolean,
          level: number
        }[],
        列出菜单项"${parentMenu.text}"下所有可见的子菜单项
      `;
      
      const subMenus = await this.agent.aiQuery(subMenuQuery);
      
      if (!Array.isArray(subMenus)) {
        return [];
      }
      
      return subMenus
        .filter(menu => menu.isVisible && menu.isClickable && menu.text)
        .map((menu, index) => ({
          id: `${parentMenu.id}-sub-${index}`,
          text: menu.text.trim(),
          level: (menu.level || 2),
          parent: parentMenu,
          isVisible: menu.isVisible,
          isClickable: menu.isClickable,
          area: 'sidebar-sub'
        }));
        
    } catch (error) {
      logger.debug(`发现菜单"${parentMenu.text}"的子菜单失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 多重策略展开下拉菜单（第一策略优先用固定 id）
   */
  async expandDropdownWithMultipleStrategies() {
    const strategies = [
      // 策略1：固定 id 直接展开（最可靠）
      async () => {
        const ok = await this.ensureMoreOpen();
        return !!ok;
      },

      // 策略2：通过CSS类名和属性检测
      async () => {
        const hasDropdownByClass = await this.agent.aiBoolean(`
          页面是否有具有dropdown、more、expand、menu-toggle等class名称的按钮或者id为nav_top_menu_more的按钮
        `);

        if (hasDropdownByClass) {
          // 仍优先点击固定 id
          const ok = await this.ensureMoreOpen();
          if (ok) return true;

          // 否则退化为点击“具有下拉菜单功能的按钮”
          await this.agent.aiTap(`点击具有下拉菜单功能的按钮（可能包含dropdown、more等class）`);
          await new Promise(resolve => setTimeout(resolve, 500));
          return true;
        }
        return false;
      },

      // 策略3：通过位置和视觉特征检测
      async () => {
        const hasRightNavButton = await this.agent.aiBoolean(`
          顶部导航栏右侧是否有可点击的菜单按钮或下拉按钮
        `);

        if (hasRightNavButton) {
          await this.agent.aiTap(`点击顶部导航栏右侧的菜单按钮`);
          await new Promise(resolve => setTimeout(resolve, 500));
          return true;
        }
        return false;
      },

      // 策略4：传统文本检测（兜底策略）
      async () => {
        const triggers = ['更多', 'More', '展开', '▼', '...', '⋯'];
        for (const trigger of triggers) {
          try {
            const hasButton = await this.agent.aiBoolean(`页面是否有显示"${trigger}"的按钮`);
            if (hasButton) {
              const ok = await this.ensureMoreOpen(); // 统一走固定 id 展开
              if (ok) return true;

              // 再兜底点击文本按钮
              await this.agent.aiTap(`点击"${trigger}"按钮`);
              await new Promise(resolve => setTimeout(resolve, 500));
              this.expandedDropdowns.add(trigger);
              return true;
            }
          } catch (error) {
            continue;
          }
        }
        return false;
      }
    ];

    // 依次尝试策略
    for (let i = 0; i < strategies.length; i++) {
      try {
        logger.debug(`Trying dropdown expansion strategy ${i + 1}...`);
        const success = await strategies[i]();
        if (success) {
          logger.debug(`Dropdown expansion strategy ${i + 1} succeeded`);
          this.expandedDropdowns.add(`strategy-${i + 1}`);
          return true;
        }
      } catch (error) {
        logger.debug(`Strategy ${i + 1} failed: ${error.message}`);
      }
    }

    return false;
  }
}

module.exports = MenuDiscovery; 