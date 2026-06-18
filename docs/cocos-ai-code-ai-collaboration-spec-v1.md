# Cocos AI + Code AI 协作规范 v1
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

典型 `Code-owned` 字段包括棋盘视口的 `scale / offset`、运行时拖拽节点位置、特效实例生命周期和动态列表内容。

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
本项目默认包体结构已经从旧的“主包 + Cocos remote bundle”调整为“主包 + 微信小游戏分包 + 远程关卡数据”。包体结构必须按“启动依赖”和“更新频率”拆分：稳定 UI、prefab、图片、音频和特效进入本地包或微信小游戏分包；远程 CDN 默认只承载关卡 JSON、关卡 manifest、关卡 pack 和少量运营配置，不能把所有非首包内容继续塞进一个 Cocos remote bundle。

本章是构建脚本、包体结构、bundle 归属、CDN 关卡数据和启动路由的唯一规范入口。第 5 章只定义 `scene` / `prefab` / TS 的真源边界，不再维护一份简化版构建脚本职责，避免同一规则在两个章节漂移。

### 11.1 A/B/C 用户统一进游戏路由规则
本文档中的 A/B/C 是用户状态分类，不是实验分桶。新的默认路由原则是：三类用户启动后的第一个业务场景都必须是 `Game.scene`；Home 不能再作为老用户首屏入口。A/B/C 只决定“游戏场景打开哪一关、云端恢复何时接管”，不决定是否进 Home。

| 用户类型 | 精确定义 | 首屏路由 | 首屏前不得阻塞 |
|---|---|---|---|
| A 新用户 / 早期新用户 | 本地没有 `pdd.level >= 2`，云端最终也没有 `savedLevel >= 2` | 进入 `gameEntry/bootstrap` 的 `Game.scene`，打开第 1 关 / 引导关 | 不等 `wx.getGameExptInfo()`，不等 CDN，不能下载 `homeAssets` / `gameAssets`。 |
| B 正常老用户 | 本地 `validLocalLevel = N` 且 `N >= 2` | 进入 `gameEntry/bootstrap` 的 `Game.scene`，直接打开本地进度第 N 关 | 不等云端恢复，不下载 `homeAssets`；目标关卡数据缺失时在 Game 内显式加载或报错，不能路由到 Home。 |
| C 删包 / 清缓存回流老用户 | 本地缺失或只有 `1`，但云端 `savedLevel = N` 且 `N >= 2` | 先进入 `gameEntry/bootstrap` 的 `Game.scene` 第 1 关临时态；云端高进度返回后在 Game 内恢复 / 重载到第 N 关 | 不把本地默认 `1` 或 starter 状态写回云端覆盖高进度；不等云端才显示首屏；不恢复到 Home。 |

关键规则：

1. 启动时如果只能同步读到本地进度，则初始目标关卡必须按 `initialLevel = validLocalLevel >= 2 ? validLocalLevel : 1` 计算，并立即进入 `Game.scene`。
2. 本地 `pdd.level === 1` 是有效进度，但不能证明用户是老用户；只有 `validLocalLevel >= 2` 才能直接把初始目标关卡设为第 N 关。
3. 启动时的有效进度合并必须使用 `max(local, cloud)`；客户端自动同步不能把云端高进度覆盖成低进度。
4. 本地低进度且云端恢复未决时，Game 可以按第 1 关启动，但这段进度必须视为 provisional。云端未确认前可以写本地 `pdd.level = 1`，但不能把低进度同步到云端。
5. 如果云端返回 `savedLevel > currentLevel`，必须在 Game 内完成恢复：更新本地有效进度，停止或收口当前第 1 关临时态，再加载真实第 N 关。恢复动作不能跳到 Home，也不能要求用户重新进游戏。
6. 如果 B 类用户的第 N 关数据不在本地包或缓存中，`Game.scene` 可以展示游戏内 loading / retry / 明确错误，并按远程关卡数据规则加载；不能静默降级到第 1 关，也不能把 Home 当作兜底。
7. `wx.getGameExptInfo()`、URL `ab`、实验 bucket、策略 bucket 只属于实验 / 埋点维度，不能命名或实现成 A/B/C 用户类型。
8. 实验值可以首屏后后台获取；获取失败或超时不能阻塞 A/B/C 首屏路由。
9. Home 只能是首屏之后由用户行为、运营入口或明确功能路由打开的非启动场景；任何 A/B/C 首屏路由都不得以 Home 为目标。

