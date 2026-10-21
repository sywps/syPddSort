# 抖音真实游戏埋点首版方案

状态：2026-10-10 已获确认并实现 dev 首版，云端发布与真机验收待用户操作。具体交付和步骤见 [部署说明](douyin-telemetry-deployment.md)。正式采集保持关闭；下文保留方案依据。

## 已验证与边界

- 用户真机 dev 单条测试返回 ANALYTICS_TEST_OK；独立查询返回 VERIFY_OK、matchingRecordCount=1、fieldsMatch=true。证明本次真实身份调用、MongoDB写入/回读和重复事件去重成立。
- 尚不证明游戏实际事件、弱网跨启动补传、换账号隔离、正式环境采集或日报完成。
- 用户确认：合作/PVP相关埋点和回放上传暂缓，玩法入口保留。微信不受此次抖音迁移影响。

## 当前代码证据

| 环节 | 现状与具体位置 | 迁移影响 |
|---|---|---|
| 采集门槛 | AnalyticsMgr.ts:isCollectionEnabled；CsdAnalyticsPolicy.ts:isOfficialAnalyticsRuntime，只接微信release | 抖音不会自动采集；不能仅改一个布尔开关 |
| 初始化 | AnalyticsMgr.ts:ensureReady/resolveDeliveryOwner 调业务PlatformCloudMgr/getOpenid，绑定用户资料和多项实验 | 新增独立埋点身份通道，避免打开全部业务云或照搬微信实验 |
| 事件字段 | AnalyticsMgr.ts:trackFunnelEvent写死wechat_release | 在事件形成处和投递层统一平台/环境，不用测试标签伪装正式数据 |
| 投递 | AnalyticsDelivery.ts：固定wechat_release队列、eventId、持久化、每批20条、确认后删除、重试 | 复用机制，参数化平台/环境/存储命名；不能导入微信或dev旧队列 |
| 本地恢复 | AnalyticsMeasurements.ts、AnalyticsMgr.ts有引导汇总、账号缓存、活动局和会话检查点 | 不仅队列，所有埋点缓存都必须按平台/环境隔离，账号归属校验 |
| 运行异常 | AnalyticsMgr.ts:bindRuntimeDiagnostics只绑定wx | 按抖音实际支持API绑定，缺能力要标注，不承诺看得到所有崩溃 |
| 云端 | cloudfunctions/getOpenid、addBehaviorData、addFunnelEvents、saveLevelRecord用wx-server-sdk | 新建抖音Mongo实现，保留微信目录不改；客户端提供的openid不得作为身份依据 |
| 统计 | scripts/user-behavior-daily-job.js依赖CloudBase导出；analytics-v2-report.js过滤wechat_release | Mongo数据需单独取数且报表需显式环境选择，否则数据存在但统计为空 |
| 社交 | CoopServiceMgr.ts有微信限制；PvpServiceMgr.ts使用业务PlatformCloudMgr | 独立埋点通道不启用这些服务；新增采集策略排除coop/pvp及回放字段 |
| 侧边栏 | DouyinSidebarModule.ts有功能/日志，未见AnalyticsMgr上报 | 侧边栏复访统计需要新触发点，不可把日志当成已采集事件 |

## 推荐首版范围（待用户批准实施）

先覆盖主线与公共页面。theme/external独立玩法不并入主线漏斗，首版可先暂缓采集其玩法事件；这项范围与合作/PVP暂停不同，需随本方案确认。

| 类别 | 沿用的关键事件/数据 | 可回答的问题与口径 |
|---|---|---|
| 启动/会话 | app_launch、game_start、startup_summary、startup_first_playable_ready、app_show/hide、app_resume/background | 启动人数、首次可玩耗时、会话/后台恢复；冷启动与前台恢复不能相加作局数 |
| 主线过程 | enter_level、level_interaction_ready、level_progress、level_pause_snapshot、level_resume | 进入→可玩、卡在哪关/哪个阶段；进入初始化不等于开始操作 |
| 终局 | level_pass、level_fail、level_failure_snapshot、level_exit_intent、saveLevelRecord | 通过、失败遭遇、终局pass/fail/abandon、复活后结果；一局可多次失败，按roundId关联 |
| 引导/扩容/道具 | guide_step_summary、guide_complete、guide_interrupted、capacity_eligibility/grant、既有道具结果 | 保留引导累计汇总，不上传每次触摸；现有弱引导/技能事件按实际触发登记白名单 |
| 广告/复活 | ad_click/show/finish/reward_success、rewarded_ad_load_start/success/fail、rewarded_ad_grant_failed/reward_success、revive_choice/success/declined、share_revive_success | 点击→展示→看完→实际到账，保留transactionId/failureId；多种同义事件规范到同一统计阶段，不能重复相加 |
| 结算衔接 | settlement_started/shown/action/gate_result/transition_start/transition_result/background、settlement_display_failed | 下一关/回首页点没点、加载成功没、是否真正可玩；失败和未决分列 |
| 故障/质量 | runtime_error/unhandled_rejection/memory_warning、remote_load_fatal_shown、previous_session_unclean_exit、analytics_quality | 技术错误、资源加载失败、队列失败；关卡失败不是程序错误，未正常退出不是已证实崩溃 |
| 抖音专属（少量新增） | 侧边栏引导调用结果、实际复访、领取奖励结果 | 建议命名douyin_sidebar_guide_result/return/reward_result，需从SDK实际结果与返回场景触发；不把点击引导认作复访成功 |

