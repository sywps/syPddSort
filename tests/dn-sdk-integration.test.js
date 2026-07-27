const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const wrapperPath = path.join(projectRoot, 'sdk', 'sysdk-wxapp.js');
const sdkPath = path.join(projectRoot, 'sdk', 'wxsdk', 'index.js');
const config = require(path.join(projectRoot, 'sdk', 'sysdk-conf.js'));
const wrapperSource = fs.readFileSync(wrapperPath, 'utf8');
const sdkSource = fs.readFileSync(sdkPath, 'utf8');

assert.ok(sdkSource.includes('@dn-sdk/minigame v1.5.11'), 'bundled DN SDK must be v1.5.11');
assert.strictEqual(typeof require(sdkPath).SDK, 'function', 'v1.5.11 CommonJS SDK export must load');
assert.ok(Number.isInteger(config.DN_DATA_SOURCE_ID) && config.DN_DATA_SOURCE_ID > 0, 'DN data-source ID must be a positive integer');
assert.strictEqual(String(config.DN_SECRET_KEY || '').length, 32, 'DN secret key must contain 32 characters');

function createRuntime(options = {}) {
    const events = [];
    const errors = [];
    const instances = [];
    const callbackSecret = options.callbackSecret === undefined
        ? config.DN_SECRET_KEY
        : options.callbackSecret;

    class FakeSDK {
        constructor(sdkConfig) {
            events.push('sdk:construct');
            instances.push(this);
            assert.strictEqual(sdkConfig.user_action_set_id, config.DN_DATA_SOURCE_ID);
            assert.strictEqual(sdkConfig.secret_key, config.DN_SECRET_KEY);
            assert.strictEqual(sdkConfig.appid, config.APP_ID);
            assert.strictEqual(typeof sdkConfig.on_report_complete, 'function');
            assert.strictEqual(typeof sdkConfig.on_report_fail, 'function');
        }
        getInitResult() { return { inited: true, initErrMsg: '' }; }
        setOpenId(openid) { events.push('sdk:setOpenId:' + openid); return { code: 0 }; }
        onRegister() { events.push('sdk:onRegister'); return { code: 0 }; }
        track(actionType) { events.push('sdk:track:' + actionType); return { code: 0 }; }
    }

    const wx = {
        createCanvas() {
            return {};
        },
        getSystemInfoSync() {
            return {
                platform: options.platform || 'ios',
                host: { appId: config.APP_ID },
            };
        },
        getAccountInfoSync() {
            return { miniProgram: { appId: config.APP_ID } };
        },
        login(callbacks) {
            events.push('wx:login');
            callbacks.success({ code: 'test-login-code' });
        },
        request(requestOptions) {
            if (/[?&]a=login(?:&|$)/.test(requestOptions.url)) {
                requestOptions.success({
                    data: {
                        code: 1001,
                        openid: 'openid-test',
                        real_openid: 'real-openid-test',
                        session_key: 'session-key-test',
                        jump_version: 0,
                        isOpenGetMobile: false,
                        androidPayConf: {
                            is_open_service_deduct: 0,
                            is_open_client_loop: 0,
                        },
                        wxSdkCallbackData: {
                            isOpenWxSdkCallback: true,
                            dataSourceId: config.DN_DATA_SOURCE_ID,
                            dataSecretKey: callbackSecret,
                            callbackUser: 1,
                            deviceUa: 'android',
                        },
                        isGetSpecifyShareData: 0,
                    },
                });
                return;
            }
            if (requestOptions.success) requestOptions.success({ data: {} });
        },
        onShareAppMessage() {},
        onShareTimeline() {},
        onAddToFavorites() {},
    };

    const sandbox = {
        wx,
        require(request) {
            if (request === './sysdk-conf') return config;
            if (request === './wxsdk/index.js') return { SDK: FakeSDK };
            throw new Error('unexpected require: ' + request);
        },
        console: {
            log() {},
            warn() {},
            error(...args) { errors.push(args.join(' ')); },
        },
        setInterval() {
            throw new Error('order polling must not start in this test');
        },
    };
    vm.runInNewContext(wrapperSource, sandbox, { filename: wrapperPath });
    return { sandbox, events, errors, instances };
}

function loadSySdkManager(sygame) {
    const source = fs.readFileSync(
        path.join(projectRoot, 'assets', 'Scripts', 'Core', 'SySDKMgr.ts'),
        'utf8',
    );
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
    const module = { exports: {} };
    const sandbox = {
        module,
        exports: module.exports,
        Sygame: sygame,
        wx: {
            getLaunchOptionsSync() {
                return { query: {}, scene: 1001 };
            },
        },
        location: { hostname: '' },
        require(request) {
            if (request === './RuntimeLog') return { runtimeLog() {} };
            throw new Error('unexpected manager require: ' + request);
        },
        console: { log() {}, warn() {}, error() {} },
        Promise,
        setTimeout,
        clearTimeout,
    };
    vm.runInNewContext(output, sandbox, { filename: 'SySDKMgr.ts' });
    return module.exports.default.inst;
}

