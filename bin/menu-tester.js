#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const path = require('path');
require('dotenv').config();

const MenuTester = require('../src/MenuTester');
const { loadConfig, validateConfig } = require('../src/utils/config');
const { logger } = require('../src/utils/logger');

const program = new Command();

program
  .name('menu-tester')
  .description('AI-powered menu testing tool using Playwright and Midscene.js')
  .version('1.0.0');    

program
  .option('--url <url>', 'Target admin platform URL')
  .option('--token <token>', 'Access token for authentication')
  .option('--config <path>', 'Configuration file path')
  .option('--depth <number>', 'Menu testing depth', '2')
  .option('--timeout <number>', 'Page timeout in milliseconds', '10000')
  .option('--headless [boolean]', 'Run in headless mode', true)
  .option('--output <path>', 'Output directory for results', './menu-test-results')
  .option('--resume <sessionId>', 'Resume interrupted test session')
  .option('--concurrent <number>', 'Number of concurrent operations', '1')
  .option('--retry <number>', 'Number of retries for failed operations', '2')
  .option('--skip <patterns>', 'Skip menu patterns (comma-separated)', 'logout,exit,注销')
  .option('--include <patterns>', 'Include only specified patterns (comma-separated)', '*')
  .option('--token-method <method>', 'Token injection method: cookie|localStorage|header', 'cookie')
  .option('--token-name <name>', 'Token name for injection', 'access_token')
  .option('--screenshots [boolean]', 'Take screenshots during testing', false)
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    try {
      // Load configuration
      let config = {};
      
      if (options.config) {
        config = await loadConfig(options.config);
      }
      
      // Merge CLI options with config file
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

      // Validate configuration
      const validation = validateConfig(finalConfig);
      if (!validation.isValid) {
        logger.error('Configuration validation failed:');
        validation.errors.forEach(error => logger.error(`  - ${error}`));
        process.exit(1);
      }

      // Initialize and run menu tester
      const tester = new MenuTester(finalConfig);
      
      if (options.resume) {
        logger.info(`Resuming test session: ${options.resume}`);
        await tester.resumeSession(options.resume);
      } else {
        logger.info('Starting new menu testing session...');
        await tester.start();
      }

    } catch (error) {
      logger.error('Failed to start menu tester:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('\nReceived SIGINT, gracefully shutting down...');
  process.exit(0);
});

program.parse(process.argv); 