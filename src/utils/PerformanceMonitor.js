const { logger } = require('./logger');

/**
 * 性能监控工具类
 * 用于收集和计算页面性能指标
 */
class PerformanceMonitor {
  constructor(page, config) {
    this.page = page;
    this.config = config.performance || {};
    this.enabled = this.config.enabled !== false; // 默认启用
    this.thresholds = this.config.thresholds || {};
    this.metrics = this.config.metrics || ['FCP', 'LCP', 'TTFB', 'DOMContentLoaded', 'Load'];
  }

  /**
   * 测量页面性能指标
   * @returns {Promise<object>} 性能指标数据
   */
  async measurePerformance() {
    if (!this.enabled) {
      return null;
    }

    try {
      logger.info('📊 开始测量页面性能指标...');

      // 等待页面完全加载
      await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      
      // 获取 Performance API 数据
      const performanceData = await this.page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        const resources = performance.getEntriesByType('resource');

        // 计算基础指标
        const timing = navigation ? {
          navigationStart: navigation.startTime,
          domContentLoaded: navigation.domContentLoadedEventEnd - navigation.startTime,
          loadComplete: navigation.loadEventEnd - navigation.startTime,
          domInteractive: navigation.domInteractive - navigation.startTime,
          domComplete: navigation.domComplete - navigation.startTime,
          responseStart: navigation.responseStart - navigation.startTime,
          responseEnd: navigation.responseEnd - navigation.startTime
        } : {};

        // FCP (First Contentful Paint)
        const fcpEntry = paint.find(entry => entry.name === 'first-contentful-paint');
        const fcp = fcpEntry ? fcpEntry.startTime : null;

        // 计算资源统计
        const resourceStats = {
          total: resources.length,
          totalSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
          byType: {}
        };

        resources.forEach(resource => {
          const type = resource.initiatorType || 'other';
          if (!resourceStats.byType[type]) {
            resourceStats.byType[type] = { count: 0, size: 0 };
          }
          resourceStats.byType[type].count++;
          resourceStats.byType[type].size += resource.transferSize || 0;
        });

        return {
          timing,
          fcp,
          resources: resourceStats,
          url: window.location.href
        };
      });

      // 尝试获取 Web Vitals (需要 CDP)
      let webVitals = null;
      try {
        webVitals = await this.getWebVitals();
      } catch (error) {
        logger.debug(`无法获取 Web Vitals: ${error.message}`);
      }

      // 计算 TTFB (Time to First Byte)
      const ttfb = performanceData.timing.responseStart || null;

      // 构建性能指标对象
      const metrics = {
        // 基础指标
        fcp: performanceData.fcp ? Math.round(performanceData.fcp) : null, // First Contentful Paint
        ttfb: ttfb ? Math.round(ttfb) : null, // Time to First Byte
        domContentLoaded: performanceData.timing.domContentLoaded ? Math.round(performanceData.timing.domContentLoaded) : null,
        loadComplete: performanceData.timing.loadComplete ? Math.round(performanceData.timing.loadComplete) : null,
        domInteractive: performanceData.timing.domInteractive ? Math.round(performanceData.timing.domInteractive) : null,
        
        // Web Vitals (如果可用)
        lcp: webVitals?.lcp || null, // Largest Contentful Paint
        fid: webVitals?.fid || null, // First Input Delay
        cls: webVitals?.cls || null, // Cumulative Layout Shift
        
        // 资源统计
        requestCount: performanceData.resources.total,
        totalSize: performanceData.resources.totalSize,
        totalSizeMB: (performanceData.resources.totalSize / 1024 / 1024).toFixed(2),
        resourcesByType: performanceData.resources.byType,
        
        // 元数据
        url: performanceData.url,
        timestamp: new Date().toISOString()
      };

      // 检查阈值
      const thresholdResults = this.checkThresholds(metrics);
      metrics.thresholds = thresholdResults;

      logger.success('📊 性能指标测量完成');
      this.logMetrics(metrics);

