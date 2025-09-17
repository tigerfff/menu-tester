const { logger } = require('../utils/logger');

/**
 * 增强的页面验证器
 * 支持配置化的断言规则，能够检测空白页面、缺省状态等
 */
class EnhancedPageValidator {
  constructor(agent, page, config) {
    this.agent = agent;
    this.page = page;
    this.config = config;
    this.assertionConfig = config.pageAssertions || {};
    
    // 默认断言配置
    this.defaultConfig = {
      enabled: true,
      strictMode: true,
      minContentLength: 100,
      minVisibleElements: 3,
      timeoutMs: 5000,
      blankPageDetection: {
        enabled: true,
        checkTitle: true,
        checkMainContent: true,
        checkNavigation: true,
        checkForms: true,
        minTextLength: 50
      },
      emptyStateDetection: {
        enabled: true,
        keywords: [
          '暂无数据', '无数据', '没有数据', '数据为空',
          '加载失败', '请求失败', '网络错误', '服务异常',
          '暂无内容', '无内容', '内容为空', '页面不存在',
          '404', '500', '403', '401', 'Not Found',
          'No Data', 'No Content', 'Empty', 'Loading Error'
        ],
        selectors: [
          '.empty-state', '.no-data', '.empty-content',
          '.error-page', '.not-found', '.loading-error',
          '.el-empty', '.ant-empty', '.empty-placeholder'
        ]
      },
      customRules: []
    };
    
    // 合并配置
    this.mergedConfig = this.mergeConfig(this.defaultConfig, this.assertionConfig);
  }

  /**
   * 合并配置
   */
  mergeConfig(defaultConfig, userConfig) {
    return {
      ...defaultConfig,
      ...userConfig,
      blankPageDetection: {
        ...defaultConfig.blankPageDetection,
        ...userConfig.blankPageDetection
      },
      emptyStateDetection: {
        ...defaultConfig.emptyStateDetection,
        ...userConfig.emptyStateDetection,
        keywords: [
          ...(defaultConfig.emptyStateDetection.keywords || []),
          ...(userConfig.emptyStateDetection?.keywords || [])
        ],
        selectors: [
          ...(defaultConfig.emptyStateDetection.selectors || []),
          ...(userConfig.emptyStateDetection?.selectors || [])
        ]
      },
      customRules: [
        ...(defaultConfig.customRules || []),
        ...(userConfig.customRules || [])
      ]
    };
  }

  /**
   * 执行完整的页面断言
   * @param {object} context - 测试上下文
   * @returns {object} 断言结果
   */
  async performAssertions(context = {}) {
    if (!this.mergedConfig.enabled) {
      return {
        success: true,
        message: '页面断言已禁用',
        skipped: true
      };
    }

    const startTime = Date.now();
    const results = {
      success: true,
      errors: [],
      warnings: [],
      details: {},
      duration: 0
    };

    try {
      logger.debug('开始执行页面断言检查...');

      // 1. 空白页面检测
      if (this.mergedConfig.blankPageDetection.enabled) {
        const blankPageResult = await this.checkBlankPage();
        results.details.blankPageCheck = blankPageResult;
        
        if (!blankPageResult.success) {
          results.success = false;
          results.errors.push(`空白页面检测失败: ${blankPageResult.message}`);
        }
      }

      // 2. 缺省状态检测
      if (this.mergedConfig.emptyStateDetection.enabled) {
        const emptyStateResult = await this.checkEmptyState();
        results.details.emptyStateCheck = emptyStateResult;
        
        if (!emptyStateResult.success) {
          results.success = false;
          results.errors.push(`缺省状态检测: ${emptyStateResult.message}`);
        }
      }

      // 3. 内容质量检测
      const contentQualityResult = await this.checkContentQuality();
      results.details.contentQualityCheck = contentQualityResult;
      
      if (!contentQualityResult.success) {
        if (this.mergedConfig.strictMode) {
          results.success = false;
          results.errors.push(`内容质量检测失败: ${contentQualityResult.message}`);
        } else {
          results.warnings.push(`内容质量警告: ${contentQualityResult.message}`);
        }
      }

      // 4. 自定义断言规则
      if (this.mergedConfig.customRules.length > 0) {
        const customRulesResult = await this.executeCustomRules();
        results.details.customRulesCheck = customRulesResult;
        
        customRulesResult.failedRules.forEach(rule => {
          if (rule.required) {
            results.success = false;
            results.errors.push(`自定义规则失败: ${rule.message}`);
          } else {
            results.warnings.push(`自定义规则警告: ${rule.message}`);
          }
        });
      }

      // 5. 页面响应性检测
      const responsivenessResult = await this.checkPageResponsiveness();
      results.details.responsivenessCheck = responsivenessResult;
      
      if (!responsivenessResult.success) {
        results.warnings.push(`页面响应性警告: ${responsivenessResult.message}`);
      }

    } catch (error) {
      results.success = false;
      results.errors.push(`断言执行失败: ${error.message}`);
      logger.error('页面断言执行失败:', error);
    }

    results.duration = Date.now() - startTime;
    
    if (results.success) {
      logger.debug(`页面断言通过 (${results.duration}ms)`);
    } else {
      logger.warning(`页面断言失败: ${results.errors.join(', ')}`);
    }

    return results;
  }

