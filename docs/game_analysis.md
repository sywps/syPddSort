# 拼豆豆游戏 - 完整分析报告

## 一、项目概况

- **项目名称**：拼豆豆（抖音小游戏 / 微信小游戏）
- **引擎版本**：Cocos Creator 3.8.8（抖音）/ 3.8.5（微信）
- **分辨率**：720×1280
- **语言**：TypeScript
- **核心玩法**：连通色块选中 → 智能放置 → 颜色匹配锁定 → 限时通关

---

## 二、核心架构

### 2.1 目录结构

```
assets/
├── Resources/
│   ├── Audio/                    # 音效资源
│   │   ├── bgg.mp3              # 背景音乐
│   │   ├── select/place/slot/return/button/tick/fly/win/lose.wav  # SFX
│   │   └── candidates/          # 备选 BGM
│   ├── LevelData/               # 关卡 JSON 数据
│   │   ├── level_1.json ~ level_100.json          # 主关卡 (1-100)
│   │   ├── level_100001.json ~ level_100017.json  # 特殊关卡
│   │   └── level_501.json ~ level_600.json        # 扩展关卡
│   └── Textures/                # 图片纹理资源
│       ├── BG/bg_game.png       # 游戏背景
│       ├── UI/                  # UI 元素
│       ├── Slot/                # 暂存槽贴图
│       └── Beans/               # 豆豆图片
├── Scripts/
│   ├── Core/
│   │   ├── GameCtrl.ts          # 游戏主控制器（核心，~4300行）
│   │   ├── BoardModel.ts        # 棋盘数据模型
│   │   ├── LevelConfig.ts       # 关卡数据接口、颜色枚举
│   │   ├── SlotCtrl.ts          # 暂存槽数据模型
│   │   ├── LockCtrl.ts          # 锁定控制
│   │   └── AudioMgr.ts          # 音效管理器
│   └── UI/
│       ├── UIMain.ts            # UI 管理
│       └── SlotCtrl.ts          # 暂存槽逻辑
```

### 2.2 数据层架构

#### BoardModel（棋盘模型）

维护三个二维数组：
- `currentColors[row][col]` — 当前棋盘颜色状态
- `correctColors[row][col]` — 目标图案颜色
- `locked[row][col]` — 锁定状态

核心算法：
- **`getConnectedBlock(row, col)`** — BFS 8方向（含对角线）连通块提取
- **`placeBlockMaximize(block)`** — 智能放置：匹配正确颜色空位并锁定
- **`isAllLocked()`** — 通关判定：所有有效格（correctColor≠0）均已锁定

```typescript
// 8方向连通搜索（含对角线）
getConnectedBlock(row: number, col: number): BeanBlockInfo | null {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    // BFS 收集同色且未锁定的格子
}
```

#### SlotModel（暂存槽模型）

- 容量自动扩展，默认 12 格（`SLOTS_PER_ROW = 12`），可多行
- `store(block)` — 按颜色排序自动插入
- `takeAllSameColor(index)` — 最大化取出：收集所有同色合并返回
- `compact()` — 压缩空位

#### LevelData（关卡数据接口）

```typescript
interface LevelData {
    levelId: number;
    boardWidth: number;
    boardHeight: number;
    timeLimit: number;           // 倒计时秒数
    slotTotalCount: number;      // 初始暂存槽容量
    correctColorArr: number[][]; // 目标图案颜色
    initRandomColorArr: number[][]; // 初始乱序颜色
}
```

#### 颜色系统

- **20 种豆豆颜色**（`BeanColor.RED = 1` 到 `PEACH = 20`）
- `COLOR_HEX` / `COLOR_HEX_LOCKED` — 正常/锁定状态的十六进制色值映射
- 豆豆视觉效果：圆角方块 + X 对角线切面高光 + 3D 阴影边框

**20 种颜色一览**：红、蓝、绿、黄、紫、橙、粉、白、棕、金、海军蓝、青柠、品红、青、靛、铁锈、祖母绿、绯红、钢蓝、蜜桃

---

## 三、核心玩法流程

```
启动 → 预加载资源 → 检查 URL ?level= 参数
  ├─ 有参数 → 直接进入指定关卡
  └─ 无参数 → 显示主菜单
       └─ 点击"开始游戏" → 加载存档关卡

关卡加载 → buildUI() → renderBoard() + renderSlots() → 启动倒计时
  ├─ 放置成功 → play('place') + 震动 → 检查通关
  ├─ 放入暂存 → play('slot') + 震动
  └─ 放置失败 → play('return')

通关 → play('win') + 全棋盘弹跳 + 图案预览 → 弹出"通关成功" → 下一关
失败 → play('lose') → 弹出"时间到" → 看广告继续 / 重新开始
```

