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
const topHud = read('assets/Scripts/Core/GameCtrlModules/TopHudModule.ts');
const conveyor = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const skillUi = read('assets/Scripts/Core/GameplaySkillUiController.ts');
const gameScene = JSON.parse(read('assets/BootstrapBundle/Scenes/Game.scene'));

assert.ok(slotUi.includes('const MAINLINE_SCENE_BASE_ROW_COUNT = 2'), 'mainline scene baseline must be independent of the first active level');
assert.ok(!slotUi.includes('_slotAreaSceneBaseRowCount = Math.max(1, Math.floor(Number(runtime.slotRowCount) || 1))'), 'scene baseline must not be sampled from runtime slotRowCount');
assert.ok(slotUi.includes('return Math.max(MAINLINE_SCENE_BASE_ROW_COUNT, sceneRows)'), 'scene baseline resolution must preserve the two-row Cocos layout');
assert.ok(slotUi.includes('slotAreaWidget.updateAlignment?.()'), 'slot area height changes must be realigned by the scene-owned Widget');
assert.ok(cloudRestore.includes('runtime.loadLevel(restoredLevel)'), 'regression scenario must cover same-runtime late cloud level restore');

const slotArea = gameScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'SlotArea');
const slotAreaIndex = gameScene.indexOf(slotArea);
const slotAreaWidget = gameScene.find((entry) => entry && entry.__type__ === 'cc.Widget' && entry.node?.__id__ === slotAreaIndex);
assert.ok(slotAreaWidget && (slotAreaWidget._alignFlags & 4) !== 0, 'SlotArea must keep its Cocos-owned bottom Widget anchor');

assert.ok(session.indexOf('runtime._activeGameplayGuideLayoutMode = tutorialMode') < session.indexOf('runtime.buildUI()'), 'guide layout mode must be resolved before board fitting');
assert.ok(boardInput.includes('getSlotIntroGuideBand'), 'level 3 must reserve a top guide band');
assert.ok(gameplayView.includes('this.fitBoardViewportToSafeRect(bw, bh, padding)'), 'initial board fit must consume the guide-aware safe viewport');
assert.ok(gameplayView.includes('levelId === 2 ? 1.025'), 'level 2 must start at exactly 1.25x its former 0.82 fitted scale');
assert.ok(
    topHud.includes('iconState.__topHudBaseScale.x,')
        && topHud.includes('iconState.__topHudBaseScale.y,'),
    'gameplay settings visual must retain its prefab-authored 82-unit visible size',
);
assert.ok(
    topHud.includes('settingsIcon.setScale(')
        && !topHud.includes('settingsBtn.setScale('),
    'settings visual sizing must not change its button root touch area',
);
assert.ok(
    conveyor.includes('handleScaledSettingsButtonTap(rawPos, uiPos, event)')
        && conveyor.includes("getChildByName('TopHud')?.getChildByName('SettingsButton')")
        && conveyor.includes('this.runtime.openSettingsPanel?.()'),
    'compact gameplay settings must retain a normalized scaled-preview hit path',
);
assert.ok(
    gameplayView.match(/timerWrap\.setScale\(GAMEPLAY_TIMER_SCALE, GAMEPLAY_TIMER_SCALE, 1\)/g)?.length === 2,
    'both gameplay top-bar paths must compact the complete timer region',
);
assert.ok(
    gameplayView.includes('const GAMEPLAY_LEVEL_TITLE_FONT_SIZE = 24')
        && gameplayView.includes('const GAMEPLAY_LEVEL_TITLE_CENTER_Y = 660')
        && gameplayView.includes('const GAMEPLAY_TIMER_CENTER_Y = 608')
        && gameplayView.includes('widget.enabled = false')
        && gameplayView.includes('applyGameplayLevelTitleLayout(node, label)')
        && gameplayView.includes('const widthFitRatio = 0.985')
        && gameplayView.includes('const heightFitRatio = 0.985'),
    'the compact title and larger board fit must share the gameplay layout path',
);
assert.ok(
    topHud.includes('const GAMEPLAY_SETTINGS_CENTER_Y = 591.564')
        && topHud.includes('settingsWidget.enabled = false')
        && topHud.includes('settingsBtn.setPosition(settingsBtn.position.x, GAMEPLAY_SETTINGS_CENTER_Y'),
    'the settings and speed controls must move upward together in gameplay',
);
assert.ok(
    conveyor.includes('const PCH_SPEED_BUTTON_FALLBACK_SIZE = 85')
        && conveyor.includes('settingsButton?.getComponent(UITransform)?.contentSize.width')
        && conveyor.includes('const PCH_TOP_BUTTON_GAP = 24'),
    'the PCH speed control must match the settings button size and retain a visible gap',
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
        && conveyor.includes("this.makeNode('PchEntrance', this.belt, 72, 88, -230, -102)"),
    'the compact conveyor must use the wider symmetric path and keep its entrance aligned',
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
