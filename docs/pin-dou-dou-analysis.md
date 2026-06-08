:
# pin-dou-dou 构建产物分析

> 分析对象: `pin-dou-dou/` 子目录（Cocos Creator 构建产物，抖音小游戏包）  
> 分析日期: 2026-04-28

## 1. 项目本质

这是一个 **Cocos Creator 构建产物**（已编译的抖音小游戏包），不是源代码工程。实际游戏名是 **"klppd"**（`seeg.js` 中 `gid: "wx_klppd"`），是一款远程托管资源的在线拼豆豆游戏。

## 2. 目录结构

```
pin-dou-dou/
├── src/                          # JS 代码 (System.register 模块)
│   ├── bundle-scripts/           # 空壳占位（实际逻辑在 remote bundles 中）
│   │   ├── com/index.js          # 14 行，空模块
│   │   ├── game/index.js         # 14 行，空模块
│   │   └── home/index.js         # 14 行，空模块
│   ├── chunks/
│   │   └── bundle.js             # System.register 加载器
│   ├── import-map.js             # Cocos 引擎模块映射（43 个 cocos-js 模块）
│   ├── settings.json             # Cocos 引擎配置
│   └── effect.bin                # 自定义渲染管线
├── assets/
│   ├── internal/                 # 内置资源
│   │   ├── config.json
│   │   └── import/06/06585a170.json
│   └── start-scene/              # 启动场景（加载界面）
│       ├── config.json
│       ├── index.js
│       ├── import/0b/0bba9e8e1.json  # 场景数据（LoadScene.prefab）
│       └── native/
│           ├── 30/...jpg         # bg_game 背景图
│           └── 35/...png         # login 登录图
├── subpackages/                  # 分包
│   ├── bridge/                   # 桥接包（核心框架，726 行 JS）
│   │   ├── game.js               # 11 个模块
│   │   ├── config.json           # 分包配置
│   │   ├── import/               # SpriteFrame JSON
│   │   │   ├── 01/01cd5ad03.json
│   │   │   ├── 05/0595076fb.json
│   │   │   ├── 11/11cd5ad03@6c48a.json
│   │   │   ├── 17/...mp3
│   │   │   ├── 52/5293b737-...json
│   │   │   ├── 62/...atlas
│   │   │   ├── 7a/...json
│   │   │   ├── 7b/...json
│   │   │   └── 83/...json
│   │   └── native/               # 图片/音频
│   │       ├── 11/11cd5ad03.png  # 加载界面装饰
│   │       ├── 17/...mp3         # 音频
│   │       ├── 52/5293b737-...png # 5 个彩色圆柱
│   │       └── 62/...atlas       # 图集
│   ├── main/                     # 主包（空壳）
│   ├── libs/                     # 库包
│   └── scripts/                  # 脚本包
── cocos-js/                     # Cocos 引擎运行时（~6 个文件）
├── seeg.js                       # SDK 适配器（223KB）
├── game.json                     # 抖音小游戏配置
├── app-config.json               # 应用配置
├── application.js                # 应用入口
├── engine-adapter.js             # 引擎适配层
├── web-adapter.js                # Web 适配层
├── first-screen.js               # 首屏渲染
└── @babel/runtime/               # Babel 运行时
```

## 3. 远程资源服务器

### 资源 CDN
```
https://res.wqop2018.com/zhise/klppd/v1.0.9/
```

### 关卡配置 CDN
```
https://res.wqop2018.com/mp/projects/pdzsh/config/level/{invokeId}_{version}.json
```

### Subpackage 远程加载
- `com` — 公共资源包
- `game` — 游戏核心包（面板、豆豆、棋盘）
- `home` — 主页资源包
- `libs` — 第三方库包
- `scripts` — 脚本包

## 4. Cocos 引擎配置（settings.json）

