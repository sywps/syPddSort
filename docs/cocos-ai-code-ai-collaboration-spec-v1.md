# Cocos AI + Code AI 协作规范 v1

> **P0 冻结说明（2026-07-25）**
>
> 本文件已完成一次仅限于启动语义、状态字段权威、CDN 发布边界和实验治理的 P0 校正，自此冻结为 V2（拼豆 / 连续关卡型游戏）历史基线。后续不得把具体实验、单次事故修复或新项目特例继续追加到本文件；新规则应进入后续分层规范。新规范正式接管前，可以引用本文件的明确安全边界，但不能把“V1 有记录”当作当前源码、构建产物或线上行为已经符合的证据。

## 1. 目标与适用范围
本规范用于约束 AI-first 的 Cocos Creator 游戏开发流程，目标不是规定“谁来写代码”，而是规定：

1. `Cocos AI`、`Code AI`、`Human` 的职责边界。
2. `scene`、`prefab`、TypeScript / JavaScript、构建脚本、bundle 和远程数据的真源归属。
3. 如何避免代码绕开 Cocos 原生体系，重建第二套 UI 或资源系统。
4. 如何验证用户可见结果，而不是只验证脚本或静态代码。

核心原则：

> Cocos AI 负责把静态资产“放对、摆对、看得见”；Code AI 负责把运行时逻辑“接上、跑通、动起来”；Human 负责把方向“改准、判对、收口”。同一字段、节点、资源引用或运行时状态只能有一个真源。

## 2. 角色定义
### 2.1 Cocos AI
`Cocos AI` 负责直接生成和维护 Cocos 编辑器资产，包括：

1. `scene` / `prefab`。
2. 节点结构、节点层级、节点名称和 sibling 顺序。
3. 静态图片引用、静态文字节点和静态 Label 样式。
4. 基础位置、尺寸、锚点、颜色、透明度。
5. `UITransform`、`Widget`、`Layout` 等编辑器组件配置。
6. 面板骨架、弹窗骨架、列表项模板、稳定按钮、标题、图标和背景。
7. 可预览的稳定特效本体和条件出现的视觉骨架。

它的核心任务是让稳定视觉在编辑器里可见、可选、可调、可保存。

### 2.2 Code AI
`Code AI` 负责游戏运行时，包括：

1. TypeScript / JavaScript 业务逻辑。
2. 状态机、数据绑定、关卡加载、bundle 加载和平台适配。
3. 动态文案、数字刷新、显示隐藏、按钮可点击状态和点击事件。
4. 棋盘、豆子、槽位、拖拽中节点、运行时生成内容。
5. 动效调度、tween、触发时机、生命周期、播放次数和回收。
6. 构建脚本、校验脚本、CDN 同步脚本和远程数据版本校验。

它的核心任务是驱动已经存在的 UI 壳，让游戏正确运行；不是再造一个 UI 编辑器。

### 2.3 Human
`Human` 负责人类判断，包括：

1. 需求输入、优先级确认和风险判断。
2. 审美纠偏、局部微调和最终验收。
3. 决定哪些经验需要沉淀成项目规则。

Human 不应成为大批量摆节点、复制资源、维护构建链或同步布局参数的主生产者。

## 3. 单一真源规则
### 3.1 静态 UI 真源
以下信息默认以 `scene` / `prefab` 为真源：

1. 节点是否存在、节点层级、节点名称和 sibling 顺序。
2. 静态 `SpriteFrame` / atlas / 图片引用。
3. 静态 Label 的字体、字号、行高、颜色和默认文案。
4. 基础位置、尺寸、锚点、缩放、旋转、透明度和颜色。
5. `UITransform`、`Widget`、`Layout`、`Button`、`Mask`、`ScrollView` 等组件配置。
6. 面板、弹窗、列表项、按钮、标题、图标、背景等稳定 UI 骨架。
7. 条件出现但可提前定义的奖励特效、引导高亮骨架、成就弹出和庆祝 prefab。

### 3.2 动态运行时真源
以下信息默认以代码为真源：

1. 当前金币、体力、关卡、分数、锁定状态和功能开关。
2. 当前面板是否显示、按钮是否可点、列表数据和动态文案。
3. 棋盘上的豆子分布、槽位内容、拖拽状态和引导状态。
4. 运行时加载哪个 bundle、哪个关卡 pack、哪个 skin 资源。
5. 动效触发时机、播放顺序、时间参数、生命周期和回收策略。

### 3.3 Code-owned 字段
没有明确声明为 `Code-owned` 的节点字段，默认视为 Cocos 真源字段，代码不得无条件覆盖。

允许代码接管的字段必须同时满足：

1. 该节点或字段有清晰的 `Code-owned` 语义。
2. 覆盖行为是运行时状态的一部分，而不是顺手改静态布局。
3. 代码中能看出为什么这个字段必须由运行时控制。

典型 `Code-owned` 字段包括棋盘视口的 `scale / offset`、运行时拖拽节点位置、特效实例生命周期、动态列表内容，以及引导气泡 / 手指 / 高亮相对当前运行时目标控件的定位。引导的节点结构、图片、字体、默认尺寸和静态样式仍归 scene / prefab；代码只能在目标控件和安全区已经确定后更新明确声明的目标相对 transform，不能顺带重建视觉节点或覆盖样式。

### 3.4 Human 微调保护
Human 在 Cocos 中调好的稳定位置、尺寸、图片和样式，默认视为 Cocos 真源的一部分。Code AI 不得用 fallback、默认值或 helper 在运行时偷偷覆盖。

## 4. 场景 Canvas / UI 根节点结构
以下不是只针对 `Game.scene` 的结构，而是所有场景的默认分层口径。`Home.scene`、`Game.scene`、`Loading.scene`、preview scene 等都应把场景控制器、稳定 UI、运行时内容、弹窗、遮罩、特效和启动/加载 UI 分到明确 root 下，避免布局、业务控制器和临时运行时节点混在同一层。

屏幕适配必须由 Cocos 编辑器层完成：`Canvas` 提供屏幕基准，`ScreenRoot` 作为唯一全屏 UI 总根用 Widget 拉满并承接安全区/全屏适配，其他业务 root 全部挂在 `ScreenRoot` 下继承这条适配链。业务 root、面板、棋盘、HUD、弹窗和特效层不应各自用代码计算屏幕尺寸、手动设置全屏 size，或重复做一套对齐屏幕的逻辑。

```text
Canvas
  Camera
  <SceneController>     // Code AI：脚本控制器，不参与 UI 布局
  ScreenRoot            // Cocos AI：全屏 UI 总根，只 Widget 拉满
    <SceneFixedRoot>    // Cocos AI：本场景稳定 UI / HUD / 菜单层
    <SceneRuntimeRoot>  // Code AI：本场景运行时内容
    PopupRoot           // Cocos AI + Code AI：挂载弹窗，弹窗结构由 Cocos 管
    OverlayRoot         // Cocos AI + Code AI：遮罩/引导挂载层
    FxRoot              // Code AI：运行时特效实例
    BootRoot            // Cocos AI：启动/加载 UI，按场景需要保留
```

默认规则：

1. `<SceneController>` 只挂脚本控制器，例如 `Home`、`Game`、`Loading`、`UIPreview`，不参与 UI 布局，不承载稳定 UI 节点。
2. `ScreenRoot` 是唯一全屏 UI 总根，只负责安全区和全屏 Widget 基线，不承载具体业务 UI；它的全屏尺寸和对齐由 Cocos 的 Canvas/Widget 传递链保证。
3. `<SceneFixedRoot>` 承载该场景稳定 UI，例如首页菜单、顶部栏、槽区、技能按钮、HUD、Loading 稳定节点；它挂在 `ScreenRoot` 下继承适配结果，不自行计算屏幕 size。
4. `<SceneRuntimeRoot>` 承载该场景运行时内容，例如棋盘、拖拽中节点、动态列表实例、临时生成内容和需要代码调度的位置/缩放状态；它可以由代码控制局部运行时状态，但不能接管全屏适配职责。
5. `PopupRoot` 只作为弹窗挂载层；弹窗 prefab 的结构、默认尺寸、背景、按钮和标题仍归 Cocos AI。
6. `OverlayRoot` 承载遮罩、引导、高亮等跨层覆盖内容；可视骨架优先 prefab 化，触发和生命周期归 Code AI。
7. `FxRoot` 承载运行时特效实例；稳定特效本体仍应优先 prefab 化，不应由代码长期重画。
8. `BootRoot` 或等价 loading root 承载启动和 loading 稳定 UI，必须保证本地可用，不依赖远程首屏资源。
9. root 命名可以按场景语义调整，例如 `Game.scene` 可使用 `GameplayFixedRoot` / `GameplayRuntimeRoot`，`Home.scene` 可使用 `HomeFixedRoot` / `HomeRuntimeRoot` 或等价命名；命名可以不同，但分层和真源归属不能混乱。
10. 如果浏览器或平台预览中出现根层不铺满，优先修正 Cocos 层级、Canvas、Widget、锚点和 `ScreenRoot` 传递链；不得先用代码给各业务 root 补屏幕宽高或强行对齐。

## 5. scene / prefab / TS 真源边界
### 5.1 scene 负责
1. 启动场景骨架。
2. Canvas、Camera、场景控制器节点和 UI 根节点结构。
3. 首屏可视内容、业务入口稳定节点、Loading 稳定节点。
4. 全局容器、挂载 root、安全区和默认 Widget 基线。

