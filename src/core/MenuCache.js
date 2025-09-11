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
      version: '1.0.0',
      menus: {
        topLevel: [],
        subMenus: new Map() // 存储各级子菜单
      },
      metadata: {
        totalMenus: 0,
        maxDepth: 0,
        lastUpdated: null,
        discoveryDuration: 0
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
      this.cache = cacheData;

      // 转换 subMenus Map (JSON中Map会被序列化为对象)
      this.cache.menus.subMenus = new Map(Object.entries(cacheData.menus.subMenus || {}));

      logger.success(`成功加载菜单缓存: ${cacheData.menus.topLevel.length} 个顶级菜单`);
      logger.info(`缓存创建时间: ${new Date(cacheData.timestamp).toLocaleString()}`);
      logger.info(`总菜单数: ${cacheData.metadata.totalMenus}, 最大深度: ${cacheData.metadata.maxDepth}`);

      return {
        topLevelMenus: cacheData.menus.topLevel,
        subMenus: this.cache.menus.subMenus,
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
    return this.cache.menus.subMenus.get(parentKey) || [];
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
      if (await fs.pathExists(this.cacheFile)) {
        const cacheForSave = {
          ...this.cache,
          menus: {
            ...this.cache.menus,
            subMenus: Object.fromEntries(this.cache.menus.subMenus)
          },
          metadata: {
            ...this.cache.metadata,
            lastUpdated: new Date().toISOString()
          }
        };
        
        await fs.writeJson(this.cacheFile, cacheForSave, { spaces: 2 });
      }
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
    return {
      topLevelCount: this.cache.menus.topLevel.length,
      subMenusCount: this.cache.menus.subMenus.size,
      totalMenus: this.cache.metadata.totalMenus,
      maxDepth: this.cache.metadata.maxDepth,
      lastUpdated: this.cache.metadata.lastUpdated
    };
  }
}

module.exports = MenuCache; 