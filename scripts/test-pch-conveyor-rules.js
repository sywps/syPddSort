'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(projectRoot, 'assets/Scripts/Core/PchConveyorRules.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
    },
    fileName: sourcePath,
    reportDiagnostics: true,
});

const diagnostics = compiled.diagnostics || [];
assert.equal(diagnostics.length, 0, diagnostics.map((item) => item.messageText).join('\n'));
const loadedModule = { exports: {} };
const load = new Function('module', 'exports', 'require', compiled.outputText);
load(loadedModule, loadedModule.exports, (request) => {
    if (request === './LevelConfig') {
        return {
            CONVEYOR_STACK_DEPTH: 3,
            validateConveyorCapacity(value, label) {
                if (!Number.isInteger(value) || value <= 0) {
                    throw new Error(`[ConveyorCapacity] ${label}.conveyorCapacity must be a positive integer: ${value}`);
                }
                if (value % 3 !== 0) {
                    throw new Error(`[ConveyorCapacity] ${label}.conveyorCapacity must be a multiple of 3: ${value}`);
                }
                return value;
            },
        };
    }
    return require(request);
});
const { PchConveyorRules: RequiredCapacityPchConveyorRules } = loadedModule.exports;
class PchConveyorRules extends RequiredCapacityPchConveyorRules {
    constructor(board, conveyorCapacity = 60) {
        super(board, conveyorCapacity);
    }
}

class FakeBoard {
    constructor(width, height, correctColors, currentColors) {
        this.width = width;
        this.height = height;
        this.correctColors = correctColors;
        this.currentColors = currentColors;
        this.locked = currentColors.map((row, rowIndex) => row.map((color, colIndex) => (
            color > 0 && color === correctColors[rowIndex][colIndex]
        )));
    }

    getConnectedBlock(row, col) {
        const colorId = this.currentColors[row][col];
        if (!colorId || this.locked[row][col]) return null;
        const cells = [];
        for (let currentCol = 0; currentCol < this.width; currentCol += 1) {
            if (this.currentColors[row][currentCol] === colorId && !this.locked[row][currentCol]) {
                cells.push({ row, col: currentCol });
            }
        }
        return { colorId, cells, isLocked: false, source: 'board' };
    }

    setLocked(row, col, locked) {
        this.locked[row][col] = locked;
    }

    isAllLocked() {
        for (let row = 0; row < this.height; row += 1) {
            for (let col = 0; col < this.width; col += 1) {
                if (this.correctColors[row][col] > 0 && !this.locked[row][col]) return false;
            }
        }
        return true;
    }
}

const capacityBoard = new FakeBoard(1, 1, [[1]], [[0]]);
assert.throws(
    () => new RequiredCapacityPchConveyorRules(capacityBoard),
    /positive integer/,
    'missing per-level conveyor capacity must fail fast',
);
assert.throws(
    () => new RequiredCapacityPchConveyorRules(capacityBoard, 25),
    /multiple of 3/,
    'capacity must align to the three-bean carrier depth',
);
const compactCapacityRules = new RequiredCapacityPchConveyorRules(capacityBoard, 24);
assert.equal(compactCapacityRules.carrierCount, 8, 'per-level capacity must determine carrier count');
assert.equal(compactCapacityRules.bufferCapacity, 24, 'rules must preserve the requested bean capacity');

const sourceColors = [Array.from({ length: 15 }, () => 1)];
const targetColors = [Array.from({ length: 15 }, () => 2)];
const queueBoard = new FakeBoard(15, 1, targetColors, sourceColors);
const queueRules = new PchConveyorRules(queueBoard);
const selected = queueRules.selectBoard(0, 0);
assert.ok(selected);
assert.equal(selected.cells.length, 12, 'single board pickup must stop at 12 beans');

const queued = queueRules.storeBlock(selected, 0);
assert.equal(queued.moved, 12);
assert.equal(queueRules.entryCount, 12, 'picked beans must wait at the entrance');
assert.equal(queueRules.readyEntryCount, 0, 'beans are not loadable before the fly-in finishes');
assert.equal(queueRules.carriers.every((stack) => stack.length === 0), true);
assert.equal(queueRules.bufferCount, 12, 'entrance beans must reserve conveyor capacity');