### 5.2 prefab 负责
1. 面板、弹窗、列表项模板和可复用稳定 UI 块。
2. 奖励特效、引导高亮、角色展示等可条件出现的视觉骨架。
3. 背景、按钮、标题、图标、静态装饰和稳定动画组件。

### 5.3 TS / JS 负责
1. 运行时逻辑、状态同步、数据绑定和事件绑定。
2. 动态节点、动态文案、面板开关、异步加载和 prefab 实例化。
3. 动效调度、tween、视口控制、触发和生命周期。
4. `scene` / `prefab` 复用逻辑，不重建稳定视觉骨架。

### 5.3.1 弹窗 / 面板 prefab 细则
弹窗、面板、列表模板和状态 UI 默认遵循“静态视觉归 prefab，运行时状态归代码”的更细边界。目标是避免代码绕过 Cocos prefab 重建稳定视觉，导致编辑器里看不到最终效果、Human 也无法直接调整。

Prefab / scene 负责以下内容：

1. 固定标题、固定说明文案和固定按钮文字。
2. 按钮皮肤、背景、装饰图、静态图标和稳定图标状态。
3. 图标位置、字号、颜色、间距、尺寸、锚点和 sibling 顺序。
4. 弹窗背景、标题牌、关闭按钮、确认按钮、取消按钮、广告按钮、金币按钮等稳定 UI 骨架。
5. 多状态视觉，例如“可领取 / 已领取”、“可观看 / 已领取”、“tab 选中 / 未选中”，应在 prefab 中做成状态节点，代码只切换 `active` 或等价状态。
6. 多业务变体，例如“消色 / 清空槽位 / 框选归位 / 获取金币”，优先在 prefab 中做 variant group，或拆成明确 prefab 变体，不用代码拼布局。
7. 列表项、奖励卡片、排行榜行、主题卡片等可复用模板的字体、颜色、局部位置和尺寸。

TS / JS 负责以下内容：

1. 打开和关闭弹窗。
2. 绑定按钮事件。
3. 切换 prefab 中已经存在的状态节点。
4. 填充动态数据，例如金币数、体力数、排行榜昵称、头像、进度百分比、奖励数量和锁定状态。
5. 实例化列表项或卡片模板。
6. 更新进度条数值、滚动列表位置、运行时预览图和平台能力节点。

代码可以填数据，但不能重新定义模板的字体、颜色、位置、尺寸和按钮皮肤。

弹窗、面板和稳定模板中默认禁止以下写法：

1. 用 `new Node()` 创建本应在 prefab 中存在的标题、按钮、背景、稳定说明文案。
2. 用 `Graphics` 绘制本应在 prefab 中存在的按钮、气泡、面板背景或稳定装饰。
3. 对 prefab 稳定节点无条件调用 `setPosition()`、`setContentSize()` 来修布局。
4. 在 controller 中写死 `fontSize`、`lineHeight`、`color` 来修弹窗文案样式。
5. 在 controller 中无条件替换按钮 sprite 或静态图标 sprite。
6. 为了复用一个空壳 prefab，在代码中拼出多个业务弹窗的最终 UI。

以下场景可以由代码控制，但必须语义清楚：

1. 滚动内容容器高度和滚动位置。
2. 动态列表项的实例坐标。
3. 棋盘、关卡像素预览、头像、开放数据域 Canvas 等纯运行时内容。
4. 进度条 progress、数值 label、排行榜昵称、奖励数量等真实动态数据。
5. 微信原生授权按钮的屏幕物理坐标。

即使在允许例外中，列表项和卡片模板的稳定样式仍应来自 prefab。

验收标准：

1. 在 Cocos 编辑器里打开 popup prefab，可以看到主要最终态或可切换状态组。
2. 修改固定文字、字号、颜色、按钮位置时，只需要改 prefab，不需要改 TypeScript。
3. 浏览器预览中逐个打开弹窗，不能出现按钮错位、文字重叠、空占位、状态节点露出。
4. 微信开发者工具中验证关键弹窗没有 JS error，平台能力相关 UI 正常。
5. 新增弹窗 controller 时，若包含 `fontSize`、`lineHeight`、`setPosition`、`setContentSize`、`Graphics` 或 `_applySpriteFrame`，必须说明是否属于允许例外。

## 6. Helper 使用规则
`Code AI` 处理 UI 时必须按以下顺序：

1. 先找 `scene` / `prefab` 中是否已有节点。
2. 再看节点上已有组件能否解决。
3. 再调用 Cocos 原生 API。
4. 最后才考虑增加薄 helper。

允许的 helper 只应帮助调用 Cocos，例如：

1. `mustFindNode` / `findNode`。
2. `bindButton` / `bindToggle`。
3. `setLabelText` / `setSpriteIfNeeded` / `setActiveSafe`。
4. `instantiatePrefab` / `loadBundlePrefab`。
5. 查找或缓存 `ScreenRoot`、`PopupRoot`、`OverlayRoot`、`FxRoot`、`BootRoot`。

禁止的 helper 类型：

1. 运行时把稳定按钮、稳定面板或稳定布局重新画出来。
2. 用 `Graphics` 代替本该在 prefab / scene 中存在的稳定 UI。
3. 用 `getOrCreate + forcePosition + forceSize` 长期充当静态布局手段。
4. 明明已有 scene 节点，还在代码里创建同名节点。
5. 用代码兜底覆盖编辑器里保存的图片、位置、尺寸或人工微调结果。

判断标准：

> helper 可以更方便地用 Cocos，但不能把 Cocos 再实现一遍。

## 7. 动效与特效归属
动效必须拆分为“可视本体”和“运行时调度”。

### 7.1 Panel FX
Panel FX 是固定装饰型动效，例如结算页彩带、按钮呼吸光、奖励弹窗装饰粒子、mascot 循环展示。

默认归属：

1. 可视本体、默认贴图、动画组件、粒子参数和默认层级归 Cocos AI。
2. 触发时机、显示隐藏、播放几次、播完回收归 Code AI。

### 7.2 Gameplay FX
Gameplay FX 是玩法调度型动效，例如棋盘通关扫光、豆子飞到槽位、插槽扩容重排、引导高亮跟随。

默认归属：

1. 全局调度、顺序计算、delay、总时长和状态判断归 Code AI。
2. 单个视觉单元，例如单格闪光、爆闪帧动画、尾迹、粒子、亮环，归 Cocos AI。

一句话：

> Code AI 调度全局节奏，Cocos AI 提供可预览、可替换、可调的视觉单元。

## 8. 棋盘 / 画布手势控制边界
棋盘、拼图、地图、关卡编辑器、画布工具等可缩放区域，应把“内容是什么”和“玩家怎么看内容”拆开。

默认分工：

1. Cocos AI 负责 `BoardViewport` / `ContentViewport` 等静态视口容器、默认尺寸、默认锚点、安全区、棋盘外的稳定 HUD。
2. Code AI 负责手势状态机、`scale / offset`、坐标转换、点击命中、拖动、缩放、滚轮和边界 clamp。
3. Human 负责判断默认手感是否自然，并验收不同机型上的点击、拖动、缩放体验。

默认规则：

1. 不要缩放整个 `Canvas`、场景控制器节点、`ScreenRoot` 或整棵玩法 UI 树。
2. 顶部栏、槽区、技能按钮、HUD、弹窗不跟随棋盘缩放。
3. 棋盘内容只进入 `Game.scene` 的运行时 root，例如 `GameplayRuntimeRoot` 下的视口层。
4. 拖动和缩放改变的是运行时视图状态，不是重写格子、豆子、拼图块的内部静态坐标。
5. 点击、拖动、放置、框选、引导和滚轮缩放必须共用同一套坐标转换口径。
6. 棋盘点击命中必须先解析用户意图候选，再做玩法可选性过滤：视觉直接命中只能提升候选优先级，不能绕过空格、锁定、已归位、不可形成有效 block 等业务判断；直接命中不可选时，可以按同一套坐标口径 fallback 到附近可选候选。

手势最低要求：

1. tap 和 gesture 必须显式分离。
2. 双指缩放必须固定 touch id，不依赖数组顺序。
3. 缩放必须以手指中心锚定内容。
4. 边界 clamp 必须按内容尺寸、缩放、安全视口和最小可见区域动态计算，不写一次性常量。

## 9. Style / Skin / ThemeChallenge
### 9.1 Style
`Style` 是整体美术方向，例如休闲风、可爱风、国风。它影响配色、材质、按钮气质、字体感觉和动效节奏，不一定是运行时可切换系统。

### 9.2 Skin
`Skin` 是共享骨架不变、运行时可切换的一组视觉资源包。典型内容包括背景、棋盘底图、格子样式、插槽面板图、棋子贴图、奖励特效和局部音效。

推荐结构：

1. 一套共享 gameplay / HUD / board / slot / popup 骨架。
2. 多套只提供资源的皮肤资源包。
3. `SkinManager` 由 Code AI 管理 `skinId`、加载资源、应用资源和持久化。

### 9.3 ThemeChallenge
`ThemeChallenge` 是专题关卡、特殊活动或关卡合集，不等于视觉皮肤。若项目中 `theme` 已表示主题挑战，则视觉换肤必须使用 `skin` / `skinId` / `SkinManager`，不得混用同一字段。

## 10. Preview 与 Debug 资产
为提升 prefab、面板和特效迭代效率，项目应长期保留独立 preview 入口，例如：

1. `UIPreview.scene`。
2. `PreviewController` 的 UI / Panel / Fx 预览模式。
3. mock 状态或 mock 数据注入器。

默认分工：

