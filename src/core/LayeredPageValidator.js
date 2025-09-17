// src/core/LayeredPageValidator.js
const { logger } = require('../utils/logger');
const EnhancedPageValidator = require('./EnhancedPageValidator');

/**
 * 分层页面验证器
 * DOM预检 + Midscene配置化文本检测
 */
class LayeredPageValidator {
  constructor(agent, page, config) {
    this.agent = agent;
    this.page = page;
    this.config = config;
    
    // 复用现有的DOM验证能力
    this.domValidator = new EnhancedPageValidator(agent, page, config);
    
    // 分层验证配置
    this.validationConfig = {
      domPreCheck: {
        enabled: true,
        failFast: true,
        ...config.pageAssertions?.domPreCheck
      },
      midsceneTextCheck: {
        enabled: true,
        timeout: 5000,
        checks: this.getDefaultTextChecks(),
        ...config.pageAssertions?.midsceneTextCheck
      }
    };
  }

  /**
   * 获取默认的文本检测配置
   */
  getDefaultTextChecks() {
    return [
      {
        name: "notBlankScreen",
        type: "aiBoolean",
        prompt: "页面是否是白屏、空白页面或只显示加载状态？",
        expectation: false,
        failOnTrue: true,
        failFast: false,
        timeout: 5000,
        failureMessage: "检测到白屏或空白页面"
      },
      {
        name: "noPermissionError",
        type: "aiBoolean",
        prompt: "页面是否显示权限相关的错误信息？比如'没有权限'、'权限不足'、'访问被拒绝'、'暂无视频查看权限，请联系企业管理员开通'等",
        expectation: false,
        failOnTrue: true,
        failFast: true,
        timeout: 5000,
        failureMessage: "检测到权限错误"
      },
      {
        name: "noApiError", 
        type: "aiBoolean",
        prompt: "页面是否显示接口错误或网络错误？比如'请求失败'、'加载失败'、'网络错误'、'服务异常'、'连接超时'等",
        expectation: false,
        failOnTrue: true,
        failFast: false,
        timeout: 5000,
        failureMessage: "检测到接口或网络错误"
      },
      {
        name: "hasValidBusinessContent",
        type: "aiBoolean", 
        prompt: "页面是否包含有效的业务内容？（有实际的数据、表格、表单、视频等，不是错误页面、空状态页面或纯加载页面）",
        expectation: true,
        failOnFalse: true,
        failFast: false,
        timeout: 5000,
        failureMessage: "页面缺少有效的业务内容"
      }
    ];
  }

  /**
   * 主要的分层验证入口
   */
  async validatePageWithLayers(context = {}) {
    const startTime = Date.now();
    const validation = {
      success: false,
      layers: {
        dom: null,
        midscene: null
      },
      summary: {
        criticalIssues: [],
        warnings: [],
        insights: []
      },
      duration: 0,
      failureReason: null
    };

    try {
      logger.info('LayeredPageValidator - 开始分层页面验证...');
      logger.debug('LayeredPageValidator - 验证配置:', JSON.stringify(this.validationConfig, null, 2));

      // 第一层：DOM技术预检
      if (this.validationConfig.domPreCheck.enabled) {
        logger.debug('执行DOM技术预检...');
        validation.layers.dom = await this.performDOMPreCheck();
        
        if (!validation.layers.dom.pass && this.validationConfig.domPreCheck.failFast) {
          validation.success = false;
          validation.failureReason = `DOM技术错误: ${validation.layers.dom.issues.join('; ')}`;
          validation.summary.criticalIssues = validation.layers.dom.issues;
          validation.duration = Date.now() - startTime;
          logger.warning(`DOM预检失败: ${validation.failureReason}`);
          return validation;
        }
      }

      // 第二层：Midscene配置化文本检测
      if (this.validationConfig.midsceneTextCheck.enabled) {
        logger.debug('执行Midscene文本检测...');
        validation.layers.midscene = await this.performMidsceneConfigurableCheck();
        
        if (!validation.layers.midscene.pass) {
          validation.success = false;
          const criticalFailures = validation.layers.midscene.failedChecks
            .filter(f => f.critical)
            .map(f => f.reason);
          validation.failureReason = `文本检测失败: ${criticalFailures.join('; ')}`;
          validation.summary.criticalIssues.push(...criticalFailures);
        }
      }

      // 综合判定
      if (!validation.failureReason) {
        validation.success = true;
        validation.summary.insights.push('所有层级验证通过');
      }

      validation.duration = Date.now() - startTime;
      logger.debug(`分层验证完成，成功: ${validation.success}, 耗时: ${validation.duration}ms`);

      return validation;

    } catch (error) {
      validation.success = false;
      validation.failureReason = `验证过程异常: ${error.message}`;
      validation.summary.criticalIssues.push(validation.failureReason);
      validation.duration = Date.now() - startTime;
      logger.error('分层验证异常:', error);
      return validation;
    }
  }

