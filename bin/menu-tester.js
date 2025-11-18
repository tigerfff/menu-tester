#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
require('dotenv').config();

const MenuTester = require('../src/MenuTester');
const { loadConfig, validateConfig } = require('../src/utils/config');
const { logger } = require('../src/utils/logger');
const RouteManager = require('../src/utils/routeManager');
const StaticWebServer = require('../src/utils/webServer');

const program = new Command();

program
  .name('menu-tester')
  .description('基于路由清单的菜单回归测试 CLI 工具')
  .version('1.0.0');    

// 主测试命令
program
  .command('test')
  .description('运行菜单测试')
  .option('-C, --config <path>', '配置文件路径', 'hik-config.json')
  .option('--verbose', '开启详细日志')
  .action(async (options) => {  
    try {
      let config = {};
      
      if (options.config) {
        config = await loadConfig(options.config);
      }
      
      // 应用命令行选项
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

      // 显示测试模式
      logger.info('🚀 启动菜单测试（路由模式）');

      // 初始化并运行菜单测试
      const tester = new MenuTester(config);

      logger.info('开始新的菜单测试会话...');
      await tester.start();

    } catch (error) {
      logger.error('启动菜单测试失败:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// 路由管理命令
program
  .command('routes')
  .description('管理路由配置')
  .option('-l, --list', '显示路由列表')
  .option('-e, --export <file>', '导出路由到文件')
  .option('-i, --import <file>', '从文件导入路由')
  .option('-v, --validate', '验证路由有效性')
  .option('-c, --clear', '清除路由缓存')
  .option('-s, --stats', '显示路由统计')
  .option('-t, --template <file>', '生成路由模板文件')
  .option('--format <format>', '导出格式 (json|csv)', 'json')
  .option('--mode <mode>', '导入模式 (merge|replace)', 'merge')
  .option('-C, --config <path>', '配置文件路径', 'hik-config.json')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const routeManager = new RouteManager(config);

      if (options.list) {
        await routeManager.showRoutes();
      } else if (options.export) {
        await routeManager.exportRoutes(options.export, options.format);
      } else if (options.import) {
        await routeManager.importRoutes(options.import, options.mode);
      } else if (options.validate) {
        await routeManager.validateRoutes();
      } else if (options.clear) {
        await routeManager.clearRoutes();
      } else if (options.stats) {
        await routeManager.showStats();
      } else if (options.template) {
        await routeManager.generateTemplate(options.template);
      } else {
        // 默认显示路由列表
        await routeManager.showRoutes();
      }
    } catch (error) {
      logger.error(`路由管理失败: ${error.message}`);
      process.exit(1);
    }
  });

// 兼容原有的默认命令（保持向后兼容）
program
  .option('--url <url>', '目标管理平台地址')
  .option('--token <token>', '访问令牌（用于鉴权）')
  .option('--config <path>', '配置文件路径')
  .option('--timeout <number>', '页面超时时间（毫秒）', '10000')
  .option('--headless [boolean]', '是否使用无头模式运行', true)
  .option('--output <path>',   '结果输出目录', './menu-test-results')
  .option('--retry <number>', '失败操作的重试次数', '2')
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
        timeout: parseInt(options.timeout),
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
      
      logger.info('开始新的菜单测试会话...');
      await tester.start();

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

// Web 配置界面命令
program
  .command('serve')
  .description('启动 Web 配置界面')
  .option('-p, --port <port>', '端口号', '3000')
  .option('--no-open', '不自动打开浏览器')
  .action(async (options) => {
    try {
      logger.info(chalk.blue('🚀 正在启动 Web 配置界面...'));
      
      const server = new StaticWebServer();
      let port = parseInt(options.port);
      
      // 查找可用端口
      if (port === 3000) {
        port = await StaticWebServer.findAvailablePort(port);
      }
      
      await server.start(port, options.open);
      
      // 保持进程运行
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', process.exit.bind(process, 0));
      
    } catch (error) {
      logger.error('启动 Web 服务器失败:', error.message);
      process.exit(1);
    }
  });

// 版本和帮助信息增强
program
  .command('info')
  .description('显示工具信息和使用指南')
  .action(() => {
    console.log(chalk.green('🔍 Midscene Menu Tester'));
    console.log(chalk.gray('Route-driven menu testing tool'));
    console.log('');
    console.log(chalk.blue('📚 使用方法:'));
    console.log('  menu-tester test --config config.json  # 运行测试');
    console.log('  menu-tester serve                      # 启动 Web 配置界面');
    console.log('  menu-tester routes list                # 管理路由');
    console.log('');
    console.log(chalk.blue('🌐 Web 界面:'));
    console.log('  运行 "menu-tester serve" 通过浏览器可视化配置');
    console.log('');
    console.log(chalk.blue('📖 文档:'));
    console.log('  https://github.com/hik-cloud/midscene-menu-tester');
  });

// 优雅退出
process.on('SIGINT', () => {
  logger.info('\n收到 SIGINT 信号，正在优雅退出...');
  process.exit(0);
});

program.parse(process.argv); 