1. Cocos AI 负责预览场景骨架、预览容器和默认预览节点。
2. Code AI 负责一键触发、状态切换、mock 数据和 debug 开关。

preview 资产可以存在于源码、编辑器工作流和 plain web preview 中，但默认不应进入正式微信 debug / release 包。除非有明确的临时调试 profile，否则 preview 资产不属于上线内容。

## 11. 启动、分包与远程数据规则
本项目默认包体结构已经从旧的“主包 + Cocos remote bundle”调整为“主包 + 微信小游戏分包 + 远程数据域”。包体结构必须按“启动依赖、更新频率和数据语义”拆分：稳定 UI、prefab、图片、音频和特效进入本地包或微信小游戏分包；用户状态走云函数读写；远程 CDN 只承载可版本化、可 hash 校验、可按需加载的资源内容，例如关卡 manifest / pack、受 manifest 管理的动态大图资源和少量运营配置，不能把所有非首包内容继续塞进一个 Cocos remote bundle。

本章是构建脚本、包体结构、bundle 归属、CDN 资源数据、云端用户状态和启动路由的唯一规范入口。第 5 章只定义 `scene` / `prefab` / TS 的真源边界，不再维护一份简化版构建脚本职责，避免同一规则在两个章节漂移。

### 11.1 启动状态权威与统一进游戏路由
启动命名必须描述“当前已掌握的状态证据”，不得再用字母把用户永久分类。所有状态的第一个业务场景都是 `Game.scene`；Home 不能作为启动兜底。状态可以在一次启动中从 `unresolved` 转为 `new`、`local_snapshot` 或 `cloud_restore`，埋点必须记录转换而不是只记录最终标签。

| 语义状态 | 充分证据 | 首屏路由 | 权威与写入边界 |
|---|---|---|---|
| `new` | 本地没有 `pdd.level >= 2`，且本次云端读取成功并确认没有 `savedLevel >= 2` | 进入 `gameEntry/bootstrap` 的 `Game.scene`，打开第 1 关 / 引导关 | 只有云端空状态已经确认后才可标记 `new`；“云端尚未返回”不等于新用户。 |
| `local_snapshot` | 本地存在有效 `pdd.level = N` 且 `N >= 2`；云端仍在读取 / 暂不可用，或已确认没有更高 `savedLevel` | 立即进入 `Game.scene` 第 N 关 | 本地快照可以决定本次首屏；云端读取完成前禁止用较低自动快照覆盖云端，读取完成后按字段矩阵合并确认。 |
| `cloud_restore` | 云端返回 `savedLevel = N` 且 `N >= 2`，并且本地缺失、只有 `1` 或低于 N | 若已显示第 1 关临时态，则在 `Game.scene` 内收口临时态并恢复 / 重载到第 N 关 | 云端高进度接管；临时第 1 关和 starter 状态不得回写覆盖云端。 |
| `unresolved` | 本地没有可确认的高进度，且云端仍在读取、失败或身份不足 | V2 允许先显示 `Game.scene` 第 1 关 provisional 壳，但状态仍为未决 | 禁止声明为 `new`，禁止把默认低状态写入云端，必须保留重试、诊断和后续接管能力。 |

关键规则：

1. 启动时如果只能同步读到本地进度，则初始目标关卡按 `initialLevel = validLocalLevel >= 2 ? validLocalLevel : 1` 计算，并立即进入 `Game.scene`；这只是路由决定，不等于云端权威已经确认。
2. 本地 `pdd.level === 1` 是有效的本地记录，但不足以区分 `new` 与 `unresolved`；只有有效本地高进度才能进入 `local_snapshot`。
3. `max(local, cloud)` 只适用于 `savedLevel` 等明确单调字段，不能推广到金币、体力、道具、装备选择或其它非单调状态。
4. `unresolved` 下可以更新本地 provisional 记录，但不能触发默认云端写入；云端读取成功确认空状态后才转为 `new`。
5. 云端返回 `savedLevel > currentLevel` 时必须转为 `cloud_restore`：更新本地有效进度，停止或收口当前临时态，再加载真实第 N 关。恢复动作不能跳到 Home，也不能要求用户重新进游戏。
6. `local_snapshot` 或 `cloud_restore` 的第 N 关数据不在本地包或缓存中时，`Game.scene` 可以展示 loading / retry / 明确错误，并按 manifest / hash 加载目标 pack；不能静默降级到第 1 关或 Home。
7. Home 只能在首屏之后由用户行为、运营入口或明确功能路由打开；四种语义状态均不得把 Home 当作启动目标。

### 11.2 数据分类与本地 / 远程协作规则
本项目不能把“远程”当成单一概念。云函数用户状态、CDN 资源内容、运营配置和本地启动快照的读写频率、合并规则和失败处理都不同。

总原则：

```text
用户状态：本地先可用，云端恢复 / 合并，禁止低状态覆盖高状态。
资源内容：manifest / hash / version 驱动，按目标资源下载，不做每次启动全量同步。
首屏入口：四种启动语义状态都先进入 Game；远程资源只能补足目标内容，不能决定是否进 Home。
```

| 数据类型 | 典型数据 | 本地形态 | 远程形态 | 读取 / 同步时机 | 合并与失败规则 |
|---|---|---|---|---|---|
| 用户状态数据 | `pdd.level` / `savedLevel`、金币、体力、道具数量、签到状态、主题解锁、已拥有皮肤、当前装备皮肤、用户 profile | `sys.localStorage`、运行时内存、`UserMgr` / `GameCtrl` 状态 | 云函数 `syncUserState` 读写的用户文档 | 启动时尝试拉取；本地状态变化后 debounce 写云端；隐藏 / 退出前 flush | 只有明确单调的进度字段取 `max(local, cloud)`；`unresolved` 下低进度只能写本地，不能写云端；云端更高时转为 `cloud_restore` 并在 Game 内恢复到第 N 关。 |
| 玩法资源数据 | 关卡 JSON、主题关卡 JSON、难度曲线、关卡 manifest、关卡 pack | 第 1 关 / 引导关本地快照在 `gameEntry/bootstrap`；普通 localhost browser preview 和显式 `local-test` profile 可带与目标 schema 对齐的本地镜像；会话内或应用级缓存已加载 pack | 同一个 CDN 根地址下的 `levels/level_live.json` 和 `levels/level_packs/*.json` | 启动进入第 N 关、下一关跨 pack、云端恢复到第 N 关、主题关卡跳转时，都必须通过同一套 `loadLevel(levelId)` 入口按需读 manifest 并找目标 pack；只下载目标关卡所在 pack | 默认微信 debug / release 都不能用本地镜像掩盖 CDN 失败；核心关卡数据缺失必须 fail fast，显示游戏内 loading / retry / 明确错误；不能静默降级到第 1 关或 Home；不能每次启动全量下载所有 CDN pack；不能只在启动时下载一次后就不再跨 pack 拉新数据。 |
| 皮肤状态数据 | 已拥有皮肤 ID、当前装备皮肤 ID、抽取 / 解锁结果 | 与用户状态同源，写入本地状态 | 与用户状态同源，写入云函数用户文档 | 启动云恢复、皮肤解锁 / 装备变化、用户状态 flush | 按用户状态规则合并；云端拥有集合可以补足本地，本地高版本或更多拥有项不能被空集合覆盖；装备 ID 不存在时回到有效默认值并记录错误。 |
| 皮肤资源数据 | 皮肤资源清单、皮肤图标、背景大图、棋盘 / 槽位 / 豆子换肤资源 | 只允许保留首屏默认兜底资源、入口占位图或 debug 本地镜像；这不是皮肤系统的正式资源真源 | 同一个 CDN 根地址下的 `skin/skin_live.json`、`skin/assets/**`；正式皮肤资源真源不在 gameplay 分包，也不挂在 `levels/Skins` 下 | 打开皮肤面板、装备皮肤、进入 Game 后异步应用时先读小型 `skin/skin_live.json`，再按当前皮肤 ID / 面板可见项下载目标资源 | 非首屏皮肤大图失败不能阻塞 `initGame`；皮肤资源必须有独立 `skinDataVersion` 和资源 hash；不能复用关卡 `dataVersion` 判断皮肤是否变化。 |
| 运行时策略 / 运营配置 | 广告策略、活动开关、轻量运营配置 | 本地默认值或上次缓存 | 云函数或 CDN 小配置 | 首屏后后台获取；必要时按 TTL / version 刷新 | 不能阻塞启动状态解析；失败使用本地默认策略并记录诊断。 |

#### 11.2.1 V2 状态字段权威矩阵（P0）

