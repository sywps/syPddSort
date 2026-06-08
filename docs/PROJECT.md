# 拼豆豆 (PinDouDou) - 项目文档

## 项目概述

拼豆豆是一款中国风豆豆拼图游戏，目标平台为抖音小游戏。玩家需要将打乱的彩色豆豆还原为目标图案。

- **引擎**: Cocos Creator 3.8.8
- **语言**: TypeScript
- **设计分辨率**: 720 x 1280
- **渲染管线**: Legacy Pipeline (2D)

---

## 目录结构

```
pindoudou/
├── assets/
│   ├── Resources/
│   │   ├── Audio/            # BGM + 9个音效 (WAV)
│   │   ├── LevelData/        # 172个关卡 JSON (level_1 ~ level_172)
│   │   └── Textures/         # 豆豆/背景/UI 纹理
│   ├── Scripts/
│   │   ├── Core/             # 核心游戏逻辑
│   │   │   ├── GameCtrl.ts   # 主控制器 (~2730行)
│   │   │   ├── BoardModel.ts # 棋盘数据模型
│   │   │   ├── LevelConfig.ts# 关卡数据结构定义
│   │   │   ├── LockCtrl.ts   # 锁定判定
│   │   │   └── AudioMgr.ts   # 音频管理单例
│   │   ├── Platform/         # 平台适配 (抖音广告/隐私)
│   │   └── UI/               # UI 控制器
│   └── Scenes/
│       └── Game.scene         # 唯一场景
├── tools/
│   ├── level-editor.html      # 网页版关卡编辑器
│   ├── generate-levels.js     # 关卡批量生成脚本
│   └── makebead-templates.js  # 拼豆图案模板库 (150+)
├── settings/                  # Cocos Creator 配置
├── package.json
└── tsconfig.json
```

---

## 核心架构

### 数据结构

```typescript
// 豆豆颜色
enum BeanColor {
    NONE = 0,
    RED = 1, ORANGE = 2, YELLOW = 3, GREEN = 4, BLUE = 5
}

// 关卡数据
interface LevelData {
    levelId: number;
    boardWidth: number;          // 棋盘宽度 (格数)
    boardHeight: number;         // 棋盘高度 (格数)
    timeLimit: number;           // 时间限制 (秒)
    slotTotalCount: number;      // 暂存槽数量
    correctColorArr: number[][]; // 目标图案 [行][列]
    initRandomColorArr: number[][];  // 初始乱序 [行][列]
}

// 豆豆块信息
interface BeanBlockInfo {
    colorId: number;
    cells: { row: number; col: number }[];
    isLocked: boolean;
    source: 'board' | 'slot';
    slotIndex?: number;
}
```

### 主要类

| 类 | 文件 | 职责 |
|---|---|---|
| `GameCtrl` | Core/GameCtrl.ts | 主控制器：UI渲染、游戏流程、触摸输入、动画 |
| `BoardModel` | Core/BoardModel.ts | 棋盘状态：当前颜色、目标颜色、锁定、BFS连通块 |
| `SlotModel` | UI/SlotCtrl.ts | 暂存槽：存取豆豆块、按颜色分组、压缩 |
| `LockCtrl` | Core/LockCtrl.ts | 锁定验证：检查豆豆是否放置正确 |
| `AudioMgr` | Core/AudioMgr.ts | 音频单例：BGM/音效/震动 |

### GameCtrl 关键方法

| 方法 | 行号 | 功能 |
|------|------|------|
| `start()` | 90 | 生命周期入口：设置分辨率、预加载资源 |
| `preloadAllAssets()` | 121 | 加载所有纹理资源 |
| `showMainMenu()` | 172 | 绘制主菜单界面 |
| `loadLevel(levelId)` | 520 | 加载关卡JSON并初始化 |
| `initGame(data)` | 530 | 初始化棋盘/暂存槽、启动游戏 |
| `buildBoard(root)` | 625 | 创建棋盘网格节点，动态计算格子大小 |
| `renderBoard()` | 1412 | 绘制所有棋盘格 |
| `drawBean(g, colorId, ...)` | 1485 | 绘制豆豆圆形图形 |
| `onTouchStart/Move/End()` | 1608-1660 | 触摸事件处理 |
| `trySelectBoard(worldPos)` | 1716 | 检测棋盘上豆豆点击 |
| `handlePlace(worldPos)` | 1840 | 放置豆豆到目标位置 |
| `startFlyPlace()` | 1953 | 豆豆飞行动画 |
| `gameWin()` / `gameLose()` | 2143/2151 | 胜负判定 |
| `startTutorial()` | 2191 | 新手引导 (6步) |

