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
const TEST_DATA_SOURCE_ID = 987654321;
const TEST_SECRET_KEY = 'd'.repeat(32);

assert.ok(sdkSource.includes('@dn-sdk/minigame v1.5.11'), 'bundled DN SDK must be v1.5.11');
assert.strictEqual(typeof require(sdkPath).SDK, 'function', 'v1.5.11 CommonJS SDK export must load');
assert.ok(!Object.prototype.hasOwnProperty.call(config, 'DN_DATA_SOURCE_ID'), 'client config must not own a DN data-source ID');
assert.ok(!Object.prototype.hasOwnProperty.call(config, 'DN_SECRET_KEY'), 'client config must not own a DN secret');

function createRuntime(options = {}) {
    const events = [];
    const errors = [];
    const instances = [];
    const diagnostics = [];
    const callbackSecrets = options.callbackSecrets || [
        options.callbackSecret === undefined ? TEST_SECRET_KEY : options.callbackSecret,
    ];
    const callbackSourceIds = options.callbackSourceIds || [
        options.callbackSourceId === undefined ? TEST_DATA_SOURCE_ID : options.callbackSourceId,
    ];
    let loginRequestCount = 0;

    class FakeSDK {
        constructor(sdkConfig) {
            events.push('sdk:construct');
            if (options.constructorThrows) throw new Error('mock constructor failure');
            instances.push(this);
            assert.strictEqual(sdkConfig.user_action_set_id, TEST_DATA_SOURCE_ID);
            assert.strictEqual(sdkConfig.secret_key, TEST_SECRET_KEY);
            assert.strictEqual(sdkConfig.appid, config.APP_ID);
            assert.strictEqual(typeof sdkConfig.on_report_complete, 'function');
            assert.strictEqual(typeof sdkConfig.on_report_fail, 'function');
        }
        getInitResult() {
            return options.initResult || { inited: true, initErrMsg: '' };
        }
        setOpenId(openid) {
            events.push('sdk:setOpenId:' + openid);
            if (options.setOpenIdThrows) throw new Error('mock setOpenId failure');
            return { code: options.setOpenIdCode || 0 };
        }
        onRegister() { events.push('sdk:onRegister'); return { code: 0 }; }
        track(actionType) { events.push('sdk:track:' + actionType); return { code: 0 }; }
        onTutorialFinish() { events.push('sdk:onTutorialFinish'); return { code: 0 }; }
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
                const responseIndex = Math.min(loginRequestCount, callbackSecrets.length - 1);
                loginRequestCount += 1;
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
                            isOpenWxSdkCallback: options.callbackEnabled !== false,
                            dataSourceId: callbackSourceIds[Math.min(responseIndex, callbackSourceIds.length - 1)],
                            dataSecretKey: callbackSecrets[responseIndex],
                            callbackUser: 1,
                            deviceUa: 'android',
                        },
                        isGetSpecifyShareData: 0,
                    },
                });
                return;
            }
            if (requestOptions.url.includes('a=reportWxClientCallbackLog')) {
                diagnostics.push(requestOptions.data);
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
    return { sandbox, events, errors, instances, diagnostics };
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
    assert.deepStrictEqual(runtime.events, [], 'wrapper evaluation must not construct the SDK without server config');
    const bufferedLevel = runtime.sandbox.Sygame.syIaaLevelTrack(1, { level_id: 1 });
    const bufferedTutorial = runtime.sandbox.Sygame.syIaaTutorialTrack(1);
    assert.strictEqual(bufferedLevel.buffered, true, 'pre-login level event must enter the client FIFO');
    assert.strictEqual(bufferedTutorial.buffered, true, 'pre-login tutorial event must enter the client FIFO');
    await runtime.sandbox.Sygame.syLogin();
    assert.strictEqual(runtime.instances.length, 1, 'the app must keep exactly one DN SDK instance');
    assert.ok(runtime.events.indexOf('sdk:construct') > runtime.events.indexOf('wx:login'), 'SDK construction must consume the post-login server response');
    assert.ok(runtime.events.includes('sdk:setOpenId:openid-test'), 'post-login flow must still set openid');
    assert.ok(runtime.events.includes('sdk:onRegister'), 'post-login flow must still report registration');
    assert.ok(
        runtime.events.indexOf('sdk:track:LEVEL_ENTER') < runtime.events.indexOf('sdk:track:TUTORIAL_START'),
        'buffered actions must flush in FIFO order',
    );
    assert.ok(
        runtime.events.indexOf('sdk:track:TUTORIAL_START') < runtime.events.indexOf('sdk:onRegister'),
        'buffered startup actions must flush after identity and before registration',
    );
    await runtime.sandbox.Sygame.syLogin();
    assert.strictEqual(runtime.instances.length, 1, 'repeated login must reuse the same matching SDK instance');
    assert.strictEqual(runtime.events.filter((event) => event === 'sdk:construct').length, 1);

    const disabledRuntime = createRuntime({ callbackEnabled: false });
    const disabledBuffered = disabledRuntime.sandbox.Sygame.syIaaLoadFinish();
    assert.strictEqual(disabledBuffered.buffered, true);
    await disabledRuntime.sandbox.Sygame.syLogin();
    assert.strictEqual(disabledRuntime.instances.length, 0, 'server-disabled callback must not construct the SDK');
    assert.strictEqual(disabledRuntime.sandbox.Sygame.isOpenWxCallback, false);
    assert.strictEqual(disabledRuntime.sandbox.Sygame.syIaaLoadFinish(), false, 'disabled reporting must not retain new actions');

    const invalidRuntime = createRuntime({ callbackSecret: 'short' });
    invalidRuntime.sandbox.Sygame.syIaaLevelTrack(1, { level_id: 1 });
    await invalidRuntime.sandbox.Sygame.syLogin();
    assert.strictEqual(invalidRuntime.instances.length, 0, 'invalid server config must fail before construction');
    assert.strictEqual(invalidRuntime.sandbox.Sygame.isOpenWxCallback, false);
    assert.ok(invalidRuntime.diagnostics.some((item) => item.actionType === 'initWxSdk'));

    const failedInitRuntime = createRuntime({
        initResult: { inited: false, initErrMsg: 'mock init failure' },
    });
    await failedInitRuntime.sandbox.Sygame.syLogin();
    await failedInitRuntime.sandbox.Sygame.syLogin();
    assert.strictEqual(
        failedInitRuntime.events.filter((event) => event === 'sdk:construct').length,
        1,
        'failed initialization must not construct a second vendor instance',
    );
    assert.strictEqual(failedInitRuntime.sandbox.Sygame.isOpenWxCallback, false);

    const constructorFailureRuntime = createRuntime({ constructorThrows: true });
    await constructorFailureRuntime.sandbox.Sygame.syLogin();
    await constructorFailureRuntime.sandbox.Sygame.syLogin();
    assert.strictEqual(
        constructorFailureRuntime.events.filter((event) => event === 'sdk:construct').length,
        1,
        'constructor exceptions must not trigger a second construction attempt',
    );
    assert.strictEqual(constructorFailureRuntime.sandbox.Sygame.isOpenWxCallback, false);

    const changedRuntime = createRuntime({
        callbackSecrets: [TEST_SECRET_KEY, 'e'.repeat(32)],
    });
    await changedRuntime.sandbox.Sygame.syLogin();
    await changedRuntime.sandbox.Sygame.syLogin();
    assert.strictEqual(changedRuntime.instances.length, 1, 'changed config must not reconstruct the SDK');
    assert.strictEqual(changedRuntime.sandbox.Sygame.isOpenWxCallback, false, 'changed config must stop identity release');
    assert.strictEqual(
        changedRuntime.events.filter((event) => event.startsWith('sdk:setOpenId:')).length,
        1,
        'changed config must be rejected before a second identity bind',
    );

    const devtoolsRuntime = createRuntime({ platform: 'devtools' });
    assert.strictEqual(devtoolsRuntime.instances.length, 0, 'DevTools must also wait for server config');
    await devtoolsRuntime.sandbox.Sygame.syLogin();
    assert.strictEqual(devtoolsRuntime.instances.length, 1, 'WeChat DevTools must initialize the real SDK after login');

    const helperPath = path.join(__dirname, 'helpers', 'dn-sdk-runtime-scenario.js');
    const scenarios = [
        'success',
        'callback-off',
        'invalid-config',
        'config-change',
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
    assert.ok(wrapperSource.includes('callbackData.dataSourceId'));
    assert.ok(wrapperSource.includes('callbackData.dataSecretKey'));
    assert.ok(!wrapperSource.includes('SY_CONF.DN_DATA_SOURCE_ID'));
    assert.ok(!wrapperSource.includes('SY_CONF.DN_SECRET_KEY'));
    assert.ok(wrapperSource.includes('const DN_PENDING_ACTION_LIMIT = 100;'));
    await testManagerLoginLifecycle();

    console.log('dn-sdk-integration.test.js: PASS');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
