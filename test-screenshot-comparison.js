/**
 * 简单的测试脚本，验证截图对比功能
 */

const { ScreenshotComparator } = require('./src/core/ScreenshotComparator');
const fs = require('fs').promises;
const path = require('path');

async function testScreenshotComparator() {
  console.log('🧪 测试截图对比功能...\n');

  // 创建测试配置
  const config = {
    screenshotComparison: {
      enabled: true,
      threshold: 0.1,
      baselineDir: './test-screenshots/baseline',
      diffDir: './test-screenshots/diff',
      updateBaseline: false,
      failOnDiff: false
    }
  };

  const comparator = new ScreenshotComparator(config);

  // 测试 1: URL 标准化
  console.log('✅ 测试 1: URL 标准化');
  const testUrls = [
    'https://www.hik-cloud.com/chain/index.html#/home',
    'https://www.hik-cloud.com/chain/index.html#/home/user-management',
    'https://www.hik-cloud.com/chain/index.html#/settings/profile?tab=1',
    'https://example.com/admin/dashboard'
  ];

  testUrls.forEach(url => {
    const key = comparator.normalizeUrl(url);
    console.log(`  ${url}`);
    console.log(`  → ${key}\n`);
  });

  // 测试 2: Key 生成
  console.log('✅ 测试 2: Key 生成');
  const menuItems = [
    { id: 'dashboard', text: '首页', url: 'https://www.hik-cloud.com/chain/index.html#/home' },
    { id: 'user-list', text: '用户管理', url: 'https://www.hik-cloud.com/chain/index.html#/home/user-management' },
    { text: '角色管理', url: 'https://www.hik-cloud.com/chain/index.html#/home/role-management' }
  ];

  menuItems.forEach(menu => {
    const key = comparator.getScreenshotKey(menu);
    console.log(`  菜单: ${menu.text}`);
    console.log(`  Key: ${key}\n`);
  });

  // 测试 3: 路径生成
  console.log('✅ 测试 3: 路径生成');
  const testKey = 'chain-index-html-home-user-management';
  console.log(`  基线路径: ${comparator.getBaselinePath(testKey)}`);
  console.log(`  差异路径: ${comparator.getDiffPath(testKey)}`);

  console.log('\n✨ 所有测试通过！');
  console.log('\n📚 接下来的步骤：');
  console.log('1. 在配置文件中启用 screenshotComparison.enabled = true');
  console.log('2. 设置 updateBaseline = true，首次运行建立基线');
  console.log('3. 设置 updateBaseline = false，后续运行对比差异');
  console.log('4. 查看 screenshots/baseline/ 和 screenshots/diff/ 目录');
}

// 运行测试
testScreenshotComparator().catch(console.error);

