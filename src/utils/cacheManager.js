const MenuCache = require('../core/MenuCache');
const { logger } = require('./logger');

/**
 * 缓存管理器工具类
 */
class CacheManager {
  constructor(config) {
    this.config = config;
    this.menuCache = new MenuCache(config);
  }

  /**
   * 显示缓存信息
   */
  async showCacheInfo() {
    try {
      const info = await this.menuCache.getCacheInfo();
      
      if (!info.exists) {
        logger.info('没有找到菜单缓存');
        if (info.error) {
          logger.warning(`缓存检查错误: ${info.error}`);
        }
        return;
      }

      logger.info('=== 菜单缓存信息 ===');
      logger.info(`URL: ${info.url}`);
      logger.info(`创建时间: ${new Date(info.timestamp).toLocaleString()}`);
      logger.info(`总菜单数: ${info.totalMenus}`);
      logger.info(`最大深度: ${info.maxDepth}`);
      logger.info(`缓存年龄: ${this.formatAge(info.age)}`);
      logger.info(`缓存文件: ${info.file}`);
      
      const isValid = await this.menuCache.isCacheValid();
      logger.info(`缓存状态: ${isValid ? '有效' : '无效/过期'}`);
      
    } catch (error) {
      logger.error(`显示缓存信息失败: ${error.message}`);
    }
  }

  /**
   * 清除缓存
   */
  async clearCache() {
    try {
      await this.menuCache.clearCache();
      logger.success('菜单缓存已清除');
    } catch (error) {
      logger.error(`清除缓存失败: ${error.message}`);
    }
  }

  /**
   * 验证缓存完整性
   */
  async validateCache() {
    try {
      const isValid = await this.menuCache.validateCacheIntegrity();
      
      if (isValid) {
        logger.success('缓存完整性验证通过');
      } else {
        logger.warning('缓存完整性验证失败');
      }
      
      return isValid;
    } catch (error) {
      logger.error(`验证缓存失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 显示缓存统计
   */
  async showCacheStats() {
    try {
      const cachedData = await this.menuCache.loadCachedMenus();
      
      if (!cachedData) {
        logger.info('没有有效的缓存数据');
        return;
      }

      logger.info('=== 缓存统计 ===');
      logger.info(`顶级菜单: ${cachedData.topLevelMenus.length} 个`);
      
      // 统计不同层级的菜单
      const levelStats = {};
      const countMenusByLevel = (menus) => {
        menus.forEach(menu => {
          const level = menu.level || 1;
          levelStats[level] = (levelStats[level] || 0) + 1;
          if (menu.children && menu.children.length > 0) {
            countMenusByLevel(menu.children);
          }
        });
      };

      countMenusByLevel(cachedData.topLevelMenus);
      
      Object.keys(levelStats).sort().forEach(level => {
        logger.info(`L${level} 菜单: ${levelStats[level]} 个`);
      });

      logger.info(`子菜单组: ${cachedData.subMenus.size} 个`);
      logger.info(`缓存元数据: 总菜单 ${cachedData.metadata.totalMenus} 个，最大深度 ${cachedData.metadata.maxDepth} 级`);
      
    } catch (error) {
      logger.error(`显示缓存统计失败: ${error.message}`);
    }
  }

  /**
   * 格式化时间差
   * @param {number} milliseconds - 毫秒数
   * @returns {string} 格式化的时间差
   */
  formatAge(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} 天 ${hours % 24} 小时`;
    } else if (hours > 0) {
      return `${hours} 小时 ${minutes % 60} 分钟`;
    } else if (minutes > 0) {
      return `${minutes} 分钟 ${seconds % 60} 秒`;
    } else {
      return `${seconds} 秒`;
    }
  }
}

module.exports = CacheManager; 