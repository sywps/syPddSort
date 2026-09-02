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

assert.match(source, /const BELT_STEP_SECONDS = 0\.25;/, 'conveyor rotation cadence must stay unchanged');
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
    `return function (deltaTime) {${methodBody('update(deltaTime: number): void')}};`,
)(0.25, 0.2);

function makeController(carrierCount, beltTravel) {
    const entranceCalls = [];
    const controller = {
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
update.call(atLead.controller, 0.005);
assert.ok(Math.abs(atLead.controller.beltTravel - 19.81) < 1e-9, 'belt travel must still use the 0.25-second step');
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

assert.equal(0.25 * 0.2, 0.05, 'the 1X queue wait reduction must be 0.05 seconds');

console.log('pch-entry-queue-wait-speed.test.js passed');
