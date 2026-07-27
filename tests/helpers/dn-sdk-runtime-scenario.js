const assert = require('assert');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const config = require(path.join(projectRoot, 'sdk', 'sysdk-conf.js'));
const scenario = process.argv[2] || 'success';
const OPENID = 'o'.repeat(28);

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRuntime() {
    const storage = new Map();
    const requests = [];
    const reportRequests = [];
    const diagnosticRequests = [];
    const listeners = {};
    const externalEffects = {
        modal: 0,
        touchStart: 0,
        navigate: 0,
        clipboard: 0,
        customerService: 0,
        previewImage: 0,
    };
    const reportCode = scenario === 'code-51000' ? 51000 : 0;

    const wx = {
        createCanvas() {
            return {};
        },
        getSystemInfoSync() {
            return {
                platform: scenario === 'devtools' ? 'devtools' : 'ios',
                system: 'iOS 18.3',
                SDKVersion: '3.7.10',
                version: '8.0.60',
                brand: 'Apple',
                model: 'iPhone',
                screenHeight: 844,
                screenWidth: 390,
                benchmarkLevel: 50,
                host: { appId: config.APP_ID },
            };
        },
        getSystemInfo(callbacks) {
            callbacks.success(wx.getSystemInfoSync());
        },
        getAccountInfoSync() {
            return {
                miniProgram: {
                    appId: config.APP_ID,
                    envVersion: 'release',
                    version: '1.0.0',
                },
            };
        },
        getLaunchOptionsSync() {
            return { scene: 1001, query: {} };
        },
        getStorageSync(key) {
            return storage.has(key) ? storage.get(key) : '';
        },
        setStorageSync(key, value) {
            storage.set(key, value);
        },
        removeStorageSync(key) {
            storage.delete(key);
        },
        getNetworkType(callbacks) {
            callbacks.success({ networkType: 'wifi' });
        },
        onNetworkStatusChange(callback) {
            listeners.network = callback;
        },
        onShow(callback) {
            listeners.show = callback;
        },
        onHide(callback) {
            listeners.hide = callback;
        },
        onAddToFavorites(callback) {
            listeners.favorite = callback;
        },
        onShareAppMessage(callback) {
            listeners.shareApp = callback;
        },
        onShareTimeline(callback) {
            listeners.shareTimeline = callback;
        },
        onDirectAdStatusChange(callback) {
            listeners.directAd = callback;
        },
        getDirectAdStatusSync() {
            return { isInMask: false, isInDirectGameAd: false };
        },
        showModal(callbacks) {
            externalEffects.modal += 1;
            if (scenario === 'package-modal-throw') {
                throw new Error('mock showModal failure');
            }
            setTimeout(() => callbacks.success({ cancel: true, confirm: false }), 0);
        },
        showShareMenu() {},
        onTouchStart(callback) {
            externalEffects.touchStart += 1;
            listeners.touchStart = callback;
        },
        navigateToMiniProgram(options) {
            externalEffects.navigate += 1;
            if (options && options.success) options.success({});
        },
        setClipboardData(options) {
            externalEffects.clipboard += 1;
            if (options && options.success) options.success({});
        },
        openCustomerServiceConversation(options) {
            externalEffects.customerService += 1;
            if (options && options.success) options.success({});
        },
        previewImage(options) {
            externalEffects.previewImage += 1;
            if (options && options.success) options.success({});
        },
        login(callbacks) {
            setTimeout(() => {
                if (scenario === 'wx-login-fail') {
                    callbacks.fail({ errMsg: 'login:fail mocked', errno: 10001 });
                    return;
                }
                callbacks.success({ code: 'mock-login-code' });
            }, 0);
        },
        request(options) {
            requests.push({ url: options.url, method: options.method || 'GET' });

            if (/[?&]a=login(?:&|$)/.test(options.url)) {
                if (scenario === 'backend-fail') {
                    setTimeout(() => options.fail({
                        errMsg: 'request:fail backend unavailable',
                        errno: 10002,
                    }), 0);
                    return;
                }
                const isPackageLogin = [
                    'package-cancel',
                    'package-mandatory',
                    'package-missing-openid',
                    'package-modal-throw',
                ].includes(scenario);
                const loginCode = isPackageLogin
                    ? 3001
                    : scenario === 'maintenance'
                        ? 5001
                        : 1001;
                setTimeout(() => options.success({
                    statusCode: 200,
                    data: {
                        code: loginCode,
                        openid: scenario === 'missing-openid' || scenario === 'package-missing-openid' ? '' : OPENID,
                        real_openid: OPENID,
                        session_key: 'session-key',
                        jump_version: scenario === 'jump-version' ? 1 : 0,
                        jump_mandatory: scenario === 'package-mandatory' ? 1 : 0,
                        jump_mandatory_number: 1,
                        isOpenGetMobile: scenario === 'post-login-throw',
                        androidPayConf: {
                            is_open_service_deduct: 0,
                            is_open_client_loop: 0,
                        },
                        wxSdkCallbackData: {
                            isOpenWxSdkCallback: scenario !== 'callback-off',
                            dataSourceId: config.DN_DATA_SOURCE_ID,
                            dataSecretKey: scenario === 'callback-mismatch'
                                ? '0'.repeat(32)
                                : config.DN_SECRET_KEY,
                            callbackUser: 0,
                            deviceUa: 'android',
                        },
                        isGetSpecifyShareData: 0,
                    },
                }), 0);
                return;
            }

            if (options.url.includes('a=reportWxClientCallbackLog')) {
                diagnosticRequests.push(options.data);
                setTimeout(() => options.success({
                    statusCode: 200,
                    data: { code: 0 },
                }), 0);
                return;
            }

            if (options.url.includes('/data-nexus-cgi/miniprogram')) {
                const item = { outcome: 'pending' };
                reportRequests.push(item);
                if (scenario === 'report-fail') {
                    item.outcome = 'network-fail';
                    setTimeout(() => options.fail({
                        errMsg: 'request:fail url not in domain list',
                        errno: 600001,
                    }), 0);
                    return;
                }
                item.outcome = reportCode === 0 ? 'accepted' : `code-${reportCode}`;
                setTimeout(() => options.success({
                    statusCode: 200,
                    data: {
                        code: reportCode,
                        message: reportCode === 0 ? 'success' : 'mock rejection',
                        trace_id: 'trace-test',
                    },
                    header: { 'Server-Time': String(Date.now()) },
                }), 0);
                return;
            }

            if (options.url.includes('api.datanexus.qq.com')) {
                setTimeout(() => options.success({
                    statusCode: 200,
                    data: { code: 0, data: {} },
                    header: { 'Server-Time': String(Date.now()) },
                }), 0);
                return;
            }

            setTimeout(() => {
                if (options.success) {
                    options.success({ statusCode: 200, data: {} });
                }
            }, 0);
        },
    };

    return { wx, requests, reportRequests, diagnosticRequests, externalEffects };
}

