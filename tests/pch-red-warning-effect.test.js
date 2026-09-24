'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const rulesPath = path.join(projectRoot, 'assets/Scripts/Core/PchConveyorRules.ts');
const compiled = ts.transpileModule(fs.readFileSync(rulesPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: rulesPath,
    reportDiagnostics: true,
});
assert.equal((compiled.diagnostics || []).length, 0, 'warning rules must transpile');
const moduleUnderTest = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputText)(
    moduleUnderTest,
    moduleUnderTest.exports,
    (request) => {
        if (request !== './LevelConfig') throw new Error(`unexpected dependency: ${request}`);
        return {
            CONVEYOR_STACK_DEPTH: 3,
            validateConveyorCapacity(value) {
                if (!Number.isInteger(value) || value <= 0 || value % 3 !== 0) throw new Error('invalid capacity');
                return value;
            },
            validatePchSingleSelectionLimit(value) { return value ?? 12; },
            validateAutoConveyorFinishSpeed(value) { return value ?? true; },
        };
    },
);
const { PchConveyorRules } = moduleUnderTest.exports;

class Board {
    constructor() {
        this.width = 1;
        this.height = 1;
        this.correctColors = [[2]];
        this.currentColors = [[0]];
        this.locked = [[false]];
    }

    getConnectedBlock() { return null; }
    setLocked(row, col, value) { this.locked[row][col] = value; }
    isAllLocked() { return false; }
}

const rules = new PchConveyorRules(new Board(), 60);
rules.carriers.slice(0, 19).forEach((stack) => stack.push(1, 1, 1));
assert.equal(rules.shouldShowRedWarning(3), false, 'exactly three empty slots must not warn');
rules.carriers[19].push(1);
assert.equal(rules.shouldShowRedWarning(3), true, 'two empty slots with no matching stored bean must warn');
rules.carriers[19].unshift(2);
assert.equal(rules.shouldShowRedWarning(3), false, 'a returnable lower layer must clear the warning');
rules.carriers[19][0] = 1;
assert.equal(rules.shouldShowRedWarning(3), true, 'removing the only matching stored layer must restore the warning');
rules.queuedColorIds.push(1);
assert.equal(rules.shouldShowRedWarning(3), true, 'entry beans that consume the last slots must not suppress the warning');
assert.throws(() => rules.shouldShowRedWarning(0), /positive integer/, 'invalid thresholds must fail fast');

const manifest = fs.readFileSync(path.join(projectRoot, 'assets/Scripts/Core/UiManifest.ts'), 'utf8');
const bootstrapModule = fs.readFileSync(
    path.join(projectRoot, 'assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts'),
    'utf8',
);
const bootstrapPatch = fs.readFileSync(
    path.join(projectRoot, 'scripts/patch-bootstrap-dynamic-assets.js'),
    'utf8',
);
const controller = fs.readFileSync(
    path.join(projectRoot, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
);
const controllerCompiled = ts.transpileModule(controller, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
});
assert.equal((controllerCompiled.diagnostics || []).length, 0, 'warning controller must transpile');
const assetPath = path.join(projectRoot, 'assets/BootstrapBundle/GameUI/Atlases/BoardEffects/pdpx_eff_Mask_01.png');
const meta = JSON.parse(fs.readFileSync(`${assetPath}.meta`, 'utf8'));
assert.ok(manifest.includes("'pdpx_eff_Mask_01'"), 'mask must be in the Bootstrap effect preload manifest');
assert.equal(fs.existsSync(assetPath), true, 'mask must be project-owned');
assert.equal(meta.subMetas.f9941.userData.width, 512, 'mask width must match the selected B texture');
assert.equal(meta.subMetas.f9941.userData.height, 512, 'mask height must match the selected B texture');
assert.ok(bootstrapModule.includes('requireWarningMaskSpriteFrame'), 'mask must use the existing fail-fast loader contract');
assert.ok(bootstrapPatch.includes("'GameUI/Atlases/BoardEffects/pdpx_eff_Mask_01'"), 'mask must remain in the Bootstrap image allowlist');
assert.ok(
    !controller.includes('this.syncCapacityWarning(')
        && controller.includes('PCH_RED_WARNING_MAX_OPACITY = 255')
        && controller.includes("this.runtime.requireCanvasUiRoot?.('FxRoot')")
        && controller.includes('transform.setContentSize(effectTransform.contentSize)')
        && controller.includes('this.syncWarningOverlay(Math.max(0, this.rules.bufferCapacity - this.rules.bufferCount))'),
    'overlay must own the digit warning while keeping the remaining-capacity trigger',
);