async function testManagerLoginLifecycle() {
    let calls = 0;
    const successfulSdk = {
        isOpenWxCallback: false,
        init() {},
        syLogin() {
            calls += 1;
            return new Promise((resolve) => {
                setTimeout(() => {
                    successfulSdk.isOpenWxCallback = true;
                    resolve();
                }, 5);
            });
        },
    };
    const successfulManager = loadSySdkManager(successfulSdk);
    successfulManager.init();
    const first = successfulManager.login();
    const second = successfulManager.login();
    assert.strictEqual(first, second, 'concurrent startup callers must share one login promise');
    assert.strictEqual(await first, true);
    assert.strictEqual(calls, 1, 'shared login must call the backend once');

    let retryCalls = 0;
    const retrySdk = {
        isOpenWxCallback: false,
        init() {},
        syLogin() {
            retryCalls += 1;
            if (retryCalls === 1) {
                const error = new Error('mock backend failure');
                error.stage = 'backend_request_failed';
                return Promise.reject(error);
            }
            retrySdk.isOpenWxCallback = true;
            return Promise.resolve();
        },
    };
    const retryManager = loadSySdkManager(retrySdk);
    retryManager.init();
    assert.strictEqual(await retryManager.login(), true, 'explicit login failure should retry once');
    assert.strictEqual(retryCalls, 2);

    let unresolvedIdentityCalls = 0;
    const unresolvedIdentitySdk = {
        isOpenWxCallback: false,
        init() {},
        syLogin() {
            unresolvedIdentityCalls += 1;
            return Promise.resolve();
        },
    };
    const unresolvedManager = loadSySdkManager(unresolvedIdentitySdk);
    unresolvedManager.init();
    assert.strictEqual(
        await unresolvedManager.login(),
        false,
        'resolved business login without bound identity must not be reported ready',
    );
    assert.strictEqual(unresolvedIdentityCalls, 1, 'resolved package/business state must not duplicate UI through retry');
}

async function main() {
    assert.strictEqual(
        config.SY_PACKAGE_GUIDE_ENABLED,
        false,
        'release package guide policy must be fixed off in local config',
    );
    const runtime = createRuntime();
    assert.deepStrictEqual(runtime.events, ['sdk:construct'], 'SDK must initialize during wrapper evaluation');
    await runtime.sandbox.Sygame.syLogin();
    assert.strictEqual(runtime.instances.length, 1, 'the app must keep exactly one DN SDK instance');
    assert.ok(runtime.events.indexOf('sdk:construct') < runtime.events.indexOf('wx:login'), 'SDK construction must precede wx.login');
    assert.strictEqual(runtime.events.filter((event) => event === 'sdk:construct').length, 1, 'login must not reconstruct the SDK');
    assert.ok(runtime.events.includes('sdk:setOpenId:openid-test'), 'post-login flow must still set openid');
    assert.ok(runtime.events.includes('sdk:onRegister'), 'post-login flow must still report registration');

    const mismatchRuntime = createRuntime({ callbackSecret: '0'.repeat(32) });
    await mismatchRuntime.sandbox.Sygame.syLogin();
    assert.ok(
        mismatchRuntime.events.some((event) => event.startsWith('sdk:setOpenId:')),
        'backend callback metadata must not block mandatory OpenID binding',
    );

    const devtoolsRuntime = createRuntime({ platform: 'devtools' });
    assert.strictEqual(devtoolsRuntime.instances.length, 1, 'WeChat DevTools must initialize the real SDK');

    const helperPath = path.join(__dirname, 'helpers', 'dn-sdk-runtime-scenario.js');
    const scenarios = [
        'success',
        'callback-off',
        'callback-mismatch',
        'devtools',
        'backend-fail',
        'wx-login-fail',
        'missing-openid',
        'package-cancel',
        'package-mandatory',
        'package-missing-openid',
        'maintenance',
        'package-modal-throw',
        'jump-version',
        'identity-throws',
        'post-login-throw',
        'report-fail',
        'code-51000',
    ];
    for (const scenario of scenarios) {
        const result = spawnSync(process.execPath, [helperPath, scenario], {
            cwd: projectRoot,
            encoding: 'utf8',
            timeout: 10000,
        });
        assert.strictEqual(
            result.status,
            0,
            `real SDK scenario "${scenario}" failed:\n${result.stdout}\n${result.stderr}`,
        );
    }

    const managerSource = fs.readFileSync(
        path.join(projectRoot, 'assets', 'Scripts', 'Core', 'SySDKMgr.ts'),
        'utf8',
    );
    const adFlowSource = fs.readFileSync(
        path.join(projectRoot, 'assets', 'Scripts', 'Core', 'GameCtrlModules', 'HomeAdFlowModule.ts'),
        'utf8',
    );
    assert.ok(managerSource.includes('s.syIaaAdTrack(4, {position: pos})'), 'native visible state must map to AD_IMPRESSION');
    assert.ok(!managerSource.includes('reportAdClick('), 'manager must not expose a game-CTA-as-native-click helper');
    assert.ok(!adFlowSource.includes('SySDKMgr.inst.reportAdClick(page)'), 'game CTA must not report a DN ad click');
    assert.ok(wrapperSource.includes('on_report_complete: handleDnReportOutcome'));
    assert.ok(wrapperSource.includes('on_report_fail: handleDnReportOutcome'));
    assert.ok(wrapperSource.includes('const SY_PACKAGE_GUIDE_ENABLED = SY_CONF.SY_PACKAGE_GUIDE_ENABLED === true;'));
    assert.ok(wrapperSource.includes('Sygame.jumpVersion = SY_PACKAGE_GUIDE_ENABLED ? responseData.jump_version : 0;'));
    assert.ok(wrapperSource.includes("createSyPackageGuideBlockedResult('syPackageJump')"));
    assert.ok(wrapperSource.includes("createSyPackageGuideBlockedResult('syPackageShow')"));
    assert.ok(wrapperSource.includes("createSyPackageGuideBlockedResult('syDealJumpData')"));
    assert.ok(!wrapperSource.includes("platform || '').toLowerCase() === 'devtools'"));
    assert.ok(!wrapperSource.includes('callbackData.dataSecretKey'));
    await testManagerLoginLifecycle();

    console.log('dn-sdk-integration.test.js: PASS');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
