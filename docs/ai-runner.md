# 本地自动试玩 AI Runner

## 本地流程测试（2026-10-16）

无需大模型。原有随机探索保留，新增 `core` 和 `revive` 两种状态感知流程：

- `core`：通过真实鼠标输入完成引导、有效棋盘操作、胜利结算、进入下一关。
- `revive`：优先尝试填满传送带，触发失败/复活面板，点击复活，在同一局恢复并再次产生有效操作。
- 通过外部脚本只读观察 Cocos 场景、按钮、棋盘、引导、传送带及结算状态。不会直接调用通关、道具、复活等游戏方法，不修改游戏业务代码、场景或 prefab。
- 每步检查颜色数量守恒、锁定格正确性、总容量及实际单格容量、胜利时棋盘完成状态。
- 不同初始关卡和种子可以顺序批量运行，每次新建浏览器 context；不继承个人浏览器存档。

先在 Cocos Creator 3.8.8 中启动网页预览，手动确认网页能玩，再在 PowerShell 执行：

```powershell
Set-Location 'D:\code\xyx\syPddSort'

# 只检查配置，不启动浏览器、不写报告
node scripts/ai-runner.js --scenario core --levels 1,3,15 --runs 2 --dry-run

# 完整核心流程，可见 Chrome 窗口；默认最多 1200 步 / 180 秒，任一达到即停止
node scripts/ai-runner.js --scenario core --headed --browser-channel chrome

# 第 15 关失败复活流程；未触发失败时明确记为未完成
node scripts/ai-runner.js --scenario revive --levels 15 --headed --browser-channel chrome

# 3 个起始关卡，每关 3 个种子，共 9 次独立会话
node scripts/ai-runner.js --scenario core --levels 1,3,15 --runs 3 --seed 1001 --browser-channel chrome

# 需要更长预算时，同时增加步数和时间；增加时间不会绕过步数上限
node scripts/ai-runner.js --scenario core --levels 15 --steps 2400 --duration-ms 600000 --browser-channel chrome
```

默认预览地址是 `http://localhost:7456/`，默认打开 Boot.scene 的第 1 关。其他端口或地址用 `--url '实际地址'` 指定，状态感知模式限定 localhost / 127.0.0.1 / ::1。

`--levels` 会设置 URL 中的 `level`。普通 Cocos 预览通过现有 BrowserLevelPreview 读取；已有 creator-web 构建通过新 context 的初始测试存档选择关卡，保留该版自己的存档命名空间。如果实际初始关卡与请求不同，报告会显式停止为 `incomplete`，不能视为指定关卡已覆盖。

有本机 Chrome 时可用 `--browser-channel chrome`。不指定时需要 Playwright 的 Chromium 已安装。Playwright 包仍由 npx 提供，未新增项目依赖；Windows 启动改为通过 Node 执行 npx-cli.js，避免直接 spawn `.cmd` 的 EINVAL。

### 查看结果

输出仍在 `artifacts/ai-runs/YYYY-MM-DD/<run-id>/`，终端会打印报告路径。批次根目录是汇总，每个会话目录包含：

- `report.md` / `summary.json`：结果、缺失流程节点、错误、最后状态，以及观察到的版本边界。
- `session-config.json`：URL、策略、种子、预算和源码 checkout 标识。源码标识不能证明正在服务的构建与源码一致。
- `actions.ndjson`：实际点击坐标、动作、间隔和动作前状态；`last-action.json` 先于输入落盘，便于排查动作导致的卡住。
- `states.ndjson`：逐步玩法状态、各颜色数量、容量、可交互目标和遮罩。
- `screenshots/`：过程截图和最终截图。
- `trace.zip`：浏览器追踪，可用 Playwright Trace Viewer 查看。
- `console.ndjson` / `page_errors.ndjson` / `network.ndjson`：控制台、异常堆栈及 HTTP/请求失败。

可用 `--out-dir '目录'` 指定输出位置。不要复用已有会话目录；工具会拒绝覆盖已有 `session-config.json`，保留原始证据。

状态定义：

| 状态 | 含义 |
| --- | --- |
| `passed` | 规定流程节点全部观察到，且未触发现有异常检查；不代表所有功能无 Bug |
| `incomplete` | 操作/时间预算耗尽，或回放状态偏离，规定流程尚未完成 |
| `failed` | 观察到规则异常、页面错误、网络失败或长时间无进展等信号，需要结合证据确认归因 |
| `tool_failed` | 启动、导航或观察能力等工具/环境失败 |

