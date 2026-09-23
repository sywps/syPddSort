const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8');
const start = source.indexOf('    private showLevelTwoSoftHand(');
const end = source.indexOf('    private playCapacityGuideTapRings(', start);
assert.ok(start > 0 && end > start);
const methods = source.slice(start, end);
assert.ok(!methods.includes('inputLocked ='));
assert.ok(!methods.includes('.on('));
assert.ok(!methods.includes('addComponent(Button)'));
const compiled = ts.transpileModule(`class Harness { ${methods} }; module.exports = Harness;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('module', 'UITransform', 'Tween', compiled)(mod, class {}, { stopAllByTarget() {} });
const h = new mod.exports();
const anchor = { isValid: true, children: [], parent: { getComponent: () => ({ convertToNodeSpaceAR: p => p }) },
    setPosition(p) { this.position = p; }, destroy() { this.isValid = false; } };
h.levelTwoSoftHand = anchor;
h.runtime = { cellNodes: [[{ activeInHierarchy: true }, { activeInHierarchy: true }]] };
h.rules = { board: { currentColors: [[9, 3]], locked: [[false, false]] },
    get cells() { return this.board.currentColors[0].map((current, col) => ({ row: 0, col, current })); } };
h.getBoardCellWorldPosition = (row, col) => ({ x: col, y: row });
h.updateLevelTwoSoftHand();
assert.equal(h.levelTwoSoftHandTarget.col, 1, 'prefer yellow over green');
h.rules.board.locked[0][1] = true;
h.updateLevelTwoSoftHand();
assert.equal(h.levelTwoSoftHandTarget.col, 0, 'retarget to available bean');
h.settingsPaused = true;
h.updateLevelTwoSoftHand();
assert.equal(anchor.active, false);
h.settingsPaused = false;
h.updateLevelTwoSoftHand();
assert.equal(anchor.active, true);
h.runtime.isGameEnd = true;
h.updateLevelTwoSoftHand();
assert.equal(h.levelTwoSoftHand, null);
assert.equal(anchor.isValid, false);
const tapStart = source.indexOf('    private handleBoardTap(');
const tapEnd = source.indexOf("return 'stored';", tapStart);
const tap = source.slice(tapStart, tapEnd);
assert.ok(tap.indexOf('this.clearLevelTwoSoftHand()') > tap.indexOf("return 'capacity_blocked'"));
assert.ok(tap.indexOf('this.clearLevelTwoSoftHand()') < tap.indexOf("return 'partial'"));
console.log('pch-level2-soft-hand.test.js passed');
