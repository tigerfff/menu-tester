# 页面断言功能使用指南

## 概述

页面断言功能能够检测空白页面、缺省状态以及其他页面问题，支持通过配置文件自定义断言规则。

## 功能特性

### ✅ 空白页面检测
- 页面标题检查
- 主内容区域检查
- 导航元素检查
- 表单元素检查

### ✅ 缺省状态检测
- 关键词检测（暂无数据、加载失败等）
- 缺省状态元素检测
- 错误页面识别

### ✅ 内容质量检测
- 最小内容长度验证
- 可见元素数量检查
- 有意义元素统计

### ✅ 自定义断言规则
- 元素存在性检查
- 文本内容检查
- 自定义函数执行

## 配置说明

在 `hik-config.json` 中添加 `pageAssertions` 配置：

```json
{
  "pageAssertions": {
    "enabled": true,                   // 是否启用页面断言
    "strictMode": false,               // 严格模式（true时内容质量失败会导致测试失败）
    "minContentLength": 80,            // 最小内容长度（字符数）
    "minVisibleElements": 3,           // 最小可见元素数量
    "timeoutMs": 5000,                 // 断言超时时间
    
    // 空白页面检测配置
    "blankPageDetection": {
      "enabled": true,
      "checkTitle": true,              // 检查页面标题
      "checkMainContent": true,        // 检查主内容区域
      "checkNavigation": true,         // 检查导航元素
      "checkForms": true,              // 检查表单元素
      "minTextLength": 50              // 主内容区域最小文本长度
    },
    
    // 缺省状态检测配置
    "emptyStateDetection": {
      "enabled": true,
      "keywords": [                    // 缺省状态关键词
        "暂无数据", "无数据", "没有数据", "数据为空",
        "加载失败", "请求失败", "网络错误", "服务异常",
        "404", "500", "403", "401", "Not Found"
      ],
      "selectors": [                   // 常见缺省状态的选择器
        ".empty-state", ".no-data", ".empty-content",
        ".error-page", ".not-found", ".loading-error",
        ".el-empty", ".ant-empty", ".empty-placeholder"
      ]
    },
    
    // 自定义断言规则
    "customRules": [
      {
        "name": "hasDataTable",
        "type": "element_exists",
        "selector": "table, .el-table, .ant-table",
        "required": false,
        "message": "页面应包含数据表格"
      },
      {
        "name": "noErrorAlert",
        "type": "element_not_exists",
        "selector": ".error-message, .alert-danger",
        "required": true,
        "message": "页面不应显示错误提示"
      }
    ]
  }
}
```

## 自定义断言规则类型

### 1. 元素存在性检查 (`element_exists`)

检查指定的CSS选择器是否存在于页面中。

```json
{
  "name": "hasMainTable",
  "type": "element_exists",
  "selector": "table.main-table, .data-table",
  "required": true,
  "message": "页面缺少主要数据表格"
}
```

### 2. 元素不存在检查 (`element_not_exists`)

检查指定的CSS选择器不应存在于页面中。

```json
{
  "name": "noErrorMessages",
  "type": "element_not_exists",
  "selector": ".error-message, .alert-danger",
  "required": true,
  "message": "页面显示错误信息"
}
```

### 3. 文本包含检查 (`text_contains`)

检查页面是否包含指定的文本内容。

```json
{
  "name": "hasWelcomeText",
  "type": "text_contains",
  "text": "欢迎使用",
  "required": false,
  "message": "页面应包含欢迎文字"
}
```

### 4. 文本不包含检查 (`text_not_contains`)

检查页面不应包含指定的文本内容。

```json
{
  "name": "noErrorText",
  "type": "text_not_contains",
  "text": "系统错误",
  "required": true,
  "message": "页面不应显示系统错误"
}
```

### 5. 自定义函数检查 (`custom_function`)

执行自定义JavaScript函数进行复杂的页面检查。

```json
{
  "name": "customCheck",
  "type": "custom_function",
  "function": "() => document.querySelectorAll('.data-row').length >= 5",
  "required": false,
  "message": "数据行数应不少于5行"
}
```

## 实际使用示例

### 海康威视平台配置示例

```json
{
  "pageAssertions": {
    "enabled": true,
    "strictMode": false,
    "minContentLength": 100,
    "blankPageDetection": {
      "enabled": true,
      "checkTitle": true,
      "checkMainContent": true,
      "checkNavigation": false,
      "minTextLength": 50
    },
    "emptyStateDetection": {
      "enabled": true,
      "keywords": [
        "暂无数据", "无数据", "加载失败", "网络异常",
        "404", "500", "页面不存在", "系统维护"
      ],
      "selectors": [
        ".empty-state", ".no-data", ".error-page",
        ".el-empty", ".hik-empty"
      ]
    },
    "customRules": [
      {
        "name": "hasNavigationMenu",
        "type": "element_exists",
        "selector": ".el-menu, .navigation-menu, .sidebar-menu",
        "required": true,
        "message": "页面应包含导航菜单"
      },
      {
        "name": "hasPageContent",
        "type": "element_exists",
        "selector": ".main-content, .page-content, .el-main",
        "required": true,
        "message": "页面应包含主要内容区域"
      },
      {
        "name": "noLoginPrompt",
        "type": "text_not_contains",
        "text": "请先登录",
        "required": true,
        "message": "页面不应提示登录"
      },
      {
        "name": "hasDataOrButtons",
        "type": "custom_function",
        "function": "() => document.querySelectorAll('table, .el-table, button, .el-button').length > 0",
        "required": false,
        "message": "页面应包含数据表格或操作按钮"
      }
    ]
  }
}
```

