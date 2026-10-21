'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const diagnostics = [];
const quiet = { log() {}, warn(...args) { diagnostics.push(args); }, error(...args) { diagnostics.push(args); } };
const config = { mode: 'dev', envID: 'env-nvk6FNcrq5', serviceID: '1m0ub3f29wtv7', buildId: 'test-build' };
const storage = () => { const map = new Map(); return { map, getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, v) }; };
function server() {
    const tables = new Map(); let failWrite = false;
    const database = { collection(name) {
        if (!tables.has(name)) tables.set(name, new Map());
        const rows = tables.get(name);
        return {
            async updateOne(query, update) {
                if (!rows.has(query._id)) rows.set(query._id, { ...update.$setOnInsert });
                if (failWrite) { failWrite = false; throw Error('response lost after write'); }
                return { acknowledged: true };
            },
            async findOne(query) { return rows.get(query._id); },
        };
    } };
    const box = { exports: {} };
    vm.runInNewContext(fs.readFileSync('cloudfunctions-douyin/analyticsCommon.js', 'utf8'), {
        module: box, exports: box.exports, Buffer, Date, console: quiet,
        process: { env: { CLOUD_ENV: 'DEV', ANALYTICS_ENVIRONMENT: 'douyin_dev', MONGODB_URI: 'test-only', MONGODB_DB: 'test' } },
        require: id => id === 'mongodb' ? { MongoClient: class {
            async connect() {} db() { return database; } async close() {}
        } } : id === './adminAuth' ? require('../cloudfunctions-douyin/adminAuth') : require(id),
    });
    let account = 'test-account';
    const context = () => ({ trigger: 'online', headers: { 'x-tt-source': 'APP', 'x-tt-appid': config.envID && 'ttf45082ed6a36c15802',
        'x-tt-envid': config.envID, 'x-tt-openid': account } });
    return { ...box.exports, tables, context, changeAccount: () => { account = 'another-account'; }, loseWrite: () => { failWrite = true; } };
}
function client(backend, store = storage()) {
    const handlers = {}, calls = [], cache = new Map(); let platform = 'ios';
    const api = { getSystemInfoSync: () => ({ platform }), getLaunchOptionsSync: () => ({}),
        onShow: fn => { handlers.show = fn; }, onHide: fn => { handlers.hide = fn; },
        onError: fn => { handlers.error = fn; }, onMemoryWarning() {}, onUnhandledRejection() {},
        createCloud(options) {
            assert.equal(options.envID, config.envID); assert.equal(options.serviceID, config.serviceID);
            return { callContainer(request) {
                assert.equal(request.init.method, 'POST'); calls.push(request);
                return backend.receive(request.path.slice(1), JSON.parse(JSON.stringify(request.init.body)), backend.context())
                    .then(data => request.success({ statusCode: 200, data }));
            } };
        },
    };
    const globals = { __PDD_DOUYIN_ANALYTICS__: config, __PDD_CDN_SLOT__: 'A' };
    const platformModule = { getMiniGameBuildPlatform: () => 'douyin', getDouyinMiniGameRuntime: () => api,
        getWeChatMiniGameRuntime: () => null, isWeChatMiniGameRuntime: () => false, isMiniGameRuntime: () => true };
    const stubs = {
        cc: { _decorator: { ccclass: () => x => x }, Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' },
            game: { on(name, listener, target) { handlers['game_' + name] = () => listener.call(target); } }, sys: { localStorage: store } },
        'cc/env': { PREVIEW: false }, './MiniGamePlatform': platformModule,
        './BrowserLevelPreview': { getBrowserLevelPreview: () => ({ active: false }) },
        './WorkbenchPreviewService': { isWorkbenchPreviewRequested: () => false },
        './FirstLevelContent': { getFirstLevelPreview: () => null },
        './RuntimeLog': { runtimeLog() {} },
        './PlatformCloudMgr': { PlatformCloudMgr: { inst: { getLaunchChannel: () => '',
            callFunction() { throw Error('business cloud must remain disabled'); } } } },
        '../Platform/RewardedAdProvider': { subscribeRewardedAdLoadEvents() {} },
    };
    function load(name) {
        if (cache.has(name)) return cache.get(name);
        const exports = {}; cache.set(name, exports);
        vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/Scripts/Core/' + name + '.ts', 'utf8'),
            { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true } }).outputText,
        { exports, globalThis: globals, console: quiet, Date, Math, Map, Set, setTimeout: () => 1, clearTimeout() {},
            require: id => { if (stubs[id]) return stubs[id]; if (id.startsWith('./')) return load(id.slice(2)); throw Error(id); } });
        return exports;
    }
    return { load, store, calls, handlers, globals, setPlatform: value => { platform = value; } };
}
function loadingRoute(mgr) {
    const module = { exports: {} };
    const source = fs.readFileSync('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts', 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020 } }).outputText, {
        exports: module.exports, console: quiet,
        require: id => ({
            '../GameCtrlShared': { AnalyticsMgr: { inst: mgr } },
            '../LevelDataCdnService': { LevelDataCdnService: { inst: { getAvailabilityDiagnostics: () => ({
                baseUrl: 'https://example.invalid/levels/', canUse: true, reason: 'ready', levelRange: [1, 100],
                lastFailure: { stage: '', namespace: '', reason: '' } }) } } },
            '../RuntimeLog': { runtimeLog() {} }, '../StartupTrace': { markStartupTrace() {} },
        }[id] || {}),
    });
    const route = {};
    module.exports.installFirstLevelRouteModule(route);
    route.getRuntimeRemoteHash = () => 'test-hash';
    route.getRuntimeRemoteServer = () => 'test-server';
    return route;
}
function loadingEventNames() {
    const names = new Set();
    const dir = 'assets/Scripts/Core/GameCtrlModules';
    for (const file of fs.readdirSync(dir).filter(x => x.endsWith('.ts'))) {
        const ast = ts.createSourceFile(file, fs.readFileSync(path.join(dir, file), 'utf8'), ts.ScriptTarget.Latest, true);
        function visit(node) {
            if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
                const method = node.expression.name.text;
                const arg = node.arguments[method === 'reportLevelDataLoadDiagnostic' ? 1 : 2];
                if (['reportLevelDataLoadDiagnostic', 'stopLevelDataLoadWithFatalError'].includes(method) && arg && ts.isStringLiteral(arg)) names.add(arg.text);
            }
            ts.forEachChild(node, visit);
        }
        visit(ast);
    }
    return [...names].sort();
}
async function main() {
    const backend = server(), c = client(backend), policy = c.load('DouyinAnalytics');
    assert.equal(policy.douyinAnalyticsAllowed(), true);
    c.setPlatform('devtools'); assert.equal(policy.douyinAnalyticsAllowed(), false); c.setPlatform('ios');
    c.globals.__PDD_DOUYIN_ANALYTICS__ = { ...config, mode: 'release' }; assert.equal(policy.douyinAnalyticsAllowed(), false);
    c.globals.__PDD_DOUYIN_ANALYTICS__ = config;
    for (const mode of ['theme', 'external']) {
        assert.equal(policy.douyinEventAllowed('addFunnelEvents', { gameplayEntryMode: mode, eventName: 'level_pass' }), false);
    }
    assert.equal(policy.douyinEventAllowed('addFunnelEvents', { gameplayEntryMode: 'main', replay: {} }), false);
    const mgr = c.load('AnalyticsMgr').AnalyticsMgr.inst;
    await mgr.bootstrap(); await mgr.prepareThirdLevelExperiment();
    mgr.setLevelContext({ logicalLevelId: 1, physicalLevelId: 1, gameplayEntryMode: 'main' });
    mgr.beginLevel(1, 'level_game');
    mgr.trackFunnelEvent({ eventName: 'first_level_experiment_exposure', source: 'first_level_playable', success: true });
    const loadingExtra = { levelDataCdn: { levelRange: [1, 100], lastFailure: { stage: 'load', detail: { nested: true } } },
        levelDataCdnCanUse: true, levelDataCdnReason: 'ready', levelDataCdnLastFailureStage: '',
        levelPath: 'LevelData/level_1', source: 'level_data_cdn', dataVersion: 'fixture-v1', actualLevelId: 1,
        jsonKeys: ['levelId', 'board'], clientBuildId: 'browser-dev', clientBuildIdSource: 'browser_dev' };
    for (const eventName of ['level_data_load_start', 'first_level_json_loaded', 'first_level_json_failed',
        'gameAssets_config_start', 'gameAssets_config_loaded', 'gameAssets_config_failed',
        'gameAssets_bean_assets_failed', 'gameAssets_board_effect_textures_failed', 'gameAssets_ui_textures_failed']) {
        mgr.trackFunnelEvent({ eventName, page: 'level_game', source: 'level_data',
            success: !eventName.endsWith('_failed'), errorCode: eventName.endsWith('_failed') ? 'load_failed' : '', extra: loadingExtra });
    }
    assert(Array.isArray(loadingExtra.levelDataCdn.levelRange), 'projection must not mutate the source diagnostics');
    mgr.trackFunnelEvent({ eventName: 'first_level_ui_ready', page: 'level_game', success: true });
    mgr.trackFunnelEvent({ eventName: 'pch_guide_step_shown', page: 'level_game', stepId: 1, extra: { guideId: 'g' } });
    mgr.trackFunnelEvent({ eventName: 'pch_guide_tap_result', page: 'level_game', stepId: 1, success: false, errorCode: 'miss_target', extra: { guideId: 'g' } });
    mgr.markLevelFailed('level_game', 1); mgr.markLevelPassed('level_game', 1);
    // Real phone ordering: the previous round is finalized before next-level loading;
    // a bootstrap content read can also happen outside a gameplay round.
    for (const eventName of ['level_data_load_start', 'first_level_json_loaded', 'first_level_json_failed']) {
        mgr.trackFunnelEvent({ eventName, levelId: 3, logicalLevelId: 3, physicalLevelId: 3,
            source: 'level_data', page: 'level_game', success: eventName !== 'first_level_json_failed',
            extra: { ...loadingExtra, levelPath: 'LevelData/level_3', actualLevelId: 3 } });
    }
    mgr.trackFunnelEvent({ eventName: 'first_level_content_load', levelId: 1, source: 'bootstrap',
        success: true, extra: { contentPath: 'LevelData/level_1' } });
    const profileDiagnostics = c.load('ProfileDiagnostics');
    const profileStages = ['sync', 'action', 'equipped_image', 'resource_load', 'resource_config', 'manifest', 'manifest_cache'];
    for (const stage of profileStages) {
        profileDiagnostics.reportProfileFailure(stage, '资料云服务不可用，请稍后重试', 0, 1);
        profileDiagnostics.reportProfileFailure(stage, '资料云服务不可用，请稍后重试', 0, 1);
    }
    // Enumerate real loading call sites so new names cannot silently fall outside the server list.
    const loadNames = loadingEventNames(), route = loadingRoute(mgr);
    assert(loadNames.includes('level_data_startup_diagnostics'));
    for (const eventName of loadNames) {
        route.reportLevelDataLoadDiagnostic(4, eventName, !eventName.endsWith('_failed'), 'LevelData/level_4', {
            errorCode: eventName.endsWith('_failed') ? 'missing_assets' : '',
            extra: eventName.includes('textures_failed') ? { missingTextureNames: ['board_bg', 'slot'] } : {
                initialDefaultEntryLevel: 4, defaultEntryLevel: 4, urlLevel: 0, urlTheme: false,
                restoreStatus: 'disabled', startupLocalProgressState: 'local_progress_gt_1',
                pendingStartupLevelId: 4, pendingStartupPrefix: 'level_', savedLevel: 4,
            },
        });
    }
    await Promise.resolve();
    c.handlers.show({ launch_from: 'homepage', location: 'sidebar_card' });
    c.handlers.show({ launch_from: 'homepage', location: 'sidebar_card' });
    mgr.setLevelContext({ gameplayEntryMode: 'theme' });
    mgr.trackFunnelEvent({ eventName: 'app_show', page: 'app' });
    mgr.trackFunnelEvent({ eventName: 'level_pass', page: 'theme_level' });
    mgr.trackFunnelEvent({ eventName: 'settlement_shown', page: 'level_game', gameplayEntryMode: 'pvp' });
    c.handlers.error('test runtime error');
    const key = 'pdd.analytics.delivery.douyin_dev.v1';
    for (let i = 0; i < 20; i++) { await new Promise(resolve => setImmediate(resolve)); await mgr.delivery.flush(); if (!mgr.delivery.size) break; }
    assert.equal(mgr.delivery.size, 0, JSON.stringify(JSON.parse(c.store.getItem(key) || '[]').map(x => x.data.eventName)));
    assert.equal(c.store.getItem(key + '.quarantine'), null, 'actual emitted fields must all be accepted');
    const events = [...(backend.tables.get('first_level_funnel') || new Map()).values()];
    const profileFailures = events.filter(x => x.eventName === 'profile_failed');
    assert.equal(profileFailures.length, profileStages.length, 'actual profile diagnostics retain their throttle');
    for (const stage of profileStages) {
        const failure = profileFailures.find(x => x.source === stage);
        assert(failure && failure.page === 'app' && !failure.roundId && !failure.gameplayEntryMode);
        assert.equal(failure.success, false, 'acceptance must not turn a business failure into success');
        assert.equal(failure.errorCode, stage);
        assert.equal(failure.errorMessage, '资料云服务不可用，请稍后重试');
        assert.equal(failure.extra.attempts, 1);
    }
    for (const eventName of loadNames) {
        assert(events.some(x => x.eventName === eventName && x.levelId === 4 && !x.roundId), 'missing actual loading event: ' + eventName);
    }
    assert.equal(events.find(x => x.eventName === 'gameAssets_ui_textures_failed' && x.levelId === 4).extra.missingTextureNames, '["board_bg","slot"]');
    assert(!events.some(x => /experiment/.test(x.eventName)));
    const preRound = events.filter(x => ['level_data_load_start', 'first_level_json_loaded', 'first_level_json_failed',
        'first_level_content_load'].includes(x.eventName) && !x.roundId);
    assert.equal(preRound.filter(x => x.levelId !== 4).length, 4, 'loading outside a round must be accepted without fabricating a round ID');
    assert(preRound.some(x => x.eventName === 'first_level_content_load' && x.page === ''));
    assert(preRound.some(x => x.eventName === 'level_data_load_start' && x.levelId === 3));
    const loaded = events.find(x => x.eventName === 'first_level_json_loaded');
    assert(loaded, 'real loading payload must reach the receiver');
    assert.equal(loaded.extra.levelDataCdn, undefined);
    assert.equal(loaded.extra.jsonKeys, 'levelId,board');
    assert.equal(loaded.extra.levelDataCdnCanUse, true);
    assert.equal(loaded.extra.source, 'level_data_cdn');
    assert.equal(loaded.extra.loadingDiagnosticsVersion, 1);
    assert(events.some(x => x.eventName === 'first_level_json_failed' && !x.success && x.errorCode === 'load_failed'));
    for (const event of events) {
        assert.equal(event.clientBuildId, config.buildId);
        if (event.extra) {
            assert.equal(event.extra.clientBuildId, config.buildId);
            assert.equal(event.extra.clientBuildIdSource, 'douyin_build_marker');
        }
    }
    assert.equal(events.filter(x => x.eventName === 'douyin_sidebar_return').length, 1);
    assert(events.some(x => x.eventName === 'app_show' && !x.roundId && !x.gameplayEntryMode));
    assert(!events.some(x => ['theme', 'pvp'].includes(x.gameplayEntryMode)));
    assert.equal(backend.tables.get('level_record').size, 1);
    assert.equal([...backend.tables.get('level_record').values()][0].endReason, 'pass');
    for (const mode of ['coop', 'pvp']) {
        mgr.setGameplayTelemetryScope(mode);
        mgr.beginLevel(8, 'theme_level', { gameplayEntryMode: 'theme' });
        assert.equal(mgr.levelSession.gameplayEntryMode, mode, 'shared theme route uses real analytics mode');
        mgr.trackFunnelEvent({ eventName: 'level_progress', page: 'theme_level', gameplayEntryMode: 'theme' });
        mgr.markLevelPassed('level_game', 8);
        await Promise.resolve();
        for (let i = 0; i < 20 && mgr.delivery.size; i++) await mgr.delivery.flush();
        assert.equal(mgr.delivery.size, 0);
        assert.equal(c.store.getItem(key + '.quarantine'), null);
        const terminal = [...backend.tables.get('level_record').values()].find(row => row.gameplayEntryMode === mode);
        assert(terminal && terminal.levelId === 8 && terminal.endReason === 'pass');
        assert([...backend.tables.get('first_level_funnel').values()].some(row => row.gameplayEntryMode === mode && row.page === mode + '_game'));
    }
    mgr.setGameplayTelemetryScope('main');
    const identity = await backend.receive('analyticsIdentity', {}, backend.context());
    const base = { ...events.find(x => x.eventName === 'first_level_ui_ready') };
    for (const key of ['_id', 'subjectId', 'envId', 'appId', 'payloadHash', 'receivedAt']) delete base[key];
    const request = { events: [{ ...base, eventId: 'retry-event' }], expectedOwner: identity.subjectId };
    const replayLoads = preRound.map(event => {
        const raw = { ...event };
        for (const field of ['_id', 'subjectId', 'envId', 'appId', 'payloadHash', 'receivedAt']) delete raw[field];
        return raw;
    });
    const beforeLoadRetry = backend.tables.get('first_level_funnel').size;
    assert.equal((await backend.receive('addFunnelEvents', { expectedOwner: identity.subjectId, events: replayLoads }, backend.context())).ok, true);
    assert.equal(backend.tables.get('first_level_funnel').size, beforeLoadRetry, 'roundless diagnostics deduplicate by eventId');
    assert.equal((await backend.receive('addBehaviorData', { ...replayLoads[0], expectedOwner: identity.subjectId }, backend.context())).errorCode,
        'INVALID_EVENT', 'loading exception is restricted to the funnel endpoint');
    const timer = { ...base, eventName: 'timer_started', eventId: 'timer-probe', source: 'free_play', levelId: 2 };
    assert.equal((await backend.receive('addFunnelEvents', { ...request, events: [timer] }, backend.context())).ok, true);
    const textureFailure = { ...base, eventName: 'gameAssets_ui_textures_failed', source: 'level_data', roundId: '' };
    for (const missingTextureNames of [[{}], [1], Array(33).fill('asset'), ['a'.repeat(81)]]) {
        assert.equal((await backend.receive('addFunnelEvents', { ...request, events: [{ ...textureFailure,
            extra: { missingTextureNames } }] }, backend.context())).errorCode, 'INVALID_EVENT');
    }
    for (const invalid of [
        { eventName: 'timer_started', roundId: '' }, { eventName: 'level_pass', roundId: '' },
        { eventName: 'level_fail', roundId: '' }, { eventName: 'settlement_shown', roundId: '' },
        { eventName: 'level_data_load_start', source: 'free_play', roundId: '' },
        { eventName: 'level_data_load_start', source: 'level_data', page: 'home', roundId: '' },
        { eventName: 'level_data_load_start', source: 'level_data', levelId: 0, roundId: '' },
        { eventName: 'first_level_content_load', source: 'level_data', roundId: '' },
        { eventName: 'first_level_content_load', source: 'bootstrap', gameplayEntryMode: 'pvp', roundId: '' },
    ]) {
        assert.equal((await backend.receive('addFunnelEvents', { ...request, events: [{ ...base, ...invalid }] }, backend.context())).errorCode,
            'INVALID_EVENT', JSON.stringify(invalid));
    }
    assert.equal((await backend.receive('saveLevelRecord', { ...base, expectedOwner: identity.subjectId, roundId: '',
        endReason: 'pass', passStatus: true, startTime: Date.now() - 100, endTime: Date.now() }, backend.context())).errorCode, 'INVALID_EVENT');
    backend.loseWrite(); assert.equal((await backend.receive('addFunnelEvents', request, backend.context())).ok, false);
    assert.equal((await backend.receive('addFunnelEvents', request, backend.context())).ok, true);
    const size = backend.tables.get('first_level_funnel').size;
    const replies = await Promise.all([1, 2, 3].map(() => backend.receive('addFunnelEvents', request, backend.context())));
    assert(replies.every(x => x.ok)); assert.equal(backend.tables.get('first_level_funnel').size, size);
    assert.equal((await backend.receive('addFunnelEvents', { ...request, events: [{ ...request.events[0], success: false }] }, backend.context())).errorCode, 'EVENT_ID_CONFLICT');
    assert.equal((await backend.receive('addFunnelEvents', { ...request, expectedOwner: 'spoof' }, backend.context())).errorCode, 'OWNER_MISMATCH');
    assert.equal((await backend.receive('addFunnelEvents', { ...request, events: [{ ...base, replay: {} }] }, backend.context())).errorCode, 'INVALID_EVENT');
    for (const invalid of [
        { eventName: 'first_level_experiment_exposure' }, { eventName: 'unknown_event' },
        { extra: { array: [1, 2] } }, { extra: { nested: { too: { deep: true } } } },
    ]) {
        assert.equal((await backend.receive('addFunnelEvents', { ...request, events: [{ ...base, ...invalid }] }, backend.context())).errorCode, 'INVALID_EVENT');
    }
    assert.equal(backend.adminAllowed(backend.context()), false);
    const Delivery = c.load('AnalyticsDelivery').AnalyticsDelivery;
    const strict = { key: 'isolated', environment: 'douyin_dev', strictOwner: true };
    const st = storage(); let sends = 0;
    st.setItem('isolated', JSON.stringify([{ id: 'old', name: 'addFunnelEvents', owner: '', data: { analyticsEnvironment: 'douyin_dev', csdVersion: 3 } }]));
    const delivery = new Delivery(st, async () => identity.subjectId, async () => { sends++; return { ok: true }; }, () => true, strict);
    await delivery.flush(); assert.equal(sends, 0); assert.equal(JSON.parse(st.getItem('isolated.quarantine')).length, 1);
    delivery.enqueue('addFunnelEvents', base, 'different-account'); await delivery.flush(); assert.equal(sends, 0);
    delivery.enqueue('addFunnelEvents', base, identity.subjectId); await delivery.flush(); assert.equal(delivery.size, 1, 'missing exact acknowledgement must retain event');
    backend.changeAccount();
    assert.equal((await backend.receive('addFunnelEvents', request, backend.context())).errorCode, 'OWNER_MISMATCH');
    // Do not overwrite previous-owner checkpoint before fresh identity is known.
    const store2 = storage(), checkpoint = 'pdd.analytics.runtime_checkpoint.release.v3.douyin_dev';
    const current = await backend.receive('analyticsIdentity', {}, backend.context());
    store2.setItem(checkpoint, JSON.stringify({ owner: current.subjectId, sessionId: 'older', checkpoint: 'level_begin', timestamp: Date.now() - 100, active: true, page: 'level_game' }));
    const c2 = client(backend, store2), mgr2 = c2.load('AnalyticsMgr').AnalyticsMgr.inst;
    assert.equal(JSON.parse(store2.getItem(checkpoint)).sessionId, 'older');
    await mgr2.ensureReady();
    assert(JSON.parse(store2.getItem(key)).some(x => x.data.eventName === 'previous_session_unclean_exit'));
    c2.handlers.game_hide();
    assert.equal(c2.globals.__PDD_DOUYIN_UPLOAD_DIAGNOSTICS__.getSnapshot().state, 'background');
    mgr2.handleHide();
    const pausedSnapshot = c2.globals.__PDD_DOUYIN_UPLOAD_DIAGNOSTICS__.getSnapshot();
    assert.equal(pausedSnapshot.uploadPaused, true);
    assert(pausedSnapshot.pendingCount > 0, 'hide events persist');
    const callsBefore = c2.calls.length;
    assert.equal(await mgr2.ensureReady(), false, 'background standalone identity is deferred');
    await mgr2.delivery.flush();
    assert.equal(c2.calls.length, callsBefore, 'background must not start cloud requests');
    c2.handlers.game_show();
    mgr2.handleShow();
    assert.equal(c2.globals.__PDD_DOUYIN_UPLOAD_DIAGNOSTICS__.getSnapshot().state, 'foreground');
    assert.equal(c2.globals.__PDD_DOUYIN_UPLOAD_DIAGNOSTICS__.getSnapshot().uploadPaused, false);
    await mgr2.delivery.flush();
    assert(c2.calls.length > callsBefore, 'foreground resumes identity and event upload');
    console.log('PASS Douyin actual AnalyticsMgr -> transport -> Mongo receiver, scope, identity, replay exclusion, acknowledgement, dedup, recovery');
}
async function attributionRegression() {
    const backend = server(), c = client(backend), mgr = c.load('AnalyticsMgr').AnalyticsMgr.inst;
    await mgr.bootstrap();
    mgr.setLevelContext({ logicalLevelId: 7, physicalLevelId: 9, gameplayEntryMode: 'main' });
    mgr.beginLevel(7, 'level_game');
    const round = mgr.levelSession.roundId;
    mgr.beginSettlement('win', { logicalLevelId: 8, gameplayEntryMode: 'main' });
    mgr.markLevelPassed('level_game', 7);
    // Run the actual share caller and finish its native callback after a new level has started.
    let shareReturn, grants = 0;
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts', 'utf8'),
        { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
        module, exports: module.exports, console: quiet, Promise, setTimeout: () => 1, clearTimeout() {},
        require(id) {
            if (id === '../GameCtrlShared') return { AnalyticsMgr: { inst: mgr } };
            if (id === '../MiniGamePlatform') return { isDouyinMiniGameRuntime: () => true, getDouyinMiniGameRuntime: () => ({}) };
            if (id === '../../Platform/Douyin/DouyinShareService') return { douyinShareService: {
                start({ onComplete }) { shareReturn = onComplete; return { started: true, handle: { isActive: () => true } }; }
            } };
            return {};
        },
    });
    const flow = { getActiveLogicalLevelId: () => 7 };
    module.exports.installHomeAdFlowModule(flow);
    assert.equal(flow.runShareGrant('win_bonus_reward', () => { grants++; return true; }, { shareType: 'win_bonus_reward' }), true);
    mgr.setLevelContext({ logicalLevelId: 8, physicalLevelId: 10, gameplayEntryMode: 'main' });
    mgr.beginLevel(8, 'level_game');
    shareReturn({ status: 'qualified' });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(grants, 1);
    assert.equal(mgr.captureShareContext('win_bonus_reward'), null, 'old settlement must be cleared');
    for (const page of ['profile_avatar_unlock', 'profile_frame_unlock']) {
        for (const eventName of ['rewarded_ad_inventory_at_click', 'rewarded_ad_show_start', 'rewarded_ad_replenish_requested']) {
            mgr.trackFunnelEvent({ eventName, page, levelId: 1, source: 'rewarded_ad_provider',
                extra: { adTransactionId: page + ':ad:1', attemptId: 1 } });
        }
        mgr.trackAdClick('rewarded', page, 1, 'main', { transactionId: page + ':ad:1' });
    }
    const key = 'pdd.analytics.delivery.douyin_dev.v1';
    c.store.setItem(key + '.quarantine', JSON.stringify([{ id: 'old-quarantined', reason: 'INVALID_EVENT' }]));
    for (const mode of ['pvp', 'coop', 'theme', 'external']) mgr.trackFunnelEvent({
        eventName: 'rewarded_ad_show_start', page: 'profile_avatar_unlock', gameplayEntryMode: mode });
    for (let i = 0; i < 20; i++) { await new Promise(resolve => setImmediate(resolve)); await mgr.delivery.flush(); if (!mgr.delivery.size) break; }
    assert.equal(mgr.delivery.size, 0);
    assert.equal(JSON.parse(c.store.getItem(key + '.quarantine')).length, 1, 'preserve historical quarantine; no new rejection');
    const rows = [...backend.tables.values()].flatMap(table => [...table.values()]);
    const shares = rows.filter(x => x.page === 'win_bonus_reward');
    assert.equal(shares.length, 2);
    for (const row of shares) {
        assert.equal(row.roundId, round); assert.equal(row.levelId, 7);
        assert.equal(row.logicalLevelId, 7); assert.equal(row.physicalLevelId, 9);
    }
    const ads = rows.filter(x => /^profile_/.test(x.page));
    assert.equal(ads.length, 8);
    for (const row of ads) {
        assert.equal(row.roundId, ''); assert.equal(row.levelId, 0); assert.equal(row.gameplayEntryMode, '');
        assert.equal(row.gameplayMode, undefined); assert.equal(row.elapsedMsFromLevelReady, undefined);
        assert(row.adTransactionId || row.extra.adTransactionId);
        assert.equal(row.extra?.gameplayMode, undefined);
    }
    const base = { eventId: 'legacy:1', sessionId: 'legacy-session', timestamp: Date.now(),
        clientBuildId: 'douyin-a-business-dev-20261010-r1', analyticsEnvironment: 'douyin_dev',
        analyticsSchemaVersion: 2, csdVersion: 3, platform: 'douyin', cdnSlot: 'A', gameplayEntryMode: 'main', roundId: '',
        levelId: 7, logicalLevelId: 7, physicalLevelId: 9 };
    const legacyAd = { ...base, page: 'profile_avatar_unlock', eventName: 'rewarded_ad_show_start', extra: { adTransactionId: 'old-ad' } };
    assert.equal(backend.normalize(legacyAd, 'addFunnelEvents').levelId, 0);
    const legacyShare = { ...base, page: 'win_bonus_reward', shareType: 'win_bonus_reward', eventName: 'share_success' };
    const normalizedShare = backend.normalize(legacyShare, 'addBehaviorData');
    assert.equal(normalizedShare.extra.roundAttribution, 'legacy_missing');
    assert.equal(normalizedShare.roundId, ''); assert.equal(normalizedShare.gameplayEntryMode, '');
    for (const invalid of [
        { ...legacyShare, clientBuildId: 'new-build' }, { ...legacyShare, shareType: 'other' },
        { ...legacyShare, eventName: 'level_pass' }, { ...legacyAd, eventName: 'level_pass' },
        { ...legacyAd, gameplayEntryMode: 'pvp' }, { ...legacyAd, extra: { entryMode: 'coop' } },
    ]) assert.throws(() => backend.normalize(invalid, invalid.page === 'win_bonus_reward' ? 'addBehaviorData' : 'addFunnelEvents'));
    const acceptedOld = { ...legacyAd, roundId: 'real-old-round' };
    assert.equal(backend.normalize(acceptedOld, 'addFunnelEvents').gameplayEntryMode, 'main', 'accepted old payload stays stable for dedup');
    for (const mode of ['theme', 'external', 'pvp', 'coop']) {
        mgr.setGameplayTelemetryScope(mode);
        mgr.setLevelContext({ gameplayEntryMode: mode }); mgr.beginLevel(9, 'level_game');
        mgr.beginSettlement('win', null, mode);
        assert.equal(mgr.captureShareContext('win_bonus_reward'), null);
    }
    console.log('PASS profile ads, real completed-round share callback, narrow r1 compatibility, quarantine preservation');
}
async function multiplayerRegression() {
    const backend = server(), c = client(backend), mgr = c.load('AnalyticsMgr').AnalyticsMgr.inst;
    await mgr.bootstrap();
    mgr.setLevelContext({ gameplayEntryMode: 'main' }); mgr.beginLevel(2, 'level_game');
    const mainRound = mgr.getCurrentRoundId();
    for (const mode of ['coop', 'pvp']) {
        mgr.trackMultiplayerLobby(mode, 'multiplayer_lobby_open');
        mgr.trackMultiplayerLobby(mode, 'multiplayer_service_result', 'overview', false, 10);
        assert.equal(mgr.getCurrentRoundId(), mainRound, 'lobby cannot replace active gameplay');
    }
    for (const mode of ['coop', 'pvp']) {
        mgr.setGameplayTelemetryScope(mode);
        mgr.beginLevel(3, 'theme_level', { gameplayEntryMode: 'theme' });
        const round = mgr.getCurrentRoundId();
        mgr.trackFunnelEvent({ eventName: 'level_progress', page: 'theme_level' });
        mgr.trackAdShow('rewarded', 'theme_level', 3, 'theme');
        mgr.beginSettlement(mode === 'coop' ? 'win' : 'pvp_result', null, mode);
        mgr.finishMultiplayerAnalytics(mode, mode === 'coop' ? 'COMPLETE' : 'DEAD_TIMEOUT', mode === 'coop' ? 'completed' : 'lose');
        mgr.finishMultiplayerAnalytics(mode, mode === 'coop' ? 'COMPLETE' : 'DEAD_TIMEOUT', mode === 'coop' ? 'completed' : 'lose');
        assert(mgr.levelSession.finalized, 'local terminal closes analytics round');
        mgr.handleHide(); mgr.handleShow();
        for (let i = 0; i < 30 && mgr.delivery.size; i++) await mgr.delivery.flush();
        const rows = [...backend.tables.get('first_level_funnel').values()].filter(row => row.roundId === round);
        assert.equal(rows.filter(row => row.eventName === 'multiplayer_round_end').length, 1);
        assert(rows.every(row => row.gameplayEntryMode === mode));
        assert.equal(rows.find(row => row.eventName === 'multiplayer_round_end').extra.resultSource, 'local_observation');
        assert(![...backend.tables.get('level_record').values()].some(row => row.roundId === round), 'local terminal is not falsely reported as abandoned/pass');
    }
    const key = 'pdd.analytics.delivery.douyin_dev.v1';
    assert.equal(c.store.getItem(key + '.quarantine'), null);
    const rows = [...backend.tables.get('first_level_funnel').values()];
    const lobby = rows.filter(row => /^multiplayer_(lobby|service)/.test(row.eventName));
    assert.equal(lobby.length, 4); assert(lobby.every(row => !row.roundId && row.levelId === 0));
    const modeRow = rows.find(row => row.eventName === 'multiplayer_round_end');
    const raw = { ...modeRow }; for (const key of ['_id', 'subjectId', 'envId', 'appId', 'payloadHash', 'receivedAt']) delete raw[key];
    for (const invalid of [
        { ...raw, roundId: '' }, { ...raw, gameplayEntryMode: 'main' },
        { ...raw, extra: { ...raw.extra, entryMode: 'pvp' } },
        { ...raw, extra: { ...raw.extra, nested: { replay: {} } } },
        { ...raw, extra: { ...raw.extra, actions: [] } },
    ]) assert.throws(() => backend.normalize(invalid, 'addFunnelEvents'));
    assert.equal(c.load('DouyinAnalytics').douyinEventAllowed('addFunnelEvents', { ...raw, extra: { nested: { replay: {} } } }), false);
    mgr.setGameplayTelemetryScope('main'); mgr.beginLevel(4, 'level_game', { gameplayEntryMode: 'main' });
    assert.equal(mgr.levelSession.gameplayEntryMode, 'main', 'leaving multiplayer restores mainline scope');
    console.log('PASS multiplayer scope, roundless lobby/failures, actual local terminal, shared-route ads, replay rejection');
}
async function recoveryRegression() {
    const backend = server(), c = client(backend), mgr = c.load('AnalyticsMgr').AnalyticsMgr.inst;
    await mgr.bootstrap();
    for (let i = 0; i < 10 && mgr.delivery.size; i++) await mgr.delivery.flush();
    mgr.setLevelContext({ logicalLevelId: 2, physicalLevelId: 2, gameplayEntryMode: 'main' });
    mgr.beginLevel(2, 'level_game');
    const oldRound = mgr.getCurrentRoundId();
    const policy = c.load('DouyinAnalytics');
    const reporter = c.load('WeChatLevelPreparation').reportWeChatEntry;
    const entry = { _weChatPreparingLevel: 3, _weChatPreparationId: 'attempt-3', _weChatPreparationHadFailure: true };
    for (const eventName of policy.RECOVERY_EVENTS) {
        reporter(entry, eventName, false, 'network unavailable', 'original_network_error');
    }
    reporter(entry, 'level_recovery_playable', true);
    backend.loseWrite();
    await mgr.delivery.flush();
    const restarted = client(backend, c.store), recovered = restarted.load('AnalyticsMgr').AnalyticsMgr.inst;
    await recovered.bootstrap();
    for (let i = 0; i < 40 && recovered.delivery.size; i++) await recovered.delivery.flush();
    assert.equal(recovered.delivery.size, 0);
    assert.equal(c.store.getItem('pdd.analytics.delivery.douyin_dev.v1.quarantine'), null);
    const rows = [...backend.tables.get('first_level_funnel').values()].filter(row => policy.RECOVERY_EVENTS.has(row.eventName));
    assert.equal(rows.length, policy.RECOVERY_EVENTS.size + 1, 'lost acknowledgement/restart must not duplicate diagnostics');
    for (const row of rows) {
        assert.equal(row.page, 'app'); assert.equal(row.roundId, ''); assert.notEqual(row.roundId, oldRound);
        assert.equal(row.levelId, 0); assert.equal(row.gameplayEntryMode, '');
        assert.equal(row.extra.targetLevelId, 3, 'target survives both payload projections without borrowing the previous level');
        assert.equal(row.extra.requestId, 'attempt-3');
        assert.equal(row.extra.recovered, true);
        assert.equal(row.source, 'level_preparation');
        if (!row.success) { assert.equal(row.errorCode, 'original_network_error'); assert.equal(row.errorMessage, 'network unavailable'); }
    }
    const valid = { ...rows[0] };
    for (const key of ['_id', 'subjectId', 'envId', 'appId', 'payloadHash', 'receivedAt']) delete valid[key];
    for (const invalid of [
        { ...valid, roundId: oldRound }, { ...valid, levelId: 2 }, { ...valid, gameplayEntryMode: 'main' },
        { ...valid, extra: { ...valid.extra, targetLevelId: -1 } }, { ...valid, eventName: 'unknown_recovery_event' },
    ]) assert.throws(() => backend.normalize(invalid, 'addFunnelEvents'));
    assert.throws(() => backend.normalize(valid, 'addBehaviorData'), 'diagnostics never become gameplay records');
    console.log('PASS recovery telemetry: all new events, actual reporter/queue/receiver, failure details, target/request, restart/dedup, scope rejection');
}
main().then(attributionRegression).then(multiplayerRegression).then(recoveryRegression).catch(error => { console.error(error, diagnostics.slice(-4)); process.exitCode = 1; });