| 字段组 | 作用域 | 权威真源 | 当前合并 / 写入合同 | 离线与冲突边界 |
|---|---|---|---|---|
| `pdd.level` / `savedLevel` | 账号级、单调进度 | 云端 `savedLevel`；经过校验的本地快照可先决定首屏 | `max(local, cloud)`；云端更高时进入 `cloud_restore` | `unresolved` 下禁止低进度云写；本地更高只能作为待合并证据，不能静默宣称云端已确认。 |
| `themeUnlockedIds` / `themeCompletedIds` / `ownedBackgroundSkinIds` | 账号级、只增长集合 | 云端集合与已确认本地增量 | 按集合并集，重复项去重 | 删除、回收或撤销不能借用并集语义，必须另建有版本的明确操作。 |
| `backgroundSkinAdProgress` | 账号级、按皮肤单调计数 | 云端按 `skinId` 的计数；客户端只提交已核验奖励结果 | 每个 key 取 `max`，不得用整对象覆盖 | 广告失败、取消或未验证不得增加；重试必须避免同一次奖励重复累计。 |
| `equippedBackgroundSkinId` + `equippedBackgroundSkinUpdatedAt` | 账号级、当前选择 | 这一对字段共同构成有效选择 | 当前实现按成对时间戳选择较新记录，并校验皮肤已拥有 | 只有 ID 或只有时间戳均无权威；设备时钟漂移仍是当前方案的已知边界，不得推广为通用冲突规则。 |
| 金币、体力、道具、签到与领取结果 | 账号级、非单调经济状态 | 云端用户文档与已确认业务结果 | 当前仍存在 debounce / flush 快照写入路径；按字段的现行云端选择规则处理 | 不得套用 `max` 或集合并集；多设备交易、消耗和领取后续应迁移到带幂等键的原子操作。本矩阵不宣称该风险已经解决。 |
| profile、头像与展示身份 | 账号级资料 | 经平台身份校验的 profile / 云端资料 | 只接受通过身份与字段校验的数据 | 授权失败不得用匿名默认值反向覆盖已有资料。 |
| loading、输入锁、引导步骤、弹窗与临时动画状态 | 会话级 | 当前运行时状态机 | 不上云；生命周期结束即释放 | 不得因为恢复账号状态而重放已经失效的触摸、tween 或临时 UI。 |
| 排行展示、按钮可用性、关卡资源命中与其它派生值 | 派生状态 | 已确认用户状态 + 当前配置 / manifest | 每次从真源重算 | 派生缓存无权覆盖用户状态或远程配置。 |

矩阵优先于“本地 / 云端简单合并”的笼统表述。每个新增持久化字段必须先声明作用域、权威、冲突代数、离线行为和失败语义；没有登记的字段默认不得进入通用同步 payload。

关卡 JSON 可以携带影响玩法结构的确定性字段；这些字段属于关卡数据真源，不能在客户端再按关卡号写一套平行规则。底部暂存槽行数必须使用 `slotPolicy`：

```json
{
  "slotPolicy": {
    "defaultRows": 2,
    "freeUnlockRows": 1,
    "adUnlockRows": 0
  }
}
```

1. `defaultRows` 表示进关后默认开启的暂存槽行数，必须大于等于 1。
2. `freeUnlockRows` 表示可通过免费教学 / 免费按钮解锁的额外行数，不能为负数。
3. `adUnlockRows` 表示可通过广告解锁的额外行数，不能为负数。
4. `defaultRows + freeUnlockRows + adUnlockRows` 不能超过客户端支持的最大暂存槽行数；不合法的远程关卡数据必须 fail fast，不能静默回退到旧代码规则。
5. 插槽教学的气泡、手指、高亮框、槽位按钮和相关 prefab 属于 `gameEntry/bootstrap` / Cocos 本地资源；CDN 只发布关卡 JSON / manifest / pack，不能为了临时策略把教学视觉资源放进远程关卡目录。
6. `slotPolicy` 必须在源码生成、CDN pack 生成、上传回读、持久缓存解析和运行时进入关卡前使用同一约束校验；不能只在 `initGame` 最后一步才发现错误。
7. 当新 schema 把旧可选字段升级为必填字段时，必须先提升 `schemaVersion` / `minClientBuild` 并发布新内容 hash。客户端读取旧持久缓存时应先删除不兼容缓存并重新请求当前 manifest / pack；刷新后的远程内容仍不兼容，才进入明确错误 / retry。
8. 兼容窗口内允许新客户端读取经过完整字段校验的旧 schema 内容，但不得因此恢复客户端关卡号 fallback；兼容窗口结束后再移除旧 schema 支持。

皮肤状态中的“当前装备皮肤”必须以 `equippedBackgroundSkinId + equippedBackgroundSkinUpdatedAt` 作为一组有效状态写入本地和云端；只有 ID 或只有时间戳都视为没有明确装备皮肤。皮肤功能首次上线时不兼容无时间戳的旧皮肤字段；如果测试环境已有这类旧字段，应清理或重新选择皮肤。非皮肤用户状态仍按已有线上兼容规则合并。

CDN 资源数据必须采用“同一个 CDN 根地址 + 独立资源目录 + 独立索引小文件 + 内容 hash + 按需资源”的模型。关卡和皮肤不是两个 CDN，也不需要两个 CDN 地址；它们是同一个 CDN 根地址下的两个目录和两个 manifest，不能共用一个版本判断。默认不新增顶层 `remote_live.json`，除非未来运营配置、活动素材等资源类型继续变多并经过专项评审。这个模型分两层：

```text
manifest：小索引文件，可按需刷新，用来判断版本、schema、目标资源 URL 和 hash。
content：带 hash 的不可变内容文件，只在目标资源缺失或 hash 变化时下载。
```

1. `levels/level_live.json` 是关卡 manifest。现状已经存在的是这个文件；它包含 `dataVersion`、`schemaVersion`、`minClientBuild`、pack 列表、每个 pack 的 `url`、`hash`、`levelRange`、`levelKeys` 或等价索引。后续可以新增等价的 `levelDataVersion` 字段，但必须保留 `dataVersion` 兼容已上线关卡用户。
2. `skin/skin_live.json` 是皮肤 manifest。皮肤系统尚未上线，新的皮肤 CDN 结构应直接使用这个新路径，不需要兼容上传旧的 `levels/Skins/**`。它包含 `skinDataVersion`、`schemaVersion`、`minClientBuild`、皮肤资源列表、每个资源的 `skinId`、`kind`、`url`、`hash`、`bytes`、`width` / `height` 或等价元数据。
3. 关卡 hash 和皮肤 hash 必须独立：关卡更新只改变 `levelDataVersion` / pack hash；皮肤更新只改变 `skinDataVersion` / skin asset hash。不能因为关卡频繁更新就让皮肤缓存整体失效，也不能因为皮肤更新就让关卡 pack 整体失效。
4. pack 是关卡分包索引项，不是启动时一次性下载清单。每个 pack 描述一个关卡 JSON 包，例如 `levels/level_packs/mainline_0001_0100.json`，字段必须能说明它覆盖哪些关卡、文件 URL、内容 hash 和大小。玩家从第 99 关进入第 100 关时应复用同 pack；进入第 101 关跨 pack 时必须通过 `loadLevel(101)` 自动找到并下载第 101 关所在 pack，不能要求重启游戏。
5. 客户端可以在启动或需要远程关卡时请求小型 `levels/level_live.json`，但这不是全量同步。`new` / `unresolved` 的第 1 关应直接使用 bootstrap 本地快照；`local_snapshot` / `cloud_restore` 打开第 N 关、下一关或主题关卡时只下载目标关卡所在 pack。目标 pack 已缓存且 hash 未变化时，不应重新下载该 pack。
6. 客户端只有在打开皮肤面板、装备皮肤、或进入 Game 后需要异步应用远程皮肤时，才请求或刷新 `skin/skin_live.json`；随后只下载当前装备皮肤、面板可见皮肤或即将展示皮肤的目标资源。目标皮肤资源已缓存且 hash 未变化时，不应重新下载该资源。
7. `levels/level_live.json` 和 `skin/skin_live.json` 的刷新策略可以不同：关卡目录通常更新频繁，皮肤目录通常更新较低频。客户端、脚本和 CDN 配置必须允许两个 manifest 分别设置 TTL / `ETag` / `Last-Modified` / cache-control，不能因为拉了关卡 manifest 就顺带刷新或失效皮肤 manifest。
8. 关卡 pack URL 和皮肤资源 URL 都必须使用内容 hash 或等价版本号，例如 `?v=<hash>` 或 hash 文件名；hash 不变时应复用平台 HTTP 缓存、会话缓存或应用级本地缓存。
9. 如果实现应用级持久缓存，关卡缓存 key 必须包含 `prefix`、`pack.id` 和 `pack.hash`；皮肤缓存 key 必须包含 `skinId`、`kind` 和资源 `hash`。manifest 变化后只失效受影响资源，不能清空后全量重拉。
10. 关卡可以在目标关卡 pack 加载成功后，按 idle / 网络条件预取下一 pack；皮肤可以在皮肤面板稳定后预取下一页缩略图。任何预取都必须是低优先级、可取消、可限流的优化，不得成为首屏或 `initGame` 前置条件。
11. CDN 上传必须先上传 pack / skin asset 等内容文件，再最后发布对应 manifest。发布关卡后回读 `levels/level_live.json` 校验 `dataVersion` / `levelDataVersion`、`levelCount`、`levelCounts` 和 pack 索引；发布皮肤后回读 `skin/skin_live.json` 校验 `skinDataVersion`、资源数量、资源 hash 和必要尺寸元数据。
12. manifest 失败、schema 不兼容、`minClientBuild` 不满足或内容 hash / 元数据校验失败时，目标关卡加载失败应显式报错或重试；目标皮肤资源加载失败应回到当前可用背景或默认皮肤，但不得阻塞 `initGame`。

资源预取必须区分两种成本：

1. `包预下载 / bundle manifest preload` 只提前下载或解析轻量索引，不实例化 scene、不解码大图、不建立长期资源 owner。它可以在首个 Game 可玩后按 idle、网络和内存预算执行，也可以由用户按下入口等弱意图触发。
2. `场景 / prefab / 纹理常驻` 会反序列化 scene、创建节点、解码纹理或持有资源引用，只能由明确用户意图或即将发生的功能路由触发；关闭入口、取消路由或离开 scene 后必须按 owner 释放。
3. Home 可以在首个 Game 可玩后低优先级预下载包或 bundle manifest，但不能无条件反序列化并长期持有 `Home.scene` / Home 纹理。打开设置并显示返回 Home、点击 Home 入口、结算页出现明确 Home 路由等，才属于可建立 Home 场景常驻的用户意图。

