const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

function transpile(relPath) {
    return ts.transpileModule(read(relPath), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
}

function extractMethod(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `missing method signature: ${signature}`);
    const open = source.indexOf('{', start);
    assert.ok(open >= 0, `missing method body: ${signature}`);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`unterminated method body: ${signature}`);
}

function compileMethod(source, signature, argumentNames = []) {
    const method = extractMethod(source, signature);
    const open = method.indexOf('{');
    return new Function(...argumentNames, method.slice(open + 1, -1));
}

function loadHomeAdInstaller() {
    const module = { exports: {} };
    const idleState = {
        status: 'idle',
        previousStatus: 'idle',
        reason: 'e2e-idle',
        requestId: 0,
        generation: 0,
        changedAt: Date.now(),
        durationMs: 0,
    };
    vm.runInNewContext(transpile('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts'), {
        module,
        exports: module.exports,
        require(id) {
            if (id === '../GameCtrlShared') {
                return {
                    AdConfig: {
                        cancelRewardedAdInteraction: () => false,
                        endRewardedAdWait: () => false,
                        canAutoPreloadRewardedAd: () => false,
                        preloadRewardedAd: () => false,
                        setRewardedAdKeepReady() {},
                        getRewardedAdState: () => idleState,
                        subscribeRewardedAdState(listener) {
                            listener(idleState);
                            return () => {};
                        },
                    },
                    AnalyticsMgr: {
                        inst: {
                            trackAdClick() {},
                            trackAdShow() {},
                            trackAdFinish() {},
                            markAdRevive() {},
                            trackReviveSuccess() {},
                        },
                    },
                    AudioMgr: { inst: { beginExternalInterruption() {}, endExternalInterruptionWithBgmRestart() {} } },
                    PerformanceMgr: { inst: { markUserActivity() {} } },
                    SySDKMgr: { inst: { reportAdClick() {}, reportAdShow() {}, reportAdFinish() {} } },
                };
            }
            if (id === '../AppRoot') return { AppRoot: {} };
            if (id === '../GameplayResultPanelController') {
                return { ensureGameplayResultPanelController: () => ({}) };
            }
            if (id === '../PixelPosterPreviewRenderer') return { releasePixelPosterPreviewTree() {} };
            if (id === '../RuntimeLog') return { runtimeLog() {} };
            if (id === '../../Platform/WeChatShareReturnService') {
                return { weChatShareReturnService: { start: () => ({ started: false, reason: 'unavailable' }) } };
            }
            throw new Error(`unexpected HomeAdFlowModule require: ${id}`);
        },
        console,
        setTimeout,
        clearTimeout,
    }, { filename: 'HomeAdFlowModule.ts' });
    return module.exports.installHomeAdFlowModule;
}

function loadResultPanelController(pchController) {
    class Button {}
    Button.EventType = { CLICK: 'click' };
    class BlockInputEvents {}
    class Label {}
    Label.Overflow = { SHRINK: 'shrink' };
    class Node {}
    Node.EventType = { TOUCH_END: 'touch-end' };
    class UITransform {}
    const module = { exports: {} };
    vm.runInNewContext(transpile('assets/Scripts/Core/GameplayResultPanelController.ts'), {
        module,
        exports: module.exports,
        require(id) {
            if (id === './GameCtrlShared') {
                return {
                    AnalyticsMgr: { inst: {} },
                    AudioMgr: { inst: { play() {} } },
                    BlockInputEvents,
                    Button,
                    Bundle: class {},
                    Color: class {},
                    Graphics: class {},
                    Label,
                    Node,
                    PerformanceMgr: { inst: {} },
                    Prefab: class {},
                    ProgressBar: class {},
                    Sprite: class {},
                    Tween: class {},
                    UIOpacity: class {},
                    UITransform,
                    Vec2: class {},
                    Vec3: class {},
                    assetManager: {},
                    GAME_ASSETS_BUNDLE_NAME: 'gameAssets',
                    LOCAL_BOOTSTRAP_BUNDLE_NAME: 'bootstrap',
                    instantiate() {},
                    tween() {},
                };
            }
            if (id === './AppRoot') return { AppRoot: {} };
            if (id === './MiniGamePlatform') return { isMiniGameRuntime: () => false };
            if (id === './PchConveyorGameplayController') {
                return { ensurePchConveyorGameplayController: () => pchController };
            }
            throw new Error(`unexpected GameplayResultPanelController require: ${id}`);
        },
        console,
        Map,
        Set,
        WeakMap,
    }, { filename: 'GameplayResultPanelController.ts' });
    return module.exports.GameplayResultPanelController;
}

