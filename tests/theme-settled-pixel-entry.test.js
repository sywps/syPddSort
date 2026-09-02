const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const homeScene = JSON.parse(read('assets/HomeAssetsBundle/Scenes/Home.scene'));
const homeCommerce = read('assets/Scripts/Core/GameCtrlModules/HomeCommerceModule.ts');
const conveyor = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const gameplaySession = read('assets/Scripts/Core/GameplaySessionController.ts');
const sceneHomeEntry = read('assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts');
const themeFlow = read('assets/Scripts/Core/GameCtrlModules/ThemePanelFlowModule.ts');
const themePanel = read('assets/Scripts/Core/Panels/ThemePanelController.ts');
const themeLoading = read('assets/Scripts/Core/GameCtrlModules/ThemeLoadingOverlayModule.ts');
const playerMeta = read('assets/Scripts/Core/GameCtrlModules/PlayerMetaStateModule.ts');
const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const assetBootstrap = read('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts');
const collectionPanel = read('assets/Scripts/Core/Panels/CollectionPanelController.ts');
const collectionAvatar = read('assets/Scripts/Core/GameCtrlModules/CollectionAvatarModule.ts');
const themeConfig = JSON.parse(read('assets/GameAssetsBundle/themes.json'));

const themeButton = homeScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'ThemeBtn');
const startButton = homeScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'StartBtn');
const leaderboardButton = homeScene.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'LeaderboardBtn');
const componentOfType = (node, type) => (node._components || [])
    .map((reference) => homeScene[reference.__id__])
    .find((component) => component && component.__type__ === type);