默认微信 debug / release 必须使用相同的生产资源契约、路由和失败语义；差异只允许出现在日志和诊断强度。普通 localhost browser preview 默认使用本地镜像；需要在平台测试包中使用本地资源镜像或 mock 时，必须使用显式 `local-test` profile，不能复用普通微信 debug 名称：

| 构建变体 | 用户状态 | 关卡资源 | 皮肤资源 | 日志 / 诊断 |
|---|---|---|---|---|
| plain web / local preview | 可使用本地 mock / localStorage；不能代表微信云函数真机行为 | 可走本地资源或 mock CDN；不能作为 release CDN 通过的证据 | 可使用 preview 资源，但不能证明平台包资源完整 | 允许详细日志和 preview 控件。 |
| 显式 `local-test` profile | 可使用受控 mock / 测试账号，必须在 UI 或启动日志中明确标识 | 可带与当前 schema/hash 契约一致的本地镜像；不得作为微信 debug/release 通过证据 | 可使用本地镜像验证 UI；不得作为 release 皮肤 CDN 通过证据 | 允许详细日志、mock 注入和 preview 控件。 |
| 微信 debug 包 | 使用真实微信环境能力并遵守与 release 相同的用户状态合并规则 | 与 release 使用同一 manifest / hash / 目标 pack 路径；CDN 失败必须显示同一错误 / retry，不回退本地 `levelData` | 与 release 使用同一 `skin_live.json` / hash 路径；失败语义一致 | 保留 `PDD_PERF_TRACE`、cloud sync 诊断和更多 warn。 |
| 微信 release 包 | 使用真实云函数状态；启动恢复未决时必须阻止低状态回写 | 默认 CDN-only；第 1 关 / 引导关必须有 bootstrap 本地快照；启动、下一关、云端恢复和主题跳转都按目标 pack hash 按需加载 | 皮肤资源真源走 CDN `skin/skin_live.json` / skin hash；首屏只保留默认兜底资源；远程皮肤异步加载，不能阻塞 Game | 默认关闭普通 log / warn，只保留关键 error 和必要诊断。 |

### 11.3 默认发布结构
当前默认发布结构按“微信硬主包 + Cocos 物理 bundle + 逻辑包名”三层理解。文档、日志和埋点优先说逻辑包名；Cocos 构建配置、资源路径和运行时 `assetManager.loadBundle()` 仍使用物理 bundle 名。

| 逻辑层 | Cocos 物理名 | 主要职责 |
|---|---|---|
| 微信上传主包 / Root | 无固定 Cocos bundle 名 | 微信小游戏启动壳、平台配置、Cocos 入口、最小 settings、必须随启动可用的平台适配代码。 |
| `cocosCore` | `main` | 启动第一口气，只放 `Boot.scene`、启动路由脚本、首帧本地资源、最小 loading cover。 |
| `gameEntry` | `bootstrap` | 全用户统一游戏入口层，放 `Game.scene`、第 1 关本地快照、通用游戏壳、HUD、槽位、豆子图集、引导关同步必需资源，以及能让 `local_snapshot` / `cloud_restore` 状态进入目标关卡加载流程的最小代码和稳定 UI。 |
| `home` | `homeAssets` | 非启动 Home / 菜单功能资源。只有在首个 `Game.scene` 已经可见后，因用户行为、运营入口或明确功能路由需要 Home 时才加载；不再承担老用户首屏入口职责。 |
| `gameplay` | `gameAssets` | 后续玩法和非首屏功能资源，例如后续弹窗、排行榜、图鉴、商店、签到、主题、音频、特效、大背景和后续玩法 prefab。 |
| `remoteLevelData` | 同一 CDN 根地址下的 `levels/`；普通 localhost browser preview 或显式 `local-test` 可对应本地镜像 | 高频动态关卡 JSON、`levels/level_live.json`、`levels/level_packs/*.json`、难度曲线和关卡投放。 |
| `remoteSkinData` | 同一 CDN 根地址下的 `skin/`；仅显式 `local-test` 可对应本地 skin 镜像 | 皮肤资源清单 `skin/skin_live.json`、皮肤图标、背景大图、棋盘 / 槽位 / 豆子换肤资源；版本和 hash 独立于 `remoteLevelData`。 |
| `remoteOpsData` | CDN / 云函数 / 平台配置 | 少量运营配置、广告策略、活动开关。 |

启动直进 `Game.scene` 时，玩法 BGM 属于首个可玩会话的必需体验资源，但不应阻塞棋盘首屏。默认策略是：BGM 文件仍可放在 `gameplay/gameAssets`，`initGame` 必须在棋盘与槽位渲染完成后登记播放意图并异步加载；如果产品要求首帧即有音乐，才允许把单独压缩后的 BGM 作为 `gameEntry/bootstrap` 的 route-owned 资源。普通 SFX、结算音效、功能音效仍归 `gameplay/gameAssets`，不得整体挪入启动路径。

当前期望的发布包图：

```text
cocosCore/main
  scenes: Boot.scene
  deps: []

gameEntry/bootstrap
  scenes: BootstrapBundle/Scenes/Game.scene
  required: LevelData/level_1, Beans/bean-atlas, game shell, HUD, slots, guide UI
  deps: []

home/homeAssets
  scenes: HomeAssetsBundle/Scenes/Home.scene
  optional: true
  deps: []

gameplay/gameAssets
  scenes: none by default
  deps: []
```

启动 `preloadBundles` 默认只允许包含 `main`。`bootstrap` 由统一游戏入口路由显式加载；`homeAssets`、`gameAssets` 不能进入启动 preload。首个 Game 可玩后可以按前述预算预下载目标 bundle 包 / manifest，但 scene、prefab 和纹理常驻仍必须由明确用户意图或即将发生的功能路由触发；不能因为“它是分包”就认为预下载、反序列化和常驻都没有成本。

### 11.4 Cocos Bundle Priority 规则
Cocos 的 bundle priority 不是“启动时先加载谁”的开关。它主要决定多个 bundle 共同引用同一个资源时，该共享资源最终归哪个 bundle。

默认解释口径：

```text
priority 决定共享资源落点。
路由代码决定运行时加载顺序。
构建校验决定包图是否符合预期。
```

因此：

1. `bootstrap` priority 高是合理的，因为它是全用户游戏入口和第 1 关保障层；但这并不表示启动时 Cocos 会自动先加载 `bootstrap`。
2. 如果 `Boot.scene` 直接引用了 `bootstrap` 里的资源，而启动流程只自动加载 `main`，就会出现 `Please load bundle bootstrap first` 或等价卡启动问题。
3. 如果 `Home.scene` 和 `Game.scene` 共享同一个稳定图片，且 `bootstrap` priority 更高，Cocos 可能把该 SpriteFrame 归到 `bootstrap`，导致非启动的 `homeAssets` 反向依赖 `bootstrap`；反过来，错误的共享也可能让游戏入口下载 Home 资源。
4. 不能靠调 priority 来修启动顺序；要么让路由先 `loadBundle()`，要么把启动路径需要的资源放回当前路径所属 bundle。

包体评审时必须看构建产物里的 `config*.json`，不能只看源码目录名。`main`、`bootstrap`、`homeAssets`、`gameAssets` 的 `deps` 必须符合本章包图要求。

### 11.5 路由自有资源与重复资源规则
本项目允许为了切断启动依赖而保留“视觉相同、文件多份、UUID 不同”的 route-owned 资源。判断一份重复资源是否应该删除，不能只看像素是否相同，必须看：

1. 被哪些 scene / prefab 的 UUID 引用。
2. 这些 scene / prefab 属于哪个首屏路径。
3. 合并后是否会让 `main`、`bootstrap`、`homeAssets` 或 `gameAssets` 出现非预期依赖。
4. 合并后是否会让全用户游戏首屏下载 Home / gameplay 资源，或让 Boot 启动壳下载游戏入口资源。

当前默认规则：

1. `Boot.scene` 使用 `cocosCore/main` 自有启动 cover / progress 资源。
2. `Game.scene` 使用 `gameEntry/bootstrap` 自有游戏入口 cover / HUD / 首关按钮资源。
3. `Home.scene` 如果保留，使用 `home/homeAssets` 自有 Home cover / 首页图标 / 首页按钮资源。
4. gameplay 弹窗和后续功能使用 `gameplay/gameAssets` 自有弹窗按钮、面板底图和功能图标。

如果同一张图同时出现在 `Boot.scene`、`Game.scene` 和 `Home.scene` 的首屏或功能路径中，默认应该拆成三份 route-owned 资源，而不是合并成一个共享资源。只有构建后确认各目标 bundle 仍然 `deps: []`，并且统一游戏入口不会多下载 Home / gameplay 资源，才允许合并。

