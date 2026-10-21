const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8');
const start = source.indexOf('    private getEffectiveBeltSpeedMultiplier(');
const end = source.indexOf('    hasStoredBeans()', start);
const code = ts.transpileModule(`class Harness { ${source.slice(start, end)} }; module.exports = Harness;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('module', code)(mod);
const h = new mod.exports();
h.runtime = { _activeGameplayEntryMode: 'main', getActiveLogicalLevelId: () => 1 };
h.manualSpeedMultiplier = 1;
h.beforeWinSpeedActive = false;
h.rules = { bufferCount: 6, entryCount: 6, conveyorSpeedMultiplier: 1,
    cells: [{ locked: false, current: 20 }] };
assert.equal(h.getEffectiveBeltSpeedMultiplier(), 1);
h.rules.cells = [{ locked: true, current: 20 }, { locked: false, current: 0 }];
assert.equal(h.getEffectiveBeltSpeedMultiplier(), 3, 'queued beans need not finish entering');
h.rules.bufferCount = 0;
assert.equal(h.getEffectiveBeltSpeedMultiplier(), 3, 'finish speed stays active this round');
assert.equal(h.manualSpeedMultiplier, 1);
h.beforeWinSpeedActive = false;
assert.equal(h.getEffectiveBeltSpeedMultiplier(), 1, 'empty fresh round does not trigger');
h.runtime.getActiveLogicalLevelId = () => 2;
h.rules.conveyorSpeedMultiplier = 5;
assert.equal(h.getEffectiveBeltSpeedMultiplier(), 5);
h.beforeWinSpeedActive = false;
h.runtime.getActiveLogicalLevelId = () => 1;
h.runtime.isCoopMode = () => true;
assert.equal(h.getEffectiveBeltSpeedMultiplier(), 5, 'coop retains existing finish rules');
console.log('pch-level1-finish-speed.test.js passed');
