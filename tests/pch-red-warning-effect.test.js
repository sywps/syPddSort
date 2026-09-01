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
const assetPath = path.join(projectRoot, 'assets/BootstrapBundle/GameUI/pdpx_eff_Mask_01.png');
const meta = JSON.parse(fs.readFileSync(`${assetPath}.meta`, 'utf8'));
assert.ok(manifest.includes("'pdpx_eff_Mask_01'"), 'mask must be in the Bootstrap effect preload manifest');
assert.equal(fs.existsSync(assetPath), true, 'mask must be project-owned');
assert.equal(meta.subMetas.f9941.userData.width, 512, 'mask width must match the extracted Sprite');
assert.equal(meta.subMetas.f9941.userData.height, 712, 'mask height must match the extracted Sprite');
assert.ok(bootstrapModule.includes('requireWarningMaskSpriteFrame'), 'mask must use the existing fail-fast loader contract');
assert.ok(bootstrapPatch.includes("'GameUI/pdpx_eff_Mask_01'"), 'mask must remain in the Bootstrap image allowlist');
assert.ok(
    controller.includes('this.rules.shouldShowRedWarning(PCH_RED_WARNING_EMPTY_SLOT_THRESHOLD)')
        && controller.includes('PCH_RED_WARNING_MAX_OPACITY = 102')
        && controller.includes("this.runtime.requireCanvasUiRoot?.('FxRoot')")
        && controller.includes('transform.setContentSize(effectTransform.contentSize)')
        && controller.includes('.to(PCH_RED_WARNING_PULSE_SECONDS, { opacity: 0 })'),
    'controller must use the original stateful 0 → 0.4 → 0 red warning cycle on the full-screen effect root',
);

console.log('pch-red-warning-effect: PASS');
