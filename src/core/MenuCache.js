const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../utils/logger');

/**
 * 菜单缓存管理器
 * 缓存已发现的菜单结构，加速后续测试
 */
class MenuCache {
  constructor(config) {
    this.config = config;
    this.cacheDir = path.join(config.output || './menu-test-results', 'menu-cache');
    this.cacheFile = this.getCacheFilePath();
    this.cache = {
      url: config.url,
      timestamp: null,
      version: '1.1.0', // 升级版本支持路由
      menus: {
        topLevel: [],
        subMenus: new Map() // 存储各级子菜单
      },
      routes: {
        menuRoutes: new Map(), // 菜单文本 -> 路由URL 映射
        routeValidation: new Map(), // 路由 -> 验证规则 映射
        hierarchy: [], // 路由层级关系
        parameters: new Map() // 动态路由参数
      },
      metadata: {
        totalMenus: 0,
        totalRoutes: 0,
        maxDepth: 0,
        lastUpdated: null,
        discoveryDuration: 0,
        routeDiscoveryMode: 'ai' // 'ai' | 'manual' | 'imported'
      }
    };
    
    // 添加防护方法
    this.ensureSubMenusIsMap = () => {
      if (!(this.cache.menus.subMenus instanceof Map)) {
        logger.warning('Converting subMenus to Map');
        const oldSubMenus = this.cache.menus.subMenus || {};
        this.cache.menus.subMenus = new Map(Object.entries(oldSubMenus));
      }
    };
  }

  /**
   * 获取缓存文件路径
   * @returns {string} 缓存文件路径
   */
  getCacheFilePath() {
    // 基于URL生成唯一的缓存文件名
    const urlHash = this.hashUrl(this.config.url);
    return path.join(this.cacheDir, `menu-cache-${urlHash}.json`);
  }

