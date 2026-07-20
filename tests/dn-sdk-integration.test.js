const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
        }
        getInitResult() { return { inited: true, initErrMsg: '' }; }
        setOpenId(openid) { events.push('sdk:setOpenId:' + openid); return { code: 0 }; }
        onRegister() { events.push('sdk:onRegister'); return { code: 0 }; }
        track(actionType) { events.push('sdk:track:' + actionType); return { code: 0 }; }
    }

    const wx = {
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

async function main() {
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
    assert.ok(!mismatchRuntime.events.some((event) => event.startsWith('sdk:setOpenId:')), 'mismatched backend config must stop DN reporting');
    assert.ok(mismatchRuntime.errors.some((message) => message.includes('配置与本地应用配置不一致')), 'mismatched config must fail explicitly');

    const devtoolsRuntime = createRuntime({ platform: 'devtools' });
    assert.strictEqual(devtoolsRuntime.instances.length, 0, 'DevTools preview must keep the existing external-SDK skip');

    console.log('dn-sdk-integration.test.js: PASS');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
