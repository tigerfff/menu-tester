# 菜单测试核心模块架构设计

## 架构理念

采用 **混合智能策略（Hybrid Intelligence Strategy）**，结合确定性DOM操作与AI语义理解，在稳定性与灵活性之间取得平衡。核心思想：**确定性优先，智能降级，状态驱动**。

---

## 1. MenuDiscovery.js - 智能菜单发现引擎

### 设计模式：策略链 + 语义理解

采用**多重降级策略链**，从确定性操作逐步降级到AI语义理解，确保在各种页面结构下都能成功发现菜单。

#### 1.1 AI语义识别 + 固定锚点规范化

**核心创新点**：将AI识别的动态菜单项映射到固定DOM锚点，解决动态文本导致的定位失效问题。

```javascript
async findTopLevelMenus() {
  // AI语义查询：理解页面结构，识别菜单项
  const menuItems = await this.agent.aiQuery(`
    { text: string, isDropdownItem: boolean, accessPath: string[] }[],
    找到页面中所有的顶级主导航菜单项
  `);
  
  // 关键：统一规范化处理，建立稳定访问路径
  return menuItems.map((item, index) => ({
    id: `top-menu-${index}`,
    text: item.text || '',
    isDropdownItem: item.isDropdownItem || false,
    // 核心设计：下拉菜单项统一映射到固定锚点，避免动态文本依赖
    accessPath: item.isDropdownItem ? ['#nav_top_menu_more'] : (item.accessPath || [])
  }));
}
```

**设计优势**：
- **解耦文本与定位**：菜单文本可变化，但访问路径保持稳定
- **语义理解 + 确定性定位**：AI理解结构，DOM锚点保证稳定性

#### 1.2 DOM优先的状态检测机制

**核心创新点**：使用DOM状态检测替代AI判断，提高准确性和性能。

```javascript
async ensureMoreOpen() {
  // 策略1：DOM状态检测（确定性，毫秒级）
  const isOpened = await this.page.evaluate(() => {
    const el = document.getElementById('nav_top_menu_more');
    const icon = el?.querySelector('i.h-icon-angle_down_sm');
    // 多重状态检测：CSS类 + ARIA属性
    return icon?.classList.contains('rotate') || el?.getAttribute('aria-expanded') === 'true';
  });
  
  if (isOpened) return true; // 快速路径
  
  // 策略2：DOM操作 + 状态等待（确定性）
  await this.page.locator('#nav_top_menu_more').click();
  // 等待状态稳定：检测CSS类变化而非固定延时
  await this.page.locator('#nav_top_menu_more i.rotate').waitFor({ timeout: 2000 });
  return true;
}
```

**设计优势**：
- **确定性操作**：不依赖AI判断，避免误判
- **状态驱动**：基于DOM状态而非时间等待
- **性能优化**：毫秒级检测 vs AI秒级判断

---

## 2. MenuCache.js - 类型安全的缓存系统

### 设计模式：类型转换适配器 + 持久化抽象

解决JavaScript中Map类型与JSON序列化的类型不兼容问题，实现类型安全的持久化。

#### 核心问题

JavaScript的`Map`类型无法直接JSON序列化，需要设计类型转换机制，同时保证运行时类型安全。

#### 解决方案：双向类型适配器

```javascript
// 保存阶段：Map → Plain Object（序列化适配）
async saveMenusToCache(topLevelMenus, subMenusMap = new Map()) {
  this.cache = {
    menus: {
      topLevel: topLevelMenus,
      // 类型转换：Map → Object，保持数据完整性
      subMenus: Object.fromEntries(subMenusMap)
    }
  };
  await fs.writeJson(this.cacheFile, this.cache, { spaces: 2 });
}

// 加载阶段：Plain Object → Map（类型恢复）
async loadCachedMenus() {
  const cacheData = await fs.readJson(this.cacheFile);
  
  // 类型安全转换：检测类型并重建Map结构
  if (cacheData.menus?.subMenus) {
    if (typeof cacheData.menus.subMenus === 'object' && !Array.isArray(cacheData.menus.subMenus)) {
      // 重建Map：恢复O(1)查找性能
      this.cache.menus.subMenus = new Map(Object.entries(cacheData.menus.subMenus));
    }
  }
  
  return this.cache;
}
```