### 3.1 关键交互

| 交互 | 说明 |
|------|------|
| 点击棋盘连通块 | 选中同色连通的豆豆组 |
| 点击棋盘空位 | 尝试放置，颜色匹配则锁定 |
| 放入暂存槽 | 当棋盘无合适位置时暂存 |
| 从暂存槽取出 | 点击暂存槽中的豆豆，再放置到棋盘 |
| 全部锁定 | 通关 |
| 单指拖动 | 平移棋盘 |
| 双指捏合 | 缩放棋盘（0.7× ~ 2.2×） |

### 3.2 三个道具（技能按钮）

| 道具 | 功能 | 解锁关卡 |
|------|------|---------|
| **魔法棒（消除区域）** | 消除棋盘上 3×3 区域（最多 9 格），返回对应豆豆块到暂存槽 | Level 3 |
| **扫帚（清理暂存）** | 合并暂存槽中所有同色豆豆为一个，腾出更多空间 | Level 9 |
| **磁铁（消除颜色）** | 消除棋盘和暂存槽中数量最少的那种颜色的所有豆豆，全部送回暂存槽 | Level 22 |

---

## 四、控制层 — GameCtrl 核心功能

### 4.1 资源预加载
- `preloadAllAssets()` — 加载 Textures 目录所有 SpriteFrame

### 4.2 UI 构建
- `buildUI()` — 全代码绘制界面（无 Prefab 依赖）

### 4.3 触摸交互
- 单指 tap 选中/放置
- 单指拖动棋盘
- 双指缩放棋盘

### 4.4 动画系统
- **选中高亮**：选中豆豆块显示呼吸光晕叠加层
- **飞行动画**：豆豆从源位置飞向目标位置，由拖拽层承载
- **颜色完成特效**：单色全部完成时，金色圆环扩散 + 豆豆缩放弹跳
- **通关动画**：棋盘缩小 + 颜色涟漪弹跳 + 金色闪烁
- **图案预览**：通关后展示目标图案

### 4.5 新手引导
- **第 1 关** — 三步交互引导：
  - Step 0: 将右边豆豆块移入暂存槽
  - Step 1: 将左边豆豆块移到右边区域
  - Step 2: 将暂存槽豆豆放到左边区域（通关）
- **第 2 关** — 缩放引导（仅一次）：提示双指缩放棋盘

---

## 五、视觉设计系统

### 5.1 豆豆风格
- 宝石风格圆角方块
- 多层阴影 + X 切面高光
- 3D 立体感：暗色底座环 + 渐变色主体 + 对角线高光切面
- 锁定状态颜色变暗（`COLOR_HEX_LOCKED`）

### 5.2 棋盘风格
- 浅蓝灰卡片风格
- 米色内面板 + 淡蓝灰边框
- 网格对齐，默认格子大小 62px，间距 3px

### 5.3 暂存槽风格
- 统一背景卡片
- 凹槽预绘制圆形凹面
- 格子大小 44px，间距 2px

### 5.4 主菜单风格
- 中国风装饰（梅花枝、远山、树木、白云）
- 小熊豆豆展示图案
- 中国水墨/水彩画风格背景（1.5MB 大图）

### 5.5 关键常量
```
DEFAULT_CELL_SIZE = 62    // 棋盘格子大小
DEFAULT_CELL_GAP = 3      // 棋盘格子间距
SLOT_SIZE = 44            // 暂存槽格子大小
SLOT_GAP = 2              // 暂存槽格子间距
SLOTS_PER_ROW = 12        // 每行暂存槽数量
```

---

## 六、音效系统

### 6.1 BGM
- 循环播放，音量 0.35
- 资源路径：`resources/Audio/bgm.mp3`

### 6.2 SFX（14 种音效）
| 音效名 | 用途 | 音量 |
|--------|------|------|
| select | 选中豆豆块 | 0.6 |
| place | 成功锁定到棋盘 | 0.8 |
| slot | 放入暂存槽 | 0.55 |
| return | 放置失败/取消 | 0.5 |
| button | 按钮点击 | 0.6 |
| tick | 倒计时最后几秒 | 0.4 |
| fly | 豆豆飞行 | 0.5 |
| win | 通关 | 0.9 |
| lose | 失败 | 0.8 |
| winColor | 单色完成 | 0.85 |
| winAll | 全棋盘通关 | 0.95 |
| propBrush | 清理暂存道具 | 0.7 |
| propFreeze | 冻结道具 | 0.75 |
| revivePop | 复活/加时弹窗 | 0.7 |