| 配置项 | 值 |
|--------|-----|
| 引擎版本 | 3.8.5 |
| 设计分辨率 | 750×1334 (EXACT_FIT) |
| 调试模式 | false |
| 渲染管线 | 自定义管线（customPipeline） |
| 启动场景 | db://assets/zsmp/load/LoadScene.scene |
| 远程 Bundle | com, game, home |
| Subpackages | main, bridge, libs, scripts |
| 预加载 Bundle | start-scene, main |

## 5. 核心框架模块（subpackages/bridge/game.js，726 行）

### 模块列表

| 模块 | 说明 |
|------|------|
| ZSConfigMgr | 关卡配置管理（`configLevelMapCdn` 远程拉取） |
| ZSGameDataMgr | 游戏数据管理（体力、道具、连胜、DDA 难度动态调整） |
| ZSInit | 框架初始化入口 |
| ZSLoad | 场景加载（bundles: scripts/com/home/game） |
| ZSPort | 端口配置（视图定义、事件名称） |
| ZSResMgr | 资源管理 |
| ZSSeeg | SDK 适配器（包装 `window.wx` / `window.seeg`） |
| ZSUIView | UI 视图基类 |
| ZSUtil | 工具函数 |
| ZSView | 视图基类 |
| ZSViewMgr | 视图管理器 |

### 视图/面板定义（ZSPort.viewName）

```js
UIHome:     { key: "UIHome",   bundleName: "home",   prefabPath: "prefabs/UIHome" }       // 主菜单
UICollect:  { key: "UICollect", bundleName: "home",  prefabPath: "prefabs/UICollect" }    // 图鉴
UITop:      { key: "UITop",    bundleName: "home",   prefabPath: "prefabs/UITop" }        // 顶部栏
UIGame:     { key: "UIGame",   bundleName: "game",   prefabPath: "prefabPanels/UIGame" }  // 游戏主界面
UIGuide:    { key: "UIGuide",  bundleName: "game",   prefabPath: "prefabPanels/UIGuide" } // 新手引导
UILose:     { key: "UILose",   bundleName: "game",   prefabPath: "prefabPanels/UILose" }  // 失败面板
UIWin:      { key: "UIWin",    bundleName: "game",   prefabPath: "prefabPanels/UIWin" }   // 胜利面板
UITimeUp:   { key: "UITimeUp", bundleName: "game",   prefabPath: "prefabPanels/UITimeUp"} // 时间到面板
UIUnvigorous: { key: "UIUnvigorous", bundleName: "game", prefabPath: "prefabPanels/UIUnvigorous" } // 无体力
UIUseItem:  { key: "UIUseItem", bundleName: "game",  prefabPath: "prefabPanels/UIUseItem" } // 使用道具
UISetting:  { key: "UISetting", bundleName: "home",  prefabPath: "prefabs/UISetting" }    // 设置
loading:    { key: "loading",  bundleName: "bridge", prefabPath: "prefabs/loading" }      // 加载界面
tip:        { key: "tip",      bundleName: "bridge", prefabPath: "prefabs/tip" }          // 提示
```

### 视图层级（ZSPort.viewTier）

```
below  (1)  — 底层（主菜单、游戏界面）
middle (2)  — 中层
above  (3)  — 上层（弹窗：失败、胜利、时间到、设置）
top    (4)  — 顶层（顶部栏）
guide  (5)  — 引导层（新手引导）
loading(6)  — 加载层
tip    (7)  — 提示层
```

### 事件名称（ZSPort.EventName）

```
STARTGAME      → "startGame"
UPDATEPROGRESS → "updateProgress"
GAMEWIN        → "gameWin"
GAMEFAIL       → "gameFail"
REVIVE         → "revive"
```

## 6. ZSGameDataMgr 关键功能

### 体力系统
- `getVigor()` / `costVigor()` — 体力获取与消耗

### 道具系统
- `getItemNum(id)` / `costItemNum(id, n)` / `addItemNum(id, n)` — 道具数量管理

