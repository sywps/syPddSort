# 倒计时消耗统计 v1

在现有 saveLevelRecord 的通关、最终失败、主动退出记录中附加字段，不新增事件：

- countdownTimingVersion=1：新计时口径。旧记录没有该字段，不能按0秒处理。
- countdownTimingApplicable：是否有限时。第一关和其他不限时玩法为false，不参与倒计时耗时平均。
- countdownConsumedSeconds：本局实际扣除的倒计时秒数。tickTimer真正扣秒才累加，暂停、广告、后台、冻结及引导停表不累计。计时精度跟随游戏每秒tick，不是毫秒级墙钟时长。
- reviveCount：成功继续游戏次数，包括满容量0秒复活。不在广告开始或奖励请求时计数。
- addedTimeSeconds：本局实际赠送的倒计时秒数。复活不清零累计值，重新开局才清零。

统计“全部通关倒计时耗时”：passStatus=true、version=1、applicable=true，求countdownConsumedSeconds均值/中位数；“无复活无加时”再限定reviveCount=0且addedTimeSeconds=0。这不等于无道具通关：冻结、磁铁等仍可能影响结果。startTime/endTime仍保留作为总经过时间。

没有成功上报终局的崩溃/强杀对局不冒充完整计时。旧数据无法补回。需要部署saveLevelRecord并发布新客户端后才开始积累；本次未部署或发布，也未改历史数据或报表旧均值口径。
