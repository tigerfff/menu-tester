const fs = require('fs').promises;
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const { logger } = require('../utils/logger');

/**
 * 截图对比器
 * 支持菜单模式和路由模式的截图对比
 * 使用统一的URL-based key生成策略
 */
class ScreenshotComparator {
  constructor(config) {
    this.config = config;
    this.comparisonConfig = config.screenshotComparison || {};
    
    // 配置项
    this.enabled = this.comparisonConfig.enabled !== false; // 默认启用
    this.threshold = this.comparisonConfig.threshold || 0.1; // 差异阈值 0-1
    this.baselineDir = this.comparisonConfig.baselineDir || './screenshots/baseline';
    this.diffDir = this.comparisonConfig.diffDir || './screenshots/diff';
    this.updateBaseline = this.comparisonConfig.updateBaseline || false;
    this.failOnDiff = this.comparisonConfig.failOnDiff || false;
    
    logger.debug(`ScreenshotComparator initialized: enabled=${this.enabled}, threshold=${this.threshold}`);
  }

  /**
   * 标准化URL（与MenuCache保持一致）
   * @param {string} url - 原始URL
   * @returns {string} 标准化后的key
   */
  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      let hash = urlObj.hash;
      
      // 标准化路径
      pathname = pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
      
      // 保留主要的hash路由，移除临时参数
      if (hash) {
        hash = hash.split('?')[0]; // 移除hash中的查询参数
      }
      
