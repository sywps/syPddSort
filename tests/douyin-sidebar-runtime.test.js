const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Platform/Douyin/DouyinSidebarModule.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, downlevelIteration: false,
} }).outputText;
const storage = new Map();
const telemetry = [];
let randomValue = 0, randomCalls = 0;
const controlledMath = Object.create(Math);
controlledMath.random = () => { randomCalls++; return randomValue; };
let now = new Date('2026-10-09T12:00:00+08:00').getTime();
class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
}
let state = { canShow: true, eligibleToday: false };
let listener = null, requestCount = 0, disposed = 0, guideCount = 0, guideOptions;
const touchListeners = new Set();
const tt = { onTouchStart: fn => touchListeners.add(fn), offTouchStart: fn => touchListeners.delete(fn) };
class MockLabel {}
class MockUITransform {}
class MockButton {}
MockButton.EventType = { CLICK: 'click' };
const sdk = {
    getDouyinSidebarState: () => state,
    subscribeDouyinSidebar(fn) { listener = fn; fn(state); return () => { listener = null; disposed++; }; },
    refreshDouyinSidebar() {},
    openDouyinSidebar() { requestCount++; return Promise.resolve(true); },
};
const moduleBox = { exports: {} };
const button = { isValid: true, active: false };
const parent = { name: 'home', isValid: true, children: [], getChildByName: name => name === 'DouyinSidebarTaskButton' ? button : null };
vm.runInNewContext(output, {
    module: moduleBox, exports: moduleBox.exports, console, Date: Clock, Math: controlledMath,
    require(id) {
        if (id === '../../Core/AnalyticsMgr') return { AnalyticsMgr: { inst: { trackFunnelEvent: event => telemetry.push(event) } } };
        if (id === '../../Core/GameCtrlShared') return { SySDKMgr: { inst: sdk }, UITransform: MockUITransform,
            Label: MockLabel, Button: MockButton, AudioMgr: { inst: { play() {} } },
            sys: { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } } };
        if (id === 'cc') return { screen: { devicePixelRatio: 2, windowSize: { height: 1200 } }, Vec2: class { constructor(x, y) { this.x = x; this.y = y; } } };
        if (id === '../../Core/MiniGamePlatform') return { getDouyinMiniGameRuntime: () => tt };
        if (id === '../../Core/Panels/CollectionShellOverlay') return {
            openCollectionShellOverlay(runtime, options) { guideCount++; guideOptions = options; },
        };
        if (id === '../../Core/RuntimeLog') return { runtimeLog() {}, runtimeWarn() {} };
        throw Error(id);
    },
});

