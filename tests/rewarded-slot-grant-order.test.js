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

function loadSlotController(events) {
    const module = { exports: {} };
    const sandbox = {
        module,
        exports: module.exports,
        require(id) {
            if (id === './GameCtrlShared') {
                return {
                    AudioMgr: { inst: { play: () => events.push('audio') } },
                    PerformanceMgr: { inst: { markUserActivity: () => events.push('activity') } },
                    SLOTS_PER_ROW: 12,
                    sys: { localStorage: { setItem() {}, getItem() { return ''; } } },
                };
            }
            if (id === './GameplaySkillUiController') {
                return { ensureGameplaySkillUiController: () => ({}) };
            }
            if (id === './SlotOnboardingPolicy') {
                return {
                    getSlotUnlockMode: () => 'ad',
                    getSlotUnlockModeForPolicy: () => 'ad',
                    shouldAppendLockedSlotRowAfterUnlock: () => true,
                    shouldShowGameplaySkillArea: () => true,
                };
            }
            if (id === 'cc') {
                return { Widget: class Widget {} };
            }
            throw new Error(`unexpected require: ${id}`);
        },
        console,
    };
    vm.runInNewContext(transpile('assets/Scripts/Core/GameplaySlotUiController.ts'), sandbox, {
        filename: 'GameplaySlotUiController.ts',
    });
    return module.exports.GameplaySlotUiController;
}

function loadSlotModel() {
    const module = { exports: {} };
    const sandbox = {
        module,
        exports: module.exports,
        require(id) {
            if (id === '../Core/LevelConfig') return {};
            throw new Error(`unexpected require: ${id}`);
        },
        console,
    };
    vm.runInNewContext(transpile('assets/Scripts/UI/SlotCtrl.ts'), sandbox, {
        filename: 'SlotCtrl.ts',
    });
    return module.exports.SlotModel;
}

function testRewardedGrantOrder() {
    const events = [];
    let capturedGrant = null;
    let capturedOptions = null;
    const runtime = {
        slotUnlockedRows: 1,
        slotRowCount: 2,
        _activeSlotRowPolicy: {},
        _skillActive: false,
        isPlacementVisualBusy: () => false,
        getActiveLogicalLevelId: () => 10,
        getMaxSlotRows: () => 4,
        pauseTimerForProp: () => events.push('pause'),
        resumeTimerForProp: () => events.push('resume'),
        markDynamicCountdownAssisted: () => events.push('assisted'),
        runRewardedGrant(page, grant, options) {
            events.push(`request:${page}`);
            capturedGrant = grant;
            capturedOptions = options;
            options.onInteractionStarted?.();
            return true;
        },
    };
    const GameplaySlotUiController = loadSlotController(events);
    const controller = new GameplaySlotUiController(runtime);
    controller.unlockSlotRow = () => {
        events.push('grant');
        return true;
    };

    assert.strictEqual(controller.tryUnlockSlotRow(), true);
    assert.deepStrictEqual(events, ['activity', 'audio', 'request:unlock_slot_row', 'pause']);
    assert.strictEqual(capturedOptions.busyFlag, '_adShowing', 'slot ad wait must not own the board-wide skill input gate');
    assert.strictEqual(typeof capturedOptions.onInteractionStarted, 'function');
    assert.strictEqual(capturedOptions.onAdComplete, undefined, 'slot timer must not resume in ad-complete callback');
    assert.strictEqual(typeof capturedOptions.onInteractionReleased, 'function');
    assert.strictEqual(capturedOptions.onFinally, undefined, 'slot timer release belongs to the attempt lease, not the claim terminal hook');

    assert.strictEqual(capturedGrant(), true);
    assert.deepStrictEqual(
        events,
        ['activity', 'audio', 'request:unlock_slot_row', 'pause', 'grant', 'assisted'],
        'slot grant must finish while the prop timer remains paused',
    );

    capturedOptions.onInteractionReleased();
    assert.deepStrictEqual(
        events,
        ['activity', 'audio', 'request:unlock_slot_row', 'pause', 'grant', 'assisted', 'resume'],
        'prop timer must resume only after rewarded grant finalization',
    );
}

