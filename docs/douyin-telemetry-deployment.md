# 抖音真实埋点 dev 部署与验收

本轮状态：客户端与 Mongo 接收、管理查询、导出及离线报表已经实现，本地验证见文末。云端还需要按以下步骤发布，不能把本地测试当成线上验收。

A槽dev测试包已于2026-10-10构建完成，主包1708KB、启动下载3613KB，8个资源包配置与编译后广告回调/Spine检查通过。固定目录：`build/bytedance-mini-game-a-telemetry-dev`。

范围：主线、公共页面、侧边栏。合作/PVP及主题/外部玩法的玩法埋点暂缓；独立传输只允许埋点身份和三个写入接口，不开放回放上传。玩法入口保留，不启用通用业务云。默认构建不采集抖音埋点；本次测试包显式使用 douyin_dev，正式采集尚未开启。

## 1. 你：在原函数服务添加文件

进入原来已成功测试的 **dev** 环境 `env-nvk6FNcrq5`，函数服务 `pdd-v2-cloudfunc`（服务 ID `1m0ub3f29wtv7`）。

在服务代码根目录添加/替换以下八个文件，内容来自本项目 `cloudfunctions-douyin` 或交付目录 `artifacts/douyin-telemetry-dev/functions`：

| 文件 | 用途 | 客户端授权路径 |
|---|---|---|
| analyticsCommon.js | 共用数据库、身份、数据校验模块 | 不添加 |
| analyticsIdentity.js | 从平台网关取得埋点身份 | /analyticsIdentity |
| addBehaviorData.js | 启动、关卡和广告等行为 | /addBehaviorData |
| addFunnelEvents.js | 引导、结算、侧边栏、诊断等事件 | /addFunnelEvents |
| saveLevelRecord.js | 每局最终结果 | /saveLevelRecord |
| analyticsSetup.js | 创建索引，仅控制台执行 | 不添加 |
| analyticsReport.js | 按日统计，仅控制台执行 | 不添加 |
| analyticsExport.js | 分页导出，仅控制台执行 | 不添加 |

文件放同一层，保留已有且通过验证的服务入口、package.json、cloudIdentity、cloudAnalyticsTest、cloudAnalyticsVerify。本次不用删除旧测试函数或数据。

依赖继续使用已经验证的 `mongodb: 4.17.2`，运行时 Node 14.21.3。交付目录的 `package.dependencies.json` 只是依赖核对清单，**不要把它当成完整 package.json 覆盖原文件**。

## 2. 你：增加一个环境变量，配置四条路径，然后发布 dev

在此前填写 MONGODB_URI 的同一配置位置新增：

| 名称 | 值 |
|---|---|
| ANALYTICS_ENVIRONMENT | douyin_dev |

继续沿用已测试成功的 `MONGODB_URI`、`MONGODB_DB`。不要发给我连接密码。`CLOUD_ENV=DEV` 是已有运行环境校验项，不要用这次埋点去打开游戏的业务云配置。

在「访问控制 → 外网流量 → 授权访问路径」新增上表四条客户端路径。保留原有精确测试路径，不配置 `/*`，不授权管理函数及公共模块；保持此前已验证的域名访问/IP白名单设置。

确认顶部为 **dev**，点击发布。备注可以填：`dev主线与侧边栏真实埋点接入，合作PVP回放暂缓`。这是函数服务 dev 发布，不是小游戏正式上线。

## 3. 你：先创建索引

发布成功后，在函数控制台测试 `analyticsSetup`，参数：

```json
{}
```

期望：

```json
{"ok":true,"reason":"INDEXES_READY","analyticsEnvironment":"douyin_dev"}
```

此函数可重复执行，不清空数据。若返回失败，先把返回的错误码发给我，不继续做游戏数据验收。

## 4. 我交付测试包；你导入并真机测试

测试包位置：`build/bytedance-mini-game-a-telemetry-dev`。用抖音开发者工具导入，确认 AppID `ttf45082ed6a36c15802`，再预览并用手机抖音扫码。模拟器不采集这套 dev 埋点。

建议分组测试，记下手机测试日期和时间：

