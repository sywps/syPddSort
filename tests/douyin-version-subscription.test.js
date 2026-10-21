const assert = require('assert'), fs = require('fs'), vm = require('vm'), ts = require('typescript');
const template = 'MSG21797007137157690496699164461350';
function load(file, imports, clock = {}) {
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { reportDiagnostics: true,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
    assert.equal(code.diagnostics.length, 0);
    vm.runInNewContext(code.outputText, { module, exports: module.exports, console,
        require: id => { if (id in imports) return imports[id]; throw Error('unexpected dependency: ' + id); }, ...clock });
    return module.exports;
}
function fixture(options = {}) {
    class Label {} class Button {} class Node { static EventType = { NODE_DESTROYED: 'destroyed' }; }
    let nativePhase = false, touch, callbacks, calls = 0, unbound = 0, canInteract = true;
    const timers = new Map(); let timerId = 0;
    const service = load('assets/Scripts/Platform/Douyin/DouyinSubscriptionService.ts', {}, {
        setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    });
    const tt = { getSystemInfoSync: () => ({ appName: options.host || 'Douyin', platform: options.platform || 'ios' }),
        canIUse: () => options.supported !== false,
        requestSubscribeMessage(args) {
            assert(nativePhase, 'native user gesture must survive until actual subscription API call');
            assert.deepEqual(Array.from(args.tmplIds), [template], 'version template must be requested alone');
            calls++; callbacks = args;
        },
    };
    const label = { string: '订阅版本更新提醒' }, button = { interactable: true };
    const entry = { active: false, getComponent: type => type === Label ? label : button };
    const overlay = { isValid: true, activeInHierarchy: true, once: (event, fn) => { overlay.destroyCallback = fn; } };
    const messages = [], runtime = { showToast: text => messages.push(text) };
    const mod = load('assets/Scripts/Platform/Douyin/DouyinVersionSubscriptionModule.ts', {
        '../../Core/GameCtrlShared': { Button, Label, Node },
        '../../Core/MiniGamePlatform': { getDouyinMiniGameRuntime: () => tt },
        './DouyinSubscriptionService': service,
        './DouyinDesktopModule': { bindDouyinDesktopGuideTouch(api, node, enabled, fn) {
            if (options.noNativeTouch) return null;
            touch = () => { if (entry.active && button.interactable && enabled()) {
                nativePhase = true; try { fn(); } finally { nativePhase = false; }
            } };
            return () => { unbound++; };
        } },
    });
    mod.installDouyinVersionSubscriptionModule(runtime);
    const cleanup = runtime.attachDouyinVersionSubscription(overlay, { getChildByName: () => entry }, () => canInteract);
    return { entry, label, button, overlay, cleanup, messages, timers, calls: () => calls, unbound: () => unbound,
        touch: () => touch?.(), complete: status => callbacks.success({ [template]: status }),
        fail: error => callbacks.fail(error), canInteract: value => { canInteract = value; } };
}
const a = fixture();
assert(a.entry.active); a.touch(); a.touch(); assert.equal(a.calls(), 1);
a.complete('accept'); assert.equal(a.label.string, '已订阅版本更新提醒');
assert(a.messages[0].includes('按规则发送')); assert.equal(a.timers.size, 0);
a.complete('reject'); assert.equal(a.messages.length, 1, 'duplicate callback ignored');
a.touch(); assert.equal(a.calls(), 1, 'accepted panel prevents repeated calls');
a.cleanup(); a.overlay.destroyCallback(); assert.equal(a.unbound(), 1);
for (const status of ['reject', 'ban', 'fail', undefined]) {
    const b = fixture(); b.touch(); b.complete(status);
    assert(!b.messages.some(m => m.startsWith('订阅成功')));
    assert.equal(b.label.string, '订阅版本更新提醒'); assert(b.button.interactable);
}
for (const opts of [{ platform: 'openHarmony' }, { host: 'Toutiao' }, { supported: false }, { noNativeTouch: true }]) {
    const b = fixture(opts); assert.equal(b.entry.active, false); b.touch(); assert.equal(b.calls(), 0);
}
const c = fixture(); c.canInteract(false); c.touch(); assert.equal(c.calls(), 0);
c.canInteract(true); c.overlay.activeInHierarchy = false; c.touch(); assert.equal(c.calls(), 0, 'hidden settings behind feedback cannot subscribe');
c.overlay.activeInHierarchy = true; c.touch(); c.cleanup(); c.complete('accept');
assert.equal(c.messages.length, 0, 'no UI feedback after panel close'); c.touch(); assert.equal(c.calls(), 1);
const d = fixture(); d.touch(); Array.from(d.timers.values())[0]();
assert(d.messages[0].includes('未确认')); d.complete('accept'); assert.equal(d.messages.length, 1);
const e = fixture(); e.touch(); e.fail({ errNo: 21105 }); assert.equal(e.messages[0], '未订阅，不影响游戏');
const prefab = JSON.parse(fs.readFileSync('assets/GameAssetsBundle/UI/Prefabs/Panels/SettingsPanel.prefab', 'utf8'));
const node = prefab.find(o => o._name === 'DouyinVersionSubscription');
assert.equal(node, undefined, 'settings subscription entry removed');
const controller = fs.readFileSync('assets/Scripts/Core/Panels/SettingsPanelController.ts', 'utf8');
assert(!controller.includes('attachDouyinVersionSubscription'));
assert(!fs.readFileSync('assets/Scripts/Platform/Douyin/installDouyinGameCtrlModules.ts', 'utf8').includes('installDouyinVersionSubscriptionModule'));
console.log('PASS subscription service unit checks; Settings entry and runtime installation removed');
