const fs = require('fs-extra');
const path = require('path');
const { logger } = require('./logger');
const { applyEnvFromConfig } = require('./envConfig');

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
    
    // 应用配置文件中的环境变量设置
    applyEnvFromConfig(config);
    
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

  // Optional inline routes validation
  if (config.routes !== undefined) {
    if (!Array.isArray(config.routes)) {
      errors.push('routes must be an array when provided');
    } else {
      const invalid = config.routes.find(r => !r || typeof r !== 'object' || !r.menuText || !r.url);
      if (invalid) {
        errors.push('each route item must include menuText and url');
      }
    }
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
    validateRoutePages: true,          // 是否验证路由页面内容
    // routes: []                      // 可选：内联路由，提供后在路由模式下优先使用
    
    // 页面断言配置
    pageAssertions: {
      enabled: true,                   // 是否启用页面断言
      strictMode: true,                // 严格模式，更严格的空白页面检测
      minContentLength: 100,           // 最小内容长度（字符数）
      minVisibleElements: 3,           // 最小可见元素数量
      timeoutMs: 5000,                 // 断言超时时间
      
      // 空白页面检测配置
      blankPageDetection: {
        enabled: true,
        checkTitle: true,              // 检查页面标题
        checkMainContent: true,        // 检查主内容区域
        checkNavigation: true,         // 检查导航元素
        checkForms: true,              // 检查表单元素
        minTextLength: 50              // 主内容区域最小文本长度
      },
      
      // 缺省状态检测配置
      emptyStateDetection: {
        enabled: true,
        keywords: [                    // 缺省状态关键词
          '暂无数据', '无数据', '没有数据', '数据为空',
          '加载失败', '请求失败', '网络错误', '服务异常',
          '暂无内容', '无内容', '内容为空', '页面不存在',
          '404', '500', '403', '401', 'Not Found',
          'No Data', 'No Content', 'Empty', 'Loading Error'
        ],
        selectors: [                   // 常见缺省状态的选择器
          '.empty-state', '.no-data', '.empty-content',
          '.error-page', '.not-found', '.loading-error',
          '.el-empty', '.ant-empty', '.empty-placeholder'
        ]
      },
      
      // 自定义断言规则
      customRules: [
        // 示例：检查特定元素是否存在
        // {
        //   name: 'hasMainTable',
        //   type: 'element_exists',
        //   selector: 'table.main-table, .data-table',
        //   required: true,
        //   message: '页面缺少主要数据表格'
        // },
        // {
        //   name: 'noErrorMessages',
        //   type: 'element_not_exists',
        //   selector: '.error-message, .alert-danger',
        //   required: true,
        //   message: '页面显示错误信息'
        // }
      ],

      // Midscene AI 文本检测配置
      midsceneTextCheck: {
        enabled: true,
        timeout: 5000,
        checks: [
          {
            name: "非白屏检查",
            type: "aiBoolean",
            prompt: "页面是否是白屏、空白页面或只显示加载状态？",
            expectation: false,
            failOnTrue: true,
            failFast: false,
            timeout: 5000,
            failureMessage: "检测到白屏或空白页面"
          },
          {
            name: "无权限错误检查",
            type: "aiBoolean",
            prompt: "页面是否显示权限相关的错误信息？比如'没有权限'、'权限不足'、'访问被拒绝'、'暂无视频查看权限，请联系企业管理员开通'等",
            expectation: false,
            failOnTrue: true,
            failFast: true,
            timeout: 5000,
            failureMessage: "检测到权限错误"
          },
          {
            name: "无接口错误检查",
            type: "aiBoolean",
            prompt: "页面是否显示接口错误或网络错误？比如'请求失败'、'加载失败'、'网络错误'、'服务异常'、'连接超时'等",
            expectation: false,
            failOnTrue: true,
            failFast: false,
            timeout: 5000,
            failureMessage: "检测到接口或网络错误"
          },
          {
            name: "有效业务内容检查",
            type: "aiBoolean",
            prompt: "页面是否包含有效的业务内容？（有实际的数据、表格、表单、视频等，不是错误页面、空状态页面或纯加载页面）",
            expectation: true,
            failOnFalse: true,
            failFast: false,
            timeout: 5000,
            failureMessage: "页面缺少有效的业务内容"
          }
        ]
      }
    }
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