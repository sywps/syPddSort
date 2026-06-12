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

## 5. scene / prefab / TS / 构建脚本边界
### 5.1 scene 负责
1. 启动场景骨架。
2. Canvas、Camera、场景控制器节点和 UI 根节点结构。
3. 首屏可视内容、主菜单稳定节点、Loading 稳定节点。
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

### 5.4 构建脚本负责
1. Cocos CLI 构建、平台打包、bundle 校验和主包大小校验。
2. `main`、`bootstrap`、微信小游戏分包、远程关卡数据边界校验。
3. preview 资产排除、CDN dry-run、manifest / pack hash 校验。

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

### 11.1 默认发布结构
当前默认发布结构按四层理解：

1. `main`：启动第一口气，只放启动 scene、启动脚本、首帧本地资源、最小 loading cover 和平台启动壳依赖。
2. `bootstrap`：首屏 / 首关本地保障层，放首屏继续运行所需资源、首关数据快照、首局高概率触达的小型 prefab、首批棋盘/豆子关键资源。
3. 微信小游戏分包：稳定但非首屏/首关必需的功能资源，例如后续功能面板 prefab、稳定 UI 图片、图集、音频、特效、商店、签到、排行榜、设置、图鉴、主题等资源。
4. 远程关卡数据：高频动态数据，例如 `level_live.json`、分段关卡 pack、每日新增关卡 pack、难度曲线、关卡投放和少量运营配置。

### 11.2 禁止事项
1. 启动场景不能直接依赖 CDN 或远程首屏资源。
2. 不把每天新增的关卡 JSON 放进微信分包。
3. 不把稳定 UI、prefab、图片、音频、特效默认放到远程 CDN 做热更。
4. 不把 Cocos remote bundle 作为默认后续资源承载方式。
5. 不让启动 scene 强引用分包内非首屏资源。
6. 不在 `loadCC()` 前阻塞等待 `level_live.json`。
7. 不把 `level_live.json` 失败包装成首屏启动失败。

### 11.3 prefab 放置规则
`prefab` 不存在天然应该进首包这一说，放置位置只由启动依赖级别决定：

1. 启动 loading 壳进入 `main`。
2. 首局高概率立刻触达但不需要启动 scene 直连的 prefab 优先进入 `bootstrap`。
3. 设置、排行、图鉴、商店等非首局必需 prefab 优先进入微信小游戏分包。
4. 远程 CDN 默认不承载 prefab，除非项目另写专项远程 Cocos 资源热更规范。

### 11.4 远程关卡数据规则
远程 CDN 默认只发布关卡数据 manifest 与 pack，且必须支持 schema、客户端版本和 hash 校验。

最低要求：

1. `level_live.json` 最后上传，指向当前可用的数据版本和 pack。
2. 每个 pack 必须有 `id`、`url`、`hash`、`levelRange` 或等价索引。
3. manifest 必须有 `schemaVersion`、`minClientBuild` 和 `dataVersion`。
4. 客户端只加载 schema 兼容且满足 `minClientBuild` 的关卡数据。
5. 如果新关卡需要新客户端代码，应等待微信新包下载完成，并提示用户重启小游戏。

一句话：

> 稳定资源随微信版本走分包，动态关卡随 CDN 走 JSON manifest。

### 11.5 构建变体与校验
默认至少区分：

1. 本地 plain web preview。
2. 微信 debug 包。
3. 微信 release 包。

构建脚本至少应校验：

1. `main` 是否只包含启动必需资源。
2. `bootstrap` 是否只包含首屏 / 首局本地保障资源。
3. 微信小游戏分包是否包含稳定 UI、prefab、图片、音频、特效。
4. preview 资产是否误入正式平台包。
5. 主包大小是否满足预算。
6. `game.json` / 构建产物是否生成预期微信分包声明。
7. `preloadBundles` 是否没有把非首屏分包提前塞进启动链路。
8. 远程 manifest / pack 是否存在版本、schema、hash 并能 dry-run 验证。
9. 旧 Cocos remote bundle 方案是否没有回流为默认构建路径。

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

1. `Browser` 插件：日常本地 smoke。
2. `playwright` skill：稳定流程的可重复回归。
3. `Chrome` 插件：依赖真实登录态、已有标签页、扩展或用户特定 profile 的复现。

### 13.2 最低验证要求
1. 用户可见结果必须实际打开对应入口验证。
2. console 不应有本次新增 `error`。
3. 脚本校验通过，或说明为什么本轮不适用。
4. 如果浏览器、preview、平台环境或构建阻塞，必须明确记录阻塞点，不能把未验证包装成通过。

### 13.3 常见变更验证入口
1. `scene` / `prefab` / 静态 UI 改动：打开受影响入口，检查视觉结果与编辑器保存结果一致。
2. 面板 / 弹窗 / 结算页 / 失败页：使用 `UIPreview.scene` 的 Panel Preview 模式或等价 debug 入口，至少打开、关闭、再打开一次。
3. gameplay HUD / 棋盘 / 槽区 / 技能按钮：打开 `Game.scene` 对应入口，验证首关、基础点击/拖拽和普通 UI 不跟随棋盘缩放。
4. 特效 / 引导 / 条件触发内容：使用 `UIPreview.scene` 的 Fx Preview 模式或 debug 入口，一键触发并至少复播一次。
5. bundle / 启动链 / 构建脚本：跑校验脚本、Browser 启动本地 preview、验证首屏能起、关键 bundle 不缺失、preview 资产未误入正式包。

### 13.4 默认检查顺序
1. 先看 plain Cocos / web preview。
2. 再看小游戏本地 debug。
3. 再构建微信 release。
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

## 15. 推荐口径
后续项目中统一使用以下表述：

1. `Cocos AI`：负责 `scene` / `prefab` / 静态 UI / 编辑器资产真源。
2. `Code AI`：负责代码 / 动态状态 / 运行时调度 / 构建校验真源。
3. `Human`：负责需求输入 / 审美纠偏 / 局部微调 / 风险判断 / 最终验收。
4. `main + bootstrap + 微信小游戏分包 + 远程关卡数据`：当前默认发布结构，替代旧的“主包 + Cocos remote bundle”默认口径。

最终原则：

> Cocos AI 管静态壳和稳定视觉，Code AI 管运行时状态和调度，Human 管判断和收口；稳定资源走本地包或微信分包，动态关卡数据走 CDN JSON manifest。
