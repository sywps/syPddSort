const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

const slotUi = read('assets/Scripts/Core/GameplaySlotUiController.ts');
const session = read('assets/Scripts/Core/GameplaySessionController.ts');
const cloudRestore = read('assets/Scripts/Core/GameCtrlModules/StartupCloudRestoreHelper.ts');
const boardInput = read('assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts');
const gameplayView = read('assets/Scripts/Core/GameplayViewController.ts');
const gameRuntime = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const conveyor = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const skillUi = read('assets/Scripts/Core/GameplaySkillUiController.ts');
const gameScene = JSON.parse(read('assets/BootstrapBundle/Scenes/Game.scene'));
const findSceneNode = (name) => gameScene.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === name);
const sceneComponent = (node, type) => (node?._components || [])
    .map((ref) => gameScene[ref.__id__])
    .find((entry) => entry?.__type__ === type);
const sceneChild = (node, name) => (node?._children || [])
    .map((ref) => gameScene[ref.__id__])
    .find((entry) => entry?.__type__ === 'cc.Node' && entry._name === name);
const sceneChildren = (node) => (node?._children || [])
    .map((ref) => gameScene[ref.__id__])
    .filter((entry) => entry?.__type__ === 'cc.Node');
const sceneDescendants = (rootNode) => {
    const descendants = [];
    const queue = rootNode ? [rootNode] : [];
    while (queue.length > 0) {
        const node = queue.shift();
        descendants.push(node);
        queue.push(...sceneChildren(node));
    }
    return descendants;
};

assert.ok(slotUi.includes('const MAINLINE_SCENE_BASE_ROW_COUNT = 2'), 'mainline scene baseline must be independent of the first active level');
assert.ok(!slotUi.includes('_slotAreaSceneBaseRowCount = Math.max(1, Math.floor(Number(runtime.slotRowCount) || 1))'), 'scene baseline must not be sampled from runtime slotRowCount');
assert.ok(slotUi.includes('return Math.max(MAINLINE_SCENE_BASE_ROW_COUNT, sceneRows)'), 'scene baseline resolution must preserve the two-row Cocos layout');
assert.ok(slotUi.includes('slotAreaWidget.updateAlignment?.()'), 'slot area height changes must be realigned by the scene-owned Widget');
assert.ok(cloudRestore.includes('runtime.loadLevel(restoredLevel)'), 'regression scenario must cover same-runtime late cloud level restore');

assert.ok(session.indexOf('runtime._activeGameplayGuideLayoutMode = tutorialMode') < session.indexOf('runtime.buildUI()'), 'guide layout mode must be resolved before board fitting');
assert.ok(boardInput.includes('getSlotIntroGuideBand'), 'level 3 must reserve a top guide band');
assert.ok(gameplayView.includes('this.fitBoardViewportToSafeRect(bw, bh, padding)'), 'initial board fit must consume the guide-aware safe viewport');
assert.ok(gameplayView.includes('levelId === 2 ? 1.025'), 'level 2 must start at exactly 1.25x its former 0.82 fitted scale');

const fixedRoot = findSceneNode('GameplayFixedRoot');
const conveyorRoot = sceneChild(fixedRoot, 'PchConveyorRoot');
const normalConveyor = sceneChild(conveyorRoot, 'NormalLayout');
const compactConveyor = sceneChild(conveyorRoot, 'CompactLayout');
const bottomHud = sceneChild(fixedRoot, 'BottomHudGroup');
const topBar = findSceneNode('TopBarGroup');
const settings = sceneChild(topBar, 'Settings');
const settingsIcon = sceneChild(settings, 'SettingsIcon');
const timerWrap = sceneChild(topBar, 'TimerWrap');
const timerLabelNode = sceneChild(timerWrap, 'Timer');
const normalTitle = sceneChild(topBar, 'LevelTitle');
const level1Title = sceneChild(topBar, 'LevelTitleLevel1');
const speedButton = sceneChild(topBar, 'PchSpeedButton');
const topChildNames = topBar._children.map((ref) => gameScene[ref.__id__]?._name);
const settingsBindStart = gameRuntime.indexOf('private bindEarlyGameSettingsButton()');
const settingsBindEnd = gameRuntime.indexOf('private bindExistingGameLoadingOverlay(', settingsBindStart);
const settingsBind = gameRuntime.slice(settingsBindStart, settingsBindEnd);

