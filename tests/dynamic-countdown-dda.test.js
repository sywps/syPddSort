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

const sourceTimeLimits = new Map();
for (let level = 4; level <= 100; level++) {
    const data = readJson(`assets/LevelData/level_${level}.json`);
    assert.ok(Number.isFinite(data.timeLimit) && data.timeLimit > 0, `level ${level} timeLimit must be defined by level JSON`);
    sourceTimeLimits.set(level, data.timeLimit);
}

const manifest = readJson('assets/LevelData/level-manifest.json');
const manifestByLevel = new Map(manifest.entries.map((entry) => [entry.levelId, entry]));
for (let level = 4; level <= 100; level++) {
    assert.strictEqual(manifestByLevel.get(level)?.timeLimit, sourceTimeLimits.get(level), `level ${level} manifest timeLimit must match level JSON`);
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
assert.ok(settlement.includes('isBoardCompletionCommittedForSettlement(): boolean'), 'settlement must centralize the committed-completion boundary');
assert.ok(settlement.includes('if (!this.boardModel?.isAllLocked?.()) return false;'), 'non-complete boards must never bypass timeout');
assert.ok(settlement.includes('return conveyor.isFinishCommitted?.() === true;'), 'active PCH gameplay must wait for its final return callback before win can beat timeout');

const slotPolicy = read('assets/Scripts/Core/SlotOnboardingPolicy.ts');
assert.ok(slotPolicy.includes('export function isGameplaySkillUnlocked'), 'skill unlock policy must be centralized');
assert.ok(slotPolicy.includes('if (!isMainlineSlotEntry(entryMode)) return true;'), 'non-main gameplay entries must bypass mainline skill unlock levels');
assert.ok(slotPolicy.includes('return normalizeLevelId(levelId) >= normalizeLevelId(unlockLevel);'), 'mainline gameplay skill unlock must still use the configured unlock level');

const skillUi = read('assets/Scripts/Core/GameplaySkillUiController.ts');
const gameplaySkillMagnet = read('assets/Scripts/Core/GameCtrlModules/GameplaySkillMagnetModule.ts');
const gameplaySkillWand = read('assets/Scripts/Core/GameCtrlModules/GameplaySkillWandModule.ts');
assert.ok(skillUi.includes('runtime.markDynamicCountdownAssisted?.();'), 'successful skill use must mark assisted run');
assert.ok(skillUi.includes('const timerPausedForFinalSecond = runtime.pauseTimerForFinalSecondProp?.() === true;'), 'skill buttons must only pause the timer in the final-second prop window');
assert.ok(skillUi.includes('this.invokeSkillHandler(skill, timerPausedForFinalSecond)'), 'skill handlers must receive the final-second pause state through the exception-safe invocation path');
assert.ok(skillUi.includes('import { isGameplaySkillUnlocked, shouldShowGameplaySkillArea }'), 'skill UI must import the centralized skill unlock policy');
assert.ok(skillUi.includes('!isGameplaySkillUnlocked(currentLevel, entryMode, state.unlockLevel)'), 'all prop runtime refreshes must use entry-aware skill unlock policy');
assert.ok(skillUi.includes('!isGameplaySkillUnlocked(currentLevel, entryMode, skill.unlockLevel)'), 'skill button unlock branch must use entry-aware skill unlock policy');
assert.ok(!skillUi.includes('currentLevel < SKILL_UNLOCK_BROOM'), 'slot-clear runtime refresh must not use a raw mainline level gate');
assert.ok(!skillUi.includes('currentLevel < skill.unlockLevel'), 'skill button unlock branch must not use a raw mainline level gate');
assert.ok(skillUi.includes('private useFreezeFromAdGrant(): boolean'), 'rewarded freeze must have a dedicated immediate-use path');
assert.ok(skillUi.includes("onAdGrant: skill.kind === 'freeze'"), 'only rewarded freeze may override the default inventory grant');
assert.ok(skillUi.includes('? () => this.useFreezeFromAdGrant()'), 'rewarded freeze must activate immediately after the ad completes');
assert.ok(skillUi.includes(': undefined,'), 'magnet and brush ads must leave the override empty and use the default inventory grant');
assert.ok(!skillUi.includes('private useSkillFromAdGrant'), 'magnet and brush ads must not directly invoke their skill effects');
assert.ok(skillUi.includes('private isSkillRuntimeAvailable'), 'gameplay skills must expose a runtime availability guard');
assert.ok(skillUi.includes('private isSkillAcquireRuntimeAvailable'), 'zero-inventory acquire entries must use a separate runtime guard');
assert.ok(skillUi.includes('this.resolveSkillButtonAvailability(skill, inventoryCount)'), 'button state must branch on the current inventory count');
assert.ok(skillUi.includes("skill.kind === 'brush' && skill.preCheck && !skill.preCheck()"), 'slot-clear runtime availability must depend on slot occupancy');
assert.ok(skillUi.includes('button.enabled = availability.available'), 'button interaction must use the inventory-aware availability result');
assert.ok(skillUi.includes('if (!this.isSkillRuntimeAvailable(skill)) return;'), 'disabled slot-clear click handler must be guarded before playing feedback or opening ads');
const skillClickStart = skillUi.indexOf('shell.on(Button.EventType.CLICK', skillUi.indexOf('const handler = skill.handler;'));
const inventoryReadIndex = skillUi.indexOf('const inventoryCount = runtime.getPropCount(skill.kind);', skillClickStart);
const skillUseGuardIndex = skillUi.indexOf('if (!this.isSkillRuntimeAvailable(skill)) return;', skillClickStart);
assert.ok(skillClickStart >= 0 && inventoryReadIndex > skillClickStart && skillUseGuardIndex > inventoryReadIndex, 'zero inventory must enter acquisition before the skill-use busy guard');
assert.ok(skillUi.includes('private readonly skillDisabledDimRatio = 0.68'), 'disabled slot-clear dim strength must be explicit');
assert.ok(skillUi.includes('private dimSkillColor(color: Color): Color'), 'disabled slot-clear must use dimmed original colors');
assert.ok(skillUi.includes("const spriteTargets = [shell, shell.getChildByName('ToolIcon')]"), 'slot-clear disabled visual must only dim the button body and icon sprites');
assert.ok(skillUi.includes("const label = shell.getChildByName('Label')?.getComponent(Label);"), 'slot-clear disabled visual must dim the label separately');
assert.ok(skillUi.includes('sprite.color = this.dimSkillColor(this.getOriginalSpriteColor(sprite));'), 'disabled slot-clear sprites must keep hue while dimming');
assert.ok(skillUi.includes('label.color = this.dimSkillColor(this.getOriginalLabelColor(label));'), 'disabled slot-clear label must keep hue while dimming');
assert.ok(!skillUi.includes('sprite.grayscale = disabled'), 'disabled slot-clear must not use Sprite grayscale');
assert.ok(!skillUi.includes('skillDisabledSpriteColor'), 'slot-clear disabled visual must not use tint colors');
assert.ok(!skillUi.includes('skillDisabledLabelColor'), 'slot-clear disabled label must not use fixed tint colors');
assert.ok(!skillUi.includes('sprite.color = disabled'), 'slot-clear disabled visual must not use a flat disabled color');
assert.ok(!skillUi.includes("if (node.name === 'ToolIcon')"), 'slot-clear disabled visual must not use the rejected layered pure-gray tint');
assert.ok(skillUi.includes('this.restoreSkillNodeVisual(shell);'), 'disabled visual must restore child badges before applying scoped dim state');
assert.ok(skillUi.includes('opacity.opacity = 255'), 'runtime-disabled slot-clear must keep full opacity');
assert.ok(!skillUi.includes('opacity.opacity = available ? 255 : 138'), 'runtime-disabled slot-clear must not fade through opacity');
assert.ok(skillUi.includes('syncSkillButtonRuntimeStates()'), 'skill UI must expose a runtime state sync path for slot changes');
assert.ok(skillUi.includes('this.resolveSkillButtonAvailability(state, inventoryCount)'), 'runtime refresh must use the same inventory-aware availability path');
assert.ok(skillUi.includes('runtime.useSkillFreeze(true);'), 'rewarded freeze must start without requiring another click');
assert.ok(skillUi.includes('return runtime._skillActive === true;'), 'rewarded freeze grant success must reflect the actual active state');
assert.ok(gameplaySkillMagnet.includes('return pchController.useClearColorSkill(timerAlreadyPaused) === true;'), 'PCH clear-color must return whether its effect actually started');
assert.ok(gameplaySkillWand.includes('return pchController.useClearBufferSkill(timerAlreadyPaused) === true;'), 'PCH clear-buffer must return whether its effect actually started');
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
assert.ok(timerModule.includes('if (this.isBoardCompletionCommittedForSettlement())'), 'timer tick must check committed completion before timing out');
assert.ok(timerModule.includes('if (this.tickFreezeTimer()) return;'), 'timer tick must skip countdown while freeze is active');
assert.ok(timerModule.includes('this.stopFreezeSpineFx?.(true);'), 'freeze timer expiry must stop the freeze Spine effect');

const skillWand = read('assets/Scripts/Core/GameCtrlModules/GameplaySkillWandModule.ts');
assert.ok(skillWand.includes('this.pauseTimerForFinalSecondProp();'), 'wand/brush skill entries must not pause except in final-second prop window');
assert.ok(skillWand.includes('Number(FREEZE_PROP_SECONDS) || 90'), 'freeze skill fallback must remain 90 seconds');
assert.ok(skillWand.includes('this._freezeTimeLeft = freezeSeconds;'), 'freeze skill must set a freeze countdown duration');
assert.ok(skillWand.includes('this.playFreezeSpineFx?.();'), 'freeze skill must trigger the freeze Spine effect');

const skillMagnet = read('assets/Scripts/Core/GameCtrlModules/GameplaySkillMagnetModule.ts');
assert.ok(skillMagnet.includes('this.pauseTimerForFinalSecondProp();'), 'magnet skill entry must not pause except in final-second prop window');

const gameCtrlShared = read('assets/Scripts/Core/GameCtrlShared.ts');
assert.ok(gameCtrlShared.includes('const FREEZE_PROP_SECONDS = 90;'), 'freeze prop duration must remain 90 seconds');
const economyConfig = read('assets/Scripts/Core/EconomyConfig.ts');
assert.ok(economyConfig.includes('continueSeconds: 120,'), 'timeout revive rewarded ad must add 120 seconds');
const revivePanelPrefab = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/RevivePanelV2.prefab');
assert.ok(revivePanelPrefab.some((record) => record?.__type__ === 'cc.Label' && record._string === '获得120秒额外时间+扩展传送带'), 'timeout revive panel must display the confirmed time-and-capacity reward');

const slotUi = read('assets/Scripts/Core/GameplaySlotUiController.ts');
assert.ok(slotUi.includes('runtime.markDynamicCountdownAssisted?.();'), 'successful slot-row unlock must mark assisted run');
assert.ok(slotUi.includes('unlockSlotRow(): boolean'), 'slot-row unlock must report whether it actually changed slot state');
assert.ok(slotUi.includes('const beforeUnlockedRows'), 'slot-row unlock must snapshot state before applying a grant');
assert.ok(slotUi.includes('return didAdvance();'), 'slot-row unlock must return false when policy/state makes the grant a no-op');
assert.ok(slotUi.includes('const unlocked = this.unlockSlotRow();'), 'slot-row rewarded ad grant must inspect the actual unlock result');
assert.ok(slotUi.includes('if (!unlocked) return false;'), 'slot-row rewarded ad grant must fail when no row was unlocked');
assert.ok(slotUi.includes("runtime.pauseTimerForProp('slot-unlock-ad')"), 'slot-row ad wait must acquire an explicit timer owner');
assert.ok(slotUi.includes("runtime.resumeTimerForProp(timerToken || 'slot-unlock-ad')"), 'slot-row timer must release the exact ad interaction token');
assert.ok(!slotUi.includes('onAdComplete: () => runtime.resumeTimerForProp()'), 'slot-row timer must not resume before the rewarded grant runs');
const slotSkill = read('assets/Scripts/Core/GameCtrlModules/GameplaySlotSkillModule.ts');
assert.ok(slotSkill.includes('return ensurePchConveyorGameplayController(this).hasStoredBeans();'), 'slot-clear availability must read the active PCH conveyor occupancy');

const commerce = read('assets/Scripts/Core/Panels/CommercePanelController.ts');
assert.ok(commerce.includes('onAdGrant?: () => boolean | void | Promise<boolean | void>;'), 'tool acquire panel must allow gameplay to override ad grants');
assert.ok(commerce.includes('Promise.resolve(options.onAdGrant()).then((grantResult)'), 'rewarded ad grant must preserve async direct-use results');
assert.ok(commerce.includes('if (grantResult !== false)'), 'inventory changed callback must run only after a successful grant/use');
assert.ok(commerce.includes('if (options.onAdGrant)'), 'tool acquire panel must prefer the gameplay direct-use ad grant when supplied');
assert.ok(commerce.includes('this.runtime.addPropCount(kind, 1);'), 'non-gameplay tool acquire ads must keep the default inventory grant behavior');
assert.ok(commerce.includes("runtime.resumeTimerForProp?.(options.timerPauseToken || 'resource-acquire')"), 'tool acquire close paths must release the exact timer token');

const levelFlow = read('assets/Scripts/Core/GameCtrlModules/GameplayLevelFlowModule.ts');
assert.ok(levelFlow.includes('this.syncSkillButtonRuntimeStates?.();'), 'slot rendering must refresh slot-clear enabled/dim state');

const adRewardHint = read('assets/Scripts/Core/GameCtrlModules/GameplayAdRewardHintModule.ts');
assert.ok(adRewardHint.includes("import { isGameplaySkillUnlocked } from '../SlotOnboardingPolicy';"), 'ad reward hints must share the skill unlock policy');
assert.ok(adRewardHint.includes('function getActiveEntryMode(runtime: any): string'), 'ad reward hints must resolve entry mode before checking skill unlocks');
assert.ok(adRewardHint.includes('!isGameplaySkillUnlocked(getActiveLevel(this), getActiveEntryMode(this), SKILL_UNLOCK_FREEZE)'), 'freeze reward hint gate must be entry-aware');
assert.ok(!adRewardHint.includes('getActiveLevel(this) < SKILL_UNLOCK_FREEZE'), 'freeze reward hint must not use a raw mainline level gate');

const slotSkillModule = read('assets/Scripts/Core/GameCtrlModules/GameplaySlotSkillModule.ts');
assert.ok(slotSkillModule.includes('syncSkillButtonRuntimeStates()'), 'runtime module bridge must expose skill state sync');
assert.ok(slotSkillModule.includes('unlockSlotRow(): boolean'), 'runtime module bridge must preserve slot-row unlock result');
assert.ok(slotSkillModule.includes('tryUnlockSlotRow(): boolean'), 'runtime module bridge must preserve slot-row unlock request result');

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