### 6.3 震动反馈
- 短震动（默认 30ms），用于点击/放置触觉反馈
- 抖音小游戏：`tt.vibrateShort({})`
- Web 浏览器：`navigator.vibrate(ms)`

### 6.4 设置持久化
- `pdd.setting.sfx` — 音效开关
- `pdd.setting.bgm` — 背景音乐开关
- `pdd.setting.vib` — 震动开关

---

## 七、CDN 远程资源加载

### 7.1 配置
- 远程 CDN 服务器：`https://pindoucdn.darknight.games/pdwj/wx/2026042501/`
- 远程 bundles：["internal", "resources", "main", "Config", "Font", "GameScene", "LevelData", "MainScene", "Pool", "Sounds", "SpriteFrames", "TTHuoKeScene"]

### 7.2 构建版本
- 构建版本标识：`2026042501`
- 系统注册模块模式（System.register）
- 分包加载：main/index.js（1.3MB，29K 行）、resources/index.js（MultTextures 渲染优化）

### 7.3 首屏加载
- WebGL 启动画面带进度条
- 加载顺序：Cocos 引擎 → 游戏逻辑 → 资源
- 进度分阶段：0.2 → 0.4 → 0.6 → 1.0

---

## 八、广告与变现

### 8.1 激励广告
- 失败时可看广告继续游戏（+180 秒）
- 广告单元 ID：`so89260s57143ahcbc`
- 非抖音环境自动跳过

### 8.2 侧边栏引导
- 引导用户添加到抖音侧边栏（抖音审核必接）

---

## 九、进度系统

### 9.1 关卡进度
- 持久化存储键：`pdd.level`
- 通关后自动解锁下一关

### 9.2 金币系统
- 持久化存储键：`pdd.gold`
- 通关后按新通关关卡数奖励金币

### 9.3 图鉴系统
- 已通关关卡解锁图案预览
- 分页浏览：300 个主关卡 + 17 个特殊关卡

---

## 十、关卡设计

### 10.1 典型关卡示例

| 关卡 | 棋盘大小 | 颜色数 | 时间 | 特点 |
|------|---------|--------|------|------|
| level_1 | 6×4 | 2 | 120s | 新手关，简单几何 |
| level_3 | — | — | — | 解锁魔法棒道具 |
| level_9 | — | — | — | 解锁扫帚道具 |
| level_22 | — | — | — | 解锁磁铁道具 |
| level_100 | — | — | — | 主关卡里程碑 |
| level_501 | 20×22 | 10+ | 187s | 复杂关卡 |
| level_100001 | 29×23 | 10 | 210s | 像素猫咪图案 |

### 10.2 关卡复杂度演进
- **初期（1-50）**：简单几何形状，少颜色数，大棋盘
- **中期（50-100）**：复杂图案，颜色数增加
- **后期（100-300）**：高难度像素画，多颜色
- **特殊关卡（100001+）**：特殊图案（动物像素画等）

---

## 十一、平台差异

### 11.1 抖音小游戏（pindoudou）
- 本地资产 + TypeScript 源码
- 侧边栏引导
- 广告单元：so89260s57143ahcbc

### 11.2 微信小游戏（pindd）
- 编译输出包
- 所有资产从 CDN 远程加载
- 包含 Spine 骨骼动画（微信版独有）
- System.register 模块打包模式
- web-adapter.js 适配器层

---

## 十二、渲染优化

### 12.1 MultTextures 批量渲染
- 自定义 2D 批量渲染器（MultBatch2D）
- 多纹理采样器合并绘制调用
- 纹理 ID 追踪与哈希更新
- 支持 Label、Sprite、MotionStreak、TiledLayer 组件

### 12.2 渲染层
- 自定义层：UI_TOP_2D, loadCanvas, map, arrowLayer, gameSceneBg
- Graphics 组件全代码绘制（无 Prefab 依赖）

---

## 十三、技术要点总结

| 特性 | 实现方式 |
|------|---------|
| 连通块算法 | BFS 8 方向搜索 |
| 放置策略 | 智能匹配颜色到正确空位 |
| 存储策略 | 同色自动分组排序 |
| 锁定机制 | 正确放置自动锁定 |
| UI 构建 | 全代码绘制（无 Prefab） |
| 资源加载 | 远程 CDN 异步加载 |
| 触摸交互 | tap / drag / pinch 三模式 |
| 动画系统 | 飞行/弹跳/涟漪/金色圆环 |
| 音效系统 | BGM + 14 种 SFX + 震动 |
| 进度保存 | localStorage 持久化 |
