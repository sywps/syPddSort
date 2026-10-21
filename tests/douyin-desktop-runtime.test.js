const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Platform/Douyin/DouyinDesktopModule.ts'), 'utf8');
const result = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017,
} });
assert.ok(!result.diagnostics?.length);
class Label {}
class UITransform {}
class Button {}
Button.EventType = { CLICK: 'click' };
class FakeNode {
    static EventType = { NODE_DESTROYED: 'destroyed' };
    constructor(name, children = []) { this.name = name; this.children = children; this.isValid = true; this.active = true; this.components = new Map(); }
    get activeInHierarchy() { return this.active && this.isValid; }
    getChildByName(name) { return this.children.find(n => n.name === name) || null; }
    getComponent(type) { return this.components.get(type) || null; }
    targetOff() { this.click = null; }
    on(event, callback) { assert.strictEqual(event, 'click'); this.click = callback; }
    once(event, callback) { assert.strictEqual(event, 'destroyed'); this.onDestroy = callback; }
    addChild(node) { this.children.push(node); }
}
const storage = new Map(), warnings = [], inventory = new Map(), popups = [];
let failKey = '', popupFails = false, popupWait = null;
const flush = () => new Promise(resolve => setImmediate(resolve));
let tt, options, opens = 0, loads = 0, bundleCallback, storageFails = false;
let randomValue = 0, randomCalls = 0;
const controlledMath = Object.create(Math);
controlledMath.random = () => { randomCalls++; return randomValue; };
const box = { exports: {} };
vm.runInNewContext(result.outputText, {
    module: box, exports: box.exports, console, Math: controlledMath,
    require(id) {
        if (id === 'cc') return { screen: { devicePixelRatio: 3, windowSize: { height: 1800 } },
            Vec2: class { constructor(x, y) { this.x = x; this.y = y; } } };
        if (id === '../../Core/GameCtrlShared') return { Label, Button, UITransform, Node: FakeNode,
            HOME_ASSETS_BUNDLE_NAME: 'homeAssets', Prefab: class {}, instantiate: p => p,
            AudioMgr: { inst: { play() {} } },
            assetManager: { loadBundle(name, callback) { loads++; bundleCallback = callback; } },
            sys: { localStorage: { getItem: k => storage.get(k), setItem: (k, v) => {
                if (storageFails || k === failKey) throw Error('storage failed'); storage.set(k, v);
                if (k.startsWith('prop.')) inventory.set(k.slice(5), Number(v));
            } } } };
        if (id === '../../Core/MiniGamePlatform') return { getDouyinMiniGameRuntime: () => tt };
        if (id === '../../Core/Panels/CollectionShellOverlay') return { openCollectionShellOverlay(runtime, value) { opens++; options = value; } };
        if (id === '../../Core/ChapterRewardView') return { async showDouyinDesktopReward(r, host, prop, alive, grant) {
            if (popupWait) await popupWait;
            if (popupFails) throw Error('popup unavailable');
            if (!alive()) return;
            grant(); popups.push(prop);
        } };
        if (id === '../../Core/RuntimeLog') return { runtimeWarn: (...args) => warnings.push(args) };
        throw Error(id);
    },
});
const { installDouyinDesktopModule } = box.exports;
function api(platform = 'ios', behavior = () => {}) {
    const listeners = { Start: new Set(), End: new Set(), Cancel: new Set(), Show: new Set(), Hide: new Set() };
    let nativePhase = '';
    const value = { calls: 0, listeners,
        getSystemInfoSync: () => ({ platform, appName: 'Douyin' }),
        checkShortcut() { throw Error('new click reward must not check shortcut status'); },
        addShortcut(o) {
            assert.strictEqual(nativePhase, 'End', 'addShortcut requires the synchronous native touch-end stack');
            this.calls++; this.lastOptions = o; behavior(o);
        },
        emit(phase, x = 100, y = 200, id = 0) {
            const touch = { clientX: x, clientY: y, identifier: id };
            nativePhase = phase;
            try { for (const fn of Array.from(listeners[phase])) fn({ changedTouches: [touch], touches: phase === 'Start' ? [touch] : [] }); }
            finally { nativePhase = ''; }
        },
        tap() { this.emit('Start'); this.emit('End'); },
    };
    for (const phase of Object.keys(listeners)) {
        value[(phase === 'Show' || phase === 'Hide' ? 'on' : 'onTouch') + phase] = fn => listeners[phase].add(fn);
        value[(phase === 'Show' || phase === 'Hide' ? 'off' : 'offTouch') + phase] = fn => listeners[phase].delete(fn);
    }
    return value;
}
const labelNode = (name, text) => { const n = new FakeNode(name); n.components.set(Label, { string: text }); return n; };
function runtime() {
    const r = { mainMenuNode: { isValid: true }, grants: 0, grantedKinds: [],
        getPropStorageKey: kind => 'prop.' + kind,
        getPropCount(kind) { this.recoverDouyinDesktopReward(); return inventory.get(kind) || 0; },
        queueCloudGameStateSync() { this.grants++; this.grantedKinds.push(JSON.parse(storage.get('pdd.douyin.desktopReward.receipt.v1')).prop); },
        addPropCount(kind, amount) { assert.ok(['freeze', 'brush', 'magnet'].includes(kind)); assert.strictEqual(amount, 1); this.grants++; this.grantedKinds.push(kind); },
        bindPanelButton(n, handler) { n.components.set(Button, { interactable: true }); n.click = handler; } };
    installDouyinDesktopModule(r); return r;
}
function ready() {
    const config = options;
    assert.strictEqual(config.prefabPath, 'UI/Prefabs/Panels/DouyinDesktopGuidePanel');
    const action = new FakeNode('EnterBtn', [labelNode('EnterLabel', '添加桌面')]);
    action.components.set(Button, { interactable: true });
    // Cocos uses physical pixels, bottom-left origin: native (100,200) -> (300,1200).
    action.components.set(UITransform, { hitTest: p => Math.abs(p.x - 300) < 30 && Math.abs(p.y - 1200) < 30 });
    const panel = new FakeNode('Box', [action]), overlay = new FakeNode('Overlay');
    config.onReady({ box: panel, overlay });
    return { action, overlay, label: action.children[0].getComponent(Label),
        close() { overlay.active = false; config.onClose(); },
        destroy() { overlay.isValid = false; overlay.onDestroy?.(); } };
}
function open(r) { r.openDouyinDesktopGuide(); return ready(); }
function assertClean(native) { for (const group of Object.values(native.listeners)) assert.strictEqual(group.size, 0); }