queueRules.markQueuedBeansReady(12);
const firstLoad = queueRules.transferReadyBeansToCarrier(0);
assert.equal(firstLoad.moved, 3);
assert.deepEqual(queueRules.carriers[0], [1, 1, 1]);
assert.equal(queueRules.entryCount, 9);
assert.equal(queueRules.transferReadyBeansToCarrier(0).moved, 0, 'a full carrier must not over-stack');
assert.equal(queueRules.transferReadyBeansToCarrier(19).moved, 3, 'the next arriving carrier takes the waiting beans');
assert.equal(queueRules.entryCount, 6);
assert.equal(queueRules.bufferCount, 12);

const added = queueRules.addBufferSlots(12);
assert.equal(added, 12);
assert.equal(queueRules.carrierCount, 24);
assert.equal(queueRules.bufferCapacity, 72);

const returnBoard = new FakeBoard(2, 1, [[2, 1]], [[0, 0]]);
const returnRules = new PchConveyorRules(returnBoard);
returnRules.carriers[0].push(1, 2);
const returnBatch = returnRules.autoPlaceAvailableTop(0);
assert.equal(returnBatch.moved, 2, 'one exit event must return every currently placeable top bean');
assert.deepEqual(returnBatch.colorIds, [2, 1], 'the batch must preserve top-to-bottom LIFO order');
assert.deepEqual(returnBatch.boardCells, [{ row: 0, col: 0 }, { row: 0, col: 1 }]);
assert.equal(returnRules.carriers[0].length, 0);
assert.equal(returnBoard.isAllLocked(), true);

const sameColorBoard = new FakeBoard(3, 1, [[1, 1, 1]], [[0, 0, 0]]);
const sameColorRules = new PchConveyorRules(sameColorBoard);
sameColorRules.carriers[0].push(1, 1, 1);
assert.equal(sameColorRules.autoPlaceAvailableTop(0).moved, 3, 'a three-layer stack must clear in one round');
assert.equal(sameColorRules.carriers[0].length, 0);

const blockedBoard = new FakeBoard(1, 1, [[1]], [[0]]);
const blockedRules = new PchConveyorRules(blockedBoard);
blockedRules.carriers[0].push(1, 2);
assert.equal(blockedRules.autoPlaceAvailableTop(0).moved, 0, 'an unplaceable top bean must block lower layers');
assert.deepEqual(blockedRules.carriers[0], [1, 2]);

const partialBoard = new FakeBoard(1, 1, [[2]], [[0]]);
const partialRules = new PchConveyorRules(partialBoard);
partialRules.carriers[0].push(1, 2);
assert.equal(partialRules.autoPlaceAvailableTop(0).moved, 1, 'the batch must stop when the new top becomes blocked');
assert.deepEqual(partialRules.carriers[0], [1]);

const deadlockBoard = new FakeBoard(1, 1, [[2]], [[0]]);
const deadlockRules = new PchConveyorRules(deadlockBoard);
deadlockRules.carriers.forEach((stack) => stack.push(1, 1, 1));
assert.equal(deadlockRules.isBufferDeadlocked(), true, 'a full conveyor with no returnable top must fail');
assert.equal(deadlockRules.addBufferSlots(12), 12, 'buffer-full revive must add exactly 12 positions');
assert.equal(deadlockRules.bufferCapacity, 72, 'buffer-full revive increases capacity from 60 to 72');
assert.equal(deadlockRules.isBufferDeadlocked(), false, 'the added 12 positions must immediately clear the deadlock');

const returnableFullBoard = new FakeBoard(1, 1, [[2]], [[0]]);
const returnableFullRules = new PchConveyorRules(returnableFullBoard);
returnableFullRules.carriers.forEach((stack) => stack.push(1, 1, 1));
returnableFullRules.carriers[7][2] = 2;
assert.equal(returnableFullRules.isBufferDeadlocked(), false, 'one returnable carrier top prevents failure');

