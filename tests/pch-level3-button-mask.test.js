const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8');
const start = source.indexOf('    private createOpeningGuideCapacityFocusMask(');
const end = source.indexOf('    private showOpeningTargetGuide(', start);
const code = ts.transpileModule(`class Harness { ${source.slice(start, end)} }; module.exports = Harness;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
class Vec4 { constructor(x, y, z, w) { Object.assign(this, { x, y, z, w }); } }
new Function('module', 'UITransform', 'Graphics', 'Color', 'Vec4', 'OPENING_GUIDE_DIM_MASK_OPACITY', code)(
    mod, class {}, class {}, class {}, Vec4, 180);
const h = new mod.exports();
h.openingGuide = { isValid: true };
const props = {};
h.capacityGuideMaterial = { setProperty(k, v) { props[k] = v; } };
h.makeNode = () => ({ setSiblingIndex() {}, addComponent: () => ({ rect() {}, fill() {} }) });
const parent = { getComponent: () => ({ contentSize: { width: 720, height: 1280 }, anchorPoint: { x: .5, y: .5 } }) };
// No progress bar exists in this harness: only the button may determine the hole.
h.createOpeningGuideCapacityFocusMask(parent, { x: -250, y: -400 }, 80, 70);
assert.deepStrictEqual(props.holeRect, new Vec4(-250, -400, 44, 39));
h.createOpeningGuideCapacityFocusMask(parent, { x: 345, y: -400 }, 80, 70);
assert.ok(props.holeRect.x + props.holeRect.z <= 360);
console.log('pch-level3-button-mask.test.js passed');