async function main() {
    let freeze = 0, labels = 0;
    const runtime = { mainMenuNode: { isValid: true }, addPropCount: (kind, amount) => {
        assert.strictEqual(kind, 'freeze', 'random value zero selects freeze');
        assert.strictEqual(amount, 1);
        freeze += amount;
    } };
    moduleBox.exports.installDouyinSidebarModule(runtime);
    runtime.syncDouyinSidebarButtonState = () => labels++;
    runtime.showDouyinSidebarButton = () => { button.active = true; labels++; };
    storage.set('pdd.douyin.sidebarReward.pendingDate', '20261009');
    assert.strictEqual(runtime.tryClaimDouyinSidebarReward(), false, 'old navigation pending records cannot grant');
    runtime.openDouyinSidebarScene();
    await Promise.resolve();
    assert.strictEqual(requestCount, 1);
    assert.strictEqual(runtime.tryClaimDouyinSidebarReward(), false, 'opening a guide never grants');
    state.eligibleToday = true;
    storage.set('pdd.douyin.desktopReward.claimed.v1', '1');
    assert.strictEqual(runtime.tryClaimDouyinSidebarReward(), true);
    assert.strictEqual(storage.get('pdd.douyin.desktopReward.claimed.v1'), '1', 'desktop receipt cannot block or be overwritten by sidebar reward');
    assert.strictEqual(freeze, 1);
    assert.strictEqual(runtime.tryClaimDouyinSidebarReward(), true);
    assert.strictEqual(freeze, 1, 'repeat tap must not grant twice');
    assert.strictEqual(telemetry.filter(x => x.eventName === 'douyin_sidebar_reward_result' && x.success).length, 1);
    assert.strictEqual(telemetry.filter(x => x.eventName === 'douyin_sidebar_guide_result' && x.success).length, 1);
    const reloaded = { addPropCount: runtime.addPropCount };
    moduleBox.exports.installDouyinSidebarModule(reloaded);
    reloaded.syncDouyinSidebarButtonState = () => {};
    reloaded.tryClaimDouyinSidebarReward();
    assert.strictEqual(freeze, 1, 'same-device restart preserves daily claim');
    now += 86400000;
    state = { canShow: false, eligibleToday: true };
    assert.strictEqual(reloaded.tryClaimDouyinSidebarReward(), false, 'server-disabled entry cannot grant');
    state = { canShow: true, eligibleToday: true };
    reloaded.tryClaimDouyinSidebarReward();
    assert.strictEqual(freeze, 2, 'new day plus actual entry can grant again');
    state = { canShow: false, eligibleToday: false };
    runtime.drawSidebarEntry(parent);
    assert.strictEqual(button.active, true, 'cold home entry is visible before SDK readiness');
    runtime.openDouyinSidebarGuide();
    assert.strictEqual(guideCount, 1, 'visible entry opens instructions even when SDK is unavailable');
    assert.strictEqual(guideOptions.prefabPath, 'UI/Prefabs/Panels/DouyinSidebarGuidePanel');
    assert.strictEqual(guideOptions.title, '入口有礼');
    runtime.openDouyinSidebarGuide();
    assert.strictEqual(guideCount, 1, 'repeated taps do not load duplicate guides');
    runtime.drawSidebarEntry(parent);
    assert.strictEqual(disposed, 1, 'redraw replaces old foreground observer');
    state.canShow = false; listener(state);
    assert.strictEqual(button.active, true, 'sidebar entry stays visible when SDK is unavailable or disabled');
    state.canShow = true; listener(state);
    assert.strictEqual(button.active, true);
    parent.isValid = false;
    const before = labels;
    listener(state);
    assert.strictEqual(labels, before, 'destroyed scene cannot receive sidebar UI updates');

    let dispatched = 0, lastPoint;
    const nativeButton = { isValid: true, activeInHierarchy: true,
        getComponent: () => ({ hitTest(point) { lastPoint = point; return point.x === 100 && point.y === 1000; } }) };
    const cleanup = moduleBox.exports.bindDouyinSidebarGuideTouch(tt, nativeButton, () => dispatched++);
    assert.strictEqual(touchListeners.size, 1);
    const touch = Array.from(touchListeners)[0];
    touch({ changedTouches: [{ clientX: 5, clientY: 5 }] });
    assert.strictEqual(dispatched, 0, 'touch outside the CTA must not navigate');
    touch({ changedTouches: [{ clientX: 50, clientY: 100 }] });
    assert.deepStrictEqual([lastPoint.x, lastPoint.y], [100, 1000], 'native hit test matches Cocos DPR and Y axis');
    assert.strictEqual(dispatched, 1);
    assert.strictEqual(touchListeners.size, 0, 'native listener is removed before navigation');
    touch({ changedTouches: [{ clientX: 50, clientY: 100 }] });
    cleanup(); cleanup();
    assert.strictEqual(dispatched, 1);
    const closeWithoutTouch = moduleBox.exports.bindDouyinSidebarGuideTouch(tt, nativeButton, () => dispatched++);
    closeWithoutTouch();
    assert.strictEqual(touchListeners.size, 0, 'closing a guide leaves no native touch listener');
    now += 86400000;
    state = { canShow: true, eligibleToday: true };
    const failing = {};
    moduleBox.exports.installDouyinSidebarModule(failing);
    assert.throws(() => failing.tryClaimDouyinSidebarReward(), /missing addPropCount/);
    failing.addPropCount = () => { throw Error('inventory save failed'); };
    assert.throws(() => failing.tryClaimDouyinSidebarReward(), /inventory save failed/);
    assert.strictEqual(failing.hasClaimedDouyinSidebarRewardToday(), false, 'failed inventory write cannot mark the reward claimed');
    assert.strictEqual(failing._douyinSidebarClaiming, false, 'failure releases the tap guard');
    storage.set('pdd.douyin.sidebarReward.claimedDate', '20261011');
    let granted = false;
    failing.addPropCount = () => { granted = true; };
    failing.tryClaimDouyinSidebarReward();
    assert.strictEqual(granted, false, 'existing daily claim (including the old gold reward) cannot grant the new prop again');
    const label = { string: '' };
    const labelNode = { getComponent: () => label };
    const entry = { isValid: true, getChildByName: name => name === 'SidebarTaskLbl' ? labelNode : null };
    for (const claimed of [true, false]) {
        if (!claimed) storage.clear();
        for (const eligibleToday of [true, false]) {
            state.eligibleToday = eligibleToday;
            failing.syncDouyinSidebarButtonState(entry);
            assert.strictEqual(label.string, '入口有礼', 'entry name stays stable in every claim state');
        }
    }
    // Exercise the real home click -> panel ready path for all completion states.
    storage.clear();
    state = { canShow: true, eligibleToday: true };
    let rewardCount = 0, click;
    const toasts = [];
    const flow = { addPropCount(kind, count) {
        assert.strictEqual(kind, 'freeze'); rewardCount += count;
    }, showToast: text => toasts.push(text) };
    moduleBox.exports.installDouyinSidebarModule(flow);
    const entryLabel = { string: '' };
    const homeEntry = { isValid: true, children: [], targetOff() {},
        getComponent: type => type === MockButton ? {} : null,
        getChildByName: name => name === 'SidebarTaskLbl' ? { getComponent: () => entryLabel } : null,
        on(event, fn) { assert.strictEqual(event, 'click'); click = fn; } };
    flow.bindDouyinSidebarButton(homeEntry);
    function readyPanel() {
        const label = { string: '进入侧边栏' };
        const button = { interactable: true };
        const enter = { isValid: true, activeInHierarchy: true, children: [],
            getChildByName: name => name === 'EnterLabel' ? { getComponent: () => label } : null,
            getComponent: type => type === MockButton ? button : type === MockUITransform ? { hitTest: () => true } : null };
        const box = { children: [], getChildByName: name => name === 'EnterBtn' ? enter : null };
        const options = guideOptions;
        const overlay = { isValid: true };
        const close = () => { overlay.isValid = false; options.onClose(); };
        options.onReady({ overlay, box, close });
        return { label, button, close };
    }
    const beforeOpen = guideCount;
    click();
    assert.strictEqual(guideCount, beforeOpen + 1, 'eligible home entry must open the panel');
    assert.strictEqual(rewardCount, 0, 'do not grant before panel resources are ready');
    const awarded = readyPanel();
    assert.strictEqual(rewardCount, 1);
    assert.strictEqual(awarded.label.string, '已完成');
    assert.strictEqual(awarded.button.interactable, false);
    assert.strictEqual(touchListeners.size, 0, 'completed CTA must not install a native navigation listener');
    assert.deepStrictEqual(toasts, [], 'claim completion is shown in the panel, not a home toast');
    awarded.close();
    click();
    assert.strictEqual(guideCount, beforeOpen + 2, 'already claimed entry must still open the panel');
    const completed = readyPanel();
    assert.strictEqual(completed.label.string, '已完成');
    assert.strictEqual(rewardCount, 1, 'reopening completed panel cannot grant twice');
    const beforeNavigate = requestCount;
    flow.openDouyinSidebarScene();
    assert.strictEqual(requestCount, beforeNavigate, 'completed task cannot navigate again');
    assert.deepStrictEqual(toasts, [], 'reopening completion must not show the old already-claimed toast');
    completed.close();
    now += 86400000;
    state = { canShow: true, eligibleToday: false };
    click();
    const fresh = readyPanel();
    assert.strictEqual(fresh.label.string, '进入侧边栏', 'new day returns to the original prefab action');
    assert.strictEqual(fresh.button.interactable, true);
    assert.strictEqual(touchListeners.size, 1, 'unfinished task keeps native touch navigation');
    Array.from(touchListeners)[0]({ changedTouches: [{ clientX: 50, clientY: 100 }] });
    await Promise.resolve();
    assert.strictEqual(requestCount, beforeNavigate + 1);
    assert.strictEqual(flow._douyinSidebarGuideOverlay, null, 'native navigation closes the guide as before');
    assert.strictEqual(rewardCount, 1, 'opening sidebar alone still cannot grant');
    assert.strictEqual(touchListeners.size, 0);
    for (const [value, expected] of [[0, 'freeze'], [1 / 3 - 1e-8, 'freeze'], [1 / 3, 'brush'], [2 / 3 - 1e-8, 'brush'], [2 / 3, 'magnet'], [1 - 1e-8, 'magnet']]) {
        storage.clear(); randomValue = value;
        const granted = [], before = randomCalls;
        const current = { addPropCount: (kind, count) => granted.push([kind, count]) };
        moduleBox.exports.installDouyinSidebarModule(current);
        state = { canShow: true, eligibleToday: false };
        assert.strictEqual(current.tryClaimDouyinSidebarReward(), false);
        assert.strictEqual(randomCalls, before, 'ineligible visits cannot draw a reward');
        state.eligibleToday = true;
        assert.strictEqual(current.tryClaimDouyinSidebarReward(), true);
        current.tryClaimDouyinSidebarReward();
        const restarted = { addPropCount: current.addPropCount };
        moduleBox.exports.installDouyinSidebarModule(restarted);
        restarted.tryClaimDouyinSidebarReward();
        assert.deepStrictEqual(granted, [[expected, 1]], 'grant exactly one random prop per day, including after restart');
        assert.strictEqual(randomCalls, before + 1, 'claimed reward cannot reroll');
        now += 86400000;
        state.eligibleToday = false;
        assert.strictEqual(restarted.tryClaimDouyinSidebarReward(), false);
        state.eligibleToday = true;
        restarted.tryClaimDouyinSidebarReward();
        assert.deepStrictEqual(granted, [[expected, 1], [expected, 1]], 'new day with valid entry can draw again');
        assert.strictEqual(randomCalls, before + 2);
    }
    console.log('douyin-sidebar-runtime.test.js passed (random reward, daily limit, entry eligibility, lifecycle)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
