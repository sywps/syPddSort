const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function transpile(relPath) {
    return ts.transpileModule(read(relPath), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
}

function makeStorage(initialValues = {}) {
    const values = new Map(Object.entries(initialValues));
    let ignoreGoldWrites = false;
    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            if (ignoreGoldWrites && key === 'pdd.gold') return;
            values.set(key, String(value));
        },
        ignoreGoldWrites(value) {
            ignoreGoldWrites = value;
        },
    };
}

function loadPlayerMetaInstaller(storage, Label) {
    const moduleRef = { exports: {} };
    const shared = new Proxy({
        sys: { localStorage: storage },
        Label,
        LS_GOLD: 'pdd.gold',
        LS_PROP_WAND: 'pdd.wand',
        LS_PROP_FREEZE: 'pdd.freeze',
        LS_PROP_BRUSH: 'pdd.brush',
        LS_PROP_MAGNET: 'pdd.magnet',
    }, {
        get(target, key) {
            return key in target ? target[key] : class RuntimeStub {};
        },
    });
    vm.runInNewContext(transpile('assets/Scripts/Core/GameCtrlModules/PlayerMetaStateModule.ts'), {
        module: moduleRef,
        exports: moduleRef.exports,
        require(id) {
            if (id === '../GameCtrlShared') return shared;
            if (id === '../RuntimeLog') return { runtimeLog() {}, runtimeWarn() {} };
            throw new Error(`unexpected require: ${id}`);
        },
        console,
        Date,
        Map,
        Set,
    }, { filename: 'PlayerMetaStateModule.ts' });
    return moduleRef.exports.installPlayerMetaStateModule;
}

function makeGoldLabelTree(Label, label) {
    const goldNode = {
        name: 'GoldCount',
        children: [],
        activeInHierarchy: true,
        isValid: true,
        getComponent(type) {
            return type === Label ? label : null;
        },
    };
    return {
        name: 'Scene',
        children: [goldNode],
        activeInHierarchy: true,
        isValid: true,
    };
}

function createGoldRuntime(storage, Label, label) {
    const runtime = {
        node: { scene: makeGoldLabelTree(Label, label) },
        refreshCalls: 0,
        queueCalls: 0,
        localUserStateUpdatedAt: 0,
        propGrants: [],
        refreshGoldUI() {
            this.refreshCalls += 1;
        },
        setLocalUserStateUpdatedAt(timestamp) {
            this.localUserStateUpdatedAt = timestamp;
        },
        queueCloudGameStateSync() {
            this.queueCalls += 1;
        },
        getPropStorageKey(kind) {
            return `pdd.${kind}`;
        },
        addPropCount(kind, count) {
            this.propGrants.push([kind, count]);
        },
    };
    loadPlayerMetaInstaller(storage, Label)(runtime);
    return runtime;
}

function testWalletRefreshesEveryVisibleGoldLabel() {
    class Label {
        constructor() {
            this.string = '';
        }
    }
    const label = new Label();
    const runtime = createGoldRuntime(makeStorage({ 'pdd.gold': '61' }), Label, label);
    runtime.refreshGoldUI();
    assert.strictEqual(label.string, '61', 'visible GoldCount must always render the canonical wallet value');
}

function testCloudRestoreCanRefreshGoldWithoutQueuingAnotherSave() {
    class Label {}
    const runtime = createGoldRuntime(makeStorage({ 'pdd.gold': '20' }), Label, new Label());
    runtime.setGold(61, { syncCloud: false });
    assert.strictEqual(runtime.getGold(), 61);
    assert.strictEqual(runtime.queueCalls, 0, 'restored gold must not immediately queue a conflicting cloud save');
}

function testDailySignInRequiresTheExpectedGoldReadbackBeforeGrantingProps() {
    class Label {}
    const storage = makeStorage({ 'pdd.gold': '61' });
    const runtime = createGoldRuntime(storage, Label, new Label());
    storage.ignoreGoldWrites(true);
    assert.throws(
        () => runtime.grantDailySignInReward({ gold: 50, freeze: 1 }),
        /daily-signin.*gold/i,
        'a failed gold write must fail the claim instead of silently marking it complete',
    );
    assert.deepStrictEqual(runtime.propGrants, [], 'props must not be granted after an unconfirmed gold write');
}

