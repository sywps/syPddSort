'use strict';

// Temporary DEV console query. Do not add an authorized external access path.
// Reads only the fixed event from the phone screenshot; ignores request parameters.
module.exports = async function cloudAnalyticsVerify(params, context) {
    if (process.env.CLOUD_ENV !== 'DEV') return { ok: false, reason: 'DEV_ONLY' };
    if (context && context.trigger === 'online') return { ok: false, reason: 'CONSOLE_ONLY' };
    if (!process.env.MONGODB_URI || !process.env.MONGODB_DB) {
        return { ok: false, reason: 'DATABASE_CONFIG_MISSING' };
    }
    const eventId = 'probe-mv1vt9ba-6fhj8bx3y430-tsxitt6152k0';
    let client;
    try {
        const { MongoClient } = require('mongodb');
        client = new MongoClient(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000,
            socketTimeoutMS: 8000, maxPoolSize: 1
        });
        await client.connect();
        const collection = client.db(process.env.MONGODB_DB).collection('analytics_events_dev');
        const filter = { eventId, appId: 'ttf45082ed6a36c15802', envId: 'env-nvk6FNcrq5' };
        const count = await collection.countDocuments(filter, { maxTimeMS: 5000, readPreference: 'primary' });
        const row = await collection.findOne(filter, {
            maxTimeMS: 5000, readPreference: 'primary',
            projection: { _id: 0, eventName: 1, analyticsEnvironment: 1, cdnSlot: 1, schemaVersion: 1 }
        });
        const fieldsMatch = !!row && row.eventName === 'analytics_dev_probe' &&
            row.analyticsEnvironment === 'douyin_dev_test' && row.cdnSlot === 'A' && row.schemaVersion === 1;
        return {
            ok: count === 1 && fieldsMatch,
            reason: count === 0 ? 'EVENT_NOT_FOUND' : count !== 1 ? 'RECORD_COUNT_MISMATCH' :
                fieldsMatch ? 'VERIFY_OK' : 'EVENT_FIELDS_MISMATCH',
            eventId, matchingRecordCount: count, fieldsMatch
        };
    } catch (error) {
        const result = { ok: false, reason: 'DATABASE_QUERY_FAILED' };
        if (error && Number.isInteger(error.code)) result.errorCode = error.code;
        return result;
    } finally {
        if (client) await client.close().catch(() => console.error('[CloudAnalyticsVerify] CONNECTION_CLOSE_FAILED'));
    }
};