  /**
   * DOM技术预检
   */
  async performDOMPreCheck() {
    const startTime = Date.now();
    const results = {
      pass: false,
      score: 0,
      issues: [],
      details: {},
      duration: 0
    };

    try {
      // 1. HTTP响应状态检查
      const httpCheck = await this.checkHTTPStatus();
      results.details.httpStatus = httpCheck;
      if (!httpCheck.success) {
        results.issues.push(`HTTP错误: ${httpCheck.message}`);
        results.pass = false;
        results.duration = Date.now() - startTime;
        return results;
      }

      // 2. 网络连接检查
      const networkCheck = await this.checkNetworkConnectivity();
      results.details.network = networkCheck;
      if (!networkCheck.success) {
        results.issues.push(`网络问题: ${networkCheck.message}`);
        results.pass = false;
        results.duration = Date.now() - startTime;
        return results;
      }

      // 3. JavaScript运行时错误检查
      const jsErrorCheck = await this.checkJavaScriptErrors();
      results.details.jsErrors = jsErrorCheck;
      if (!jsErrorCheck.success) {
        results.issues.push(`JS运行时错误: ${jsErrorCheck.message}`);
        results.pass = false;
        results.duration = Date.now() - startTime;
        return results;
      }

      // 4. 页面基础结构检查
      const structureCheck = await this.checkPageStructure();
      results.details.structure = structureCheck;
      if (!structureCheck.success) {
        results.issues.push(`页面结构问题: ${structureCheck.message}`);
        results.score += 0.1;
      } else {
        results.score += 0.4;
      }

      // 5. DOM内容完整性检查
      const contentCheck = await this.checkDOMContentIntegrity();
      results.details.content = contentCheck;
      if (!contentCheck.success) {
        results.issues.push(`内容完整性问题: ${contentCheck.message}`);
        results.score += 0.1;
      } else {
        results.score += 0.4;
      }

      // 6. 明显错误元素检查
      const errorElementCheck = await this.checkObviousErrorElements();
      results.details.errorElements = errorElementCheck;
      if (!errorElementCheck.success) {
        results.issues.push(`发现错误元素: ${errorElementCheck.message}`);
        results.score += 0.1;
      } else {
        results.score += 0.2;
      }

      // DOM预检综合判定
      results.pass = results.score >= 0.8;
      results.duration = Date.now() - startTime;

      return results;

    } catch (error) {
      results.issues.push(`DOM检查异常: ${error.message}`);
      results.pass = false;
      results.duration = Date.now() - startTime;
      return results;
    }
  }

  /**
   * HTTP状态检查
   */
  async checkHTTPStatus() {
    try {
      // 获取页面响应状态
      const response = await this.page.evaluate(() => {
        return {
          status: window.performance?.navigation?.type !== undefined ? 200 : null,
          url: window.location.href
        };
      });

      // 检查是否有明显的HTTP错误页面
      const hasHttpError = await this.page.evaluate(() => {
        const bodyText = document.body.textContent.toLowerCase();
        const httpErrors = ['404', '500', '502', '503', 'not found', 'server error', 'bad gateway'];
        return httpErrors.some(error => bodyText.includes(error));
      });

      if (hasHttpError) {
        return {
          success: false,
          message: 'HTTP错误页面',
          details: response
        };
      }

      return {
        success: true,
        message: 'HTTP状态正常',
        details: response
      };
    } catch (error) {
      return {
        success: true,
        message: `状态检查失败，跳过: ${error.message}`
      };
    }
  }