const pendingBoard = new FakeBoard(1, 1, [[2]], [[1]]);
const pendingRules = new PchConveyorRules(pendingBoard);
const pendingBlock = pendingRules.selectBoard(0, 0);
assert.ok(pendingBlock);
assert.equal(pendingRules.storeBlock(pendingBlock, 0).moved, 1);
assert.equal(pendingRules.conveyorSpeedMultiplier, 2, 'the conveyor must switch to pch 2x speed when no board bean remains selectable');
pendingRules.carriers.slice(0, 19).forEach((stack) => stack.push(1, 1, 1));
pendingRules.carriers[19].push(1, 1);
assert.equal(pendingRules.bufferCount, pendingRules.bufferCapacity);
assert.equal(pendingRules.isBufferDeadlocked(), false, 'beans still waiting at the entrance must not fail early');

const notFullBoard = new FakeBoard(1, 1, [[2]], [[0]]);
const notFullRules = new PchConveyorRules(notFullBoard);
notFullRules.carriers.forEach((stack) => stack.push(1, 1));
assert.equal(notFullRules.isBufferDeadlocked(), false, 'available conveyor capacity prevents failure');

const selectableBoard = new FakeBoard(1, 1, [[2]], [[1]]);
const selectableRules = new PchConveyorRules(selectableBoard);
selectableRules.carriers[0].push(2);
assert.equal(selectableRules.conveyorSpeedMultiplier, 1, 'a selectable board bean must keep the conveyor at normal speed');
selectableBoard.currentColors[0][0] = 0;
assert.equal(selectableRules.conveyorSpeedMultiplier, 2, 'stored beans with no selectable board bean must use pch 2x speed');
selectableRules.autoPlaceTop(0);
assert.equal(selectableRules.conveyorSpeedMultiplier, 1, 'an empty conveyor must return to normal speed after settlement');

const clearColorBoard = new FakeBoard(4, 1, [[1, 1, 2, 2]], [[2, 0, 1, 0]]);
const clearColorRules = new PchConveyorRules(clearColorBoard);
clearColorRules.carriers[0].push(1, 2);
const clearColorResult = clearColorRules.forceCompleteColor(1);
assert.equal(clearColorResult.colorId, 1);
assert.equal(clearColorResult.moved, 2, 'clear-color must place every unresolved bean of the selected color');
assert.deepEqual(clearColorBoard.currentColors[0], [1, 1, 2, 0]);
assert.deepEqual(clearColorRules.carriers[0], [2], 'clear-color must remove matching beans from conveyor stacks');
assert.equal(clearColorBoard.locked[0][0], true);
assert.equal(clearColorBoard.locked[0][1], true);
assert.equal(clearColorBoard.locked[0][2], true, 'a displaced bean landing on its target should lock');

const randomColorBoard = new FakeBoard(4, 1, [[1, 1, 2, 2]], [[2, 0, 1, 0]]);
const randomColorRules = new PchConveyorRules(randomColorBoard);
randomColorRules.carriers[0].push(1, 2);
const randomColorResult = randomColorRules.forceCompleteRandomColor(() => 0.999);
assert.equal(randomColorResult.colorId, 2, 'clear-color must use the injected random result instead of buffer frequency');
assert.equal(randomColorResult.moved, 2, 'the randomly selected color must return every unresolved bean');
assert.equal(randomColorBoard.locked[0][2], true);
assert.equal(randomColorBoard.locked[0][3], true);
assert.deepEqual(randomColorRules.carriers[0], [1], 'other conveyor colors must remain stored');

const clearBufferBoard = new FakeBoard(2, 1, [[1, 2]], [[2, 0]]);
const clearBufferRules = new PchConveyorRules(clearBufferBoard);
clearBufferRules.carriers[4].push(1);
const clearBufferResult = clearBufferRules.clearBufferToBoard();
assert.equal(clearBufferResult.moved, 1, 'clear-buffer must move every stored bean back to the board');
assert.deepEqual(clearBufferBoard.currentColors[0], [1, 2]);
assert.equal(clearBufferRules.bufferCount, 0, 'clear-buffer must empty the entrance and every carrier stack');
assert.equal(clearBufferBoard.isAllLocked(), true, 'displaced board beans should keep a valid solved board state');

