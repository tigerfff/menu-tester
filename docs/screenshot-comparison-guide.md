# 截图对比功能使用指南

## 功能概述

截图对比功能允许你在菜单测试过程中自动对比页面截图，及早发现UI变化和回归问题。支持**菜单模式**和**路由模式**两种使用方式，并使用统一的URL-based key生成策略，确保两种模式的截图可以互相对比。

## 核心特性

- ✅ **统一Key生成**：菜单模式和路由模式使用相同的URL标准化策略
- ✅ **像素级对比**：使用 pixelmatch 进行精确的像素对比
- ✅ **可视化差异图**：自动生成红色标注的差异图
- ✅ **灵活配置**：可调整敏感度阈值
- ✅ **基线管理**：自动保存和更新基线截图

## 配置说明

在配置文件（如 `config/hik-config.json`）中添加 `screenshotComparison` 配置：

```json
{
  "screenshots": true,
  "screenshotComparison": {
    "enabled": true,
    "threshold": 0.1,
    "baselineDir": "./screenshots/baseline",
    "diffDir": "./screenshots/diff",
    "updateBaseline": false,
    "failOnDiff": false
  }
}
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | false | 是否启用截图对比功能 |
| `threshold` | number | 0.1 | 差异阈值 (0-1)，越小越严格 |
| `baselineDir` | string | ./screenshots/baseline | 基线截图存放目录 |
| `diffDir` | string | ./screenshots/diff | 差异图存放目录 |
| `updateBaseline` | boolean | false | 是否更新基线截图 |
| `failOnDiff` | boolean | false | 发现差异时是否立即失败 |

## 使用流程

### 第一步：建立基线（首次运行）

使用AI模式发现菜单并建立截图基线：

```bash
# 启用截图对比并设置为更新基线模式
menu-tester --config config/hik-config.json
```

确保配置文件中：
```json
{
  "screenshots": true,
  "screenshotComparison": {
    "enabled": true,
    "updateBaseline": true  // 首次运行设为 true
  }
}
```

**输出示例**：
```
📸 已创建基线截图: chain-index-html-home
📸 已创建基线截图: chain-index-html-home-user-management
📸 已创建基线截图: chain-index-html-home-role-management
...
```

基线截图保存在 `screenshots/baseline/` 目录：
```
screenshots/baseline/
├── chain-index-html-home.png
├── chain-index-html-home-user-management.png
└── chain-index-html-home-role-management.png
```

### 第二步：回归测试（对比模式）

将 `updateBaseline` 改为 `false`，使用路由模式快速回归：

```bash
# 使用路由模式进行快速回归测试
menu-tester routes test --config config/hik-config.json
```

**输出示例**：
```
✅ 测试路由 1/10: 首页
   截图对比通过: chain-index-html-home (差异 0.03%)

✅ 测试路由 2/10: 用户管理
   截图对比通过: chain-index-html-home-user-management (差异 0.15%)

⚠️  测试路由 3/10: 角色管理
   截图差异检测: chain-index-html-home-role-management (差异 3.45%)
   差异图: screenshots/diff/chain-index-html-home-role-management-diff-2025-10-16T11-20-33.png
```

### 第三步：处理差异

当发现差异时：

1. **查看差异图**：打开 `screenshots/diff/` 目录中的差异图，红色部分表示差异区域
2. **分析原因**：
   - 如果是预期的UI更新 → 更新基线
   - 如果是意外的回归问题 → 修复代码
3. **更新基线**（如果需要）：
   ```bash
   # 设置 updateBaseline 为 true 重新运行
   # 或手动替换 baseline 目录中的对应文件
   ```

## Key生成规则

两种模式使用统一的URL标准化策略：

### URL标准化示例

| 原始URL | 生成的Key |
|---------|-----------|
| `https://www.hik-cloud.com/chain/index.html#/home` | `chain-index-html-home` |
| `https://www.hik-cloud.com/chain/index.html#/home/user-management` | `chain-index-html-home-user-management` |
| `https://www.hik-cloud.com/chain/index.html#/settings/profile?tab=1` | `chain-index-html-settings-profile` |