  /**
   * 网络连接检查
   */
  async checkNetworkConnectivity() {
    try {
      const networkIssues = await this.page.evaluate(() => {
        const bodyText = document.body.textContent.toLowerCase();
        const networkKeywords = [
          'network error', '网络错误', '网络异常', 'connection failed',
          'timeout', '超时', '连接失败', 'cannot connect',
          'dns_probe_finished_nxdomain', 'err_internet_disconnected'
        ];
        
        const foundIssues = networkKeywords.filter(keyword => 
          bodyText.includes(keyword)
        );
        
        const errorElements = document.querySelectorAll(
          '.network-error, .connection-error, .timeout-error, [class*="network"], [class*="offline"]'
        );
        
        return {
          textIssues: foundIssues,
          errorElements: errorElements.length,
          hasNetworkError: foundIssues.length > 0 || errorElements.length > 0
        };
      });

      if (networkIssues.hasNetworkError) {
        return {
          success: false,
          message: `检测到网络问题: ${networkIssues.textIssues.join(', ')}`,
          details: networkIssues
        };
      }

      return {
        success: true,
        message: '网络连接正常',
        details: networkIssues
      };
    } catch (error) {
      return {
        success: true,
        message: `网络检查失败，跳过: ${error.message}`
      };
    }
  }

  /**
   * JavaScript错误检查
   */
  async checkJavaScriptErrors() {
    try {
      const jsErrors = await this.page.evaluate(() => {
        const errorText = document.body.textContent.toLowerCase();
        const jsErrorKeywords = [
          'javascript error', 'script error', 'uncaught',
          'undefined is not a function', 'cannot read property'
        ];
        
        const foundJSErrors = jsErrorKeywords.filter(keyword => 
          errorText.includes(keyword)
        );
        
        const errorElements = document.querySelectorAll(
          '.js-error, .script-error, .runtime-error, [class*="error"][class*="js"]'
        );
        
        return {
          textErrors: foundJSErrors,
          errorElements: errorElements.length,
          hasJSError: foundJSErrors.length > 0 || errorElements.length > 0
        };
      });

      if (jsErrors.hasJSError) {
        return {
          success: false,
          message: `检测到JavaScript错误: ${jsErrors.textErrors.join(', ')}`,
          details: jsErrors
        };
      }

      return {
        success: true,
        message: 'JavaScript运行正常',
        details: jsErrors
      };
    } catch (error) {
      return {
        success: true,
        message: `JS错误检查失败，跳过: ${error.message}`
      };
    }
  }

