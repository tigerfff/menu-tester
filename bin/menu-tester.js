#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
require('dotenv').config();

const MenuTester = require('../src/MenuTester');
const { loadConfig, validateConfig } = require('../src/utils/config');
const { logger } = require('../src/utils/logger');
const CacheManager = require('../src/utils/cacheManager');

const program = new Command();

program
  .name('menu-tester')
  .description('基于 Playwright 与 Midscene.js 的智能菜单测试工具')
  .version('1.0.0');    

// 主测试命令
program
  .command('test')
  .description('运行菜单测试')
  .option('-C, --config <path>', '配置文件路径', 'hik-config.json')
  .option('--no-cache', '禁用菜单缓存')
  .option('--fresh', '强制重新发现菜单（忽略缓存）')
  .option('--cache-max-age <days>', '缓存最大存活天数', '7')
  .option('--resume <sessionId>', '恢复中断的测试会话')
  .option('--verbose', '开启详细日志')
  .action(async (options) => {  
    try {
      let config = {};
      
      if (options.config) {
        config = await loadConfig(options.config);
      }
      
      // 应用命令行缓存选项
      if (options.noCache) {
        config.useCache = false;
      }
      if (options.fresh) {
        config.forceFreshDiscovery = true;
      }
      if (options.cacheMaxAge) {
        config.cacheMaxAge = parseInt(options.cacheMaxAge) * 24 * 60 * 60 * 1000;
      }
      if (options.verbose) {
        config.verbose = true;
      }

      // 校验配置
      const validation = validateConfig(config);
      if (!validation.isValid) {
        logger.error('配置校验失败:');
        validation.errors.forEach(error => logger.error(`  - ${error}`));
        process.exit(1);
      }

      // 初始化并运行菜单测试
      const tester = new MenuTester(config);
      
      if (options.resume) {
        logger.info(`恢复测试会话: ${options.resume}`);
        await tester.resumeSession(options.resume);
      } else {
        logger.info('开始新的菜单测试会话...');
        await tester.start();
      }

    } catch (error) {
      logger.error('启动菜单测试失败:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// 缓存管理命令
program
  .command('cache')
  .description('管理菜单缓存')
  .option('-i, --info', '显示缓存信息')
  .option('-c, --clear', '清除缓存')
  .option('-v, --validate', '验证缓存完整性')
  .option('-s, --stats', '显示缓存统计')
  .option('-C, --config <path>', '配置文件路径', 'hik-config.json')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const cacheManager = new CacheManager(config);

      if (options.info) {
        await cacheManager.showCacheInfo();
      } else if (options.clear) {
        await cacheManager.clearCache();
      } else if (options.validate) {
        await cacheManager.validateCache();
      } else if (options.stats) {
        await cacheManager.showCacheStats();
      } else {
        // 默认显示缓存信息
        await cacheManager.showCacheInfo();
      }
    } catch (error) {
      logger.error(`缓存管理失败: ${error.message}`);
      process.exit(1);
    }
  });

// 兼容原有的默认命令（保持向后兼容）
program
  .option('--url <url>', '目标管理平台地址')
  .option('--token <token>', '访问令牌（用于鉴权）')
  .option('--config <path>', '配置文件路径')
  .option('--depth <number>', '菜单测试深度', '2')
  .option('--timeout <number>', '页面超时时间（毫秒）', '10000')
  .option('--headless [boolean]', '是否使用无头模式运行', true)
  .option('--output <path>', '结果输出目录', './menu-test-results')
  .option('--resume <sessionId>', '恢复中断的测试会话')
  .option('--concurrent <number>', '并发操作数量', '1')
  .option('--retry <number>', '失败操作的重试次数', '2')
  .option('--skip <patterns>', '跳过的菜单匹配（逗号分隔）', 'logout,exit,注销')
  .option('--include <patterns>', '仅包含的菜单匹配（逗号分隔）', '*')
  .option('--token-method <method>', '令牌注入方式：cookie|localStorage|header', 'cookie')
  .option('--token-name <name>', '令牌注入名称', 'access_token')
  .option('--screenshots [boolean]', '测试过程中是否截图', false)
  .option('--verbose', '开启详细日志')
  .action(async (options) => {
    try {
      // 读取配置
      let config = {};
      
      if (options.config) {
        config = await loadConfig(options.config);
      }
      
      // 合并 CLI 与配置文件
      const finalConfig = {
        ...config,
        ...options,
        depth: parseInt(options.depth),
        timeout: parseInt(options.timeout),
        concurrent: parseInt(options.concurrent),
        retry: parseInt(options.retry),
        headless: options.headless !== 'false',
        screenshots: options.screenshots !== 'false'
      };

      // 校验配置
      const validation = validateConfig(finalConfig);
      if (!validation.isValid) {
        logger.error('配置校验失败:');
        validation.errors.forEach(error => logger.error(`  - ${error}`));
        process.exit(1);
      }

      // 初始化并运行菜单测试
      const tester = new MenuTester(finalConfig);
      
      if (options.resume) {
        logger.info(`恢复测试会话: ${options.resume}`);
        await tester.resumeSession(options.resume);
      } else {
        logger.info('开始新的菜单测试会话...');
        await tester.start();
      }

    } catch (error) {
      logger.error('启动菜单测试失败:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// 处理未捕获异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获异常:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的 Promise 拒绝:', reason);
  process.exit(1);
});

// 优雅退出
process.on('SIGINT', () => {
  logger.info('\n收到 SIGINT 信号，正在优雅退出...');
  process.exit(0);
});

program.parse(process.argv); 