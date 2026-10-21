'use strict';
const crypto = require('crypto');
const authorizeAdmin = require('./adminAuth');
const APP = 'ttf45082ed6a36c15802';
// Promotion uses the same code in both environments. Never select the database from request data.
const IS_PROD = process.env.CLOUD_ENV === 'PROD';
const ENV = IS_PROD ? 'env-XzE6JatzwX' : 'env-nvk6FNcrq5';
const LABEL = IS_PROD ? 'douyin_release' : 'douyin_dev';
const PROD_DATABASE = 'pdd_douyin_prod';
const COLLECTIONS = { addBehaviorData: 'user_behavior', addFunnelEvents: 'first_level_funnel', saveLevelRecord: 'level_record' };
const PUBLIC_PAGES = new Set(['app', 'startup', 'home', 'main_menu', 'douyin_sidebar',
    'gold_acquire_reward', 'vigor_recover', 'bean_skin_unlock', 'background_skin_unlock']);
const PLAY_MODES = new Set(['main', 'coop', 'pvp']);
const RECOVERY_EVENTS = new Set(('level_preparation_failed level_recovery_started level_resources_prepared level_recovery_exhausted ' +
    'gameplay_entry_recovery_failed gameplay_recovery_home_failed gameplay_entry_vigor_refunded gameplay_entry_vigor_refund_failed ' +
    'level_recovery_playable next_level_prefetch_failed level_entry_draw_ready app_transition_asset_failed home_game_entry_failed ' +
    'level_manifest_request_failed level_manifest_cache_restored level_manifest_cache_write_failed level_manifest_cache_invalid ' +
    'level_pack_cache_invalid gameplay_fx_unavailable opening_guide_resource_failed gameplay_audio_failed').split(' '));
// These diagnostics are emitted during loading, before GameplaySessionController.beginLevel.
// They describe a load, not a played round; preserve an empty roundId rather than invent one.
const PRE_ROUND_LEVEL_DATA_EVENTS = new Set(('level_data_startup_diagnostics level_data_load_start first_level_json_loaded first_level_json_failed ' +
    'gameAssets_config_start gameAssets_config_loaded gameAssets_config_failed gameAssets_bean_assets_failed ' +
    'gameAssets_board_effect_textures_failed gameAssets_ui_textures_failed').split(' '));
const EVENTS = new Set(('app_launch game_start app_show app_hide app_resume app_background analytics_quality ' +
    'enter_level level_pass level_fail level_failure_snapshot level_exit level_exit_intent level_measurement_start ' +
    'level_interaction_ready level_progress level_pause_snapshot level_resume level_unresolved_previous ' +
    'first_level_ui_ready first_level_any_touch first_level_content_load first_level_json_loaded first_level_playable ' +
    'level_data_startup_diagnostics level_data_load_start first_level_json_failed gameAssets_config_start gameAssets_config_loaded gameAssets_config_failed ' +
    'gameAssets_bean_assets_failed gameAssets_board_effect_textures_failed gameAssets_ui_textures_failed ' +
    'timer_started first_place_attempt first_place_success interaction_touch_attempt l1_release_state smart_hint_show ' +
    'guide_complete guide_interrupted guide_step_summary pch_guide_step_shown pch_guide_tap_result pch_guide_step_done ' +
    'pch_first_store_success pch_first_return_success pch_level3_first_action_after_guide pch_level3_progress_25 ' +
    'pch_level3_progress_50 pch_level3_progress_75 pch_level3_background_snapshot pch_level3_leave_snapshot ' +
    'pch_capacity_reward_followup_action pch_capacity_soft_hint_click pch_capacity_soft_hint_eligible pch_capacity_soft_hint_shown ' +
    'capacity_eligibility capacity_grant ad_entry_exposure csd_free_capacity_entry_exposure csd_capacity_entry_click ' +
    'csd_board_action_summary csd_input_block_summary csd_startup_observation csd_freeze_effect_result ' +
    'ad_click ad_show ad_finish ad_reward_success revive_panel_show revive_choice revive_success revive_declined ' +
    'share_click share_success share_revive_success rewarded_ad_load_start rewarded_ad_load_success rewarded_ad_load_fail ' +
    'rewarded_ad_request rewarded_ad_show_start rewarded_ad_show_success rewarded_ad_show_fail rewarded_ad_show ' +
    'rewarded_ad_close rewarded_ad_outcome rewarded_ad_cancel rewarded_ad_provider_cancel rewarded_ad_recoverable ' +
    'rewarded_ad_grant_start rewarded_ad_grant_failed rewarded_ad_reward_success rewarded_ad_after_grant_failed ' +
    'rewarded_ad_wait_pending rewarded_ad_wait_shown rewarded_ad_inventory_at_click rewarded_ad_preload_deferred rewarded_ad_replenish_requested ' +
    'settlement_started settlement_shown settlement_action settlement_gate_result settlement_transition_start ' +
    'settlement_transition_result settlement_background settlement_display_failed ' +
    'startup_summary startup_runtime_entry startup_first_playable_ready startup_failed startup_services ' +
    'startup_continue_decision_start startup_level_data_start startup_level_data_ready startup_pending_local_direct ' +
    'runtime_error runtime_unhandled_rejection runtime_memory_warning previous_session_unclean_exit remote_load_fatal_shown gameplay_init_failed profile_failed ' +
    'douyin_sidebar_guide_result douyin_sidebar_return douyin_sidebar_reward_result ' +
    'multiplayer_lobby_open multiplayer_service_result multiplayer_round_end').split(' '));
