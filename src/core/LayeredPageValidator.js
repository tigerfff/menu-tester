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
      midsceneTextCheck: {
        enabled: true,
        timeout: 5000,
        checks: [],
        ...config.pageAssertions?.midsceneTextCheck
      }
    };
  }

  /**
   * 主要的页面验证入口
   */
  async validatePageWithLayers(context = {}) {
    const startTime = Date.now();
    const validation = {
      success: false,
      layers: {
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
      logger.info('LayeredPageValidator - 开始页面验证...');
      logger.debug('LayeredPageValidator - 验证配置:', JSON.stringify(this.validationConfig, null, 2));

      // Midscene AI 文本检测
      if (this.validationConfig.midsceneTextCheck.enabled) {
        logger.debug('执行 Midscene AI 文本检测...');
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