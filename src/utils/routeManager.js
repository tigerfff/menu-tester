const MenuCache = require('../core/MenuCache');
const { logger } = require('./logger');
const fs = require('fs-extra');
const path = require('path');

/**
 * 路由管理器工具类
 */
class RouteManager {
  constructor(config) {
    this.config = config;
    this.menuCache = new MenuCache(config);
  }

  /**
   * 为路由管理加载缓存文件（不要求顶级菜单存在）
   */
  async loadCacheForRoutes() {
    try {
      const fs = require('fs-extra');
      const cacheFile = this.menuCache.cacheFile;
      
      if (!await fs.pathExists(cacheFile)) {
        logger.debug('路由缓存文件不存在');
        return;
      }

      const cacheData = await fs.readJson(cacheFile);
      
      // 检查URL是否匹配
      if (cacheData.url !== this.config.url) {
        logger.debug('缓存URL不匹配，使用空缓存');
        return;
      }

      // 重新构建缓存对象，特别处理路由数据
      this.menuCache.cache = {
        ...cacheData,
        menus: {
          topLevel: cacheData.menus.topLevel || [],
          subMenus: new Map()
        },
        routes: {
          menuRoutes: new Map(),
          routeValidation: new Map(),
          hierarchy: [],
          parameters: new Map()
        }
      };

      // 安全地转换路由数据
      if (cacheData.routes) {
        // 转换 menuRoutes
        if (cacheData.routes.menuRoutes) {
          if (typeof cacheData.routes.menuRoutes === 'object' && !Array.isArray(cacheData.routes.menuRoutes)) {
            this.menuCache.cache.routes.menuRoutes = new Map(Object.entries(cacheData.routes.menuRoutes));
          }
        }
        
        // 转换 routeValidation
        if (cacheData.routes.routeValidation) {
          if (typeof cacheData.routes.routeValidation === 'object' && !Array.isArray(cacheData.routes.routeValidation)) {
            this.menuCache.cache.routes.routeValidation = new Map(Object.entries(cacheData.routes.routeValidation));
          }
        }
        
        // 其他路由数据
        this.menuCache.cache.routes.hierarchy = cacheData.routes.hierarchy || [];
        
        if (cacheData.routes.parameters) {
          if (typeof cacheData.routes.parameters === 'object' && !Array.isArray(cacheData.routes.parameters)) {
            this.menuCache.cache.routes.parameters = new Map(Object.entries(cacheData.routes.parameters));
          }
        }
      }

      const routeCount = this.menuCache.cache.routes.menuRoutes.size;
      if (routeCount > 0) {
        logger.debug(`成功加载路由缓存: ${routeCount} 个路由映射`);
      }
      
    } catch (error) {
      logger.debug(`加载路由缓存失败: ${error.message}`);
    }
  }

  /**
   * 显示路由列表
   */
  async showRoutes() {
    try {
      // 先尝试直接加载缓存文件（针对路由管理）
      await this.loadCacheForRoutes();
      const routes = this.menuCache.getAllRoutes();
      
      if (routes.length === 0) {
        logger.info('没有找到路由缓存');
        logger.info('💡 运行 AI 模式测试来建立路由缓存');
        return;
      }

      logger.info('=== 路由列表 ===');
      
      // 按层级分组显示
      const routesByLevel = {};
      routes.forEach(route => {
        const level = route.level || 1;
        if (!routesByLevel[level]) {
          routesByLevel[level] = [];
        }
        routesByLevel[level].push(route);
      });

      Object.keys(routesByLevel).sort().forEach(level => {
        logger.info(`\n--- L${level} 菜单 (${routesByLevel[level].length} 个) ---`);
        routesByLevel[level].forEach((route, index) => {
          logger.info(`  ${index + 1}. ${route.menuText}`);
          logger.info(`     URL: ${route.url}`);
          logger.info(`     记录时间: ${new Date(route.recordedAt).toLocaleString()}`);
        });
      });

      const stats = this.menuCache.getStats();
      logger.info(`\n📊 统计: 总计 ${stats.totalRoutes} 个路由，${stats.routeDiscoveryMode} 模式`);
      
    } catch (error) {
      logger.error(`显示路由列表失败: ${error.message}`);
    }
  }

