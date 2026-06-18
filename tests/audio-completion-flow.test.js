const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const manifest = read('assets/Scripts/Core/AudioManifest.ts');
assert.ok(manifest.includes("winAll: 'Audio/winColor'"), 'level-complete winAll must reuse the single-color completion audio');
assert.ok(manifest.includes("winSettlement: 'Audio/winSettlement'"), 'win settlement must have a dedicated audio key');
assert.ok(manifest.includes('winSettlement: 0.62'), 'win settlement volume must be configured');

const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const levelCompleteIndex = settlement.indexOf("AudioMgr.inst.play('winAll');");
const settlementIndex = settlement.indexOf("AudioMgr.inst.play('winSettlement');");
assert.ok(levelCompleteIndex >= 0, 'gameWin must play the level-complete cue');
assert.ok(settlementIndex >= 0, 'gameWin must play the settlement cue');
assert.ok(levelCompleteIndex < settlementIndex, 'level-complete cue must play before settlement cue');

const colorFx = read('assets/Scripts/Core/GameCtrlModules/GameplayColorCompleteFxModule.ts');
assert.ok(colorFx.includes('playColorCompleteEffect(colorId: number, playSound: boolean = true)'), 'color-complete effect must allow sound suppression');
assert.ok(colorFx.includes("if (playSound) AudioMgr.inst.play('winColor');"), 'color-complete audio must be conditional');

const placement = read('assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts');
assert.ok(placement.includes('const skipColorCompleteAudio = bm.isAllLocked();'), 'final board completion must suppress ordinary color-complete audio');
assert.ok(placement.includes('this.playColorCompleteEffect(cid, !skipColorCompleteAudio);'), 'color-complete effect must preserve visuals while suppressing final-block audio');

assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Audio/winSettlement.mp3')), 'winSettlement.mp3 must exist');
assert.ok(fs.existsSync(path.join(root, 'assets/GameAssetsBundle/Audio/winSettlement.mp3.meta')), 'winSettlement.mp3.meta must exist');

console.log('audio-completion-flow.test.js passed');