### 11.6 禁止事项
1. 启动场景不能直接依赖 CDN 或远程首屏资源。
2. 不把每天新增的关卡 JSON 放进微信分包。
3. 不把稳定 UI、prefab、图片、音频、特效默认放到远程 CDN 做热更。
4. 不把 Cocos remote bundle 作为默认后续资源承载方式。
5. 不让 `Boot.scene` 强引用 `bootstrap`、`homeAssets`、`gameAssets` 或 `LevelData` 资源。
6. 不让 `Home.scene` 强引用 `bootstrap` 或 `gameAssets` 资源。
7. 不让 `Game.scene` 强引用 `homeAssets` 或 `gameAssets` 后续玩法资源；游戏入口和第 1 关同步必需资源应归 `bootstrap`。
8. 不在 `loadCC()` 前阻塞等待 `levels/level_live.json`。
9. 不把 `levels/level_live.json` 失败包装成首屏启动失败。
10. 不把 `bootstrap`、`homeAssets`、`gameAssets` 默认加入启动 `preloadBundles`。
11. 不用 fallback 掩盖 bundle、scene、prefab、spriteFrame、平台 API 或远程数据的关键失败；核心资源失败必须 fail fast。
12. 不把 `local_snapshot` 或 `cloud_restore` 首屏路由到 Home；必须先进入 `Game.scene`，再按权威进度恢复到目标关卡。
13. 不把云函数用户状态同步规则套用到 CDN 资源数据上；关卡 CDN 和皮肤 CDN 必须分别按 manifest / hash / 目标资源按需加载，不能每次启动全量下载。
14. 不让非首屏皮肤大图、活动图或运营素材成为 `initGame` 前置条件。
15. 不让普通微信 debug 在 CDN、schema、hash 或目标 pack 失败时回退本地 `levelData` / skin 镜像；本地镜像只能属于显式 `local-test` profile。

### 11.7 prefab 放置规则
`prefab` 不存在天然应该进首包这一说，放置位置只由启动依赖级别决定：

1. 启动 loading 壳进入 `cocosCore/main`。
2. 游戏入口、首局高概率立刻触达但不需要 `Boot.scene` 直连的 prefab 优先进入 `gameEntry/bootstrap`。
3. 设置、排行、图鉴、商店等非首局必需 prefab 优先进入 `gameplay/gameAssets` 或其它微信小游戏分包。
4. Home 稳定 UI 和 Home prefab 如果仍然存在，进入 `home/homeAssets`，但它们不是任何启动语义状态的首屏依赖。
5. 远程 CDN 默认不承载 prefab，除非项目另写专项远程 Cocos 资源热更规范。

### 11.8 远程数据 manifest、pack 与 hash 规则
远程 CDN 必须按独立目录和 manifest 发布。关卡和皮肤使用同一个 CDN 根地址 / bucket / 域名，但必须拆成 `levels/` 与 `skin/` 两个目录，不能复用同一个 manifest、同一个版本号或同一个缓存失效规则。每个目录的 manifest 都必须支持 schema、客户端版本和 hash 校验。默认不新增顶层 `remote_live.json`。

最低要求：

1. 关卡目录使用 `levels/level_live.json`，最后发布，指向当前可用的 `dataVersion` / `levelDataVersion`、pack 和关卡索引；其中 `dataVersion` 必须保留以兼容已上线关卡客户端。
2. 每个关卡 pack 必须有 `id`、`url`、`hash`、`levelRange`、`levelKeys` 或等价索引；pack 是关卡分包索引项，用来支持跨 pack 进入下一关时自动按需加载目标 pack。
3. 皮肤目录使用 `skin/skin_live.json`，最后发布，指向当前可用的 `skinDataVersion`、皮肤资源列表和资源根；皮肤系统未上线前不需要上传旧的 `levels/Skins/**` 兼容目录。
4. 每个皮肤资源必须有 `skinId`、`kind`、`url`、`hash`、`bytes` 和必要尺寸 / 格式元数据；同一个皮肤可以拆成背景、图标、棋盘、槽位等多个独立资源项。
5. `levels/level_live.json` 和 `skin/skin_live.json` 都必须有 `schemaVersion`、`minClientBuild` 和各自独立的版本字段。
6. 客户端只加载 schema 兼容且满足 `minClientBuild` 的远程数据；如果新关卡或新皮肤资源需要新客户端代码，应等待微信新包下载完成，并提示用户重启小游戏。
7. 客户端发现持久缓存 schema 不兼容、缺少新必填字段或 hash 不匹配时，必须删除对应缓存并重新请求当前 manifest / 内容；不能直接把旧缓存传给玩法层，也不能清空全部无关缓存。
8. 第 1 关和本地低进度初始进入 Game 的保命数据必须有本地快照，不能把 CDN 当成首关唯一真源。
9. 客户端每次只下载目标关卡所在 pack、当前装备皮肤资源、皮肤面板可见项或即将展示的目标资源；不得把远程数据域当成本地目录镜像进行全量同步。
10. hash 未变化的 pack 或皮肤资源应复用平台缓存、会话缓存或应用级持久缓存；如果没有应用级持久缓存，必须明确记录这一点，不能声称“本地已有就不会请求网络”。
11. `levels/` 和 `skin/` 的上传、dry-run、回读校验必须分开执行或分步骤输出：关卡校验 `dataVersion` / `levelDataVersion` / pack hash；皮肤校验 `skinDataVersion` / asset hash。
12. manifest 是小索引文件，内容文件是带 hash 的不可变资源。客户端可以按需刷新 manifest 判断变化，但只有目标内容缺失或 hash 变化时才下载目标内容。
13. 关卡 manifest 和皮肤 manifest 可以分别设置 TTL / `ETag` / `Last-Modified` / cache-control；任何脚本或客户端逻辑都不得把关卡 manifest 刷新解释成皮肤资源失效，反之亦然。
一句话：

> 用户状态走云函数合并，稳定资源随微信版本走分包，动态资源随 CDN manifest / hash 按需加载。

### 11.9 构建脚本职责、变体与校验
构建脚本是包体规则的执行者，不是资源归属的第二真源。它可以生成配置、搬运产物、补齐 Cocos 构建缺漏并做 fail-fast 校验，但不能用后处理把错误的源码归属长期掩盖成“产物能跑”。

构建脚本负责：

1. 调用 Cocos CLI 生成目标平台产物，并区分本地 web、微信 debug、微信 release 等构建变体。
2. 写入构建配置，保持逻辑包名和物理 bundle 名一致，例如 `cocosCore/main`、`gameEntry/bootstrap`、`home/homeAssets`、`gameplay/gameAssets`。
3. 把 Cocos 输出的本地 bundle 整理成微信小游戏分包结构，并保证 `game.json`、`settings*.json`、`project.config.json` 与真实目录一致。
4. 校验启动 preload、bundle `deps`、关键 scene、关键资源、主包大小和启动下载量。
5. 排除 preview / debug-only 资产，避免正式微信 debug / release 包混入编辑器预览内容。
6. 生成、校验并 dry-run 远程关卡 manifest / pack / hash / schema 和远程皮肤 manifest / asset hash / schema；正式 CDN 发布不属于默认构建或验证步骤。
7. 对 Cocos AssetDB / Builder 异常、后处理补资源失败、微信项目配置非法值做 fail-fast，不把坏产物交给后续验证。

构建脚本不负责：

1. 通过复制或改写产物长期修正 `scene` / `prefab` 里的错误资源引用。
2. 让 `Boot.scene`、`Home.scene` 或 `Game.scene` 跨包强引用后，再在 postbuild 阶段偷偷补依赖。
3. 把远程 CDN、旧 Cocos remote bundle 或 fallback 作为稳定 UI / prefab / 图片 / 音频 / 特效的默认承载方式。
4. 在构建阶段静默吞掉缺失资源、空 bundle、空 scene 或平台配置错误。

默认至少区分：

1. 本地 plain web preview。
2. 显式 `local-test` profile。
3. 微信 debug 包。
4. 微信 release 包。

构建脚本至少应校验：

1. `cocosCore/main` 是否只包含 `Boot.scene` 和启动必需资源。
2. `gameEntry/bootstrap` 是否包含 `BootstrapBundle/Scenes/Game.scene`、第 1 关本地数据、游戏入口壳、HUD 和 `local_snapshot` / `cloud_restore` 目标关卡加载所需的最小稳定资源。
3. 如果启用 `home/homeAssets`，它是否只包含首屏后 Home / 菜单功能资源，且不会被启动路由提前加载。
4. `gameplay/gameAssets` 是否只包含非首屏后续玩法和功能资源。
5. `main`、`bootstrap`、`homeAssets`、`gameAssets` 的 `deps` 是否均符合预期，尤其 `main.deps=[]`、`bootstrap.deps=[]`，并且 `bootstrap` 不依赖 `homeAssets` / `gameAssets`，`homeAssets` 不反向污染统一游戏入口。
6. `settings.assets.preloadBundles` 是否只包含当前允许的启动 bundle；默认只能包含 `main`。
7. `game.json` 是否声明了预期微信分包，且 root 路径真实存在。
8. `settings.launch.launchScene` 是否仍是 `Boot.scene`。
9. preview 资产是否误入正式平台包。
10. 微信上传主包大小和启动下载量是否满足预算。
11. 远程关卡 manifest / pack 和远程皮肤 manifest / asset 是否分别存在版本、schema、hash、目标资源索引并能 dry-run 验证。
12. 旧 Cocos remote bundle 方案是否没有回流为默认构建路径。
13. 普通微信 debug / release 是否都没有本地 `levelData` / skin 镜像 fallback；如存在 `local-test` 产物，是否带有明确 profile 标识且不能被发布脚本误用。

Cocos 构建成功退出不等于产物有效。构建 wrapper 必须 fail fast 检查：

1. AssetDB / Builder 日志中不能出现内置 importer 缺失，例如 `Can not find the importer image/scene/prefab/json/typescript/audio-clip in editor`。
2. Builder 统计不能出现 `Number of all scenes: 0` 或 `Number of all scripts: 0` 这类空构建信号。
3. 关键 bundle config 不能是空壳，必须能找到预期 scene、paths 和关键资源。
4. `project.config.json` 不能包含微信开发者工具会拒绝的非法字段，例如错误的 `libVersion`。
5. 后处理脚本补资源时不能静默吞缺失；scene / prefab / spriteFrame / native image 缺失必须阻断构建。