### 11.2 默认发布结构
当前默认发布结构按“微信硬主包 + Cocos 物理 bundle + 逻辑包名”三层理解。文档、日志和埋点优先说逻辑包名；Cocos 构建配置、资源路径和运行时 `assetManager.loadBundle()` 仍使用物理 bundle 名。

| 逻辑层 | Cocos 物理名 | 主要职责 |
|---|---|---|
| 微信上传主包 / Root | 无固定 Cocos bundle 名 | 微信小游戏启动壳、平台配置、Cocos 入口、最小 settings、必须随启动可用的平台适配代码。 |
| `cocosCore` | `main` | 启动第一口气，只放 `Boot.scene`、启动路由脚本、首帧本地资源、最小 loading cover。 |
| `gameEntry` | `bootstrap` | 全用户统一游戏入口层，放 `Game.scene`、第 1 关本地快照、通用游戏壳、HUD、槽位、豆子图集、引导关同步必需资源，以及能让 B/C 用户进入目标关卡加载流程的最小代码和稳定 UI。 |
| `home` | `homeAssets` | 非启动 Home / 菜单功能资源。只有在首个 `Game.scene` 已经可见后，因用户行为、运营入口或明确功能路由需要 Home 时才加载；不再承担老用户首屏入口职责。 |
| `gameplay` | `gameAssets` | 后续玩法和非首屏功能资源，例如后续弹窗、排行榜、图鉴、商店、签到、主题、音频、特效、大背景和后续玩法 prefab。 |
| `remoteLevelData` | CDN / debug 下可对应 `levelData` | 高频动态关卡 JSON、manifest、pack、难度曲线、关卡投放和少量运营配置。 |

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

启动 preload 默认只允许包含 `main`。`bootstrap` 由统一游戏入口路由显式加载，`homeAssets`、`gameAssets` 必须由首屏后的明确用户行为或功能路由按需加载；把它们塞进 `preloadBundles` 会直接计入启动下载量，不能因为“它是分包”就认为不影响启动。

### 11.3 Cocos Bundle Priority 规则
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

### 11.4 路由自有资源与重复资源规则
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

### 11.5 禁止事项
1. 启动场景不能直接依赖 CDN 或远程首屏资源。
2. 不把每天新增的关卡 JSON 放进微信分包。
3. 不把稳定 UI、prefab、图片、音频、特效默认放到远程 CDN 做热更。
4. 不把 Cocos remote bundle 作为默认后续资源承载方式。
5. 不让 `Boot.scene` 强引用 `bootstrap`、`homeAssets`、`gameAssets` 或 `LevelData` 资源。
6. 不让 `Home.scene` 强引用 `bootstrap` 或 `gameAssets` 资源。
7. 不让 `Game.scene` 强引用 `homeAssets` 或 `gameAssets` 后续玩法资源；游戏入口和第 1 关同步必需资源应归 `bootstrap`。
8. 不在 `loadCC()` 前阻塞等待 `level_live.json`。
9. 不把 `level_live.json` 失败包装成首屏启动失败。
10. 不把 `bootstrap`、`homeAssets`、`gameAssets` 默认加入启动 `preloadBundles`。
11. 不用 fallback 掩盖 bundle、scene、prefab、spriteFrame、平台 API 或远程数据的关键失败；核心资源失败必须 fail fast。
12. 不把 B 类或 C 类老用户首屏路由到 Home；老用户也必须先进入 `Game.scene`，再按进度恢复到目标关卡。

### 11.6 prefab 放置规则
`prefab` 不存在天然应该进首包这一说，放置位置只由启动依赖级别决定：

1. 启动 loading 壳进入 `cocosCore/main`。
2. 游戏入口、首局高概率立刻触达但不需要 `Boot.scene` 直连的 prefab 优先进入 `gameEntry/bootstrap`。
3. 设置、排行、图鉴、商店等非首局必需 prefab 优先进入 `gameplay/gameAssets` 或其它微信小游戏分包。
4. Home 稳定 UI 和 Home prefab 如果仍然存在，进入 `home/homeAssets`，但它们不是 A/B/C 启动首屏依赖。
5. 远程 CDN 默认不承载 prefab，除非项目另写专项远程 Cocos 资源热更规范。