const FIELDS = new Set(('eventId eventName timestamp sessionId roundId eventSeq clientBuildId platform cdnSlot ' +
    'analyticsEnvironment analyticsSchemaVersion csdVersion gameplayEntryMode gameplayMode gameplaySchemaVersion ' +
    'levelId logicalLevelId physicalLevelId levelDataSource page source success stepId stepName touchTarget errorCode errorMessage ' +
    'duration elapsedMsFromLaunch elapsedMsFromRoundStart elapsedMsFromLevelReady lifecycleReason failureId actionType ' +
    'shareType adType smartHintShownCount adTransactionId adAttemptId triggerSource tryCount passStatus endReason exitReason ' +
    'useAdRevive useShareRevive countdownTimingVersion countdownTimingApplicable countdownConsumedSeconds reviveCount ' +
    'addedTimeSeconds startTime endTime failureReason effectiveTimeLimit ddaFactor ddaReason extra gameplayStats').split(' '));
let dbPromise;
const reply = value => ({ ...value, analyticsEnvironment: LABEL });
const fail = (code, fields = {}) => reply({ ok: false, errorCode: code, ...fields });
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const configReady = () => process.env.CLOUD_ENV === (IS_PROD ? 'PROD' : 'DEV') && process.env.ANALYTICS_ENVIRONMENT === LABEL &&
    !!process.env.MONGODB_URI && !!process.env.MONGODB_DB &&
    (IS_PROD ? process.env.MONGODB_DB === PROD_DATABASE : process.env.MONGODB_DB !== PROD_DATABASE);
