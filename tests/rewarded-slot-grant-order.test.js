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
    assert.deepStrictEqual(events, ['activity', 'audio', 'pause', 'request:unlock_slot_row']);
    assert.strictEqual(capturedOptions.onAdComplete, undefined, 'slot timer must not resume in ad-complete callback');
    assert.strictEqual(typeof capturedOptions.onFinally, 'function');

    assert.strictEqual(capturedGrant(), true);
    assert.deepStrictEqual(
        events,
        ['activity', 'audio', 'pause', 'request:unlock_slot_row', 'grant', 'assisted'],
        'slot grant must finish while the prop timer remains paused',
    );

    capturedOptions.onFinally();
    assert.deepStrictEqual(
        events,
        ['activity', 'audio', 'pause', 'request:unlock_slot_row', 'grant', 'assisted', 'resume'],
        'prop timer must resume only after rewarded grant finalization',
    );
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
    assert.strictEqual(runtime.slotRowCount, 4, 'the next locked preview row must be physically appended');
    assert.strictEqual(slotModel.unlockedCount, 36, 'usable slot capacity must grow from 24 to 36');
    assert.strictEqual(slotModel.totalCount, 48, 'physical slot capacity must grow from 36 to 48');
    assert.strictEqual(slotModel.getAll().length, 48, 'the underlying slot array must contain the appended row');
    assert.strictEqual(
        slotModel.store({ colorId: 100, cells: [], isLocked: false, source: 'board' }),
        24,
        'the first slot in the newly unlocked third row must accept a real block',
    );
    assert.deepStrictEqual(events, ['rebuild', 'render', 'clear-reminder']);

    assert.strictEqual(controller.unlockSlotRow(), true, 'the final locked preview row must also be unlockable');
    assert.strictEqual(runtime.slotUnlockedRows, 4);
    assert.strictEqual(runtime.slotRowCount, 4);
    assert.strictEqual(slotModel.unlockedCount, 48);
    assert.strictEqual(slotModel.totalCount, 48, 'unlocking the maximum row must not allocate beyond the maximum');
    const eventsBeforeNoop = [...events];
    assert.strictEqual(controller.unlockSlotRow(), false, 'a fully unlocked slot model must report a no-op');
    assert.deepStrictEqual(events, eventsBeforeNoop, 'a no-op must not rebuild or rerender the slot UI');
}

testRewardedGrantOrder();
testRewardedUnlockExpandsRealCapacity();
console.log('rewarded-slot-grant-order.test.js passed');
