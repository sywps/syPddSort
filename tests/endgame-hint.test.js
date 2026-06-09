const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readJson(relPath) {
    return JSON.parse(read(relPath));
}

function assertIncludes(source, needle, label) {
    assert.ok(source.includes(needle), `${label} must include ${needle}`);
}

const prefabPath = 'assets/GameAssetsBundle/UI/Prefabs/Fx/EndgameHintCell.prefab';
const prefabMetaPath = 'assets/GameAssetsBundle/UI/Prefabs/Fx/EndgameHintCell.prefab.meta';
const fxMetaPath = 'assets/GameAssetsBundle/UI/Prefabs/Fx.meta';

assert.ok(fs.existsSync(path.join(root, prefabPath)), 'EndgameHintCell.prefab must exist');
assert.ok(fs.existsSync(path.join(root, prefabMetaPath)), 'EndgameHintCell.prefab.meta must exist');
assert.ok(fs.existsSync(path.join(root, fxMetaPath)), 'Fx directory meta must exist');

const prefab = readJson(prefabPath);
const prefabMeta = readJson(prefabMetaPath);
const fxMeta = readJson(fxMetaPath);

assert.strictEqual(prefabMeta.importer, 'prefab', 'EndgameHintCell meta importer must be prefab');
assert.strictEqual(prefabMeta.userData.syncNodeName, 'EndgameHintCell', 'EndgameHintCell sync node name mismatch');
assert.strictEqual(fxMeta.importer, 'directory', 'Fx meta importer must be directory');
assert.ok(prefab.some((entry) => entry.__type__ === 'cc.Prefab' && entry._name === 'EndgameHintCell'), 'prefab root asset missing');
assert.ok(prefab.some((entry) => entry.__type__ === 'cc.Node' && entry._name === 'HintGlow'), 'HintGlow visual node missing');
assert.ok(prefab.some((entry) => entry.__type__ === 'cc.Sprite'), 'HintGlow must keep a Sprite component for runtime star frames');

const moduleSource = read('assets/Scripts/Core/GameCtrlModules/EndgameHintModule.ts');
[
    "const ENDGAME_HINT_PREFAB_PATH = 'UI/Prefabs/Fx/EndgameHintCell'",
    'const ENDGAME_HINT_THRESHOLD = 5',
    'const ENDGAME_BOARD_HINT_EXTRA_SIZE = 0',
    'const ENDGAME_SLOT_HINT_EXTRA_SIZE = 0',
    "const ENDGAME_HINT_STAR_FRAME_PREFIX = 'block_match-animation_'",
    'const ENDGAME_HINT_STAR_FRAME_COUNT = 19',
    'const ENDGAME_HINT_STAR_FRAME_SEQUENCE = [19, 18, 17, 16, 17, 18, 19]',
    'const ENDGAME_HINT_STAR_VISIBLE_DURATION = 1',
    'const ENDGAME_HINT_STAR_FRAME_INTERVAL = ENDGAME_HINT_STAR_VISIBLE_DURATION / ENDGAME_HINT_STAR_FRAME_SEQUENCE.length',
    'const ENDGAME_HINT_STAR_MAX_OPACITY = 190',
    'const ENDGAME_HINT_STAR_LOOP_PAUSE = 0.5',
    'const ENDGAME_HINT_STAR_SPIN_DEGREES = 360',
    'bundle.load(ENDGAME_HINT_PREFAB_PATH, Prefab',
    'instantiate(prefab)',
    'collectEndgameIncompleteCells()',
    'buildEndgameHintTargets(cells',
    'neededColors.has(block.colorId)',
    'ensureEndgameHintStarFrames((frames: SpriteFrame[])',
    'getEffectFrames(ENDGAME_HINT_STAR_FRAME_PREFIX, ENDGAME_HINT_STAR_FRAME_COUNT)',
    'showEndgameHints(latestCells, reason, frames)',
    'if (this.isSelected) return;',
    'glowTransform.setContentSize(target.size, target.size)',
    'glowSprite.color = new Color(255, 255, 255, 255)',
    'glow?.setPosition(0, 0, 0)',
    'glow?.setRotationFromEuler(0, 0, 0)',
    'glowSprite.spriteFrame = frame',
    '.set({ opacity: ENDGAME_HINT_STAR_MAX_OPACITY })',
    '.delay(ENDGAME_HINT_STAR_VISIBLE_DURATION)',
    '.set({ opacity: 0 })',
    '.to(ENDGAME_HINT_STAR_VISIBLE_DURATION, { eulerAngles: new Vec3(0, 0, ENDGAME_HINT_STAR_SPIN_DEGREES) }',
    '.delay(ENDGAME_HINT_STAR_LOOP_PAUSE)',
    'clearEndgameHints(destroy: boolean = false)',
    'repeatForever',
].forEach((needle) => assertIncludes(moduleSource, needle, 'EndgameHintModule'));
assert.ok(!moduleSource.includes('Graphics'), 'EndgameHintModule must not draw stable hint visuals with Graphics');

const boardInputSource = read('assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts');
assert.ok(!boardInputSource.includes('this.isSelected = true;\r\n            this.clearEndgameHints(false);')
    && !boardInputSource.includes('this.isSelected = true;\n            this.clearEndgameHints(false);'),
    'Selecting a board or slot bean must not clear final-five endgame hints');

const installer = read('assets/Scripts/Core/installGameCtrlModules.ts');
assertIncludes(installer, "import { installEndgameHintModule } from './GameCtrlModules/EndgameHintModule';", 'installGameCtrlModules');
assertIncludes(installer, 'installEndgameHintModule(runtime);', 'installGameCtrlModules');

const state = read('assets/Scripts/Core/GameCtrlState.ts');
[
    '_endgameHintPrefab: null',
    '_endgameHintPrefabLoading: false',
    '_endgameHintNodes: []',
    '_endgameHintPool: []',
].forEach((needle) => assertIncludes(state, needle, 'GameCtrlState'));

const session = read('assets/Scripts/Core/GameplaySessionController.ts');
assertIncludes(session, 'runtime.clearEndgameHints(true);', 'GameplaySessionController');
assertIncludes(session, "runtime.refreshEndgameHints('init-game');", 'GameplaySessionController');

const placement = read('assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts');
[
    "this.refreshEndgameHints('slot-landed')",
    "this.refreshEndgameHints('fly-done')",
    "this.refreshEndgameHints('fly-all-landed')",
    "this.refreshEndgameHints('finish-place')",
    "this.refreshEndgameHints('cancel-selection')",
    'this.clearEndgameHints(false);',
].forEach((needle) => assertIncludes(placement, needle, 'GameplayPlacementFxModule'));

const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
assertIncludes(settlement, 'this.clearEndgameHints(false);', 'SettlementHudModule');

console.log('endgame hint wiring checks passed');
