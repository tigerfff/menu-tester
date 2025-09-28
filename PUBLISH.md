# 📦 NPM 发布指南

## 准备发布

### 1. 检查配置

确保 `package.json` 中的信息正确：

```json
{
  "name": "@hik-cloud/midscene-menu-tester",
  "version": "1.0.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/hik-cloud/midscene-menu-tester.git"
  }
}
```

### 2. 验证功能

```bash
# 测试 CLI 命令
node bin/menu-tester.js --help
node bin/menu-tester.js info

# 测试 Web 界面
node bin/menu-tester.js serve --no-open

# 测试基本功能
node bin/menu-tester.js test --config config/example.json
```

### 3. 检查文件包含

```bash
# 查看将要发布的文件
npm pack --dry-run

# 生成测试包
npm pack
```

## 发布步骤

### 1. 登录 NPM

```bash
# 登录 NPM (如果是组织账号)
npm login

# 或者设置组织 registry
npm config set @hik-cloud:registry https://registry.npmjs.org/
```

### 2. 发布包

```bash
# 首次发布 (公开包)
npm publish --access public

# 后续更新版本
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0

# 发布新版本
npm publish
```

### 3. 验证发布

```bash
# 检查包是否发布成功
npm view @hik-cloud/midscene-menu-tester

# 测试全局安装
npm install -g @hik-cloud/midscene-menu-tester

# 验证命令可用
menu-tester --version
menu-tester info
```

## 使用指南 (给同事)

### 快速开始

```bash
# 1. 安装工具
npm install -g @hik-cloud/midscene-menu-tester

# 2. 启动 Web 配置界面
menu-tester serve

# 3. 在浏览器中配置并下载配置文件

# 4. 运行测试
menu-tester test --config downloaded-config.json
```

### Web 界面使用

1. **基础配置**
   - 网站 URL: 要测试的管理后台地址
   - 访问令牌: 用于身份验证
   - 测试模式: AI/路由/混合模式

2. **路由管理**
   - 导入现有路由表
   - 手动添加路由
   - 导出路由配置

3. **页面断言**
   - DOM 预检: 网络检查、控制台错误检查
   - AI 文本检查: 空白页面、权限错误、API 错误检查

4. **导出配置**
   - 下载完整配置文件
   - 复制配置到剪贴板
   - 下载路由文件

### 命令行模式

```bash
# 路由模式 (推荐 - 快速稳定)
menu-tester routes import routes.json
menu-tester test --mode route --config config.json

# AI 模式 (智能发现)
menu-tester test --mode ai --config config.json

# 混合模式 (路由 + AI 验证)
menu-tester test --mode hybrid --config config.json
```

## 故障排除

### 常见问题

1. **安装失败**
   ```bash
   # 检查 Node.js 版本
   node --version  # 需要 >= 18.0.0
   
   # 清理缓存重试
   npm cache clean --force
   npm install -g @hik-cloud/midscene-menu-tester
   ```

2. **Playwright 浏览器安装失败**
   ```bash
   # 手动安装浏览器
   npx playwright install chromium
   ```

3. **Web 界面无法访问**
   ```bash
   # 检查端口占用
   menu-tester serve --port 8080
   
   # 检查防火墙设置
   ```

4. **测试失败**
   ```bash
   # 详细日志模式
   menu-tester test --config config.json --verbose
   
   # 检查配置文件格式
   # 验证网站访问和令牌有效性
   ```

### 配置示例

创建 `config.json`:

```json
{
  "url": "https://admin.example.com",
  "token": "your-access-token",
  "tokenMethod": "cookie",
  "tokenName": "accessToken",
  "mode": "route",
  "timeout": 6000,
  "headless": true,
  "pageAssertions": {
    "enabled": true,
    "domPreCheck": {
      "enableNetworkCheck": true,
      "enableConsoleErrorCheck": true
    }
  }
}
```

## 更新日志

### v1.0.0
- ✨ 新增 Web 配置界面
- 🚀 支持 NPM 全局安装
- 🛣️ 路由模式测试
- 🤖 AI 模式测试
- 🔄 混合模式测试
- ✅ 多层页面断言
- 📊 详细测试报告