function findDiagnostics(runtime, actionType) {
    return runtime.diagnosticRequests.filter((item) => item.actionType === actionType);
}

function assertNoPackageGuideSideEffects(runtime) {
    assert.deepStrictEqual(
        runtime.externalEffects,
        {
            modal: 0,
            touchStart: 0,
            navigate: 0,
            clipboard: 0,
            customerService: 0,
            previewImage: 0,
        },
        'disabled package guide must not invoke any modal, global touch, jump, clipboard, customer service, or preview API',
    );
    assert.strictEqual(
        runtime.requests.filter((item) => item.url.includes('a=getDealPackageInfo')).length,
        0,
        'disabled package guide must not request package destination data',
    );
}

async function assertPackageGuideApisBlocked(runtime) {
    const probes = [
        ['syPackageJump', await global.Sygame.syPackageJump()],
        ['syPackageShow', await global.Sygame.syPackageShow({ data: {} }, 1, false)],
        ['syDealJumpData', await global.Sygame.syDealJumpData({
            data: { jump_to: 'wx0000000000000000', jump_path: 'pages/index/index' },
        })],
        ['syDealJumpData', await global.Sygame.syDealJumpData({
            data: { jump_copy: 'blocked-copy' },
        })],
        ['syDealJumpData', await global.Sygame.syDealJumpData({
            data: { jump_copy_apk: 'blocked-apk-copy' },
        })],
    ];
    probes.forEach(([action, result]) => {
        assert.strictEqual(result && result.blocked, true, `${action} must report the local client block`);
        assert.strictEqual(result && result.action, action);
        assert.strictEqual(result && result.reason, 'client_package_guide_disabled');
    });
    assertNoPackageGuideSideEffects(runtime);
}