function testRejectedRewardedClaimDoesNotPauseTimer() {
    const events = [];
    const runtime = {
        slotUnlockedRows: 1,
        slotRowCount: 2,
        _activeSlotRowPolicy: {},
        _skillActive: false,
        _adShowing: false,
        isPlacementVisualBusy: () => false,
        getActiveLogicalLevelId: () => 10,
        getMaxSlotRows: () => 4,
        pauseTimerForProp: () => events.push('pause'),
        resumeTimerForProp: () => events.push('resume'),
        runRewardedGrant(page) {
            events.push(`request:${page}`);
            return false;
        },
    };
    const GameplaySlotUiController = loadSlotController(events);
    const controller = new GameplaySlotUiController(runtime);

    assert.strictEqual(controller.tryUnlockSlotRow(), false);
    assert.deepStrictEqual(
        events,
        ['activity', 'audio', 'request:unlock_slot_row'],
        'a conflicting active reward claim must reject slot unlock before it acquires a timer pause',
    );
    assert.strictEqual(runtime._skillActive, false);
}

function testRewardedUnlockExpandsRealCapacity() {
    const events = [];
    const SlotModel = loadSlotModel();
    const slotModel = new SlotModel(36);
    slotModel.unlockedCount = 24;
    for (let index = 0; index < 24; index += 1) {
        assert.strictEqual(slotModel.store({ colorId: index + 1, cells: [], isLocked: false, source: 'board' }), index);
    }
    assert.strictEqual(
        slotModel.store({ colorId: 100, cells: [], isLocked: false, source: 'board' }),
        -1,
        'the locked third row must not be usable before a reward',
    );
    const runtime = {
        slotUnlockedRows: 2,
        slotRowCount: 3,
        slotModel,
        _activeSlotRowPolicy: {
            appendLockedRowAfterUnlock: true,
            unlockAllRowsAtOnce: false,
            rowCount: 3,
        },
        getMaxSlotRows: () => 4,
        getActiveLogicalLevelId: () => 915,
        renderSlots: () => events.push('render'),
        clearAdRewardSlotAddReminderVisuals: () => events.push('clear-reminder'),
    };
    const GameplaySlotUiController = loadSlotController(events);
    const controller = new GameplaySlotUiController(runtime);
    controller.rebuildSlotNodes = () => events.push('rebuild');

    assert.strictEqual(controller.unlockSlotRow(), true, 'rewarded unlock must report a real state advance');
    assert.strictEqual(runtime.slotUnlockedRows, 3, 'the previously locked third row must become usable');
    assert.strictEqual(runtime.slotRowCount, 3, 'Level 2 must stop at its one configured rewarded row');
    assert.strictEqual(slotModel.unlockedCount, 36, 'usable slot capacity must grow from 24 to 36');
    assert.strictEqual(slotModel.totalCount, 36, 'physical capacity must not grow beyond the configured three rows');
    assert.strictEqual(slotModel.getAll().length, 36, 'the underlying slot array must stop at the configured row count');
    assert.strictEqual(
        slotModel.store({ colorId: 100, cells: [], isLocked: false, source: 'board' }),
        24,
        'the first slot in the newly unlocked third row must accept a real block',
    );
    assert.deepStrictEqual(events, ['rebuild', 'render', 'clear-reminder']);

    const eventsBeforeNoop = [...events];
    assert.strictEqual(controller.unlockSlotRow(), false, 'a fully unlocked configured policy must report a no-op');
    assert.deepStrictEqual(events, eventsBeforeNoop, 'a no-op must not rebuild or rerender the slot UI');
}