1. 冷启动，进入第 1～4 关，正常完成引导与通关。
2. 失败后复活，再通关；测试结算页「下一关」「返回首页」。失败遭遇可记录多次，但同一局只能有一个最终结果。
3. 触发激励广告，分别取消和完整观看，检查原奖励逻辑正常。取消不能算广告完成或到账。
4. 关卡中切后台再回来；断网触发事件、恢复网络；确认身份后再断网退出重进，核对队列补传不重复。
5. 从侧边栏卡片真实返回游戏，领取每日奖励。只打开引导不算复访，重复领取不能重复增加金币。
6. 如合作/PVP入口当前可用，检查玩法不受影响且不出现其玩法事件/回放上传；本次没有开通这些业务云服务。

如果控制台出现 `[AnalyticsDelivery] retained in quarantine`、`retained for retry` 或 `[DouyinAnalytics]` 错误，保存错误码与发生步骤给我。拒收记录与其他账号记录不会伪装成成功，也不会混给当前账号。

## 5. 你：在函数控制台查看真实数据

测试结束后运行 `analyticsReport`，日期换成实际测试当天（北京时间）：

```json
{"date":"2026-10-10"}
```

把完整 JSON 结果发给我。我负责核对启动、关卡、广告、侧边栏等事件是否出现，是否有异常数量。

返回字段包括：`activeObservedUsers`（行为表观测人数）、`firstObservedUsers`（首次入库观测人数）、`behaviorEvents`、`funnelEvents`、`terminalOutcomes`、`capturedAt`。首次观测人数不是抖音平台注册人数；当天窗口标为 partial，不用它宣称全天表现或次留。

## 6. 需要网页明细时：你导出，我生成核对报表

先在控制台执行 `analyticsExport`：

```json
{"date":"2026-10-10","collection":"user_behavior"}
```

保存完整返回 JSON。记住返回的 `capturedAt` 数字，后续所有请求都带上这个同一个数字。

- `hasMore=true`：下一次仍查相同集合，增加 `after` 为上一页 `nextCursor`，并传入相同 `capturedAt`。直到 `hasMore=false`。
- 然后查询 `first_level_funnel` 和 `level_record`，从不带 after 的第一页开始，也传入相同 capturedAt。空集合也要保存返回页。
- 每页各存一个 JSON 文件，例如 `behavior-001.json`、`funnel-001.json`、`levels-001.json`，放进同一目录，不要把 analyticsReport 的摘要混进去。
- 如果控制台截断 JSON，停下并告诉我，不把截断数据当成完整导出。

我可根据这些文件运行：

```powershell
node scripts/douyin-analytics-report.js "保存JSON页的目录"
```

产物为 `artifacts/douyin-daily-report/<日期>/<capturedAt>/index.html`，以及 JSON/Markdown 明细。它复用现有主线统计逻辑，但与微信看板分开，避免把 dev 数据混入微信日报。不是自动在线后台；原有 CloudBase 日报任务无需改配置。

导出缺集合、漏分页、混环境或截止时间不一致会明确报错。未决局不等于流失，次留必须有跨日真实数据。

## 验证边界

- 本地执行真实 AnalyticsMgr、独立传输和新接收函数，Mongo/网络由测试替身承载；验证实际事件字段、账号校验、同 ID 去重/冲突、写入后响应丢失、重启检查点、排除模式、报表分页完整性、构建开关。
- 已回归现有微信队列、正式采集门槛、结算与主线报表。静态类型对比无新增错误；现有 RewardedAdProvider 类型错误仍在。
- 旧 runtime-diagnostics-telemetry 测试在修改前快照同样因 BrowserLevelPreview 模拟缺失失败，不算本轮通过项；新抖音测试覆盖了真实管理器运行异常入口和重启恢复。
- 扩展回归的 coop-restart、gameplay-input-recovery、gameplay-init-failure 也存在修改前即可复现的旧模拟/断言失败，未扩大范围修改业务代码掩盖失败。构建与专项通过不代表整个项目全部测试通过。
- 尚待你完成上述 dev 云端发布及真机验收。正式运行版本识别与正式环境未核实，生产采集保持关闭。不能直接拿此 dev 测试包发布正式版。
