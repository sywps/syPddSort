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
const rainbowFrame = (name) => JSON.parse(
    read(`assets/BootstrapBundle/GameUI/RainbowConveyor/${name}.meta`),
).subMetas.f9941.uuid;
const near = (actual, expected) => Math.abs(actual - expected) < 1e-6;
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
    sceneChildren(bottomHud).map((node) => node._name),
    ['SkillArea'],
    'the conveyor must replace the old SlotAreaGroup instead of overlaying it',
);
assert.strictEqual(findSceneNode('SlotAreaGroup'), undefined, 'legacy SlotAreaGroup must be absent from Game.scene');
assert.ok(
    conveyorRoot?._active === true
        && sceneComponent(conveyorRoot, 'cc.UITransform')?._contentSize.width === 720
        && sceneComponent(conveyorRoot, 'cc.UITransform')?._contentSize.height === 1280
        && normalConveyor?._active === true
        && normalConveyor?._lpos.y === -355.636
        && normalConveyor?._lscale.x === 1
        && compactConveyor?._lpos.y === -365.169
        && compactConveyor?._lscale.x === 0.72,
    'Game.scene must own the conveyor root and both complete layout transforms',
);
const typeTwoParts = [
    ['BottomStraight', 686.94, 107, 3.47, -102, 'conveyor_4.png', 1],
    ['BottomLeftCorner', 96, 107, -388, -102, 'conveyor_3.png', 1],
    ['TopLeftCorner', 96, 107, -388, 101, 'conveyor_1.png', 1],
    ['LeftSide', 96, 96, -388, -0.5, 'conveyor_2.png', 1],
    ['BottomRightCorner', 96, 107, 395, -102, 'conveyor_3.png', -1],
    ['TopRightCorner', 96, 107, 395, 101, 'conveyor_1.png', -1],
    ['RightSide', 96, 96, 395, -0.5, 'conveyor_2.png', -1],
    ['TopStraight', 686.94, 107, 3.47, 101, 'conveyor_4.png', 1],
];
const typeThreeParts = [
    ['BottomStraight', 806, 107, -2, -161.58, 'conveyor_4.png', 1],
    ['BottomLeftCorner', 96, 107, -451.6, -161.58, 'conveyor_3.png', 1],
    ['LeftSide', 96, 212.4, -450.5, -2.28, 'conveyor_2.png', 1],
    ['TopLeftOuterCorner', 96, 107, -450.5, 156.42, 'conveyor_1.png', 1],
    ['TopLeftStraight', 85, 107, -362, 156.42, 'conveyor_4.png', 1],
    ['TopLeftInnerCorner', 96, 107, -281, 156.42, 'conveyor_1.png', -1],
    ['MiddleLeftInnerCorner', 97, 107, -281.6, 49.71, 'conveyor_5.png', 1],
    ['MiddleStraight', 451.9, 107, -7.1525, 49.6, 'conveyor_4.png', 1],
    ['MiddleRightInnerCorner', 97, 108.42, 267.3, 49.71, 'conveyor_5.png', -1],
    ['TopRightInnerCorner', 96, 107, 267, 156.42, 'conveyor_1.png', 1],
    ['TopRightStraight', 85, 107, 356, 156.42, 'conveyor_4.png', 1],
    ['TopRightOuterCorner', 96, 107, 446.3, 156.42, 'conveyor_1.png', -1],
    ['RightSide', 96, 212.4, 446.4, -2.28, 'conveyor_2.png', -1],
    ['BottomRightCorner', 96, 107, 447, -161.58, 'conveyor_3.png', -1],
];
const validateConveyorLayout = (layout, tableType) => {
    const parts = tableType === 2 ? typeTwoParts : typeThreeParts;
    const track = sceneChild(layout, 'PchMovingTrack');
    const carrierLayer = sceneChild(layout, 'CarrierLayer');
    const carrierTemplate = sceneChild(carrierLayer, 'PchCarrierTemplate');
    const direction = sceneChild(carrierTemplate, 'Direction');
    const carriers = sceneChildren(carrierLayer).filter((node) => /^PchCarrier-\d+$/.test(node._name));
    const tableEntry = sceneChild(layout, 'TableEntryItem');
    const entrance = sceneChild(layout, 'PchEntrance');
    const exit = sceneChild(layout, 'PchExit');
    const capacity = sceneChild(layout, 'PchCapacityBadge');
    const adButton = sceneChild(layout, 'PchCapacityAdButton');
    const entry = tableType === 2 ? [-219 * 0.6, -99 * 0.6] : [-327 * 0.6, -159 * 0.6];
    const tableEntryPosition = tableType === 2
        ? entry
        : [-488.20001220703125 * 0.6, -213.20001220703125 * 0.6];

    assert.deepStrictEqual(
        sceneChildren(layout).map((node) => node._name),
        ['PchMovingTrack', 'PchExit', 'TableEntryItem', 'CarrierLayer', 'PchEntrance', 'PchCapacityBadge', 'PchCapacityAdButton'],
        `table ${tableType} fixed hierarchy`,
    );
    assert.ok(
        sceneComponent(track, 'cc.UITransform')?._contentSize.width === 950
            && sceneComponent(track, 'cc.UITransform')?._contentSize.height === (tableType === 2 ? 310 : 436)
            && track?._lscale.x === 0.6
            && sceneComponent(track, 'cc.Sprite') === undefined,
        `table ${tableType} track root`,
    );
    assert.deepStrictEqual(sceneChildren(track).map((node) => node._name), parts.map((part) => part[0]));
    parts.forEach(([name, width, height, x, y, assetName, scaleX]) => {
        const part = sceneChild(track, name);
        const ui = sceneComponent(part, 'cc.UITransform');
        assert.ok(
            near(part?._lpos.x, x)
                && near(part?._lpos.y, y)
                && near(part?._lscale.x, scaleX)
                && ui?._contentSize.width === width
                && ui?._contentSize.height === height
                && sceneComponent(part, 'cc.Sprite')?._spriteFrame?.__uuid__ === rainbowFrame(assetName),
            `table ${tableType} ${name} source transform and frame`,
        );
    });
    assert.ok(
        carrierTemplate?._active === false
            && sceneComponent(direction, 'cc.Sprite')?._spriteFrame?.__uuid__ === rainbowFrame('conveyor_0.png'),
        `table ${tableType} serialized empty-carrier Direction`,
    );
    assert.deepStrictEqual(
        carriers.map((carrier) => carrier._name),
        Array.from({ length: 20 }, (_unused, index) => `PchCarrier-${index}`),
        `table ${tableType} authored initial carrier names`,
    );
    assert.ok(
        carriers.every((carrier) => carrier._active === true
            && sceneComponent(carrier, 'cc.UITransform')
            && sceneComponent(sceneChild(carrier, 'Direction'), 'cc.Sprite')?._spriteFrame?.__uuid__ === rainbowFrame('conveyor_0.png')),
        `table ${tableType} authored initial carrier arrows`,
    );
    const tableEntryNode = sceneChild(tableEntry, 'Node');
    const tableEntryPieces = sceneChild(tableEntry, 'Pieces');
    const leftEntryDoor = sceneChild(tableEntryPieces, 'L');
    const rightEntryDoor = sceneChild(tableEntryPieces, 'R');
    assert.ok(
        near(tableEntry?._lpos.x, tableEntryPosition[0])
            && near(tableEntry?._lpos.y, tableEntryPosition[1])
            && near(tableEntry?._lscale.x, 0.6)
            && sceneComponent(sceneChild(tableEntryNode, '1'), 'cc.Sprite')?._spriteFrame?.__uuid__ === rainbowFrame('exit_1.png')
            && sceneComponent(sceneChild(tableEntryNode, '2'), 'cc.Sprite')?._spriteFrame?.__uuid__ === rainbowFrame('exit_2.png')
            && sceneComponent(leftEntryDoor, 'cc.Sprite')?._spriteFrame?.__uuid__ === rainbowFrame('exit_1_3.png')
            && sceneComponent(leftEntryDoor, 'cc.UITransform')?._contentSize.width === 35
            && sceneComponent(leftEntryDoor, 'cc.UITransform')?._contentSize.height === 68
            && sceneComponent(rightEntryDoor, 'cc.Sprite')?._spriteFrame?.__uuid__ === rainbowFrame('exit_1_4.png')
            && sceneComponent(rightEntryDoor, 'cc.UITransform')?._contentSize.width === 35
            && sceneComponent(rightEntryDoor, 'cc.UITransform')?._contentSize.height === 68
            && sceneComponent(sceneChild(tableEntryPieces, 'Img'), 'cc.Sprite')?._spriteFrame?.__uuid__ === rainbowFrame('exit_1_2.png')
            && sceneChild(sceneChild(tableEntry, 'Root'), 'SphereNode'),
        `table ${tableType} full source TableEntryItem building`,
    );
    assert.ok(
        near(entrance?._lpos.x, entry[0])
            && near(entrance?._lpos.y, entry[1])
            && sceneChildren(entrance).map((node) => node._name).join(',') === 'EntryCount'
            && sceneComponent(sceneChild(entrance, 'EntryCount'), 'cc.Label'),
        `table ${tableType} source entrance`,
    );
    const arrow = sceneChild(exit, 'Arrow');
    const arrowSprites = ['Pos01', 'Pos02'].flatMap((positionName) => sceneChildren(sceneChild(arrow, positionName)));
    assert.ok(
        sceneComponent(sceneChild(exit, 'Visual'), 'cc.Sprite')?._spriteFrame?.__uuid__ === rainbowFrame('conveyor_7a.png')
            && arrowSprites.length === 4
            && arrowSprites.every((node) => sceneComponent(node, 'cc.Sprite')?._spriteFrame?.__uuid__ === rainbowFrame('conveyor_7b.png')),
        `table ${tableType} source bridge hierarchy`,
    );
    assert.ok(
        near(capacity?._lpos.x, entry[0])
            && near(capacity?._lpos.y, entry[1] - 22.26)
            && sceneComponent(sceneChild(capacity, 'CapacityCount'), 'cc.Label')?._string === '0/60',
        `table ${tableType} source capacity label`,
    );
    assert.ok(
        near(adButton?._lpos.x, entry[0] - 0.8600000143051147 * 0.6)
            && near(adButton?._lpos.y, entry[1] - 105 * 0.6)
            && near(adButton?._lscale.x, 0.9)
            && sceneComponent(adButton, 'cc.Button')
            && sceneComponent(sceneChild(adButton, 'Visual'), 'cc.Sprite')?._spriteFrame?.__uuid__ === rainbowFrame('wf_base_14.png')
            && sceneComponent(sceneChild(adButton, 'AdIcon'), 'cc.Sprite')?._spriteFrame?.__uuid__ === rainbowFrame('ADIcon.png')
            && sceneComponent(sceneChild(adButton, 'ExpandIcon'), 'cc.Sprite')?._spriteFrame?.__uuid__ === rainbowFrame('gameProp_2007.png')
            && sceneChildren(adButton).map((node) => node._name).join(',') === 'Visual,AdIcon,ExpandIcon',
        `table ${tableType} source expansion button`,
    );
};
validateConveyorLayout(normalConveyor, 2);
validateConveyorLayout(compactConveyor, 3);
assert.ok(
    sceneDescendants(conveyorRoot).every((node) => !sceneComponent(node, 'cc.Graphics')),
    'both conveyor layouts must provide complete fixed Sprite/Label/Button nodes without serialized Graphics fallbacks',
);
assert.ok(
    conveyor.includes('const PCH_ENTRY_DOOR_OPEN_WIDTH = 0;')
        && conveyor.includes('const PCH_ENTRY_DOOR_CLOSED_WIDTH = 35;')
        && conveyor.includes('const PCH_ENTRY_DOOR_HEIGHT = 68;')
        && conveyor.includes('const PCH_ENTRY_DOOR_TWEEN_SECONDS = 0.3;')
        && conveyor.includes('entryDoors: { left: leftDoor, right: rightDoor }')
        && conveyor.includes('this.activeEntryDoors = activeLayout.entryDoors;')
        && conveyor.includes("const nextState = open ? 'open' : 'closed';")
        && conveyor.includes('if (this.entryDoorState === nextState) return;')
        && conveyor.includes("easing: 'quadOut'")
        && conveyor.includes('this.syncTableEntryDoors(this.rules.entryCount > 0);')
        && conveyor.includes('this.resetTableEntryDoorAnimation();')
        && conveyor.includes('doors.left.setContentSize(width, PCH_ENTRY_DOOR_HEIGHT);')
        && conveyor.includes('doors.right.setContentSize(width, PCH_ENTRY_DOOR_HEIGHT);'),
    'TableEntryItem doors must bind scene nodes and reproduce the source open/close tween lifecycle',
);
assert.deepStrictEqual(
    sceneChildren(fixedRoot).map((node) => node._name),
    ['BackgroundLayer', 'BoardArea', 'BoardZoomControl', 'PchConveyorRoot', 'BottomHudGroup', 'TopBarGroup'],
    'Game.scene must own the complete gameplay fixed-root child order',
);
assert.ok(
    gameplayView.includes("this.getGameplayFixedGroup('PchConveyorRoot')")
        && !gameplayView.includes("this.getGameplayBottomHudChild('SlotAreaGroup')")
        && conveyor.includes("this.requireConveyorNode(fixedRoot, 'PchConveyorRoot'")
        && conveyor.includes('const normalLayout = this.bindConveyorLayout')
        && conveyor.includes('const compactLayout = this.bindConveyorLayout')
        && conveyor.includes('const availableCarriers = this.getOrderedConveyorCarriers(this.carrierLayer)')
        && conveyor.includes('let carrier = availableCarriers[carrierIndex]')
        && conveyor.includes('this.resetConveyorCarrier(carrier)')
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
    conveyor.includes('[-219, -99], [390, -96], [390, 104.2], [152, 104.2]')
        && conveyor.includes('[-327, -159], [447, -162], [447, 161], [263, 161], [264, 50]')
        && conveyor.includes('normalLayout.node.active = true;')
        && conveyor.includes('compactLayout.node.active = false;')
        && conveyor.includes('const activeLayout = normalLayout;')
        && conveyor.includes('this.prepareBeltPath(2);')
        && !conveyor.includes('useCompactLayout')
        && conveyor.includes('direction.active = stack.length === 0')
        && conveyor.includes('direction.angle = sample.angle')
        && normalConveyor?._lpos.y === -355.636
        && compactConveyor?._lpos.y === -365.169,
    'the scene-owned conveyor states must use the exact source paths, empty directions, and proven vertical layouts',
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
