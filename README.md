# 菜单测试工具（Menu Tester）

基于 Playwright 与 Midscene.js 的智能菜单测试 CLI 工具，用于自动发现并验证管理后台的导航菜单。

## 功能特性

- 🤖 **AI 菜单发现**：自动识别并测试页面菜单
- 🔐 **令牌注入**：支持 Cookie / LocalStorage / Header 多种方式
- 📊 **进度追踪**：支持断点续跑、统计与结果输出
- 🛡️ **稳健容错**：异常处理、自动重试
- ⚡ **快速校验**：默认 6s 页面超时
- 📸 **截图可选**：用于调试与证据留存

## 环境要求

- Node.js >= 18.0.0
- 可用的 AI 模型访问（OpenAI/Anthropic 或公司网关）

## 安装

```bash
# 全局安装（推荐）
npm install -g @hik-cloud/midscene-menu-tester

# 如需手动安装浏览器
npx playwright install chromium
```

## 配置

### 环境变量（推荐其一）

```bash
# 临时设置并运行（单次）
OPENAI_API_KEY=sk-xxx menu-tester test --config config.json

# 会话级设置
export OPENAI_API_KEY=sk-xxx

# 使用 .env（在运行目录创建）
echo "OPENAI_API_KEY=sk-xxx" > .env
```

可选：`OPENAI_BASE_URL` 指向公司内网网关，客户端无需持有真实 Key。

### 配置文件示例

**基础配置：**
```json
{
  "url": "https://admin.example.com",
  "token": "your-access-token",
  "tokenMethod": "cookie",
  "tokenName": "access_token",
  "mode": "hybrid",
  "depth": 2,
  "timeout": 6000,
  "headless": true,
  "retry": 2,
  "skip": "logout,exit,注销",
  "screenshots": false,
  "verbose": false
}
```

**单文件配置（含路由）：**
```json
{
  "url": "https://admin.example.com",
  "token": "your-access-token",
  "mode": "route",
  "routes": [
    { "menuText": "首页", "url": "https://admin.example.com/home" },
    { "menuText": "用户管理", "url": "https://admin.example.com/users" },
    { "menuText": "系统设置", "url": "https://admin.example.com/settings" }
  ]
}
```

**完整配置（含页面断言）：**
```json
{
  "url": "https://admin.example.com",
  "token": "your-access-token",
  "mode": "hybrid",
  "timeout": 6000,
  "headless": true,
  "screenshots": false,
  "pageAssertions": {
    "enabled": true,
    "midsceneTextCheck": {
      "enabled": true,
      "timeout": 8000,
      "concurrency": 2,
      "checks": [
        {
          "name": "非白屏检查",
          "type": "aiBoolean",
          "prompt": "页面是否是白屏、空白页面或只显示加载状态？",
          "failOnTrue": true,
          "failFast": false,
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
  }
}
```

## 使用方式

### Web 配置界面（推荐）

```bash
menu-tester serve              # 启动
menu-tester serve --port 8080  # 指定端口
menu-tester serve --no-open    # 不自动打开浏览器
```

浏览器中可完成：基础配置、路由管理、页面断言、导出配置。

### 命令行

```bash
# 使用配置文件（推荐）
menu-tester test --config config.json

# 单文件配置（含路由）
menu-tester test --config config-with-routes.json

# AI 模式
menu-tester test --mode ai --config config.json

# 混合模式（默认）
menu-tester test --mode hybrid --config config.json

# 路由模式（传统方式：分离的路由文件）
menu-tester routes import routes.json
menu-tester test --mode route

# 详细日志
menu-tester test --config config.json --verbose
```

## 页面断言配置

页面断言用于智能验证页面内容，检测常见错误（白屏、权限错误、接口错误等）。

### 配置说明

**`pageAssertions.enabled`** - 页面断言总开关（默认 true）

**`midsceneTextCheck`** - AI 文本检查配置：
- `enabled` - 启用 AI 语义检查
- `timeout` - 单个检查超时时间（毫秒）
- `concurrency` - 并发检查数（1-5）
- `checks` - 检查项数组（可自定义）