const clearQueuedBoard = new FakeBoard(2, 1, [[1, 2]], [[2, 1]]);
const clearQueuedRules = new PchConveyorRules(clearQueuedBoard);
const clearQueuedBlock = clearQueuedRules.selectBoard(0, 1);
assert.ok(clearQueuedBlock);
assert.equal(clearQueuedRules.storeBlock(clearQueuedBlock, 0).moved, 1);
clearQueuedRules.markQueuedBeansReady(1);
assert.equal(clearQueuedRules.entryCount, 1);
assert.equal(clearQueuedRules.clearBufferToBoard().moved, 1, 'clear-buffer must also return ready entrance beans');
assert.equal(clearQueuedRules.entryCount, 0);
assert.equal(clearQueuedRules.readyEntryCount, 0);
assert.deepEqual(clearQueuedBoard.currentColors[0], [1, 2]);
assert.equal(clearQueuedBoard.isAllLocked(), true);

const clearAllStoredBoard = new FakeBoard(3, 1, [[1, 2, 3]], [[0, 0, 0]]);
const clearAllStoredRules = new PchConveyorRules(clearAllStoredBoard);
clearAllStoredRules.queuedColorIds.push(1);
clearAllStoredRules.readyQueuedCount = 1;
clearAllStoredRules.carriers[2].push(2);
clearAllStoredRules.carriers[9].push(3);
assert.equal(clearAllStoredRules.bufferCount, 3);
assert.equal(clearAllStoredRules.clearBufferToBoard().moved, 3, 'clear-buffer must return entrance and all carrier beans together');
assert.equal(clearAllStoredRules.bufferCount, 0);
assert.deepEqual(clearAllStoredBoard.currentColors[0], [1, 2, 3]);
assert.equal(clearAllStoredBoard.isAllLocked(), true);

const controllerSourcePath = path.join(projectRoot, 'assets/Scripts/Core/PchConveyorGameplayController.ts');
const controllerSource = fs.readFileSync(controllerSourcePath, 'utf8');
const controllerCompiled = ts.transpileModule(controllerSource, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
    },
    fileName: controllerSourcePath,
    reportDiagnostics: true,
});
assert.equal(
    (controllerCompiled.diagnostics || []).length,
    0,
    (controllerCompiled.diagnostics || []).map((item) => item.messageText).join('\n'),
);

class FakeVec3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    clone() {
        return new FakeVec3(this.x, this.y, this.z);
    }

    static distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    }
}

class FakeVec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
}

class FakeButton {}
class FakeUITransform {}

function fakeTween() {
    const callbacks = [];
    return {
        delay() { return this; },
        to() { return this; },
        parallel() { return this; },
        call(callback) {
            callbacks.push(callback);
            return this;
        },
        start() {
            callbacks.forEach((callback) => callback());
            return this;
        },
    };
}