构建校验应输出逻辑名和物理名，例如 `gameEntry/bootstrap`、`cocosCore/main`，避免后续讨论把 Cocos 默认 `main`、微信硬主包和业务首包混在一起。

### 11.10 实验注册与 V2 项目模式（P0）

V2 的项目实验模式固定为：

```yaml
projectExperimentMode: internal
```

`internal` 表示分配、持久化、配置选择和曝光均由项目内已登记的实验服务负责；平台实验 API、URL 强制参数和历史报表字段不能自动成为运行时分配真源。每个实验必须先登记，未登记实验不得进入 release：

```yaml
experiment:
  id: <stable_id>
  version: <immutable_version>
  status: draft | running | paused | stopped
  owner: <human_owner>
  hypothesis: <one_testable_claim>
  eligibility: <deterministic_rule>
  assignment:
    unit: account | device
    identitySource: <stable_identity>
    namespace: <mutual_exclusion_namespace>
    algorithm: <name_and_version>
    allocation: { control: 50, treatment: 50 }
  variants:
    control: { configRef: <ref>, contentHash: <hash> }
    treatment: { configRef: <ref>, contentHash: <hash> }
  exposure:
    trigger: <first_actual_application>
    event: <event_name>
  primaryMetric: <metric_contract>
  guardrails: [<metric_contract>]
  stopRule: <decision_rule>
  rollback: <safe_baseline_and_owner>
  forcedDebugExcluded: true
```

最低规则：

1. 生命周期必须可区分 `eligible → assigned → config_ready → applied → exposed → outcome`；只有实际应用后才能记 exposure。
2. `unassigned`、`identity_missing`、`config_failed`、强制调试和历史未知值必须独立保留，不能并入 control。
3. 同一实验的客户端、服务端、资源选择和分析口径必须引用相同 `id + version`；涉及状态写入的服务端必须校验实验版本。
4. 注册表记录合同，不记录每日结果。具体运行实验及其停止结论进入独立实验档案，不继续追加到这份冻结 V1。

## 12. 变更工作流
### 12.1 静态 UI 需求
例如按钮变大、标题挪位置、卡片间距调整、图标换图。

默认流程：

1. 优先由 Cocos AI 修改 `scene` / `prefab`。
2. Human 在 Cocos 中做局部微调。
3. Code AI 只补绑定和动态行为。

### 12.2 动态逻辑需求
例如选豆规则、关卡加载、体力恢复、广告解锁、数据刷新。

默认流程：

1. Code AI 修改运行时逻辑。
2. 如果影响 UI 状态，再同步 Cocos AI 调整静态壳或默认状态。
3. Human 验证视觉和交互。

### 12.3 跨边界需求
例如某面板既要换布局又要换交互。

默认流程：

1. 先明确哪些字段归 Cocos 真源，哪些字段归代码真源。
2. 先由 Cocos AI 调整静态壳。
3. 再由 Code AI 接动态行为。
4. 禁止双方各改一半但没有真源声明。

### 12.4 动效迭代
明确反馈直接改对应真源；模糊反馈先暴露到 preview、组件或 `PreviewController` 中调参，再固化到对应真源。

示例：

1. 起点提高、摆幅减小、粒子颜色变化，若属于固定装饰本体，归 Cocos AI。
2. 波次顺序、delay、总时长、目标计算，若依赖运行时状态，归 Code AI。

## 13. 验证规范
AI-first 工作流不能把自测默认外包给 Human。每次用户可见改动后，Code AI 必须先做一轮与影响范围匹配的自测。

### 13.1 工具优先级
对于当前 Cocos Creator + localhost preview 项目，默认顺序是：

1. `Browser` 插件 / in-app Browser：日常本地 smoke，适用于 `localhost`、`127.0.0.1`、`file://`、当前 Codex 内置浏览器标签和普通本地预览。
2. `playwright` skill：稳定流程的可重复回归，适用于脚本化点击、截图、canvas 视觉检查、控制台错误采集和构建后 web 产物验证。
3. `Chrome` 插件：只用于用户明确要求 `@chrome`，或必须依赖真实 Chrome profile、已有标签页、登录态、扩展状态的复现。
4. 微信开发者工具 CLI：微信小游戏平台验证必须使用，适用于 `build/wechatgame` 的真实包结构、分包路径、微信基础库、模拟器 console 和平台 API 行为。

### 13.1.1 Browser / Playwright 本地验证实践
1. 本地用户可见改动优先用 `Browser` 插件打开真实入口；如果只是自测，不需要把浏览器窗口显式展示给 Human。
2. 代码或构建变更后，必须 reload 当前本地页面，再采集新的 DOM、console 或截图；不能用旧页面状态证明新改动通过。
3. 需要稳定复现、截图留证、控制台采集或多步骤交互时，用 `playwright` skill；Playwright 能力来自 Codex skill，不要求项目 `node_modules` 安装 `playwright`。
4. 如果 `~/.codex/skills/playwright/scripts/playwright_cli.sh` 没有执行权限，可以用 `sh ~/.codex/skills/playwright/scripts/playwright_cli.sh ...` 调用；不要因为 `require.resolve('playwright')` 失败就判定 Playwright 不可用。
5. `playwright run-code` 传入异步函数表达式，例如 `async (page) => { ... }`；不要传裸 `await page...`，也不要在该入口里依赖动态 `import(...)`。
6. Cocos canvas 页面必须验证实际画面或运行时状态。对 bundle / scene 问题，优先在页面内用 `cc.assetManager.loadBundle`、`bundle.loadScene`、`cc.director.loadScene` 等运行时 API 验证目标 bundle 和场景，而不是只看页面是否能打开。
7. Cocos Creator 编辑器 preview 验证游戏入口时必须显式指定启动场景，例如 `http://localhost:7456/?scene=db%3A%2F%2Fassets%2FScenes%2FBoot.scene&level=1`。裸 `?level=1` 会使用编辑器内存中的 `current_scene`，如果当前打开的是空场景会出现黑屏，不能作为有效入口验证。
8. 普通 browser preview 默认从本地 `levelData` 镜像读取关卡，因此 `http://localhost:7456/?level=2` 这类入口不依赖外部 CDN；只有显式追加 `use_cdn=true` 时才改为读取默认微信关卡 CDN。这个开关只用于本地验证关卡 CDN 行为，不能替代微信 release CDN 验证；同时 OSS / CDN 必须对 `http://localhost:7456` 或等价本地 origin 放行 CORS，否则浏览器会在进入游戏逻辑前拦截 manifest / pack 请求。
9. 构建后的 web 产物用本地静态服务验证；验证结束后关闭临时服务。`favicon.ico` 这类无关 404 可以记录但不阻断，业务资源、bundle、scene、脚本、贴图缺失必须阻断。

### 13.1.2 Chrome 插件使用边界
1. Chrome 不是普通本地预览的默认工具；除非 Human 明确要求 Chrome，或问题依赖用户当前 Chrome 的真实 profile 状态，否则不要用 Chrome 替代 Browser / Playwright。
2. 接管已有 Chrome 标签页时，只能从当前 `openTabs()` 返回结果中选择目标标签并 claim；不要猜 tab id。
3. Chrome 任务结束前必须 finalize 标签页；只有 Human 需要继续查看或接手的页面才保留。
4. 不得检查或导出 Chrome cookie、local storage、密码、profile 存储和会话仓库。需要登录态复现时，只验证页面可见行为和 console / network 现象。

