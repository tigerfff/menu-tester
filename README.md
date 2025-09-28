# Menu Tester

AI-powered menu testing CLI tool using Playwright and Midscene.js for automatic navigation menu validation.

## Features

- 🤖 **AI-Driven Menu Discovery**: Automatically identifies and tests navigation menus using natural language understanding
- 🔐 **Token-Based Authentication**: Supports multiple token injection methods (Cookie, LocalStorage, Headers)
- 📊 **Progress Tracking**: Real-time progress monitoring with session resume capability
- 🛡️ **Exception Handling**: Robust error recovery and retry mechanisms
- ⚡ **Fast Validation**: Quick page validation with 6-second timeout
- 📸 **Screenshot Support**: Optional screenshot capture for test evidence
- 🎯 **Configurable Filtering**: Include/exclude menu patterns
- 📈 **Detailed Reporting**: Comprehensive test results and statistics

## Prerequisites

- Node.js >= 18.0.0
- AI Model Access (OpenAI, Anthropic, or other supported providers)

## Installation

### NPM 安装 (推荐)

```bash
# 全局安装
npm install -g @hik-cloud/midscene-menu-tester

# 安装完成后自动安装 Playwright 浏览器
# 如需手动安装：npx playwright install chromium
```

### 本地开发安装

```bash
# 克隆仓库
git clone https://github.com/hik-cloud/midscene-menu-tester.git
cd midscene-menu-tester

# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install
```

## Configuration

### Environment Variables

Set up your AI model credentials:

```bash
# OpenAI
export OPENAI_API_KEY="sk-your-openai-key"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # Optional

# Or use .env file
echo "OPENAI_API_KEY=sk-your-openai-key" > .env
```

### Configuration File

Create a configuration file (optional):

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

## Usage

### 🌐 Web 配置界面 (推荐)

最简单的使用方式是通过 Web 界面：

```bash
# 启动 Web 配置界面
menu-tester serve

# 指定端口
menu-tester serve --port 8080

# 不自动打开浏览器
menu-tester serve --no-open
```

然后在浏览器中：
1. 📋 **基础配置**: 设置网站 URL、令牌、测试模式等
2. 🛣️ **路由管理**: 导入/导出路由表，手动添加路由
3. ✅ **页面断言**: 配置 DOM 预检和 AI 文本检查
4. 📥 **导出配置**: 下载生成的配置文件

### 命令行使用

```bash
# 使用配置文件测试
menu-tester test --config config.json

# 路由模式测试
menu-tester routes import routes.json
menu-tester test --mode route

# AI 模式测试
menu-tester test \
  --url "https://admin.example.com" \
  --token "your-token" \
  --mode ai

# 混合模式测试
menu-tester test --mode hybrid --config config.json
```

### 高级命令行使用

```bash
# 详细日志模式
menu-tester test --config config.json --verbose

# 恢复中断的会话
menu-tester test --resume session-2024-01-15T10-30-00-000Z-abc123

# 路由管理
menu-tester routes list                 # 查看路由
menu-tester routes export routes.json  # 导出路由
menu-tester routes import routes.json  # 导入路由
menu-tester routes clear               # 清空路由

# 显示工具信息
menu-tester info
```

### Token Injection Methods

```bash
# Cookie injection (default)
menu-tester --url "..." --token "..." --token-method cookie

# LocalStorage injection
menu-tester --url "..." --token "..." --token-method localStorage

# HTTP Header injection
menu-tester --url "..." --token "..." --token-method header
```

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--url` | Target admin platform URL | Required |
| `--token` | Access token for authentication | Required* |
| `--config` | Configuration file path | - |
| `--depth` | Menu testing depth (1-5) | 2 |
| `--timeout` | Page timeout in milliseconds | 6000 |
| `--headless` | Run in headless mode | true |
| `--output` | Output directory for results | ./menu-test-results |
| `--resume` | Resume interrupted test session | - |
| `--retry` | Number of retries for failed operations | 2 |
| `--skip` | Skip menu patterns (comma-separated) | logout,exit,注销 |
| `--include` | Include only specified patterns | * |
| `--token-method` | Token injection method | cookie |
| `--token-name` | Token name for injection | access_token |
| `--screenshots` | Take screenshots during testing | false |
| `--verbose` | Enable verbose logging | false |

*Required unless set via `ACCESS_TOKEN` environment variable

## How It Works

1. **Browser Initialization**: Launches Playwright browser with specified configuration
2. **Token Injection**: Injects authentication token using selected method
3. **Menu Discovery**: Uses AI to identify navigation menus on the page
4. **Menu Testing**: Systematically clicks each menu and validates page response
5. **Progress Tracking**: Saves progress for session resumption
6. **Result Generation**: Produces detailed test reports and statistics

## Output

### Console Output

```
ℹ Starting new menu testing session...
✓ Browser initialized successfully
✓ Token injected successfully via cookie
✓ Page setup completed
✓ Discovered 12 menu items (8 top-level)

Progress [████████████████████] 100%
  Completed: 10, Failed: 1, Skipped: 1, Pending: 0

==================================================
MENU TESTING SUMMARY
==================================================
Total menus: 12
✓ Completed: 10
✗ Failed: 1
⊝ Skipped: 1
Success rate: 83%
Duration: 2.3m
Session ID: 2024-01-15T10-30-00-000Z-abc123
==================================================
```

### Output Files

- `session-{id}.json`: Session progress and results
- `midscene_run/report/{id}.html`: Detailed Midscene report (if screenshots enabled)

## Session Management

### Resume Interrupted Tests

```bash
# List available sessions
ls ./menu-test-results/session-*.json

# Resume specific session
menu-tester --resume session-2024-01-15T10-30-00-000Z-abc123
```

### Session Cleanup

Old completed sessions are automatically cleaned up after 7 days.

## Error Handling

The tool includes comprehensive error handling:

- **Page Exceptions**: Handles popups, loading errors, network issues
- **Element Errors**: Scrolls to find elements, waits for page stability
- **Navigation Errors**: Attempts page refresh or navigation back
- **Authentication Errors**: Re-injects tokens when needed
- **Timeout Handling**: Extends wait times for slow-loading pages

## Supported Platforms

This tool works with most web-based admin platforms including:

- Ant Design Pro applications
- Element UI admin panels
- Bootstrap admin themes
- Custom React/Vue/Angular admin interfaces
- Traditional server-rendered admin pages

## AI Model Support

Compatible with various AI providers:

- OpenAI (GPT-4, GPT-4-turbo, GPT-4o)
- Anthropic (Claude)
- Local models via API-compatible endpoints
- Other Midscene.js supported providers

## Troubleshooting

### Common Issues

1. **No menus found**
   - Check if the page loads correctly
   - Verify token authentication is working
   - Try adjusting the timeout value

2. **Token injection fails**
   - Verify token format and validity
   - Try different injection methods
   - Check domain/cookie settings

3. **AI queries timeout**
   - Verify AI model API credentials
   - Check network connectivity
   - Try increasing timeout values

### Debug Mode

```bash
# Enable verbose logging
menu-tester --url "..." --token "..." --verbose

# Run in headed mode to see browser
menu-tester --url "..." --token "..." --headless false
```

## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

## License

MIT License - see LICENSE file for details.

## Credits

Built with:
- [Playwright](https://playwright.dev/) - Browser automation
- [Midscene.js](https://midscenejs.com/) - AI-powered UI automation
- [Commander.js](https://github.com/tj/commander.js/) - CLI framework 