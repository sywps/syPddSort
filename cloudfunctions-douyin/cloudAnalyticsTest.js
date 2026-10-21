'use strict';

// Copy this file to the ROOT of the existing Douyin dev function service.
// Requires mongodb 4.17.2. Only the platform gateway context supplies identity.
const crypto = require('crypto');
const APP_ID = 'ttf45082ed6a36c15802';
const ENV_ID = 'env-nvk6FNcrq5';
const COLLECTION = 'analytics_events_dev';
let connection = null;

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const failure = reason => ({ ok: false, reason });

async function database() {
    if (!connection) {
        connection = (async () => {
            const { MongoClient } = require('mongodb');
            const client = new MongoClient(process.env.MONGODB_URI, {
                serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000,
                socketTimeoutMS: 8000, maxPoolSize: 5
            });
            try {
                await client.connect();
                return client.db(process.env.MONGODB_DB);
            } catch (error) {
                await client.close().catch(() => {});
                throw error;
            }
        })().catch(error => { connection = null; throw error; });
    }
    return connection;
}

module.exports = async function cloudAnalyticsTest(params, context) {
    if (process.env.CLOUD_ENV !== 'DEV') return failure('DEV_ONLY');
    const headers = context && context.headers;
    if (!headers || context.trigger !== 'online' || headers['x-tt-source'] !== 'APP') {
        return failure('APP_GATEWAY_REQUIRED');
    }
    if (headers['x-tt-appid'] !== APP_ID) return failure('APP_MISMATCH');
    if (headers['x-tt-envid'] !== ENV_ID) return failure('ENV_MISMATCH');
    const openid = headers['x-tt-openid'];
    if (typeof openid !== 'string' || !openid.trim() || openid.length > 256) {
        return failure('OPENID_MISSING');
    }
    // No arbitrary properties, client identity, replay data, or business events.
    const keys = ['schemaVersion', 'eventName', 'eventId', 'clientTimestamp', 'platform', 'cdnSlot'];
    if (!params || typeof params !== 'object' || Array.isArray(params) ||
        Object.keys(params).length !== keys.length || Object.keys(params).some(key => !keys.includes(key)) ||
        params.schemaVersion !== 1 || params.eventName !== 'analytics_dev_probe' ||
        typeof params.eventId !== 'string' || !/^probe-[a-zA-Z0-9_-]{16,96}$/.test(params.eventId) ||
        !Number.isSafeInteger(params.clientTimestamp) || params.clientTimestamp <= 0 ||
        !['ios', 'android'].includes(params.platform) || params.cdnSlot !== 'A') {
        return failure('INVALID_EVENT');
    }
    if (!process.env.MONGODB_URI || !process.env.MONGODB_DB || !process.env.MONGODB_DB.trim()) {
        return failure('DATABASE_CONFIG_MISSING');
    }
    const subjectId = hash([ENV_ID, APP_ID, openid]);
    const event = {
        schemaVersion: 1, eventName: params.eventName, eventId: params.eventId,
        clientTimestamp: params.clientTimestamp, platform: params.platform, cdnSlot: 'A'
    };
    const payloadHash = hash(event);
    const _id = hash([ENV_ID, APP_ID, subjectId, event.eventId]);
    const record = {
        _id, ...event, subjectId, appId: APP_ID, envId: ENV_ID,
        analyticsEnvironment: 'douyin_dev_test', payloadHash, receivedAt: new Date()
    };
    let stage = 'connect';
    try {
        const collection = (await database()).collection(COLLECTION);
        stage = 'write';
        let duplicate;
        try {
            const result = await collection.updateOne({ _id }, { $setOnInsert: record }, {
                upsert: true, writeConcern: { w: 'majority', wtimeout: 5000 }
            });
            if (!result.acknowledged || !(
                (result.upsertedCount === 1 && result.matchedCount === 0) ||
                (result.upsertedCount === 0 && result.matchedCount === 1)
            )) return failure('WRITE_NOT_ACKNOWLEDGED');
            duplicate = result.upsertedCount === 0;
        } catch (error) {
            // Concurrent upserts can race. Only accept after verifying the stored document.
            if (!error || error.code !== 11000) throw error;
            duplicate = true;
        }
        stage = 'read';
        const stored = await collection.findOne({ _id }, { readPreference: 'primary', maxTimeMS: 5000 });
        if (!stored) return failure('READ_BACK_FAILED');
        if (stored.payloadHash !== payloadHash || stored.subjectId !== subjectId ||
            stored.analyticsEnvironment !== 'douyin_dev_test' ||
            stored.appId !== APP_ID || stored.envId !== ENV_ID ||
            keys.some(key => stored[key] !== event[key])) return failure('EVENT_ID_CONFLICT');
        return {
            ok: true, reason: 'EVENT_STORED', eventId: event.eventId,
            writeAcknowledged: true, readBack: true, duplicate,
            collection: COLLECTION, analyticsEnvironment: 'douyin_dev_test'
        };
    } catch (error) {
        // Never return/log the URI, password, raw platform identity or driver message.
        const result = { ok: false, reason: 'DATABASE_FAILED', stage };
        if (error && Number.isInteger(error.code)) result.errorCode = error.code;
        console.error('[CloudAnalyticsTest]', JSON.stringify(result));
        return result;
    }
};