function testRewardedUnlockAppendsOnlyConfiguredFourthRow() {
    const events = [];
    const SlotModel = loadSlotModel();
    const slotModel = new SlotModel(36);
    slotModel.unlockedCount = 24;
    const runtime = {
        slotUnlockedRows: 2,
        slotRowCount: 3,
        slotModel,
        _activeSlotRowPolicy: {
            appendLockedRowAfterUnlock: true,
            unlockAllRowsAtOnce: false,
            rowCount: 4,
        },
        getMaxSlotRows: () => 4,
        getActiveLogicalLevelId: () => 3,
        renderSlots: () => events.push('render'),
        clearAdRewardSlotAddReminderVisuals: () => events.push('clear-reminder'),
    };
    const GameplaySlotUiController = loadSlotController(events);
    const controller = new GameplaySlotUiController(runtime);
    controller.rebuildSlotNodes = () => events.push('rebuild');

    assert.strictEqual(controller.unlockSlotRow(), true, 'a policy with a fourth configured row must advance');
    assert.strictEqual(runtime.slotUnlockedRows, 3);
    assert.strictEqual(runtime.slotRowCount, 4, 'the next configured locked preview row must remain visible');
    assert.strictEqual(slotModel.unlockedCount, 36);
    assert.strictEqual(slotModel.totalCount, 48);
}

function testLevelThreeRewardedUnlockAddsTwoRowsAtOnce() {
    const events = [];
    const level3 = JSON.parse(fs.readFileSync(path.join(root, 'assets/LevelData/level_3.json'), 'utf8'));
    const configuredPolicy = level3.slotPolicy;
    const targetRows = configuredPolicy.defaultRows + configuredPolicy.freeUnlockRows + configuredPolicy.adUnlockRows;
    const initialVisibleRows = Math.min(targetRows, configuredPolicy.defaultRows + 1);
    const SlotModel = loadSlotModel();
    const slotModel = new SlotModel(initialVisibleRows * 12);
    slotModel.unlockedCount = configuredPolicy.defaultRows * 12;
    const runtime = {
        slotUnlockedRows: configuredPolicy.defaultRows,
        slotRowCount: initialVisibleRows,
        slotModel,
        _activeSlotRowPolicy: {
            ...configuredPolicy,
            rowCount: targetRows,
            appendLockedRowAfterUnlock: configuredPolicy.adUnlockRows > 0,
        },
        getMaxSlotRows: () => 4,
        getActiveLogicalLevelId: () => 3,
        renderSlots: () => events.push('render'),
        clearAdRewardSlotAddReminderVisuals: () => events.push('clear-reminder'),
    };
    const GameplaySlotUiController = loadSlotController(events);
    const controller = new GameplaySlotUiController(runtime);
    controller.rebuildSlotNodes = () => events.push('rebuild');

    assert.strictEqual(runtime.slotUnlockedRows, 1, 'Level 3 must initialize with one usable row');
    assert.strictEqual(controller.unlockSlotRow(), true, 'the Level 3 rewarded unlock must advance slot state');
    assert.strictEqual(runtime.slotUnlockedRows, 3, 'one Level 3 reward must add two usable rows');
    assert.strictEqual(runtime.slotRowCount, 3, 'Level 3 must stop at its configured three-row total');
    assert.strictEqual(slotModel.unlockedCount, 36, 'all three Level 3 rows must become usable');
    assert.strictEqual(slotModel.totalCount, 36, 'the missing third physical row must be allocated during unlock');
    assert.deepStrictEqual(events, ['rebuild', 'render', 'clear-reminder']);
}

testRewardedGrantOrder();
testRejectedRewardedClaimDoesNotPauseTimer();
testRewardedUnlockExpandsRealCapacity();
testRewardedUnlockAppendsOnlyConfiguredFourthRow();
testLevelThreeRewardedUnlockAddsTwoRowsAtOnce();
console.log('rewarded-slot-grant-order.test.js passed');