const controllerModule = { exports: {} };
const loadController = new Function('module', 'exports', 'require', controllerCompiled.outputText);
loadController(controllerModule, controllerModule.exports, (request) => {
    if (request === './PchConveyorRules') return { PchConveyorRules };
    if (request === './AppRoot') return { AppRoot: { tryGet() { return null; } } };
    if (request === './OpeningPatternTransition') {
        return {
            buildOpeningPatternMoves() { return []; },
            getOpeningPatternStaggerDelay() { return 0; },
        };
    }
    if (request === './GameCtrlShared') {
        return new Proxy({
            AudioMgr: { inst: { play() {}, vibratePlace() {} } },
            Button: FakeButton,
            Tween: { stopAllByTarget() {} },
            UITransform: FakeUITransform,
            Vec2: FakeVec2,
            Vec3: FakeVec3,
            tween: fakeTween,
        }, {
            get(target, key) {
                if (key in target) return target[key];
                return class RuntimeStub {};
            },
        });
    }
    throw new Error(`unexpected controller dependency: ${request}`);
});
const { PchConveyorGameplayController } = controllerModule.exports;
const pauseOwners = [];
const resumedTokens = [];
const controllerRuntime = {
    isGameEnd: false,
    _adShowing: false,
    _rewardedGrantTransaction: null,
    pauseTimerForProp(owner) {
        pauseOwners.push(owner);
        return `timer:${owner}`;
    },
    resumeTimerForProp(token) {
        resumedTokens.push(token);
    },
};
const controller = new PchConveyorGameplayController(controllerRuntime);
controller.rules = { carrierCount: 20, conveyorSpeedMultiplier: 1 };
controller.beginSkillUsePause('brush');
controller.update(1);
assert.deepEqual(pauseOwners, ['pch-skill-brush'], 'skill activation must acquire a dedicated timer pause');
assert.equal(controller.beltTravel, 0, 'the conveyor must not advance while a skill is applying');
controller.releaseActiveSkillPause();
assert.deepEqual(resumedTokens, ['timer:pch-skill-brush'], 'skill completion must release the exact timer pause');

controllerRuntime._adShowing = true;
controller.update(1);
assert.equal(controller.beltTravel, 0, 'the conveyor must not advance while the rewarded ad is showing');
controllerRuntime._adShowing = false;
controllerRuntime._rewardedGrantTransaction = { phase: 'grant' };
controller.update(1);
assert.equal(controller.beltTravel, 0, 'the conveyor must remain paused during the rewarded grant transaction');

let selectedBoardCell = null;
const rawBoardTap = { x: 120, y: 240 };
const remappedBoardTap = { x: 960, y: 1080 };
const boardInputRuntime = {
    isGameEnd: false,
    resolveBoardTapBlock(position) {
        if (position.x === remappedBoardTap.x && position.y === remappedBoardTap.y) {
            return { candidate: { row: 0, col: 0 } };
        }
        if (position.x === rawBoardTap.x && position.y === rawBoardTap.y) {
            return { candidate: { row: 0, col: 1 } };
        }
        return { candidate: null };
    },
    cellNodes: [[{
        getComponent(type) {
            if (type !== FakeUITransform) return null;
            return { getBoundingBoxToWorld: () => ({ contains: () => false }) };
        },
    }]],
    normalizeGameplayUiPosition: () => remappedBoardTap,
    onTouchCancel() {},
};
const boardInputController = new PchConveyorGameplayController(boardInputRuntime);
boardInputController.rules = { cells: [{ row: 0, col: 0 }, { row: 0, col: 1 }] };
boardInputController.handleBoardTap = (row, col) => { selectedBoardCell = { row, col }; };
const boardTapEvent = {
    propagationStopped: false,
    getUILocation: () => rawBoardTap,
};
boardInputController.onRootTouchEnd(boardTapEvent);
assert.deepEqual(selectedBoardCell, { row: 0, col: 0 }, 'PCH selection must use only the normalized Cocos UI coordinate without trying the raw display point first');
assert.equal(boardTapEvent.propagationStopped, true, 'a matched PCH board tap must stop propagation');

