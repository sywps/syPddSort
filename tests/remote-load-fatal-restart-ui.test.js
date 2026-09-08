const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const scenes = [
    'assets/BootstrapBundle/Scenes/Game.scene',
    'assets/HomeAssetsBundle/Scenes/Home.scene',
    'assets/PreviewBundle/UIPreview.scene',
];

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function findNode(scene, name) {
    const index = scene.findIndex((entry) => entry?.__type__ === 'cc.Node' && entry._name === name);
    assert.notStrictEqual(index, -1, `missing node: ${name}`);
    return scene[index];
}

function component(scene, node, type) {
    return (node._components || [])
        .map((reference) => scene[reference.__id__])
        .find((entry) => entry?.__type__ === type);
}

function assertReferencesAreValid(value, scene) {
    if (!value || typeof value !== 'object') return;
    if (Number.isInteger(value.__id__)) {
        assert.ok(value.__id__ >= 0 && value.__id__ < scene.length, `out-of-range scene reference: ${value.__id__}`);
    }
    for (const child of Object.values(value)) assertReferencesAreValid(child, scene);
}

function createFatalRestartRuntime(firstLevelRoute, options = {}) {
    const events = [];
    const module = { exports: {} };
    const browserWindow = options.isBrowser
        ? { location: { reload: () => events.push('browser-reload') } }
        : {};
    const output = ts.transpileModule(firstLevelRoute, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    vm.runInNewContext(output, {
        module,
        exports: module.exports,
        window: browserWindow,
        require(id) {
            if (id === '../GameCtrlShared') return {
                game: { restart: () => events.push('cocos-restart') },
                sys: { isBrowser: !!options.isBrowser },
            };
            if (id === '../MiniGamePlatform') return {
                getWeChatMiniGameRuntime: () => options.wxRuntime || null,
                isDouyinMiniGameRuntime: () => false,
                isMiniGameRuntime: () => false,
                isWeChatMiniGameRuntime: () => false,
            };
            if (id === 'cc') return { director: {}, Director: {} };
            return {};
        },
    });
    const runtime = {};
    module.exports.installFirstLevelRouteModule(runtime);
    return { runtime, events };
}

for (const scenePath of scenes) {
    const scene = JSON.parse(read(scenePath));
    assert.ok(scene.every(Boolean), `${scenePath} must not retain serialized tombstones`);
    for (const entry of scene) assertReferencesAreValid(entry, scene);

    assert.strictEqual(scene.some((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'RemoteLoadFatalErrorHint'), false, `${scenePath} must remove the old hint node`);
    assert.strictEqual(scene.some((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'RemoteLoadFatalErrorBack'), false, `${scenePath} must remove the return-home node`);

    const card = findNode(scene, 'RemoteLoadFatalErrorCard');
    const cardChildren = (card._children || []).map((reference) => scene[reference.__id__]?._name);
    assert.deepStrictEqual(
        cardChildren,
        ['RemoteLoadFatalErrorTitle', 'RemoteLoadFatalErrorPath', 'RemoteLoadFatalErrorDetail', 'RemoteLoadFatalErrorRestart'],
        `${scenePath} must retain only title, hidden diagnostics, and restart action`,
    );

    const title = findNode(scene, 'RemoteLoadFatalErrorTitle');
    assert.strictEqual(component(scene, title, 'cc.Label')?._string, '版本更新请重启游戏', `${scenePath} must use the approved restart copy`);
    const restart = findNode(scene, 'RemoteLoadFatalErrorRestart');
    assert.strictEqual(restart._lpos?.x, 0, `${scenePath} restart action must be horizontally centered`);
    assert.strictEqual(component(scene, restart, 'cc.Label')?._string, '重启游戏', `${scenePath} restart action must use the approved label`);
}

const gameScene = JSON.parse(read('assets/BootstrapBundle/Scenes/Game.scene'));
assert.ok(component(gameScene, findNode(gameScene, 'RemoteLoadFatalErrorRestart'), 'cc.Button'), 'Game.scene restart action must be interactive');

const firstLevelRoute = read('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts');
const syntaxResult = ts.transpileModule(firstLevelRoute, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
    },
    reportDiagnostics: true,
});
assert.deepStrictEqual(
    (syntaxResult.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error),
    [],
    'fatal restart TypeScript must transpile without syntax diagnostics',
);
assert.ok(firstLevelRoute.includes('getWeChatMiniGameRuntime'), 'fatal restart must use the established WeChat runtime helper');
assert.ok(firstLevelRoute.includes('wxRuntime.restartMiniProgram();'), 'WeChat fatal restart must restart the mini program');
assert.ok(firstLevelRoute.includes('window.location.reload();'), 'web fatal restart must reload the game page');
assert.ok(firstLevelRoute.includes('game.restart();'), 'non-web fatal restart must restart the Cocos game');
assert.ok(!firstLevelRoute.includes("retryGameplayLoading?.('fatal-error')"), 'fatal restart must not retry the loading route');
assert.ok(!firstLevelRoute.includes("exitGameplayLoading?.('fatal-error')"), 'fatal restart must not return to the home route');

const weChatRestart = createFatalRestartRuntime(firstLevelRoute, {
    wxRuntime: { restartMiniProgram: () => weChatRestart.events.push('wechat-restart') },
});
weChatRestart.runtime.restartGameFromRemoteLoadFatalError();
assert.deepStrictEqual(weChatRestart.events, ['wechat-restart'], 'WeChat fatal restart must use wx.restartMiniProgram before any fallback');

const browserRestart = createFatalRestartRuntime(firstLevelRoute, { isBrowser: true });
browserRestart.runtime.restartGameFromRemoteLoadFatalError();
assert.deepStrictEqual(browserRestart.events, ['browser-reload'], 'browser fatal restart must reload the page');

const cocosRestart = createFatalRestartRuntime(firstLevelRoute);
cocosRestart.runtime.restartGameFromRemoteLoadFatalError();
assert.deepStrictEqual(cocosRestart.events, ['cocos-restart'], 'non-browser fatal restart must restart the Cocos game');

assert.ok(firstLevelRoute.includes("'RemoteLoadFatalErrorRestart'"), 'fatal UI owner must retain the restart control');
assert.ok(firstLevelRoute.includes('restartButton.interactable = true;'), 'fatal UI owner must enable the restart control');
assert.ok(!firstLevelRoute.includes("'RemoteLoadFatalErrorBack'"), 'fatal UI owner must not reference the removed return-home control');

console.log('remote-load-fatal-restart-ui.test.js passed');