### 电商平台配置示例

```json
{
  "pageAssertions": {
    "enabled": true,
    "strictMode": true,
    "minContentLength": 200,
    "blankPageDetection": {
      "enabled": true,
      "checkTitle": true,
      "checkMainContent": true,
      "checkNavigation": true,
      "minTextLength": 100
    },
    "emptyStateDetection": {
      "enabled": true,
      "keywords": [
        "商品不存在", "页面不存在", "库存不足",
        "服务器错误", "网络连接失败"
      ]
    },
    "customRules": [
      {
        "name": "hasProductList",
        "type": "element_exists",
        "selector": ".product-list, .goods-list, .item-list",
        "required": true,
        "message": "页面应显示商品列表"
      },
      {
        "name": "hasShoppingCart",
        "type": "element_exists",
        "selector": ".cart-icon, .shopping-cart, #cart",
        "required": false,
        "message": "页面应包含购物车图标"
      },
      {
        "name": "noPriceError",
        "type": "text_not_contains",
        "text": "价格异常",
        "required": true,
        "message": "商品价格不应显示异常"
      }
    ]
  }
}
```

## 断言结果解读

断言执行完成后，会返回详细的结果报告：

```json
{
  "success": true,
  "errors": [],
  "warnings": ["内容质量警告: 页面内容质量不足"],
  "details": {
    "blankPageCheck": {
      "success": true,
      "message": "页面内容充实，不是空白页面",
      "checks": [...]
    },
    "emptyStateCheck": {
      "success": true,
      "message": "未检测到缺省状态"
    },
    "contentQualityCheck": {
      "success": false,
      "message": "页面内容质量不足 (文本:45字符, 元素:12个, 有意义元素:1个)"
    },
    "customRulesCheck": {
      "totalRules": 2,
      "passedRules": 1,
      "failedRules": 1
    }
  },
  "duration": 1250
}
```

### 结果字段说明

- **success**: 总体断言是否通过
- **errors**: 导致断言失败的错误列表
- **warnings**: 不影响测试通过的警告列表
- **details**: 各项检查的详细结果
- **duration**: 断言执行耗时（毫秒）

## 命令行使用

### 启用断言测试

```bash
# 使用默认配置进行断言测试
node bin/menu-tester.js test --mode route --config hik-config.json

# 开启详细日志查看断言详情
node bin/menu-tester.js test --mode route --config hik-config.json --verbose
```

### 调试断言配置

如果断言结果不符合预期，可以：

1. **启用详细日志**: 使用 `--verbose` 参数查看详细的断言执行日志
2. **调整严格模式**: 设置 `strictMode: false` 将内容质量检测降级为警告
3. **修改阈值**: 调整 `minContentLength`、`minVisibleElements` 等参数
4. **禁用特定检查**: 将不需要的检查设置为 `enabled: false`

## 最佳实践

### 1. 分环境配置

为不同环境使用不同的断言配置：

```bash
# 开发环境（宽松模式）
node bin/menu-tester.js test --config dev-config.json

# 生产环境（严格模式）  
node bin/menu-tester.js test --config prod-config.json
```

### 2. 逐步启用

首次使用时建议：

1. 先启用基础的空白页面检测
2. 逐步启用缺省状态检测
3. 最后根据项目特点添加自定义规则

### 3. 关键词维护

定期更新 `emptyStateDetection.keywords`，包含项目中可能出现的所有缺省状态文案。

### 4. 选择器更新

根据UI框架和设计规范，更新 `emptyStateDetection.selectors` 中的CSS选择器。

## 故障排除

### 常见问题

1. **断言总是失败**
   - 检查 `minContentLength` 是否设置过高
   - 确认页面确实有足够的内容
   - 尝试设置 `strictMode: false`

2. **空白页面检测误报**
   - 调整 `blankPageDetection.minTextLength`
   - 检查页面的主内容区域选择器
   - 禁用不必要的检查项

3. **自定义规则不生效**
   - 确认CSS选择器的正确性
   - 检查 `required` 字段设置
   - 在浏览器控制台测试选择器

4. **断言执行太慢**
   - 减少自定义规则数量
   - 降低 `timeoutMs` 设置
   - 禁用不必要的检查项

通过合理配置页面断言功能，可以大大提升菜单测试的准确性，及时发现页面问题，提升产品质量。 