### 11.7 远程关卡数据规则
远程 CDN 默认只发布关卡数据 manifest 与 pack，且必须支持 schema、客户端版本和 hash 校验。

最低要求：

1. `level_live.json` 最后上传，指向当前可用的数据版本和 pack。
2. 每个 pack 必须有 `id`、`url`、`hash`、`levelRange` 或等价索引。
3. manifest 必须有 `schemaVersion`、`minClientBuild` 和 `dataVersion`。
4. 客户端只加载 schema 兼容且满足 `minClientBuild` 的关卡数据。
5. 如果新关卡需要新客户端代码，应等待微信新包下载完成，并提示用户重启小游戏。
6. 第 1 关和本地低进度初始进入 Game 的保命数据必须有本地快照，不能把 CDN 当成首关唯一真源。

一句话：

> 稳定资源随微信版本走分包，动态关卡随 CDN 走 JSON manifest。

### 11.8 构建脚本职责、变体与校验
构建脚本是包体规则的执行者，不是资源归属的第二真源。它可以生成配置、搬运产物、补齐 Cocos 构建缺漏并做 fail-fast 校验，但不能用后处理把错误的源码归属长期掩盖成“产物能跑”。

构建脚本负责：

1. 调用 Cocos CLI 生成目标平台产物，并区分本地 web、微信 debug、微信 release 等构建变体。
2. 写入构建配置，保持逻辑包名和物理 bundle 名一致，例如 `cocosCore/main`、`gameEntry/bootstrap`、`home/homeAssets`、`gameplay/gameAssets`。
3. 把 Cocos 输出的本地 bundle 整理成微信小游戏分包结构，并保证 `game.json`、`settings*.json`、`project.config.json` 与真实目录一致。
4. 校验启动 preload、bundle `deps`、关键 scene、关键资源、主包大小和启动下载量。
5. 排除 preview / debug-only 资产，避免正式微信 debug / release 包混入编辑器预览内容。
6. 生成、校验、dry-run 远程关卡数据 manifest / pack / hash / schema，再按流程同步 CDN。
7. 对 Cocos AssetDB / Builder 异常、后处理补资源失败、微信项目配置非法值做 fail-fast，不把坏产物交给后续验证。

构建脚本不负责：

1. 通过复制或改写产物长期修正 `scene` / `prefab` 里的错误资源引用。
2. 让 `Boot.scene`、`Home.scene` 或 `Game.scene` 跨包强引用后，再在 postbuild 阶段偷偷补依赖。
3. 把远程 CDN、旧 Cocos remote bundle 或 fallback 作为稳定 UI / prefab / 图片 / 音频 / 特效的默认承载方式。
4. 在构建阶段静默吞掉缺失资源、空 bundle、空 scene 或平台配置错误。

默认至少区分：

1. 本地 plain web preview。
2. 微信 debug 包。
3. 微信 release 包。

构建脚本至少应校验：

1. `cocosCore/main` 是否只包含 `Boot.scene` 和启动必需资源。
2. `gameEntry/bootstrap` 是否包含 `BootstrapBundle/Scenes/Game.scene`、第 1 关本地数据、游戏入口壳、HUD 和 B/C 目标关卡加载所需的最小稳定资源。
3. 如果启用 `home/homeAssets`，它是否只包含首屏后 Home / 菜单功能资源，且不会被 A/B/C 启动路由加载。
4. `gameplay/gameAssets` 是否只包含非首屏后续玩法和功能资源。
5. `main`、`bootstrap`、`homeAssets`、`gameAssets` 的 `deps` 是否均符合预期，尤其 `main.deps=[]`、`bootstrap.deps=[]`，并且 `bootstrap` 不依赖 `homeAssets` / `gameAssets`，`homeAssets` 不反向污染统一游戏入口。
6. `settings.assets.preloadBundles` 是否只包含当前允许的启动 bundle；默认只能包含 `main`。
7. `game.json` 是否声明了预期微信分包，且 root 路径真实存在。
8. `settings.launch.launchScene` 是否仍是 `Boot.scene`。
9. preview 资产是否误入正式平台包。
10. 微信上传主包大小和启动下载量是否满足预算。
11. 远程 manifest / pack 是否存在版本、schema、hash 并能 dry-run 验证。
12. 旧 Cocos remote bundle 方案是否没有回流为默认构建路径。

Cocos 构建成功退出不等于产物有效。构建 wrapper 必须 fail fast 检查：