非 `passed` 返回退出码 1。批次保留 `incomplete` / `tool_failed`，不会统一伪装成游戏缺陷。

### 回放与复现

将某个会话的 `session-config.json` 传入即可另开浏览器，按记录重放输入：

```powershell
node scripts/ai-runner.js --replay 'artifacts/ai-runs/日期/批次/会话/session-config.json' --headed --browser-channel chrome
```

只支持 `core` / `revive` 会话。回放保留原起始配置及输入，点击前最多等待 5 秒与记录中的场景状态同步，并记录等待时间；状态仍不同会显式停止为 `incomplete`，不会强制推进游戏。资源加载、帧率及异步回调仍可能不同，所以这不是确定性游戏回放，也不保证每次复现成功。复现文件夹应保持完整，不覆盖原记录。

### 验证边界

- 本轮真实流程验证使用已有 `build/creator-web`，构建时间为 **2026-10-15T05:57:47.902Z**。它是奖励立即完成的无广告版，不是微信或抖音正式包，也不代表当前未构建源码全部验收。
- 状态感知模式会阻止对外部地址的非 GET/HEAD/OPTIONS 请求，记录隔离拦截；云端能力不能据此验收。浏览器 context 与个人存档隔离。
- 当前覆盖传送带主线玩法。合作、PVP、主题、完整道具/商店/云存档、真实广告、分享返回、前后台和真机内存测试尚未纳入。
- 核心模式当前采用同一种状态策略，随机种子改变棋盘选点；原有四种人格仅在随机探索中具有各自的操作权重，不应理解为多个会思考的 AI。
- 长时间无进展是异常线索，不直接证明根因；随机模式的画面不变检测仍是粗略信号。

### 检查工具本身

```powershell
node --test tests/ai-runner.test.js
```

`tools/ai-runner/browser-verification.test.js` 是独立浏览器负例夹具，检查“未完成不报通过”、JS 异常、HTTP 失败及页面卡住的报告，不代替真实游戏验收，也不混入不需要浏览器的普通测试。它需要在 Playwright 可解析的环境下执行；与 runner 相同，可通过 npm 自带的 npx-cli.js 使用 `--package playwright node --test tools/ai-runner/browser-verification.test.js`。

---

这套 runner 是 GameAISDK 思路的轻量替代：不接入旧 SDK，不修改 Cocos 场景或 prefab，只从浏览器外部观察 web preview，并像玩家一样做点击、拖拽、等待、返回和刷新。

## 排行榜 Web 专项循环（2026-10-19）

在本机 Cocos 预览已经运行时，使用独立脚本执行“首页 → 全国排行 → 等待面板加载完成 → 关闭 → 等待 10 秒”，默认 10 轮：

```powershell
npx.cmd --offline --yes --package playwright node scripts/test-leaderboard-web.js --headed
```

命令复用现有 npm 缓存的 Playwright 和本机 Chrome，不修改项目依赖。`--offline` 要求 Playwright 已在 npm 缓存中；无法解析时会报错。也可使用已有环境提供的 Playwright，通过 `NODE_PATH` 运行 `node scripts/test-leaderboard-web.js`。

- `--url '本地预览地址'`：默认明确指定 Boot.scene 的 `http://127.0.0.1:7456/`。仅支持本机地址。
- `--rounds 10`、`--settle-ms 10000`：设置轮数和每轮关闭后的采样等待时间。
- `--out-dir '目录'`：默认使用 `output/playwright/leaderboard-时间戳/`。已有目录会被拒绝，保留原始证据。
- `--video`：额外录连续视频，需要 Playwright 的 ffmpeg 已可用；缺少时明确报错。默认保留逐轮截图、操作记录和 trace，不要求 ffmpeg。

脚本新建浏览器 context，并只在该测试存档中设置 `pdd.level=11`，让现有启动逻辑进入首页；不调用打开/关闭等游戏业务方法，不注入榜单数据。每次都读取实际按钮坐标后用鼠标点击，检查加载状态结束、全国榜 tab、我的排名显示，以及关闭后面板消失和首页恢复。

