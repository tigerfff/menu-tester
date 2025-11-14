const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../utils/logger');

class MenuCache {
  constructor(config) {
    this.config = config;
    this.cacheDir = path.join(config.output || './menu-test-results', 'menu-cache');
    this.cacheFile = this.getCacheFilePath();
    this.cache = this.createEmptyCache();
  }

  createEmptyCache() {
    return {
      url: this.config.url,
      timestamp: null,
      version: '2.0.0',
      routes: {
        menuRoutes: new Map(),
        routeValidation: new Map(),
        hierarchy: [],
        parameters: new Map()
      },
      metadata: {
        totalRoutes: 0,
        lastUpdated: null,
        routeDiscoveryMode: 'manual'
      }
    };
  }

  getCacheFilePath() {
    const urlHash = this.hashUrl(this.config.url);
    return path.join(this.cacheDir, `menu-cache-${urlHash}.json`);
  }

  hashUrl(url) {
    const cleanUrl = url
      .replace(/^https?:\/\//, '')
      .replace(/:\d+/, '')
      .replace(/[^a-zA-Z0-9]/g, '-')
      .substring(0, 50);
    return cleanUrl;
  }

  async load() {
    try {
      if (!await fs.pathExists(this.cacheFile)) {
        return false;
      }

      const raw = await fs.readJson(this.cacheFile);
      if (raw.url !== this.config.url) {
        logger.debug('路由缓存 URL 不匹配，忽略');
        return false;
      }

      this.cache = this.deserialize(raw);
      return true;
    } catch (error) {
      logger.debug(`加载路由缓存失败: ${error.message}`);
      return false;
    }
  }

  async save() {
    try {
      await fs.ensureDir(this.cacheDir);
      const serialized = this.serialize(this.cache);
      await fs.writeJson(this.cacheFile, serialized, { spaces: 2 });
      return true;
    } catch (error) {
      logger.error(`保存路由缓存失败: ${error.message}`);
      return false;
    }
  }

  serialize(cache) {
    return {
      ...cache,
      routes: {
        menuRoutes: Object.fromEntries(cache.routes.menuRoutes),
        routeValidation: Object.fromEntries(cache.routes.routeValidation),
        hierarchy: cache.routes.hierarchy,
        parameters: Object.fromEntries(cache.routes.parameters)
      }
    };
  }

  deserialize(raw) {
    const cache = this.createEmptyCache();
    cache.url = raw.url;
    cache.timestamp = raw.timestamp || raw.metadata?.lastUpdated || null;
    cache.version = raw.version || cache.version;

    if (raw.routes) {
      if (raw.routes.menuRoutes) {
        cache.routes.menuRoutes = new Map(Object.entries(raw.routes.menuRoutes));
      }
      if (raw.routes.routeValidation) {
        cache.routes.routeValidation = new Map(Object.entries(raw.routes.routeValidation));
      }
      cache.routes.hierarchy = raw.routes.hierarchy || [];
      if (raw.routes.parameters) {
        cache.routes.parameters = new Map(Object.entries(raw.routes.parameters));
      }
    }

    cache.metadata = {
      totalRoutes: cache.routes.menuRoutes.size,
      lastUpdated: raw.metadata?.lastUpdated || raw.timestamp || null,
      routeDiscoveryMode: raw.metadata?.routeDiscoveryMode || 'manual'
    };

    return cache;
  }

  getAllRoutes() {
    const routes = [];
    for (const [menuText, routeInfo] of this.cache.routes.menuRoutes.entries()) {
      routes.push({
        menuText,
        ...routeInfo
      });
    }
    return routes.sort((a, b) => (a.level || 1) - (b.level || 1));
  }

  async recordMenuRoute(menuText, routeUrl, validationRules = {}, level = 1) {
    await this.load();

    const normalizedRoute = this.normalizeRoute(routeUrl);
    const recordedAt = new Date().toISOString();

    this.cache.routes.menuRoutes.set(menuText, {
      url: normalizedRoute,
      originalUrl: routeUrl,
      level,
      recordedAt
    });

    this.cache.routes.routeValidation.set(normalizedRoute, {
      ...validationRules,
      menuText,
      level,
      lastValidated: recordedAt
    });

    this.cache.metadata.totalRoutes = this.cache.routes.menuRoutes.size;
    this.cache.metadata.lastUpdated = recordedAt;

    await this.save();
  }

  async importRoutes(routes, mode = 'merge') {
    if (!Array.isArray(routes)) {
      throw new Error('导入数据格式错误，期望路由数组');
    }

    await this.load();

    if (mode === 'replace') {
      this.cache = this.createEmptyCache();
    }

    let importedCount = 0;
    const now = new Date().toISOString();

    for (const route of routes) {
      if (!route || !route.menuText || !route.url) {
        continue;
      }

      const normalizedRoute = this.normalizeRoute(route.url);
      this.cache.routes.menuRoutes.set(route.menuText, {
        url: normalizedRoute,
        originalUrl: route.url,
        level: route.level || 1,
        recordedAt: route.recordedAt || now
      });

      if (route.validation) {
        this.cache.routes.routeValidation.set(normalizedRoute, {
          ...route.validation,
          menuText: route.menuText,
          level: route.level || 1,
          lastValidated: route.validation.lastValidated || now
        });
      }

      importedCount++;
    }

    this.cache.metadata.totalRoutes = this.cache.routes.menuRoutes.size;
    this.cache.metadata.lastUpdated = now;
    this.cache.metadata.routeDiscoveryMode = 'imported';

    await this.save();
    return importedCount;
  }

  exportRoutes(format = 'json') {
    const routes = this.getAllRoutes();

    if (format === 'csv') {
      const csvHeaders = 'MenuText,URL,Level,RecordedAt\n';
      const csvRows = routes.map(route =>
        `"${route.menuText}","${route.url}",${route.level || 1},"${route.recordedAt || ''}"`
      ).join('\n');
      return csvHeaders + csvRows;
    }

    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      totalRoutes: routes.length,
      sourceUrl: this.cache.url,
      routes
    }, null, 2);
  }

  async validateRoutes(routesToValidate = []) {
    await this.load();
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
  }

  async clearRoutes() {
    await this.load();
    this.cache.routes.menuRoutes.clear();
    this.cache.routes.routeValidation.clear();
    this.cache.routes.hierarchy = [];
    this.cache.routes.parameters.clear();
    this.cache.metadata.totalRoutes = 0;
    this.cache.metadata.lastUpdated = new Date().toISOString();
    await this.save();
  }

  getStats() {
    return {
      totalRoutes: this.cache.routes.menuRoutes.size,
      lastUpdated: this.cache.metadata.lastUpdated,
      routeDiscoveryMode: this.cache.metadata.routeDiscoveryMode
    };
  }

  normalizeRoute(url) {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      let hash = urlObj.hash;

      pathname = pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
      if (hash) {
        hash = hash.split('?')[0];
      }

      return urlObj.origin + pathname + hash;
    } catch (error) {
      return url;
    }
  }

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