const parsed = ts.createSourceFile('controller.ts', controller, ts.ScriptTarget.Latest, true);
const wanted = new Set(['syncWarningOverlay', 'startWarningOverlayPulse', 'resetCapacityWarning', 'resetWarningOverlay', 'resetCapacityNumberWarning']);
const methods = parsed.statements.filter(ts.isClassDeclaration).flatMap(c => c.members)
    .filter(m => m.name && wanted.has(m.name.getText(parsed))).map(m => m.getText(parsed));
assert.equal(methods.length, wanted.size);
const constants = parsed.statements.filter(ts.isVariableStatement)
    .filter(s => /const PCH_(RED_WARNING_|CAPACITY_(TEXT_COLOR|OUTLINE_COLOR|FULL_WARNING_CLIP))/.test(s.getText(parsed)))
    .map(s => s.getText(parsed));
const code = ts.transpileModule(constants.join('\n') + '\nclass WarningHarness {' + methods.join('\n') + '}', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const jobs = [];
class Vec3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
const Tween = { stopAllByTarget(target) { jobs.forEach(j => { if (j.target === target) j.cancelled = true; }); } };
function tween(target) {
    const job = { target, steps: [], cancelled: false };
    const chain = {
        to(seconds, props, options) { job.steps.push({ seconds, props, options }); return chain; },
        delay(seconds) { job.steps.push({ seconds }); return chain; },
        call(cb) { job.callback = cb; return chain; },
        start() { jobs.push(job); return chain; },
    };
    return chain;
}
class Color {
    constructor(r = 0, g = 0, b = 0, a = 255) { Object.assign(this, { r, g, b, a }); }
    static WHITE = new Color(255, 255, 255);
    static RED = new Color(255, 0, 0);
    static lerp(out, from, to, ratio) {
        for (const channel of ['r', 'g', 'b', 'a']) out[channel] = from[channel] + (to[channel] - from[channel]) * ratio;
    }
}
const Harness = new Function('Tween', 'tween', 'Vec3', 'Color', code + '\nreturn WarningHarness;')(Tween, tween, Vec3, Color);
const h = new Harness();
const authoredText = { r: 255, g: 255, b: 255, a: 255 };
const authoredOutline = { r: 151, g: 155, b: 169, a: 255 };
h.capacityTextColor = authoredText;
h.capacityOutlineColor = authoredOutline;
h.capacityOutlineEnabled = false;
h.countLabel = { isValid: true };
h.resetCapacityNumberWarning();
assert.strictEqual(h.countLabel.color, authoredText, 'warning reset preserves authored text colour');
assert.strictEqual(h.countLabel.outlineColor, authoredOutline, 'warning reset preserves authored outline');
assert.equal(h.countLabel.enableOutline, false);
const assertRestored = () => {
    assert.strictEqual(h.countLabel.color, authoredText);
    assert.strictEqual(h.countLabel.outlineColor, authoredOutline);
    assert.equal(h.countLabel.enableOutline, h.capacityOutlineEnabled);
};
let numberPlays = 0;
let numberStops = 0;
h.capacityWarningAnimation = { play() { numberPlays++; }, stop() { numberStops++; } };
let hasReturnableMatch = false;
h.rules = { hasReturnableCarrierMatch: () => hasReturnableMatch };
Object.assign(h, { runtime: { isGameEnd: false }, warningPulseGeneration: 0,
    warningOverlayRunning: false,
    warningOverlayOpacity: { isValid: true, opacity: 0 },
    warningOverlay: { isValid: true, active: false, setScale(x, y, z) { this.scale = new Vec3(x, y, z); } } });
hasReturnableMatch = true;
h.syncWarningOverlay(10);
assert.equal(jobs.length, 0, 'a matching carrier bean must suppress the overlay at low capacity');
hasReturnableMatch = false;
h.syncWarningOverlay(11);
assert.equal(jobs.length, 0);
h.syncWarningOverlay(10);
assert.equal(jobs.length, 1);
assert.equal(h.warningOverlayOpacity.opacity, 0);
assert.equal(jobs[0].target, h.warningOverlayOpacity);
assert.deepEqual(jobs[0].steps.map(s => s.seconds), [.6, .6]);
assert.deepEqual(jobs[0].steps.map(s => s.props), [{ opacity: 255 }, { opacity: 0 }]);
assert.deepEqual(jobs[0].steps.map(s => s.options.easing), ['sineInOut', 'sineInOut']);
assert.equal(h.countLabel.enableOutline, true);
assert.deepEqual(h.countLabel.outlineColor, Color.WHITE);
assert.deepEqual(h.countLabel.color, new Color(255, 180, 180));
for (const [opacity, green] of [[127.5, 90], [255, 0], [127.5, 90], [0, 180]]) {
    h.warningOverlayOpacity.opacity = opacity;
    jobs[0].steps[opacity === 0 ? 1 : 0].options.onUpdate();
    assert.deepEqual(h.countLabel.color, new Color(255, green, green), 'digits follow actual overlay opacity');
}
h.syncWarningOverlay(9);
assert.equal(h.warningOverlay.active, true);
jobs[0].callback();
assert.equal(h.warningOverlay.active, true);
assert.equal(jobs.length, 2, 'low capacity must continue the opacity pulse');
h.syncWarningOverlay(0);
assert.equal(jobs.length, 2, 'refresh must not create overlapping loops');
h.syncWarningOverlay(22);
assert.equal(h.warningOverlay.active, false);
assert.equal(jobs[1].cancelled, true);
assertRestored();
jobs[1].steps[0].options.onUpdate();
assertRestored();
jobs[1].callback();
assert.equal(jobs.length, 2, 'recovery must invalidate pending loop callbacks');
h.syncWarningOverlay(8);
assert.equal(jobs.length, 3);
h.resetCapacityWarning();
assert.equal(jobs[2].cancelled, true);
assert.equal(h.warningOverlay.active, false);
assert.equal(h.warningOverlayOpacity.opacity, 0);
assert.equal(h.warningOverlay.scale.x, 1);
jobs[2].callback();
assert.equal(jobs.length, 3, 'stale animation completion must not revive a cancelled warning');
h.settlementPaused = true;
h.syncWarningOverlay(12);
h.syncWarningOverlay(10);
assert.equal(jobs.length, 3);
h.settlementPaused = false;
h.syncWarningOverlay(10);
const firstPulse = jobs.length - 1;
jobs[firstPulse].callback();
jobs[firstPulse + 1].callback();
jobs[firstPulse + 2].callback();
assert.equal(jobs.length, firstPulse + 3, 'exactly three pulses must run');
assert.equal(h.warningOverlay.active, false, 'third pulse must hide the overlay');
assert.equal(h.warningOverlayRunning, false);
assertRestored();
h.syncWarningOverlay(8);
assert.equal(jobs.length, firstPulse + 3, 'remaining low must not restart after three pulses');
h.syncWarningOverlay(11);
h.syncWarningOverlay(10);
assert.equal(jobs.length, firstPulse + 4, 'recovery must rearm the three-pulse warning');
const interruptedPulse = jobs[jobs.length - 1];
hasReturnableMatch = true;
h.syncWarningOverlay(8);
assert.equal(h.warningOverlay.active, false, 'a new matching bean must stop an active warning');
assert.equal(interruptedPulse.cancelled, true);
assertRestored();
const interruptedJobCount = jobs.length;
interruptedPulse.callback();
assert.equal(jobs.length, interruptedJobCount, 'cancelled callbacks must not restart the warning');
hasReturnableMatch = false;
h.syncWarningOverlay(8);
assert.equal(jobs.length, interruptedJobCount + 1, 'loss of the match at low capacity must allow a new warning');
h.resetCapacityWarning();
assertRestored();
assert.equal(numberPlays, 0, 'legacy digit animation must never compete with the overlay');
assert.ok(numberStops > 0, 'legacy animation is stopped');
h.capacityOutlineEnabled = true;
h.syncWarningOverlay(8);
h.resetCapacityWarning();
assertRestored();

console.log('pch-red-warning-effect: PASS');
