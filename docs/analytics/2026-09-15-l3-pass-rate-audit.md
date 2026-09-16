# 第三关通关率审计：2026-09-14

## 结论

有统计与埋点缺陷，但未发现这些缺陷足以把高通关率误算成17%左右的证据。现在不能将低经营通关率等同于关卡本体太难，也不能用只包含最终结算的高比例替换进入用户口径。

只读查询于北京时间2026-09-15 00:30:58完成，查询窗口为9月14日完整自然日。独立按不重叠时间区间切分请求，每页不足1000，核验记录ID唯一。没有改动原日报、客户端、云函数或线上数据。匿名结果：`.planning/session-plans/20260915-l3-audit/live-summary.json`。

## 核对结果（数据已证实）

| 口径 | 进入UV | 通过UV | 比例 |
| --- | ---: | ---: | ---: |
| 昨晚报表，混合主线与主题L3 | 296 | 53 | 17.91% |
| 昨晚快照，仅main | 295 | 52 | 17.63% |
| 云端重查全天，仅main | 297 | 53 | 17.85% |

全天main进入事件345条、失败事件47条/38UV、成功事件53条/53UV。关卡记录表中main成功53条/53UV，失败结束27条，放弃12条/8UV。成功用户在两张表一致，没有仅在记录表成功却无行为通关事件的用户；未通关用户中无人于同日进入main L4。297名进入者均有L3 interaction_ready。

main最终成功或失败结束记录比例为53/(53+27)=66.25%；它排除未结算者、放弃记录，且不等于全部尝试通关率。47个失败事件与27个失败结束记录也说明不能直接将结束记录当作完整尝试流。需要attempt ID才能闭合核算。

以上一致性不能排除两种成功上报同时失败或跨日完成；没有真机复现，也未完成9月15日回访/跨日补结算追踪。

## 已确定的统计或可观测性问题（静态代码证据）

1. 主线表按levelId聚合，不过滤gameplayEntryMode。证据：`/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/scripts/user-behavior-daily-job.js:1541`及`:1570`。本快照theme L3只有1进入/1成功，剥离后比例反而略低，不是主要原因。
2. 无失败未通过人数用“进入UV－通过UV－全部失败UV”计算。证据：`/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/scripts/user-behavior-daily-job.js:2848`。有5名用户先失败后成功，旧快照显示205，集合差正确为210；全天main为211。此错误低估无失败未通关，不影响pass/enter。
3. 第三关不在通用首关漏斗开关范围。证据：`/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/GameCtrlModules/PlayerMetaStateModule.ts:971`仅启用L1/L2；`/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts:66`据此返回；胜利调用在`/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts:722`。L3可以有PCH专用操作事件但没有同表level_pass，不能据此判定实际零通关。
4. 通关行为和结算上报缺少持久重试及共同attempt ID。证据：`/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/AnalyticsMgr.ts:355`失败返回skipped；`:683`发起成功事件与结算；`:1067`提前finalized且失败后清空会话；`/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/WxCloudMgr.ts:94`为一次调用。云端正常返回ok:false也没有在这两条调用链中可靠重试。是漏报风险，不是已证实本次大量漏报。
5. 昨晚首关漏斗原始导出16条完全重复ID已去重；本次本地L3 dedupeKey无重复，云端独立分片也通过ID唯一校验。UV不能因同一用户重复点击被直接放大。

## 用户实际走到哪里（全天main进入用户范围）

| 阶段 | UV | 占进入UV |
| --- | ---: | ---: |
| 可交互就绪 | 297 | 100% |
| 免费扩容引导完成 | 257 | 86.53% |
| 首次存入 | 238 | 80.13% |
| 首次归位 | 233 | 78.45% |
| 当日通关 | 53 | 17.85% |

这些是同一进入人群内的事件覆盖，不是按逐次尝试严格排序的漏斗。它足以反驳“大多数L3进入者完全没操作”，但不能定位后续退出的唯一原因。

引导miss_target覆盖210人/1160次，成功免费扩容257人/300次；两类人群重叠，不可相加或等同于流失。免费扩容实现见`/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/PchConveyorGameplayController.ts:3367`，不是必须先看广告。

## 值得验证的交互信号，不作因果结论

昨晚快照main扩容广告82点击、80展示、12完成，展示完成比15%；64名展示用户仅11名有完成。33名用户有L3广告等待取消事件（全天进入人群）。普通扩容入口和免费教学入口是两条不同路径，普通入口在`/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/PchConveyorGameplayController.ts:3516`。

广告完成埋点仅在verified_complete时触发，见`/Users/shengyemac80-202504/claude/pddsort/game-pdd-v2/assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts:443`。需拆分用户提前关闭、广告等待/恢复、校验失败、回调缺失与上报失败，不能把15%全部归因为用户关闭。app_hide也可能由广告触发，不等于主动退出或崩溃。

## 最小建议（未实施）

1. 修报表：按玩法+逻辑关卡分组；无失败未通过采用集合差；同时显示经营UV率、最终结算率、未结算人数。补针对先失败后成功和跨玩法同ID的回归测试。
2. 补L3可观测性：局部补L3终点及attempt ID，而非盲目扩大所有L1诊断日志；持久化重试采用幂等事件ID。以弱网、广告返回、杀进程后恢复验证不丢不重。
3. 优先复测免费扩容结束到正常操作/再次扩容广告的链路，采集净操作时间、容量占用、广告终态和退出原因；确认前不直接增加容量或延长时间。

本地代码可能与线上发布版本不同。功能因果仍需对应版本真机复现；以上未改变线上难度。
