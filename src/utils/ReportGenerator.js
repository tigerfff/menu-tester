const fs = require('fs-extra');
const path = require('path');
const { logger } = require('./logger');

/**
 * 报告生成器
 * 用于生成格式化的控制台报告和 HTML 报告
 */
class ReportGenerator {
  constructor(progressTracker, config) {
    this.progressTracker = progressTracker;
    this.config = config;
    this.outputDir = config.output || './menu-test-results';
  }

  /**
   * 生成完整的控制台报告
   * @param {object} summary - 测试汇总数据
   */
  generateConsoleReport(summary = {}) {
    const progress = this.progressTracker.progress;
    const { totalMenus, completedMenus, failedMenus, skippedMenus, duration } = progress;
    const successRate = totalMenus > 0 ? Math.round(completedMenus / totalMenus * 100) : 0;

    logger.info('\n' + '='.repeat(60));
    logger.info(logger.bold('📊 菜单测试汇总报告'));
    logger.info('='.repeat(60));
    logger.info(`路由总数: ${totalMenus}`);
    logger.info(`✓ 成功: ${completedMenus}`);
    logger.info(`✗ 失败: ${failedMenus}`);
    logger.info(`⊝ 已跳过: ${skippedMenus}`);
    logger.info(`成功率: ${successRate}%`);
    logger.info(`总耗时: ${this.formatDuration(duration)}`);
    logger.info(`会话ID: ${progress.sessionId}`);
    logger.info('='.repeat(60));

    // 路由详情
    this.printRouteDetails(progress);

    // 性能统计
    this.printPerformanceStats(progress);

    // 截图对比统计
    this.printScreenshotStats(progress);

    // 错误明细
    if (progress.errors && progress.errors.length > 0) {
      this.printErrorDetails(progress.errors);
    }

    logger.info('='.repeat(60));
  }

  /**
   * 打印路由详情
   * @param {object} progress - 进度数据
   */
  printRouteDetails(progress) {
    logger.info('\n📋 路由详情');
    logger.info('-'.repeat(60));

    const menus = Object.values(progress.menus);
    menus.forEach((menu, index) => {
      const statusIcon = menu.status === 'completed' ? '✓' : menu.status === 'failed' ? '✗' : '⊝';
      const statusText = menu.status === 'completed' ? '成功' : menu.status === 'failed' ? '失败' : '已跳过';
      
      logger.info(`${index + 1}. ${menu.text}`);
      logger.info(`   ${statusIcon} 状态: ${statusText}`);
      
      if (menu.duration) {
        logger.info(`   ⏱️  加载时间: ${this.formatDuration(menu.duration)}`);
      }

      // 性能指标（仅第一个路由）
      if (menu.performance) {
        logger.info(`   🚀 性能指标:`);
        if (menu.performance.fcp !== null) {
          logger.info(`      - FCP: ${menu.performance.fcp}ms ${this.getThresholdIcon('fcp', menu.performance)}`);
        }
        if (menu.performance.lcp !== null) {
          logger.info(`      - LCP: ${menu.performance.lcp}ms ${this.getThresholdIcon('lcp', menu.performance)}`);
        }
        if (menu.performance.ttfb !== null) {
          logger.info(`      - TTFB: ${menu.performance.ttfb}ms ${this.getThresholdIcon('ttfb', menu.performance)}`);
        }
        if (menu.performance.domContentLoaded !== null) {
          logger.info(`      - DOMContentLoaded: ${menu.performance.domContentLoaded}ms`);
        }
        if (menu.performance.loadComplete !== null) {
          logger.info(`      - Load: ${menu.performance.loadComplete}ms`);
        }
        if (menu.performance.requestCount) {
          logger.info(`      - 请求数: ${menu.performance.requestCount}`);
        }
        if (menu.performance.totalSizeMB) {
          logger.info(`      - 总大小: ${menu.performance.totalSizeMB}MB`);
        }
      } else if (index === 0) {
        logger.info(`   🚀 性能指标: 未测试（性能监控未启用）`);
      } else {
        logger.info(`   🚀 性能指标: 未测试（非首次路由）`);
      }

      // 截图对比
      if (menu.screenshotComparisons && menu.screenshotComparisons.length > 0) {
        logger.info(`   📸 截图对比:`);
        menu.screenshotComparisons.forEach(comp => {
          const matchIcon = comp.match ? '✅' : '❌';
          logger.info(`      - ${comp.scenario}: ${matchIcon} (差异 ${comp.diffPercentage}%)`);
        });
      } else if (menu.screenshot) {
        logger.info(`   📸 截图: 已保存（未启用对比）`);
      }

      // 错误信息
      if (menu.error) {
        logger.error(`   ❌ 错误: ${menu.error}`);
      }

      logger.info('');
    });
  }

