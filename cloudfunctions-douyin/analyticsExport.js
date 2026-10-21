'use strict';
const common = require('./analyticsCommon');
module.exports = async function (params = {}, context) {
    if (!common.adminAllowed(context)) return common.adminFailure(context);
    const names = ['user_behavior', 'first_level_funnel', 'level_record'];
    if (!names.includes(params.collection) || typeof params.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(params.date)) return common.fail('INVALID_EXPORT');
    const start = Date.parse(params.date + 'T00:00:00+08:00');
    if (!Number.isFinite(start) || new Date(start + 28800000).toISOString().slice(0, 10) !== params.date) return common.fail('INVALID_DATE');
    const cutoff = params.capturedAt === undefined ? Date.now() : params.capturedAt;
    if (!Number.isSafeInteger(cutoff) || cutoff < start || cutoff > Date.now()) return common.fail('INVALID_CUTOFF');
    const filters = {};
    if (params.clientBuildId !== undefined) {
        if (typeof params.clientBuildId !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(params.clientBuildId)) return common.fail('INVALID_BUILD_ID');
        filters.clientBuildId = params.clientBuildId;
    }
    if (params.since !== undefined) {
        if (!Number.isSafeInteger(params.since) || params.since < start || params.since >= Math.min(start + 86400000, cutoff)) return common.fail('INVALID_SINCE');
        filters.since = params.since;
    }
    if (params.after && !/^[a-f0-9]{64}$/.test(params.after)) return common.fail('INVALID_CURSOR');
    try {
        const collection = (await common.database()).collection(params.collection);
        const match = { analyticsEnvironment: common.LABEL, appId: common.APP, envId: common.ENV,
            timestamp: { $gte: filters.since === undefined ? start : filters.since, $lt: Math.min(start + 86400000, cutoff) },
            receivedAt: { $lte: cutoff }, ...(filters.clientBuildId === undefined ? {} : { clientBuildId: filters.clientBuildId }) };
        const query = { ...match, ...(params.after ? { _id: { $gt: params.after } } : {}) };
        // Bound response size for the console as well as count; no database URI or raw platform IDs.
        const rows = await collection.find(query, { projection: { payloadHash: 0 }, maxTimeMS: 10000 }).sort({ _id: 1 }).limit(51).toArray();
        const records = rows.slice(0, 50);
        while (records.length > 1 && Buffer.byteLength(JSON.stringify(records)) > 160000) records.pop();
        const hasMore = rows.length > records.length;
        return common.reply({ ok: true, date: params.date, collection: params.collection, capturedAt: cutoff,
            ...filters,
            totalRecords: await collection.countDocuments(match, { maxTimeMS: 10000 }),
            after: params.after || '', nextCursor: hasMore ? records[records.length - 1]._id : '', hasMore, records });
    } catch (error) { return common.safeError(error); }
};