function testDailySignInAddsTheRewardToTheCanonicalWalletExactlyOnce() {
    class Label {}
    const runtime = createGoldRuntime(makeStorage({ 'pdd.gold': '61' }), Label, new Label());
    runtime.grantDailySignInReward({ gold: 50 });
    assert.strictEqual(runtime.getGold(), 111, '61 gold plus a 50-gold daily reward must equal 111');
}

function testDailySignInMarksLocalStateNewerBeforeDeferredCloudSync() {
    class Label {}
    const runtime = createGoldRuntime(makeStorage({ 'pdd.gold': '61' }), Label, new Label());
    runtime._startupCloudRestorePending = true;
    runtime.grantDailySignInReward({ gold: 50 });
    assert.ok(
        runtime.localUserStateUpdatedAt > 0,
        'daily sign-in must mark local state newer before a pending startup cloud restore can return stale gold',
    );
}

testWalletRefreshesEveryVisibleGoldLabel();
testCloudRestoreCanRefreshGoldWithoutQueuingAnotherSave();
testDailySignInRequiresTheExpectedGoldReadbackBeforeGrantingProps();
testDailySignInAddsTheRewardToTheCanonicalWalletExactlyOnce();
testDailySignInMarksLocalStateNewerBeforeDeferredCloudSync();

function loadFriendRankInstaller() {
    const moduleRef = { exports: {} };
    const Node = {
        EventType: {
            TOUCH_START: 'touch-start',
            TOUCH_MOVE: 'touch-move',
            TOUCH_END: 'touch-end',
            TOUCH_CANCEL: 'touch-cancel',
        },
    };
    const shared = new Proxy({
        Node,
        LEADERBOARD_SCROLL_DECAY: 0.9,
        LEADERBOARD_SCROLL_MIN_SPEED: 1,
    }, {
        get(target, key) {
            return key in target ? target[key] : class RuntimeStub {};
        },
    });
    vm.runInNewContext(transpile('assets/Scripts/Core/GameCtrlModules/FriendRankModule.ts'), {
        module: moduleRef,
        exports: moduleRef.exports,
        require(id) {
            if (id === '../GameCtrlShared') return shared;
            if (id === '../DebugPerfTrace') return { debugPerfSnapshot() {}, debugPerfTrace() {}, isDebugPerfTraceEnabled: () => false };
            if (id === '../RuntimeLog') return { runtimeLog() {} };
            throw new Error(`unexpected require: ${id}`);
        },
        console,
        Date,
        Map,
        Set,
        setTimeout,
        clearTimeout,
    }, { filename: 'FriendRankModule.ts' });
    return moduleRef.exports.installFriendRankModule;
}

function testLeaderboardRebindClearsOldListenersAndInertia() {
    const listeners = new Map();
    const scheduled = [];
    const unscheduled = [];
    const viewport = {
        isValid: true,
        on(eventName, handler) {
            const handlers = listeners.get(eventName) || [];
            handlers.push(handler);
            listeners.set(eventName, handlers);
        },
        targetOff() {
            listeners.clear();
        },
    };
    const content = {
        isValid: true,
        position: { x: 0, y: 0 },
        setPosition(x, y) {
            this.position = { x, y };
        },
    };
    const runtime = {
        schedule(handler) {
            scheduled.push(handler);
        },
        unschedule(handler) {
            unscheduled.push(handler);
        },
    };
    loadFriendRankInstaller()(runtime);
    runtime.setupLeaderboardScroll(viewport, content, 100, 300);
    const oldEndHandler = listeners.get('touch-end')[0];
    listeners.get('touch-start')[0]({ getUILocation: () => ({ y: 0 }) });
    listeners.get('touch-move')[0]({ getUILocation: () => ({ y: 40 }) });
    oldEndHandler();
    assert.strictEqual(scheduled.length, 1, 'a drag may start one inertia callback');
    runtime.setupLeaderboardScroll(viewport, content, 100, 300);
    assert.strictEqual(listeners.get('touch-start').length, 1, 're-render must keep one touch-start listener');
    assert.strictEqual(listeners.get('touch-move').length, 1, 're-render must keep one touch-move listener');
    assert.strictEqual(listeners.get('touch-end').length, 1, 're-render must keep one touch-end listener');
    assert.ok(unscheduled.includes(scheduled[0]), 're-render must stop the previous inertia callback');
}