const claimedKey = 'pdd.douyin.desktopReward.claimed.v1';
const attemptKey = 'pdd.douyin.desktopReward.attempt.v1';
const receiptKey = 'pdd.douyin.desktopReward.receipt.v1';
function reset() { storage.clear(); inventory.clear(); popups.length = 0; failKey = ''; popupFails = false; popupWait = null; randomValue = 0; tt = api(); }
async function returnAndClaim(r, ui) {
    tt.tap(); assert.strictEqual(r.grants, 0, 'add tap never grants');
    tt.emit('Hide'); tt.emit('Show');
    assert.strictEqual(ui.label.string, '领取奖励');
    assert.strictEqual(r.grants, 0, 'return never auto-grants');
    tt.tap(); await flush();
}
(async () => {
    reset();
    const r = runtime(), parent = new FakeNode('TopBarGroup');
    r.drawDesktopEntry(parent); r.drawDesktopEntry(parent); assert.strictEqual(loads, 1);
    const entry = new FakeNode('DouyinDesktopTaskButton'); entry.components.set(Button, {});
    bundleCallback(null, { load(p, type, cb) { assert.ok(p.endsWith('/DouyinDesktopTaskButton')); cb(null, entry); } });
    entry.click(); r.openDouyinDesktopGuide(); assert.strictEqual(opens, 1);
    let ui = ready();
    ui.action.click(); assert.strictEqual(tt.calls, 0, 'native binding owns addShortcut');
    tt.emit('End'); tt.emit('Start', 0, 0); tt.emit('End');
    tt.emit('Start'); tt.emit('End', 0, 0); tt.emit('Start'); tt.emit('Cancel'); tt.emit('End');
    assert.strictEqual(tt.calls, 0); assert.strictEqual(r.grants, 0);
    const draws = randomCalls;
    tt.tap(); tt.tap(); assert.strictEqual(tt.calls, 1); assert.strictEqual(randomCalls, draws);
    assert.strictEqual(ui.label.string, '添加中'); assert.strictEqual(r.grants, 0);
    tt.emit('Show'); assert.strictEqual(ui.label.string, '添加中', 'unrelated foreground event is not a return');
    tt.emit('Hide'); tt.lastOptions.success({});
    assert.strictEqual(r.grants, 0); assert.strictEqual(ui.label.string, '添加中');
    tt.emit('Show'); assert.strictEqual(ui.label.string, '领取奖励');
    assert.strictEqual(randomCalls, draws); assert.strictEqual(r.grants, 0);
    tt.tap(); tt.tap(); await flush();
    assert.strictEqual(r.grants, 1); assert.deepStrictEqual(popups, ['freeze']);
    assert.strictEqual(ui.label.string, '已完成'); assert.strictEqual(tt.calls, 1);
    ui.close(); assertClean(tt);
    ui = open(runtime()); tt.tap(); await flush();
    assert.strictEqual(ui.label.string, '已完成'); assert.strictEqual(popups.length, 1); ui.close();

    for (const behavior of [o => o.success({}), o => o.fail({ errNo: 21305 }), o => o.fail({ errNo: 10301 })]) {
        reset(); tt = api('android', behavior);
        const current = runtime(); ui = open(current); tt.tap();
        assert.strictEqual(ui.label.string, '领取奖励'); assert.strictEqual(current.grants, 0);
        tt.tap(); await flush(); assert.strictEqual(current.grants, 1); ui.close(); assertClean(tt);
    }
    reset(); const closing = runtime(); ui = open(closing); tt.tap(); ui.close();
    tt.emit('Hide'); tt.emit('Show'); assert.strictEqual(closing.grants, 0);
    ui = open(closing); assert.strictEqual(ui.label.string, '领取奖励');
    tt.tap(); await flush(); assert.strictEqual(closing.grants, 1); ui.close(); assertClean(tt);

    reset(); storage.set(attemptKey, 'started');
    const restarted = runtime(); ui = open(restarted);
    assert.strictEqual(ui.label.string, '领取奖励', 'interrupted add flow resumes for manual claim after restart');
    assert.strictEqual(restarted.grants, 0); tt.tap(); await flush(); assert.strictEqual(restarted.grants, 1); ui.close();

    reset(); storage.set(attemptKey, 'ready'); popupFails = true;
    const failedPopup = runtime(); ui = open(failedPopup); tt.tap(); await flush();
    assert.strictEqual(failedPopup.grants, 0, 'load popup before committing inventory');
    assert.strictEqual(ui.label.string, '重试'); const chosen = storage.get(receiptKey), failedDraws = randomCalls;
    popupFails = false; tt.tap(); await flush();
    assert.strictEqual(failedPopup.grants, 1); assert.strictEqual(JSON.parse(storage.get(receiptKey)).prop, JSON.parse(chosen).prop);
    assert.strictEqual(randomCalls, failedDraws, 'resource retry cannot reroll'); ui.close();

    reset(); storage.set(attemptKey, 'ready'); failKey = claimedKey;
    const markerFailed = runtime(); ui = open(markerFailed); tt.tap(); await flush();
    assert.strictEqual(inventory.get('freeze'), 1); assert.strictEqual(ui.label.string, '重试');
    assert.throws(() => markerFailed.getPropCount('freeze'), /storage failed/, 'pending journal prevents spending before marker recovery');
    assert.strictEqual(popups.length, 0); ui.close(); failKey = '';
    const recovery = runtime(); ui = open(recovery); tt.tap(); await flush();
    assert.strictEqual(recovery.grants, 1, 'restart completes the pending receipt once');
    assert.strictEqual(inventory.get('freeze'), 1); assert.strictEqual(popups.length, 1); ui.close();

    reset(); storage.set(attemptKey, 'ready'); failKey = receiptKey;
    const receiptFailed = runtime(); ui = open(receiptFailed); tt.tap(); await flush();
    assert.strictEqual(receiptFailed.grants, 0); assert.strictEqual(storage.has(claimedKey), false); ui.close();

    reset(); storage.set(attemptKey, 'ready');
    const saveFailed = runtime(); failKey = 'prop.freeze';
    ui = open(saveFailed); tt.tap(); await flush(); assert.strictEqual(storage.has(claimedKey), false);
    failKey = ''; tt.tap(); await flush(); assert.strictEqual(saveFailed.grants, 1); ui.close();

    reset(); storage.set(attemptKey, 'ready'); let release;
    popupWait = new Promise(resolve => { release = resolve; });
    const stale = runtime(); ui = open(stale); tt.tap(); ui.close(); release(); await flush();
    assert.strictEqual(stale.grants, 0, 'closing during async load cannot award or show stale popup');

    for (const [value, expected] of [[0, 'freeze'], [1 / 3 - 1e-8, 'freeze'], [1 / 3, 'brush'], [2 / 3 - 1e-8, 'brush'], [2 / 3, 'magnet'], [1 - 1e-8, 'magnet']]) {
        reset(); randomValue = value;
        storage.set('pdd.douyin.sidebarReward.claimedDate', '20990101');
        const current = runtime(); ui = open(current); await returnAndClaim(current, ui);
        assert.deepStrictEqual(current.grantedKinds, [expected]); assert.deepStrictEqual(popups, [expected]);
        assert.strictEqual(storage.get('pdd.douyin.sidebarReward.claimedDate'), '20990101', 'desktop never changes sidebar receipt');
        ui.close();
    }
    reset(); storage.set(claimedKey, '1'); const legacy = runtime(); ui = open(legacy);
    tt.tap(); await flush(); assert.strictEqual(legacy.grants, 0); assert.strictEqual(ui.label.string, '已完成'); ui.close();
    reset(); delete tt.addShortcut; const unsupported = runtime(); ui = open(unsupported); tt.tap();
    assert.strictEqual(unsupported.grants, 0); assert.strictEqual(ui.label.string, '暂不支持'); ui.close();
    console.log('douyin-desktop-runtime.test.js passed (manual return claim, popup, independent receipts, random reward, recovery, lifecycle)');
})().catch(error => { console.error(error); process.exitCode = 1; });
