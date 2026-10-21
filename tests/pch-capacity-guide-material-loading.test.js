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
class FakeMaterial { initialize() {} }
function create(speedGuide = false) {
    const events = [];
    const voices = [];
    const testModule = { exports: {} };
    new Function('module', 'EffectAsset', 'Material', 'AudioMgr', 'isWeChatMiniGameRuntime', compiled)(testModule, class {}, FakeMaterial, {
        inst: { playGuideVoice(name, isCurrent) { voices.push({ name, isCurrent }); events.push(`voice:${name}`); } },
    }, () => false);
    const guide = new testModule.exports();
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
    guide.showOpeningTargetGuide = (...args) => {
        guide.openingGuide = { name: args[2], isValid: true }; events.push(args[2]);
    };
    if (speedGuide) guide.showRoundedMaterialGuide({ isValid: true }, true);
    else guide.showLevelThreeCapacityGuide({ isValid: true });
    assert.strictEqual(guide.inputLocked, true);
    assert.deepStrictEqual(events, []);
    return { guide, events, voices, complete };
}
const success = create();
success.complete(null, {});
assert.deepStrictEqual(success.events, ['PchLevelThreeCapacityGuide', 'voice:guideCapacity']);
assert.ok(success.guide.capacityGuideMaterial instanceof FakeMaterial);
assert.equal(success.voices[0].isCurrent(), true);
success.guide.clearOpeningGuideNodes();
assert.equal(success.voices[0].isCurrent(), false, 'dismissed guides must reject late audio');
const speed = create(true);
speed.complete(null, {});
assert.deepStrictEqual(speed.events, ['PchLevelTwoSpeedGuide', 'voice:guideSpeed']);
assert.ok(speed.guide.capacityGuideMaterial instanceof FakeMaterial);
assert.equal(speed.voices[0].isCurrent(), true);
speed.guide.openingGuide = { isValid: true };
assert.equal(speed.voices[0].isCurrent(), false, 'a replaced guide must reject late audio');
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
const missingVisual = create();
missingVisual.guide.showOpeningTargetGuide = () => { throw new Error('missing target'); };
missingVisual.complete(null, {});
assert.deepStrictEqual(missingVisual.events, ['clear', 'fatal'], 'a failed visual guide must not speak');
console.log('pch-capacity-guide-material-loading.test.js passed');