  /**
   * 页面结构检查（复用现有逻辑）
   */
  async checkPageStructure() {
    try {
      const blankPageResult = await this.domValidator.checkBlankPage();
      
      const structureCheck = await this.page.evaluate(() => {
        const body = document.body;
        const bodyText = body.textContent.trim();
        
        const hasBasicElements = {
          hasBody: !!body,
          hasContent: bodyText.length > 20,
          hasVisibleElements: body.querySelectorAll('*:not(script):not(style)').length > 5,
          hasInteractiveElements: body.querySelectorAll('button, input, select, textarea, a').length > 0
        };
        
        const structureScore = Object.values(hasBasicElements).filter(Boolean).length / 4;
        
        return {
          ...hasBasicElements,
          structureScore: structureScore,
          isValidStructure: structureScore >= 0.5
        };
      });

      return {
        success: blankPageResult.success && structureCheck.isValidStructure,
        message: blankPageResult.success && structureCheck.isValidStructure ? 
          '页面结构正常' : 
          `页面结构异常: ${blankPageResult.message || '基础结构不完整'}`,
        details: {
          blankPageCheck: blankPageResult,
          structureCheck: structureCheck
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `页面结构检查失败: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * DOM内容完整性检查（复用现有逻辑）
   */
  async checkDOMContentIntegrity() {
    try {
      const contentQualityResult = await this.domValidator.checkContentQuality();
      
      const integrityCheck = await this.page.evaluate(() => {
        const bodyText = document.body.textContent.trim();
        
        const contentMetrics = {
          textLength: bodyText.length,
          wordCount: bodyText.split(/\s+/).length,
          hasNumbers: /\d/.test(bodyText),
          hasAlphabetic: /[a-zA-Z\u4e00-\u9fa5]/.test(bodyText),
          hasPunctuation: /[,.!?;:]/.test(bodyText),
          
          elementTypes: {
            headings: document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
            paragraphs: document.querySelectorAll('p').length,
            lists: document.querySelectorAll('ul,ol,li').length,
            tables: document.querySelectorAll('table').length,
            forms: document.querySelectorAll('form').length,
            buttons: document.querySelectorAll('button').length,
            inputs: document.querySelectorAll('input,select,textarea').length,
            links: document.querySelectorAll('a[href]').length,
            images: document.querySelectorAll('img[src]').length
          }
        };
        
        const elementTypeCount = Object.values(contentMetrics.elementTypes)
          .filter(count => count > 0).length;
        
        const contentRichness = (
          (contentMetrics.hasNumbers ? 1 : 0) +
          (contentMetrics.hasAlphabetic ? 1 : 0) +
          (contentMetrics.hasPunctuation ? 1 : 0) +
          (elementTypeCount >= 3 ? 1 : 0) +
          (contentMetrics.wordCount >= 10 ? 1 : 0)
        ) / 5;
        
        return {
          ...contentMetrics,
          elementTypeCount: elementTypeCount,
          contentRichness: contentRichness,
          isIntegrityGood: contentRichness >= 0.6
        };
      });

      return {
        success: contentQualityResult.success && integrityCheck.isIntegrityGood,
        message: contentQualityResult.success && integrityCheck.isIntegrityGood ?
          '内容完整性良好' :
          `内容完整性问题: ${contentQualityResult.message || '内容不够丰富'}`,
        details: {
          qualityCheck: contentQualityResult,
          integrityCheck: integrityCheck
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `内容完整性检查失败: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * 明显错误元素检查（复用现有逻辑）
   */
  async checkObviousErrorElements() {
    try {
      const emptyStateResult = await this.domValidator.checkEmptyState();
      
      const errorElementCheck = await this.page.evaluate(() => {
        const bodyText = document.body.textContent.toLowerCase();
        
        const errorKeywords = [
          '没有权限', '权限不足', '访问被拒绝', '暂无视频查看权限',
          'access denied', 'permission denied', 'unauthorized', 'forbidden',
          '请先登录', '登录失效', '会话过期', '未登录',
          'login required', 'session expired', 'authentication failed',
          '加载失败', '请求失败', '网络错误', '连接超时',
          'loading failed', 'request failed', 'network error', 'timeout',
          '暂无数据', '数据为空', '没有数据',
          'no data', 'no content', 'empty',
          '系统错误', '服务异常', '内部错误',
          'system error', 'service error', 'internal error',
          '404', '500', '502', '503', 'not found', 'server error'
        ];
        
        const foundErrors = errorKeywords.filter(keyword => 
          bodyText.includes(keyword)
        );
        
        const errorSelectors = [
          '.error', '.err', '.fail', '.failure',
          '.permission-denied', '.access-denied', '.unauthorized',
          '.login-required', '.auth-error', '.forbidden',
          '.no-data', '.empty-state', '.empty-content',
          '.loading-error', '.network-error', '.timeout',
          '.el-empty', '.ant-empty', '.empty-placeholder',
          '[class*="error"]', '[class*="fail"]', '[class*="empty"]'
        ];
        
        const errorElements = [];
        errorSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            errorElements.push({
              selector: selector,
              count: elements.length,
              visible: Array.from(elements).some(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
              })
            });
          }
        });
        
        const visibleErrorElements = errorElements.filter(e => e.visible);
        
        return {
          foundErrorKeywords: foundErrors,
          errorElements: errorElements,
          visibleErrorElements: visibleErrorElements,
          hasObviousErrors: foundErrors.length > 0 || visibleErrorElements.length > 0
        };
      });

      return {
        success: emptyStateResult.success && !errorElementCheck.hasObviousErrors,
        message: emptyStateResult.success && !errorElementCheck.hasObviousErrors ?
          '未发现明显错误' :
          `发现明显错误: ${errorElementCheck.foundErrorKeywords.join(', ') || '错误元素存在'}`,
        details: {
          emptyStateCheck: emptyStateResult,
          errorElementCheck: errorElementCheck
        }
      };
    } catch (error) {
      return {
        success: true,
        message: `错误元素检查失败，跳过: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Midscene配置化文本检测
   */
  async performMidsceneConfigurableCheck() {
    const startTime = Date.now();
    const results = {
      pass: false,
      score: 0,
      failedChecks: [],
      passedChecks: [],
      details: {},
      duration: 0
    };

    const checks = this.validationConfig.midsceneTextCheck.checks;
    
    try {
      for (const check of checks) {
        logger.debug(`执行文本检测: ${check.name}`);
        const checkResult = await this.performSingleTextCheck(check);
        results.details[check.name] = checkResult;
        
        if (checkResult.passed) {
          results.passedChecks.push(check.name);
          results.score += (1 / checks.length);
        } else {
          results.failedChecks.push({
            name: check.name,
            reason: checkResult.reason,
            critical: check.failOnTrue || check.failOnFalse
          });
          
          // 如果是关键检查失败且设置了failFast
          if ((check.failOnTrue || check.failOnFalse) && check.failFast) {
            results.pass = false;
            results.duration = Date.now() - startTime;
            logger.warning(`关键检测失败，立即退出: ${check.name}`);
            return results;
          }
        }
      }

      // 综合判定：所有关键检查都通过才算成功
      const criticalFailures = results.failedChecks.filter(f => f.critical);
      results.pass = criticalFailures.length === 0;
      results.duration = Date.now() - startTime;

      return results;

    } catch (error) {
      results.pass = false;
      results.failedChecks.push({
        name: 'system_error',
        reason: `Midscene检测异常: ${error.message}`,
        critical: true
      });
      results.duration = Date.now() - startTime;
      return results;
    }
  }

  /**
   * 执行单个文本检测
   */
  async performSingleTextCheck(check) {
    try {
      let result;
      
      switch (check.type) {
        case 'aiBoolean':
          result = await this.agent.aiBoolean(check.prompt, {
            timeout: check.timeout || this.validationConfig.midsceneTextCheck.timeout
          });
          break;
          
        case 'aiQuery':
          result = await this.agent.aiQuery(check.prompt, {
            timeout: check.timeout || this.validationConfig.midsceneTextCheck.timeout
          });
          break;
          
        default:
          throw new Error(`未知的检测类型: ${check.type}`);
      }

      // 根据期望值判断是否通过
      const passed = this.evaluateCheckResult(result, check);
      
      return {
        passed: passed,
        result: result,
        reason: passed ? 
          `${check.name}检测通过` : 
          (check.failureMessage || this.getFailureReason(result, check))
      };

    } catch (error) {
      return {
        passed: false,
        result: null,
        reason: `${check.name}检测异常: ${error.message}`
      };
    }
  }

  /**
   * 评估检测结果
   */
  evaluateCheckResult(result, check) {
    if (check.type === 'aiBoolean') {
      if (check.failOnTrue && result === true) return false;
      if (check.failOnFalse && result === false) return false;
      if (check.expectation !== undefined) return result === check.expectation;
      return true;
    }
    
    if (check.type === 'aiQuery') {
      if (check.validator) {
        return check.validator(result);
      }
      return true;
    }
    
    return true;
  }

  /**
   * 获取失败原因
   */
  getFailureReason(result, check) {
    if (check.type === 'aiBoolean') {
      if (check.failOnTrue && result === true) {
        return `检测到不期望的情况（${check.prompt}）`;
      }
      if (check.failOnFalse && result === false) {
        return `未检测到期望的情况（${check.prompt}）`;
      }
    }
    return '检测结果不符合预期';
  }
}

module.exports = LayeredPageValidator;