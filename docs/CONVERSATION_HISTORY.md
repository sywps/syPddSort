:q# 开发对话记录

## 会话概述

本次会话解决了拼豆豆项目的多个开发问题，从黑屏修复到关卡生成系统的完善。

---

## 问题 1: 游戏预览黑屏

**用户**: 打开 http://localhost:7456/ 黑屏

**排查过程**:
1. 检查 `Game.scene` 文件，发现相机 `_clearFlags: 6` (只清除深度+模板)，改为 `7` (清除颜色+深度+模板)
2. 更改相机清除色从深灰 (51,51,51) 到暖白 (245,235,220)
3. 链接 Canvas 的 `_cameraComponent` 到 Camera 节点
4. 发现 Cocos 编辑器预览使用内存中的场景状态，不是磁盘文件
5. curl 检查 `http://localhost:7456/scene/current_scene.json` 发现加载的是空场景
6. **根因**: 编辑器当前打开的是默认空场景 `scene-2d`，不是 `Game.scene`

**解决**: 告知用户在 Cocos 编辑器中双击 `Game.scene` 后再预览

**附带修复**:
- 渲染管线从 `custom-pipeline` 改为 `legacy-pipeline`
- `startScene` 设置为 Game.scene UUID

---

## 问题 2: 资源加载 paths 为 undefined

**问题**: `resources.loadDir()` 回调中 `paths` 参数为 undefined

**原因**: 使用了 3 参数重载 `loadDir(path, type, callback)`，该重载不提供 `paths`

**修复**: 改为 4 参数重载:
```typescript
resources.loadDir('Textures', SpriteFrame, () => {}, (err, frames, paths) => { ... });
```

---

## 问题 3: 关卡编辑器中预览游戏

**用户**: 改进关卡编辑器，可以在编辑器中预览关卡

**尝试方案**:
1. ❌ iframe 嵌入 + localStorage 通信 — 跨域限制 (file:// vs http://)
2. ❌ iframe + postMessage — Cocos 编辑缓存未重新编译，新代码未加载
3. ✅ Canvas 直接渲染豆豆预览 — 在编辑器右侧用 Canvas 2D 绘制豆豆效果

**最终实现**: 在 `level-editor.html` 右侧面板添加 Canvas 游戏预览，支持"目标图案"和"初始乱序"两种模式

---

## 问题 4: 图片导入格子数不足

**用户**: 从下载图生成的关卡图的格子数不够，要尽量还原下载图

**修复**:
- 网格最大值从 16 提升到 32
- 图片导入自动计算最佳格数 (最长边最多28格)
- 格子大小动态计算 `getCellSize()`
- 格子间距从 2px 缩小到 1px
- 自动设置 timeLimit 和 slotCount

---

## 问题 5: URL 关卡参数

**用户**: 实现从浏览器地址栏加关卡参数，从任意关开始

**实现**: 在 `GameCtrl.ts` 添加:
```typescript
private getUrlLevel(): number {
    const p = new URLSearchParams(window.location.search);
    const v = parseInt(p.get('level') || '');
    return v > 0 ? v : 0;
}
```
`start()` 中检测 URL 参数，有则直接 `loadLevel(urlLevel)` 跳过主菜单

---

## 问题 6: 生成 11-99 关关卡

**用户**: 模仿100关以后的生成方式，生成11关到99关的内容

**分析**:
- 现有关卡: 1-10 (手工), 100-172 (拼豆模板)
- 11-99 缺失

**实现**: 创建 `tools/generate-levels.js`:
- 12种几何图案: 圆形、菱形、心形、星形、十字、双圆、矩形嵌套、三角、圆环、箭头、四圆、月亮
- 难度递进: 棋盘 13x13→32x32，时间 400s→2200s，颜色 3→5种
- 种子随机确保可复现

---

## 问题 7: 补充 meta 文件

**用户**: 生成的关卡无法加载，需要补充 meta 文件

**修复**: 为每个 `level_N.json` 生成对应 `.json.meta`:
```json
{
  "ver": "2.0.1",
  "importer": "json",
  "imported": true,
  "uuid": "<随机UUID>",
  "files": [".json"],
  "subMetas": {},
  "userData": {}
}
```

---

## 问题 8: 棋盘大小自适应

**用户**: 棋盘大小不变，豆豆数增加时应缩小豆豆，保证不溢出

**修复**: 将 `CELL_SIZE` 从固定常量改为动态属性:
```typescript
const maxBoardPx = 660;
const maxDim = Math.max(bw, bh);
this.cellSize = Math.min(DEFAULT_CELL_SIZE,
    Math.floor((maxBoardPx - (maxDim - 1) * CELL_GAP - 28) / maxDim));
```
全文替换所有 `CELL_SIZE` 引用为 `this.cellSize`

---

## 问题 9: 乱序要求 95%+ 位移率

**用户**: 加载时要求95%以上的豆豆是错乱的，并保持原来图案

**问题分析**: 简单 Fisher-Yates 洗牌在颜色分布不均时，大量豆豆自然落回正确位置

**解决方案**:
1. **颜色平衡**: 添加 `colorizeInterior()` — 用对角条纹重新着色内部区域，确保各颜色均匀分布
2. **强制位移**: 添加循环移位算法 — 将颜色组循环移位 (A→B, B→C, ..., Z→A)，保证 100% 位移
3. **保持形状**: 空格位置 (值为0) 始终不变

**验证**: 所有 89 个关卡 (11-99) 均满足 >=95% 位移率

---

## 问题 10: 100关后关卡也需要满足95%乱序要求

**用户**: 100关后的关卡生成也要满足要求

**状态**: 待处理 — 需要对现有 100-172 关的 `initRandomColorArr` 重新生成，使用相同的强制位移算法

---

## 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `assets/Scenes/Game.scene` | 相机 clearFlags、清除色、Canvas 链接 |
| `assets/Scripts/Core/GameCtrl.ts` | 资源加载修复、URL参数、格子大小动态化 |
| `settings/v2/packages/engine.json` | 渲染管线改为 legacy-pipeline |
| `settings/v2/packages/project.json` | 设置 startScene |
| `tools/level-editor.html` | 预览功能、图片导入优化、网格扩展 |
| `tools/generate-levels.js` | 新建 — 关卡批量生成脚本 |
| `assets/Resources/LevelData/level_11~99.json` | 新建 — 89个关卡文件 |
| `assets/Resources/LevelData/level_11~99.json.meta` | 新建 — 89个meta文件 |