  /**
   * 检测空白页面
   * @returns {object} 检测结果
   */
  async checkBlankPage() {
    try {
      const config = this.mergedConfig.blankPageDetection;
      const checks = [];

      // 检查页面标题
      if (config.checkTitle) {
        const titleCheck = await this.page.evaluate(() => {
          const title = document.title.trim();
          return {
            hasTitle: title.length > 0,
            title: title,
            isEmpty: title === '' || title === 'Untitled' || title === 'New Tab'
          };
        });
        
        checks.push({
          name: 'pageTitle',
          success: titleCheck.hasTitle && !titleCheck.isEmpty,
          message: titleCheck.isEmpty ? '页面标题为空或默认值' : '页面标题正常',
          details: titleCheck
        });
      }

      // 检查主内容区域
      if (config.checkMainContent) {
        const contentCheck = await this.page.evaluate((minTextLength) => {
          const contentSelectors = [
            'main', '.main', '.content', '.container', '.page-content',
            '.main-content', '#content', '#main', '.app-main'
          ];
          
          let mainContent = null;
          for (const selector of contentSelectors) {
            mainContent = document.querySelector(selector);
            if (mainContent) break;
          }
          
          if (!mainContent) {
            mainContent = document.body;
          }
          
          const textContent = mainContent.textContent.trim();
          const visibleElements = mainContent.querySelectorAll('*').length;
          
          return {
            hasMainContent: !!mainContent,
            textLength: textContent.length,
            visibleElements: visibleElements,
            hasMinText: textContent.length >= minTextLength,
            excerpt: textContent.substring(0, 100)
          };
        }, config.minTextLength);
        
        checks.push({
          name: 'mainContent',
          success: contentCheck.hasMainContent && contentCheck.hasMinText,
          message: contentCheck.hasMinText ? '主内容区域正常' : `主内容区域文本过少 (${contentCheck.textLength}字符)`,
          details: contentCheck
        });
      }

      // 检查导航元素
      if (config.checkNavigation) {
        const navCheck = await this.page.evaluate(() => {
          const navSelectors = [
            'nav', '.nav', '.navigation', '.navbar', '.menu',
            '.sidebar', '.side-nav', '.el-menu', '.ant-menu'
          ];
          
          let hasNavigation = false;
          const foundNavs = [];
          
          for (const selector of navSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              hasNavigation = true;
              foundNavs.push({
                selector: selector,
                count: elements.length,
                hasItems: elements[0].children.length > 0
              });
            }
          }
          
          return {
            hasNavigation: hasNavigation,
            navigations: foundNavs
          };
        });
        
        checks.push({
          name: 'navigation',
          success: navCheck.hasNavigation,
          message: navCheck.hasNavigation ? '导航元素正常' : '未找到导航元素',
          details: navCheck
        });
      }

      // 检查表单元素
      if (config.checkForms) {
        const formCheck = await this.page.evaluate(() => {
          const forms = document.querySelectorAll('form');
          const inputs = document.querySelectorAll('input, select, textarea, button');
          
          return {
            formCount: forms.length,
            inputCount: inputs.length,
            hasInteractiveElements: inputs.length > 0
          };
        });
        
        checks.push({
          name: 'forms',
          success: true, // 表单检查不作为强制要求
          message: `页面包含 ${formCheck.formCount} 个表单，${formCheck.inputCount} 个交互元素`,
          details: formCheck
        });
      }

      // 综合判断
      const criticalChecks = checks.filter(check => check.name !== 'forms');
      const passedCriticalChecks = criticalChecks.filter(check => check.success).length;
      const totalCriticalChecks = criticalChecks.length;
      
      const success = passedCriticalChecks >= Math.ceil(totalCriticalChecks * 0.6); // 至少60%的关键检查通过
      
      return {
        success: success,
        message: success ? '页面内容充实，不是空白页面' : '页面疑似空白或内容不足',
        checks: checks,
        passedChecks: passedCriticalChecks,
        totalChecks: totalCriticalChecks
      };

    } catch (error) {
      return {
        success: false,
        message: `空白页面检测失败: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * 检测缺省状态
   * @returns {object} 检测结果
   */
  async checkEmptyState() {
    try {
      const config = this.mergedConfig.emptyStateDetection;
      
      const emptyStateCheck = await this.page.evaluate((keywords, selectors) => {
        // 检查文本内容中的关键词
        const pageText = document.body.textContent.toLowerCase();
        const foundKeywords = keywords.filter(keyword => 
          pageText.includes(keyword.toLowerCase())
        );
        
        // 检查特定的缺省状态元素
        const foundElements = [];
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            foundElements.push({
              selector: selector,
              count: elements.length,
              visible: Array.from(elements).some(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
              })
            });
          }
        }
        
        return {
          foundKeywords: foundKeywords,
          foundElements: foundElements,
          hasEmptyKeywords: foundKeywords.length > 0,
          hasEmptyElements: foundElements.some(el => el.visible)
        };
      }, config.keywords, config.selectors);

      const hasEmptyState = emptyStateCheck.hasEmptyKeywords || emptyStateCheck.hasEmptyElements;
      
      return {
        success: !hasEmptyState,
        message: hasEmptyState ? 
          `检测到缺省状态: ${emptyStateCheck.foundKeywords.join(', ')}` : 
          '未检测到缺省状态',
        details: emptyStateCheck
      };

    } catch (error) {
      return {
        success: true, // 检测失败时假设没有缺省状态
        message: `缺省状态检测失败: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * 检查内容质量
   * @returns {object} 检测结果
   */
  async checkContentQuality() {
    try {
      const qualityCheck = await this.page.evaluate((minContentLength, minVisibleElements) => {
        // 获取页面内容统计
        const bodyText = document.body.textContent.trim();
        const visibleElements = Array.from(document.querySelectorAll('*')).filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
        
        // 检查有意义的内容元素
        const meaningfulElements = {
          headings: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
          paragraphs: document.querySelectorAll('p').length,
          lists: document.querySelectorAll('ul, ol').length,
          tables: document.querySelectorAll('table').length,
          forms: document.querySelectorAll('form').length,
          buttons: document.querySelectorAll('button, input[type="button"], input[type="submit"]').length,
          links: document.querySelectorAll('a[href]').length,
          images: document.querySelectorAll('img[src]').length
        };
        
        const totalMeaningfulElements = Object.values(meaningfulElements).reduce((sum, count) => sum + count, 0);
        
        return {
          textLength: bodyText.length,
          visibleElementsCount: visibleElements.length,
          meaningfulElements: meaningfulElements,
          totalMeaningfulElements: totalMeaningfulElements,
          contentDensity: bodyText.length / Math.max(visibleElements.length, 1),
          hasMinContent: bodyText.length >= minContentLength,
          hasMinElements: visibleElements.length >= minVisibleElements
        };
      }, this.mergedConfig.minContentLength, this.mergedConfig.minVisibleElements);

      const success = qualityCheck.hasMinContent && 
                     qualityCheck.hasMinElements && 
                     qualityCheck.totalMeaningfulElements >= 2;
      
      return {
        success: success,
        message: success ? 
          '页面内容质量良好' : 
          `页面内容质量不足 (文本:${qualityCheck.textLength}字符, 元素:${qualityCheck.visibleElementsCount}个, 有意义元素:${qualityCheck.totalMeaningfulElements}个)`,
        details: qualityCheck
      };

    } catch (error) {
      return {
        success: true, // 检测失败时假设质量正常
        message: `内容质量检测失败: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * 执行自定义断言规则
   * @returns {object} 执行结果
   */
  async executeCustomRules() {
    const results = {
      totalRules: this.mergedConfig.customRules.length,
      passedRules: [],
      failedRules: []
    };

    for (const rule of this.mergedConfig.customRules) {
      try {
        const ruleResult = await this.executeCustomRule(rule);
        
        if (ruleResult.success) {
          results.passedRules.push({
            ...rule,
            result: ruleResult
          });
        } else {
          results.failedRules.push({
            ...rule,
            result: ruleResult
          });
        }
      } catch (error) {
        results.failedRules.push({
          ...rule,
          result: {
            success: false,
            message: `规则执行失败: ${error.message}`,
            error: error.message
          }
        });
      }
    }

    return results;
  }

  /**
   * 执行单个自定义规则
   * @param {object} rule - 规则配置
   * @returns {object} 执行结果
   */
  async executeCustomRule(rule) {
    switch (rule.type) {
      case 'element_exists':
        return await this.checkElementExists(rule.selector, rule.message);
      
      case 'element_not_exists':
        return await this.checkElementNotExists(rule.selector, rule.message);
      
      case 'text_contains':
        return await this.checkTextContains(rule.text, rule.message);
      
      case 'text_not_contains':
        return await this.checkTextNotContains(rule.text, rule.message);
      
      case 'custom_function':
        return await this.executeCustomFunction(rule.function, rule.message);
      
      default:
        return {
          success: false,
          message: `未知的规则类型: ${rule.type}`
        };
    }
  }

  /**
   * 检查元素是否存在
   */
  async checkElementExists(selector, message) {
    try {
      const exists = await this.page.evaluate((sel) => {
        return document.querySelectorAll(sel).length > 0;
      }, selector);
      
      return {
        success: exists,
        message: exists ? `元素存在: ${selector}` : (message || `元素不存在: ${selector}`)
      };
    } catch (error) {
      return {
        success: false,
        message: `检查元素存在性失败: ${error.message}`
      };
    }
  }

  /**
   * 检查元素是否不存在
   */
  async checkElementNotExists(selector, message) {
    try {
      const exists = await this.page.evaluate((sel) => {
        return document.querySelectorAll(sel).length > 0;
      }, selector);
      
      return {
        success: !exists,
        message: !exists ? `元素不存在: ${selector}` : (message || `元素不应存在: ${selector}`)
      };
    } catch (error) {
      return {
        success: false,
        message: `检查元素不存在性失败: ${error.message}`
      };
    }
  }

  /**
   * 检查文本是否包含
   */
  async checkTextContains(text, message) {
    try {
      const contains = await this.page.evaluate((searchText) => {
        return document.body.textContent.toLowerCase().includes(searchText.toLowerCase());
      }, text);
      
      return {
        success: contains,
        message: contains ? `页面包含文本: ${text}` : (message || `页面不包含文本: ${text}`)
      };
    } catch (error) {
      return {
        success: false,
        message: `检查文本包含失败: ${error.message}`
      };
    }
  }

  /**
   * 检查文本是否不包含
   */
  async checkTextNotContains(text, message) {
    try {
      const contains = await this.page.evaluate((searchText) => {
        return document.body.textContent.toLowerCase().includes(searchText.toLowerCase());
      }, text);
      
      return {
        success: !contains,
        message: !contains ? `页面不包含文本: ${text}` : (message || `页面不应包含文本: ${text}`)
      };
    } catch (error) {
      return {
        success: false,
        message: `检查文本不包含失败: ${error.message}`
      };
    }
  }

  /**
   * 执行自定义函数
   */
  async executeCustomFunction(func, message) {
    try {
      const result = await this.page.evaluate(func);
      return {
        success: !!result,
        message: result ? '自定义函数检查通过' : (message || '自定义函数检查失败')
      };
    } catch (error) {
      return {
        success: false,
        message: `自定义函数执行失败: ${error.message}`
      };
    }
  }

  /**
   * 检查页面响应性
   * @returns {object} 检测结果
   */
  async checkPageResponsiveness() {
    try {
      const startTime = Date.now();
      
      // 简单的响应性检查：尝试获取页面标题
      const title = await this.page.title();
      const responseTime = Date.now() - startTime;
      
      const success = responseTime < 2000; // 2秒内响应认为正常
      
      return {
        success: success,
        message: success ? 
          `页面响应正常 (${responseTime}ms)` : 
          `页面响应较慢 (${responseTime}ms)`,
        responseTime: responseTime,
        title: title
      };
    } catch (error) {
      return {
        success: false,
        message: `页面响应性检查失败: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * 生成断言报告
   * @param {object} results - 断言结果
   * @returns {string} 格式化的报告
   */
  generateReport(results) {
    const lines = [];
    
    lines.push('=== 页面断言报告 ===');
    lines.push(`状态: ${results.success ? '✅ 通过' : '❌ 失败'}`);
    lines.push(`耗时: ${results.duration}ms`);
    
    if (results.errors.length > 0) {
      lines.push('\n错误:');
      results.errors.forEach(error => lines.push(`  ❌ ${error}`));
    }
    
    if (results.warnings.length > 0) {
      lines.push('\n警告:');
      results.warnings.forEach(warning => lines.push(`  ⚠️  ${warning}`));
    }
    
    if (results.details) {
      lines.push('\n详细检查:');
      Object.entries(results.details).forEach(([key, detail]) => {
        lines.push(`  ${key}: ${detail.success ? '✅' : '❌'} ${detail.message}`);
      });
    }
    
    return lines.join('\n');
  }
}

module.exports = EnhancedPageValidator; 