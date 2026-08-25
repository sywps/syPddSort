const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const section = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing section start: ${startMarker}`);
    assert.ok(end > start, `missing section end: ${endMarker}`);
    return source.slice(start, end);
};

const helperSource = read('assets/Scripts/Core/OpeningPatternTransition.ts');
const helperOutput = ts.transpileModule(helperSource, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
}).outputText;
const helperSandbox = {
    exports: {},
    module: { exports: {} },
    require() {
        throw new Error('OpeningPatternTransition must remain dependency-free');
    },
};
helperSandbox.exports = helperSandbox.module.exports;
vm.runInNewContext(helperOutput, helperSandbox, { filename: 'OpeningPatternTransition.ts' });

const {
    buildOpeningPatternMoves,
    getOpeningPatternStaggerDelay,
} = helperSandbox.module.exports;

const correct = [
    [1, 1, 2],
    [2, 0, 1],
];
const shuffled = [
    [2, 1, 1],
    [1, 0, 2],
];
const beforeCorrect = JSON.stringify(correct);
const beforeShuffled = JSON.stringify(shuffled);
const moves = JSON.parse(JSON.stringify(buildOpeningPatternMoves(correct, shuffled)));
assert.deepStrictEqual(moves, [
    { colorId: 1, source: { row: 0, col: 0 }, target: { row: 0, col: 1 } },
    { colorId: 1, source: { row: 0, col: 1 }, target: { row: 0, col: 2 } },
    { colorId: 2, source: { row: 0, col: 2 }, target: { row: 0, col: 0 } },
    { colorId: 2, source: { row: 1, col: 0 }, target: { row: 1, col: 2 } },
    { colorId: 1, source: { row: 1, col: 2 }, target: { row: 1, col: 0 } },
]);
assert.strictEqual(JSON.stringify(correct), beforeCorrect, 'mapping must not mutate correctColors');
assert.strictEqual(JSON.stringify(shuffled), beforeShuffled, 'mapping must not mutate currentColors');
assert.strictEqual(new Set(moves.map((move) => `${move.target.row},${move.target.col}`)).size, moves.length);
for (const move of moves) {
    assert.strictEqual(shuffled[move.target.row][move.target.col], move.colorId, 'every visual bean must land on the same color');
}

assert.throws(
    () => buildOpeningPatternMoves([[1, 0]], [[0, 1]]),
    /playable-cell mask mismatch/,
    'hole-mask drift must fail visibly',
);
assert.throws(
    () => buildOpeningPatternMoves([[1, 1]], [[1, 2]]),
    /count mismatch/,
    'per-color count drift must fail visibly',
);
assert.strictEqual(getOpeningPatternStaggerDelay(0), 0);
assert.strictEqual(getOpeningPatternStaggerDelay(1), 0);
assert.strictEqual(getOpeningPatternStaggerDelay(3), 0.05, 'small groups retain the competitor 0.05-second cadence');
const largeDelay = getOpeningPatternStaggerDelay(100);
assert.ok(largeDelay <= 0.05);
assert.ok(Math.abs(largeDelay * 99 - 0.24) < 1e-9, 'large boards must keep the launch window bounded');

const pch = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const session = read('assets/Scripts/Core/GameplaySessionController.ts');
const pchStart = section(pch, '    start(): void {', '    playOpeningPatternShuffle(): void {');
assert.ok(pchStart.includes('this.inputLocked = true;'), 'input must be gated before PCH handlers become usable');
assert.ok(pchStart.includes('this.prepareOpeningPatternShuffle();'), 'completed-pattern visuals must be prepared before loading release');

const opening = section(pch, '    playOpeningPatternShuffle(): void {', '    stop(): void {');
assert.ok(opening.includes("this.openingPatternState = 'running';"));
assert.ok(opening.includes('generation !== this.openingPatternGeneration'));
assert.ok(opening.includes('this.restoreOpeningPatternVisuals(false, true);'));
assert.ok(opening.includes('this.inputLocked = false;'), 'only the guarded completion may release gameplay input');
assert.ok(opening.includes('this.runtime.renderBoard();'), 'completion must reveal the authoritative shuffled model');

const inbound = section(pch, '    private animateBeanIntoConveyor(', '    private animateBeanReturn(');
const returning = section(pch, '    private animateBeanReturn(', '    private playReturnTargetPulse(');
const skills = section(pch, '    private runConveyorSkill(', '    private resolveSkillSourceVisual(');
assert.ok(inbound.includes('this.attachInboundStarlight('), 'normal Board-to-Entry flights must opt into starlight');
assert.ok(inbound.includes('const flightDelay = staggerIndex * PCH_ENTRY_STAGGER_SECONDS;'));
assert.ok(inbound.includes('targetLocal, flightDelay);'), 'starlight must honor the same stagger delay as its flying bean');
assert.ok(!returning.includes('attachInboundStarlight'), 'automatic returns must remain outside the proven competitor scope');
assert.ok(!skills.includes('attachInboundStarlight'), 'skill flights must remain outside the proven competitor scope');
assert.ok(pch.includes('this.runtime.attachBrightOverlay(bean,'), 'inbound starlight must reuse the required local glow asset');
assert.ok(pch.includes('PchInboundSpark-'), 'inbound starlight must include code-drawn trailing sparkles');
assert.ok(pch.includes('const delay = flightDelaySeconds + index * 0.012;'), 'each sparkle must start with its parent flight');
assert.ok(pch.includes('const sparkleSize = Math.max(7, size * 0.52);'), 'mobile starlight must remain legible');
assert.ok(pch.includes('opacity.opacity = 160;'), 'sparkles must begin visibly before their peak');
assert.ok(pch.includes('this.stopNodeTreeTweens(bean);'), 'fly cleanup must stop child sparkle and opacity tweens');

const hideIndex = session.indexOf('runtime.hideLoadingOverlayAfterGameplayReady?.();');
const playIndex = session.indexOf('ensurePchConveyorGameplayController(runtime).playOpeningPatternShuffle();');
assert.ok(hideIndex >= 0 && playIndex > hideIndex, 'the opening motion must begin only after the loading cover is released');

console.log('opening-pattern-and-flight-starlight.test.js passed');
