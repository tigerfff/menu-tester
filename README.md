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

### 配置文件示例（可选）

```json
{
  "url": "https://admin.example.com",
  "token": "your-access-token",
  "tokenMethod": "cookie",
  "tokenName": "access_token",
  "depth": 2,
  "timeout": 6000,
  "headless": true,
  "output": "./results",
  "retry": 2,
  "skip": "logout,exit,注销",
  "include": "*",
  "screenshots": false,
  "verbose": false
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
# 使用配置文件
menu-tester test --config config.json

# 路由模式
menu-tester routes import routes.json
menu-tester test --mode route

# AI 模式
menu-tester test --mode ai --config config.json

# 混合模式（默认推荐）
menu-tester test --mode hybrid --config config.json

# 详细日志
menu-tester test --config config.json --verbose
```

## 常见问题（FAQ）

- **如何提供 AI 密钥？** 使用环境变量（临时、export、或 .env）。不建议把密钥写入代码或包内。
- **截图有什么用？** 便于调试失败用例、生成报告证据，CI 排查更直观。
- **token 与 OPENAI_API_KEY 有何区别？** 前者是被测系统的访问令牌；后者是调用大模型的凭证。
- **组织内如何更安全？** 配置 `OPENAI_BASE_URL` 指向公司网关，客户端无需真实 Key。

## 许可证

MIT