const recoveryPlatform = require('./helpers/recovery-platform');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function harness(file, names, globals) {
    const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core', file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const found = new Map();
    function visit(node) {
        if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(ast))) found.set(node.name.getText(ast), node.getText(ast));
        ts.forEachChild(node, visit);
    }
    visit(ast);
    for (const name of names) assert.ok(found.has(name), name);
    const js = ts.transpileModule(`export class Harness {${[...found.values()].join('\n')}}`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const exports = {};
    new Function('exports', ...Object.keys(globals), js)(exports, ...Object.values(globals));
    return new exports.Harness();
}
function clock() {
    let id = 0;
    const timers = new Map();
    return {
        setTimeout(fn, ms) { assert.equal(ms, 5000); timers.set(++id, fn); return id; },
        clearTimeout(key) { timers.delete(key); },
        fire() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); },
        timers,
    };
}
const quiet = { error() {}, warn() {} };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fxFixture(mode = 'load-error', wechat = true) {
    const time = clock(), events = [];
    let assetCallback, starts = 0, created = 0;
    const fx = harness('GameCtrlModules/GameplayColorCompleteFxModule.ts', [
        'prewarmPinddSpineFx', 'failGameplayFxPrewarm', 'ensurePinddSpineFxSkeletonData',
        'ensurePatternCompleteFxPrefab', 'playPinddSpineFxOnBean', 'getPatternCompleteMatchFxDuration', 'playPatternCompleteMatchFx',
    ], {
        ...time, console: quiet, isMiniGameRuntime: () => wechat && recoveryPlatform.isMiniGameRuntime(),
        AnalyticsMgr: { inst: { trackFunnelEvent: event => events.push(event) } },
        sp: { SkeletonData: mode === 'no-module' ? null : class {} },
        createPinddSpineFxError: message => Error(message),
        ensurePinddSpineWasmReady: () => mode === 'wasm-timeout' ? new Promise(() => {}) : Promise.resolve(),
        PINDD_SPINE_FX_PATH: 'spine', PATTERN_COMPLETE_PREFAB_PATH: 'pattern', Prefab: class {},
        PINDD_SPINE_FX_ACTIVE_LIMIT: 48,
        PatternCompleteWaveFx: class {}, getPatternWaveDuration: () => 0.4, debugPerfTrace() {},
    });
    Object.assign(fx, { isValid: true, getActiveLogicalLevelId: () => 3,
        _withGameAssetsBundle(callback) { callback({ load(file, _type, done) {
            if (file === 'pattern') { done(Error('pattern missing'), null); return; }
            assetCallback = done;
            if (mode === 'load-error') done(Error('spine missing'), null);
            if (mode === 'pattern-error') done(null, {});
        } }); },
        acquirePinddSpineFxNode() { created++; return { node: {}, skeleton: {} }; }, recyclePinddSpineFxNode() {},
        _stopGameplayEntryWithFatalError() { throw Error('optional FX must not stop original gameplay'); },
    });
    return { fx, events, time, start() { fx.prewarmPinddSpineFx(() => starts++); },
        get starts() { return starts; }, get created() { return created; }, late() { assetCallback?.(null, {}); } };
}
function guideFixture(mode = 'load-error') {
    const time = clock(), events = [];
    let complete, grants = 0, shown = 0;
    const audio = { playGuideVoice() { if (mode === 'voice-error') throw Error('voice unavailable'); },
        play() { throw Error('button sound unavailable'); }, stopGuideVoice() {}, releasePreparedGuideVoices() { throw Error('voice release failed'); } };
    const controller = harness('PchConveyorGameplayController.ts', [
        'showRoundedMaterialGuide', 'showWeChatRoundedMaterialGuide', 'reportOpeningGuideResourceFailure',
        'runOptionalGuideAudio', 'createOpeningGuideCapacityFocusMask', 'createOpeningGuideSpeedFocusMask',
        'loadOpeningGuideBeanRing', 'showOpeningGuideBeanRings', 'onOpeningGuideFreeCapacity',
        'dismissOpeningGuide', 'clearOpeningGuideNodes',
        'getOpeningGuideAnalyticsMeta', 'trackOpeningGuideEvent', 'reportOpeningGuideTutorialFinish',
    ], {
        ...time, console: quiet, isMiniGameRuntime: () => recoveryPlatform.isMiniGameRuntime(), EffectAsset: class {}, UITransform: class {},
        Material: class { initialize() { if (mode === 'material-error') throw Error('material init failed'); } destroy() {} },
        sp: { SkeletonData: class {}, Skeleton: class {} },
        AudioMgr: { inst: audio }, AnalyticsMgr: { inst: { trackFunnelEvent: e => events.push(e), getCurrentRoundId: () => 'round-3' } },
        SySDKMgr: { inst: { reportTutorialFinish() {} } },
    });
    const parent = { isValid: true, getComponent: () => ({ convertToNodeSpaceAR: value => value }) };
    Object.assign(controller, { rules: { bufferCapacity: 60 }, openingGuideRingLoadVersion: 0, openingGuideRingNodes: [],
        adButton: { worldPosition: {} }, speedButton: {},
        runtime: { isGameEnd: false, getActiveLogicalLevelId: () => 3, getGameplayFixedRoot: () => parent,
            showToast() {}, syncSkillButtonRuntimeStates() {},
            _withBootstrapBundle(callback) { callback({ load(_file, _type, done) { complete = done; } }); },
            _stopGameplayEntryWithFatalError() { throw Error('optional guide resource must not stop original gameplay'); } },
        showOpeningTargetGuide(_parent, _target, name, _text, tap) {
            shown++;
            this.openingGuideTutorialStarted = true;
            this.openingGuide = { name, isValid: true, destroy() { this.isValid = false; } };
            this.tap = tap;
            if (!this.capacityGuideMaterial) this.createOpeningGuideCapacityFocusMask(parent, {}, 10, 10);
        },
        clearLevelTwoSoftHand() {}, clearCapacityHint() {},
        trackPchFunnelEvent(eventName, details) { events.push({ eventName, ...details }); }, resetCapacityAdGesture() {},
        playCapacityGuideTapRings() { throw Error('optional feedback failed'); },
        expandCapacity() { grants++; this.rules.bufferCapacity += 10; return true; },
    });
    return { controller, events, time, parent, complete: (...args) => complete(...args),
        get grants() { return grants; }, get shown() { return shown; } };
}
async function run() {
    const entry = harness('GameCtrlModules/SkinBackgroundModule.ts', ['startGameplayWithBackgroundSkinReady'], {
        isMiniGameRuntime: () => recoveryPlatform.isMiniGameRuntime(), isWorkbenchPreviewRequested: () => false,
    });
    const pending = [], entered = [];
    Object.assign(entry, { isValid: true, _gameplayLoadRequestVersion: 1,
        prewarmPinddSpineFx: cb => pending.push(cb), initGame: data => entered.push(data),
    });
    const original = { levelId: 2 }, next = { levelId: 3 };
    entry.startGameplayWithBackgroundSkinReady(original, 2);
    entry._gameplayLoadRequestVersion++;
    entry.startGameplayWithBackgroundSkinReady(next, 3);
    pending[0](); pending[1](); pending[1]();
    assert.deepEqual(entered, [next], 'stale/duplicate prewarm completion cannot replace the current original level');
    for (const mode of ['load-error', 'no-module', 'pattern-error', 'wasm-timeout', 'late']) {
        const f = fxFixture(mode); f.start(); await flush();
        if (mode === 'wasm-timeout' || mode === 'late') f.time.fire();
        assert.equal(f.starts, 1, `${mode}: original init runs exactly once`);
        assert.equal(f.fx._pinddSpineFxPrewarmReady, false, 'failure is never labeled prewarm success');
        assert.equal(f.fx._pinddSpineFxUnavailable, true);
        assert.equal(f.time.timers.size, 0);
        f.late(); await flush(); assert.equal(f.starts, 1, 'late resource cannot initialize twice');
        let completions = 0;
        f.fx.playPinddSpineFxOnBean({ isValid: true }, 'a1_1', () => completions++);
        f.fx.playPatternCompleteMatchFx(() => completions++);
        assert.equal(completions, 2, 'visual callbacks still release original placement/settlement waits');
        assert.equal(f.fx.getPatternCompleteMatchFxDuration(), 0);
        assert.equal(f.events.length, 1);
        assert.equal(f.events[0].success, false);
    }
    const other = fxFixture('no-module', false);
    assert.throws(() => other.start(), /Spine module/, 'non-WeChat preserves original behavior');
    const runtime = fxFixture('late');
    runtime.fx._pinddSpineFxSkeletonData = {};
    runtime.fx.acquirePinddSpineFxNode = () => { throw Error('renderer unavailable'); };
    let released = 0;
    runtime.fx.playPinddSpineFxOnBean({ isValid: true }, 'a1_1', () => released++);
    assert.equal(released, 1, 'renderer setup failure releases original placement wait');

    const draining = fxFixture(); let drained = 0;
    draining.fx._pinddSpineFxSkeletonDataCallbacks = [() => { throw Error('core wait failed'); }, () => drained++];
    draining.fx._pinddSpineFxPrewarmCallbacks = [() => drained++];
    assert.throws(() => draining.fx.failGameplayFxPrewarm(Error('missing effect')), /core wait failed/);
    assert.equal(drained, 2, 'a failed callback must not strand unrelated queued waits');
    for (const mode of ['missing-prefab', 'player-error', 'callback-error']) {
        const pattern = fxFixture(); let finished = 0, cleared = 0;
        pattern.fx.getPatternCompleteWaveCells = () => [{ row: 0, col: 0 }];
        pattern.fx.clearPatternCompleteMatchFx = () => cleared++;
        pattern.fx._patternCompleteWavePrefab = mode === 'missing-prefab' ? null : { isValid: true };
        pattern.fx.getPatternCompleteMatchFxRoot = () => ({ getComponent: () => ({
            play(_prefab, _cells, done) {
                if (mode === 'player-error') throw Error('injected player setup');
                done();
            },
        }) });
        const play = () => pattern.fx.playPatternCompleteMatchFx(() => {
            finished++;
            if (mode === 'callback-error') throw Error('settlement callback failed');
        });
        if (mode === 'callback-error') {
            assert.throws(play, /settlement callback failed/);
            assert.equal(pattern.events.length, 0, 'core settlement error must not be mislabeled as an optional FX failure');
        } else {
            play();
            assert.equal(pattern.events[0].eventName, 'gameplay_fx_unavailable');
            assert.ok(cleared >= 1);
        }
        assert.equal(finished, 1, 'pattern failure and callback failure must not execute settlement twice');
    }

    for (const mode of ['load-error', 'material-error', 'voice-error', 'timeout']) {
        const g = guideFixture(mode);
        g.controller.showRoundedMaterialGuide(g.parent, false);
        if (mode === 'timeout') g.time.fire();
        else g.complete(mode === 'load-error' ? Error('shader missing') : null, mode === 'load-error' ? null : {});
        assert.equal(g.shown, 1);
        assert.equal(g.controller.openingGuide.name, 'PchLevelThreeCapacityGuide');
        assert.equal(g.controller.inputLocked, true, 'original tutorial waits for the real player tap');
        g.controller.tap.call(g.controller, {});
        assert.equal(g.grants, 1);
        assert.equal(g.controller.rules.bufferCapacity, 70);
        assert.equal(g.controller.inputLocked, false, 'audio/feedback errors cannot retain tutorial lock');
        g.controller.onOpeningGuideFreeCapacity({});
        assert.equal(g.grants, 1, 'second tap cannot claim free expansion twice');
        if (mode === 'timeout') g.complete(null, {});
        assert.equal(g.shown, 1, 'late shader cannot recreate dismissed tutorial');
        assert.ok(g.events.some(e => !e.success));
        for (const eventName of ['pch_guide_tap_result', 'pch_guide_step_done', 'guide_complete']) {
            const recorded = g.events.filter(event => event.eventName === eventName);
            assert.equal(recorded.length, 1, 'dismissal must retain exactly one guide completion event');
            assert.equal(recorded[0].extra.guideId, 'pch_level_3_capacity_v1');
        }
    }
    const stale = guideFixture();
    stale.controller.showRoundedMaterialGuide(stale.parent, false);
    stale.controller.clearOpeningGuideNodes();
    stale.complete(null, {}); stale.time.fire();
    assert.equal(stale.shown, 0, 'cancelled guide cannot reappear');
    const ring = guideFixture(); let steps = 0;
    ring.controller.loadOpeningGuideBeanRing(ring.parent, () => { steps++; ring.controller.showOpeningGuideBeanRings([]); });
    ring.time.fire(); ring.complete(null, {});
    assert.equal(steps, 1, 'missing decorative ring retains original tutorial step exactly once');
    assert.ok(ring.events.some(e => e.errorCode === 'opening_guide_ring_failed'));
    const badAnimation = guideFixture(); let attempts = 0;
    badAnimation.controller.loadOpeningGuideBeanRing(badAnimation.parent, () => {
        attempts++;
        if (attempts === 1) throw Error('decorative ring animation missing');
        badAnimation.controller.openingGuide = { isValid: true, name: 'original-step', destroy() { this.isValid = false; } };
    });
    badAnimation.complete(null, {});
    assert.equal(attempts, 2);
    assert.equal(badAnimation.controller.openingGuide.name, 'original-step', 'ring recovery must not destroy the newly restored original guide');
    console.log('WeChat optional resources: FX failure/timeout, late callbacks, guide input, audio failure, single capacity grant and platform isolation passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