  /**
   * 生成URL哈希
   * @param {string} url - 目标URL
   * @returns {string} URL哈希值
   */
  hashUrl(url) {
    // 简单的哈希算法，移除协议、端口等，保留主要路径
    const cleanUrl = url.replace(/^https?:\/\//, '')
                        .replace(/:\d+/, '')
                        .replace(/[^a-zA-Z0-9]/g, '-')
                        .substring(0, 50);
    return cleanUrl;
  }

  /**
   * 检查缓存是否存在且有效
   * @returns {boolean} 缓存是否有效
   */
  async isCacheValid() {
    try {
      if (!await fs.pathExists(this.cacheFile)) {
        logger.debug('菜单缓存文件不存在');
        return false;
      }

      const cacheData = await fs.readJson(this.cacheFile);
      
      // 检查URL是否匹配
      if (cacheData.url !== this.config.url) {
        logger.debug('缓存URL不匹配，缓存无效');
        return false;
      }

      // 如果配置强制刷新，则认为缓存无效
      if (this.config.forceFreshDiscovery) {
        logger.debug('配置强制刷新，忽略缓存');
        return false;
      }

      // 检查缓存是否过期（默认7天）
      const cacheAge = Date.now() - new Date(cacheData.timestamp).getTime();
      const maxAge = this.config.cacheMaxAge || (7 * 24 * 60 * 60 * 1000); // 7天
      
      if (cacheAge > maxAge) {
        logger.debug('菜单缓存已过期');
        return false;
      }

      // 检查缓存中是否有菜单数据
      if (!cacheData.menus || !cacheData.menus.topLevel || cacheData.menus.topLevel.length === 0) {
        logger.debug('缓存中无有效菜单数据');
        return false;
      }

      logger.success(`发现有效的菜单缓存，包含 ${cacheData.menus.topLevel.length} 个顶级菜单`);
      return true;

    } catch (error) {
      logger.debug(`检查缓存有效性失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 加载缓存的菜单数据
   * @returns {object} 缓存的菜单数据
   */
  async loadCachedMenus() {
    try {
      if (!await this.isCacheValid()) {
        return null;
      }

      const cacheData = await fs.readJson(this.cacheFile);
      
      // 重新构建缓存对象，确保 Map 类型正确
      this.cache = {
        ...cacheData,
        menus: {
          topLevel: cacheData.menus.topLevel || [],
          subMenus: new Map() // 重新创建 Map
        },
        routes: {
          menuRoutes: new Map(),
          routeValidation: new Map(),
          hierarchy: [],
          parameters: new Map()
        }
      };

      // 安全地转换 subMenus
      if (cacheData.menus && cacheData.menus.subMenus) {
        try {
          // 如果 subMenus 是对象，转换为 Map
          if (typeof cacheData.menus.subMenus === 'object' && !Array.isArray(cacheData.menus.subMenus)) {
            const entries = Object.entries(cacheData.menus.subMenus);
            this.cache.menus.subMenus = new Map(entries);
          }
          // 如果已经是数组形式（Map.entries() 的结果），直接创建 Map
          else if (Array.isArray(cacheData.menus.subMenus)) {
            this.cache.menus.subMenus = new Map(cacheData.menus.subMenus);
          }
        } catch (conversionError) {
          logger.warning(`子菜单数据转换失败: ${conversionError.message}，使用空 Map`);
          this.cache.menus.subMenus = new Map();
        }
      }

      // 安全地转换路由数据
      if (cacheData.routes) {
        try {
          // 转换 menuRoutes
          if (cacheData.routes.menuRoutes) {
            if (typeof cacheData.routes.menuRoutes === 'object' && !Array.isArray(cacheData.routes.menuRoutes)) {
              this.cache.routes.menuRoutes = new Map(Object.entries(cacheData.routes.menuRoutes));
            } else if (Array.isArray(cacheData.routes.menuRoutes)) {
              this.cache.routes.menuRoutes = new Map(cacheData.routes.menuRoutes);
            }
          }
          
          // 转换 routeValidation
          if (cacheData.routes.routeValidation) {
            if (typeof cacheData.routes.routeValidation === 'object' && !Array.isArray(cacheData.routes.routeValidation)) {
              this.cache.routes.routeValidation = new Map(Object.entries(cacheData.routes.routeValidation));
            } else if (Array.isArray(cacheData.routes.routeValidation)) {
              this.cache.routes.routeValidation = new Map(cacheData.routes.routeValidation);
            }
          }
          
          // 转换其他路由数据
          this.cache.routes.hierarchy = cacheData.routes.hierarchy || [];
          
          if (cacheData.routes.parameters) {
            if (typeof cacheData.routes.parameters === 'object' && !Array.isArray(cacheData.routes.parameters)) {
              this.cache.routes.parameters = new Map(Object.entries(cacheData.routes.parameters));
            } else if (Array.isArray(cacheData.routes.parameters)) {
              this.cache.routes.parameters = new Map(cacheData.routes.parameters);
            }
          }
          
        } catch (routeConversionError) {
          logger.warning(`路由数据转换失败: ${routeConversionError.message}，使用空路由缓存`);
          this.cache.routes = {
            menuRoutes: new Map(),
            routeValidation: new Map(),
            hierarchy: [],
            parameters: new Map()
          };
        }
      }

      const routeCount = this.cache.routes.menuRoutes.size;
      
      logger.success(`成功加载菜单缓存: ${this.cache.menus.topLevel.length} 个顶级菜单`);
      if (routeCount > 0) {
        logger.info(`成功加载路由缓存: ${routeCount} 个路由映射`);
      }
      logger.info(`缓存创建时间: ${new Date(cacheData.timestamp).toLocaleString()}`);
      logger.info(`总菜单数: ${cacheData.metadata.totalMenus}, 最大深度: ${cacheData.metadata.maxDepth}`);

      return {
        topLevelMenus: this.cache.menus.topLevel,
        subMenus: this.cache.menus.subMenus,
        routes: this.cache.routes,
        metadata: cacheData.metadata
      };

    } catch (error) {
      logger.error(`加载菜单缓存失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 保存菜单到缓存
   * @param {Array} topLevelMenus - 顶级菜单列表
   * @param {Map} subMenusMap - 子菜单映射
   * @param {number} discoveryDuration - 发现耗时
   */
  async saveMenusToCache(topLevelMenus, subMenusMap = new Map(), discoveryDuration = 0) {
    try {
      // 确保缓存目录存在
      await fs.ensureDir(this.cacheDir);

      // 计算菜单统计信息
      const totalMenus = this.calculateTotalMenus(topLevelMenus, subMenusMap);
      const maxDepth = this.calculateMaxDepth(topLevelMenus);

      // 更新缓存数据
      this.cache = {
        url: this.config.url,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        menus: {
          topLevel: topLevelMenus,
          subMenus: Object.fromEntries(subMenusMap) // 将Map转换为普通对象以便JSON序列化
        },
        metadata: {
          totalMenus,
          maxDepth,
          lastUpdated: new Date().toISOString(),
          discoveryDuration
        }
      };

      // 保存到文件
      await fs.writeJson(this.cacheFile, this.cache, { spaces: 2 });

      logger.success(`菜单缓存已保存: ${this.cacheFile}`);
      logger.info(`缓存包含 ${totalMenus} 个菜单项，最大深度 ${maxDepth} 级`);
      logger.info(`发现耗时: ${(discoveryDuration / 1000).toFixed(2)}秒`);

      return true;

    } catch (error) {
      logger.error(`保存菜单缓存失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 计算总菜单数
   * @param {Array} topLevelMenus - 顶级菜单
   * @param {Map} subMenusMap - 子菜单映射
   * @returns {number} 总菜单数
   */
  calculateTotalMenus(topLevelMenus, subMenusMap) {
    let total = topLevelMenus.length;
    for (const subMenus of subMenusMap.values()) {
      if (Array.isArray(subMenus)) {
        total += subMenus.length;
      }
    }
    return total;
  }

  /**
   * 计算最大菜单深度
   * @param {Array} topLevelMenus - 顶级菜单
   * @returns {number} 最大深度
   */
  calculateMaxDepth(topLevelMenus) {
    let maxDepth = 1;
    
    function traverse(menus, currentDepth) {
      for (const menu of menus) {
        maxDepth = Math.max(maxDepth, currentDepth);
        if (menu.children && menu.children.length > 0) {
          traverse(menu.children, currentDepth + 1);
        }
        if (menu.level && menu.level > maxDepth) {
          maxDepth = menu.level;
        }
      }
    }

    traverse(topLevelMenus, 1);
    return maxDepth;
  }

  /**
   * 添加子菜单到缓存
   * @param {string} parentKey - 父菜单唯一标识
   * @param {Array} subMenus - 子菜单列表
   */
  async addSubMenusToCache(parentKey, subMenus) {
    try {
      // 确保 subMenus 是 Map 对象
      if (!(this.cache.menus.subMenus instanceof Map)) {
        logger.warning('subMenus 不是 Map 对象，重新初始化');
        this.cache.menus.subMenus = new Map();
      }
      
      this.cache.menus.subMenus.set(parentKey, subMenus);
      
      // 实时更新缓存文件
      await this.updateCacheFile();
      
      logger.debug(`已缓存 ${parentKey} 的 ${subMenus.length} 个子菜单`);
      
    } catch (error) {
      logger.debug(`缓存子菜单失败: ${error.message}`);
    }
  }

  /**
   * 获取缓存的子菜单
   * @param {string} parentKey - 父菜单唯一标识
   * @returns {Array} 子菜单列表
   */
  getCachedSubMenus(parentKey) {
    try {
      // 确保 subMenus 是 Map 对象
      if (!(this.cache.menus.subMenus instanceof Map)) {
        logger.warning('subMenus 不是 Map 对象，返回空数组');
        return [];
      }
      
      return this.cache.menus.subMenus.get(parentKey) || [];
    } catch (error) {
      logger.debug(`获取缓存子菜单失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 生成菜单的唯一标识符
   * @param {object} menu - 菜单对象
   * @returns {string} 唯一标识符
   */
  generateMenuKey(menu) {
    const pathStr = (menu.path || [menu.text]).join('-');
    return `${menu.level || 1}-${pathStr}`.replace(/[^a-zA-Z0-9\-]/g, '_');
  }

  /**
   * 更新缓存文件
   */
  async updateCacheFile() {
    try {
      // 确保缓存目录存在
      await fs.ensureDir(this.cacheDir);
      
      // 确保 subMenus 是 Map 对象再序列化
      let subMenusForSave = {};
      
      if (this.cache.menus.subMenus instanceof Map) {
        subMenusForSave = Object.fromEntries(this.cache.menus.subMenus);
      } else if (typeof this.cache.menus.subMenus === 'object') {
        subMenusForSave = this.cache.menus.subMenus;
      }
      
      // 序列化路由 Maps
      let routesForSave = {};
      if (this.cache.routes) {
        this.ensureRouteMapsInitialized();
        
        routesForSave = {
          menuRoutes: this.cache.routes.menuRoutes instanceof Map 
            ? Object.fromEntries(this.cache.routes.menuRoutes)
            : this.cache.routes.menuRoutes || {},
          routeValidation: this.cache.routes.routeValidation instanceof Map
            ? Object.fromEntries(this.cache.routes.routeValidation)
            : this.cache.routes.routeValidation || {},
          hierarchy: this.cache.routes.hierarchy || [],
          parameters: this.cache.routes.parameters instanceof Map
            ? Object.fromEntries(this.cache.routes.parameters)
            : this.cache.routes.parameters || {}
        };
      }
      
      const cacheForSave = {
        ...this.cache,
        menus: {
          ...this.cache.menus,
          subMenus: subMenusForSave
        },
        routes: routesForSave,
        metadata: {
          ...this.cache.metadata,
          lastUpdated: new Date().toISOString()
        }
      };
      
      await fs.writeJson(this.cacheFile, cacheForSave, { spaces: 2 });
      
    } catch (error) {
      logger.debug(`更新缓存文件失败: ${error.message}`);
    }
  }

  /**
   * 清除缓存
   */
  async clearCache() {
    try {
      if (await fs.pathExists(this.cacheFile)) {
        await fs.remove(this.cacheFile);
        logger.success('菜单缓存已清除');
      } else {
        logger.info('没有找到缓存文件');
      }
    } catch (error) {
      logger.error(`清除缓存失败: ${error.message}`);
    }
  }

  /**
   * 获取缓存信息
   * @returns {object} 缓存信息
   */
  async getCacheInfo() {
    try {
      if (!await fs.pathExists(this.cacheFile)) {
        return { exists: false };
      }

      const cacheData = await fs.readJson(this.cacheFile);
      return {
        exists: true,
        url: cacheData.url,
        timestamp: cacheData.timestamp,
        totalMenus: cacheData.metadata?.totalMenus || 0,
        maxDepth: cacheData.metadata?.maxDepth || 0,
        age: Date.now() - new Date(cacheData.timestamp).getTime(),
        file: this.cacheFile
      };
    } catch (error) {
      return { 
        exists: false, 
        error: error.message 
      };
    }
  }

  /**
   * 验证缓存完整性
   * @returns {boolean} 缓存是否完整
   */
  async validateCacheIntegrity() {
    try {
      const cachedData = await this.loadCachedMenus();
      if (!cachedData) return false;

      // 检查顶级菜单结构
      if (!Array.isArray(cachedData.topLevelMenus)) return false;

      // 检查每个菜单项是否有必要的字段
      for (const menu of cachedData.topLevelMenus) {
        if (!menu.text || !menu.id) return false;
      }

      return true;
    } catch (error) {
      logger.debug(`验证缓存完整性失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取缓存统计信息
   * @returns {object} 统计信息
   */
  getStats() {
    let subMenusCount = 0;
    let routesCount = 0;
    
    try {
      if (this.cache.menus.subMenus instanceof Map) {
        subMenusCount = this.cache.menus.subMenus.size;
      } else if (typeof this.cache.menus.subMenus === 'object') {
        subMenusCount = Object.keys(this.cache.menus.subMenus).length;
      }

      if (this.cache.routes && this.cache.routes.menuRoutes instanceof Map) {
        routesCount = this.cache.routes.menuRoutes.size;
      }
    } catch (error) {
      logger.debug(`获取统计信息失败: ${error.message}`);
    }
    
    return {
      topLevelCount: this.cache.menus.topLevel.length,
      subMenusCount,
      totalMenus: this.cache.metadata.totalMenus,
      totalRoutes: routesCount,
      maxDepth: this.cache.metadata.maxDepth,
      lastUpdated: this.cache.metadata.lastUpdated,
      routeDiscoveryMode: this.cache.metadata.routeDiscoveryMode
    };
  }

  // ==================== 路由管理方法 ====================

  /**
   * 记录菜单到路由的映射
   * @param {string} menuText - 菜单文本
   * @param {string} routeUrl - 路由URL
   * @param {object} validationRules - 验证规则
   * @param {number} level - 菜单层级
   */
  async recordMenuRoute(menuText, routeUrl, validationRules = {}, level = 1) {
    try {
      // 确保路由Maps正确初始化
      this.ensureRouteMapsInitialized();
      
      // 标准化路由URL
      const normalizedRoute = this.normalizeRoute(routeUrl);
      
      // 记录菜单 -> 路由映射
      this.cache.routes.menuRoutes.set(menuText, {
        url: normalizedRoute,
        originalUrl: routeUrl,
        level: level,
        recordedAt: new Date().toISOString()
      });
      
      // 记录路由验证规则
      this.cache.routes.routeValidation.set(normalizedRoute, {
        ...validationRules,
        menuText: menuText,
        level: level,
        lastValidated: new Date().toISOString()
      });
      
      // 更新统计
      this.cache.metadata.totalRoutes = this.cache.routes.menuRoutes.size;
      
      // 实时保存
      await this.updateCacheFile();
      
      logger.debug(`记录路由映射: "${menuText}" -> ${normalizedRoute}`);
      
    } catch (error) {
      logger.error(`记录路由映射失败: ${error.message}`);
    }
  }

  /**
   * 获取菜单对应的路由
   * @param {string} menuText - 菜单文本
   * @returns {object|null} 路由信息
   */
  getMenuRoute(menuText) {
    try {
      this.ensureRouteMapsInitialized();
      return this.cache.routes.menuRoutes.get(menuText) || null;
    } catch (error) {
      logger.debug(`获取菜单路由失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取所有路由列表
   * @returns {Array} 路由列表
   */
  getAllRoutes() {
    try {
      this.ensureRouteMapsInitialized();
      const routes = [];
      
      for (const [menuText, routeInfo] of this.cache.routes.menuRoutes.entries()) {
        routes.push({
          menuText,
          ...routeInfo
        });
      }
      
      return routes.sort((a, b) => a.level - b.level);
    } catch (error) {
      logger.error(`获取路由列表失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 批量导入路由
   * @param {Array} routes - 路由配置数组
   * @param {string} mode - 导入模式 'replace' | 'merge'
   */
  async importRoutes(routes, mode = 'merge') {
    try {
      this.ensureRouteMapsInitialized();
      
      if (mode === 'replace') {
        // 清空现有路由
        this.cache.routes.menuRoutes.clear();
        this.cache.routes.routeValidation.clear();
      }
      
      let importedCount = 0;
      
      for (const route of routes) {
        if (route.menuText && route.url) {
          await this.recordMenuRoute(
            route.menuText,
            route.url,
            route.validation || {},
            route.level || 1
          );
          importedCount++;
        }
      }
      
      // 更新发现模式
      this.cache.metadata.routeDiscoveryMode = 'imported';
      
      logger.success(`成功导入 ${importedCount} 个路由`);
      return importedCount;
      
    } catch (error) {
      logger.error(`导入路由失败: ${error.message}`);
      return 0;
    }
  }

  /**
   * 导出路由配置
   * @param {string} format - 导出格式 'json' | 'csv'
   * @returns {string|Array} 导出的路由数据
   */
  exportRoutes(format = 'json') {
    try {
      const routes = this.getAllRoutes();
      
      if (format === 'csv') {
        const csvHeaders = 'MenuText,URL,Level,RecordedAt\n';
        const csvRows = routes.map(route => 
          `"${route.menuText}","${route.url}",${route.level},"${route.recordedAt}"`
        ).join('\n');
        
        return csvHeaders + csvRows;
      }
      
      // 默认 JSON 格式
      return JSON.stringify({
        exportedAt: new Date().toISOString(),
        totalRoutes: routes.length,
        sourceUrl: this.cache.url,
        routes: routes
      }, null, 2);
      
    } catch (error) {
      logger.error(`导出路由失败: ${error.message}`);
      return format === 'json' ? '{}' : '';
    }
  }

  /**
   * 验证路由有效性
   * @param {Array} routesToValidate - 要验证的路由列表，为空时验证所有路由
   * @returns {object} 验证结果
   */
  async validateRoutes(routesToValidate = []) {
    try {
      const routes = routesToValidate.length > 0 ? routesToValidate : this.getAllRoutes();
      const results = {
        total: routes.length,
        valid: 0,
        invalid: 0,
        details: []
      };
      
      for (const route of routes) {
        const isValid = this.isValidRoute(route.url);
        
        if (isValid) {
          results.valid++;
        } else {
          results.invalid++;
        }
        
        results.details.push({
          menuText: route.menuText,
          url: route.url,
          valid: isValid,
          level: route.level
        });
      }
      
      logger.info(`路由验证完成: ${results.valid}/${results.total} 有效`);
      return results;
      
    } catch (error) {
      logger.error(`路由验证失败: ${error.message}`);
      return { total: 0, valid: 0, invalid: 0, details: [] };
    }
  }

  /**
   * 清除路由缓存
   */
  async clearRoutes() {
    try {
      this.ensureRouteMapsInitialized();
      
      this.cache.routes.menuRoutes.clear();
      this.cache.routes.routeValidation.clear();
      this.cache.routes.hierarchy = [];
      this.cache.metadata.totalRoutes = 0;
      
      await this.updateCacheFile();
      
      logger.success('路由缓存已清除');
    } catch (error) {
      logger.error(`清除路由缓存失败: ${error.message}`);
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 确保路由 Maps 正确初始化
   */
  ensureRouteMapsInitialized() {
    if (!this.cache.routes) {
      this.cache.routes = {
        menuRoutes: new Map(),
        routeValidation: new Map(),
        hierarchy: [],
        parameters: new Map()
      };
    }
    
    if (!(this.cache.routes.menuRoutes instanceof Map)) {
      this.cache.routes.menuRoutes = new Map(Object.entries(this.cache.routes.menuRoutes || {}));
    }
    
    if (!(this.cache.routes.routeValidation instanceof Map)) {
      this.cache.routes.routeValidation = new Map(Object.entries(this.cache.routes.routeValidation || {}));
    }
  }

  /**
   * 标准化路由URL
   * @param {string} url - 原始URL
   * @returns {string} 标准化后的URL
   */
  normalizeRoute(url) {
    try {
      const urlObj = new URL(url);
      // 移除查询参数和fragment中的临时参数
      let pathname = urlObj.pathname;
      let hash = urlObj.hash;
      
      // 标准化路径
      pathname = pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
      
      // 保留主要的hash路由，移除临时参数
      if (hash) {
        hash = hash.split('?')[0]; // 移除hash中的查询参数
      }
      
      return urlObj.origin + pathname + hash;
    } catch (error) {
      // 如果URL解析失败，返回原始URL
      return url;
    }
  }

  /**
   * 检查路由格式是否有效
   * @param {string} url - 路由URL
   * @returns {boolean} 是否有效
   */
  isValidRoute(url) {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = MenuCache; 