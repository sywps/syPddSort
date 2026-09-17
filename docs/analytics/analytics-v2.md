# 埋点精简与前十关监控 v2

## 生效范围

本地客户端、云函数及日报代码已更新；未部署云函数、未打包发布、未提交。现有暂存改动保留。

### 精简

- 引导：正常包只保留每步骤前三次miss明细。每次触摸完整累计hitCount/missCount并保存本地，第一次展示、每5次触摸、完成、后台、退关、重启补报时输出guide_step_summary。firstMissAt/lastMissAt/lastResult保留末次信息。汇总按用户+guideInstanceId取最大snapshotSeq（同序号取最新时间），不能相加。
- l1_release_state：相同正常/异常状态不重复发；状态改变及首个interaction_ready_emitted保留。原调用方18条预算仍有效。interaction_touch_attempt保留前三条正常明细及原有预算内的异常。
- 启动：各阶段耗时进入startup_summary.extra.stages，保留独立启动/首次可玩/失败事件；首次可玩前初始化失败也输出失败摘要。AnalyticsMgr会话内只记录一次app_launch。
- 广告：展示成功、等待状态由事务事件承接；有事务的取消只发事务cancel，无事务的提供方取消改为rewarded_ad_provider_cancel。展示建立/资源加载仍是单独诊断。看完和奖励到账保留独立事件。回前台1秒只记录wait_pending，不再弹长提示；迟到回调/取消/防重复奖励规则保留。
- `globalThis.__PDD_ANALYTICS_DIAGNOSTIC__ = true`可保留启动/触摸/状态明细，默认关闭；仍受现有总量限制。不修改引导视觉、热区、难度及奖励数量。

### 可靠性

- AnalyticsDelivery统一保存行为、漏斗、结算待传记录；创建时即固定eventId、原始timestamp、schemaVersion=2及局/版本上下文。只有明确ok:true才能清除，批量确认数量不一致也重试。
- 网络拒绝、业务ok:false、15秒未确认均保留；重试间隔1.2秒起指数退避，最多60秒。每批漏斗最多20条；进程退出前已保存的记录可重启重传；旧账号已绑定的记录不会上传给新账号。
- 云函数按用户+eventId（结算按用户+roundId）确定文档ID；部分写入后重试覆盖同文档，不新增一次。旧无ID行为仍支持。必须先部署配套云函数，再发布新客户端，否则旧云端不提供完整防重能力。
- 队列上限1000，普通诊断超过800即拒绝，为核心事件预留空间。超限、持久化失败、上传失败显式记录；analytics_quality报告累计计数。存储不可用时会明确记录“仅内存”；不承诺崩溃或存储故障下绝对零丢失。
- guide counters入队失败不会清除唯一汇总；本地原局检查点在重启时上报level_unresolved_previous，它是“缺少终局”的证据，不是确认崩溃。
- extra优先放事件专用字段，然后附实验/包字段。云端仍限制35键并报告extraDroppedKeyCount；启动stages单独支持4096字符。

## 口径修正

- `game_start`仅冷启动；返回前台是`app_resume`，切后台是`app_background`。原app_show/app_hide继续作为漏斗生命周期。
- 总局数由enter_level计算，不能用game_start。历史daily_stat需重算后才能与新口径比较；user_profile.totalPlayTimes旧累计字段不再对v2重试增量更新，查询局数应使用幂等原始进入记录。
- 创建roundId提前到PCH控制器启动前，展示引导时已有所属局。enter_level表示开始初始化一局，level_interaction_ready表示可玩。前者到后者的差值包含启动准备，不是纯操作时长。
- 每次level_fail是失败遭遇，可复活并通过；level_record的pass/fail/abandon才是终局。失败快照带failureId和真实玩法统计，复活选择、广告事务及行为保留关联。
- 设置返回首页、重新挑战、失败页回首页记录level_exit_intent；终局附exitReason。explicitExit仅统计同时有主动操作证据和abandon终局的局，unknownAbandonReason单列无原因的中断；失败后回首页仍可属于fail终局，不强行改成abandon。拒绝复活另记revive_declined。
- 25/50/75%进度用level_progress+progressPercent；前十关通用level_pause_snapshot区分background/leave。后台返回记录level_resume并允许下一次后台快照。旧控制器不能向新局上报。
- 后台无终局且超过30分钟显示推断未恢复，它是未决局的子集；不等于主动退出/崩溃。没有证据的未决局保持未决，永不返回且没来得及留证据的退出无法精确识别。

