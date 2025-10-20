const { logger } = require('./logger');

/**
 * 从配置对象中设置环境变量
 * 优先级：系统环境变量 > 配置文件 env 字段
 * @param {object} config - 配置对象
 */
function applyEnvFromConfig(config) {
  if (!config || !config.env || typeof config.env !== 'object') {
    return;
  }

  logger.debug('检查配置文件中的环境变量设置...');
  
  Object.keys(config.env).forEach(key => {
    const configValue = config.env[key];
    
    if (!configValue) {
      return; // 跳过空值
    }
    
    // 优先使用系统环境变量
    if (process.env[key]) {
      logger.debug(`✓ 使用系统环境变量: ${key}`);
    } else {
      // 如果系统没有，使用配置文件中的值
      process.env[key] = String(configValue);
      logger.debug(`✓ 从配置文件设置环境变量: ${key}`);
    }
  });
  
  // 验证关键环境变量
  const requiredEnvVars = ['OPENAI_API_KEY'];
  const missingVars = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missingVars.length > 0) {
    logger.warning(`⚠️  缺少必需的环境变量: ${missingVars.join(', ')}`);
    logger.warning('请在配置文件的 env 字段中设置，或使用系统环境变量');
  }
  
  // 提示模型配置
  if (process.env.MIDSCENE_MODEL_NAME) {
    logger.debug(`✓ 使用模型: ${process.env.MIDSCENE_MODEL_NAME}`);
  } else if (process.env.OPENAI_BASE_URL && process.env.OPENAI_BASE_URL.includes('dashscope')) {
    logger.warning('⚠️  检测到使用阿里千问，建议设置 MIDSCENE_MODEL_NAME（如 qwen-vl-plus）');
  }
}

/**
 * 获取当前环境变量状态（用于调试）
 */
function getEnvStatus() {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '已设置' : '未设置',
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || '使用默认',
    OPENAI_MODEL: process.env.OPENAI_MODEL || '使用默认'
  };
}

module.exports = {
  applyEnvFromConfig,
  getEnvStatus
};

