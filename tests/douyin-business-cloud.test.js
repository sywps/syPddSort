'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const silent = { log() {}, warn() {}, error() {}, info() {} };
function backend(options = {}) {
    let store = {}, tail = Promise.resolve(), failWrite = '', rollbackCount = 0;
    const context = { trigger: 'online', headers: { 'x-tt-source': 'APP', 'x-tt-appid': 'ttf45082ed6a36c15802', 'x-tt-envid': 'env-nvk6FNcrq5', 'x-tt-openid': 'phone-user-1' } };
    const db = { collection(name) {
        const table = opts => { const target = opts?.session?.data || store; return target[name] || (target[name] = {}); };
        function write() { if (failWrite === name) { failWrite = ''; throw Error('simulated database failure mongodb://secret'); } }
        return {
            async createIndex() { table(); return 'index'; },
            async findOne(query, opts) { return clone(Object.values(table(opts)).find(row => Object.entries(query).every(([k, v]) => row[k] === v)) || null); },
            async insertOne(row, opts) { write(); const t = table(opts); if (t[row._id]) throw Object.assign(Error('duplicate'), { code: 11000 }); t[row._id] = clone(row); return { acknowledged: true }; },
            async updateOne(query, update, opts) { write(); const t = table(opts); if (t[query._id] || opts?.upsert) t[query._id] = clone({ ...(t[query._id] || query), ...update.$set }); return { acknowledged: true }; },
            async deleteOne(query) { delete table()[query._id]; return { acknowledged: true }; }
        };
    } };
    class MongoClient {
        async connect() {} async close() {} db() { return db; }
        startSession() {
            return { async withTransaction(fn, options) {
                assert.equal(options.readConcern.level, 'snapshot'); assert.equal(options.writeConcern.w, 'majority');
                let unlock; const previous = tail; tail = new Promise(resolve => { unlock = resolve; }); await previous;
                this.data = clone(store);
                try { const result = await fn(); store = this.data; return result; }
                catch (error) { rollbackCount++; throw error; }
                finally { this.data = null; unlock(); }
            }, async endSession() {} };
        }
    }
    const env = { CLOUD_ENV: 'DEV', BUSINESS_ENVIRONMENT: 'douyin_dev', MONGODB_URI: 'test-only', MONGODB_DB: 'test-only', ...options.env };
    if (options.envId) context.headers['x-tt-envid'] = options.envId;
    function load(file) {
        const module = { exports: {} };
        vm.runInNewContext(fs.readFileSync(path.join(root, 'cloudfunctions-douyin', file), 'utf8'), {
            module, exports: module.exports, console: silent, Buffer, process: { env },
            require(id) { if (id === 'mongodb') return { MongoClient }; if (id === './businessCommon') return common; return require(path.isAbsolute(id) || !id.startsWith('.') ? id : path.join(root, 'cloudfunctions-douyin', id)); }
        }, { filename: file });
        return module.exports;
    }
    const common = load('businessCommon.js'), setup = load('businessSetup.js');
    return { common, setup, context, env, db, store: () => clone(store), rollbackCount: () => rollbackCount,
        failNext(name) { failWrite = name; }, call(name, params, ctx = context) { return common.receive(name, clone(params), ctx); } };
}
function client(b, overrides = {}) {
    const storage = overrides.storage || new Map(), calls = [];
    const runtime = { getStorageSync: k => storage.get(k) || '', setStorageSync: (k, v) => storage.set(k, v),
        createCloud(options) {
            assert.equal(options.envID, 'env-nvk6FNcrq5'); assert.equal(options.serviceID, '1m0ub3f29wtv7');
            return { callContainer(options) {
                calls.push(options); assert.equal(options.init.method, 'POST'); assert.equal(options.init.timeout, 15000);
                assert(!options.data && !options.method, 'use verified callContainer.init envelope');
                return b.call(options.path.slice(1), options.init.body).then(result => {
                    if (overrides.dropResponse?.(options, result)) return options.fail({});
                    options.success({ statusCode: 200, data: JSON.stringify(overrides.response ? overrides.response(result) : result) });
                });
            } };
        } };
    const module = { exports: {} }, sandbox = { module, exports: module.exports, console: silent, setTimeout, clearTimeout,
        __PDD_DOUYIN_CLOUD_ENV__: 'env-nvk6FNcrq5', __PDD_DOUYIN_BUSINESS__: { mode: 'dev', envID: 'env-nvk6FNcrq5', serviceID: '1m0ub3f29wtv7' },
        require(id) {
            if (id === 'cc') return { _decorator: { ccclass: () => x => x } };
            if (id === './MiniGamePlatform') return { isDouyinMiniGameRuntime: () => true, getDouyinMiniGameRuntime: () => runtime };
            throw Error(id);
        }
    };
    if (overrides.off) delete sandbox.__PDD_DOUYIN_BUSINESS__;
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'assets/Scripts/Core/DouyinCloudMgr.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true } }).outputText, sandbox);
    return { manager: module.exports.DouyinCloudMgr.inst, calls, storage };
}
async function testClient() {
    const b = backend();
    const disabled = client(b, { off: true }); assert.equal(disabled.manager.canUseCloud(), false); assert.equal(await disabled.manager.init(), false); assert.equal(disabled.calls.length, 0);
    const c = client(b); assert.equal(await c.manager.init(), false, 'setup required');
    assert.equal((await b.setup({}, { trigger: 'test' })).ok, true);
    assert.deepEqual(await Promise.all([c.manager.init(), c.manager.init()]), [true, true]);
    assert.equal(c.calls.filter(x => x.path === '/businessIdentity').length, 2, 'one failed and one shared retry');
    assert.match(await c.manager.getSdkRoleId(), /^[a-f0-9]{32}$/);
    assert.equal(await c.manager.getSdkRoleId(), await client(b).manager.getSdkRoleId(), 'new client same owner gets stable SDK role');
    const oldBackend = client(b, { response: result => ({ ...result, sdkRoleId: undefined, sdkRoleIdVersion: undefined }) });
    assert.equal(await oldBackend.manager.init(), true, 'old backend does not disable saves');
    await assert.rejects(oldBackend.manager.getSdkRoleId(), /缺少 SDK 角色编号/);
    const result = await c.manager.callFunction('syncUserState', { action: 'get' }); assert.equal(result.ok, true);
    await assert.rejects(c.manager.callFunction('multiplayerSetup'), /暂未接入/);
    await assert.rejects(c.manager.callFunction('multiplayerMaintenance'), /暂未接入/);
    const broken = client(b, { response: result => ({ ...result, businessEnvironment: 'production' }) }); assert.equal(await broken.manager.init(), false);
    b.context.headers['x-tt-openid'] = 'another-user';
    await assert.rejects(c.manager.callFunction('syncUserState', { action: 'get' }), /账号已变化/);
    assert.equal(await c.manager.init(), false, 'do not bind cached save to another account');
    console.log('PASS Douyin business native envelope, dev gates, identity binding, init retry and acknowledgement checks');
}
async function testServer() {
    const b = backend();
    assert.equal((await b.call('businessIdentity', {})).errorCode, 'SETUP_REQUIRED');
    assert.equal((await b.setup({}, b.context)).errorCode, 'ADMIN_CONSOLE_REQUIRED');
    const setup = await b.setup({}, { trigger: 'test' }); assert.equal(setup.transactionsVerified, true);
    assert.equal(Object.keys(b.store().douyin_business_meta).length, 1, 'probe records cleaned');
    const identity = await b.call('businessIdentity', {}), owner = identity.subjectId;
    const digest = text => require('crypto').createHash('sha256').update(text).digest('hex');
    assert.equal(owner, digest(JSON.stringify(['env-nvk6FNcrq5', 'ttf45082ed6a36c15802', 'phone-user-1'])));
    assert.equal(identity.sdkRoleId, digest('shengye-role-v1:' + owner).slice(0, 32));
    assert.equal(identity.sdkRoleIdVersion, 1);
    const analyticsModule = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'cloudfunctions-douyin/analyticsCommon.js'), 'utf8'), {
        module: analyticsModule, exports: analyticsModule.exports,
        require: id => id === './adminAuth' ? require('../cloudfunctions-douyin/adminAuth') : require(id), Buffer, console: silent,
        process: { env: { ...b.env, ANALYTICS_ENVIRONMENT: 'douyin_dev' } },
    });
    const analyticsIdentity = await analyticsModule.exports.receive('analyticsIdentity', {}, b.context);
    assert.equal(analyticsIdentity.subjectId, owner, 'real analytics and business handlers share the same player identity');
    assert.equal((await b.call('businessIdentity', { sdkRoleId: 'forged', openid: 'forged' })).sdkRoleId, identity.sdkRoleId);
    const other = await b.call('businessIdentity', {}, { ...b.context, headers: { ...b.context.headers, 'x-tt-openid': 'other' } });
    assert.notEqual(other.sdkRoleId, identity.sdkRoleId);
    const call = (name, params) => b.call(name, { ...params, expectedOwner: owner });
    const sync = data => call('syncUserState', data), profile = data => call('updateUserProfileAssets', data);
    assert.equal((await b.call('syncUserState', { action: 'get', expectedOwner: 'forged' })).errorCode, 'OWNER_MISMATCH');
    assert.equal((await b.call('businessIdentity', {}, { ...b.context, headers: { ...b.context.headers, 'x-tt-source': 'HTTP' } })).errorCode, 'IDENTITY_REQUIRED');
    assert.equal((await sync({ action: 'save', gameState: { gold: -1 } })).errorCode, 'INVALID_REQUEST');
    assert.equal((await sync({ action: 'save', gameState: { gold: 'Infinity' } })).errorCode, 'INVALID_REQUEST');
    assert.equal((await sync({ action: 'save', gameState: { wechatGiftTotals: { gold: '0' } } })).errorCode, 'INVALID_REQUEST');
    assert.equal((await profile({ action: 'set', gold: 999 })).ok, false);
    assert.equal((await sync({ action: 'save', openid: 'forged' })).ok, false);
    assert.equal((await sync({ action: 'get' })).gameState, null);
    await profile({ action: 'profileGet' });
    const profileOnly = await sync({ action: 'get' });
    assert.equal(profileOnly.gameState.gold, undefined, 'profile startup must not replace an existing local wallet with starter zero');
    assert.equal(profileOnly.gameState.savedLevel, undefined);
    const now = Date.now();
    const snapshot = { savedLevel: 10, gold: 5000, brushCount: 3, magnetCount: 3, freezeCount: 3, stateUpdatedAt: now,
        pvpEconomyRevision: 0, wechatGiftProtocol: 1, wechatGiftTotals: {}, ownedBeanSkinIds: [2000], ownedBackgroundSkinIds: [1005], backgroundSkinResetVersion: 1 };
    const saved = await sync({ action: 'save', gameState: snapshot }); assert.equal(saved.gameState.savedLevel, 10);
    const claims = await Promise.all([1, 2].map(n => profile({ action: 'profileChapterClaim', requestId: 'chapter_' + n })));
    assert.equal(claims.reduce((n, r) => n + r.chapterRewards.granted.length, 0), 2, 'one gold milestone and one skin milestone');
    assert.equal(claims[1].inventory.gold, 5050);
    assert.equal(claims[1].inventory.brushCount, 4, 'chapter1 milestone4 adds one brush exactly once');
    assert.equal(claims[1].inventory.magnetCount, 4, 'chapter1 milestone9 adds one magnet exactly once');
    const retrySave = await sync({ action: 'save', gameState: snapshot }); assert.equal(retrySave.gameState.gold, 5050, 'lost save acknowledgement cannot erase chapter grants');
    assert.equal(retrySave.gameState.brushCount, 4);
    assert.equal(retrySave.gameState.magnetCount, 4);
    assert(retrySave.gameState.ownedBeanSkinIds.includes(2004));
    const old = await sync({ action: 'save', gameState: { ...snapshot, savedLevel: 2, gold: 0, stateUpdatedAt: now - 1 } });
    assert.equal(old.gameState.savedLevel, 10); assert.equal(old.gameState.gold, 5050);
    const catalog = require('../cloudfunctions/updateUserProfileAssets/profile-catalog.json');
    const goldItem = catalog.find(r => r.unlock === 'gold');
    const buy = { action: 'profileBuy', requestId: 'purchase_1', itemId: goldItem.id, pvpEconomyRevision: 0 };
    const bought = await profile(buy); assert.equal(bought.ok, true); assert.equal(bought.inventory.gold, 5050 - goldItem.value);
    const replay = await profile(buy); assert.equal(replay.replay, true); assert.equal(replay.inventory.gold, bought.inventory.gold);
    assert.equal((await profile({ ...buy, itemId: 1001 })).ok, false, 'same request different item must fail');
    const stale = await sync({ action: 'save', gameState: { ...snapshot, stateUpdatedAt: now + 10 } });
    assert.equal(stale.gameState.gold, bought.inventory.gold, 'old revision cannot undo a purchase');
    const selected = await profile({ action: 'profileSelect', itemId: goldItem.id, revision: bought.customization.revision, requestId: 'select_001' }); assert.equal(selected.ok, true);
    assert.equal((await profile({ action: 'profileSelect', itemId: goldItem.id, revision: 0, requestId: 'select_002' })).ok, false);
    const adItem = catalog.find(r => r.unlock === 'ad');
    const ad = { requestId: 'ad_request_1', itemId: adItem.id };
    assert.equal((await profile({ ...ad, action: 'profileAdClaim' })).ok, false);
    assert.equal((await profile({ ...ad, action: 'profileAdBegin' })).ok, true);
    assert.equal((await profile({ action: 'profileGet' })).customization.adWatchCounts[adItem.id], undefined, 'begin alone does not award');
    const before = b.store(); b.failNext('douyin_user_profile');
    const rejected = await profile({ ...ad, action: 'profileAdClaim' }); assert.equal(rejected.ok, false); assert(!JSON.stringify(rejected).includes('secret'));
    assert.deepEqual(b.store(), before, 'receipt write rolls back with failed asset write');
    const rewarded = await profile({ ...ad, action: 'profileAdClaim' }); assert.equal(rewarded.customization.adWatchCounts[adItem.id], 1);
    const repeated = await profile({ ...ad, action: 'profileAdClaim' }); assert.equal(repeated.customization.adWatchCounts[adItem.id], 1);
    assert.equal((await profile({ action: 'profileGet' })).customization.avatarSource, 'catalog');
    b.env.CLOUD_ENV = 'PROD'; assert.equal((await b.call('businessIdentity', {})).errorCode, 'CONFIG_NOT_READY');
    assert.equal((await b.setup({}, { trigger: 'test' })).errorCode, 'ADMIN_CONSOLE_REQUIRED', 'PROD always authenticates management before database configuration');
    assert(b.rollbackCount() >= 3);
    console.log('PASS Mongo transaction adapter: identity, setup, monotonic saves, grants, purchase/ad dedup, revision conflicts, atomic rollback and dev-only gates (database mocked)');
}
async function testRealSaveClient() {
    const b = backend(); await b.setup({}, { trigger: 'test' }); const c = client(b);
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'assets/Scripts/Core/UserStateSyncMgr.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true } }).outputText, {
        module, exports: module.exports, console: silent, setTimeout, clearTimeout,
        require(id) {
            if (id === 'cc') return { _decorator: { ccclass: () => x => x } };
            if (id === './MiniGamePlatform') return { getMiniGameBuildMode: () => 'release' };
            if (id === './PlatformCloudMgr') return { PlatformCloudMgr: { inst: c.manager } };
            if (id === './RuntimeLog') return { runtimeLog() {}, runtimeWarn() {} };
            if (id === './LocalChapterRewards') return require('./helpers/local-chapter-runtime')();
            throw Error(id);
        }
    });
    const mgr = module.exports.UserStateSyncMgr.inst;
    let local; mgr.setAuthoritativeStateHandler(value => { local = value; });
    assert.deepEqual(clone(await mgr.loadState()), { profile: null, gameState: null });
    assert.equal(mgr.queueSave({ gameState: { savedLevel: 5, gold: 120, stateUpdatedAt: Date.now(), wechatGiftProtocol: 1, wechatGiftTotals: {} } }), true);
    assert.equal(await mgr.flushPendingSave(), true);
    assert.equal(local.gameState.savedLevel, 5); assert.equal(local.profile.lastLevelId, 5);
    const claim = await c.manager.callFunction('updateUserProfileAssets', { action: 'profileChapterClaim', requestId: 'real_chain_1' });
    assert.equal(claim.inventory.gold, 170);
    const recovered = await mgr.loadState(); assert.equal(recovered.gameState.gold, 170);
    const catalog = require('../cloudfunctions/updateUserProfileAssets/profile-catalog.json');
    const storage = new Map([['pdd.level', '5']]);
    const deps = {
        cc: { sys: { localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) } } },
        './PlatformCloudMgr': { PlatformCloudMgr: { inst: c.manager } },
        './UserStateSyncMgr': module.exports,
        './ProfileCustomizationConfig': { PROFILE_ITEMS: catalog, RETIRED_PROFILE_ITEMS: require('../cloudfunctions/updateUserProfileAssets/profile-retired.json'), profileItem: id => catalog.find(r => r.id === id), mainlineClearedCount: n => Math.max(0, n - 1) },
        './ProfileResourceService': { profileAssetUrl: () => '' },
        './StartupLocalProgress': { STARTUP_LS_LEVEL: 'pdd.level' },
        './BrowserLevelPreview': { getBrowserLevelPreview: () => ({ active: false }) },
        './CreatorWeb': { isCreatorWeb: () => false },
        './WorkbenchPreviewService': { isWorkbenchPreviewRequested: () => false },
        './MiniGamePlatform': { isMiniGameRuntime: () => true, isDouyinMiniGameRuntime: () => false },
        './LocalChapterRewards': require('./helpers/local-chapter-runtime')(storage),
        './ChapterRewardPolicy': require('../cloudfunctions/updateUserProfileAssets/chapter-reward-policy'),
        './PreviewRewardSave': { PreviewRewardSave: {} }
    };
    function loadProfile() {
        const box = { exports: {} };
        const js = ts.transpileModule(fs.readFileSync(path.join(root, 'assets/Scripts/Core/ProfileCustomizationMgr.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
        vm.runInNewContext(js, { module: box, exports: box.exports, require: id => { if (!deps[id]) throw Error(id); return deps[id]; }, console: silent, setTimeout, clearTimeout });
        return box.exports.ProfileCustomizationMgr.inst;
    }
    const applied = [];
    const runtime = { applyWechatGiftState: data => applied.push(data), grantBeanSkin() {}, grantBackgroundSkin() {} };
    const profile = loadProfile(); await profile.refresh(runtime);
    const duplicate = await profile.claimChapterRewards(runtime); assert.equal(duplicate.granted.length, 0); assert.equal(applied[0].gold, 170);
    const item = catalog.find(r => r.unlock === 'ad' && r.value === 1);
    const requestId = await profile.beginAd(runtime, item.id);
    await profile.claimAd(runtime, item.id, requestId);
    assert(profile.snapshot.ownedAvatarIds.includes(item.id));
    await profile.select(runtime, { itemId: item.id });
    assert.equal(profile.snapshot.equippedAvatarId, item.id);
    assert.equal(storage.has('pdd.profile.customization.ad-pending.v1'), false);
    const restarted = loadProfile(); await restarted.refresh(runtime); assert.equal(restarted.snapshot.equippedAvatarId, item.id);
    console.log('PASS real UserStateSyncMgr -> DouyinCloudMgr -> business handler -> Mongo mock -> save acknowledgement -> chapter claim');
    console.log('PASS real ProfileCustomizationMgr -> native transport -> Mongo adapter -> chapter receipt/ad unlock/select/reload');
}
module.exports = { backend, client, testClient };
if (require.main === module) (async () => { await testServer(); await testClient(); await testRealSaveClient(); })().catch(error => { console.error(error); process.exitCode = 1; });