      return metrics;
    } catch (error) {
      logger.warning(`性能测量失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 尝试通过 CDP 获取 Web Vitals
   * @returns {Promise<object>} Web Vitals 数据
   */
  async getWebVitals() {
    try {
      const client = await this.page.context().newCDPSession(this.page);
      
      // 启用 Performance 域
      await client.send('Performance.enable');
      await client.send('Runtime.enable');

      // 等待一段时间让指标收集
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 获取性能指标
      const metrics = await client.send('Performance.getMetrics');
      
      // 解析指标
      const result = {};
      if (metrics.metrics) {
        metrics.metrics.forEach(metric => {
          if (metric.name === 'LargestContentfulPaint') {
            result.lcp = Math.round(metric.value);
          } else if (metric.name === 'FirstInputDelay') {
            result.fid = Math.round(metric.value);
          } else if (metric.name === 'CumulativeLayoutShift') {
            result.cls = metric.value.toFixed(3);
          }
        });
      }

      await client.detach();
      return result;
    } catch (error) {
      // CDP 可能不可用，返回 null
      return null;
    }
  }

  /**
   * 检查性能指标是否超过阈值
   * @param {object} metrics - 性能指标
   * @returns {object} 阈值检查结果
   */
  checkThresholds(metrics) {
    const results = {};
    const warnings = [];
    const passed = [];

    // 检查 FCP
    if (this.thresholds.fcp && metrics.fcp !== null) {
      const passed = metrics.fcp <= this.thresholds.fcp;
      results.fcp = { passed, threshold: this.thresholds.fcp, actual: metrics.fcp };
      if (!passed) {
        warnings.push(`FCP (${metrics.fcp}ms) 超过阈值 (${this.thresholds.fcp}ms)`);
      } else {
        passed.push(`FCP (${metrics.fcp}ms) ✅`);
      }
    }

    // 检查 LCP
    if (this.thresholds.lcp && metrics.lcp !== null) {
      const passed = metrics.lcp <= this.thresholds.lcp;
      results.lcp = { passed, threshold: this.thresholds.lcp, actual: metrics.lcp };
      if (!passed) {
        warnings.push(`LCP (${metrics.lcp}ms) 超过阈值 (${this.thresholds.lcp}ms)`);
      } else {
        passed.push(`LCP (${metrics.lcp}ms) ✅`);
      }
    }

    // 检查 TTFB
    if (this.thresholds.ttfb && metrics.ttfb !== null) {
      const passed = metrics.ttfb <= this.thresholds.ttfb;
      results.ttfb = { passed, threshold: this.thresholds.ttfb, actual: metrics.ttfb };
      if (!passed) {
        warnings.push(`TTFB (${metrics.ttfb}ms) 超过阈值 (${this.thresholds.ttfb}ms)`);
      } else {
        passed.push(`TTFB (${metrics.ttfb}ms) ✅`);
      }
    }

    // 检查 DOMContentLoaded
    if (this.thresholds.domContentLoaded && metrics.domContentLoaded !== null) {
      const passed = metrics.domContentLoaded <= this.thresholds.domContentLoaded;
      results.domContentLoaded = { passed, threshold: this.thresholds.domContentLoaded, actual: metrics.domContentLoaded };
      if (!passed) {
        warnings.push(`DOMContentLoaded (${metrics.domContentLoaded}ms) 超过阈值 (${this.thresholds.domContentLoaded}ms)`);
      }
    }

    return {
      results,
      warnings,
      passed,
      allPassed: warnings.length === 0
    };
  }

  /**
   * 输出性能指标日志
   * @param {object} metrics - 性能指标
   */
  logMetrics(metrics) {
    logger.info('📊 性能指标:');
    if (metrics.fcp !== null) {
      logger.info(`  FCP (首次内容绘制): ${metrics.fcp}ms ${this.getThresholdStatus('fcp', metrics.fcp)}`);
    }
    if (metrics.lcp !== null) {
      logger.info(`  LCP (最大内容绘制): ${metrics.lcp}ms ${this.getThresholdStatus('lcp', metrics.lcp)}`);
    }
    if (metrics.ttfb !== null) {
      logger.info(`  TTFB (首字节时间): ${metrics.ttfb}ms ${this.getThresholdStatus('ttfb', metrics.ttfb)}`);
    }
    if (metrics.domContentLoaded !== null) {
      logger.info(`  DOMContentLoaded: ${metrics.domContentLoaded}ms`);
    }
    if (metrics.loadComplete !== null) {
      logger.info(`  Load: ${metrics.loadComplete}ms`);
    }
    logger.info(`  请求数: ${metrics.requestCount}`);
    logger.info(`  总大小: ${metrics.totalSizeMB}MB`);
  }

  /**
   * 获取阈值状态标识
   * @param {string} metric - 指标名称
   * @param {number} value - 指标值
   * @returns {string} 状态标识
   */
  getThresholdStatus(metric, value) {
    if (!this.thresholds[metric]) {
      return '';
    }
    return value <= this.thresholds[metric] ? '✅' : '⚠️';
  }
}

module.exports = PerformanceMonitor;