  /**
   * 导出路由配置
   * @param {string} outputPath - 输出路径
   * @param {string} format - 导出格式
   */
  async exportRoutes(outputPath, format = 'json') {
    try {
      // 先加载缓存文件
      await this.loadCacheForRoutes();
      const routes = this.menuCache.getAllRoutes();
      
      if (routes.length === 0) {
        logger.warning('没有路由可导出');
        return false;
      }

      const exportData = this.menuCache.exportRoutes(format);
      
      // 确保输出目录存在
      await fs.ensureDir(path.dirname(outputPath));
      
      if (format === 'json') {
        await fs.writeFile(outputPath, exportData, 'utf8');
      } else if (format === 'csv') {
        await fs.writeFile(outputPath, exportData, 'utf8');
      }
      
      logger.success(`路由已导出到: ${outputPath}`);
      logger.info(`格式: ${format.toUpperCase()}, 路由数量: ${routes.length}`);
      
      return true;
      
    } catch (error) {
      logger.error(`导出路由失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 导入路由配置
   * @param {string} inputPath - 输入路径
   * @param {string} mode - 导入模式 'replace' | 'merge'
   */
  async importRoutes(inputPath, mode = 'merge') {
    try {
      // 先加载现有缓存文件
      await this.loadCacheForRoutes();
      
      if (!await fs.pathExists(inputPath)) {
        throw new Error(`文件不存在: ${inputPath}`);
      }

      const fileContent = await fs.readFile(inputPath, 'utf8');
      const ext = path.extname(inputPath).toLowerCase();
      
      let routes = [];
      
      if (ext === '.json') {
        const data = JSON.parse(fileContent);
        routes = data.routes || data; // 支持直接数组或包装对象
      } else if (ext === '.csv') {
        routes = this.parseCSVRoutes(fileContent);
      } else {
        throw new Error(`不支持的文件格式: ${ext}`);
      }
      
      if (!Array.isArray(routes)) {
        throw new Error('导入数据格式错误，期望路由数组');
      }
      
      const importedCount = await this.menuCache.importRoutes(routes, mode);
      
      logger.success(`成功导入 ${importedCount} 个路由`);
      logger.info(`导入模式: ${mode}, 文件: ${inputPath}`);
      
      return importedCount;
      
    } catch (error) {
      logger.error(`导入路由失败: ${error.message}`);
      return 0;
    }
  }

  /**
   * 解析CSV路由文件
   * @param {string} csvContent - CSV内容
   * @returns {Array} 路由数组
   */
  parseCSVRoutes(csvContent) {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV文件格式错误');
    }
    
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const routes = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
      if (values.length >= 2) {
        routes.push({
          menuText: values[0],
          url: values[1],
          level: parseInt(values[2]) || 1,
          recordedAt: values[3] || new Date().toISOString()
        });
      }
    }
    
    return routes;
  }

  /**
   * 验证路由
   */
  async validateRoutes() {
    try {
      // 先加载缓存文件
      await this.loadCacheForRoutes();
      const results = await this.menuCache.validateRoutes();
      
      logger.info('=== 路由验证结果 ===');
      logger.info(`总路由数: ${results.total}`);
      logger.info(`有效路由: ${results.valid}`);
      logger.info(`无效路由: ${results.invalid}`);
      
      if (results.invalid > 0) {
        logger.warning('\n无效路由列表:');
        results.details
          .filter(detail => !detail.valid)
          .forEach(detail => {
            logger.warning(`  ✗ ${detail.menuText}: ${detail.url}`);
          });
      }
      
      if (results.valid === results.total) {
        logger.success('所有路由格式有效 ✓');
      }
      
      return results;
      
    } catch (error) {
      logger.error(`验证路由失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 清除路由缓存
   */
  async clearRoutes() {
    try {
      // 先加载缓存文件
      await this.loadCacheForRoutes();
      await this.menuCache.clearRoutes();
      logger.success('路由缓存已清除');
    } catch (error) {
      logger.error(`清除路由缓存失败: ${error.message}`);
    }
  }

  /**
   * 生成路由模板
   * @param {string} outputPath - 输出路径
   */
  async generateTemplate(outputPath) {
    try {
      const template = {
        exportedAt: new Date().toISOString(),
        description: "菜单路由配置模板",
        totalRoutes: 2,
        sourceUrl: "https://example.com",
        routes: [
          {
            menuText: "示例菜单1",
            url: "https://example.com/page1",
            level: 1,
            recordedAt: new Date().toISOString(),
            validation: {
              pageTitle: "页面1标题",
              expectedElements: ["#main-content"]
            }
          },
          {
            menuText: "示例菜单2",
            url: "https://example.com/page2",
            level: 2,
            recordedAt: new Date().toISOString(),
            validation: {
              pageTitle: "页面2标题",
              expectedElements: ["#sidebar", ".content"]
            }
          }
        ]
      };
      
      await fs.ensureDir(path.dirname(outputPath));
      await fs.writeJson(outputPath, template, { spaces: 2 });
      
      logger.success(`路由模板已生成: ${outputPath}`);
      logger.info('请根据实际情况修改模板中的路由信息');
      
    } catch (error) {
      logger.error(`生成模板失败: ${error.message}`);
    }
  }

  /**
   * 显示路由统计信息
   */
  async showStats() {
    try {
      // 先加载缓存文件
      await this.loadCacheForRoutes();
      const stats = this.menuCache.getStats();
      const routes = this.menuCache.getAllRoutes();
      
      logger.info('=== 路由统计 ===');
      logger.info(`总路由数: ${stats.totalRoutes}`);
      logger.info(`发现模式: ${stats.routeDiscoveryMode}`);
      logger.info(`最后更新: ${stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleString() : '未知'}`);
      
      if (routes.length > 0) {
        // 按层级统计
        const levelStats = {};
        routes.forEach(route => {
          const level = route.level || 1;
          levelStats[level] = (levelStats[level] || 0) + 1;
        });
        
        logger.info('\n按层级分布:');
        Object.keys(levelStats).sort().forEach(level => {
          logger.info(`  L${level}: ${levelStats[level]} 个路由`);
        });
        
        // 最近记录的路由
        const recentRoutes = routes
          .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
          .slice(0, 3);
          
        logger.info('\n最近记录的路由:');
        recentRoutes.forEach(route => {
          logger.info(`  - ${route.menuText} (${new Date(route.recordedAt).toLocaleString()})`);
        });
      }
      
    } catch (error) {
      logger.error(`显示统计信息失败: ${error.message}`);
    }
  }
}

module.exports = RouteManager; 