const fs = require('fs-extra');
const path = require('path');
const { logger } = require('./logger');

/**
 * Load configuration from file
 * @param {string} configPath - Path to configuration file
 * @returns {object} Configuration object
 */
async function loadConfig(configPath) {
  try {
    const fullPath = path.resolve(configPath);
    
    if (!await fs.pathExists(fullPath)) {
      throw new Error(`Configuration file not found: ${fullPath}`);
    }

    const ext = path.extname(fullPath).toLowerCase();
    let config;

    if (ext === '.json') {
      config = await fs.readJson(fullPath);
    } else if (ext === '.js') {
      config = require(fullPath);
    } else {
      throw new Error(`Unsupported configuration file format: ${ext}`);
    }

    logger.debug(`Loaded configuration from: ${fullPath}`);
    return config;
  } catch (error) {
    throw new Error(`Failed to load configuration: ${error.message}`);
  }
}

/**
 * Validate configuration object
 * @param {object} config - Configuration to validate
 * @returns {object} Validation result with isValid and errors
 */
function validateConfig(config) {
  const errors = [];

  // Required fields
  if (!config.url) {
    errors.push('URL is required');
  }

  if (!config.token && !process.env.ACCESS_TOKEN) {
    errors.push('Access token is required (via --token option or ACCESS_TOKEN environment variable)');
  }

  // URL validation
  if (config.url) {
    try {
      new URL(config.url);
    } catch (error) {
      errors.push('Invalid URL format');
    }
  }

  // Numeric validations
  if (config.depth && (isNaN(config.depth) || config.depth < 1 || config.depth > 5)) {
    errors.push('Depth must be a number between 1 and 5');
  }

  if (config.timeout && (isNaN(config.timeout) || config.timeout < 1000 || config.timeout > 30000)) {
    errors.push('Timeout must be a number between 1000 and 30000 milliseconds');
  }

  if (config.concurrent && (isNaN(config.concurrent) || config.concurrent < 1 || config.concurrent > 10)) {
    errors.push('Concurrent must be a number between 1 and 10');
  }

  if (config.retry && (isNaN(config.retry) || config.retry < 0 || config.retry > 5)) {
    errors.push('Retry must be a number between 0 and 5');
  }

  // Token method validation
  const validTokenMethods = ['cookie', 'localStorage', 'header'];
  if (config.tokenMethod && !validTokenMethods.includes(config.tokenMethod)) {
    errors.push(`Token method must be one of: ${validTokenMethods.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get default configuration
 * @returns {object} Default configuration
 */
function getDefaultConfig() {
  return {
    depth: 2,
    timeout: 6000,
    headless: true,
    output: './menu-test-results',
    concurrent: 1,
    retry: 2,
    skip: 'logout,exit,注销',
    include: '*',
    tokenMethod: 'cookie',
    tokenName: 'access_token',
    screenshots: false,
    verbose: false,
    // 新增缓存相关配置
    useCache: true,                    // 是否使用菜单缓存
    cacheMaxAge: 7 * 24 * 60 * 60 * 1000, // 缓存最大存活时间（默认7天）
    forceFreshDiscovery: false,        // 是否强制重新发现菜单（忽略缓存）
    // 新增路由模式相关配置
    testMode: 'hybrid',                // 测试模式: 'ai' | 'route' | 'hybrid'
    hybridVerifyNew: true,             // 混合模式是否验证新菜单
    autoTestNewMenus: true,            // 是否自动测试新发现的菜单
    routeTimeout: 5000,                // 路由测试超时时间
    validateRoutePages: true           // 是否验证路由页面内容
  };
}

/**
 * Merge configuration with defaults
 * @param {object} config - User configuration
 * @returns {object} Merged configuration
 */
function mergeWithDefaults(config) {
  const defaults = getDefaultConfig();
  return { ...defaults, ...config };
}

module.exports = {
  loadConfig,
  validateConfig,
  getDefaultConfig,
  mergeWithDefaults
}; 