### 关卡失败/连胜
- `getLevelFailCount(level)` — 获取关卡失败次数
- `addLevelFail(level)` — 记录失败
- `clearLevelFail(level)` — 清除失败记录
- `recordLevelWin(level, levelId, isDdaWin)` — 记录胜利

### DDA（动态难度调整）
- `isDdaEnabled(level, levelId)` — 判断是否启用 DDA
- `getDdaTimeFactor()` — DDA 时间调整系数
- `getDdaAutoFillRatio()` — DDA 自动填充比例
- `isHardLevel()` — 是否为困难关卡
- `getLevelDifficulty()` — 获取关卡难度
- `getLevelCoinAward()` — 获取关卡金币奖励（困难关卡 × 1.5）
- `canClaimFailGift()` — 是否可领取失败礼包
- `claimFailGift()` — 领取失败礼包

### DDA 触发条件
- 关卡 ≥ `ddaLv` 配置值
- 失败次数 ≥ 2
- 连胜达到 `ddaHardTrigger` 时触发下一关为困难关卡

### 收集奖励
- `hasCollectAwardClaimed(id)` / `claimCollectAward(id)` — 收集奖励领取

## 7. ZSConfigMgr 关卡配置

### 配置拉取流程
```
1. 从 configLevel 表中获取 invokeId
2. 从 configLevelMapCdn 中获取版本号和远程 URL
3. 拼接 URL: https://res.wqop2018.com/mp/projects/pdzsh/config/level/{invokeId}_{version}.json
4. 远程加载 JSON 并缓存到 _levelMapConfigMap
```

### 本地配置表
- `configLevel` — 关卡基础信息（id, invokeId, difficulty, ingnoreDda, CoinAward）
- `configLevelMap` — 关卡映射关系
- `configLevelMapCdn` — CDN 版本映射

## 8. SDK 配置（seeg-env.js）

```js
gid: "wx_klppd"
version: "1.0.4"
debug: false
appId: "wx26767e085e3b561e"  // 微信小程序 AppID
geClientToken: "Hx8AgvC6Dye0Pby1q4hWoorVI9rKlaYs"
dnSecretKey: "564cee434313da1cf6d99b548558588e"
ad: { rewardedVideoIds: [], interstitialIds: [] }
share: { title: [], imageUrl: [], imageUrlId: [] }
```

## 9. 棋盘豆豆资源

### 本地仅有的图片资源

| 文件 | 内容 |
|------|------|
| `subpackages/bridge/native/11/11cd5ad03.png` | 加载界面竖条装饰（紫色/蓝色渐变），包含"Loading"字样和"健康游戏忠告" |
| `subpackages/bridge/native/52/5293b737-...png` | 5 个彩色圆柱（蓝、粉、橙、黄、绿），可能是豆豆素材或加载提示 |

### 豆豆/棋盘的实际资源位置

豆豆、棋盘、UI 等资源 **不在本地**，而是：

1. **通过 `game` 分包远程加载**（`prefabPanels/UIGame` 等）
2. **关卡配置**（`configLevelMapCdn`）从 CDN 获取
3. **棋盘贴图、豆豆纹理** 都在 `game` 和 `com` 分包的远程服务器中

### 桥接包中的 SpriteFrame

| UUID | 用途 |
|------|------|
| `5293b737-6f56-4c1e-a37f-0627f3e5d340` | "loading" 字样 SpriteFrame（208×47） |
| `11cd5ad03` | 加载界面装饰图 |
| `17a8a227-...` | MP3 音频文件 |
| `62872363-...` | Atlas 图集 |

## 10. 关卡数据结构

### 与源码工程的区别

源码工程（`assets/Resources/LevelData/`）的关卡 JSON 格式：
```json
{
  "levelId": 1,
  "boardWidth": 6,
  "boardHeight": 4,
  "timeLimit": 120,
  "slotTotalCount": 24,
  "correctColorArr": [...],
  "initRandomColorArr": [...]
}
```