let scaledCapacityFallbackCount = 0;
const routingInputRoot = {
    isValid: true,
    parent: null,
    getComponent() { return null; },
};
const skillButtonNode = {
    isValid: true,
    parent: routingInputRoot,
    getComponent(type) { return type === FakeButton ? {} : null; },
};
const skillPlusNode = {
    isValid: true,
    parent: skillButtonNode,
    getComponent() { return null; },
};
const capacityButtonState = { enabled: true, interactable: true };
const capacityAdNode = {
    isValid: true,
    activeInHierarchy: true,
    getComponent(type) {
        if (type === FakeButton) return capacityButtonState;
        if (type === FakeUITransform) {
            return { getBoundingBoxToWorld: () => ({ contains: (pos) => pos.x === 500 && pos.y === 600 }) };
        }
        return null;
    },
};
const routingRuntime = {
    isGameEnd: false,
    normalizeGameplayUiPosition: () => new FakeVec2(500, 600),
    onTouchCancel() {},
    getGameplayFixedGroup: () => null,
    scheduleOnce(callback) { callback(); },
};
const routingController = new PchConveyorGameplayController(routingRuntime);
routingController.rules = { cells: [] };
routingController.inputRoot = routingInputRoot;
routingController.adButton = capacityAdNode;
routingController.onCapacityAdTap = () => { scaledCapacityFallbackCount += 1; };
const directSkillEvent = {
    target: skillPlusNode,
    propagationStopped: false,
    getUILocation: () => new FakeVec2(100, 120),
};
routingController.onRootTouchEnd(directSkillEvent);
assert.equal(scaledCapacityFallbackCount, 0, 'a native skill-button target must never be remapped to the capacity grant');
assert.equal(directSkillEvent.propagationStopped, false, 'the native skill-button event must continue to its real target');
const missedNativeEvent = {
    target: routingInputRoot,
    propagationStopped: false,
    getUILocation: () => new FakeVec2(100, 120),
};
routingController.onRootTouchEnd(missedNativeEvent);
assert.equal(scaledCapacityFallbackCount, 0, 'a blank root touch must never be remapped into the capacity button');
assert.equal(missedNativeEvent.propagationStopped, false, 'a blank root touch must remain unhandled');

let scaledOpeningGuideTapCount = 0;
const guideSpeedNode = {
    isValid: true,
    getComponent(type) {
        if (type !== FakeUITransform) return null;
        return { getBoundingBoxToWorld: () => ({ contains: (pos) => pos.x === 500 && pos.y === 600 }) };
    },
};
const guideRuntime = {
    isGameEnd: false,
    normalizeGameplayUiPosition: () => new FakeVec2(500, 600),
};
const guideController = new PchConveyorGameplayController(guideRuntime);
guideController.rules = { cells: [] };
guideController.inputLocked = true;
guideController.openingGuide = { isValid: true, name: 'PchLevelTwoSpeedGuide' };
guideController.speedButton = guideSpeedNode;
guideController.onOpeningGuideDoubleSpeed = () => { scaledOpeningGuideTapCount += 1; };
const scaledGuideEvent = {
    propagationStopped: false,
    getUILocation: () => new FakeVec2(100, 120),
};
guideController.onRootTouchEnd(scaledGuideEvent);
assert.equal(scaledOpeningGuideTapCount, 1, 'the locked opening guide must accept its isolated scaled-preview proxy coordinate');
assert.equal(scaledGuideEvent.propagationStopped, true, 'the accepted opening-guide proxy tap must stop propagation');

function createSkillController(rules) {
    const pauses = [];
    const resumes = [];
    let generation = 0;
    let finishCount = 0;
    let buttonSyncCount = 0;
    let pulseCount = 0;
    let skillController = null;
    const runtime = {
        isGameEnd: false,
        _adShowing: false,
        _rewardedGrantTransaction: null,
        _skillActive: false,
        _activeSkillUsageGeneration: 0,
        _flyingTargets: new Set(),
        cellNodes: [],
        pauseTimerForProp(owner) {
            pauses.push(owner);
            return `timer:${owner}`;
        },
        resumeTimerForProp(token) { resumes.push(token); },
        armSkillUsageWatchdog() {
            generation += 1;
            this._activeSkillUsageGeneration = generation;
            return generation;
        },
        finishSkillUsage(expectedGeneration) {
            if (expectedGeneration !== this._activeSkillUsageGeneration) return false;
            this._skillActive = false;
            this._activeSkillUsageGeneration = 0;
            skillController.releaseActiveSkillPause();
            finishCount += 1;
            this.syncSkillButtonRuntimeStates();
            return true;
        },
        syncSkillButtonRuntimeStates() { buttonSyncCount += 1; },
        renderBoardCells() {},
        renderBoardCell() {},
        getBoardFlyBeanSizeInLayer: () => 31,
        checkColorCompletion() {},
        checkGuideStepComplete() {},
        flushPendingColorCompleteEffects() {},
        refreshEndgameHints() {},
        clearEndgameHints() {},
        playPatternCompleteThenWin() {},
        scheduleOnce(callback) { callback(); },
    };
    skillController = new PchConveyorGameplayController(runtime);
    skillController.rules = rules;
    skillController.root = {
        isValid: true,
        getComponent(type) {
            if (type !== FakeUITransform) return null;
            return { convertToNodeSpaceAR: (position) => position };
        },
    };
    skillController.resolveSkillSourceVisual = () => ({ world: new FakeVec3(), size: 31 });
    skillController.createFlyBean = () => ({});
    skillController.destroyFlyBean = () => {};
    skillController.attachSphereFlyEffect = () => {};
    skillController.getBoardCellWorldPosition = () => new FakeVec3();
    skillController.renderConveyor = () => {};
    skillController.renderEntranceQueue = () => {};
    skillController.refreshStatus = () => {};
    skillController.playSkillTargetPulse = () => { pulseCount += 1; };
    return {
        controller: skillController,
        runtime,
        pauses,
        resumes,
        getFinishCount: () => finishCount,
        getButtonSyncCount: () => buttonSyncCount,
        getPulseCount: () => pulseCount,
    };
}

