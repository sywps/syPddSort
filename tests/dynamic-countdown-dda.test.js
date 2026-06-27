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

const expectedTimes = new Map();
for (const level of [11, 12, 13, 14, 16, 17, 18, 20, 21]) expectedTimes.set(level, 270);
for (const level of [15, 19, 22, 24, 25, 26, 28]) expectedTimes.set(level, 300);
for (const level of [23, 27, 29, 30, 32, 33, 34]) expectedTimes.set(level, 330);
for (const level of [31, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 48, 49, 50, 52, 53]) expectedTimes.set(level, 360);
for (const level of [47, 51, 54, 55, 56, 57, 58, 60, 61, 62, 64, 65]) expectedTimes.set(level, 390);
for (const level of [59, 63, 66, 67, 68, 69, 70, 72, 73]) expectedTimes.set(level, 420);
for (const level of [71, 74, 76, 77, 78, 80, 81]) expectedTimes.set(level, 450);
for (const level of [75, 79, 82, 84, 85, 86, 88]) expectedTimes.set(level, 480);
for (const level of [83, 89, 90, 92]) expectedTimes.set(level, 510);
for (const level of [87, 91, 93, 94, 96, 97]) expectedTimes.set(level, 540);
for (const level of [95, 98]) expectedTimes.set(level, 570);
for (const level of [99, 100]) expectedTimes.set(level, 600);

assert.strictEqual(expectedTimes.size, 90, 'level 11-100 time table must cover exactly 90 levels');
for (let level = 4; level <= 10; level++) {
    const data = readJson(`assets/LevelData/level_${level}.json`);
    assert.strictEqual(data.timeLimit, 600, `level ${level} timeLimit must stay at 10 minutes`);
}
for (let level = 11; level <= 100; level++) {
    const data = readJson(`assets/LevelData/level_${level}.json`);
    assert.strictEqual(data.timeLimit, expectedTimes.get(level), `level ${level} timeLimit must match confirmed plan`);
}

const manifest = readJson('assets/LevelData/level-manifest.json');
const manifestByLevel = new Map(manifest.entries.map((entry) => [entry.levelId, entry]));
for (let level = 4; level <= 10; level++) {
    assert.strictEqual(manifestByLevel.get(level)?.timeLimit, 600, `level ${level} manifest timeLimit must stay at 10 minutes`);
}
for (let level = 11; level <= 100; level++) {
    assert.strictEqual(manifestByLevel.get(level)?.timeLimit, expectedTimes.get(level), `level ${level} manifest timeLimit must match confirmed plan`);
}

const dynamicModule = read('assets/Scripts/Core/GameCtrlModules/DynamicCountdownDdaModule.ts');
assert.ok(dynamicModule.includes('DYNAMIC_COUNTDOWN_DDA_MIN_LEVEL = 11'), 'dynamic DDA must start at level 11');
assert.ok(dynamicModule.includes('DYNAMIC_COUNTDOWN_CLEAN_WIN_STREAK_TRIGGER = 3'), 'dynamic DDA must require 3 clean wins');
assert.ok(dynamicModule.includes('DYNAMIC_COUNTDOWN_CLEAN_WIN_REMAIN_RATIO = 0.15'), 'clean win must require >15% remaining time');
assert.ok(dynamicModule.includes('DYNAMIC_COUNTDOWN_HARD_TIME_FACTOR = 0.8'), 'compressed level must use 80% time');
assert.ok(dynamicModule.includes('DYNAMIC_COUNTDOWN_SECOND_FAIL_FACTOR = 1.15'), 'second same-level final fail must use 115% time');
assert.ok(dynamicModule.includes('DYNAMIC_COUNTDOWN_THIRD_FAIL_FACTOR = 1.3'), 'third same-level final fail must use 130% time');
assert.ok(dynamicModule.includes('recordDynamicCountdownFinalFailure'), 'dynamic DDA must expose final fail recording');
assert.ok(dynamicModule.includes('revokeDynamicCountdownFinalFailure'), 'dynamic DDA must support undo when a lose-panel revive continues play');

const installer = read('assets/Scripts/Core/installGameCtrlModules.ts');
assert.ok(installer.includes("import { installDynamicCountdownDdaModule }"), 'dynamic DDA module must be imported by installer');
assert.ok(installer.includes('installDynamicCountdownDdaModule(runtime);'), 'dynamic DDA module must be installed on runtime');
assert.ok(installer.includes("import { installGameplayFreezeEffectModule }"), 'freeze effect module must be imported by installer');
assert.ok(installer.includes('installGameplayFreezeEffectModule(runtime);'), 'freeze effect module must be installed on runtime');

