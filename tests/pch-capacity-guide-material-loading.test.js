const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/PchConveyorGameplayController.ts'), 'utf8');
const begin = source.indexOf('    private showLevelThreeCapacityGuide(');
const end = source.indexOf('    private createOpeningGuideCapacityFocusMask(', begin);
assert.ok(begin >= 0 && end > begin);
const compiled = ts.transpileModule(`class Harness { ${source.slice(begin, end)} }; module.exports = Harness;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const testModule = { exports: {} };
class FakeMaterial { initialize() {} }
new Function('module', 'EffectAsset', 'Material', compiled)(testModule, class {}, FakeMaterial);
function create() {
    const guide = new testModule.exports();
    const events = [];
    let complete;
    guide.rules = {};
    guide.openingGuideRingLoadVersion = 0;
    guide.adButton = {};
    guide.runtime = {
        isGameEnd: false,
        _withBootstrapBundle(cb) { cb({ load(_path, _type, callback) { complete = callback; } }); },
        _stopGameplayEntryWithFatalError() { events.push('fatal'); },
    };
    guide.clearOpeningGuideNodes = () => { guide.openingGuideRingLoadVersion++; events.push('clear'); };
    guide.showOpeningTargetGuide = (...args) => { events.push(args[2]); };
    guide.showLevelThreeCapacityGuide({ isValid: true });
    assert.strictEqual(guide.inputLocked, true);
    assert.deepStrictEqual(events, []);
    return { guide, events, complete };
}
const success = create();
success.complete(null, {});
assert.deepStrictEqual(success.events, ['PchLevelThreeCapacityGuide']);
assert.ok(success.guide.capacityGuideMaterial instanceof FakeMaterial);
const stale = create();
stale.guide.clearOpeningGuideNodes();
stale.complete(null, {});
assert.deepStrictEqual(stale.events, ['clear']);
assert.strictEqual(stale.guide.capacityGuideMaterial, undefined);
const failed = create();
failed.complete(new Error('load failed'), null);
assert.deepStrictEqual(failed.events, ['clear', 'fatal']);
const ended = create();
ended.guide.runtime.isGameEnd = true;
ended.complete(null, {});
assert.deepStrictEqual(ended.events, []);
console.log('pch-capacity-guide-material-loading.test.js passed');