assert.ok(themeButton, 'Home.scene must retain the authored ThemeBtn');
assert.ok(startButton, 'Home.scene must retain the authored StartBtn');
assert.ok(leaderboardButton, 'Home.scene must retain the authored LeaderboardBtn');
assert.strictEqual(themeButton._active, true, 'Home.scene must restore the theme challenge button');
const startWidget = componentOfType(startButton, 'cc.Widget');
const themeWidget = componentOfType(themeButton, 'cc.Widget');
const startTransform = componentOfType(startButton, 'cc.UITransform');
const themeTransform = componentOfType(themeButton, 'cc.UITransform');
assert.ok(startWidget?._enabled && themeWidget?._enabled, 'both home action buttons must retain their widgets');
const widgetCenterY = (widget, transform) => -640 + widget._bottom + transform._contentSize.height / 2;
const startRuntimeY = widgetCenterY(startWidget, startTransform);
const themeRuntimeY = widgetCenterY(themeWidget, themeTransform);
assert.ok(
    themeRuntimeY >= leaderboardButton._lpos.y,
    'the pixel puzzle button must not sit lower than the leaderboard button',
);
assert.ok(
    Math.abs(startRuntimeY - themeRuntimeY) >= (startTransform._contentSize.height + themeTransform._contentSize.height) / 2,
    'widget-resolved pixel puzzle and mainline buttons must not overlap vertically',
);
assert.ok(
    homeCommerce.includes('const HOME_START_BUTTON_BOTTOM = 295;')
        && homeCommerce.includes('const HOME_PIXEL_PUZZLE_BUTTON_BOTTOM = 135;')
        && homeCommerce.includes("const btn = this.requireUiChild(parent, 'StartBtn', 'PrimaryActionLayer/StartBtn');\n            btn.active = true;")
        && homeCommerce.includes("alignHomePrimaryButton(btn, HOME_START_BUTTON_BOTTOM, 'PrimaryActionLayer/StartBtn');")
        && homeCommerce.includes("alignHomePrimaryButton(btn, HOME_PIXEL_PUZZLE_BUTTON_BOTTOM, 'PrimaryActionLayer/ThemeBtn');")
        && homeCommerce.includes('widget.updateAlignment();'),
    'home rebuilds must apply the non-overlapping widget constraints at runtime',
);
assert.ok(
    homeCommerce.includes("const btn = this.requireUiChild(parent, 'ThemeBtn', 'PrimaryActionLayer/ThemeBtn');\n            btn.active = true;"),
    'home runtime must keep ThemeBtn visible after rebuilding the menu',
);
assert.ok(
    homeCommerce.includes("titleLabel.string = '像素拼图';")
        && themePanel.includes("title: '像素拼图'"),
    'the restored mode must use the Pixel Puzzle player-facing name',
);
assert.ok(
    homeCommerce.includes('this.loadThemeConfig(() => this.startThemeLevel(this.getThemeDirectPlayLevelId()));'),
    'the pixel puzzle button must start the first incomplete theme level directly',
);
assert.ok(
    themeLoading.includes("if (!this.costVigorForLevel(normalizedLevelId, 'theme'))")
        && themeLoading.includes("source: 'theme_start'")
        && themeLoading.includes('this.startThemeLevel(normalizedLevelId, options);')
        && playerMeta.includes("'theme_start'"),
    'every pixel puzzle level start must spend vigor or open the existing recovery flow',
);
assert.ok(
    gameplaySession.includes("gameplayEntryMode = runtime._currentExternalLevelFilePath\n                ? (runtime._isThemeLevel ? 'theme' : 'external')\n                : (runtime._isThemeLevel ? 'theme' : 'main');")
        && gameplaySession.includes('runtime._activeGameplayEntryMode = gameplayEntryMode;'),
    'external zt_level files must establish theme mode before PCH starts',
);
assert.ok(
    sceneHomeEntry.includes("if (prefix === 'zt_level_') return 'theme';")
        && sceneHomeEntry.includes("if (external) return 'external';"),
    'external zt_level requests must retain pixel-puzzle session routing',
);
assert.ok(
    conveyor.includes("this.runtime._activeGameplayEntryMode === 'theme'"),
    'settled pixel blocks must be enabled only for theme challenge gameplay',
);
assert.ok(
    themeFlow.includes('return true;')
        && themeFlow.includes('return this.getThemeLevelOrder().length;')
        && themeFlow.includes('return ordered.find((levelId) => !completed.has(levelId)) || ordered[0];')
        && themeFlow.includes('return index >= 0 ? index + 1 : 1;')
        && themeFlow.includes('levelNames: group.levelIds.map(() => `第${++displayNumber}关`)'),
    'all pixel puzzle levels must be open and use continuous player-facing numbering',
);
assert.ok(
    settlement.includes('const nextThemeLevelId = this.getNextThemeLevelId(currentThemeLevelId);')
        && settlement.includes('this.startThemeLevel(nextThemeLevelId);')
        && !settlement.includes('syncPixelPuzzleUnlockHint'),
    'theme completion must continue to the next theme level without obsolete unlock prompts',
);
assert.ok(
    assetBootstrap.includes("merged.push({ levelId, prefix: 'zt_level_', unlockLevel: 1 });"),
    'the collection catalog must append every theme level as an unlocked entry',
);
assert.ok(
    themeFlow.includes("prefix === 'zt_level_' ? this.getThemeLevelDisplayNumber(levelId) : levelId"),
    'theme collection detail titles must use the continuous display number instead of internal IDs',
);
assert.ok(
    collectionPanel.includes("{ key: 'main', text: '主线' }")
        && collectionPanel.includes("{ key: 'theme', text: '像素拼图' }")
        && collectionAvatar.includes("entry.prefix === 'zt_level_'")
        && collectionAvatar.includes("entry.prefix !== 'zt_level_'"),
    'the collection must expose separate mainline and pixel-puzzle tabs',
);
const configuredThemeIds = themeConfig.groups.flatMap((group) => group.levelIds).sort((a, b) => a - b);
const themeFileIds = fs.readdirSync(path.join(root, 'assets/LevelData'))
    .map((name) => name.match(/^zt_level_(\d+)\.json$/))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
assert.ok(configuredThemeIds.every((levelId) => themeFileIds.includes(levelId)), 'every configured theme level must have an authored file');
assert.deepStrictEqual(themeFileIds, Array.from({ length: 205 }, (_, index) => index + 1), 'theme filenames must run continuously from 1 to 205');
for (const levelId of themeFileIds) {
    const level = JSON.parse(read(`assets/LevelData/zt_level_${levelId}.json`));
    assert.strictEqual(level.levelId, levelId, `zt_level_${levelId}.json must use the matching internal levelId`);
    if (level.fileName) assert.strictEqual(level.fileName, `zt_level_${levelId}.json`, `zt_level_${levelId}.json must use the matching embedded filename`);
    assert.ok(fs.existsSync(path.join(root, `assets/LevelData/zt_level_${levelId}.json.meta`)), `zt_level_${levelId}.json.meta must exist`);
}

console.log('theme-settled-pixel-entry.test.js passed');
