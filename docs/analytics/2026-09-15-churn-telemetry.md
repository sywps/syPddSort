# 流失诊断补点 v1

## 范围与上线边界

本次仅补本地客户端低频诊断，复用 AnalyticsMgr.trackFunnelEvent → addFunnelEvents → first_level_funnel。没有构建、发布或云端写入。新版本实际发布后才会产生新事件，不能补回历史缺失。

覆盖主线与普通像素拼图的初始化、结算、下一关及失败面板操作；合作与排位PvP主动排除，不与主线同ID混算。不是完整崩溃检测系统，不包含所有返回首页入口。

## 新事件

统一 eventName=gameplay_flow，source=churn_diagnostic_v1，stepName区分阶段。

| stepName | 触发条件 | 分析含义 |
|---|---|---|
| initializing | 关卡路由上下文已设置，模型构建前 | 初始化已开始，不等于最早资源请求 |
| ready | 初始化到达交互阶段 | 程序到达就绪点；不证明无透明遮挡或用户已操作 |
| init_failed | 初始化失败处理入口 | errorCode包含失败阶段；结合已有gameplay_init_failed查细节 |
| result_shown | 通关结算面板激活及布置完成 | 不是仅创建节点；不保证真机首帧已绘制 |
| result_failed | 标准或基础结算展示失败 | 分开win_panel_reveal_failed/basic_panel_reveal_failed |
| result_shown_basic | 降级基础结算调用成功返回 | 标准面板失败后仍提供了操作界面 |
| next_click | 下一关按钮业务回调到达 | 非原始触摸PV；按钮禁用时的点击可能不进入回调 |
| next_accepted | 通过原有切换互斥判断 | 开始一次新的transitionId |
| next_blocked | 切换繁忙或补体力后仍不足 | transition_busy/vigor_still_insufficient |
| next_route_requested | 调用下一关入口之前 | 是请求调度，不证明资源已开始加载；主题入口内部可能等待体力 |
| next_waiting | 进入无体力救助面板 | vigor_required；不是加载失败 |
| next_vigor_result | 救助面板返回 | granted才成功；not_granted不能简单认定主动取消或广告失败 |
| next_failed | 同步切换异常或主题启动失败 | transition_exception/theme_start_failed；原异常处理不变 |
| next_interrupted | 回调runtime失效、场景改变或就绪目标不匹配 | 不应计入目标关就绪；映射/特殊路由也可能触发 |
| next_ready | 同一runtime、对应目标和玩法到达ready | 连接上一关尝试与下一关尝试 |
| next_ended | 主题序列没有下一关 | theme_sequence_end；正常内容结束，不是故障 |
| restart_click | 重试业务入口到达 | 意愿信号，不证明重试成功 |
| revive_decline_click | 关闭复活面板进入失败面板 | 仅暂不复活，不等于退出游戏 |
| home_click | 失败结算主动返回首页 | 其他首页入口和系统退出不在本事件覆盖内 |

## 关联字段与计算

- 现有顶层sessionId、eventSeq、timestamp、logicalLevelId、physicalLevelId和AB字段继续使用。
- extra含attemptId、transitionId、fromAttemptId、targetLevel、entryMode、initSeq、dataVersion、guideStep、timeRemain、isGameEnd、touchAttempts。
- attemptId在本次初始化时生成；transitionId在被接受的下一关操作生成，不能跨重启补链。与用户和sessionId联合关联，不单独作为全局唯一ID。
- touchAttempts来自既有输入诊断计数，其原有限定仍存在，不代表全关卡的原始触摸次数。
- duration为切换发起到事件的墙钟毫秒，包含广告和后台等待，不是净操作时长。
- success仅描述该阶段是否带诊断原因，不等于通关结果。next_waiting的false不是技术故障。
- AnalyticsMgr的所有漏斗事件补入规范化gameplayEntryMode，避免新增事件缺少玩法上下文；新事件仍以自身entryMode与逻辑/物理关卡复核。
- 云端目前生成dedupeKey但不能假定数据库已强去重；分析先按用户/sessionId/eventSeq去重。新增诊断不额外写user_behavior，留存口径不变。

建议按日期、客户端版本、渠道、玩法统计独立用户：

1. initializing未ready：结合原有资源加载失败、初始化错误与前后台事件；不能直接标为崩溃。
2. ready无首次有效存入：前3关联合原有interaction_touch_attempt、pch_guide_tap_result、pch_first_store_success判断。后续关卡有效操作覆盖不足时写数据不可得。
3. 通关未result_shown/result_shown_basic：检查result_failed与通关后的表现/动画链路。
4. next_accepted未next_ready：按transitionId匹配，单列体力等待、错误、路由中断、主题结束和原因不明。观察尚未结束的切换不提前算流失。
5. result_shown无next_click：只能称未观察到继续意愿，不直接称不想玩。
6. home_click：可确认此次主动返回；后续是否回访另算D1/D2/D3/D7。

## 已有事件与未覆盖边界

继续复用运行错误、未处理拒绝、内存告警、app_hide/app_show、previous_session_unclean_exit，以及加载/引导事件；这些不是崩溃证明。

未新增逐帧心跳、高频点击全量上传或自动超时判流失。所有阶段都走原队列，极端崩溃/杀进程/离线仍会丢失尚未上传事件。未改队列持久化和服务端去重，不声称已解决投递可靠性。

当前日报不会自动将新事件渲染为原因分类图；先在新版采集后核对事件覆盖，再做归因看板，不能展示没有证据的原因比例。

## 验证与回滚

新增测试执行真实诊断模块和抽取的真实切换方法：验证尝试/切换关联、模式改变、重复点击、体力拒绝、同步异常保持、埋点异常不阻塞玩法。

本地13项相关测试通过，新增字段通过实际云端normalizeEvent函数校验，7个修改源码通过语法转译检查（非完整引擎类型检查）。3项既有回归失败：gameplay-init-failure、buffer-full-final-revive-e2e缺少validateAutoConveyorFinishSpeed测试模拟；gameplay-input-recovery的旧奖励交互断言失败。只读换用git HEAD源码后同样失败，不能宣称全套测试通过。未进行Creator预览或真机验收。

真机验收：主线L1→L2、普通主线、主题下一关、无体力拒绝与补充、正常和基础结算、关闭复活/返回、切后台恢复、加载失败。核对同次操作的eventSeq去重和transitionId，不能将同一点击重发当作多人。

回滚仅撤销本次诊断调用、模块、状态字段和新extra字段；保留其他未提交修改。事件增量与卡顿若异常，暂停新版放量，回退到原客户端；不能靠删用户或补零掩盖问题。
