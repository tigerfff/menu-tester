# 菜单测试工具（Menu Tester）

基于 Playwright 与 Midscene.js 的菜单回归测试 CLI 工具。当前版本聚焦于**路由驱动**的验证流程：提前维护好需要巡检的页面 URL（含页面标题/菜单名），工具即可依次完成登录、导航、校验、截图与报告输出。

## 功能特性

- 📍 **路由驱动测试**：基于静态路由清单快速巡检关键页面
- 🔐 **令牌注入**：支持 Cookie / LocalStorage / Header 多种方式
- 📊 **进度追踪**：自动记录执行状态与统计信息
- 🛡️ **稳健容错**：异常处理、自动重试、失败快照
- ⚡ **快速校验**：默认 6 秒超时并结合 Midscene AI 做页面断言
- 📸 **可选截图**：支持基线建立与视觉回归比对

> ❗️提示：原有的“AI 自动发现菜单”与“混合模式”功能已经下线，现仅保留路由列表驱动的测试方式。

## 环境要求

- Node.js >= 18.0.0
- 可访问 Midscene 兼容接口的大模型服务（OpenAI / 企业网关 / 通义千问等）

## 安装

```bash
# 全局安装（推荐）
npm install -g menu-tester

# 如需手动安装 Playwright 浏览器
npx playwright install chromium
```

## AI 服务配置

可通过配置文件或环境变量提供 AI 凭证，两者优先级如下：

`环境变量` > `配置文件 env 字段` > `.env 文件`

示例参考：

```json
{
  "url": "https://your-app.com",
  "token": "your-token",
  "env": {
    "OPENAI_API_KEY": "sk-xxx",
    "OPENAI_BASE_URL": "https://api.openai.com/v1",
    "MIDSCENE_MODEL_NAME": "gpt-4o"
  }
}
```

更多接入示例见 `docs/env-config-guide.md` 与 `docs/qwen-config-example.md`。

## 配置文件示例

最小工作配置（包含路由清单）：

```json
{
  "url": "https://admin.example.com",
  "token": "your-access-token",
  "timeout": 6000,
  "headless": true,
  "retry": 2,
  "routes": [
    { "menuText": "首页", "url": "https://admin.example.com/home" },
    { "menuText": "用户管理", "url": "https://admin.example.com/users" },
    { "menuText": "系统设置", "url": "https://admin.example.com/settings" }
  ]
}
```

完整配置（含 LocalStorage 注入、页面断言、截图对比）：

```json
{
  "url": "https://admin.example.com",
  "token": "your-access-token",
  "timeout": 6000,
  "headless": true,
  "retry": 2,
  "screenshots": true,
  "localStorageItems": {
    "guide_shown": "1",
    "theme": "dark"
  },
  "routes": [
    { "menuText": "首页", "url": "https://admin.example.com/home" },
    { "menuText": "巡检中心", "url": "https://admin.example.com/inspect" }
  ],
  "pageAssertions": {
    "enabled": true,
    "midsceneTextCheck": {
      "enabled": true,
      "timeout": 8000,
      "checks": [
        {
          "name": "非白屏检查",
          "type": "aiBoolean",
          "prompt": "页面是否是白屏、空白页面或只显示加载状态？",
          "failOnTrue": true,
          "timeout": 5000,
          "failureMessage": "检测到白屏或空白页面"
        },
        {
          "name": "无权限错误检查",
          "type": "aiBoolean",
          "prompt": "页面是否显示权限相关的错误信息？",
          "failOnTrue": true,
          "failFast": true,
          "timeout": 5000,
          "failureMessage": "检测到权限错误"
        }
      ]
    }
  },
  "screenshotComparison": {
    "enabled": true,
    "baselineDir": "./screenshots/baseline",
    "diffDir": "./screenshots/diff",
    "threshold": 0.1,
    "updateBaseline": false,
    "failOnDiff": false
  }
}
```

## 常用命令

```bash
# 运行路由测试
menu-tester test --config config.json

# 导出当前缓存的路由列表
menu-tester routes export ./routes.json

# 从文件导入路由（merge / replace）
menu-tester routes import ./routes.json --mode replace

# 查看路由统计
menu-tester routes stats --config config.json

# 启动图形化配置界面
menu-tester serve --port 8080

# 输出详细日志
menu-tester test --config config.json --verbose
```

## LocalStorage 自动注入

通过 `localStorageItems` 配置项，可在每次导航前自动写入键值，用于：

- 屏蔽新手引导/弹窗
- 预置主题、语言等首选项
- 模拟特定的业务状态

示例：

```json
{
  "localStorageItems": {
    "tutorial_completed": "true",
    "preferred_theme": "dark"
  }
}
```

## 页面断言

`pageAssertions` 依赖 Midscene AI 快速判断页面是否出现白屏、403、接口错误等异常，可自定义检查项。详细参数请参考 `docs/page-assertions-guide.md`。

## 截图与视觉回归

启用 `screenshots` 后，工具会对每个路由拍摄快照并存放于 `midscene_run/` 目录。结合 `screenshotComparison` 可建立基线并进行像素级 diff：

1. **建立基线**（`updateBaseline: true`）  
   `menu-tester test --config config.json`

2. **回归对比**（`updateBaseline: false`）  
   `menu-tester test --config config.json`

差异图默认存放在 `screenshots/diff` 目录。

## FAQ

- **为什么仍需要 AI 服务？**  
  虽然不再自动发现菜单，但页面断言、白屏检测等仍依赖 Midscene 的语义能力。

- **可以继续使用旧的 AI 菜单缓存吗？**  
  不支持。请改用路由文件（JSON/CSV）维护入口清单。

- **如何保证路由列表最新？**  
  建议将路由文件纳入版本控制，随业务调整同步更新。

- **截图是否会自动保存？**  
  需显式开启 `screenshots`。若同时启用 `screenshotComparison` 可对比基线差异。

## 许可证

MIT

