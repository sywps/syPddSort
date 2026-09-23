const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
);
const syntaxErrors = (ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
    },
    fileName: 'PchConveyorGameplayController.ts',
    reportDiagnostics: true,
}).diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
assert.equal(
    syntaxErrors.length,
    0,
    syntaxErrors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'),
);

assert.match(source, /const BELT_STEP_SECONDS = 0\.30;/, 'conveyor cadence must use the approved 0.30-second step');
const beltStepSeconds = Number(source.match(/const BELT_STEP_SECONDS = ([\d.]+);/)[1]);
assert.match(source, /const PCH_TRANSFER_SECONDS = 0\.16;/, 'bean flight duration must stay unchanged');
assert.match(source, /const PCH_ENTRY_STAGGER_SECONDS = 0\.012;/, 'bean flight stagger must stay unchanged');
assert.match(
    source,
    /const PCH_ENTRY_PICKUP_LEAD_STEP_RATIO = 0\.2;/,
    'waiting beans must be picked up 20% of one carrier step before the entrance',
);
assert.match(
    source,
    /this\.beltTravel \+= \(Math\.max\(0, deltaTime\) \* speedMultiplier\) \/ BELT_STEP_SECONDS;/,
    'the pickup lead must not change the conveyor movement formula',
);

function methodBody(marker) {
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `missing method marker: ${marker}`);
    const open = source.indexOf('{', start);
    assert.ok(open >= 0, `missing method body: ${marker}`);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        const character = source[index];
        if (character === '{') depth += 1;
        if (character !== '}') continue;
        depth -= 1;
        if (depth === 0) return source.slice(open + 1, index);
    }
    throw new Error(`unterminated method body: ${marker}`);
}

const didCarrierCrossProgress = new Function(
    `return function (carrierIndex, previousTravel, currentTravel, pathProgress) {${methodBody('private didCarrierCrossProgress(')}};`,
)();
const update = new Function(
    'BELT_STEP_SECONDS',
    'PCH_ENTRY_PICKUP_LEAD_STEP_RATIO',
    'AnalyticsMgr',
    `return function (deltaTime) {${methodBody('update(deltaTime: number): void')}};`,
)(beltStepSeconds, 0.2, { inst: { getCurrentRoundId: () => '' } });

function makeController(carrierCount, beltTravel) {
    const entranceCalls = [];
    const controller = {
        presentationCompletions: new Map(),
        capacityOfferRound: '',
        updateCsdInteraction() {},
        getCapacityOfferMode() { return 'unavailable'; },
        updateCapacityHint() {},
        updateLevelTwoSoftHand() {},
        maybeShowCapacityPressureGuide() {},
        beltTravel,
        exitPathProgress: 0.5,
        rules: { carrierCount },
        runtime: {
            isGameEnd: false,
            _adShowing: false,
            _rewardedGrantTransaction: null,
        },
        skillMovementPaused: false,
        updateSphereFlyEffects() {},
        updateExitArrowAnimation() {},
        getEffectiveBeltSpeedMultiplier() {
            return 1;
        },
        didCarrierCrossProgress,
        handleCarrierAtEntrance(carrierIndex) {
            entranceCalls.push(carrierIndex);
        },
        handleCarrierAtExit() {},
        checkBufferDeadlock() {
            return false;
        },
        updateBeltPositions() {},
    };
    return { controller, entranceCalls };
}

const beforeLead = makeController(20, 19.79);
update.call(beforeLead.controller, 0.001);
assert.deepEqual(beforeLead.entranceCalls, [], 'a carrier must not load before reaching the pickup lead');

const atLead = makeController(20, 19.79);
update.call(atLead.controller, 0.006);
assert.ok(Math.abs(atLead.controller.beltTravel - 19.81) < 1e-9, 'belt travel must use the 0.30-second step');
assert.deepEqual(atLead.entranceCalls, [0], 'a waiting queue must load at the 20%-step pickup lead');

const exactEntranceFallback = makeController(20, 19.99);
update.call(exactEntranceFallback.controller, 0.005);
assert.deepEqual(
    exactEntranceFallback.entranceCalls,
    [0],
    'the original exact-entrance crossing must remain available after the lead point',
);

const expandedCarrierLayout = makeController(12, 11.79);
update.call(expandedCarrierLayout.controller, 0.005);
assert.deepEqual(
    expandedCarrierLayout.entranceCalls,
    [0],
    'the pickup lead must stay one-fifth of a carrier step when carrier count changes',
);

assert.equal(beltStepSeconds * 0.2, 0.06, 'the pickup lead remains 20% of a step (0.06 seconds at 1X)');

for (const [speed, lapSeconds] of [[1, 6], [2, 3], [3, 2]]) {
    const { controller } = makeController(20, 0);
    controller.getEffectiveBeltSpeedMultiplier = () => speed;
    const frames = Math.round(lapSeconds * 60);
    for (let frame = 0; frame < frames; frame++) update.call(controller, 1 / 60);
    assert.ok(Math.abs(controller.beltTravel - 20) < 1e-9, `${speed}X must complete one lap in ${lapSeconds} seconds`);
}

// Existing position-driven verifiers must accept both new and historical cadence.
const replayLevel = { boardWidth: 6, boardHeight: 1, timeLimit: 30, conveyorCapacity: 60,
    correctColorArr: [[1, 1, 1, 2, 2, 2]], initRandomColorArr: [[2, 2, 2, 1, 1, 1]], singleSelectionLimit: 12 };
for (const runtimePath of ['../cloudfunctions/pvpService/bot-runtime/PvpHumanReplay', '../cloudfunctions/coopService/runtime/PvpHumanReplay']) {
    const { PvpHumanReplay } = require(runtimePath);
    for (const step of [0.25, beltStepSeconds]) {
        for (const speed of [1, 2, 3]) {
            const replay = new PvpHumanReplay(replayLevel);
            replay.apply([0, 0, speed]);
            for (let frame = 1; frame <= 120; frame++) {
                const time = frame * 50;
                replay.apply([time, 1, time / (step * 1000) * speed]);
            }
            assert.ok(Math.abs(replay.travel - 6 / step * speed) < 1e-9, 'replay must preserve actual recorded travel');
        }
    }
}

console.log('pch-entry-queue-wait-speed.test.js passed');