app/public公共事件与主线局事件分开；无法判断模式的记录显式列为unknown，不默认视为主线。合作/PVP局内广告和通用结算事件也排除，不能只屏蔽带coop/pvp前缀的名称。
广告曝光分母只覆盖已实现的实际曝光点（当前有前十关扩容入口）；不能用它推算所有广告位的曝光转化率。 SDK/平台自己的后台统计不由本次自建埋点替代。

## 客户端实施方案

1. 独立DouyinAnalyticsTransport：复用已验证tt.createCloud({envID,serviceID}).callContainer({path,init})形态，仅开放埋点身份与三类写入；业务DouyinCloudMgr、云存档、奖励发放和多人服务保持原状。
2. AnalyticsMgr抖音分支独立初始化身份，云端返回平台范围内稳定的subjectId用于队列归属。SDK登录用户ID与云网关账号不混用，不上传客户端自选身份作为可信依据。保留现有事件触发与局/事务关联。
3. 复用AnalyticsDelivery的持久化/重试；配置环境、存储key和传输函数。断网/超时维持同ID、同时间戳、同owner；换账号不重归属旧事件；未知owner跨账号边界不默认归新账号。批量缺确认不能清队列；格式错误等不可重试失败单独标记，不能无限阻塞正常事件或静默丢弃。
4. 同步隔离AnalyticsMeasurements、账号/局/会话检查点，恢复时检查owner/环境，避免dev数据进入正式包。保留现有队列上限、限量诊断与失败可观测性。
5. 采集策略用事件类别+真实模式上下文排除合作/PVP；服务端同样校验模式/字段，不接收回放/操作帧。不能通过开启业务云让旧回放恢复上传。保留入口不代表这些网络玩法已适配抖音。
6. CDN A/B槽仅记录资源来源，不等于实验组。首版不自动迁移微信实验分流，不编造assignment；已有合法实验字段可记录真实状态。

## 云函数与MongoDB

建议保留三类数据形状，减少报表重写：

| 集合（各环境独立数据库内） | 内容 | 幂等规则 |
|---|---|---|
| user_behavior | 启动、进入、通过、失败、广告等行为事实 | 服务端身份+eventId生成唯一_id |
| first_level_funnel | 启动/引导/进度/结算/错误明细与汇总 | 服务端身份+eventId生成唯一_id |
| level_record | 一局最终结算 | 服务端身份+roundId唯一；重复终局不重复新增，冲突显式失败 |
| analytics_users | 最小用户首次/末次观测时间，用于新用户与留存 | 服务端身份唯一；$min/$max更新，不因补传倒退 |

analytics_users是埋点用户索引，不是游戏存档。没有头像、金币、皮肤库存或回放。首次观测用户与平台注册新用户不同；历史数据未迁入前不能给出完整历史留存结论。
保留timestamp（事件发生）、receivedAt（服务收到）、sessionId、roundId、eventId、平台、环境、buildId、模式；时间单位统一毫秒，按Asia/Shanghai分日。
云端校验网关APP/AppID/env/账号与字段大小、事件白名单及模式，写入成功明确回执。不照搬微信函数对event.openid的回退；数据库保持私网。
建议身份函数analyticsIdentity，写入名称沿用addBehaviorData/addFunnelEvents/saveLevelRecord，部署在抖音服务；测试函数与测试集合保留用于dev验证，不扩成正式入口。
只创建查询确实需要的时间/用户时间索引及必要唯一索引。首版不照搬ad_stat/daily_stat的定时汇总，先从幂等原始记录生成报表；需要时再加物化汇总。不默认设置TTL删除历史数据。

