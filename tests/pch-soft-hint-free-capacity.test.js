const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.createSourceFile('controller.ts', fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const cls = source.statements.find(ts.isClassDeclaration);
const handler = cls.members.filter(m => ['onCapacityAdTap', 'getCapacityOfferMode'].includes(m.name?.getText(source))).map(m => m.getText(source)).join('\n');
let now = 10000;
const box = { Date: { now: () => now }, AudioMgr: { inst: { play() {} } } };
vm.runInNewContext(ts.transpileModule(`class C { ${handler} }; globalThis.C=C;`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, box);
for (const level of [4, 5, 6]) {
    let ads = 0;
    const toasts = [];
    const c = Object.assign(new box.C(), {
        runtime: { _activeGameplayEntryMode: 'main', getActiveLogicalLevelId: () => level,
            runRewardedGrant() { ads++; }, showToast(t) { toasts.push(t); } },
        rules: { bufferCapacity: 100, bufferCount: 90 }, capacityHintWasShown: true,
        clearCapacityHint() {}, isLevelThreeFreeCapacity: () => false,
        getCapacityButtonIncrement: () => 30,
        resetCapacityAdGesture() { this.capacityAdTouchId = null; }, trackPchFunnelEvent() {},
        expandCapacity() { this.rules.bufferCapacity += 30; return true; },
    });
    const tap = () => c.onCapacityAdTap({ getID: () => 1 });
    tap();
    if (level === 6) { assert.equal(ads, 1); continue; }
    assert.equal(ads, 0);
    assert.equal(c.rules.bufferCapacity, 130);
    assert.deepEqual(toasts, ['传送带已扩容 +30']);
    tap(); assert.equal(ads, 0, 'duplicate tap cannot immediately request an ad');
    now += 1000; c.capacityAdTouchId = 1;
    tap(); assert.equal(ads, 1, 'the next deliberate expansion uses the ad flow');
    assert.equal(c.rules.bufferCapacity, 130);
}
console.log('PASS soft-hint free capacity: levels 4/5, once, duplicate protection, unchanged toast');