assert.deepStrictEqual(
    sceneChildren(fixedRoot).map((node) => node._name),
    ['BackgroundLayer', 'BoardArea', 'BoardZoomControl', 'PchConveyorRoot', 'BottomHudGroup', 'TopBarGroup'],
    'Game.scene must own the complete gameplay fixed-root child order',
);
assert.deepStrictEqual(
    sceneChildren(bottomHud).map((node) => node._name),
    ['SkillArea'],
    'the conveyor must replace the old SlotAreaGroup instead of overlaying it',
);
assert.strictEqual(findSceneNode('SlotAreaGroup'), undefined, 'legacy SlotAreaGroup must be absent from Game.scene');
assert.ok(
    conveyorRoot?._active === false
        && sceneComponent(conveyorRoot, 'cc.UITransform')?._contentSize.width === 720
        && sceneComponent(conveyorRoot, 'cc.UITransform')?._contentSize.height === 1280
        && normalConveyor?._lpos.y === -415
        && normalConveyor?._lscale.x === 1
        && compactConveyor?._lpos.y === -382
        && compactConveyor?._lscale.x === 0.72,
    'Game.scene must own the conveyor root and both complete layout transforms',
);
const validateConveyorLayout = (layout) => {
    const track = sceneChild(layout, 'PchMovingTrack');
    const carrierLayer = sceneChild(layout, 'CarrierLayer');
    const carrierTemplate = sceneChild(carrierLayer, 'PchCarrierTemplate');
    const groove = sceneChild(carrierTemplate, 'Groove');
    const entrance = sceneChild(layout, 'PchEntrance');
    const exit = sceneChild(layout, 'PchExit');
    const capacity = sceneChild(layout, 'PchCapacityBadge');
    const adButton = sceneChild(layout, 'PchCapacityAdButton');
    return sceneChildren(layout).map((node) => node._name).join(',')
            === 'PchMovingTrack,CarrierLayer,PchEntrance,PchExit,PchCapacityBadge,PchCapacityAdButton'
        && sceneComponent(track, 'cc.UITransform')?._contentSize.width === 688
        && sceneComponent(track, 'cc.Sprite')?._spriteFrame
        && carrierTemplate?._active === false
        && sceneComponent(groove, 'cc.Sprite')?._spriteFrame
        && entrance?._lpos.x === -230
        && entrance?._lpos.y === -102
        && sceneComponent(sceneChild(entrance, 'Visual'), 'cc.Sprite')?._spriteFrame
        && sceneComponent(sceneChild(entrance, 'EntryCount'), 'cc.Label')
        && exit?._lpos.y === 98
        && sceneComponent(sceneChild(exit, 'Visual'), 'cc.Sprite')?._spriteFrame
        && capacity?._lpos.x === -70
        && capacity?._lpos.y === -30
        && sceneComponent(sceneChild(capacity, 'CapacityCount'), 'cc.Label')?._string === '0 / 60'
        && adButton?._lpos.x === 72
        && adButton?._lpos.y === -30
        && sceneComponent(adButton, 'cc.Button')
        && sceneComponent(sceneChild(adButton, 'AdLabel'), 'cc.Label')?._string === 'AD'
        && sceneComponent(sceneChild(adButton, 'ExpandLabel'), 'cc.Label')?._string === '+12'
        && sceneComponent(sceneChild(adButton, 'ExpandArrow'), 'cc.Label')?._string === '≫';
};
assert.ok(
    validateConveyorLayout(normalConveyor)
        && validateConveyorLayout(compactConveyor)
        && sceneDescendants(conveyorRoot).every((node) => !sceneComponent(node, 'cc.Graphics')),
    'both conveyor layouts must provide complete fixed Sprite/Label/Button nodes without serialized Graphics fallbacks',
);
assert.ok(
    gameplayView.includes("this.getGameplayFixedGroup('PchConveyorRoot')")
        && !gameplayView.includes("this.getGameplayBottomHudChild('SlotAreaGroup')")
        && conveyor.includes("this.requireConveyorNode(fixedRoot, 'PchConveyorRoot'")
        && conveyor.includes('const normalLayout = this.bindConveyorLayout')
        && conveyor.includes('const compactLayout = this.bindConveyorLayout')
        && conveyor.includes('instantiate(this.carrierTemplate!)')
        && !conveyor.includes('drawConveyorTrack')
        && !conveyor.includes('PCH_BELT_DEFAULT_Y')
        && !conveyor.includes("this.makeNode('PchMovingTrack'")
        && !conveyor.includes("this.makeNode('PchEntrance'")
        && !conveyor.includes("getGameplayBottomHudChild('SlotAreaGroup')"),
    'runtime must bind scene-owned conveyor states and only clone the authored carrier template',
);