  /**
   * 打印性能统计
   * @param {object} progress - 进度数据
   */
  printPerformanceStats(progress) {
    const menus = Object.values(progress.menus);
    const performanceData = menus.find(m => m.performance);

    if (!performanceData || !performanceData.performance) {
      return;
    }

    logger.info('\n📈 性能统计');
    logger.info('-'.repeat(60));
    logger.info('首次加载性能:');
    
    const perf = performanceData.performance;
    
    if (perf.fcp !== null) {
      const threshold = this.config.performance?.thresholds?.fcp;
      const status = threshold ? (perf.fcp <= threshold ? '✅' : '⚠️') : '';
      logger.info(`  FCP (首次内容绘制): ${perf.fcp}ms ${status}${threshold ? ` (阈值: ${threshold}ms)` : ''}`);
    }
    
    if (perf.lcp !== null) {
      const threshold = this.config.performance?.thresholds?.lcp;
      const status = threshold ? (perf.lcp <= threshold ? '✅' : '⚠️') : '';
      logger.info(`  LCP (最大内容绘制): ${perf.lcp}ms ${status}${threshold ? ` (阈值: ${threshold}ms)` : ''}`);
    }
    
    if (perf.ttfb !== null) {
      const threshold = this.config.performance?.thresholds?.ttfb;
      const status = threshold ? (perf.ttfb <= threshold ? '✅' : '⚠️') : '';
      logger.info(`  TTFB (首字节时间): ${perf.ttfb}ms ${status}${threshold ? ` (阈值: ${threshold}ms)` : ''}`);
    }
    
    if (perf.domContentLoaded !== null) {
      logger.info(`  DOMContentLoaded: ${perf.domContentLoaded}ms`);
    }
    
    if (perf.loadComplete !== null) {
      logger.info(`  Load: ${perf.loadComplete}ms`);
    }
    
    if (perf.requestCount) {
      logger.info(`  总请求数: ${perf.requestCount}`);
    }
    
    if (perf.totalSizeMB) {
      logger.info(`  总传输大小: ${perf.totalSizeMB}MB`);
    }

    // 平均加载时间
    const durations = menus.filter(m => m.duration).map(m => m.duration);
    if (durations.length > 0) {
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const minDuration = Math.min(...durations);
      const maxDuration = Math.max(...durations);
      
      logger.info(`\n平均加载时间: ${this.formatDuration(avgDuration)}`);
      logger.info(`最快路由: ${this.formatDuration(minDuration)}`);
      logger.info(`最慢路由: ${this.formatDuration(maxDuration)}`);
    }

    // 阈值检查结果
    if (perf.thresholds && perf.thresholds.warnings && perf.thresholds.warnings.length > 0) {
      logger.warning('\n⚠️  性能阈值警告:');
      perf.thresholds.warnings.forEach(warning => {
        logger.warning(`  - ${warning}`);
      });
    }
  }