CDN 远程关卡（`levels/` 目录）的格式更丰富：
```json
{
  "boardWidth": 15,
  "boardHeight": 22,
  "timeLimit": 120,
  "slotTotalCount": 210,
  "correctColorArr": [...],
  "initRandomColorArr": [...],
  "source": "DL_0001",
  "levelId": 1,
  "filledCellCount": 210,        // 有效格子数
  "colorCount": 4,               // 颜色种类数
  "colorStats": { "1": 102, "2": 81, "3": 11, "4": 16 }, // 各颜色统计
  "displacementRatio": 0.9238,   // 位移比例（初始乱序程度）
  "initShuffleSeed": 20378569,   // 打乱种子
  "initShuffleMaxGroupsPerColor": 4  // 每种颜色最大连通组数
}
```

### 本地关卡数量

- `levels/` 目录：约 **2369 个关卡 JSON** 文件
- 源码 `LevelData/`：617 个关卡 JSON 文件

## 11. 与源码工程的对比

| 项目 | 源码工程 (`assets/Scripts/`) | 构建产物 (`pin-dou-dou/`) |
|------|---------------------------|------------------------|
| 游戏名 | pdd（拼豆豆） | klppd |
| 引擎版本 | 3.8.8 | 3.8.5 |
| 分辨率 | 720×1280 | 750×1334 |
| 豆豆绘制 | Graphics API + SpriteFrame | Prefab + 远程资源 |
| 关卡数据 | 617 个本地 JSON | CDN 远程拉取，数量更多 |
| 代码 | TypeScript 源码 | System.register 打包的 JS |
| 资源存储 | Resources/Textures/Beans/ | 分包 game/com 远程加载 |
| 渲染管线 | 默认 | 自定义管线 |
| 加载方式 | 本地预加载 | 远程分包按需加载 |

## 12. 项目根目录辅助资源

### 截图参考

| 文件 | 说明 |
|------|------|
| `qipan.jpg` | 棋盘 UI 参考（像素风格，4 个图案：星星、猫咪、小鸡、彩虹） |
| `doudou.png` | 豆豆样式参考（宝石风格棋盘 + 暂存槽 UI） |
| `game.jpg` | 游戏界面参考 |
| `main.jpg` | 主菜单界面参考 |
| `victory.png` | 胜利界面参考 |
| `example.png` | 示例界面 |
| `aochao.jpg` | 傲朝相关图片 |
| `dyad.png` | 双人模式参考 |

### 关卡正确图案像素图（`images/`）

```
level_1_correct_pattern.png    level_1_correct_pixel.png
level_2_correct_pattern.png    level_2_correct_pixel.png
level_3_correct_pattern.png    level_3_correct_pixel.png
```

### 工具脚本

| 文件 | 说明 |
|------|------|
| `export-beans.py` | 豆豆资源导出脚本 |
| `download_levels.py` | 关卡数据下载脚本 |

### 备份目录

```
guanka/                       # 关卡数据（当前版本）
guanka.0427/                  # 04-27 备份
guanka.restore_backup_.../    # 备份恢复版本
hacked-level/                 # 修改后的关卡
hacked-level-1/               # 修改版本 1
hacked-level-2/               # 修改版本 2
```

## 13. 总结

`pin-dou-dou/` 是竞品 **"klppd"** 的构建产物包，关键特点：

1. **远程资源架构**：所有豆豆、棋盘、UI 资源通过 CDN 远程加载，本地仅保留框架代码
2. **动态难度调整（DDA）**：内置 DDA 系统，根据玩家失败次数动态调整时间、自动填充、关卡难度
3. **模块化分包**：bridge/com/game/home/libs/scripts 多分包架构，按需加载
4. **SDK 适配层**：通过 `seeg.js` 统一适配微信/抖音等多平台 SDK
5. **关卡数据丰富**：本地 `levels/` 目录有 2369 个关卡，包含颜色统计、位移比例等元数据，远超源码工程的 617 个关卡