const session = read('assets/Scripts/Core/GameplaySessionController.ts');
assert.ok(session.includes('runtime.resolveDynamicCountdownTimeLimit({'), 'initGame must apply dynamic DDA after onboarding time resolution');
assert.ok(session.includes('runtime._currentLevelUnlimitedTime = dynamicTimeLimit <= 0'), 'unlimited time flag must use dynamic result');
assert.ok(session.includes('runtime.timeRemain = dynamicTimeLimit'), 'timeRemain must use dynamic result');

const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
assert.ok(settlement.includes('this.recordDynamicCountdownWin?.();'), 'gameWin must update dynamic DDA win state');
assert.ok(settlement.includes('this.recordDynamicCountdownFinalFailure?.();'), 'showLosePanel must record final fail');
assert.ok(settlement.includes('this.revokeDynamicCountdownFinalFailure?.();'), 'revive continuation must undo a recorded final fail');
assert.ok(settlement.includes('this.markDynamicCountdownAssisted?.();'), 'revive continuation must mark assisted run');
assert.ok(settlement.includes('completePercent: Math.min(98'), 'fail/revive settlement progress must cap displayed completion below 100%');
assert.ok(settlement.includes('this.boardModel?.isAllLocked?.()'), 'gameLose must prefer win when the board is already complete');

const skillUi = read('assets/Scripts/Core/GameplaySkillUiController.ts');
assert.ok(skillUi.includes('runtime.markDynamicCountdownAssisted?.();'), 'successful skill use must mark assisted run');
assert.ok(skillUi.includes('const timerPausedForFinalSecond = runtime.pauseTimerForFinalSecondProp?.() === true;'), 'skill buttons must only pause the timer in the final-second prop window');
assert.ok(skillUi.includes('handler(timerPausedForFinalSecond);'), 'skill handlers must receive the final-second pause state');
assert.ok(skillUi.includes("private readonly skillShellKinds = ['magnet', 'brush', 'freeze'] as const"), 'gameplay skill shell order must be color clear, slot clear, freeze');
assert.ok(skillUi.includes("if (kind === 'freeze') return 'SkillFreeze';"), 'freeze skill must bind to the Game.scene SkillFreeze shell');
assert.ok(skillUi.includes("kind: 'freeze' as const"), 'gameplay skill config must include freeze instead of wand');
assert.ok(skillUi.includes('runtime.useSkillFreeze(timerAlreadyPaused)'), 'freeze skill button must call the freeze handler');
assert.ok(!skillUi.includes('iconFrameName'), 'gameplay skill binding must not override scene-owned tool icons');
assert.ok(!skillUi.includes('captionText'), 'gameplay skill binding must not override scene-owned tool captions');