**设计优势**：
- **类型安全**：运行时类型检查，避免类型错误
- **性能保持**：内存中使用Map的O(1)查找性能
- **持久化兼容**：JSON序列化兼容性

---

## 3. MenuNavigator.js - 状态机驱动的导航系统

### 设计模式：状态机 + 幂等性保证

将菜单导航抽象为状态机，通过状态检测实现幂等性操作，避免重复点击和状态不一致。

#### 3.1 状态驱动的导航流程

**核心创新点**：通过状态检测实现幂等性，确保导航操作的可重复执行。

```javascript
async navigateToMoreMenuItem(targetMenu) {
  // 阶段1：状态准备（幂等性保证）
  await this.ensureMoreMenuExpanded();
  
  // 阶段2：状态检测（避免无效操作）
  const isSelected = await this.isMenuCurrentlySelected(targetMenu.text);
  if (isSelected) return; // 快速路径：已处于目标状态
  
  // 阶段3：状态转换（执行导航）
  await this.agent.aiTap(`点击"更多"下拉菜单中的"${targetMenu.text}"`);
  
  // 阶段4：状态同步（更新内部状态机）
  this.moreMenuState.currentSelectedItem = targetMenu.text;
  this.moreMenuState.isExpanded = false;
}
```

**状态机设计**：
```
初始状态 → 展开状态 → 选中状态 → 导航完成
   ↓          ↓          ↓
 检测      检测      检测（幂等性保证）
```

#### 3.2 确定性状态检测

```javascript
async ensureMoreMenuExpanded() {
  // 状态检测：基于DOM状态而非时间等待
  const isExpanded = await this.page.locator('#nav_top_menu_more i.rotate').count() > 0;
  if (isExpanded) return; // 已处于目标状态，快速返回
  
  // 状态转换：执行展开操作
  await this.page.locator('#nav_top_menu_more').click();
  
  // 状态等待：等待目标状态出现（状态驱动，非时间驱动）
  await this.page.locator('#nav_top_menu_more i.rotate').waitFor({ timeout: 2000 });
}
```

**设计优势**：
- **幂等性**：可重复执行，不会产生副作用
- **状态驱动**：基于状态而非时间，更可靠
- **快速路径**：状态检测避免不必要的操作

---

## 核心架构设计原则

### 1. 确定性优先原则（Deterministic First）

- **DOM操作 > AI判断**：优先使用确定性DOM操作，AI作为降级方案
- **状态检测 > 时间等待**：基于DOM状态而非固定延时
- **固定锚点 > 动态文本**：使用稳定的DOM标识符

### 2. 类型安全持久化（Type-Safe Persistence）

- **运行时类型检查**：确保Map/Object类型正确转换
- **序列化适配器**：解决Map与JSON的类型不兼容
- **性能保持**：内存中使用高效数据结构

### 3. 状态机驱动（State Machine Driven）

- **状态检测**：操作前检测当前状态
- **幂等性保证**：相同状态下的操作可重复执行
- **状态同步**：内部状态与DOM状态保持一致

### 4. 混合智能策略（Hybrid Intelligence）

- **确定性操作**：保证稳定性和性能
- **AI语义理解**：处理复杂和动态场景
- **智能降级**：从确定性逐步降级到AI

---

## 技术亮点总结

1. **固定锚点映射**：解决动态文本导致的定位失效，建立稳定的访问路径
2. **DOM状态驱动**：基于状态检测而非时间等待，提高可靠性
3. **类型安全持久化**：Map/Object双向转换，保证类型安全和性能
4. **状态机导航**：幂等性保证，避免重复操作和状态不一致
5. **混合智能架构**：确定性优先，AI降级，在稳定性和灵活性间平衡