## 测试与正式环境

- dev联调包显式启用douyin_dev；现有单条probe继续用douyin_dev_test，两者均不进入正式报表。
- 正式包只在确认抖音正式运行版本后采集douyin_release，未知/模拟器/预览默认关闭正式采集；不得把Cocos --release优化模式当作平台正式版本。
- 当前尚未核实抖音正式版本识别API/字段的最新官方语义及真机回包，实现前必须核对；不能直接假定微信envVersion=release等价。服务端环境/数据库与客户端环境选择都要匹配。
- 目前确认的只有env-nvk6FNcrq5的dev链路；正式服务ID/环境ID/数据库部署状态尚未核对。dev实现无需等待正式配置，正式启用时再由用户提供非秘密配置。

## 怎么看数据

近期：部署仅管理端可用的按日统计/核对函数，在函数控制台查看人数、事件数、每关进入/通过/失败、广告阶段、异常摘要，避免依赖当前页面未提供的数据浏览入口。
后续同轮报表适配：增加抖音管理端受控导出/查询通道，复用现有统计规则和tools/cloudbase-report.html展示；输出至独立artifacts/douyin-daily-report/<date>，增加显式数据源/环境选择。不能把全量数据导出接口授权给普通小游戏客户端。
现有日报的CloudBase取数、analytics-v2-report的wechat_release硬编码与页面REPORT_ROOT需适配；不能仅改标签或复制微信日报充数。先保证三类原始输入完整与截止时间一致，再展示完整日报。
查询通道不依赖数据库公网或用户新增备案域名。具体控制台支持的管理端导出方式须在实施时核实；若无自动导出能力，第一阶段交付控制台汇总而不承诺自动HTML日报。
报表按平台/环境/版本/玩法过滤，缺记录显示未知或数据不全。后台未回归且无终局保留未决，不算确定流失；次留需要跨日真实数据，不在首日验收中虚报。

## 修改文件边界

- 重点调整：assets/Scripts/Core/AnalyticsMgr.ts、CsdAnalyticsPolicy.ts、AnalyticsDelivery.ts、AnalyticsMeasurements.ts。
- 新增独立抖音埋点传输/配置和cloudfunctions-douyin内的Mongo接收/身份/管理查询代码。
- 少量补点：DouyinSidebarModule.ts及确有必要的SDK回调观察处；不改SDK奖励算法。启动/关卡/广告已有触发点优先复用。
- 报表：scripts/user-behavior-daily-job.js适配数据源或抽出共用处理；analytics-v2-report.js显式环境参数；daily-report-context与HTML数据根路径按需要最小调整。微信默认行为不变。
- 原则不改：云存档、奖励发放逻辑、合作/PVP玩法与回放结构、关卡资源、CDN、界面布局、微信云函数。对共有统计/队列改动必须回归微信。

## 分阶段交付与分工

1. 用户确认本方案范围后，助手先交付抖音真实事件接收器/独立客户端/测试；用户在dev新增函数、授权明确写入路径、发布。助手不要求用户提供密码。
2. 助手构建独立A槽dev实际埋点包；用户手机执行冷启动、1～4关引导、失败复活、广告取消/看完、下一关/回首页、后台恢复和弱网重启清单。
3. 助手给管理查询/统计工具并核对结果；用户在云控制台执行必要查询。验证能看真实数据，不只验证HTTP成功。
4. dev通过后确认正式环境配置，助手配置正式开关与正式包，用户完成后台部署/平台发布；单条诊断入口不进入正式包，诊断函数/数据清理另行明确执行范围。

## 验收

- 微信原有正式门槛、业务事件和日报不回归；抖音正式/预览/dev隔离。
- 同ID重复/并发、网络超时/部分批次成功/跨启动补传不重复计数，换账号不串账；无身份不伪造登录。
- 失败后复活再过关只有一份最终局记录；结算下一关和真正可玩分别统计。
- 广告取消不记看完/到账；重复与迟到回调不多记一笔；不修改发奖行为。
- 合作/PVP事件和回放在客户端/云端边界均不进入本次数据；公共事件不继承上一局模式。
- 数据库/报表按具体eventId/roundId对账；缺表/缺批次/无终局不显示假零值或假流失。
- 官方版本识别、抖音错误/内存回调支持情况、正式环境及管理端导出接口是待核查项，不当成已通过。