### 检查项配置

每个检查项包含以下字段：

- **`name`** - 检查名称（如："非白屏检查"）
- **`type`** - 检查类型（`aiBoolean` 或 `aiQuery`）
- **`prompt`** - AI 检查提示词（描述要检查的内容）
- **`failOnTrue`** - 检测为真时失败（用于检测错误情况）
- **`failFast`** - 立即失败（此项失败时跳过后续检查）
- **`timeout`** - 单项超时时间（毫秒）
- **`failureMessage`** - 失败时的提示消息

### 默认检查项

1. **非白屏检查** - 检测页面是否白屏或空白（`failFast: false`）
2. **无权限错误检查** - 检测权限错误（`failFast: true`，立即失败）
3. **无接口错误检查** - 检测接口/网络错误（`failFast: false`）
4. **有效业务内容检查** - 检测是否有有效业务内容（`failFast: false`）

### Web 界面管理

在 Web 配置界面的"页面断言"选项卡中，可以：
- ✅ 启用/禁用页面断言
- ➕ 添加自定义检查项
- ✏️ 编辑检查项的提示词和配置
- 🗑️ 删除不需要的检查项
- 🔄 恢复为默认的 4 个检查项

## 截图保存

- **开启方式**：在配置中设置 `"screenshots": true`，或在 Web 配置界面勾选"截图保存"。
- **触发时机**：每次页面验证完成后（无论成功/失败），都会尝试截图作为证据。
- **保存位置**：由 Midscene 代理统一管理，落盘至项目根目录下的 `midscene_run/` 的本次会话目录中；同时会在 `midscene_run/report/{会话ID}.html` 报告中引用展示。
- **命名规则**：`menu-{菜单id}-{success|failed}-{时间戳}.png`，便于定位与比对。
- **查看方式**：
  - 运行结束后，打开 `midscene_run/report/{会话ID}.html` 查看可视化报告与截图。
  - 若需原图，进入 `midscene_run/` 下最新会话目录，按上述文件名前缀查找。

## 截图对比（视觉回归测试）

支持像素级截图对比，自动检测UI变化，适用于回归测试和CI/CD集成。

### 快速开始

**1. 配置截图对比**

在配置文件中添加：
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

**2. 首次运行（建立基线）**
```bash
# 设置 updateBaseline: true，使用AI模式建立基线
menu-tester --config config/hik-config.json
```

**3. 回归测试（对比模式）**
```bash
# 设置 updateBaseline: false，使用路由模式快速对比
menu-tester routes test --config config/hik-config.json
```

### 核心特性

- ✅ **统一Key生成**：菜单模式和路由模式使用相同的URL标准化策略
- ✅ **像素级对比**：使用 pixelmatch 进行精确对比
- ✅ **可视化差异图**：自动生成红色标注的差异图
- ✅ **灵活配置**：可调整敏感度阈值（0-1）

### 使用场景

**AI发现 + 路由回归**（推荐）
```bash
# Day 1: AI模式全面发现，建立基线
menu-tester --config config.json  # updateBaseline=true

# Day 2-N: 路由模式快速回归
menu-tester routes test --config config.json  # updateBaseline=false
```

### 配置说明

| 配置项 | 说明 |
|--------|------|
| `enabled` | 是否启用截图对比 |
| `threshold` | 差异阈值（0-1），越小越严格 |
| `updateBaseline` | 是否更新基线截图 |
| `failOnDiff` | 发现差异时是否立即失败 |

📖 **详细文档**：[截图对比功能使用指南](./docs/screenshot-comparison-guide.md)

## 常见问题（FAQ）

- **如何提供 AI 密钥？** 使用环境变量（临时、export、或 .env）。不建议把密钥写入代码或包内。
- **截图有什么用？** 便于调试失败用例、生成报告证据，CI 排查更直观。
- **token 与 OPENAI_API_KEY 有何区别？** 前者是被测系统的访问令牌；后者是调用大模型的凭证。
- **组织内如何更安全？** 配置 `OPENAI_BASE_URL` 指向公司网关，客户端无需真实 Key。

## 许可证

MIT