### 13.1.3 微信开发者工具验证实践
1. 先完成对应构建，再打开平台包；debug 验证用 debug 包，release 验证用 release 包，不能用 web preview 代替微信小游戏平台验证。
2. 微信开发者工具不是真实微信客户端；手机微信和电脑微信客户端都是真实微信运行环境。不得把 `wx.getDeviceInfo().platform` 的 `windows`、`mac`、`ohos_pc` 当成 `devtools`。
3. 微信开发者工具只能验证包结构、基础库、模拟器 console、平台 API 接入和 mock / failure 分支；真实广告播放、真实登录态和真实客户端表现必须在手机微信或电脑微信客户端验证。
4. 打开项目必须传绝对路径。相对路径如 `--project build/wechatgame` 容易在当前进程目录变化时解析错，出现 `project.config` 无效或资源路径误判。
5. 当前验证过的默认调用方式如下，端口被占用时换一个空闲端口：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project /ABS/PROJECT/build/wechatgame --port 34653 --debug
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto --project /ABS/PROJECT/build/wechatgame --port 9420 --trust-project --debug
```

6. 当前微信开发者工具 CLI 的 `auto` 命令使用全局 `--port` 参数；不要沿用旧口径写成 `--auto-port`。
7. 微信开发者工具自动化通道只作为辅助证据。`miniprogram-automator` 可能出现 `launch/open` 成功但 `evaluate`、截图或 direct connect 超时；这类情况应记录为工具通道受阻，不能据此判定游戏通过，也不能据此判定游戏失败。
8. 平台验证至少要结合三类证据：模拟器实际画面或系统截图、调试器 console 中红色 error / 新增 error 数、`build/wechatgame` 包内资源和分包文件检查。
9. 自动截图不稳定时，使用系统截图留证，例如 `screencapture -x temp/wechat-devtools-validation/<case>.png`，并在截图后人工/视觉检查启动画面、目标场景、弹窗或错误状态。
10. 遇到微信平台专属错误，例如分包文件缺失、`ReadFile:fail no such file or directory`、基础库 API 差异、`game.js` require 路径错误，必须在 `build/wechatgame` 中查真实产物和 `game.json/project.config.json`，不能只修浏览器预览。
11. 如果开发者工具已打开旧项目，优先用绝对路径重新 open 当前 `build/wechatgame`；必要时先 `close` / `quit` 再打开。除非 Human 要求关闭，否则平台验证后可以保留窗口便于继续观察。

### 13.2 最低验证要求
1. 用户可见结果必须实际打开对应入口验证。
2. console 不应有本次新增 `error`。
3. 脚本校验通过，或说明为什么本轮不适用。
4. 如果浏览器、preview、平台环境、自动化通道或构建阻塞，必须明确区分“游戏失败”和“验证工具失败”，记录阻塞点，不能把未验证包装成通过。

### 13.3 常见变更验证入口
1. `scene` / `prefab` / 静态 UI 改动：打开受影响入口，检查视觉结果与编辑器保存结果一致。
2. 面板 / 弹窗 / 结算页 / 失败页：使用 `UIPreview.scene` 的 Panel Preview 模式或等价 debug 入口，至少打开、关闭、再打开一次。
3. gameplay HUD / 棋盘 / 槽区 / 技能按钮：打开 `Game.scene` 对应入口，验证第 1 关、注入本地高关卡进度后的第 N 关、基础点击/拖拽和普通 UI 不跟随棋盘缩放。
4. 特效 / 引导 / 条件触发内容：使用 `UIPreview.scene` 的 Fx Preview 模式或 debug 入口，一键触发并至少复播一次。
5. bundle / 启动链 / 构建脚本：跑校验脚本、Browser 启动本地 preview、验证首屏能起、关键 bundle 不缺失、preview 资产未误入正式包。
6. 启动状态路由：分别验证 `new`（本地无高进度且云端确认空状态，进入第 1 关）、`local_snapshot`（注入 `pdd.level = N` 且 `N >= 2`，直进 `Game.scene` 第 N 关且首屏不加载 `homeAssets`）、`cloud_restore`（本地缺失或为 `1`，云端高进度返回后在 Game 内恢复 / 重载到第 N 关且不回写低进度）和 `unresolved`（云端不可用且本地无高进度，允许 provisional 第 1 关但禁止云写与新用户定性）。
7. 远程关卡 CDN：验证 `levels/level_live.json` 的 `dataVersion` / `levelDataVersion`、`schemaVersion`、`minClientBuild`、pack `hash` 和目标关卡索引；release 只应下载目标关卡所在 pack，进入下一关跨 pack 时必须自动拉取新的目标 pack，不能打开游戏就全量下载关卡 CDN。
8. 远程皮肤 CDN：验证 `skin/skin_live.json` 的 `skinDataVersion`、`schemaVersion`、`minClientBuild`、资源 `hash` 和目标皮肤资源索引；release 只应下载当前装备皮肤、面板可见项或即将展示的皮肤资源，不能打开游戏就全量下载皮肤 CDN。

### 13.4 默认检查顺序
1. 先看 plain Cocos / web preview。
2. 再看小游戏本地 debug，并用微信开发者工具 CLI 打开绝对路径 `build/wechatgame` 验证。
3. 再构建微信 release，并复查 release 包内分包、资源、console 和启动画面。
4. 再跑 `npm run sync:cdn:wechat:level_data:dry`，校验 `levels/level_live.json` / pack / hash。
5. 再跑 `npm run sync:cdn:wechat:skin_data:dry`，校验 `skin/skin_live.json` / asset / hash。
6. 默认验证到 dry-run 结束。不得在默认检查、自动修复、测试闭环或“顺便验证”中执行任何不带 `:dry` / `--dry-run` 的 CDN 同步命令。

### 13.5 正式 CDN 发布授权边界

正式 CDN 上传是会改变外部环境的发布动作，不是验证步骤。只有 Human 在当前任务中明确授权了目标环境、资源域和发布范围后，才可执行 `npm run sync:cdn:wechat`、`npm run sync:cdn:wechat:all` 或任何分项非 dry-run 命令。

发布前必须同时满足：

1. 对应 level / skin dry-run 已通过，并展示待发布 manifest、内容 hash、目标 bucket / slot 和差异摘要。
2. 授权必须能区分 `level_data`、`skin_data` 或 `all`；“帮我验证”“构建 release”或过去一次授权均不构成本次发布授权。
3. 内容文件先上传，manifest 最后切换；失败时不得把半发布状态包装成成功。
4. 发布后回读目标 CDN 验证 manifest、hash、schema 和目标资源，但回读验证不能倒推或替代发布前授权。

## 14. 一票否决规则
出现以下情况，改动视为不合格：

1. Human 在 Cocos 中调好的位置，运行时又被代码无条件改掉。
2. `scene` / `prefab` 已有图片引用，运行时又偷偷换回默认图。
3. 一个稳定面板同时存在 scene 版和代码重建版。
4. Code AI 在稳定 UI 上再造平行布局系统。
5. 明明已有 scene 节点，代码又创建一份同名节点。
6. 启动场景直接依赖 CDN 或远程首屏资源。
7. 用 fallback 掩盖关键资源、bundle、平台能力或远程数据错误。
8. 整棵 UI 树 `destroyAllChildren()` 后全部重建。
9. helper 的作用已经演变成第二套 UI 系统。
10. 为了棋盘拖动或缩放，直接缩放 `Canvas`、场景控制器节点、`ScreenRoot` 或普通 UI 层。
11. `Boot.scene` 直接引用 `bootstrap`、`homeAssets`、`gameAssets` 或 `LevelData` 资源。
12. 构建产物中 `main`、`bootstrap`、`homeAssets`、`gameAssets` 出现非预期 `deps`，但仍继续当作验证通过。
13. 默认启动 `preloadBundles` 包含 `bootstrap`、`homeAssets` 或 `gameAssets`，且没有明确的专项性能评审和启动下载量证明。
14. 混淆 `new`、`local_snapshot`、`cloud_restore`、`unresolved` 的证据边界，或把任一启动状态首屏路由到 Home。
15. 在云端恢复未决时，把默认第 1 关或低进度状态同步到云端，覆盖可能存在的老用户高进度。
16. Cocos 构建日志已经出现 importer 缺失、0 scenes、0 scripts 或空 bundle config，仍把产物交给 Browser / 微信开发者工具验证。
17. 客户端把 CDN 资源数据当成本地目录镜像，每次启动全量下载远程关卡 pack、皮肤资源或整个远程数据域。
18. 非首屏皮肤大图、活动图或运营素材加载失败会阻塞 `Game.scene` 的 `initGame` 或启动首屏进入。
19. 关卡资源和皮肤资源共用同一个远程版本号 / hash / manifest，导致关卡更新让皮肤缓存失效，或皮肤更新让关卡 pack 失效。
20. 未获得本次明确授权就执行正式 CDN 上传，或把非 dry-run 发布包装成默认验证步骤。

## 15. 推荐口径
后续项目中统一使用以下表述：

1. `Cocos AI`：负责 `scene` / `prefab` / 静态 UI / 编辑器资产真源。
2. `Code AI`：负责代码 / 动态状态 / 运行时调度 / 构建校验真源。
3. `Human`：负责需求输入 / 审美纠偏 / 局部微调 / 风险判断 / 最终验收。
4. `cocosCore/main + gameEntry/bootstrap + home/homeAssets + gameplay/gameAssets + remoteLevelData/CDN + remoteSkinData/CDN`：当前默认发布结构，替代旧的“主包 + Cocos remote bundle”默认口径；其中 `home/homeAssets` 是首屏后可选功能包，不再是老用户启动入口，`remoteLevelData/CDN` 与 `remoteSkinData/CDN` 必须分 manifest / 分 hash / 按目标资源加载。
5. 启动语义状态：`new` 表示本地无高进度且云端已确认空状态；`local_snapshot` 表示有效本地高进度可先路由；`cloud_restore` 表示云端高进度接管；`unresolved` 表示证据不足并禁止默认云写。四种状态都先进入 `Game.scene`，并可在一次启动中转换。
6. Route-owned 资源：为了保证 `deps=[]`，避免 Boot、统一游戏入口、Home 和后续玩法互相多下载而保留的同视觉不同 UUID 资源，不按“像素重复”直接删除。
7. 用户状态数据：玩家进度、金币、体力、道具、主题解锁、已拥有皮肤和装备皮肤，必须逐字段遵守 11.2.1 权威矩阵；不能用笼统“本地 + 云端合并”代替字段合同，也不能和 CDN 资源下载规则混用。
8. 资源内容数据：关卡 pack、皮肤背景大图等可版本化资源，走 CDN manifest / hash / 按需下载；关卡和皮肤必须在同一个 CDN 根地址下拆成 `levels/` 与 `skin/` 两个目录和两个 manifest，不能共用版本号；也不能和云函数用户状态合并规则混用。

最终原则：

> Cocos AI 管静态壳和稳定视觉，Code AI 管运行时状态和调度，Human 管判断和收口；用户状态按字段权威矩阵合并，稳定资源走本地包或微信分包，关卡资源走 `levels/level_live.json` / pack hash 按需加载，皮肤资源走 `skin/skin_live.json` / asset hash 按需加载；启动只使用 `new / local_snapshot / cloud_restore / unresolved` 语义状态并统一先进入 Game，默认 CDN 验证止于 dry-run，启动包图以构建产物 `deps` 和路由实测为准。