async function database() {
    if (!configReady()) throw Object.assign(Error('config'), { analyticsCode: 'CONFIG_NOT_READY' });
    if (!dbPromise) dbPromise = (async () => {
        const { MongoClient } = require('mongodb');
        const client = new MongoClient(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 8000, maxPoolSize: 5
        });
        try { await client.connect(); return client.db(process.env.MONGODB_DB); }
        catch (error) { await client.close().catch(() => {}); throw error; }
    })().catch(error => { dbPromise = null; throw error; });
    return dbPromise;
}
function identity(context) {
    const h = context && context.headers;
    if (!configReady()) throw Object.assign(Error('config'), { analyticsCode: 'CONFIG_NOT_READY' });
    if (!h || context.trigger !== 'online' || h['x-tt-source'] !== 'APP' ||
        h['x-tt-appid'] !== APP || h['x-tt-envid'] !== ENV ||
        typeof h['x-tt-openid'] !== 'string' || !h['x-tt-openid'].trim() || h['x-tt-openid'].length > 256) {
        throw Object.assign(Error('identity'), { analyticsCode: 'IDENTITY_REQUIRED' });
    }
    return hash([ENV, APP, h['x-tt-openid']]);
}
function safeError(error) {
    const code = ['CONFIG_NOT_READY', 'IDENTITY_REQUIRED', 'EVENT_ID_CONFLICT'].includes(error && error.analyticsCode)
        ? error.analyticsCode : 'DATABASE_FAILED';
    console.error('[DouyinAnalytics]', code);
    return fail(code);
}
function clean(value, depth = 0) {
    if (typeof value === 'string') return value.slice(0, 4096)
        .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[database]')
        .replace(/\b(?:openid|token|session_key|secret|password)\s*[=:]\s*[^\s&,]+/gi, '[credential]');
    if (typeof value === 'boolean' || value === null) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (depth >= 3 || !value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid field');
    if (Object.keys(value).length > 64) throw Error('too many fields');
    const result = {};
    for (const key of Object.keys(value).sort()) {
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) || /replay|^(actions|boardTimeline|progressTimeline)$/i.test(key)) throw Error('replay or invalid field');
        if (value[key] !== undefined) result[key] = clean(value[key], depth + 1);
    }
    return result;
}
function normalize(raw, name) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Buffer.byteLength(JSON.stringify(raw)) > 16384) throw Error('invalid event');
    // Body identity is never trusted; owner assertion is checked separately against the gateway.
    const row = {};
    for (const key of Object.keys(raw)) {
        if (key === 'openid' || key === 'owner' || key === 'expectedOwner') continue;
        if (!FIELDS.has(key)) throw Error('unknown event field');
        let value = raw[key];
        // The existing r2 client sends this bounded list only for texture-load failures.
        // Preserve it as JSON text without opening generic array/replay ingestion.
        if (key === 'extra' && name === 'addFunnelEvents' && raw.source === 'level_data' && raw.page === 'level_game' &&
            ['gameAssets_ui_textures_failed', 'gameAssets_board_effect_textures_failed'].includes(raw.eventName) &&
            value && Array.isArray(value.missingTextureNames)) {
            const names = value.missingTextureNames;
            if (names.length > 32 || names.some(item => typeof item !== 'string' || item.length > 80)) throw Error('invalid texture names');
            value = { ...value, missingTextureNames: JSON.stringify(names) };
        }
        if (value !== undefined) row[key] = clean(value);
    }
    if (row.analyticsEnvironment !== LABEL || row.csdVersion !== 3 || row.analyticsSchemaVersion !== 2 || row.platform !== 'douyin' ||
        !/^[a-zA-Z0-9_.:-]{1,160}$/.test(row.eventId || '') || !/^[a-zA-Z0-9_.:-]{1,120}$/.test(row.sessionId || '') ||
        !/^[a-zA-Z0-9_.-]{1,80}$/.test(row.clientBuildId || '') || !['A', 'B'].includes(row.cdnSlot) ||
        !Number.isSafeInteger(row.timestamp) || row.timestamp <= 0 || row.timestamp > Date.now() + 300000) throw Error('invalid envelope');
    const modes = [row.gameplayEntryMode, row.extra && row.extra.gameplayEntryMode, row.extra && row.extra.entryMode].filter(Boolean);
    if (modes.some(mode => !PLAY_MODES.has(mode)) || new Set(modes).size > 1 || /^(theme|external)(_|$)/i.test(row.page || '')) throw Error('excluded mode');
    const pageMode = /^(coop|pvp)(_|$)/i.exec(row.page || '');
    if (pageMode && pageMode[1] !== row.gameplayEntryMode) throw Error('conflicting page mode');
    const multiplayer = ['coop', 'pvp'].includes(row.gameplayEntryMode);
    const lobby = multiplayer && name === 'addFunnelEvents' && row.page === row.gameplayEntryMode + '_lobby'
        && ['multiplayer_lobby_open', 'multiplayer_service_result'].includes(row.eventName);
    if (['multiplayer_lobby_open', 'multiplayer_service_result'].includes(row.eventName) &&
        (!lobby || row.roundId || row.levelId !== 0 || row.logicalLevelId !== 0 || row.physicalLevelId !== 0
            || typeof row.success !== 'boolean')) throw Error('invalid lobby scope');
    if (row.eventName === 'multiplayer_round_end' && (!multiplayer || name !== 'addFunnelEvents' ||
        row.source !== 'local_terminal' || row.extra?.resultSource !== 'local_observation' ||
        !(row.gameplayEntryMode === 'coop' ? row.extra?.terminalType === 'COMPLETE' && row.extra?.outcome === 'completed'
            : ['PASS', 'DEAD_CONVEYOR_FULL', 'DEAD_TIMEOUT', 'FORFEIT', 'SURVIVED_OPPONENT_DEATH'].includes(row.extra?.terminalType)
                && ['win', 'lose', 'draw'].includes(row.extra?.outcome)))) throw Error('invalid local terminal');
    const profileAd = name !== 'saveLevelRecord' && ['profile_avatar_unlock', 'profile_frame_unlock'].includes(row.page)
        && /^(rewarded_ad_[a-z_]+|ad_click|ad_show|ad_finish|ad_reward_success)$/.test(row.eventName || '');
    if (profileAd && multiplayer) throw Error('profile ad is not a multiplayer round');
    const legacyMissingRound = row.clientBuildId === 'douyin-a-business-dev-20261010-r1'
        && row.gameplayEntryMode === 'main' && !row.roundId;
    const legacyShare = legacyMissingRound && name === 'addBehaviorData' && row.page === 'win_bonus_reward'
        && row.shareType === 'win_bonus_reward' && ['share_click', 'share_success'].includes(row.eventName);
    // Only formerly rejected r1 records are projected; already accepted payload hashes stay stable.
    if (legacyMissingRound && profileAd) {
        row.gameplayEntryMode = ''; row.roundId = '';
        row.levelId = 0; row.logicalLevelId = 0; row.physicalLevelId = 0;
        for (const key of ['gameplayMode', 'gameplaySchemaVersion', 'levelDataSource',
            'elapsedMsFromRoundStart', 'elapsedMsFromLevelReady', 'failureId', 'failureReason']) delete row[key];
        if (row.extra) for (const key of ['gameplayMode', 'gameplaySchemaVersion', 'gameplayEntryMode',
            'entryMode', 'roundId', 'levelId', 'logicalLevelId', 'physicalLevelId', 'levelDataSource']) delete row.extra[key];
    }
    if (legacyShare) {
        // A lost round cannot be reconstructed. Keep level hints, explicitly exclude round attribution.
        row.gameplayEntryMode = '';
        row.extra = { ...row.extra, roundAttribution: 'legacy_missing' };
    }
    if (name === 'saveLevelRecord') {
        if (!PLAY_MODES.has(row.gameplayEntryMode) || !/^[a-zA-Z0-9_.:-]{1,120}$/.test(row.roundId || '') ||
            !['pass', 'fail', 'abandon'].includes(row.endReason) || typeof row.passStatus !== 'boolean' ||
            row.passStatus !== (row.endReason === 'pass') || !Number.isSafeInteger(row.startTime) ||
            !Number.isSafeInteger(row.endTime) || row.startTime <= 0 || row.endTime < row.startTime) throw Error('invalid terminal record');
    } else {
        if (!EVENTS.has(row.eventName) && !RECOVERY_EVENTS.has(row.eventName)) throw Error('event not allowed');
        if (RECOVERY_EVENTS.has(row.eventName) && (name !== 'addFunnelEvents' || row.page !== 'app' || row.roundId
            || row.gameplayEntryMode || row.levelId !== 0 || row.logicalLevelId !== 0 || row.physicalLevelId !== 0
            || typeof row.success !== 'boolean' || !Number.isSafeInteger(row.extra?.targetLevelId)
            || row.extra.targetLevelId < 0)) throw Error('invalid recovery scope');
        if (!PLAY_MODES.has(row.gameplayEntryMode) && !PUBLIC_PAGES.has(row.page) && !profileAd && !legacyShare) throw Error('unknown event scope');
    }
    if (multiplayer && !lobby && !/^[a-zA-Z0-9_.:-]{1,120}$/.test(row.roundId || '')) throw Error('multiplayer event missing round');
    if (row.gameplayEntryMode === 'main' && !row.roundId) {
        const loadingBeforeRound = name === 'addFunnelEvents' && Number.isSafeInteger(row.levelId) && row.levelId > 0 && (
            (PRE_ROUND_LEVEL_DATA_EVENTS.has(row.eventName) && row.source === 'level_data' && row.page === 'level_game') ||
            (row.eventName === 'first_level_content_load' && row.source === 'bootstrap' && (row.page === '' || row.page === 'level_game'))
        );
        if (!loadingBeforeRound) throw Error('main event missing round');
    }
    return clean(row);
}
async function writeEvent(db, name, row, subjectId) {
    const key = name === 'saveLevelRecord' ? row.roundId : row.eventId;
    const _id = hash([LABEL, ENV, APP, subjectId, name, key]);
    const payloadHash = hash(row);
    const collection = db.collection(COLLECTIONS[name]);
    const record = { ...row, _id, openid: subjectId, subjectId, envId: ENV, appId: APP, payloadHash, receivedAt: Date.now() };
    try {
        const result = await collection.updateOne({ _id }, { $setOnInsert: record }, { upsert: true, writeConcern: { w: 'majority', wtimeout: 5000 } });
        if (!result.acknowledged) throw Error('unacknowledged');
    } catch (error) { if (!error || error.code !== 11000) throw error; }
    const saved = await collection.findOne({ _id }, { projection: { payloadHash: 1 }, readPreference: 'primary', maxTimeMS: 5000 });
    if (!saved || saved.payloadHash !== payloadHash) throw Object.assign(Error('conflict'), { analyticsCode: 'EVENT_ID_CONFLICT' });
    const user = await db.collection('analytics_users').updateOne({ _id: subjectId }, {
        $setOnInsert: { analyticsEnvironment: LABEL, appId: APP, envId: ENV },
        $min: { firstSeenAt: row.timestamp }, $max: { lastSeenAt: row.timestamp }
    }, { upsert: true, writeConcern: { w: 'majority', wtimeout: 5000 } });
    if (!user.acknowledged) throw Error('user index not acknowledged');
}
async function receive(name, params, context) {
    try {
        const subjectId = identity(context);
        if (name === 'analyticsIdentity') return reply({ ok: true, subjectId });
        if (!params || params.expectedOwner !== subjectId) return fail('OWNER_MISMATCH');
        const batch = name === 'addFunnelEvents' ? params.events : [params];
        if (!Array.isArray(batch) || batch.length < 1 || batch.length > 20 || Buffer.byteLength(JSON.stringify(params)) > 256000) return fail('INVALID_BATCH');
        const normalized = [], rejectedIds = [];
        for (const raw of batch) {
            try { normalized.push(normalize(raw, name)); }
            catch (_) { if (raw && typeof raw.eventId === 'string') rejectedIds.push(raw.eventId.slice(0, 160)); }
        }
        if (normalized.length !== batch.length) return fail('INVALID_EVENT', { rejectedIds });
        const db = await database();
        for (const row of normalized) {
            try { await writeEvent(db, name, row, subjectId); }
            catch (error) {
                if (error && error.analyticsCode === 'EVENT_ID_CONFLICT') return fail('EVENT_ID_CONFLICT', { rejectedIds: [row.eventId] });
                throw error;
            }
        }
        return reply({ ok: true, count: batch.length, acknowledgedIds: normalized.map(row => row.eventId) });
    } catch (error) { return safeError(error); }
}
function adminAllowed(context) {
    return authorizeAdmin(context, process.env);
}
function adminFailure(context) { return reply(authorizeAdmin.failure(context, process.env)); }
module.exports = { receive, database, reply, fail, safeError, adminAllowed, adminFailure, normalize, EVENTS, LABEL, ENV, APP,
    TELEMETRY_SCOPE_VERSION: 2, GAMEPLAY_MODES: ['main', 'coop', 'pvp'] };
