'use strict';
const common = require('./analyticsCommon');
module.exports = async function (params = {}, context) {
    if (!common.adminAllowed(context)) return common.adminFailure(context);
    const date = params.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return common.fail('DATE_REQUIRED');
    const start = Date.parse(date + 'T00:00:00+08:00');
    if (!Number.isFinite(start) || new Date(start + 28800000).toISOString().slice(0, 10) !== date) return common.fail('INVALID_DATE');
    const capturedAt = Date.now(), end = Math.min(start + 86400000, capturedAt);
    if (end <= start) return common.fail('DATE_IN_FUTURE');
    try {
        const db = await common.database();
        const match = { analyticsEnvironment: common.LABEL, appId: common.APP, envId: common.ENV,
            timestamp: { $gte: start, $lt: end }, receivedAt: { $lte: capturedAt } };
        const aggregate = (name, group) => db.collection(name).aggregate([
            { $match: match }, { $group: group }, { $sort: { count: -1, _id: 1 } }, { $limit: 300 }
        ], { maxTimeMS: 10000 }).toArray();
        const behavior = await aggregate('user_behavior', { _id: '$eventName', count: { $sum: 1 } });
        const funnel = await aggregate('first_level_funnel', { _id: '$eventName', count: { $sum: 1 } });
        const terminals = await aggregate('level_record', { _id: { gameplayEntryMode: '$gameplayEntryMode', levelId: '$logicalLevelId', endReason: '$endReason' }, count: { $sum: 1 } });
        const funnelByMode = await aggregate('first_level_funnel', { _id: { gameplayEntryMode: '$gameplayEntryMode', eventName: '$eventName' }, count: { $sum: 1 } });
        const active = await db.collection('user_behavior').aggregate([
            { $match: match }, { $group: { _id: '$subjectId' } }, { $count: 'count' }
        ], { maxTimeMS: 10000 }).toArray();
        const newUsers = await db.collection('analytics_users').countDocuments({ analyticsEnvironment: common.LABEL,
            firstSeenAt: { $gte: start, $lt: end } }, { maxTimeMS: 10000 });
        return common.reply({ ok: true, date, timezone: 'Asia/Shanghai', capturedAt, dataCutoff: end,
            telemetryScopeVersion: common.TELEMETRY_SCOPE_VERSION, acceptedGameplayModes: common.GAMEPLAY_MODES,
            replayUploadEnabled: false,
            windowStatus: end < start + 86400000 ? 'partial' : 'complete',
            activeObservedUsers: active[0] ? active[0].count : 0, firstObservedUsers: newUsers,
            behaviorEvents: behavior, funnelEvents: funnel, terminalOutcomes: terminals,
            funnelEventsByMode: funnelByMode,
            limitPerGroup: 300, truncated: [behavior, funnel, terminals, funnelByMode].some(rows => rows.length === 300),
            note: (common.LABEL === 'douyin_dev' ? 'DEV数据；' : 'PROD环境数据；') + '主线/合作/PVP分别统计，三类事件不能相加作局数。multiplayer_round_end是本地结果观察，不代表云端结算；失败遭遇不同于最终失败，未决不等于流失。完整明细请导出后运行本地报表。' });
    } catch (error) { return common.safeError(error); }
};
