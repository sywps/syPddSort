const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const { installDouyinSySdk } = require('../scripts/install-douyin-sysdk');

const root = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(root, '.planning/douyin-sysdk-test-'));
fs.writeFileSync(path.join(fixture, 'game.js'), 'globalThis.engineStarted=true;\n');
installDouyinSySdk(fixture);
const entry = fs.readFileSync(path.join(fixture, 'game.js'), 'utf8');
installDouyinSySdk(fixture);
assert.strictEqual(fs.readFileSync(path.join(fixture, 'game.js'), 'utf8'), entry, 'postbuild must be repeatable');
assert.ok(!entry.includes('sdk/sysdk-wxapp'), 'Douyin must not load WeChat SDK');
assert.deepStrictEqual(Object.keys(require(path.join(fixture, 'sdk/douyin/sysdk-conf.js'))).sort(), ['APP_ID', 'GAME_KEY']);
const installedVendorPath = path.join(fixture, 'sdk/douyin/vendor.js');
assert(!/openAwemeCustomerService|requestSubscribeMessage/.test(fs.readFileSync(installedVendorPath, 'utf8')),
    'unused Harmony-incompatible payment/subscription calls must not ship');
const rawVendor = require(installedVendorPath)({}, {});
for (const name of ['syPay', 'syGetSubscribe', 'reportSubscribeMessage']) {
    assert.strictEqual(rawVendor[name], undefined, 'unused capability must be omitted: ' + name);
}
assert.strictEqual(typeof rawVendor.formatTime, 'function', 'ad-report dependency must survive pruning');

function harness(launch = { query: {}, scene: 'test' }) {
    let now = new Date('2026-10-09T12:00:00+08:00').getTime();
    const timers = new Map();
    let timerId = 0;
    class Clock extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const logs = [], shows = [], requests = [], logins = [];
    const touches = new Set();
    let navigationCount = 0, guideCount = 0;
    let icon = 1, exist = true;
    const tt = {
        getLaunchOptionsSync: () => launch,
        onShow: callback => shows.push(callback),
        onTouchStart: callback => touches.add(callback),
        offTouchStart: callback => touches.delete(callback),
        login: callbacks => logins.push(callbacks),
        request: options => { requests.push(options); return { abort() {} }; },
        checkScene: callbacks => callbacks.success({ isExist: exist }),
        navigateToScene: callbacks => { navigationCount++; callbacks.success({}); },
        showRevisitGuide: callbacks => { guideCount++; callbacks.success({}); },
    };
    const sandbox = {
        tt, Date: Clock, console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
        setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
        clearTimeout(id) { timers.delete(id); },
    };
    const context = vm.createContext(sandbox);
    const cache = new Map();
    function load(file) {
        if (cache.has(file)) return cache.get(file).exports;
        const module = { exports: {} };
        cache.set(file, module);
        const body = fs.readFileSync(file, 'utf8');
        const execute = vm.runInContext('(function(require,module,exports){\n' + body + '\n})', context);
        execute(id => load(path.resolve(path.dirname(file), id + '.js')), module, module.exports);
        return module.exports;
    }
    sandbox.require = id => load(path.resolve(fixture, id + '.js'));
    vm.runInContext(entry, context);
    const sdk = sandbox.__PDD_DOUYIN_SYSDK__;
    return { sdk, tt, shows, requests, logins, logs, context, touches, launch, timers,
        flushTimers() { for (const fn of Array.from(timers.values())) fn(); },
        nextDay() { now += 86400000; },
        navigation: () => navigationCount, guides: () => guideCount,
        setExist(value) { exist = value; },
        setIcon(value) { icon = value; },
        replyIcon() { const request = requests.findLast(r => r.url.endsWith('getIconShowStatus'));
            assert.ok(request); request.success({ statusCode: 200, data: { status: '1001', iconShowStatus: icon } }); },
    };
}

