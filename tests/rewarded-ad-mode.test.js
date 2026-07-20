const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function transpile(relPath) {
    const source = fs.readFileSync(path.join(root, relPath), 'utf8');
    return ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
}

function loadAdConfig({ buildMode, platform, query = {} }) {
    const wxRuntime = {
        getDeviceInfo: () => ({ platform }),
        getSystemInfoSync: () => ({}),
        getLaunchOptionsSync: () => ({ query }),
    };
    const module = { exports: {} };
    const sandbox = {
        module,
        exports: module.exports,
        require(id) {
            if (id === 'cc') {
                return {
                    _decorator: { ccclass: () => (target) => target },
                    Component: class Component {},
                };
            }
            if (id === './RewardedAdProvider') {
                return { getRewardedAdProvider: () => ({}) };
            }
            if (id === './Douyin/DouyinPlatformConfig') {
                return { DOUYIN_PLATFORM_CONFIG: { ads: { rewardedVideo: 'douyin-test' } } };
            }
            if (id === './WeChat/WeChatPlatformConfig') {
                return { WECHAT_PLATFORM_CONFIG: { ads: { rewardedVideo: 'wechat-test' } } };
            }
            if (id === '../Core/MiniGamePlatform') {
                return {
                    getMiniGameBuildMode: () => buildMode,
                    getMiniGameBuildPlatform: () => 'wechat',
                    getWeChatMiniGameRuntime: () => wxRuntime,
                };
            }
            throw new Error(`unexpected require: ${id}`);
        },
        console,
        URLSearchParams,
    };
    vm.runInNewContext(transpile('assets/Scripts/Platform/AdConfig.ts'), sandbox, {
        filename: 'AdConfig.ts',
    });
    return module.exports.AdConfig;
}

function main() {
    const debugDevTools = loadAdConfig({ buildMode: 'debug', platform: 'devtools' });
    assert.strictEqual(
        debugDevTools.getRewardedAdMode(),
        'mock-fail',
        'WeChat debug DevTools must not create the native rewarded-ad view by default',
    );
    assert.strictEqual(
        debugDevTools.canAutoPreloadRewardedAd(),
        false,
        'WeChat DevTools must not auto-preload the native rewarded-ad view',
    );
    assert.strictEqual(
        loadAdConfig({ buildMode: 'release', platform: 'devtools' }).getRewardedAdMode(),
        'mock-fail',
        'WeChat release DevTools must not create the native rewarded-ad view by default',
    );
    assert.strictEqual(
        loadAdConfig({ buildMode: 'debug', platform: 'devtools', query: { adMock: 'fail' } }).getRewardedAdMode(),
        'mock-fail',
        'debug launch query must still be able to test the ad-failure branch',
    );
    assert.strictEqual(
        loadAdConfig({ buildMode: 'release', platform: 'devtools', query: { adMock: 'success' } }).getRewardedAdMode(),
        'mock-success',
        'an explicit DevTools-only override may test the success branch in a release package',
    );
    assert.strictEqual(
        loadAdConfig({ buildMode: 'release', platform: 'ios', query: { adMock: 'success' } }).getRewardedAdMode(),
        'native',
        'a release package on a real device must ignore mock launch queries',
    );
    assert.strictEqual(
        loadAdConfig({ buildMode: 'release', platform: 'mac' }).getRewardedAdMode(),
        'native',
        'the real mac WeChat client must keep the native rewarded-ad provider',
    );
    console.log('rewarded-ad-mode.test.js passed');
}

main();