1. AssetDB / Builder 日志中不能出现内置 importer 缺失，例如 `Can not find the importer image/scene/prefab/json/typescript/audio-clip in editor`。
2. Builder 统计不能出现 `Number of all scenes: 0` 或 `Number of all scripts: 0` 这类空构建信号。
3. 关键 bundle config 不能是空壳，必须能找到预期 scene、paths 和关键资源。
4. `project.config.json` 不能包含微信开发者工具会拒绝的非法字段，例如错误的 `libVersion`。
5. 后处理脚本补资源时不能静默吞缺失；scene / prefab / spriteFrame / native image 缺失必须阻断构建。

构建校验应输出逻辑名和物理名，例如 `gameEntry/bootstrap`、`cocosCore/main`，避免后续讨论把 Cocos 默认 `main`、微信硬主包和业务首包混在一起。

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
7. 构建后的 web 产物用本地静态服务验证；验证结束后关闭临时服务。`favicon.ico` 这类无关 404 可以记录但不阻断，业务资源、bundle、scene、脚本、贴图缺失必须阻断。

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
6. A/B/C 启动路由：A 用空本地存储验证进入 `gameEntry/bootstrap` 的 `Game.scene` 第 1 关 / 引导关；B 注入 `pdd.level = N` 且 `N >= 2` 验证进入 `Game.scene` 第 N 关，首屏不加载 `homeAssets`；C 在可 mock 云端时验证本地缺失或 `1` 先进入 `Game.scene` 第 1 关临时态，云端高进度返回后在 Game 内恢复 / 重载到第 N 关，且不会把低进度写回云端。

### 13.4 默认检查顺序
1. 先看 plain Cocos / web preview。
2. 再看小游戏本地 debug，并用微信开发者工具 CLI 打开绝对路径 `build/wechatgame` 验证。
3. 再构建微信 release，并复查 release 包内分包、资源、console 和启动画面。
4. 再跑远程关卡数据 CDN dry-run。
5. 最后同步远程关卡数据并看真机 / CDN。

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
14. 把 A/B/C 用户状态当成实验 bucket，让 `wx.getGameExptInfo()` 阻塞首屏路由，或把任一 A/B/C 用户首屏路由到 Home。
15. 在云端恢复未决时，把默认第 1 关或低进度状态同步到云端，覆盖可能存在的老用户高进度。
16. Cocos 构建日志已经出现 importer 缺失、0 scenes、0 scripts 或空 bundle config，仍把产物交给 Browser / 微信开发者工具验证。

## 15. 推荐口径
后续项目中统一使用以下表述：

1. `Cocos AI`：负责 `scene` / `prefab` / 静态 UI / 编辑器资产真源。
2. `Code AI`：负责代码 / 动态状态 / 运行时调度 / 构建校验真源。
3. `Human`：负责需求输入 / 审美纠偏 / 局部微调 / 风险判断 / 最终验收。
4. `cocosCore/main + gameEntry/bootstrap + home/homeAssets + gameplay/gameAssets + remoteLevelData/CDN`：当前默认发布结构，替代旧的“主包 + Cocos remote bundle”默认口径；其中 `home/homeAssets` 是首屏后可选功能包，不再是老用户启动入口。
5. A/B/C：用户状态分类。A 是新用户或最终有效进度不超过 1 的用户；B 是本地 `validLocalLevel = N` 且 `N >= 2` 的正常老用户；C 是本地缺失或只有 1 但云端 `savedLevel = N` 且 `N >= 2` 的删包 / 清缓存回流老用户。三类用户首屏都进入 `Game.scene`，区别只在初始关卡和云端恢复时机。
6. 实验 bucket：只用于策略、埋点或灰度，不等于 A/B/C 用户类型；实验信息应首屏后后台获取，不能阻塞启动。
7. Route-owned 资源：为了保证 `deps=[]`，避免 Boot、统一游戏入口、Home 和后续玩法互相多下载而保留的同视觉不同 UUID 资源，不按“像素重复”直接删除。

最终原则：

> Cocos AI 管静态壳和稳定视觉，Code AI 管运行时状态和调度，Human 管判断和收口；稳定资源走本地包或微信分包，动态关卡数据走 CDN JSON manifest；A/B/C 用户首屏统一进入 Game，启动包图以构建产物 `deps` 和路由实测为准。