### 关键常量

```typescript
const DEFAULT_CELL_SIZE = 62;  // 默认格子大小 (根据棋盘格数动态缩放)
const CELL_GAP = 4;            // 格子间距
const SLOT_SIZE = 42;          // 暂存槽大小
const SLOTS_PER_ROW = 12;     // 每行暂存槽数
const MAX_AD_WATCHES = 2;      // 最大广告观看次数
```

---

## 关卡系统

### 关卡分布

| 范围 | 棋盘大小 | 颜色数 | 时间 | 生成方式 |
|------|---------|--------|------|---------|
| 1-10 | 8x8 ~ 12x12 | 2-5 | 180-360s | 手工设计 |
| 11-99 | 13x13 ~ 32x32 | 3-5 | 400-2200s | 脚本生成 (几何图案) |
| 100-172 | 32x32 ~ 34x34 | 3-5 | 2000-2400s | 拼豆模板 (像素画) |

### 格子大小自适应

棋盘格子大小根据格数动态计算，确保不溢出边界：

```typescript
const maxBoardPx = 660;
const maxDim = Math.max(bw, bh);
this.cellSize = Math.min(DEFAULT_CELL_SIZE,
    Math.floor((maxBoardPx - (maxDim - 1) * CELL_GAP - 28) / maxDim));
this.cellSize = Math.max(8, this.cellSize);
```

### URL参数支持

可通过URL参数跳转到任意关卡：
```
http://localhost:7456/?level=50
```

---

## 关卡编辑器 (tools/level-editor.html)

网页版关卡编辑器，功能包括：
- 网格绘制：支持最大 32x32 网格
- 颜色选择：5种豆豆颜色 + 橡皮擦
- 对称模式：水平/垂直/中心对称
- 预设图案：几何形状 (圆/心/星等)
- 图片导入：自动量化为豆豆颜色
- 乱序生成：Fisher-Yates 随机打乱
- JSON 导出：直接复制或下载关卡文件
- 游戏预览：Canvas渲染豆豆效果预览

---

## 关卡生成脚本 (tools/generate-levels.js)

批量生成关卡文件的 Node.js 脚本：

- **图案类型**: 圆形、菱形、心形、星形、十字、双圆、矩形嵌套、三角、圆环、箭头、四圆、月亮
- **颜色平衡**: 内部区域使用对角条纹着色，确保各颜色分布均匀
- **乱序算法**: 
  - 循环移位保证 95%+ 位移率
  - 保持图案形状 (空格位置不变)
  - 保持颜色总数一致

运行方式：
```bash
node tools/generate-levels.js
```

---

## 音频系统

| 音效名 | 用途 | 音量 |
|--------|------|------|
| bgm | 背景音乐循环 | 0.35 |
| select | 选中豆豆 | 0.6 |
| place | 放置豆豆 | 0.7 |
| slot | 存入暂存槽 | 0.5 |
| return | 退回豆豆 | 0.5 |
| button | 按钮点击 | 0.5 |
| tick | 倒计时 | 0.4 |
| fly | 豆豆飞行 | 0.5 |
| win | 过关 | 0.9 |
| lose | 失败 | 0.7 |

设置持久化到 localStorage：`pdd.setting.sfx`, `pdd.setting.bgm`, `pdd.setting.vib`

---

## 平台适配

- **目标平台**: 抖音小游戏 (ByteDance/Douyin)
- **广告**: AdConfig.ts 预留激励广告接口
- **隐私**: PrivacyCtrl.ts 适配抖音隐私协议弹窗
- **震动**: 优先使用 `tt.vibrateShort()`，降级到标准 Vibration API

---

## 开发指南

### 启动预览
1. 用 Cocos Creator 3.8.8 打开项目
2. 双击 `assets/Scenes/Game.scene`
3. 点击预览按钮，浏览器访问 `http://localhost:7456/`

### 新增关卡
1. 使用 `tools/level-editor.html` 设计关卡
2. 导出 JSON 到 `assets/Resources/LevelData/level_N.json`
3. 创建对应 `.json.meta` 文件 (需要唯一 UUID)

### 批量生成关卡
```bash
# 生成 level_11 到 level_99
node tools/generate-levels.js
```

### 颜色映射
| ID | 颜色 | 普通色值 | 锁定色值 |
|----|------|---------|---------|
| 0 | 空 | - | - |
| 1 | 红 | #C75450 | #A0403D |
| 2 | 橙 | #D4944A | #B07838 |
| 3 | 黄 | #C9B645 | #A89835 |
| 4 | 绿 | #5B9A6E | #487A56 |
| 5 | 蓝 | #4A7FB5 | #3A6590 |
