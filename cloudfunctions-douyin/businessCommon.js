'use strict';
const crypto = require('crypto');
const authorizeAdmin = require('./adminAuth');
const rules = require('./businessRules');
const chapterSync = require('./chapterRewardSync');
// The same dev-published artifact is promoted to prod; only the platform selects its environment.
const IS_PROD = process.env.CLOUD_ENV === 'PROD';
const ENV = IS_PROD ? 'env-XzE6JatzwX' : 'env-nvk6FNcrq5';
const APP = 'ttf45082ed6a36c15802', LABEL = IS_PROD ? 'douyin_release' : 'douyin_dev';
const PROD_DATABASE = 'pdd_douyin_prod';
const COLLECTIONS = { profiles: 'douyin_user_profile', requests: 'douyin_profile_requests', meta: 'douyin_business_meta' };
const TX_OPTIONS = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', wtimeout: 5000 }, readPreference: 'primary', maxCommitTimeMS: 5000 };
const ACTIONS = new Set(['profileGet', 'profileSelect', 'profileSeen', 'profileBuy', 'profileAdBegin', 'profileAdClaim', 'profileChapterClaim']);
const reply = value => ({ ...value, businessEnvironment: LABEL, businessSchemaVersion: 1 });
const failure = (code, message) => Object.assign(Error(message || code), { businessCode: code });
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
let connection;
function configured() {
    return process.env.CLOUD_ENV === (IS_PROD ? 'PROD' : 'DEV') && process.env.BUSINESS_ENVIRONMENT === LABEL &&
        !!process.env.MONGODB_URI && !!process.env.MONGODB_DB &&
        (IS_PROD ? process.env.MONGODB_DB === PROD_DATABASE : process.env.MONGODB_DB !== PROD_DATABASE);
}
function requireConfig() { if (!configured()) throw failure('CONFIG_NOT_READY', '业务云配置未就绪'); }
function identity(context) {
    requireConfig();
    const h = context && context.headers;
    if (!h || context.trigger !== 'online' || h['x-tt-source'] !== 'APP' || h['x-tt-appid'] !== APP || h['x-tt-envid'] !== ENV ||
        typeof h['x-tt-openid'] !== 'string' || !h['x-tt-openid'].trim() || h['x-tt-openid'].length > 256) {
        throw failure('IDENTITY_REQUIRED', '请从抖音游戏登录后重试');
    }
    return hash([ENV, APP, h['x-tt-openid']]);
}
function adminAllowed(context) {
    return authorizeAdmin(context, process.env);
}
function adminFailure(context) { return reply(authorizeAdmin.failure(context, process.env)); }
async function database() {
    requireConfig();
    if (!connection) connection = (async () => {
        const { MongoClient } = require('mongodb');
        const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 10000, maxPoolSize: 5 });
        try { await client.connect(); return { client, db: client.db(process.env.MONGODB_DB) }; }
        catch (error) { await client.close().catch(() => {}); throw error; }
    })().catch(error => { connection = null; throw error; });
    return connection;
}
function safeError(error) {
    const unsupportedTransactions = error && (error.code === 20 || error.code === 303) && /transaction|replica set|mongos/i.test(error.message || '');
    const code = error && error.businessCode || (unsupportedTransactions ? 'TRANSACTIONS_UNAVAILABLE' : 'DATABASE_FAILED');
    console.error('[DouyinBusiness]', code);
    return reply({ ok: false, errorCode: code, errorMessage: error && error.businessCode ? error.message :
        unsupportedTransactions ? '当前数据库不支持所需事务，请检查 MongoDB 副本集配置' : '业务云读写失败，请稍后重试',
        ...(Number.isSafeInteger(error && error.code) ? { databaseErrorCode: error.code } : {}) });
}
function validate(value, depth = 0) {
    if (depth > 6) throw failure('INVALID_REQUEST', '请求结构无效');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return;
    if (typeof value === 'string' && value.length <= 2048) return;
    if (Array.isArray(value) && value.length <= 1000) { value.forEach(v => validate(v, depth + 1)); return; }
    if (value && typeof value === 'object' && Object.keys(value).length <= 200) {
        for (const [key, v] of Object.entries(value)) {
            if (!/^[a-zA-Z0-9_]+$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw failure('INVALID_REQUEST', '请求字段无效');
            validate(v, depth + 1);
        }
        return;
    }
    throw failure('INVALID_REQUEST', '请求内容无效');
}
function validateRequest(name, params) {
    if (!params || Array.isArray(params) || typeof params !== 'object' || Buffer.byteLength(JSON.stringify(params)) > 65536) throw failure('INVALID_REQUEST', '请求内容无效');
    validate(params);
    const keys = name === 'syncUserState' ? ['action', 'profile', 'gameState', 'expectedOwner'] :
        ['action', 'itemId', 'avatarSource', 'revision', 'requestId', 'pvpEconomyRevision', 'seenItemIds', 'expectedOwner'];
    if (Object.keys(params).some(key => !keys.includes(key))) throw failure('INVALID_REQUEST', '不支持的请求字段');
    if (name === 'syncUserState') {
        if (!['get', 'save'].includes(params.action)) throw failure('INVALID_ACTION', '不支持的存档操作');
        for (const key of ['profile', 'gameState']) if (params[key] !== undefined && (!params[key] || Array.isArray(params[key]) || typeof params[key] !== 'object')) throw failure('INVALID_REQUEST', '存档结构无效');
        for (const [value, numeric, arrays] of [
            [params.profile, ['version', 'createdAt', 'lastActiveAt', 'loginCount', 'lastLevelId'], []],
            [params.gameState, ['savedLevel', 'vigor', 'vigorTime', 'gold', 'expandSlotCount', 'magicWandCount', 'freezeCount', 'brushCount', 'magnetCount', 'stateUpdatedAt', 'pvpEconomyRevision', 'wechatGiftProtocol', 'equippedBackgroundSkinId', 'equippedBackgroundSkinUpdatedAt', 'backgroundSkinResetVersion', 'equippedBeanSkinId', 'equippedBeanSkinUpdatedAt'],
                ['themeUnlockedIds', 'themeCompletedIds', 'ownedBackgroundSkinIds', 'backgroundSkinOwnedIds', 'ownedBeanSkinIds']]
        ]) {
            if (!value) continue;
            for (const key of numeric) if (value[key] !== undefined && !Number.isSafeInteger(value[key])) throw failure('INVALID_REQUEST', '存档数字格式错误');
            for (const key of arrays) if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key].some(v => !Number.isSafeInteger(v)))) throw failure('INVALID_REQUEST', '存档列表格式错误');
        }
        for (const key of ['backgroundSkinAdProgress', 'wechatGiftTotals']) {
            const value = params.gameState && params.gameState[key];
            if (value !== undefined && (!value || Array.isArray(value) || typeof value !== 'object' || Object.values(value).some(v => !Number.isSafeInteger(v)))) throw failure('INVALID_REQUEST', '存档计数格式错误');
        }
        if (params.profile) {
            for (const key of ['uuid', 'displayName', 'avatarUrl']) if (params.profile[key] !== undefined && typeof params.profile[key] !== 'string') throw failure('INVALID_REQUEST', '资料文本格式错误');
            if (params.profile.isGuest !== undefined && typeof params.profile.isGuest !== 'boolean') throw failure('INVALID_REQUEST', '资料状态格式错误');
        }
        if (params.gameState && params.gameState.savedLevel > 1000000) throw failure('INVALID_REQUEST', '章节通关进度错误');
        if (params.profile && params.profile.lastLevelId > 1000000) throw failure('INVALID_REQUEST', '章节通关进度错误');
        if (params.gameState && params.gameState.stateUpdatedAt > Date.now() + 300000) throw failure('INVALID_REQUEST', '存档时间异常，请检查设备时间');
    } else {
        if (!ACTIONS.has(params.action)) throw failure('INVALID_ACTION', '不支持的装扮操作');
        for (const key of ['itemId', 'revision', 'pvpEconomyRevision']) if (params[key] !== undefined && !Number.isSafeInteger(params[key])) throw failure('INVALID_REQUEST', '装扮数字格式错误');
        if (params.seenItemIds !== undefined && (!Array.isArray(params.seenItemIds) || params.seenItemIds.some(v => !Number.isSafeInteger(v)))) throw failure('INVALID_REQUEST', '装扮列表格式错误');
        if (params.action !== 'profileGet' && !/^[a-zA-Z0-9_-]{8,100}$/.test(params.requestId || '')) throw failure('INVALID_REQUEST', '无效请求编号');
        if (params.avatarSource && params.avatarSource !== 'catalog') throw failure('INVALID_REQUEST', '抖音暂仅支持游戏内头像');
    }
}
function policy(fn) {
    try { return fn(); } catch (error) {
        // These functions are local pure business rules, never database/network exceptions.
        throw failure('BUSINESS_REJECTED', error.message);
    }
}
async function ready(db) {
    const setup = await db.collection(COLLECTIONS.meta).findOne({ _id: 'setup-v1' });
    if (!setup || setup.version !== 1 || !setup.transactionsVerified) throw failure('SETUP_REQUIRED', '请先在后台执行 businessSetup');
}
async function transaction(client, fn) {
    const session = client.startSession();
    try {
        let result;
        await session.withTransaction(async () => { result = await fn(session); }, TX_OPTIONS);
        return result;
    } finally { await session.endSession(); }
}
function ack(result) { if (!result || result.acknowledged !== true) throw failure('WRITE_UNACKNOWLEDGED', '云端尚未确认写入'); }
async function syncState(db, session, owner, event) {
    const collection = db.collection(COLLECTIONS.profiles);
    let current = await collection.findOne({ _id: owner }, { session });
    if (current && current.openid !== owner) throw failure('OWNER_MISMATCH', '存档账号不匹配');
    const now = Date.now();
    if (event.action === 'get') {
        // profileGet may create a starter document before the first local save arrives.
        // Its default balances are not a cloud save and must not overwrite existing r2 progress/assets.
        if (current && current.businessStateSaved !== true) {
            return { ok: true, ownerKey: owner, userStateSchemaVersion: 2, skinStateSchemaVersion: 2,
                profile: null, gameState: current.customization ? chapterSync.expose(current, { customization: current.customization }) : null };
        }
        if (current) {
            const patch = rules.sync.buildBackgroundSkinResetPersistPatch(current, now) || rules.sync.buildBackgroundSkinRetirementPersistPatch(current, now);
            if (patch) { ack(await collection.updateOne({ _id: owner }, { $set: patch }, { session })); current = { ...current, ...patch }; }
        }
    } else {
        const fresh = !current;
        current = current || { _id: owner, ...rules.sync.buildBaseProfile(owner, now) };
        const patch = { lastLoginTime: now, businessStateSaved: true };
        if (event.profile) Object.assign(patch, policy(() => rules.sync.buildProfilePatch(event.profile, current)));
        if (event.gameState) {
            const prepared = policy(() => chapterSync.prepare(event.gameState, current, rules.profile));
            Object.assign(patch, prepared.patch, policy(() => rules.sync.buildGameStatePatch(event.gameState, prepared.current)));
        }
        const progress = rules.sync.resolveEffectiveProgress(current, event.profile, event.gameState, patch);
        if (progress > 0) patch.savedLevel = patch.lastLevelId = progress;
        if (fresh) ack(await collection.insertOne({ ...current, ...patch }, { session }));
        else ack(await collection.updateOne({ _id: owner }, { $set: patch }, { session }));
        current = { ...current, ...patch };
    }
    const progress = rules.sync.resolveEffectiveProgress(current);
    return { ok: true, ownerKey: owner, userStateSchemaVersion: 2, skinStateSchemaVersion: 2,
        profile: rules.sync.extractProfile(current, progress), gameState: chapterSync.expose(current, rules.sync.extractGameState(current, progress)) };
}
async function profileAction(db, session, owner, event) {
    const profiles = db.collection(COLLECTIONS.profiles), requests = db.collection(COLLECTIONS.requests);
    let doc = await profiles.findOne({ _id: owner }, { session });
    if (doc && doc.openid !== owner) throw failure('OWNER_MISMATCH', '资料账号不匹配');
    if (doc?.chapterRewardProtocol === 1 && event.action === 'profileChapterClaim') throw failure('CLIENT_UPDATE_REQUIRED', '章节奖励已改为本地领取');
    if (!doc) {
        doc = { _id: owner, ...rules.sync.buildBaseProfile(owner, Date.now()) };
        ack(await profiles.insertOne(doc, { session }));
    }
    const id = hash([owner, event.requestId || '']);
    const previous = event.action === 'profileGet' ? null : await requests.findOne({ _id: id }, { session });
    if (previous && previous.openid !== owner) throw failure('OWNER_MISMATCH', '账号不匹配');
    const result = policy(() => rules.profile.transition(doc, event, previous, Date.now()));
    result.state.avatarSource = 'catalog';
    if (result.record) ack(await requests.updateOne({ _id: id }, { $set: { ...result.record, openid: owner } }, { session, upsert: true }));
    if (Object.keys(result.patch).length) ack(await profiles.updateOne({ _id: owner }, { $set: result.patch }, { session }));
    // This platform uses catalog avatars. 'wechat' in the original schema is not a Douyin identity.
    const customization = { ...result.state, avatarSource: 'catalog' };
    return { ok: true, ownerKey: owner, customizationSchemaVersion: 1, customization,
        inventory: chapterSync.expose({ ...doc, ...result.patch }, rules.profile.inventory({ ...doc, ...result.patch })), chapterRewards: result.chapterRewards, replay: !!result.replay };
}
async function receive(name, params, context) {
    try {
        const owner = identity(context);
        const { client, db } = await database();
        await ready(db);
        if (name === 'businessIdentity') return reply({ ok: true, subjectId: owner,
            // Versioned SDK alias only. Never replace the owner used by saves or analytics.
            sdkRoleId: crypto.createHash('sha256').update('shengye-role-v1:' + owner).digest('hex').slice(0, 32),
            sdkRoleIdVersion: 1 });
        if (!['syncUserState', 'updateUserProfileAssets'].includes(name)) throw failure('INVALID_ACTION', '不支持的业务接口');
        validateRequest(name, params);
        if (params.expectedOwner !== owner) throw failure('OWNER_MISMATCH', '登录账号已变化，请重新进入游戏');
        // withTransaction retries transient conflicts; deterministic IDs also make first-user races recoverable.
        let result;
        for (let attempt = 0; attempt < 3; attempt++) {
            try { result = await transaction(client, session => name === 'syncUserState' ? syncState(db, session, owner, params) : profileAction(db, session, owner, params)); break; }
            catch (error) { if (error.code !== 11000 || attempt === 2) throw error; }
        }
        return reply(result);
    } catch (error) { return safeError(error); }
}
module.exports = { receive, identity, ready, database, adminAllowed, adminFailure, reply, safeError, failure, transaction, ack, COLLECTIONS, TX_OPTIONS };