async function run() {
    const runtime = createRuntime();
    global.wx = runtime.wx;
    require(path.join(projectRoot, 'sdk', 'sysdk-wxapp.js'));

    assert.ok(global.Sygame.wxSdk, 'real vendor SDK instance must exist');
    assert.deepStrictEqual(
        global.Sygame.wxSdkInitResult,
        { inited: true, initErrMsg: '' },
        'real vendor SDK must initialize successfully',
    );
    global.Sygame.init({ query: {}, scene: 1001 });
    if (scenario === 'identity-throws') {
        global.Sygame.wxSdk.setOpenId = () => {
            throw new Error('mock setOpenId failure');
        };
    }
    if (scenario === 'post-login-throw') {
        global.Sygame.syGetPhoneNumber = () => {
            throw new Error('mock optional post-login failure');
        };
    }

    const preIdentityLevel = global.Sygame.syIaaLevelTrack(1, { level_id: 1 });
    const preIdentityTutorial = global.Sygame.syIaaTutorialTrack(1);
    assert.strictEqual(preIdentityLevel.code, 0, 'pre-identity level event must enter vendor queue');
    assert.strictEqual(preIdentityTutorial.code, 0, 'pre-identity tutorial event must enter vendor queue');
    assert.strictEqual(runtime.reportRequests.length, 0, 'vendor must wait for identity before network delivery');

    let loginState = 'resolved';
    let loginResult = null;
    try {
        loginResult = await global.Sygame.syLogin();
    } catch (error) {
        loginState = `rejected:${error && error.stage}`;
    }

    if ([
        'backend-fail',
        'wx-login-fail',
        'missing-openid',
        'package-missing-openid',
        'maintenance',
    ].includes(scenario)) {
        assert.ok(loginState.startsWith('rejected:'), 'login failure must settle as rejection');
        assert.strictEqual(global.Sygame.isOpenWxCallback, false);
        assert.strictEqual(runtime.reportRequests.length, 0);
        if (scenario === 'package-missing-openid') {
            await assertPackageGuideApisBlocked(runtime);
        }
        return;
    }

    assert.strictEqual(loginState, 'resolved');
    if ([
        'package-cancel',
        'package-mandatory',
        'package-modal-throw',
    ].includes(scenario)) {
        assert.strictEqual(loginResult.code, 1001, 'blocked 3001 must normalize to a playable login result');
        assert.strictEqual(loginResult.jump_version, 0);
        assert.strictEqual(global.Sygame.jumpVersion, 0);
        await assertPackageGuideApisBlocked(runtime);
    } else if (scenario === 'jump-version') {
        assert.strictEqual(loginResult.code, 1001);
        assert.strictEqual(global.Sygame.jumpVersion, 0, 'server jump_version must not enable the package guide');
        await assertPackageGuideApisBlocked(runtime);
    }
    if (scenario === 'identity-throws') {
        assert.strictEqual(global.Sygame.isOpenWxCallback, false);
        assert.strictEqual(runtime.reportRequests.length, 0);
        assert.ok(findDiagnostics(runtime, 'setOpenId').length > 0);
        return;
    }
    assert.strictEqual(
        global.Sygame.isOpenWxCallback,
        true,
        'valid OpenID must enable base reporting independent of optional callback metadata',
    );
    global.Sygame.syIaaLoadFinish();
    global.Sygame.syIaaAdTrack(4, { position: 'test' });
    await wait(1400);

    assert.ok(runtime.reportRequests.length > 0, 'queued events must reach Tencent request endpoint');
    const localQueueLogs = runtime.diagnosticRequests.filter(
        (item) => item.result && item.result.stage === 'local_queue',
    );
    assert.ok(localQueueLogs.length >= 4, 'local SDK results must be labeled as queue outcomes');
    assert.ok(localQueueLogs.every((item) => item.result.queued === true));

    const accepted = findDiagnostics(runtime, 'dnReportAccepted');
    const rejected = findDiagnostics(runtime, 'dnReportRejected');
    if (scenario === 'report-fail' || scenario === 'code-51000') {
        assert.strictEqual(accepted.length, 0, 'failed remote responses must not be labeled accepted');
        assert.ok(rejected.length > 0, 'failed remote responses must emit rejected diagnostics');
        assert.ok(rejected.every((item) => item.result.accepted === false));
    } else {
        assert.ok(accepted.length > 0, 'code=0 response must emit accepted diagnostics');
        assert.strictEqual(rejected.length, 0);
        const types = accepted.flatMap((item) => item.result.actionTypes || []);
        assert.ok(types.includes('LEVEL_ENTER'), 'pre-identity level event must flush after identity');
        assert.ok(types.includes('TUTORIAL_START'), 'pre-identity tutorial event must flush after identity');
        assert.ok(types.includes('AD_IMPRESSION'), 'native-visible event must use AD_IMPRESSION');
    }

    const diagnosticsText = JSON.stringify(runtime.diagnosticRequests);
    assert.ok(!diagnosticsText.includes(config.DN_SECRET_KEY), 'diagnostics must not expose the DN secret');
    assert.ok(!diagnosticsText.includes(OPENID), 'DN diagnostics must not expose OpenID');
    assert.ok(!diagnosticsText.includes('level_id'), 'remote diagnostics must not expose raw action parameters');
}

run()
    .then(() => {
        console.log(`dn-sdk-runtime-scenario.js ${scenario}: PASS`);
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