      // 生成短key：只使用路径+hash
      const fullPath = pathname + hash;
      const key = fullPath
        .replace(/^\//, '')           // 去掉开头的 /
        .replace(/\//g, '-')          // / 替换为 -
        .replace(/[#?&=]/g, '-')      // 特殊字符替换为 -
        .replace(/\./g, '-')          // . 替换为 -
        .replace(/-+/g, '-')          // 多个 - 合并
        .replace(/^-|-$/g, '')        // 去掉首尾的 -
        .toLowerCase();
        
      return key || 'home';
        
    } catch (error) {
      logger.warning(`URL标准化失败: ${url}, ${error.message}`);
      // 降级方案：使用原始字符串
      return url.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-').toLowerCase();
    }
  }

  /**
   * 生成统一的截图key（菜单模式和路由模式通用）
   * @param {object} menu - 菜单项（包含 url 或 id，可能包含 scenario 场景信息）
   * @returns {string} 唯一标识
   */
  getScreenshotKey(menu) {
    // 优先使用URL生成key（两种模式通用）
    let baseKey;
    if (menu.url) {
      const urlKey = this.normalizeUrl(menu.url);
      logger.debug(`生成截图key from URL: ${menu.url} -> ${urlKey}`);
      baseKey = urlKey;
    }
    // 降级方案1：使用菜单ID
    else if (menu.id && !menu.id.startsWith('route-')) {
      logger.debug(`生成截图key from ID: ${menu.id}`);
      baseKey = menu.id.toLowerCase();
    }
    // 降级方案2：使用文本
    else {
      const textKey = menu.text.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-').toLowerCase();
      logger.debug(`生成截图key from text: ${menu.text} -> ${textKey}`);
      baseKey = textKey;
    }
    
    // 如果有场景信息，添加到 key 中（确保不同场景的截图有独立的基线）
    if (menu.scenario && menu.scenario !== 'default') {
      const scenarioKey = menu.scenario.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-').toLowerCase().substring(0, 50);
      baseKey = `${baseKey}-${scenarioKey}`;
      logger.debug(`添加场景信息到 key: ${baseKey}`);
    }
    
    return baseKey;
  }

  /**
   * 获取基线截图路径
   */
  getBaselinePath(key) {
    return path.join(this.baselineDir, `${key}.png`);
  }

  /**
   * 获取差异图路径
   */
  getDiffPath(key) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(this.diffDir, `${key}-diff-${timestamp}.png`);
  }

  /**
   * 检查基线是否存在
   */
  async baselineExists(key) {
    try {
      const baselinePath = this.getBaselinePath(key);
      await fs.access(baselinePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 保存截图为基线
   * @param {string} key - 截图标识
   * @param {Buffer} screenshot - 截图 buffer
   */
  async saveBaseline(key, screenshot) {
    const baselinePath = this.getBaselinePath(key);
    await fs.mkdir(this.baselineDir, { recursive: true });
    await fs.writeFile(baselinePath, screenshot);
    logger.info(`✅ 已保存基线截图: ${key}`);
    return baselinePath;
  }

  /**
   * 加载基线截图
   * @param {string} key - 截图标识
   * @returns {Buffer} 基线截图 buffer
   */
  async loadBaseline(key) {
    const baselinePath = this.getBaselinePath(key);
    return await fs.readFile(baselinePath);
  }

  /**
   * 对比两张截图
   * @param {Buffer} screenshot1 - 基线截图
   * @param {Buffer} screenshot2 - 当前截图
   * @returns {Object} 对比结果
   */
  async compareScreenshots(screenshot1, screenshot2) {
    try {
      const img1 = PNG.sync.read(screenshot1);
      const img2 = PNG.sync.read(screenshot2);
      
      // 检查尺寸是否一致
      if (img1.width !== img2.width || img1.height !== img2.height) {
        return {
          match: false,
          error: '截图尺寸不一致',
          dimensions: {
            baseline: { width: img1.width, height: img1.height },
            current: { width: img2.width, height: img2.height }
          }
        };
      }
      
      const { width, height } = img1;
      const diff = new PNG({ width, height });
      
      // 进行像素级对比
      const numDiffPixels = pixelmatch(
        img1.data, 
        img2.data, 
        diff.data, 
        width, 
        height,
        { 
          threshold: this.threshold,
          includeAA: false, // 忽略抗锯齿差异
          alpha: 0.1,
          diffColor: [255, 0, 0] // 差异用红色标注
        }
      );
      
      const totalPixels = width * height;
      const diffPercentage = (numDiffPixels / totalPixels) * 100;
      const isMatch = diffPercentage < (this.threshold * 100);
      
      return {
        match: isMatch,
        diffPixels: numDiffPixels,
        totalPixels,
        diffPercentage: diffPercentage.toFixed(2),
        diffImage: PNG.sync.write(diff), // 差异图
        dimensions: { width, height }
      };
    } catch (error) {
      throw new Error(`截图对比失败: ${error.message}`);
    }
  }

  /**
   * 保存差异图
   * @param {string} key - 截图标识
   * @param {Buffer} diffImage - 差异图 buffer
   */
  async saveDiffImage(key, diffImage) {
    const diffPath = this.getDiffPath(key);
    await fs.mkdir(this.diffDir, { recursive: true });
    await fs.writeFile(diffPath, diffImage);
    logger.warning(`⚠️  已保存差异图: ${diffPath}`);
    return diffPath;
  }

  /**
   * 主要的截图对比入口
   * @param {object} menu - 菜单项
   * @param {Buffer} currentScreenshot - 当前截图
   * @returns {Object} 对比结果
   */
  async compareOrSaveBaseline(menu, currentScreenshot) {
    if (!this.enabled) {
      return {
        type: 'disabled',
        message: '截图对比功能未启用'
      };
    }

    const key = this.getScreenshotKey(menu);
    
    try {
      // 检查是否存在基线
      const hasBaseline = await this.baselineExists(key);
      
      // 如果配置了更新基线，或基线不存在
      if (this.updateBaseline || !hasBaseline) {
        const baselinePath = await this.saveBaseline(key, currentScreenshot);
        return {
          type: 'baseline',
          key,
          message: hasBaseline ? '已更新基线截图' : '已创建基线截图',
          path: baselinePath,
          isNew: !hasBaseline
        };
      }
      
      // 加载基线并对比
      const baseline = await this.loadBaseline(key);
      const comparisonResult = await this.compareScreenshots(baseline, currentScreenshot);
      
      // 如果有差异，保存差异图
      if (!comparisonResult.match && comparisonResult.diffImage) {
        const diffPath = await this.saveDiffImage(key, comparisonResult.diffImage);
        comparisonResult.diffPath = diffPath;
      }
      
      return {
        type: 'comparison',
        key,
        ...comparisonResult,
        passed: comparisonResult.match
      };
      
    } catch (error) {
      logger.error(`截图对比失败 [${key}]:`, error);
      return {
        type: 'error',
        key,
        error: error.message
      };
    }
  }
}

module.exports = { ScreenshotComparator };

