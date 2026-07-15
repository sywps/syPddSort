# AI Runner Phase 1-2

这套 runner 是 GameAISDK 思路的轻量替代：不接入旧 SDK，不修改 Cocos 场景或 prefab，只从浏览器外部观察 web preview，并像玩家一样做点击、拖拽、等待、返回和刷新。

## Scope

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

## Failure Semantics

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
