# 环境变量配置指南

## 概述

本工具支持多种方式配置 AI 服务的环境变量，方便不同场景下的使用。

## 配置方式

### 方式1：配置文件 `env` 字段（推荐）

在配置文件中直接添加 `env` 字段：

**使用 OpenAI 官方**：
```json
{
  "url": "https://your-app.com",
  "token": "your-token",
  "env": {
    "OPENAI_API_KEY": "sk-xxx"
  }
}
```

**使用阿里千问（通义千问）**：
```json
{
  "url": "https://your-app.com",
  "token": "your-token",
  "env": {
    "OPENAI_API_KEY": "sk-xxx",
    "OPENAI_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "MIDSCENE_MODEL_NAME": "qwen-vl-plus"
  }
}
```

千问模型推荐：
- `qwen-vl-max-latest` - 最强视觉理解能力
- `qwen-vl-plus` - 性价比最高（推荐）
- `qwen-vl-turbo` - 速度最快

**优点**：
- ✅ 配置集中管理
- ✅ 不需要单独的 .env 文件
- ✅ 便于团队协作（使用模板文件）
- ✅ Web UI 支持可视化配置

### 方式2：系统环境变量

**OpenAI 官方**：
```bash
# 临时设置（单次运行）
OPENAI_API_KEY=sk-xxx menu-tester --config config.json

# 会话级设置（当前终端有效）
export OPENAI_API_KEY=sk-xxx
menu-tester --config config.json
```

**阿里千问**：
```bash
# 设置环境变量
export OPENAI_API_KEY="sk-xxx"
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export MIDSCENE_MODEL_NAME="qwen-vl-plus"

# 运行测试
menu-tester --config config.json

# 持久化设置（写入 ~/.bashrc 或 ~/.zshrc）
cat >> ~/.zshrc << 'EOF'
export OPENAI_API_KEY="sk-xxx"
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export MIDSCENE_MODEL_NAME="qwen-vl-plus"
EOF
source ~/.zshrc
```

### 方式3：.env 文件

在项目根目录创建 `.env` 文件：

**OpenAI 官方**：
```bash
OPENAI_API_KEY=sk-xxx
```

**阿里千问**：
```bash
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MIDSCENE_MODEL_NAME=qwen-vl-plus
```

## 优先级

当多种方式同时存在时，优先级为：

```
系统环境变量 > 配置文件 env 字段 > .env 文件
```

**示例**：
```bash
# 1. 系统设置了环境变量
export OPENAI_API_KEY=sk-system-key

# 2. 配置文件中也有
{
  "env": {
    "OPENAI_API_KEY": "sk-config-key"
  }
}

# 结果：使用 sk-system-key（系统环境变量优先）
```

## 支持的环境变量

| 变量名 | 必需 | 说明 | 默认值 |
|--------|------|------|--------|
| `OPENAI_API_KEY` | ✅ 是 | OpenAI API 密钥或兼容服务的密钥 | - |
| `OPENAI_BASE_URL` | ❌ 否 | API 端点 URL | `https://api.openai.com/v1` |
| `MIDSCENE_MODEL_NAME` | ❌ 否 | 指定模型名称（使用第三方服务时必填） | Midscene 自动选择 |

## 安全建议

### 1. 不要将密钥提交到版本控制

将包含密钥的配置文件加入 `.gitignore`：

```gitignore
# 包含密钥的配置文件
hik-config.json
*-config.json
!config/example.json

# .env 文件
.env
.env.local
```

### 2. 使用配置模板

提供示例配置文件供团队成员复制：

```bash
# 复制模板
cp hik-config.example.json hik-config.json

# 编辑填入真实的密钥
vim hik-config.json
```

### 3. CI/CD 环境

在 CI/CD 中使用环境变量而非配置文件：

```yaml
# .github/workflows/test.yml
jobs:
  test:
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    steps:
      - run: menu-tester --config config.json
```

### 4. 企业内部部署

使用公司内网 API 网关：

```json
{
  "env": {
    "OPENAI_API_KEY": "company-internal-token",
    "OPENAI_BASE_URL": "https://ai-gateway.company.com/v1"
  }
}
```

这样客户端无需持有真实的 OpenAI 密钥。

## Web UI 配置

在 Web 配置界面的"基础配置"选项卡中，找到"🔑 AI 配置"区域：

1. 输入 `OPENAI_API_KEY`（必需）
2. 可选：修改 `OPENAI_BASE_URL`
3. 点击"保存配置"
4. 配置会保存到 `env` 字段

## 故障排查

### 问题1：提示缺少 API Key

```
⚠️  缺少必需的环境变量: OPENAI_API_KEY
```

**解决方法**：
1. 检查配置文件中的 `env.OPENAI_API_KEY` 是否设置
2. 或设置系统环境变量：`export OPENAI_API_KEY=sk-xxx`
3. 或在运行目录创建 `.env` 文件

### 问题2：如何验证环境变量已生效？

运行时开启 verbose 模式：

```bash
menu-tester --config config.json --verbose
```

查看日志输出：
```
🔍 从配置文件设置环境变量: OPENAI_API_KEY
🔍 使用系统环境变量: OPENAI_BASE_URL
```

### 问题3：想临时使用不同的密钥

使用环境变量覆盖：

```bash
OPENAI_API_KEY=sk-test-key menu-tester --config config.json
```

## 最佳实践

1. **开发环境**：使用配置文件 `env` 字段，方便快速测试
2. **团队协作**：提供 `hik-config.example.json` 模板，不提交真实密钥
3. **CI/CD**：使用系统环境变量或密钥管理服务
4. **生产环境**：使用企业 API 网关，集中管理密钥

## 示例

### 完整的配置文件示例

```json
{
  "url": "https://admin.example.com",
  "token": "user-access-token",
  "env": {
    "OPENAI_API_KEY": "sk-proj-xxx",
    "OPENAI_BASE_URL": "https://api.openai.com/v1"
  },
  "screenshots": true,
  "screenshotComparison": {
    "enabled": true,
    "updateBaseline": false
  }
}
```

### 快速开始

```bash
# 1. 复制模板
cp hik-config.example.json my-config.json

# 2. 编辑配置（填入真实的 URL、token、API key）
vim my-config.json

# 3. 运行测试
menu-tester --config my-config.json

# 4. 将配置文件加入 .gitignore
echo "my-config.json" >> .gitignore
```

## 参考

- [README.md](../README.md) - 快速开始
- [config/example.json](../config/example.json) - 配置示例
- [env.example](../env.example) - .env 文件示例