assert.deepStrictEqual(
    topChildNames,
    ['Settings', 'TimerWrap', 'LevelTitle', 'LevelTitleLevel1', 'PchSpeedButton'],
    'Game.scene must own the complete top-bar child order',
);
assert.strictEqual(
    fixedRoot._children.at(-1)?.__id__,
    gameScene.indexOf(topBar),
    'Game.scene must own the final TopBarGroup sibling order',
);
assert.ok(
    settings?._lpos.y === 591.564
        && sceneComponent(settings, 'cc.UITransform')?._contentSize.width === 85
        && sceneComponent(settings, 'cc.Widget')?._enabled === false
        && sceneComponent(settings, 'cc.Button')
        && settingsIcon?._lscale.x === 2.413
        && sceneComponent(settingsIcon, 'cc.Sprite')?._spriteFrame,
    'Game.scene must own the settings position, touch area, Button, and local icon visual',
);
assert.ok(
    settingsBindStart >= 0
        && settingsBind.includes("requireUiChild(topBar, 'Settings', 'TopBarGroup/Settings')")
        && settingsBind.includes('const button = settingsButton.getComponent(Button);')
        && !settingsBind.includes('syncTopHud')
        && !settingsBind.includes('addComponent(Button)'),
    'Game startup must bind the required scene Settings Button without prefab mounting or fallback creation',
);
assert.ok(
    conveyor.includes('handleScaledSettingsButtonTap(rawPos, uiPos, event)')
        && conveyor.includes("topBar?.getChildByName('Settings')")
        && !conveyor.includes("getChildByName('TopHud')?.getChildByName('SettingsButton')")
        && conveyor.includes('this.runtime.openSettingsPanel?.()'),
    'compact gameplay settings must retain a normalized scaled-preview hit path',
);
assert.ok(
    timerWrap?._lpos.y === 608
        && timerWrap?._lscale.x === 0.82
        && timerWrap?._lscale.y === 0.82
        && sceneComponent(timerWrap, 'cc.Widget')?._enabled === false
        && sceneComponent(timerLabelNode, 'cc.Label')?._enableWrapText === false
        && !gameplayView.includes('timerWrap.setPosition(')
        && !gameplayView.includes('timerWrap.setScale('),
    'Game.scene must own the complete timer layout while code only updates text and visibility',
);
assert.ok(
    [normalTitle, level1Title].every((title) => {
        const labelNode = sceneChild(title, 'Label');
        const titleUi = sceneComponent(title, 'cc.UITransform');
        const labelUi = sceneComponent(labelNode, 'cc.UITransform');
        const label = sceneComponent(labelNode, 'cc.Label');
        return title?._lpos.y === 660
            && title?._lscale.x === 1
            && titleUi?._contentSize.width === 180
            && titleUi?._contentSize.height === 38
            && labelUi?._contentSize.width === 180
            && labelUi?._contentSize.height === 38
            && label?._fontSize === 24
            && label?._lineHeight === 30
            && sceneComponent(title, 'cc.Widget')?._enabled === false;
    })
        && !gameplayView.includes('applyGameplayLevelTitleLayout')
        && !gameplayView.includes('GAMEPLAY_LEVEL_TITLE_')
        && gameplayView.includes('const widthFitRatio = 0.985')
        && gameplayView.includes('const heightFitRatio = 0.985'),
    'Game.scene must own both title variants while the larger board fit remains unchanged',
);
assert.ok(
    !gameplayView.includes("syncTopHud(root, 'game')")
        && !gameRuntime.includes("syncTopHud(topBar, 'game')")
        && !gameplayView.includes('topBarRoot.setSiblingIndex('),
    'Game runtime must not mount or reorder the scene-owned top hierarchy',
);
assert.ok(
    speedButton?._lpos.x === -182.216
        && speedButton?._lpos.y === settings?._lpos.y
        && sceneComponent(speedButton, 'cc.UITransform')?._contentSize.width === 85
        && !conveyor.includes('PCH_SPEED_BUTTON_FALLBACK_SIZE')
        && !conveyor.includes('PCH_TOP_BUTTON_GAP')
        && !conveyor.includes("this.makeNode('PchSpeedButton'"),
    'Game.scene must own the speed size and visible gap with no runtime layout fallback',
);
assert.ok(
    !conveyor.includes('本关两倍速可用')
        && !conveyor.includes('本关可使用两倍速道具')
        && !conveyor.includes('PchSpeedLevelHint')
        && !conveyor.includes('PchSpeedButtonHint'),
    'the speed control must not render level-specific availability text',
);
assert.ok(
    conveyor.includes('new Vec3(300, 86)')
        && conveyor.includes('new Vec3(-300, -78)')
        && normalConveyor?._lpos.y === -415
        && compactConveyor?._lpos.y === -382,
    'the scene-owned conveyor states must retain the wider symmetric path and proven vertical layouts',
);
assert.ok(
    skillUi.includes('COMPACT_SKILL_SCALE = 0.72')
        && skillUi.includes('COMPACT_SKILL_CENTER_Y = -575')
        && skillUi.includes('COMPACT_SKILL_SPACING_X = 150')
        && skillUi.includes('COMPACT_SKILL_BADGE_Y = 30'),
    'the three bottom props must use the smaller compact layout with extra conveyor clearance',
);
assert.ok(
    skillUi.includes('(i - (skills.length - 1) / 2) * GameplaySkillUiController.COMPACT_SKILL_SPACING_X'),
    'the compact prop buttons must stay evenly centered with clear horizontal spacing',
);
assert.match(
    skillUi,
    /const shellWidget = shell\.getComponent\(Widget\);[\s\S]*?shellWidget\.enabled = false;[\s\S]*?shell\.setPosition\(/,
    'skill button widgets should be disabled before applying compact runtime positions',
);
assert.ok(
    skillUi.includes("for (const badgeName of ['AdPlayIcon', 'CountBadge'])")
        && skillUi.includes('GameplaySkillUiController.COMPACT_SKILL_BADGE_Y'),
    'the prop badges must sit lower so they no longer crowd the conveyor edge',
);

console.log('gameplay-layout-parity.test.js passed');