const controllerColorBoard = new FakeBoard(4, 1, [[1, 1, 2, 2]], [[2, 0, 1, 0]]);
const controllerColorRules = new PchConveyorRules(controllerColorBoard);
controllerColorRules.carriers[0].push(1, 2);
const clearColorHarness = createSkillController(controllerColorRules);
const lockedBeforeColorSkill = controllerColorBoard.locked[0].filter(Boolean).length;
assert.equal(clearColorHarness.controller.useClearColorSkill(), true, 'clear-color must report that the PCH skill started');
assert.ok(
    controllerColorBoard.locked[0].filter(Boolean).length > lockedBeforeColorSkill,
    'clear-color must visibly complete one unfinished color',
);
assert.equal(clearColorHarness.runtime._skillActive, false, 'clear-color must release the shared skill lock after beans arrive');
assert.equal(clearColorHarness.getFinishCount(), 1, 'clear-color must finish exactly once');
assert.equal(clearColorHarness.getButtonSyncCount(), 1, 'clear-color completion must restore prop buttons');
assert.ok(clearColorHarness.getPulseCount() > 0, 'clear-color must retain its target pulse effect without waiting on it');

const controllerBufferBoard = new FakeBoard(2, 1, [[1, 2]], [[2, 0]]);
const controllerBufferRules = new PchConveyorRules(controllerBufferBoard);
controllerBufferRules.carriers[4].push(1);
const clearBufferHarness = createSkillController(controllerBufferRules);
assert.equal(clearBufferHarness.controller.useClearBufferSkill(), true, 'clear-buffer must report that the PCH skill started');
assert.equal(controllerBufferRules.bufferCount, 0, 'clear-buffer must empty the entrance and every carrier');
assert.deepEqual(controllerBufferBoard.currentColors[0], [1, 2], 'clear-buffer must return stored beans to the board');
assert.equal(clearBufferHarness.runtime._skillActive, false, 'clear-buffer must release the shared skill lock after beans arrive');
assert.equal(clearBufferHarness.getFinishCount(), 1, 'clear-buffer must finish exactly once');
assert.equal(clearBufferHarness.getButtonSyncCount(), 1, 'clear-buffer completion must restore prop buttons');

const returnBoardForController = new FakeBoard(1, 1, [[1]], [[0]]);
const returnRulesForController = new PchConveyorRules(returnBoardForController);
const returnHarness = createSkillController(returnRulesForController);
returnHarness.controller.animateBeanReturn(1, new FakeVec3(), 31, { row: 0, col: 0 }, 0);
assert.equal(returnHarness.controller.activeReturnAnimations, 0, 'a returned bean must release busy state as soon as it reaches the board');
assert.equal(returnHarness.getButtonSyncCount(), 1, 'automatic return completion must restore prop button availability');

console.log('pch-conveyor-rules: PASS');