**规则**：
1. 提取路径部分和hash部分
2. 移除查询参数（`?` 后面的部分）
3. 将 `/`、`.`、`#` 等特殊字符替换为 `-`
4. 转换为小写

这确保了：
- ✅ 菜单模式和路由模式生成相同的key
- ✅ 临时参数不影响对比（如时间戳、会话ID）
- ✅ 可读性强，易于定位

## 目录结构

```
project/
├── screenshots/
│   ├── baseline/              # 基线截图（首次运行时创建）
│   │   ├── chain-index-html-home.png
│   │   ├── chain-index-html-home-user-management.png
│   │   └── chain-index-html-home-role-management.png
│   └── diff/                  # 差异图（仅在有差异时生成）
│       ├── chain-index-html-home-role-management-diff-2025-10-16T11-20-33.png
│       └── chain-index-html-settings-diff-2025-10-16T11-25-45.png
└── midscene_run/              # Midscene 的报告和截图
    └── report/
        └── session-xxx.html
```

## 使用场景

### 场景1：AI发现 + 路由回归

```bash
# Day 1: 使用AI模式全面发现菜单，建立基线
menu-tester --config config/hik-config.json
# 配置: updateBaseline=true, enabled=true

# Day 2-N: 使用路由模式快速回归测试
menu-tester routes test --config config/hik-config.json
# 配置: updateBaseline=false, enabled=true
```

### 场景2：纯路由模式

```bash
# 1. 导入或创建路由配置
menu-tester routes import --input routes.json

# 2. 首次运行建立基线
menu-tester routes test --config config/hik-config.json
# 配置: updateBaseline=true

# 3. 后续回归测试
menu-tester routes test --config config/hik-config.json
# 配置: updateBaseline=false
```

### 场景3：CI/CD集成

```yaml
# .github/workflows/visual-regression.yml
name: Visual Regression Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Install dependencies
        run: npm install
      
      - name: Run visual regression tests
        run: menu-tester routes test --config config/ci-config.json
        env:
          FAIL_ON_DIFF: true  # CI中发现差异时失败
      
      - name: Upload diff images
        if: failure()
        uses: actions/upload-artifact@v2
        with:
          name: screenshot-diffs
          path: screenshots/diff/
```

## 调试技巧

### 1. 查看详细日志

```bash
menu-tester --config config/hik-config.json --verbose
```

### 2. 调整敏感度

如果对比过于严格或宽松，调整 `threshold` 值：

```json
{
  "screenshotComparison": {
    "threshold": 0.05  // 更严格（5%差异即报告）
    // 或
    "threshold": 0.2   // 更宽松（20%差异才报告）
  }
}
```

### 3. 忽略动态内容

对于包含动态内容（如时间戳、随机数据）的页面，可以：
- 增加 threshold 值
- 或在测试前设置固定的mock数据

## 常见问题

### Q1: 为什么菜单模式和路由模式的key不一致？

A: 确保菜单对象包含 `url` 属性。PageValidator 会自动从 `this.page.url()` 获取当前URL。

### Q2: 如何批量更新基线？

A: 设置 `updateBaseline: true` 并重新运行测试：
```bash
menu-tester routes test --config config/hik-config.json
```

### Q3: 差异图在哪里？

A: 在 `screenshots/diff/` 目录中，文件名包含时间戳。

### Q4: 如何禁用截图对比但保留截图？

A: 设置 `screenshots: true` 但 `screenshotComparison.enabled: false`：
```json
{
  "screenshots": true,
  "screenshotComparison": {
    "enabled": false
  }
}
```

## 性能建议

1. **基线存储**：将 `screenshots/baseline/` 提交到git，团队共享基线
2. **差异图**：将 `screenshots/diff/` 添加到 `.gitignore`，避免提交临时文件
3. **并发测试**：路由模式支持并发，但截图对比会增加IO开销，建议 `concurrent: 1-2`

## 下一步

- 了解更多关于[路由管理](./cache-guide.md)
- 查看[页面断言配置](./page-assertions-guide.md)
- 阅读[完整文档](../README.md)