普通 Web 的榜单数据来源是 `local-preview`，可能为空列表。本脚本可以验证面板和共同资源生命周期，不能验证微信全国榜的真实条目、真实头像批量加载、开放数据域或真机内存。结果分别记录 `flowStatus`、`cloudDataCoverage` 和 `memoryVerdict`，不会把流程完成写成真机内存验收通过。

采集结果包括：

- 每次打开和关闭稳定后的 Cocos 节点数、资源分类、贴图数、SpriteFrame 缓存和排行榜 owner 数量。
- Chrome 的 JS 堆、DOM 节点和监听器数量；首尾另采强制 GC 样本，和未强制回收的样本分别标记。
- `session-config.json`、`actions.ndjson`、`last-action.json`、`samples.ndjson`、实际加载脚本指纹、控制台/页面/网络异常、21 张截图（默认 10 轮）及 `trace.zip`。

JS 堆不等于微信进程总内存；按贴图宽高计算的 RGBA8 像素估算也不是实测 GPU 内存。判断是否持续累积，需要比较相同状态和相同回收条件，不能只看某一轮的 JS 堆峰值。

## 原有随机探索的范围

当前只覆盖前两个阶段：

1. Playwright 跑 web preview，采集截图、随机动作、状态识别、console/page/network 错误。
2. 用人格 JSON 驱动行为，并输出状态图覆盖报告。

不包含微信开发者工具、真机、每日自动化接入和长期稳定性任务。

## Prerequisites

1. 用 Cocos Creator 3.8.8 打开项目。
2. 启动链路预览双击 `assets/Scenes/Boot.scene`；首关直开预览使用 `assets/BootstrapBundle/Scenes/Game.scene`。
3. 点击预览按钮，确认浏览器可访问：

```text
http://localhost:7456/
```

runner 使用 `npx --package playwright` 临时提供 Playwright，不把 Playwright 写入项目依赖。首次运行可能需要下载或缓存 Playwright 包。

## Commands

只验证配置，不启动浏览器：

```bash
npm run ai:web:dry
```

快速冒烟：

```bash
npm run ai:web:smoke
```

跑四种人格：

```bash
npm run ai:web:personas
```

常用覆盖参数：

```bash
node scripts/ai-runner.js --target web --persona explorer --steps 60 --duration-ms 90000
node scripts/ai-runner.js --target web --persona aggressive --headed
node scripts/ai-runner.js --target web --all-personas --url 'http://localhost:7456/?scene=db%3A%2F%2Fassets%2FBootstrapBundle%2FScenes%2FGame.scene&level=50&profile=local-test'
```

## Personas

人格配置在：

```text
tools/ai-runner/personas/
```

当前内置：

- `smoke`：短跑冒烟，适合本地快速验证。
- `aggressive`：高频点击和双击，压 UI 切换和误触。
- `explorer`：边缘、角落、长拖拽，压边界交互。
- `grinder`：重复动作和较长运行，压计数器和内存相关表现的早期信号。
- `beginner`：慢、乱、常按返回，压引导和弹窗进退。

每个人格可配置：

- `maxSteps` / `durationMs`
- `viewport`
- `waitMs`
- `actionWeights`
- `zones`
- `failureThresholds`

## Artifacts

输出默认在：

```text
artifacts/ai-runs/YYYY-MM-DD/<run-id>/
```

根目录包含：

- `summary.json`
- `report.md`

每个人格子目录包含：

- `session-config.json`
- `summary.json`
- `report.md`
- `state_graph.json`
- `actions.ndjson`
- `console.ndjson`
- `page_errors.ndjson`
- `network.ndjson`
- `screenshots/*.png`

## 原有随机探索的失败判定

`failed` 表示 runner 成功运行并观察到超过阈值的游戏侧异常，例如 console error、page error、黑屏、canvas 消失或长时间画面无变化。

`tool_failed` 表示环境或工具链失败，例如 preview 没启动、Playwright 无法加载、页面无法打开。它不是游戏 bug 的直接证据。

## State Graph

runner 会把每一步记录成：

```text
from state -> to state [action]
```

状态优先级：

1. `BlackScreen`
2. `NoCanvas`
3. `Scene:<sceneName>`
4. `CocosReady`
5. `Page:<readyState>`
6. `RuntimeEvalError`

第一版状态识别是轻量黑盒检测。后续可以继续加基于截图或 Cocos runtime 的更细状态 detector，但仍应保持 runner 外置，不把状态判断写回 Cocos 场景。
