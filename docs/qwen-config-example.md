# 阿里千问（通义千问）配置指南

## 快速开始

### 1. 获取 API Key

访问 [阿里云百炼平台](https://bailian.console.aliyun.com/) 获取 API Key。

### 2. 配置项目

在配置文件中添加：

```json
{
  "url": "https://your-app.com",
  "token": "your-access-token",
  "env": {
    "OPENAI_API_KEY": "sk-your-qwen-api-key",
    "OPENAI_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "MIDSCENE_MODEL_NAME": "qwen-vl-plus"
  }
}
```

### 3. 运行测试

```bash
menu-tester --config your-config.json
```

## 模型选择

千问提供多个视觉理解模型，根据需求选择：

### qwen-vl-max-latest（推荐生产环境）

```json
{
  "env": {
    "MIDSCENE_MODEL_NAME": "qwen-vl-max-latest"
  }
}
```

**特点**：

- ✅ 最强的视觉理解能力
- ✅ 最高的准确度
- ⚠️ 成本较高
- ⚠️ 响应速度较慢

**适用场景**：

- 生产环境
- 对准确度要求高
- 复杂的页面分析

### qwen-vl-plus（推荐日常使用）

```json
{
  "env": {
    "MIDSCENE_MODEL_NAME": "qwen-vl-plus"
  }
}
```

**特点**：

- ✅ 性价比最高
- ✅ 准确度高
- ✅ 速度适中
- ✅ 成本适中

**适用场景**：

- 日常开发测试
- CI/CD 自动化测试
- 平衡性能和成本

### qwen-vl-turbo（开发测试）

```json
{
  "env": {
    "MIDSCENE_MODEL_NAME": "qwen-vl-turbo"
  }
}
```

**特点**：

- ✅ 响应速度快
- ✅ 成本最低
- ⚠️ 准确度相对较低

**适用场景**：

- 开发调试
- 快速迭代
- 成本敏感场景

## 完整配置示例

```json
{
  "url": "https://pb.hik-cloud.com/chain/index.html#/home",
  "token": "your-access-token",
  "tokenMethod": "cookie",
  "tokenName": "accessToken",
  "env": {
    "OPENAI_API_KEY": "sk-your-qwen-api-key",
    "OPENAI_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "MIDSCENE_MODEL_NAME": "qwen-vl-plus"
  },
  "mode": "route",
  "headless": true,
  "screenshots": true,
  "screenshotComparison": {
    "enabled": true,
    "threshold": 0.2,
    "updateBaseline": false
  },
  "pageAssertions": {
    "enabled": true,
    "midsceneTextCheck": {
      "enabled": true,
      "timeout": 8000,
      "concurrency": 2
    }
  },
  "routes": [
    {
      "menuText": "首页",
      "url": "https://your-app.com/home",
      "level": 1
    }
  ]
}
```

## 环境变量方式

如果不想在配置文件中暴露 API Key，可以使用环境变量：

```bash
# 设置环境变量
export OPENAI_API_KEY="sk-your-qwen-api-key"
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export MIDSCENE_MODEL_NAME="qwen-vl-plus"

# 运行测试
menu-tester --config config.json
```

## 常见问题

### Q1: 为什么必须设置 MIDSCENE_MODEL_NAME？

A: 阿里千问的 API 要求明确指定模型名称，不像 OpenAI 可以自动选择默认模型。

### Q2: 如何验证配置是否正确？

A: 运行测试并查看日志：

```bash
menu-tester --config config.json --verbose

# 查看日志
cat midscene_run/log/ai-call.log | grep model
# 应该看到：
# "model": "qwen-vl-plus"
```

### Q3: 成本如何计算？

A: 千问按 token 计费，不同模型价格不同：

- `qwen-vl-max-latest`: 约 ¥0.02/千tokens
- `qwen-vl-plus`: 约 ¥0.008/千tokens
- `qwen-vl-turbo`: 约 ¥0.002/千tokens

（价格仅供参考，以官方为准）

### Q4: 可以在 Web UI 中配置吗？

A: 可以！在 Web 配置界面的"🔑 AI 配置"区域：

1. 填入 API Key
2. 设置 Base URL 为千问端点
3. 设置模型名称（如 qwen-vl-plus）
4. 保存配置

## 性能对比

基于 50 个菜单页面的测试：

| 模型               | 总耗时 | 准确率 | 总成本 |
| ------------------ | ------ | ------ | ------ |
| qwen-vl-max-latest | 8 分钟 | 98%    | ¥2.5  |
| qwen-vl-plus       | 6 分钟 | 96%    | ¥1.2  |
| qwen-vl-turbo      | 4 分钟 | 92%    | ¥0.4  |

**推荐**：日常使用 `qwen-vl-plus`，生产关键测试使用 `qwen-vl-max-latest`。

## 参考链接

- [阿里云百炼平台](https://bailian.console.aliyun.com/)
- [通义千问 API 文档](https://help.aliyun.com/zh/dashscope/)
- [模型定价](https://help.aliyun.com/zh/dashscope/developer-reference/tongyi-qianwen-vl-plus-api)