async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
async function login(h, data = { code: '1001', openid: 'test-channel-id', dy_openid: 'test-tt-id' }) {
    const promise = h.sdk.syLogin();
    h.logins.at(-1).success({ code: 'native-code' });
    h.requests.at(-1).success({ statusCode: 200, data });
    return promise;
}
async function sidebar(h) {
    const pending = h.sdk.refreshSidebar();
    await flush();
    h.replyIcon();
    return pending;
}

function manager(h, platform = 'douyin') {
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(root, 'assets/Scripts/Core/SySDKMgr.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    h.context.module = module;
    h.context.exports = module.exports;
    h.context.require = id => {
        if (id === './MiniGamePlatform') return { isDouyinMiniGameRuntime: () => platform === 'douyin', getDouyinMiniGameRuntime: () => h.tt };
        if (id === './RuntimeLog') return { runtimeLog() {} };
        if (id === './DouyinCloudMgr') return { DouyinCloudMgr: { inst: { getSdkRoleId: async () => 'a'.repeat(32) } } };
        if (id === '../Platform/WeChatShareReturnService') return { installLocalWeChatPassiveShare() { throw Error('Douyin touched WeChat'); } };
        throw Error(id);
    };
    vm.runInContext(code, h.context);
    return module.exports.default.inst;
}

async function main() {
    const h = harness({ scene: 'test', query: { campaign: 'original' }, launch_from: 'homepage', location: 'sidebar_card' });
    assert.strictEqual(h.context.engineStarted, true, 'initialization does not block engine on login');
    assert.strictEqual(h.logins.length, 0, 'login stays deferred');
    assert.strictEqual(h.shows.length, 1);
    h.sdk.init(); h.sdk.init();
    assert.strictEqual(h.shows.length, 1, 'one lifetime foreground subscription');
    assert.strictEqual(h.sdk.getSidebarState().eligibleToday, true, 'cold sidebar entry qualifies');
    assert.strictEqual(h.sdk.getSidebarState().canShow, false, 'visibility waits for backend and capability');
    h.launch.query.campaign = 'later-change';
    const first = h.sdk.syLogin();
    assert.strictEqual(first, h.sdk.syLogin(), 'concurrent login is single-flight');
    h.logins[0].success({ code: 'native-code' });
    h.logins[0].success({ code: 'duplicate-native-code' });
    assert.strictEqual(h.requests.length, 1);
    assert.deepStrictEqual(JSON.parse(h.requests[0].data.query), { campaign: 'original' });
    h.requests[0].success({ statusCode: 200, data: { code: '1001', openid: 'test-channel-id', dy_openid: 'test-tt-id', session_key: 'never-log-session-key' } });
    assert.strictEqual((await first).openid, 'test-channel-id');
    assert.strictEqual(h.sdk.getDiagnostics().loginReady, true);
    assert.strictEqual(h.sdk.getDiagnostics().cloudIdentityVerified, false);
    assert.ok(!JSON.stringify(h.logs).includes('never-log-session-key'));
    await sidebar(h);
    assert.strictEqual(h.sdk.getSidebarState().canShow, true);
    const facade = manager(h);
    facade.init();
    // Legacy IAA hooks must never run on Douyin, even if a stale global exists.
    h.context.Sygame = { syIaaAdTrack() { throw Error('wrong platform SDK'); } };
    facade.reportAdFinish('old-location');
    assert.notStrictEqual(facade.createRewardTransactionId(''), facade.createRewardTransactionId(''), 'ids work with analytics disabled');
    const anotherFacade = manager(h);
    assert.notStrictEqual(facade.createRewardTransactionId(''), anotherFacade.createRewardTransactionId(''));
    const realReport = h.sdk.reportRewardGranted;
    h.sdk.reportRewardGranted = () => { throw Error('report dispatch failure'); };
    assert.doesNotThrow(() => facade.reportRewardGranted('already-granted', 'dispatch-error'), 'reporting failure cannot break a completed reward');
    h.sdk.reportRewardGranted = realReport;

    h.shows[0]({ launch_from: 'normal', location: '' });
    assert.strictEqual(h.sdk.getSidebarState().eligibleToday, false);
    const navigating = h.sdk.sySidebarGuide();
    await navigating;
    assert.strictEqual(h.navigation(), 1);
    assert.strictEqual(h.sdk.getSidebarState().eligibleToday, false, 'navigation success is not a revisit');
    await flush(); h.replyIcon(); await flush();
    h.shows[0]({ launch_from: 'homepage', location: 'sidebar_card' });
    assert.strictEqual(h.sdk.getSidebarState().eligibleToday, true);
    await flush(); h.replyIcon(); await flush();
    h.nextDay();
    assert.strictEqual(h.sdk.getSidebarState().eligibleToday, false, 'eligibility does not roll into a later day');
    h.setIcon('0'); await sidebar(h);
    assert.strictEqual(h.sdk.getSidebarState().canShow, false, 'zero must clear earlier enabled icon');
    await assert.rejects(h.sdk.sySidebarGuide(), /sidebar_not_ready/);
    h.setIcon(1); h.setExist(false); await sidebar(h);
    await h.sdk.sySidebarGuide();
    assert.strictEqual(h.guides(), 1, 'vendor fallback uses native revisit guide');
    h.tt.showRevisitGuide = undefined;
    await sidebar(h);
    assert.strictEqual(h.sdk.getSidebarState().canShow, false, 'unsupported clients hide the entry');

    const before = h.requests.length;
    const report = h.sdk.reportRewardGranted('unlock_slot_row', 'stable-reward-1');
    assert.strictEqual(report, h.sdk.reportRewardGranted('unlock_slot_row', 'stable-reward-1'));
    await flush();
    const roleRequest = h.requests.at(-1);
    assert(roleRequest.url.endsWith('reportRoleInfo'));
    assert.equal(roleRequest.data.role_id, 'a'.repeat(32));
    assert.equal(roleRequest.data.report_type, 'entergame');
    assert.equal(roleRequest.data.server_id, '1');
    assert.equal(h.sdk.getDiagnostics().roleReady, false);
    roleRequest.success({ statusCode: 200, data: { status: 1001 } });
    await flush();
    assert.strictEqual(h.requests.length, before + 2);
    const ad = h.requests.at(-1);
    assert.equal(ad.data.role_id, roleRequest.data.role_id);
    assert.strictEqual(ad.data.position, 1);
    assert.strictEqual(ad.data.task, 'unlock_slot_row');
    assert.strictEqual(ad.data.wecha_id, 'test-channel-id');
    ad.success({ statusCode: 200, data: { status: '1001' } });
    await report;
    await h.sdk.reportRewardGranted('unlock_slot_row', 'stable-reward-1');
    assert.strictEqual(h.requests.length, before + 2);
    assert.equal(h.sdk.getDiagnostics().adReportAcceptedCount, 1);
    assert.equal(h.sdk.getDiagnostics().roleReady, true);
    const failedReport = h.sdk.reportRewardGranted('revive', 'stable-reward-2');
    await flush();
    h.requests.at(-1).fail({});
    await assert.rejects(failedReport, /ad_report_request_failed/);
    assert.strictEqual(failedReport, h.sdk.reportRewardGranted('revive', 'stable-reward-2'), 'uncertain receipt cannot trigger a second request');
    await assert.rejects(h.sdk.reportRewardGranted('revive', 'stable-reward-2'));

    const rejected = h.sdk.reportRewardGranted('profile_avatar_unlock', 'stable-reward-3');
    await flush();
    h.requests.at(-1).success({ statusCode: 200, data: { status: 4001,
        msg: '参数错误 test-channel-id test-tt-id "token":"never-print-token" secret=hidden-secret https://example.invalid/private ' + 'x'.repeat(300),
        privateField: 'never-print-full-response' } });
    await assert.rejects(rejected, /ad_report_rejected \(4001\): 参数错误/);
    const rejection = h.sdk.getDiagnostics().lastAdReportRejection;
    assert.equal(rejection.code, 4001);
    assert(rejection.message.length <= 240);
    const safeOutput = JSON.stringify([rejection, h.logs]);
    for (const secret of ['test-channel-id', 'test-tt-id', 'never-print-token', 'hidden-secret', 'example.invalid/private',
        'never-print-full-response', 'x'.repeat(24)]) assert(!safeOutput.includes(secret), secret);
    const rejectedRequests = h.requests.length;
    assert.strictEqual(rejected, h.sdk.reportRewardGranted('profile_avatar_unlock', 'stable-reward-3'));
    await assert.rejects(rejected);
    assert.equal(h.requests.length, rejectedRequests, 'rejected report remains single-shot');
    assert.equal(h.sdk.getDiagnostics().adReportFailedCount, 2);
    assert.equal(h.sdk.getDiagnostics().roleReportAttempts, 1, 'successful role is reported once per process');

    const roleTest = harness(); await login(roleTest);
    let resolveIdentity;
    roleTest.sdk.setRoleIdentityProvider(() => new Promise(resolve => { resolveIdentity = resolve; }));
    const initRole = roleTest.sdk.ensureRole();
    assert.strictEqual(initRole, roleTest.sdk.ensureRole(), 'concurrent role initialization shares request');
    await flush(); roleTest.flushTimers(); await assert.rejects(initRole, /role_timeout/);
    const requestsBeforeLateIdentity = roleTest.requests.length;
    resolveIdentity('b'.repeat(32)); await flush();
    assert.equal(roleTest.requests.length, requestsBeforeLateIdentity, 'late identity cannot start role reporting');
    assert.equal(roleTest.sdk.getDiagnostics().roleReportAttempts, 0);
    roleTest.sdk.setRoleIdentityProvider(async () => 'b'.repeat(32));
    const roleRetry = roleTest.sdk.ensureRole(); await flush();
    const pendingRole = roleTest.requests.at(-1);
    roleTest.flushTimers(); await assert.rejects(roleRetry, /role_timeout/);
    pendingRole.success({ statusCode: 200, data: { status: 1001 } }); await flush();
    assert.equal(roleTest.sdk.getDiagnostics().roleReady, false, 'late role acknowledgement cannot enable ad reporting');
    const roleRejected = roleTest.sdk.reportRewardGranted('avatar', 'reject-role'); await flush();
    roleTest.requests.at(-1).success({ statusCode: 200, data: { status: 4001, info: '角色信息不完整 token=do-not-log' } });
    await assert.rejects(roleRejected, /role_report_rejected/);
    assert(!roleTest.requests.some(r => r.url.endsWith('uploadCasualAction')));
    assert(!JSON.stringify(roleTest.logs).includes('do-not-log'));
    assert.equal(roleTest.sdk.getDiagnostics().adReportFailedCount, 1);
    assert.strictEqual(roleRejected, roleTest.sdk.reportRewardGranted('avatar', 'reject-role'));
    const goodRole = roleTest.sdk.ensureRole(); await flush();
    roleTest.requests.at(-1).success({ statusCode: 200, data: { status: 1001 } }); await goodRole;
    roleTest.sdk.setRoleIdentityProvider(async () => 'c'.repeat(32));
    await assert.rejects(roleTest.sdk.ensureRole(), /role_identity_changed/);
    assert.equal(roleTest.sdk.getDiagnostics().roleReady, false, 'do not rebind an SDK session to another business user');

    const warm = harness(); await login(warm);
    assert.equal(await manager(warm).login(), true, 'SDK login must not wait for cloud role reporting');
    await flush();
    const warmRole = warm.requests.find(r => r.url.endsWith('reportRoleInfo'));
    assert(warmRole, 'real manager warms role initialization at login');
    assert.equal(warm.sdk.getDiagnostics().roleReady, false);
    warmRole.success({ statusCode: 200, data: { status: 1001 } }); await flush();
    assert.equal(warm.sdk.getDiagnostics().roleReady, true);
    assert(!JSON.stringify(warm.sdk.getDiagnostics()).includes('a'.repeat(32)), 'diagnostics do not expose player identifiers');
    for (const invalidIdentity of ['', 'x'.repeat(64), null]) {
        const invalidRole = harness(); await login(invalidRole);
        invalidRole.sdk.setRoleIdentityProvider(async () => invalidIdentity);
        await assert.rejects(invalidRole.sdk.reportRewardGranted('avatar', 'invalid-role'), /role_identity_invalid/);
        assert(!invalidRole.requests.some(r => r.url.endsWith('reportRoleInfo') || r.url.endsWith('uploadCasualAction')));
    }

    for (const [data, expected] of [
        [{ code: 4001, openid: 'not-ready' }, /login_code_unconfirmed/],
        [{ code: 0, openid: 'unknown-success-semantics' }, /login_code_unconfirmed/],
        [{ status: 1001 }, /login_identity_missing/],
        [{ code: 1001, openid: 'x', real_openid: 123, dy_openid: 'b' }, /identity_invalid/],
        [{ code: 1001, openid: 'x', real_openid: 'a', dy_openid: {} }, /identity_invalid/],
    ]) {
        const bad = harness();
        await assert.rejects(login(bad, data), expected);
        assert.strictEqual(bad.sdk.getDiagnostics().loginReady, false);
    }
    for (const fields of [
        { real_openid: 'vendor-real', dy_openid: 'douyin-id' },
        { real_openid: 'vendor-real' }, { dy_openid: 'douyin-id' }, {},
    ]) {
        const independent = harness();
        const result = await login(independent, { code: 1001, openid: 'channel-account', ...fields });
        assert.strictEqual(result.openid, 'channel-account');
        assert.strictEqual(result.dyOpenid, fields.dy_openid || '');
        assert.strictEqual(result.realOpenid, fields.real_openid || '');
        assert.deepStrictEqual(await independent.sdk.syLogin(), result, 'cached identity keeps both distinct fields');
        assert.strictEqual(independent.sdk.getDiagnostics().cloudIdentityVerified, false);
        assert(!JSON.stringify(independent.logs).includes('channel-account'));
    }
    for (const result of ['fail', 'empty', 'http', 'network']) {
        const bad = harness();
        const promise = bad.sdk.syLogin();
        if (result === 'fail') bad.logins[0].fail({});
        else if (result === 'empty') bad.logins[0].success({});
        else {
            bad.logins[0].success({ code: 'x' });
            if (result === 'http') bad.requests[0].success({ statusCode: 500, data: { openid: 'x' } });
            else bad.requests[0].fail({});
        }
        await assert.rejects(promise);
    }
    const delayed = harness();
    const old = delayed.sdk.syLogin();
    delayed.logins[0].success({ code: 'old' });
    const oldRequest = delayed.requests[0];
    delayed.flushTimers();
    await assert.rejects(old, /login_timeout/);
    const fresh = login(delayed, { code: 1001, openid: 'new-identity', real_openid: 'new-tt' });
    oldRequest.success({ statusCode: 200, data: { code: 1001, openid: 'old-identity' } });
    assert.strictEqual((await fresh).openid, 'new-identity');
    assert.strictEqual((await delayed.sdk.syLogin()).openid, 'new-identity', 'late response must not replace current identity');
    const pendingNative = harness();
    const timedNative = pendingNative.sdk.syLogin();
    pendingNative.flushTimers();
    await assert.rejects(timedNative);
    pendingNative.logins[0].success({ code: 'too-late' });
    assert.strictEqual(pendingNative.requests.length, 0);
    console.log('douyin-sysdk-runtime.test.js passed (native/network mocks; no real SDK requests)');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
