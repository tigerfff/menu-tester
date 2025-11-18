/**
 * Playwright 设备预设配置
 * 基于 Playwright 内置设备描述符
 */

const devicePresets = {
  // 桌面设备
  'Desktop Chrome': {
    name: 'Desktop Chrome',
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false
  },
  'Desktop Firefox': {
    name: 'Desktop Firefox',
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false
  },
  'Desktop Safari': {
    name: 'Desktop Safari',
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false
  },
  
  // iPhone 设备
  'iPhone SE': {
    name: 'iPhone SE',
    viewport: { width: 375, height: 667 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  },
  'iPhone 6/7/8': {
    name: 'iPhone 6/7/8',
    viewport: { width: 375, height: 667 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  },
  'iPhone 6/7/8 Plus': {
    name: 'iPhone 6/7/8 Plus',
    viewport: { width: 414, height: 736 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  'iPhone X': {
    name: 'iPhone X',
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  'iPhone 11 Pro': {
    name: 'iPhone 11 Pro',
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  'iPhone 12 Pro': {
    name: 'iPhone 12 Pro',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  'iPhone 13 Pro': {
    name: 'iPhone 13 Pro',
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  'iPhone 14 Pro': {
    name: 'iPhone 14 Pro',
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  'iPhone 15 Pro': {
    name: 'iPhone 15 Pro',
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  
  // iPad 设备
  'iPad': {
    name: 'iPad',
    viewport: { width: 768, height: 1024 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  },
  'iPad Pro': {
    name: 'iPad Pro',
    viewport: { width: 1024, height: 1366 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  },
  'iPad Mini': {
    name: 'iPad Mini',
    viewport: { width: 768, height: 1024 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  },
  
  // Android 设备
  'Galaxy S5': {
    name: 'Galaxy S5',
    viewport: { width: 360, height: 640 },
    userAgent: 'Mozilla/5.0 (Linux; Android 5.0; SM-G900P Build/LRX21T) AppleWebKit/537.36',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  'Galaxy S8': {
    name: 'Galaxy S8',
    viewport: { width: 360, height: 740 },
    userAgent: 'Mozilla/5.0 (Linux; Android 7.0; SM-G950F Build/NRD90M) AppleWebKit/537.36',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  'Galaxy S9+': {
    name: 'Galaxy S9+',
    viewport: { width: 320, height: 658 },
    userAgent: 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G965F Build/R16NW) AppleWebKit/537.36',
    deviceScaleFactor: 4.5,
    isMobile: true,
    hasTouch: true
  },
  'Pixel 5': {
    name: 'Pixel 5',
    viewport: { width: 393, height: 851 },
    userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  },
  'Pixel 7': {
    name: 'Pixel 7',
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36',
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true
  }
};

/**
 * 获取设备预设列表
 * @returns {Array} 设备列表
 */
function getDevicePresets() {
  return Object.keys(devicePresets).map(key => ({
    key,
    ...devicePresets[key]
  }));
}

/**
 * 按类型获取设备预设
 * @returns {Object} 按类型分组的设备
 */
function getDevicePresetsByType() {
  return {
    desktop: Object.keys(devicePresets)
      .filter(key => !devicePresets[key].isMobile)
      .map(key => ({ key, ...devicePresets[key] })),
    mobile: Object.keys(devicePresets)
      .filter(key => devicePresets[key].isMobile && !key.includes('iPad'))
      .map(key => ({ key, ...devicePresets[key] })),
    tablet: Object.keys(devicePresets)
      .filter(key => key.includes('iPad'))
      .map(key => ({ key, ...devicePresets[key] }))
  };
}

/**
 * 获取设备预设配置
 * @param {string} presetName - 预设名称
 * @returns {Object|null} 设备配置
 */
function getDevicePreset(presetName) {
  return devicePresets[presetName] || null;
}

/**
 * 解析 viewport 配置
 * @param {Object} viewportConfig - viewport 配置
 * @returns {Object} Playwright context 配置
 */
function parseViewportConfig(viewportConfig) {
  if (!viewportConfig) {
    // 默认桌面配置
    return {
      viewport: { width: 1920, height: 1080 },
      userAgent: undefined
    };
  }

  // 如果使用预设
  if (viewportConfig.preset) {
    const preset = getDevicePreset(viewportConfig.preset);
    if (preset) {
      return {
        viewport: preset.viewport,
        userAgent: preset.userAgent,
        deviceScaleFactor: preset.deviceScaleFactor,
        isMobile: preset.isMobile,
        hasTouch: preset.hasTouch
      };
    } else {
      throw new Error(`未知的设备预设: ${viewportConfig.preset}`);
    }
  }

  // 如果使用自定义配置
  if (viewportConfig.custom) {
    const custom = viewportConfig.custom;
    return {
      viewport: {
        width: custom.width || 1920,
        height: custom.height || 1080
      },
      userAgent: custom.userAgent,
      deviceScaleFactor: custom.deviceScaleFactor,
      isMobile: custom.isMobile || false,
      hasTouch: custom.hasTouch || false
    };
  }

  // 兼容旧格式：直接指定 width 和 height
  if (viewportConfig.width || viewportConfig.height) {
    return {
      viewport: {
        width: viewportConfig.width || 1920,
        height: viewportConfig.height || 1080
      },
      userAgent: viewportConfig.userAgent
    };
  }

  // 默认配置
  return {
    viewport: { width: 1920, height: 1080 },
    userAgent: undefined
  };
}

module.exports = {
  devicePresets,
  getDevicePresets,
  getDevicePresetsByType,
  getDevicePreset,
  parseViewportConfig
};

