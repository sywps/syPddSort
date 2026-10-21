const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8');
const start = source.indexOf('    private handleBoardTap(');
const end = source.indexOf('        this.clearLevelTwoSoftHand();', start);
const code = ts.transpileModule(`class Harness { ${source.slice(start, end)} } }; module.exports = Harness;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('module', code)(mod);
function run(level, moved, valid = true, mode = 'main') {
    const h = new mod.exports();
    const calls = [];
    h.runtime = { _activeGameplayEntryMode: mode, getActiveLogicalLevelId: () => level,
        _pinchGuideLayer: {}, closePinchGuide: reason => calls.push(reason) };
    h.rules = { selectBoard: () => valid ? { cells: [{ row: 0, col: 0 }] } : null,
        storeBlock: () => ({ moved }) };
    h.getBeanSelectionBucket = () => 'A';
    h.getBoardCellWorldPosition = () => ({});
    h.getEntranceCarrierIndex = () => 0;
    h.maybeShowCapacityBlockedToast = () => {};
    h.handleBoardTap(0, 0);
    return calls;
}
assert.deepStrictEqual(run(4, 1), ['bean_tap']);
assert.deepStrictEqual(run(4, 0), []);
assert.deepStrictEqual(run(4, 1, false), []);
assert.deepStrictEqual(run(3, 1), []);
assert.deepStrictEqual(run(4, 1, true, 'theme'), []);
const guide = fs.readFileSync('assets/Scripts/Core/GameCtrlModules/CollectionGuideModule.ts', 'utf8');
assert.ok(guide.includes("reason === 'gesture' || reason === 'bean_tap'"));
console.log('pch-level4-bean-dismiss-guide.test.js passed');