const gameScene = readJson('assets/BootstrapBundle/Scenes/Game.scene');
function findSceneNodeIndex(name) {
    return gameScene.findIndex((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === name);
}
function findSceneNode(name) {
    const index = findSceneNodeIndex(name);
    return index >= 0 ? gameScene[index] : undefined;
}
function getSceneNodeChild(parentName, childName) {
    const parent = findSceneNode(parentName);
    assert.ok(parent, `Game.scene must include ${parentName}`);
    for (const ref of parent._children || []) {
        const child = gameScene[ref.__id__];
        if (child && child._name === childName) return child;
    }
    assert.fail(`Game.scene must include ${parentName}/${childName}`);
}
function getSceneComponent(node, typeName) {
    for (const ref of node._components || []) {
        const component = gameScene[ref.__id__];
        if (component && component.__type__ === typeName) return component;
    }
    assert.fail(`Game.scene node ${node._name} must include component ${typeName}`);
}
const skillArea = findSceneNode('SkillArea');
assert.ok(skillArea, 'Game.scene must include SkillArea');
const skillAreaChildren = skillArea._children.map((ref) => gameScene[ref.__id__]._name);
assert.deepStrictEqual(skillAreaChildren, ['SkillMagnet', 'SkillBrush', 'SkillFreeze'], 'Game.scene skill sibling order must be color clear, slot clear, freeze');
assert.ok(!findSceneNode('SkillWand'), 'Game.scene must not expose a SkillWand shell');
assert.deepStrictEqual([
    findSceneNode('SkillMagnet')._lpos.x,
    findSceneNode('SkillBrush')._lpos.x,
    findSceneNode('SkillFreeze')._lpos.x,
], [-200, 0, 200], 'Game.scene skill positions must match the requested order');
assert.strictEqual(getSceneComponent(getSceneNodeChild('SkillMagnet', 'Label'), 'cc.Label')._string, '消色', 'left skill label must be 消色');
assert.strictEqual(getSceneComponent(getSceneNodeChild('SkillBrush', 'Label'), 'cc.Label')._string, '清空槽位', 'middle skill label must be 清空槽位');
assert.strictEqual(getSceneComponent(getSceneNodeChild('SkillFreeze', 'Label'), 'cc.Label')._string, '冻结时间', 'right skill label must be 冻结时间');
assert.strictEqual(
    getSceneComponent(getSceneNodeChild('SkillFreeze', 'ToolIcon'), 'cc.Sprite')._spriteFrame.__uuid__,
    '7d9b48cd-c975-4ce9-96fe-8a0c1e523cb4@f9941',
    'freeze skill icon must use the scene-owned freeze sprite frame',
);
const fxRoot = findSceneNode('FxRoot');
assert.ok(fxRoot, 'Game.scene must include FxRoot');
const freezeFxLayer = getSceneNodeChild('FxRoot', 'FreezeFxLayer');
assert.strictEqual(freezeFxLayer._parent.__id__, findSceneNodeIndex('FxRoot'), 'FreezeFxLayer must be a static child of FxRoot');
const freezeFxLayerTransform = getSceneComponent(freezeFxLayer, 'cc.UITransform');
assert.deepStrictEqual(
    [freezeFxLayerTransform._contentSize.width, freezeFxLayerTransform._contentSize.height],
    [720, 1280],
    'FreezeFxLayer UITransform must keep the 720x1280 scene design size',
);
const freezeFxLayerWidget = getSceneComponent(freezeFxLayer, 'cc.Widget');
assert.strictEqual(freezeFxLayerWidget._alignFlags, 45, 'FreezeFxLayer Widget must stretch to its parent');
assert.deepStrictEqual(
    [freezeFxLayerWidget._left, freezeFxLayerWidget._right, freezeFxLayerWidget._top, freezeFxLayerWidget._bottom],
    [0, 0, 0, 0],
    'FreezeFxLayer Widget offsets must be zero on all sides',
);
assert.deepStrictEqual(
    [freezeFxLayerWidget._originalWidth, freezeFxLayerWidget._originalHeight],
    [720, 1280],
    'FreezeFxLayer Widget original size must match the scene design size',
);

const timerModule = read('assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts');
assert.ok(timerModule.includes('shouldPauseTimerForFinalSecondProp'), 'timer module must expose a final-second prop pause guard');
assert.ok(timerModule.includes('remaining > 0 && remaining <= 1'), 'final-second prop pause guard must be limited to the last-second window');
assert.ok(timerModule.includes('if (this.boardModel?.isAllLocked?.())'), 'timer tick must check completion before timing out');
assert.ok(timerModule.includes('if (this.tickFreezeTimer()) return;'), 'timer tick must skip countdown while freeze is active');
assert.ok(timerModule.includes('this.stopFreezeSpineFx?.(true);'), 'freeze timer expiry must stop the freeze Spine effect');

const skillWand = read('assets/Scripts/Core/GameCtrlModules/GameplaySkillWandModule.ts');
assert.ok(skillWand.includes('this.pauseTimerForFinalSecondProp();'), 'wand/brush skill entries must not pause except in final-second prop window');
assert.ok(skillWand.includes('this._freezeTimeLeft = freezeSeconds;'), 'freeze skill must set a freeze countdown duration');
assert.ok(skillWand.includes('this.playFreezeSpineFx?.();'), 'freeze skill must trigger the freeze Spine effect');

const skillMagnet = read('assets/Scripts/Core/GameCtrlModules/GameplaySkillMagnetModule.ts');
assert.ok(skillMagnet.includes('this.pauseTimerForFinalSecondProp();'), 'magnet skill entry must not pause except in final-second prop window');

const slotUi = read('assets/Scripts/Core/GameplaySlotUiController.ts');
assert.ok(slotUi.includes('runtime.markDynamicCountdownAssisted?.();'), 'successful slot-row unlock must mark assisted run');

const freezeFx = read('assets/Scripts/Core/GameCtrlModules/GameplayFreezeEffectModule.ts');
assert.ok(freezeFx.includes("FREEZE_SPINE_FX_PATH = 'Spine/PinddFreeze/bingdonglizi'"), 'freeze effect must load the PinddFreeze Spine resource');
assert.ok(!freezeFx.includes('FREEZE_SPINE_FX_UUID'), 'freeze effect must not use a UUID fallback');
assert.ok(!freezeFx.includes('assetManager.loadAny'), 'freeze effect must not use a loadAny fallback when the bundle path is wrong');
assert.ok(!freezeFx.includes('warnFreezeSpineFx'), 'freeze effect failures must not be downgraded to warnings');
assert.ok(freezeFx.includes('throw createFreezeSpineFxError'), 'freeze effect critical failures must throw');
assert.ok(freezeFx.includes("start: 'a1'"), 'freeze effect must play the reference a1 start animation');
assert.ok(freezeFx.includes("loop: 'b1'"), 'freeze effect must loop the reference b1 freeze animation');
assert.ok(freezeFx.includes("end: 'c1'"), 'freeze effect must play the reference c1 ending animation');
assert.ok(freezeFx.includes("FREEZE_SPINE_FX_LAYER_NAME = 'FreezeFxLayer'"), 'freeze effect must target the scene-owned FreezeFxLayer');
assert.ok(freezeFx.includes("this.requireCanvasUiRoot('FxRoot')"), 'freeze effect must resolve FxRoot before looking up the nested layer');
assert.ok(freezeFx.includes('fxRoot.getChildByName(FREEZE_SPINE_FX_LAYER_NAME)'), 'freeze effect must resolve FreezeFxLayer from FxRoot');
assert.ok(freezeFx.includes('fxLayer.addChild(node)'), 'freeze effect must parent the Spine node to FreezeFxLayer');
assert.ok(freezeFx.includes('FREEZE_SPINE_FX_REFERENCE_WIDTH = 750'), 'freeze effect layout must use the reference design width');
assert.ok(freezeFx.includes('FREEZE_SPINE_FX_REFERENCE_HEIGHT = 1334'), 'freeze effect layout must use the reference design height');
assert.ok(freezeFx.includes('FREEZE_SPINE_FX_REFERENCE_Y = -133.4'), 'freeze effect layout must use the reference y offset');
assert.ok(freezeFx.includes('scale: width / FREEZE_SPINE_FX_REFERENCE_WIDTH'), 'freeze effect scale must use the layer width ratio');
assert.ok(freezeFx.includes('FREEZE_SPINE_FX_REFERENCE_Y * (height / FREEZE_SPINE_FX_REFERENCE_HEIGHT)'), 'freeze effect y must use the layer height ratio');
assert.ok(!freezeFx.includes('getFreezeSpineFxScale'), 'freeze effect must not use the old fit-to-source scale helper');
assert.ok(!freezeFx.includes('fxRoot.addChild(node)'), 'freeze effect must not attach the Spine node directly to FxRoot');
assert.ok(freezeFx.includes('skeleton.addAnimation(0, FREEZE_SPINE_FX_ANIMATION.loop, true, 0);'), 'freeze effect must loop after the start animation');

const freezeSpineDir = 'assets/GameAssetsBundle/Spine/PinddFreeze';
assert.ok(fs.existsSync(path.join(root, freezeSpineDir, 'bingdonglizi.json')), 'freeze Spine skeleton JSON must exist');
assert.ok(fs.existsSync(path.join(root, freezeSpineDir, 'bingdonglizi.atlas.txt')), 'freeze Spine atlas text must exist');
assert.ok(fs.existsSync(path.join(root, freezeSpineDir, 'bingdonglizi.png')), 'freeze Spine texture must exist');
const freezeSpineMeta = readJson(`${freezeSpineDir}/bingdonglizi.json.meta`);
assert.strictEqual(freezeSpineMeta.importer, 'spine-data', 'freeze Spine JSON must import as spine-data');
assert.strictEqual(freezeSpineMeta.uuid, '147069ac-5bbd-4232-ae8c-a61ef72543fb', 'freeze Spine JSON uuid must keep the authored asset identity');
assert.ok(freezeSpineMeta.userData?.atlasUuid, 'freeze Spine JSON meta must reference an atlas uuid');

console.log('dynamic-countdown-dda.test.js passed');
