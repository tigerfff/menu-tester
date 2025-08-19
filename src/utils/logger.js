const chalk = require('chalk');

class Logger {
  constructor(verbose = false) {
    this.verbose = verbose;
  }

  setVerbose(verbose) {
    this.verbose = verbose;
  }

  info(message, ...args) {
    console.log(chalk.blue('ℹ'), message, ...args);
  }

  success(message, ...args) {
    console.log(chalk.green('✓'), message, ...args);
  }

  warning(message, ...args) {
    console.log(chalk.yellow('⚠'), message, ...args);
  }

  error(message, ...args) {
    console.error(chalk.red('✗'), message, ...args);
  }

  debug(message, ...args) {
    if (this.verbose) {
      console.log(chalk.gray('🔍'), message, ...args);
    }
  }

  progress(message, ...args) {
    console.log(chalk.cyan('⏳'), message, ...args);
  }

  menu(message, ...args) {
    console.log(chalk.magenta('📋'), message, ...args);
  }

  page(message, ...args) {
    console.log(chalk.blue('📄'), message, ...args);
  }

  bold(text) {
    return chalk.bold(text);
  }

  dim(text) {
    return chalk.dim(text);
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = { Logger, logger }; 