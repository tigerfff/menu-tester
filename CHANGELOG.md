# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-21

### Added
- 🤖 **AI 智能菜单发现** - 自动识别并测试页面菜单结构
- 🛣️ **路由模式测试** - 基于预定义路由的快速回归测试
- 🔄 **混合模式测试** - 结合 AI 发现和路由缓存的智能测试
- 🌐 **Web 配置界面** - 可视化配置工具，简化测试配置
- ✅ **多层页面断言系统** - DOM 预检和 AI 语义检查
- 📸 **截图保存功能** - 自动截图记录测试过程
- 🔍 **截图对比功能** - 像素级视觉回归测试
- 🔐 **多种令牌注入方式** - 支持 Cookie/LocalStorage/Header
- 📊 **详细测试报告** - HTML 格式的可视化测试报告
- 🔄 **断点续跑功能** - 支持从中断处恢复测试
- 📝 **完整文档** - 包含使用指南、配置说明和示例

### Features
- 支持三种测试模式（AI、路由、混合）
- 单文件配置支持（配置 + 路由）
- 自定义页面断言规则
- 菜单和路由缓存机制
- 多种 AI 模型支持（OpenAI、阿里千问等）
- 全局 CLI 命令
- 跨域导航处理
- 异常重试机制
- 进度追踪和统计

### Documentation
- 完整的 README 使用指南
- 环境配置指南
- 页面断言配置指南
- 截图对比功能指南
- 阿里千问配置示例
- 缓存使用指南
- NPM 发布指南

### Technical
- Node.js >= 18.0.0
- Playwright + Midscene.js
- Express Web Server
- Pixelmatch 截图对比
- Commander CLI 框架

