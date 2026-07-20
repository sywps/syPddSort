const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function loadRemoteDataClient({ miniGameRuntime, hostname, search = '' }) {
    const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/RemoteDataCdnClient.ts'), 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    const module = { exports: {} };
    const windowScope = {
        location: {
            hostname,
            protocol: 'http:',
            search,
        },
    };
    const sandbox = {
        module,
        exports: module.exports,
        window: windowScope,
        document: { referrer: '' },
        URLSearchParams,
        require(id) {
            if (id === './MiniGamePlatform') {
                return {
                    getDouyinMiniGameRuntime: () => null,
                    getMiniGameBuildPlatform: () => miniGameRuntime ? 'wechat' : 'web',
                    getWeChatMiniGameRuntime: () => miniGameRuntime ? { request() {} } : null,
                    isMiniGameRuntime: () => miniGameRuntime,
                };
            }
            throw new Error(`unexpected require: ${id}`);
        },
    };
    vm.runInNewContext(output, sandbox, { filename: 'RemoteDataCdnClient.ts' });
    return module.exports;
}

const localBrowser = loadRemoteDataClient({
    miniGameRuntime: false,
    hostname: 'localhost',
});
assert.strictEqual(
    localBrowser.shouldUseLocalLevelDataMirror(),
    true,
    'bare localhost Browser preview must use the local level-data mirror',
);

const localBrowserCdnOptIn = loadRemoteDataClient({
    miniGameRuntime: false,
    hostname: 'localhost',
    search: '?use_cdn=true',
});
assert.strictEqual(
    localBrowserCdnOptIn.shouldUseLocalLevelDataMirror(),
    false,
    'localhost Browser with use_cdn=true must use the stable CDN',
);

const wechatDevtools = loadRemoteDataClient({
    miniGameRuntime: true,
    hostname: 'localhost',
});
assert.strictEqual(
    wechatDevtools.isLocalBrowserPreview(),
    true,
    'the regression harness must reproduce DevTools browser-like localhost globals',
);
assert.strictEqual(
    wechatDevtools.shouldUseLocalLevelDataMirror(),
    false,
    'WeChat DevTools must never request the removed local levelData bundle',
);

console.log('remote-data-cdn-runtime.test.js passed');