testLeaderboardRebindClearsOldListenersAndInertia();

const assetBootstrap = read('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts');
const commerce = read('assets/Scripts/Core/Panels/CommercePanelController.ts');
const homeAdFlow = read('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts');
const firstLevelRoute = read('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts');
const gameSceneRuntime = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const friendRank = read('assets/Scripts/Core/GameCtrlModules/FriendRankModule.ts');
const leaderboardPanel = read('assets/Scripts/Core/Panels/LeaderboardPanelController.ts');
const dailyClaimStart = commerce.indexOf('const claimButton =');
const dailyClaimEnd = commerce.indexOf('runtime.playPopupOpenAnim', dailyClaimStart);
const dailyClaimSource = commerce.slice(dailyClaimStart, dailyClaimEnd);
const homeHudFallbackStart = homeAdFlow.indexOf('if (!topHudWidgets) {');
const homeHudFallbackEnd = homeAdFlow.indexOf('this.drawStartButton', homeHudFallbackStart);
const homeHudFallbackSource = homeAdFlow.slice(homeHudFallbackStart, homeHudFallbackEnd);

assert.ok(
    assetBootstrap.includes('this.setGold(gameState.gold, { syncCloud: false });'),
    'cloud gold restore must use the wallet setter so the UI stays in sync',
);
assert.ok(
    !dailyClaimSource.includes('runtime.showMainMenu();'),
    'daily-sign-in click must not rebuild Home during the same touch',
);
assert.ok(
    dailyClaimSource.includes('runtime._suppressHomeStartUntil'),
    'daily-sign-in click must suppress a same-touch Home start',
);
assert.ok(
    homeHudFallbackSource.includes('this.drawGoldBanner(goldGroup);'),
    'Home must bind its scene-authored GoldGroup when the dynamic TopHud prefab is not ready',
);
assert.ok(
    homeHudFallbackSource.includes('this.drawLivesBanner(vigorGroup);'),
    'Home must bind its scene-authored VigorGroup when the dynamic TopHud prefab is not ready',
);
assert.ok(!firstLevelRoute.includes('setupShareMenu()'), 'dev_zhaoyao startup must not register a custom passive-share callback');
assert.ok(!gameSceneRuntime.includes('setupShareMenu?.()'), 'scene startup must keep the dev_zhaoyao passive-share policy');
assert.ok(friendRank.includes('clearLeaderboardScroll('), 'leaderboard must expose one scroll cleanup path');
assert.ok(friendRank.includes('viewport.targetOff(this);'), 'leaderboard re-render must remove old viewport touch handlers');
assert.ok(friendRank.includes('_leaderboardScrollInertiaStep'), 'leaderboard must retain and stop active inertia');
assert.ok(leaderboardPanel.includes('runtime.clearLeaderboardScroll?.();'), 'closing leaderboard must stop its scroll work');

for (const relPath of [
    'assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts',
    'assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts',
    'assets/Scripts/Core/Panels/CommercePanelController.ts',
    'assets/Scripts/Core/GameCtrlModules/HomeCommerceModule.ts',
    'assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts',
    'assets/Scripts/Core/GameCtrlModules/FriendRankModule.ts',
]) {
    assert.doesNotThrow(() => transpile(relPath), `${relPath} must remain valid TypeScript`);
}

console.log('gold-and-listener-lifecycle.test.js passed');