## 引导、扩容与广告

- 固定引导实际包括：第1关两步存入、第2关变速、第3关免费扩容、第4关缩放。第4关区分达到操作阈值完成与界面被关闭中断；第5～10关固定引导显示不适用，扩容弱提示另列。
- guide_complete为整体完成；pch_guide_step_done仍是单步。第四关新增展示和完成上报，不改变原操作阈值。
- miss仅统计miss_target等明确未命中结果；点击命中但扩容执行失败计入actionFailureCount，不混作误触。若明细证明最新汇总缺失/滞后，报表miss总数显示未知并标记missingLatestSummary。
- 第三关capacity_eligibility记录每局免费引导资格，capacity_grant记录免费/广告、扩容前后容量及结果。重新开局仍沿用现有每局免费引导规则。
- ad_entry_exposure目前为前十关扩容按钮实际可见且不被已知输入锁/模态遮挡时每局一次，记录placement、mode和freeGuideCompleted。它不是所有广告位的曝光分母，报表明确标注scope；其他广告位继续使用点击→展示→完成→到账链。
- 复活面板、广告/分享选择、广告结果、奖励/复活生效和最终局结果保留独立事实。无事务ID的旧记录不按时间猜测关联。

## 报表

`node scripts/analytics-v2-report.js artifacts/cloudbase-daily-report/YYYY-MM-DD`

产生analytics_v2.json和analytics_v2.md；analytics:daily将结果加入combined_summary.analyticsV2并输出同名Markdown。跨日脚本从每一天的原始文件重新计算去重用户及最新累计快照，缺文件返回available:false，不能复制第一天或伪造零值。

- 每关：进入/可玩、应引导/展示/完整完成、miss人数/次数、失败原因、通过/失败遭遇/复活、明确终局/未决、广告各阶段、免费/广告扩容。
- 已知局结果按同批进入round关联；缺round的历史记录单列。用户可跨局成功也失败，人数不能相加求进入人数。
- 新旧引导明细由compatibleFunnelRecords适配，虚拟明细只用于报表，不回写云端。新summary每条含measurementCount权重，PV不能按虚拟行数计数。
- 新引导累计汇总归属原引导开始日期；snapshotAt为本次快照生成时间，receivedAt为云端收到时间。补报后应重跑对应历史日期导出，旧离线快照不会自动获得后来的数据。跨日累计不能直接相加。
- 主线过滤排除明确theme/external，旧缺mode仍列入并标注。buildAnalyticsV2Report可按clientBuildId、experimentBucket筛选。
- 旧首关多步完成缺round时显示未知；第2/3关单步骤完成仍可直接统计人数。旧第四关没埋点时显示未知，不填0。旧数据缺失无法靠新代码补回。
- 旧云端漏斗从guide_step_summary和startup_summary生成虚拟阶段，继续支持既有UV/会话图；原始记录保留。

## 验证和剩余边界

专项自动测试覆盖：ok:false、重启同ID重传、账号隔离、部分批量写入后重传防重、52次miss多快照仍统计52次、按局关联、前十关边界、跨局保护、免费扩容连续点击/后台返回/重开、广告迟到关闭与重复回调、启动摘要、云字段与日报兼容。另执行实际9/14本地导出复算和限定源码的TypeScript检查。

扩展检查中gameplay-init-failure.test.js（缺AppRoot模拟方法）、pch-capacity-pressure-guide.test.js（缺新版引导模拟方法）在本轮修改前暂存源码也复现同样失败；未为这些旧模拟器更改业务逻辑。

最终扩展检查另有3项既有失败，均用修改前暂存文件复现：result-panel-demand-loading.test.js缺getBrowserLevelPreview模拟；result-panel-scaled-fallback.test.js模拟预制体缺HoldToPeekHint；revive-completion-summary.test.js期望坐标0而现有预制体为29.091。本轮不修改这些无关UI或将其算作通过。共5项既有失败，核心埋点专项及限定TypeScript检查通过。

尚未进行微信真机/弱网实际验收、生产云写入测试及发布。最终部署验收要核对数据库中schemaVersion、局关联、幂等写入，以及广告等待、重开第三关三条实际路径。
