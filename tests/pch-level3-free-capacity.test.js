const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8');
const ast = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
const offerMode = ast.statements.find(ts.isClassDeclaration).members.find(m => m.name?.getText(ast) === 'getCapacityOfferMode').getText(ast);
function method(name, next) {
    const start = source.indexOf(`    private ${name}(`);
    const end = source.indexOf(`    private ${next}(`, start);
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end);
}
const code = ts.transpileModule(`class Harness {
${offerMode}
${method('onCapacityAdTap', 'isLevelThreeFreeCapacity')}
${method('isLevelThreeFreeCapacity', 'showCapacityBurst')}
}; module.exports = Harness;`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const target = { exports: {} };
new Function('module', 'AudioMgr', 'PCH_EXPAND_CAPACITY', 'PCH_LEVEL_THREE_MAX_CAPACITY', code)(
    target, { inst: { play() {} } }, 12, 150);
function create(level = 3, capacity = 60, mode = 'main') {
    const h = new target.exports();
    h.runtime = { _activeGameplayEntryMode: mode, getActiveLogicalLevelId: () => level,
        showToast(text) { h.toast = text; }, runRewardedGrant() { h.adRequested = true; } };
    h.rules = { bufferCapacity: capacity, addBufferSlots(n) {
        assert.ok(n > 0 && n % 3 === 0); this.bufferCapacity += n; return n;
    } };
    h.adButton = { active: true };
    h.lastEntranceAudioVisitByCarrier = new Map();
    for (const key of ['clearCapacityHint', 'renderConveyor', 'renderEntranceQueue', 'refreshStatus',
        'showCapacityBurst', 'trackPchFunnelEvent']) h[key] = () => {};
    return h;
}
const h = create();
for (let i = 0; i < 8; i++) h.onCapacityAdTap({});
assert.equal(h.rules.bufferCapacity, 150);
assert.equal(h.adButton.active, false);
assert.equal(h.adRequested, undefined);
assert.equal(h.toast, '传送带已扩容 +6');
h.onCapacityAdTap({});
assert.equal(h.rules.bufferCapacity, 150);
assert.equal(h.expandCapacity(), false);
const replay = create();
replay.onCapacityAdTap({});
assert.equal(replay.rules.bufferCapacity, 72);
assert.equal(replay.adButton.active, true);
for (const other of [create(4), create(3, 60, 'theme')]) {
    other.onCapacityAdTap({});
    assert.equal(other.adRequested, true);
    assert.equal(other.rules.bufferCapacity, 60);
}
const coop = create();
coop.runtime.isCoopMode = () => true;
assert.equal(coop.isLevelThreeFreeCapacity(), false);
console.log('pch-level3-free-capacity.test.js passed');