  /**
   * 打印截图对比统计
   * @param {object} progress - 进度数据
   */
  printScreenshotStats(progress) {
    const menus = Object.values(progress.menus);
    const allComparisons = [];
    
    menus.forEach(menu => {
      if (menu.screenshotComparisons && menu.screenshotComparisons.length > 0) {
        allComparisons.push(...menu.screenshotComparisons);
      }
    });

    if (allComparisons.length === 0) {
      return;
    }

    logger.info('\n📸 截图对比统计');
    logger.info('-'.repeat(60));
    
    const total = allComparisons.length;
    const passed = allComparisons.filter(c => c.match).length;
    const failed = total - passed;
    const avgDiff = allComparisons.reduce((sum, c) => sum + c.diffPercentage, 0) / total;

    logger.info(`总截图数: ${total}`);
    logger.info(`对比通过: ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
    logger.info(`对比失败: ${failed} (${((failed / total) * 100).toFixed(1)}%)`);
    logger.info(`平均差异: ${avgDiff.toFixed(2)}%`);

    // 差异详情
    const failedComparisons = allComparisons.filter(c => !c.match || c.diffPercentage > 2);
    if (failedComparisons.length > 0) {
      logger.warning('\n⚠️  差异详情:');
      failedComparisons.forEach(comp => {
        const icon = comp.match ? '⚠️' : '❌';
        logger.warning(`  ${icon} ${comp.scenario}: ${comp.diffPercentage}%`);
      });
    }
  }

  /**
   * 打印错误明细
   * @param {Array} errors - 错误列表
   */
  printErrorDetails(errors) {
    logger.info('\n❌ 错误明细');
    logger.info('-'.repeat(60));
    
    errors.forEach((error, index) => {
      logger.error(`${index + 1}. ${error.menuText || error.menuId}`);
      logger.error(`   错误: ${error.error}`);
      if (error.timestamp) {
        logger.error(`   时间: ${new Date(error.timestamp).toLocaleString()}`);
      }
      logger.error('');
    });
  }

  /**
   * 生成 HTML 报告
   * @param {object} summary - 测试汇总数据
   * @returns {Promise<string>} HTML 报告文件路径
   */
  async generateHTMLReport(summary = {}) {
    const progress = this.progressTracker.progress;
    const reportPath = path.join(this.outputDir, `report-${progress.sessionId}.html`);
    
    await fs.ensureDir(this.outputDir);

    const html = this.buildHTML(progress, summary);
    await fs.writeFile(reportPath, html, 'utf8');

    logger.success(`📄 HTML 报告已生成: ${reportPath}`);
    return reportPath;
  }

  /**
   * 构建 HTML 内容
   * @param {object} progress - 进度数据
   * @param {object} summary - 汇总数据
   * @returns {string} HTML 内容
   */
  buildHTML(progress, summary) {
    const menus = Object.values(progress.menus);
    const { totalMenus, completedMenus, failedMenus, skippedMenus, duration } = progress;
    const successRate = totalMenus > 0 ? Math.round(completedMenus / totalMenus * 100) : 0;

    // 收集所有截图对比数据
    const allComparisons = [];
    menus.forEach(menu => {
      if (menu.screenshotComparisons && menu.screenshotComparisons.length > 0) {
        allComparisons.push(...menu.screenshotComparisons);
      }
    });

    // 性能数据（第一个路由的性能数据）
    const performanceData = menus.find(m => m.performance && m.performance.fcp !== null)?.performance;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>菜单测试报告 - ${progress.sessionId}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #f5f5f5;
            padding: 20px;
            line-height: 1.6;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .header h1 { font-size: 28px; margin-bottom: 10px; }
        .header .meta { opacity: 0.9; font-size: 14px; }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stat-card .label { color: #666; font-size: 14px; margin-bottom: 5px; }
        .stat-card .value { font-size: 24px; font-weight: bold; color: #333; }
        .stat-card.success .value { color: #10b981; }
        .stat-card.failed .value { color: #ef4444; }
        .stat-card.warning .value { color: #f59e0b; }
        .section {
            background: white;
            padding: 25px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .section h2 {
            font-size: 20px;
            margin-bottom: 15px;
            color: #333;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }
        .route-item {
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 15px;
            background: #fafafa;
        }
        .route-item.success { border-left: 4px solid #10b981; }
        .route-item.failed { border-left: 4px solid #ef4444; }
        .route-item.skipped { border-left: 4px solid #9ca3af; }
        .route-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .route-title { font-weight: bold; font-size: 16px; color: #333; }
        .route-status {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
        }
        .status-success { background: #d1fae5; color: #065f46; }
        .status-failed { background: #fee2e2; color: #991b1b; }
        .status-skipped { background: #f3f4f6; color: #4b5563; }
        .route-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 10px;
            margin-top: 10px;
            font-size: 14px;
        }
        .detail-item { color: #666; }
        .detail-item strong { color: #333; }
        .performance-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .perf-item {
            background: #f9fafb;
            padding: 12px;
            border-radius: 6px;
            border-left: 3px solid #667eea;
        }
        .perf-item .label { color: #666; font-size: 12px; }
        .perf-item .value { font-size: 18px; font-weight: bold; color: #333; margin-top: 5px; }
        .perf-item .threshold { font-size: 11px; color: #9ca3af; margin-top: 3px; }
        .comparison-item {
            display: inline-block;
            padding: 4px 8px;
            margin: 2px;
            border-radius: 4px;
            font-size: 12px;
        }
        .comparison-pass { background: #d1fae5; color: #065f46; }
        .comparison-fail { background: #fee2e2; color: #991b1b; }
        .error-item {
            background: #fef2f2;
            border-left: 4px solid #ef4444;
            padding: 12px;
            margin-bottom: 10px;
            border-radius: 4px;
        }
        .error-item .route { font-weight: bold; color: #991b1b; margin-bottom: 5px; }
        .error-item .message { color: #7f1d1d; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
        }
        th {
            background: #f9fafb;
            font-weight: 600;
            color: #374151;
        }
        tr:hover { background: #f9fafb; }
        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: bold;
        }
        .badge-success { background: #d1fae5; color: #065f46; }
        .badge-warning { background: #fef3c7; color: #92400e; }
        .badge-danger { background: #fee2e2; color: #991b1b; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 菜单测试报告</h1>
            <div class="meta">
                <div>会话ID: ${progress.sessionId}</div>
                <div>测试时间: ${new Date(progress.timestamps.started).toLocaleString()}</div>
                <div>总耗时: ${this.formatDuration(duration)}</div>
            </div>
        </div>

        <div class="stats">
            <div class="stat-card">
                <div class="label">路由总数</div>
                <div class="value">${totalMenus}</div>
            </div>
            <div class="stat-card success">
                <div class="label">成功</div>
                <div class="value">${completedMenus}</div>
            </div>
            <div class="stat-card failed">
                <div class="label">失败</div>
                <div class="value">${failedMenus}</div>
            </div>
            <div class="stat-card ${successRate >= 80 ? 'success' : successRate >= 50 ? 'warning' : 'failed'}">
                <div class="label">成功率</div>
                <div class="value">${successRate}%</div>
            </div>
        </div>

        ${this.buildRouteSection(menus)}

        ${performanceData ? this.buildPerformanceSection(performanceData) : ''}

        ${allComparisons.length > 0 ? this.buildScreenshotSection(allComparisons) : ''}

        ${progress.errors && progress.errors.length > 0 ? this.buildErrorSection(progress.errors) : ''}
    </div>
</body>
</html>`;
  }

  /**
   * 构建路由详情 HTML
   */
  buildRouteSection(menus) {
    const items = menus.map((menu, index) => {
      const statusClass = menu.status === 'completed' ? 'success' : menu.status === 'failed' ? 'failed' : 'skipped';
      const statusText = menu.status === 'completed' ? '成功' : menu.status === 'failed' ? '失败' : '已跳过';
      const statusBadge = menu.status === 'completed' ? 'status-success' : menu.status === 'failed' ? 'status-failed' : 'status-skipped';

      let details = '';
      
      if (menu.duration) {
        details += `<div class="detail-item"><strong>⏱️ 加载时间:</strong> ${this.formatDuration(menu.duration)}</div>`;
      }

      if (menu.performance) {
        details += `<div class="detail-item"><strong>🚀 性能:</strong> 已测量</div>`;
      } else if (index === 0) {
        details += `<div class="detail-item"><strong>🚀 性能:</strong> 未测试</div>`;
      }

      if (menu.screenshotComparisons && menu.screenshotComparisons.length > 0) {
        const comparisons = menu.screenshotComparisons.map(c => {
          const cls = c.match ? 'comparison-pass' : 'comparison-fail';
          return `<span class="comparison-item ${cls}">${c.scenario}: ${c.diffPercentage}%</span>`;
        }).join('');
        details += `<div class="detail-item"><strong>📸 截图对比:</strong> ${comparisons}</div>`;
      }

      if (menu.error) {
        details += `<div class="detail-item" style="color: #ef4444;"><strong>❌ 错误:</strong> ${this.escapeHtml(menu.error)}</div>`;
      }

      return `
        <div class="route-item ${statusClass}">
            <div class="route-header">
                <div class="route-title">${index + 1}. ${this.escapeHtml(menu.text)}</div>
                <span class="route-status ${statusBadge}">${statusText}</span>
            </div>
            <div class="route-details">
                ${details}
            </div>
        </div>`;
    }).join('');

    return `
        <div class="section">
            <h2>📋 路由详情</h2>
            ${items}
        </div>`;
  }

  /**
   * 构建性能统计 HTML
   */
  buildPerformanceSection(perf) {
    const items = [];
    
    if (perf.fcp !== null) {
      const threshold = this.config.performance?.thresholds?.fcp;
      const passed = threshold ? perf.fcp <= threshold : null;
      items.push(`
        <div class="perf-item">
            <div class="label">FCP (首次内容绘制)</div>
            <div class="value">${perf.fcp}ms ${passed === true ? '✅' : passed === false ? '⚠️' : ''}</div>
            ${threshold ? `<div class="threshold">阈值: ${threshold}ms</div>` : ''}
        </div>`);
    }
    
    if (perf.lcp !== null) {
      const threshold = this.config.performance?.thresholds?.lcp;
      const passed = threshold ? perf.lcp <= threshold : null;
      items.push(`
        <div class="perf-item">
            <div class="label">LCP (最大内容绘制)</div>
            <div class="value">${perf.lcp}ms ${passed === true ? '✅' : passed === false ? '⚠️' : ''}</div>
            ${threshold ? `<div class="threshold">阈值: ${threshold}ms</div>` : ''}
        </div>`);
    }
    
    if (perf.ttfb !== null) {
      const threshold = this.config.performance?.thresholds?.ttfb;
      const passed = threshold ? perf.ttfb <= threshold : null;
      items.push(`
        <div class="perf-item">
            <div class="label">TTFB (首字节时间)</div>
            <div class="value">${perf.ttfb}ms ${passed === true ? '✅' : passed === false ? '⚠️' : ''}</div>
            ${threshold ? `<div class="threshold">阈值: ${threshold}ms</div>` : ''}
        </div>`);
    }
    
    if (perf.domContentLoaded !== null) {
      items.push(`
        <div class="perf-item">
            <div class="label">DOMContentLoaded</div>
            <div class="value">${perf.domContentLoaded}ms</div>
        </div>`);
    }
    
    if (perf.loadComplete !== null) {
      items.push(`
        <div class="perf-item">
            <div class="label">Load</div>
            <div class="value">${perf.loadComplete}ms</div>
        </div>`);
    }
    
    if (perf.requestCount) {
      items.push(`
        <div class="perf-item">
            <div class="label">请求数</div>
            <div class="value">${perf.requestCount}</div>
        </div>`);
    }
    
    if (perf.totalSizeMB) {
      items.push(`
        <div class="perf-item">
            <div class="label">总传输大小</div>
            <div class="value">${perf.totalSizeMB}MB</div>
        </div>`);
    }

    return `
        <div class="section">
            <h2>📈 性能统计</h2>
            <div class="performance-grid">
                ${items.join('')}
            </div>
        </div>`;
  }

  /**
   * 构建截图对比统计 HTML
   */
  buildScreenshotSection(comparisons) {
    const total = comparisons.length;
    const passed = comparisons.filter(c => c.match).length;
    const failed = total - passed;
    const avgDiff = comparisons.reduce((sum, c) => sum + c.diffPercentage, 0) / total;

    const rows = comparisons.map(c => {
      const badge = c.match ? 'badge-success' : 'badge-danger';
      return `
        <tr>
            <td>${this.escapeHtml(c.scenario)}</td>
            <td><span class="badge ${badge}">${c.match ? '通过' : '失败'}</span></td>
            <td>${c.diffPercentage.toFixed(2)}%</td>
        </tr>`;
    }).join('');

    return `
        <div class="section">
            <h2>📸 截图对比统计</h2>
            <div style="margin-bottom: 15px;">
                <div><strong>总截图数:</strong> ${total}</div>
                <div><strong>对比通过:</strong> ${passed} (${((passed / total) * 100).toFixed(1)}%)</div>
                <div><strong>对比失败:</strong> ${failed} (${((failed / total) * 100).toFixed(1)}%)</div>
                <div><strong>平均差异:</strong> ${avgDiff.toFixed(2)}%</div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>场景</th>
                        <th>状态</th>
                        <th>差异比率</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>`;
  }

  /**
   * 构建错误明细 HTML
   */
  buildErrorSection(errors) {
    const items = errors.map(error => `
        <div class="error-item">
            <div class="route">${this.escapeHtml(error.menuText || error.menuId)}</div>
            <div class="message">${this.escapeHtml(error.error)}</div>
            ${error.timestamp ? `<div style="color: #9ca3af; font-size: 12px; margin-top: 5px;">${new Date(error.timestamp).toLocaleString()}</div>` : ''}
        </div>`).join('');

    return `
        <div class="section">
            <h2>❌ 错误明细</h2>
            ${items}
        </div>`;
  }

  /**
   * 获取阈值图标
   */
  getThresholdIcon(metric, performance) {
    if (!performance.thresholds || !performance.thresholds.results || !performance.thresholds.results[metric]) {
      return '';
    }
    const result = performance.thresholds.results[metric];
    return result.passed ? '✅' : '⚠️';
  }

  /**
   * 格式化时长
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}毫秒`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}秒`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}分钟`;
    return `${(ms / 3600000).toFixed(1)}小时`;
  }

  /**
   * HTML 转义
   */
  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }
}

module.exports = ReportGenerator;

