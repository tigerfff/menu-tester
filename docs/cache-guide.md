# 路由缓存与路由文件指南

> ⚠️ 注意：自 2025 年 11 月起，Menu Tester 已移除“自动发现菜单 & 菜单缓存”功能。本指南已更新为介绍**路由列表**的维护方式。

## 为什么要维护路由缓存？

在路由模式下，所有待测页面均来自手工维护的 URL 清单。工具会在执行过程中将这些路由以及验证信息写入缓存文件，方便后续：

- 快速导出/分享当前有效路由
- 合并团队提供的路由文件
- 做路由统计与格式校验

## 缓存位置

- 路由缓存文件存放在：`{output}/menu-cache/`
- 文件名由目标 URL 计算（同一环境只会生成一个缓存文件）
- 主要字段：
  - `routes.menuRoutes`：菜单文本 → URL 映射
  - `routes.routeValidation`：路由对应的验证信息
  - `metadata.totalRoutes`：路由总数等统计数据

## 常用 CLI 命令

```bash
# 查看路由列表
menu-tester routes list --config config.json

# 导出路由到 JSON（默认）或 CSV
menu-tester routes export ./routes.json
menu-tester routes export ./routes.csv --format csv

# 导入路由（merge：追加 / replace：覆盖）
menu-tester routes import ./new-routes.json --mode merge
menu-tester routes import ./baseline.csv --mode replace

# 校验路由格式
menu-tester routes validate --config config.json

# 清除路由缓存
menu-tester routes clear --config config.json

# 查看路由统计信息
menu-tester routes stats --config config.json
```

## 路由文件格式

### JSON

```json
{
  "routes": [
    {
      "menuText": "首页",
      "url": "https://admin.example.com/home",
      "level": 1,
      "recordedAt": "2025-11-14T10:00:00.000Z"
    },
    {
      "menuText": "巡检中心",
      "url": "https://admin.example.com/inspect",
      "level": 2
    }
  ]
}
```

### CSV

```
MenuText,URL,Level,RecordedAt
首页,https://admin.example.com/home,1,2025-11-14T10:00:00.000Z
巡检中心,https://admin.example.com/inspect,2,
```

## 常见场景

1. **首次运行**  
   提供含 `routes` 的配置文件，执行 `menu-tester test`。工具会将路由写入缓存。

2. **团队协作共享路由**  
   使用 `menu-tester routes export` 导出，提交到版本库或发给其他成员。他人可用 `import` 合并。

3. **清理失效路由**  
   直接编辑 JSON/CSV，或在导出的文件中手工删除，然后 `import --mode replace`。

4. **定期巡检对比**  
   配合版本库管理路由文件，查看 diff 即可了解新增/删除的入口。

## FAQ

- **还能自动发现菜单吗？**  
  不能。请改为维护路由文件。

- **缓存损坏怎么办？**  
  直接运行 `menu-tester routes clear` 清除缓存，然后重新导入路由。

- **是否支持多环境？**  
  支持。缓存文件名包含目标 URL，同一环境仅共用一个缓存。

- **导出的 `level` 有何作用？**  
  用于统计与报告展示，不影响实际导航（路由模式直接访问 URL）。

如需了解路由管理代码实现，可查看 `src/core/MenuCache.js` 与 `src/utils/routeManager.js`。