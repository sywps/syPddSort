> 状态更新：第三关 ABC 版本起停止此实验。新客户端统一使用 A，历史分组保留，新记录标记 retired；旧预览参数不再切换实际玩法。以下为历史设计，当前方案见 third-level-experiment.md。

# 鼓励效果 A/B

实验 ID：`encouragement_ab_v1`。

- A：保留现有鼓励文字和六句女声；B：两者同时关闭。
- 只对主线第二关及以后生效。第一关、主题/外部关卡、对战和合作保持原有鼓励效果。
- 新微信用户按账号和独立实验 ID 做 SHA256 固定分组，各 50%；老用户保持 A。与首关内容和选豆独立分桶。
- 身份确认超时、缓存异常等明确排除，不混入正式 A；本次运行开局后不切换组别。
- 保留颜色完成提示音 winColor、归位音、背景音乐及其他特效，遵守原有静音设置。

## 本地试玩

`?level=2&encourage=A` / `?level=2&encourage=B`。

可叠加 `pick=A` 或 `pick=B`，例如 `?level=2&pick=B&encourage=B`。
手动参数仅用于浏览器预览；正式微信分组取云端回执。测试账号不作为正式实验样本。

## 埋点范围

现有行为、关卡结束和漏斗记录附加：encouragementExperimentId、encouragementExperimentStatus、encouragementExperimentBucket、encouragementEnrolledAt、encouragementExperimentReason。

仅保留分组确认事件 encouragement_experiment_assignment；不新增鼓励曝光事件，不记录触发次数、文字次数或语音次数。分析复用现有主线第二关及以后的进关、通关和退出记录及 roundId，按三个实验字段分组。此次未增加单独的鼓励实验看板。

## 上线

需要更新 getOpenid（含 encouragement-experiment.js）、addBehaviorData、saveLevelRecord、addFunnelEvents，并发布新版客户端。漏斗 extra 上限从 35 增至 40，为五个新字段保留空间。

源码和本地测试完成不代表已部署、已发布或已通过微信真机联网验收。本轮不进行云端部署、客户端发布、提交或推送。