function loadPchRules() {
    const module = { exports: {} };
    vm.runInNewContext(transpile('assets/Scripts/Core/PchConveyorRules.ts'), {
        module,
        exports: module.exports,
        require(id) {
            if (id === './LevelConfig') {
                return {
                    CONVEYOR_STACK_DEPTH: 3,
                    validateConveyorCapacity(value) {
                        const capacity = Number(value);
                        if (!Number.isInteger(capacity) || capacity <= 0 || capacity % 3 !== 0) {
                            throw new Error(`invalid conveyor capacity: ${value}`);
                        }
                        return capacity;
                    },
                    validatePchSingleSelectionLimit(value) {
                        return Math.max(1, Math.floor(Number(value) || 18));
                    },
                };
            }
            throw new Error(`unexpected PchConveyorRules require: ${id}`);
        },
        console,
        Map,
        Set,
        Math,
    }, { filename: 'PchConveyorRules.ts' });
    return module.exports.PchConveyorRules;
}

async function flushMicrotasks(rounds = 12) {
    for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

async function main() {
    const board = {
        height: 1,
        width: 1,
        currentColors: [[9]],
        correctColors: [[1]],
        locked: [[false]],
    };
    const PchConveyorRules = loadPchRules();
    const rules = new PchConveyorRules(board, 72, 18);
    for (const stack of rules.carriers) stack.push(1, 1, 1);
    assert.strictEqual(rules.bufferCount, 72);
    assert.strictEqual(rules.bufferCapacity, 72);
    assert.strictEqual(rules.isBufferDeadlocked(), true, 'fixture must begin at a real 72/72 deadlock');

    const pchSource = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
    const settlementSource = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
    const runExpandCapacity = compileMethod(
        pchSource,
        'private expandCapacity(): boolean',
        ['PCH_EXPAND_CAPACITY', 'AudioMgr'],
    );
    const runContinueAfterBufferFull = compileMethod(pchSource, 'continueAfterBufferFull(): boolean');
    const runCheckBufferDeadlock = compileMethod(pchSource, 'private checkBufferDeadlock(): boolean');
    const runUpdate = compileMethod(
        pchSource,
        'update(deltaTime: number): void',
        ['deltaTime', 'BELT_STEP_SECONDS', 'PCH_ENTRY_PICKUP_LEAD_STEP_RATIO'],
    );
    const runContinueAfterLose = compileMethod(
        settlementSource,
        'continueAfterLose(addSeconds: number, resumeTimerImmediately: boolean = false)',
        ['addSeconds', 'resumeTimerImmediately'],
    );

    const events = [];
    const attempts = [];
    const buttonHandlers = new Map();
    const firstOverlay = { active: true };
    const finalOverlay = { active: false };
    const runtime = {
        constructor: { REWARDED_CONTINUE_SECONDS: 120 },
        _activeLoseReason: 'buffer-full',
        _adShowing: false,
        _timerStarted: true,
        _currentLevelUnlimitedTime: false,
        _timerPauseRefs: 0,
        _timerLockedForProp: false,
        _freezeTimeLeft: 0,
        _freezeTimeTotal: 0,
        _adTimerSuspended: false,
        _guideStep: -1,
        _guidePhase: '',
        isGameEnd: true,
        isSelected: false,
        currentBlock: null,
        timeRemain: 227,
        timerLabel: null,
        panelTimeoutContinue: null,
        panelBufferFullContinue: firstOverlay,
        panelLose: finalOverlay,
        getActiveLogicalLevelId: () => 14,
        getAnalyticsLevelId: () => 14,
        acquireRuntimeOwner: () => '',
        releaseRuntimeOwner() {},
        clearRewardedAdPendingStrip() {},
        showRewardedAdPendingStrip() {},
        showToast(text) { events.push(`toast:${text}`); },
        revokeDynamicCountdownFinalFailure() {},
        markDynamicCountdownAssisted() {},
        resetTouchState() {},
        clearFreezeSpineFx() {},
        unschedule() {},
        schedule() {},
        resetIdleHintTimer() {},
        bindPanelButton(node, handler) { buttonHandlers.set(node, handler); },
        showTrackedRewardedAd(page, onComplete) { attempts.push({ page, onComplete }); },
        gameLose(reason) { events.push(`gameLose:${reason}`); },
    };
    loadHomeAdInstaller()(runtime);
    runtime.bindPanelButton = (node, handler) => buttonHandlers.set(node, handler);
    runtime.showTrackedRewardedAd = (page, onComplete) => attempts.push({ page, onComplete });

    const pchController = {
        rules,
        runtime,
        inputLocked: true,
        settlementPaused: true,
        skillMovementPaused: false,
        openingGuide: null,
        beltTravel: 0,
        lastEntranceAudioVisitByCarrier: new Map(),
        exitPathProgress: 0.5,
        isActive: () => true,
        getBufferCapacity: () => rules.bufferCapacity,
        wrap01(value) { return ((value % 1) + 1) % 1; },
        renderConveyor() { events.push(`render:${rules.bufferCount}/${rules.bufferCapacity}`); },
        renderEntranceQueue() {},
        refreshStatus() {},
        showCapacityBurst(added) { events.push(`burst:+${added}`); },
        resumeAfterSettlement() { this.settlementPaused = false; },
        updateSphereFlyEffects() {},
        updateExitArrowAnimation() {},
        getEffectiveBeltSpeedMultiplier: () => 1,
        didCarrierCrossProgress: () => false,
        handleCarrierAtEntrance() {},
        handleCarrierAtExit() {},
        updateBeltPositions() { events.push('belt-updated'); },
        expandCapacity() {
            return runExpandCapacity.call(this, 12, { inst: { play() {} } });
        },
        continueAfterBufferFull() { return runContinueAfterBufferFull.call(this); },
        checkBufferDeadlock() { return runCheckBufferDeadlock.call(this); },
        update(deltaTime) { return runUpdate.call(this, deltaTime, 0.25, 0.2); },
    };
    runtime._pchConveyorGameplayController = pchController;
    runtime.continueAfterLose = (addSeconds, resumeTimerImmediately) => {
        events.push(`continue:${rules.bufferCount}/${rules.bufferCapacity}:locked=${pchController.inputLocked}`);
        return runContinueAfterLose.call(runtime, addSeconds, resumeTimerImmediately);
    };

    const ResultPanelController = loadResultPanelController(pchController);
    const resultController = new ResultPanelController(runtime);

    resultController.runBufferFullReviveAction(firstOverlay);
    assert.strictEqual(attempts.length, 1);
    assert.strictEqual(attempts[0].page, 'pch_buffer_full_revive');
    attempts[0].onComplete({ attemptId: 1, status: 'verified_incomplete' });
    assert.strictEqual(rules.bufferCapacity, 72, 'incomplete first ad must not expand capacity');
    assert.strictEqual(firstOverlay.active, true, 'incomplete first ad must leave the first revive page available');
    assert.strictEqual(runtime._rewardedGrantTransaction, null, 'incomplete first ad must release its transaction');
    assert.strictEqual(runtime._adShowing, false, 'incomplete first ad must release the busy flag');

    firstOverlay.active = false;
    finalOverlay.active = true;
    assert.strictEqual(runtime._activeLoseReason, 'buffer-full', 'entering final failure must retain the full-buffer reason');

    const finalReviveButton = {};
    resultController.bindLoseReviveContinueAction(finalReviveButton, finalOverlay);
    buttonHandlers.get(finalReviveButton)();
    assert.strictEqual(attempts.length, 2, 'final failure revive must start a second ad');
    assert.strictEqual(attempts[1].page, 'pch_buffer_full_revive', 'second ad must keep the buffer expansion placement');
    pchController.inputLocked = false;
    attempts[1].onComplete({ attemptId: 2, status: 'verified_complete' });

    assert.strictEqual(rules.bufferCount, 72);
    assert.strictEqual(rules.bufferCapacity, 84, 'verified second ad must expand even if asynchronous UI released the old input lock');
    assert.strictEqual(pchController.inputLocked, false, 'verified second ad must unlock conveyor input');
    assert.strictEqual(runtime.isGameEnd, false, 'verified second ad must resume the same game');
    assert.strictEqual(runtime._activeLoseReason, null, 'successful recovery must clear the consumed loss reason');
    assert.strictEqual(finalOverlay.active, false, 'successful recovery must close the final failure page');
    assert.ok(
        events.includes('continue:72/84:locked=false'),
        'capacity expansion and input unlock must happen before continueAfterLose',
    );

    await flushMicrotasks();
    assert.strictEqual(runtime._rewardedGrantTransaction, null, 'successful second grant must finalize its transaction');
    pchController.update(0.016);
    assert.strictEqual(
        events.filter((event) => event === 'gameLose:buffer-full').length,
        0,
        'the first resumed conveyor frame must not reopen the buffer-full revive page',
    );
    assert.strictEqual(rules.isBufferDeadlocked(), false, '72 stored beans must not deadlock an expanded 84-slot conveyor');

    console.log('buffer-full-final-revive-e2e.test.js passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
