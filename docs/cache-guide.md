# 菜单缓存功能使用指南

## 概述

菜单缓存功能通过将已发现的菜单结构保存到本地文件，大大减少了重复测试时的菜单发现时间。首次运行时会发现并缓存菜单结构，后续运行将直接从缓存加载，显著提升测试效率。

## 功能特点

- **智能缓存**: 自动缓存顶级菜单和子菜单结构
- **增量更新**: 动态发现的子菜单会实时添加到缓存
- **过期管理**: 支持缓存过期时间配置，默认7天
- **完整性验证**: 自动验证缓存数据的完整性和有效性
- **灵活控制**: 支持启用/禁用缓存，强制刷新等选项

## 配置选项

在配置文件中添加以下选项：

```json
{
  "useCache": true,                    // 是否启用缓存 (默认: true)
  "cacheMaxAge": 604800000,           // 缓存最大存活时间，毫秒 (默认: 7天)
  "forceFreshDiscovery": false        // 是否强制重新发现菜单 (默认: false)
}
```

## 命令行使用

### 基本测试（使用缓存）
```bash
node bin/menu-tester.js test
```

### 禁用缓存运行
```bash
node bin/menu-tester.js test --no-cache
```

### 强制重新发现菜单
```bash
node bin/menu-tester.js test --fresh
```

### 自定义缓存过期时间
```bash
node bin/menu-tester.js test --cache-max-age 3
```

## 缓存管理命令

### 查看缓存信息
```bash
node bin/menu-tester.js cache --info
```

### 查看缓存统计
```bash
node bin/menu-tester.js cache --stats
```

### 验证缓存完整性
```bash
node bin/menu-tester.js cache --validate
```

### 清除缓存
```bash
node bin/menu-tester.js cache --clear
```

## 缓存文件结构

缓存文件存储在 `{output}/menu-cache/` 目录下，文件名基于目标URL生成，包含以下信息：

- **顶级菜单**: 完整的顶级菜单列表
- **子菜单映射**: 各层级菜单的子菜单关系
- **元数据**: 缓存创建时间、菜单统计等信息

## 性能提升

使用菜单缓存后，典型的性能提升：

- **首次运行**: 正常菜单发现时间
- **后续运行**: 菜单加载时间减少 80-90%
- **大型网站**: 从几分钟的菜单发现减少到几秒钟

## 注意事项

1. **网站更新**: 如果目标网站的菜单结构发生变化，建议清除缓存或使用 `--fresh` 选项
2. **缓存位置**: 缓存文件存储在配置的输出目录下的 `menu-cache` 子目录
3. **多环境**: 不同的URL会生成不同的缓存文件，支持多环境测试
4. **磁盘空间**: 缓存文件通常很小（几KB到几MB），但大量缓存时请注意磁盘空间

## 使用示例

### 示例1：首次运行（建立缓存）
```bash
$ node bin/menu-tester.js test
Initializing menu tester...
尝试从缓存加载菜单结构...
缓存未命中或被禁用，开始发现菜单...
发现 8 个顶级菜单
保存菜单结构到缓存...
菜单缓存已保存: /path/to/cache/menu-cache-pb-hik-cloud-com-chain-index-html.json
缓存包含 8 个菜单项，最大深度 2 级
发现耗时: 15.32秒
开始测试第 1/8 个根菜单: 巡查...
```

### 示例2：后续运行（使用缓存）
```bash
$ node bin/menu-tester.js test
Initializing menu tester...
尝试从缓存加载菜单结构...
发现有效的菜单缓存，包含 8 个顶级菜单
成功加载菜单缓存: 8 个顶级菜单
缓存创建时间: 2024/1/15 14:30:25
总菜单数: 8, 最大深度: 2
缓存统计: 顶级菜单 8 个，子菜单组 0 个
开始测试第 1/8 个根菜单: 巡查...
```

### 示例3：查看缓存信息
```bash
$ node bin/menu-tester.js cache --info
=== 菜单缓存信息 ===
URL: https://pb.hik-cloud.com/chain/index.html#/todo/patrol
创建时间: 2024/1/15 14:30:25
总菜单数: 8
最大深度: 2
缓存年龄: 2 小时 15 分钟
缓存文件: /path/to/cache/menu-cache-pb-hik-cloud-com-chain-index-html.json
缓存状态: 有效
```

## 故障排除

如果遇到缓存相关问题：

1. **检查缓存完整性**：
   ```bash
   node bin/menu-tester.js cache --validate
   ```

2. **查看缓存状态**：
   ```bash
   node bin/menu-tester.js cache --info
   ```

3. **清除并重新生成缓存**：
   ```bash
   node bin/menu-tester.js cache --clear
   node bin/menu-tester.js test --fresh
   ```

4. **临时禁用缓存**：
   ```bash
   node bin/menu-tester.js test --no-cache
   ```

## API 参考

### MenuCache 类主要方法

- `isCacheValid()`: 检查缓存是否有效
- `loadCachedMenus()`: 加载缓存的菜单数据
- `saveMenusToCache(menus, subMenus, duration)`: 保存菜单到缓存
- `addSubMenusToCache(parentKey, subMenus)`: 添加子菜单到缓存
- `getCachedSubMenus(parentKey)`: 获取缓存的子菜单
- `clearCache()`: 清除缓存
- `getCacheInfo()`: 获取缓存信息

### 配置选项详解

| 选项 | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `useCache` | boolean | `true` | 是否启用菜单缓存功能 |
| `cacheMaxAge` | number | `604800000` | 缓存最大存活时间（毫秒），默认7天 |
| `forceFreshDiscovery` | boolean | `false` | 是否强制重新发现菜单，忽略现有缓存 |

### 缓存文件格式

缓存文件采用 JSON 格式，结构如下：

```json
{
  "url": "https://example.com",
  "timestamp": "2024-01-15T14:30:25.123Z",
  "version": "1.0.0",
  "menus": {
    "topLevel": [...],
    "subMenus": {...}
  },
  "metadata": {
    "totalMenus": 8,
    "maxDepth": 2,
    "lastUpdated": "2024-01-15T14:30:25.123Z",
    "discoveryDuration": 15320
  }
}
``` 