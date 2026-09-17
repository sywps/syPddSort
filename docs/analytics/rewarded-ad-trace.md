# 广告结果对账与第3关免费扩容防连点

## 本次范围

2026-09-15 实施广告诊断与时序保护、免费扩容防连点。保留现有场景、扩容文字、美术、热区和关卡参数。不部署云函数，不提交或推送。

### 广告结果

- 原生展示成功仍由 `show()` 成功通知决定，只有明确 `verified_complete` 才进入奖励流程。
- 前台先返回、关闭回调尚未到达时，1秒后提示“仍在确认”，保留当前请求的监听，不再自动取消为 unknown。
- 用户重试、离开或销毁场景时按原有生命周期取消；旧请求回调不能为新请求发奖。等待期间释放游戏交互锁，不自动重试或自动发奖。
- 奖励成功仅在奖励函数成功之后记录；失败、异常、超时、取消分别记录。后续表现失败与奖励本身失败区分。

### 第3关免费扩容

- 免费成功后保留已有反馈，扩容广告入口保护800毫秒，不锁住存豆操作。
- 保护期开始前或期间开始的触摸，即使稍后松手，也不能触发广告。
- 保护期后必须新的 `TOUCH_START` 与同ID的 `TOUCH_END`；重复结束、不同手指、取消及前后台切换会清除待处理手势。
- 重开关卡重置保护状态并按原逻辑展示免费引导；同一局后台返回保留容量，不重复赠送。

## 埋点

复用 `first_level_funnel` 队列和现有 `addFunnelEvents` 的 extra 字段，不创建集合。终态会请求立即冲刷现有队列；仍是已有的内存队列，崩溃前未上传的事件无法保证留存。

事件的 `source=rewarded_ad_transaction`。快照字段包含 `levelId/page/roundId/clientBuildId/adTransactionId/triggerSource/gameplayEntryMode`，已建立原生尝试的阶段带 `attemptId`。

| 事件 | 含义 |
|---|---|
| rewarded_ad_request | 请求及当时库存状态 |
| rewarded_ad_show | 原生展示成功 |
| rewarded_ad_close | 关闭回调；hasIsEnded区分缺失，isEnded仅在确有布尔值时上报 |
| rewarded_ad_outcome | 最终状态、原因及可用的错误码 |
| rewarded_ad_recoverable | 前台返回但关闭结果尚未到达 |
| rewarded_ad_wait_pending | 1秒后仍待确认，不是取消或失败终态 |
| rewarded_ad_cancel | 用户重试/离开/销毁等取消原因 |
| rewarded_ad_grant_start | 已确认看完，开始发奖 |
| rewarded_ad_reward_success | 奖励执行成功 |
| rewarded_ad_grant_failed | 发奖返回false、异常或超时 |
| rewarded_ad_after_grant_failed | 奖励后的表现/流程失败 |

原 `ad_click/show/finish/reward_success` 保留，不能与新事件相加计数。旧客户端不会补出缺失字段；本地云函数字段保留已用动态测试核实，未验证线上部署版本。

## 对账命令

```powershell
node scripts/rewarded-ad-audit.js <user_behavior的NDJSON文件> <first_level_funnel的NDJSON文件> <输出JSON文件> 3
```

工具按用户、事务ID分组，并按尝试ID分开回调与奖励。输出含阶段时间线、字段覆盖、重复上传去重，以及缺少终态/奖励证据的提示。不会用时间相近猜测匹配；缺少奖励证据不代表实际未发奖。旧replenish结果保留为legacy_outcome，不当作完整新链路。

使用9月14日导出验证：行为广告260条只有16条可按事务关联；旧回调诊断97条中91条可关联。历史数据不能完整复原。

## 验证

已执行：

- `node tests/rewarded-grant-transaction.test.js`：晚到成功、重复/取消/重试、明确未完成、缺失结果、发奖失败；同时执行现有云函数序列化并送入对账工具。
- `node tests/rewarded-ad-runtime.test.js`：原生Provider模拟的关闭、前台先到、延迟关闭及旧实例回调。
- `node tests/rewarded-ad-mode.test.js`：正式真机不启用mock奖励。
- `node tests/pch-capacity-ad-gesture.test.js`：生产处理函数中的100/200/500毫秒连点、按住松手、多指、重复结束、后台返回与重开引导。
- `node tests/rewarded-ad-audit.test.js`：精确关联、去重、历史缺字段与跨来源不重复计数。
- 正式 assets 源码定向 TypeScript 检查（ES2020/DOM，使用现有Cocos声明）通过。

项目默认类型检查会包含output中的旧调试备份，另有旧lib配置限制，未修改项目配置。`pch-level2-capacity-guide.test.js` 的首关文案断言在修改前快照同样失败，未改变既有文案或该断言。

未完成的设备验收：微信真机正常看完/提前关闭/前台先于close/断网/重试；真实进程崩溃冷启动；免费后连续触摸。上述模拟测试不替代真机，也不证明线上数据指标已改善。
