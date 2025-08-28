const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../utils/logger');

class ProgressTracker {
  constructor(config) {
    this.config = config;
    this.sessionId = this.generateSessionId();
    this.outputDir = config.output || './menu-test-results';
    this.progressFile = path.join(this.outputDir, `session-${this.sessionId}.json`);
    this.startTime = Date.now();
    
    this.progress = {
      sessionId: this.sessionId,
      startTime: this.startTime,
      config: this.sanitizeConfig(config),
      status: 'initializing',
      currentStep: null,
      totalMenus: 0,
      completedMenus: 0,
      failedMenus: 0,
      skippedMenus: 0,
      menus: {},
      errors: [],
      timestamps: {
        started: new Date().toISOString(),
        updated: new Date().toISOString(),
        completed: null
      }
    };
  }

  /**
   * Generate unique session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  /**
   * Sanitize config for saving (remove sensitive data)
   * @param {object} config - Configuration object
   * @returns {object} Sanitized config
   */
  sanitizeConfig(config) {
    const sanitized = { ...config };
    
    // Remove sensitive information
    if (sanitized.token) {
      sanitized.token = sanitized.token.substring(0, 10) + '...';
    }
    
    return sanitized;
  }

  /**
   * Initialize progress tracking
   * @param {Array} menus - List of menus to be tested
   */
  async initialize(menus) {
    try {
      // Ensure output directory exists
      await fs.ensureDir(this.outputDir);
      
      // Initialize menu tracking
      this.progress.totalMenus = menus.length;
      this.progress.status = 'running';
      this.progress.currentStep = 'menu_discovery';
      
      // Create menu tracking entries
      menus.forEach(menu => {
        this.progress.menus[menu.id] = {
          id: menu.id,
          text: menu.text,
          level: menu.level,
          isExpandable: menu.isExpandable,
          status: 'pending',
          attempts: 0,
          error: null,
          startTime: null,
          endTime: null,
          duration: null,
          screenshot: null
        };
      });
      
      await this.saveProgress();
      
      logger.info(`进度追踪已初始化。会话ID: ${this.sessionId}`);
      logger.info(`本次共需测试 ${menus.length} 个菜单项`);
      
    } catch (error) {
      logger.error(`进度追踪初始化失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update current step
   * @param {string} step - Current step name
   * @param {object} details - Additional step details
   */
  async updateStep(step, details = {}) {
    this.progress.currentStep = step;
    this.progress.timestamps.updated = new Date().toISOString();
    
    if (details) {
      this.progress.stepDetails = details;
    }
    
    await this.saveProgress();
    logger.debug(`步骤已更新: ${step}`);
  }

  /**
   * Mark menu as started
   * @param {string} menuId - Menu ID
   */
  async startMenu(menuId) {
    if (this.progress.menus[menuId]) {
      this.progress.menus[menuId].status = 'running';
      this.progress.menus[menuId].startTime = Date.now();
      this.progress.menus[menuId].attempts += 1;
      
      await this.saveProgress();
      
      logger.menu(`开始测试菜单: ${this.progress.menus[menuId].text}`);
    }
  }

  /**
   * Mark menu as completed
   * @param {string} menuId - Menu ID
   * @param {object} result - Test result
   */
  async completeMenu(menuId, result) {
    if (this.progress.menus[menuId]) {
      const menu = this.progress.menus[menuId];
      
      menu.status = result.success ? 'completed' : 'failed';
      menu.endTime = Date.now();
      menu.duration = menu.endTime - menu.startTime;
      menu.error = result.error || null;
      menu.screenshot = result.screenshot || null;
      
      if (result.success) {
        this.progress.completedMenus += 1;
        logger.success(`✓ 菜单完成: ${menu.text} (${menu.duration}ms)`);
      } else {
        this.progress.failedMenus += 1;
        logger.error(`✗ 菜单失败: ${menu.text} - ${result.error}`);
        
        // Track error
        this.progress.errors.push({
          menuId,
          menuText: menu.text,
          error: result.error,
          timestamp: new Date().toISOString(),
          attempt: menu.attempts
        });
      }
      
      await this.saveProgress();
      this.displayProgress();
    }
  }

  /**
   * Mark menu as skipped
   * @param {string} menuId - Menu ID
   * @param {string} reason - Skip reason
   */
  async skipMenu(menuId, reason = 'unknown') {
    if (this.progress.menus[menuId]) {
      this.progress.menus[menuId].status = 'skipped';
      this.progress.menus[menuId].error = reason;
      this.progress.skippedMenus += 1;
      
      await this.saveProgress();
      
      logger.warning(`已跳过菜单: ${this.progress.menus[menuId].text} - ${reason}`);
    }
  }

  /**
   * Complete the entire session
   * @param {object} summary - Final summary
   */
  async complete(summary = {}) {
    this.progress.status = 'completed';
    this.progress.timestamps.completed = new Date().toISOString();
    this.progress.duration = Date.now() - this.startTime;
    this.progress.summary = summary;
    
    await this.saveProgress();
    
    logger.success(`\n会话完成！总耗时: ${this.formatDuration(this.progress.duration)}`);
    this.displayFinalSummary();
  }

  /**
   * Mark session as failed
   * @param {Error} error - Error that caused failure
   */
  async fail(error) {
    this.progress.status = 'failed';
    this.progress.timestamps.completed = new Date().toISOString();
    this.progress.duration = Date.now() - this.startTime;
    this.progress.error = error.message;
    
    await this.saveProgress();
    
    logger.error(`会话失败: ${error.message}`);
  }

  /**
   * Save progress to file
   */
  async saveProgress() {
    try {
      await fs.writeJson(this.progressFile, this.progress, { spaces: 2 });
    } catch (error) {
      logger.debug(`保存进度失败: ${error.message}`);
    }
  }

  /**
   * Load progress from existing session
   * @param {string} sessionId - Session ID to resume
   * @returns {object} Loaded progress or null
   */
  async loadProgress(sessionId) {
    try {
      const progressFile = path.join(this.outputDir, `session-${sessionId}.json`);
      
      if (!await fs.pathExists(progressFile)) {
        throw new Error(`未找到会话: ${sessionId}`);
      }
      
      const loadedProgress = await fs.readJson(progressFile);
      
      // Validate progress structure
      if (!loadedProgress.sessionId || !loadedProgress.menus) {
        throw new Error('会话文件格式不正确');
      }
      
      return loadedProgress;
      
    } catch (error) {
      logger.error(`加载会话失败: ${error.message}`);
      return null;
    }
  }

  /**
   * Get resumable menus from loaded progress
   * @param {object} loadedProgress - Loaded progress data
   * @returns {Array} Array of menus that need to be tested
   */
  getResumableMenus(loadedProgress) {
    const resumableMenus = [];
    
    Object.values(loadedProgress.menus).forEach(menu => {
      if (menu.status === 'pending' || menu.status === 'running') {
        resumableMenus.push({
          id: menu.id,
          text: menu.text,
          level: menu.level,
          isExpandable: menu.isExpandable,
          tested: false,
          success: null,
          error: null,
          children: []
        });
      }
    });
    
    return resumableMenus;
  }

  /**
   * Resume from existing progress
   * @param {object} loadedProgress - Loaded progress data
   */
  resumeFromProgress(loadedProgress) {
    this.progress = {
      ...loadedProgress,
      status: 'running',
      timestamps: {
        ...loadedProgress.timestamps,
        resumed: new Date().toISOString(),
        updated: new Date().toISOString()
      }
    };
    
    this.sessionId = loadedProgress.sessionId;
    this.progressFile = path.join(this.outputDir, `session-${this.sessionId}.json`);
    
    logger.info(`已恢复会话: ${this.sessionId}`);
    this.displayProgress();
  }

  /**
   * Display current progress
   */
  displayProgress() {
    const total = this.progress.totalMenus;
    const completed = this.progress.completedMenus;
    const failed = this.progress.failedMenus;
    const skipped = this.progress.skippedMenus;
    const pending = total - completed - failed - skipped;
    
    const percentage = total > 0 ? Math.round((completed + failed + skipped) / total * 100) : 0;
    
    const progressBar = this.createProgressBar(percentage);
    
    logger.info(`\n进度 [${progressBar}] ${percentage}%`);
    logger.info(`  已完成: ${completed}, 失败: ${failed}, 已跳过: ${skipped}, 待测: ${pending}`);
    
    if (this.progress.currentStep) {
      logger.info(`  当前步骤: ${this.progress.currentStep}`);
    }
  }

  /**
   * Display final summary
   */
  displayFinalSummary() {
    const { totalMenus, completedMenus, failedMenus, skippedMenus, duration } = this.progress;
    const successRate = totalMenus > 0 ? Math.round(completedMenus / totalMenus * 100) : 0;
    
    logger.info('\n' + '='.repeat(50));
    logger.info(logger.bold('菜单测试汇总'));
    logger.info('='.repeat(50));
    logger.info(`菜单总数: ${totalMenus}`);
    logger.info(`✓ 已完成: ${completedMenus}`);
    logger.info(`✗ 失败: ${failedMenus}`);
    logger.info(`⊝ 已跳过: ${skippedMenus}`);
    logger.info(`成功率: ${successRate}%`);
    logger.info(`总耗时: ${this.formatDuration(duration)}`);
    logger.info(`会话ID: ${this.sessionId}`);
    logger.info('='.repeat(50));
    
    if (this.progress.errors.length > 0) {
      logger.info('\n错误明细:');
      this.progress.errors.forEach((error, index) => {
        logger.error(`  ${index + 1}. ${error.menuText}: ${error.error}`);
      });
    }
  }

  /**
   * Create progress bar string
   * @param {number} percentage - Progress percentage
   * @returns {string} Progress bar
   */
  createProgressBar(percentage, width = 20) {
    const filled = Math.round(width * percentage / 100);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Format duration in human readable format
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}毫秒`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}秒`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}分钟`;
    return `${(ms / 3600000).toFixed(1)}小时`;
  }

  /**
   * Get current session status
   * @returns {object} Session status
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      status: this.progress.status,
      currentStep: this.progress.currentStep,
      progress: {
        total: this.progress.totalMenus,
        completed: this.progress.completedMenus,
        failed: this.progress.failedMenus,
        skipped: this.progress.skippedMenus,
        percentage: this.progress.totalMenus > 0 
          ? Math.round((this.progress.completedMenus + this.progress.failedMenus + this.progress.skippedMenus) / this.progress.totalMenus * 100)
          : 0
      },
      duration: Date.now() - this.startTime,
      errors: this.progress.errors.length
    };
  }

  /**
   * List available sessions for resuming
   * @returns {Array} Array of available sessions
   */
  async listAvailableSessions() {
    try {
      if (!await fs.pathExists(this.outputDir)) {
        return [];
      }
      
      const files = await fs.readdir(this.outputDir);
      const sessionFiles = files.filter(file => file.startsWith('session-') && file.endsWith('.json'));
      
      const sessions = [];
      
      for (const file of sessionFiles) {
        try {
          const progressFile = path.join(this.outputDir, file);
          const progress = await fs.readJson(progressFile);
          
          if (progress.status !== 'completed') {
            sessions.push({
              sessionId: progress.sessionId,
              status: progress.status,
              startTime: progress.timestamps.started,
              totalMenus: progress.totalMenus,
              completedMenus: progress.completedMenus,
              config: progress.config
            });
          }
        } catch (error) {
          logger.debug(`Failed to read session file ${file}: ${error.message}`);
        }
      }
      
      return sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      
    } catch (error) {
      logger.error(`Failed to list sessions: ${error.message}`);
      return [];
    }
  }

  /**
   * Clean up old completed sessions
   * @param {number} keepDays - Number of days to keep completed sessions
   */
  async cleanupOldSessions(keepDays = 7) {
    try {
      if (!await fs.pathExists(this.outputDir)) {
        return;
      }
      
      const cutoffTime = Date.now() - (keepDays * 24 * 60 * 60 * 1000);
      const files = await fs.readdir(this.outputDir);
      const sessionFiles = files.filter(file => file.startsWith('session-') && file.endsWith('.json'));
      
      let cleaned = 0;
      
      for (const file of sessionFiles) {
        try {
          const progressFile = path.join(this.outputDir, file);
          const progress = await fs.readJson(progressFile);
          
          if (progress.status === 'completed' && 
              progress.timestamps.completed && 
              new Date(progress.timestamps.completed).getTime() < cutoffTime) {
            
            await fs.remove(progressFile);
            cleaned++;
          }
        } catch (error) {
          logger.debug(`Failed to process session file ${file}: ${error.message}`);
        }
      }
      
      if (cleaned > 0) {
        logger.info(`Cleaned up ${cleaned} old session files`);
      }
      
    } catch (error) {
      logger.debug(`Session cleanup failed: ${error.message}`);
    }
  }
}

module.exports = ProgressTracker; 