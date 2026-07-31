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

const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const levelFlow = read('assets/Scripts/Core/GameCtrlModules/GameplayLevelFlowModule.ts');
const assetBootstrap = read('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts');
const sceneHomeEntry = read('assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts');
const remoteClient = read('assets/Scripts/Core/RemoteDataCdnClient.ts');
const shared = read('assets/Scripts/Core/GameCtrlShared.ts');
const levelBundleMeta = readJson('assets/LevelData.meta');
const level2 = readJson('assets/LevelData/level_2.json');
const level2Meta = readJson('assets/LevelData/level_2.json.meta');

assert.ok(
    settlement.includes('if (this.shouldChainTutorialLevelsOnWin())')
        && settlement.includes('this.continueTutorialToSlotIntro(this.levelData.levelId + 1);'),
    'level-1 settlement primary action must route to the next physical level',
);
assert.ok(
    settlement.includes('return !this._isThemeLevel && this.levelData?.levelId === 1;'),
    'only mainline level 1 should use the tutorial transition chain',
);
assert.ok(
    settlement.includes('this.scheduleOnce(() => {\n                this.loadLevel(nextId);\n            }, 0.08);'),
    'level-1 transition must invoke the shared loadLevel entrypoint',
);
assert.ok(
    levelFlow.includes('this._loadLevelDataFromConfiguredSource(levelId, prefix, (levelData, source, err) => {'),
    'loadLevel must resolve level JSON through the configured data-source entrypoint',
);
assert.ok(
    assetBootstrap.includes('if (shouldUseLocalLevelDataMirror())')
        && assetBootstrap.includes('this._loadLevelDataFromLocalBundle(levelId, prefix, callback);'),
    'ordinary localhost must select the local level-data bundle',
);
assert.ok(
    assetBootstrap.includes('assetManager.loadBundle(LEVEL_DATA_BUNDLE_NAME')
        && assetBootstrap.includes('bundle.load(bundlePath, JsonAsset'),
    'local level-data loading must resolve level_2 through the Cocos bundle',
);
assert.ok(
    remoteClient.includes('return !isMiniGameRuntime() && isLocalBrowserPreview() && !isLocalBrowserCdnOptIn();'),
    'localhost must remain local unless use_cdn=true, while mini-game runtimes stay CDN-only',
);
assert.ok(
    sceneHomeEntry.includes("return shouldUseLocalLevelDataMirror() ? 'local' : 'remote';")
        && (sceneHomeEntry.match(/getConfiguredLevelDataWatchdogSource\(\)/g) || []).length >= 4,
    'configured level routes must classify localhost mirror timeouts as local instead of remote',
);
assert.ok(
    shared.includes('const LOCAL_BOOTSTRAP_LEVEL_IDS = new Set<number>([1]);'),
    'bootstrap must contain only level 1 so the 1-to-2 test crosses the real levelData bundle boundary',
);
assert.strictEqual(levelBundleMeta.userData?.isBundle, true, 'assets/LevelData must remain a Cocos bundle');
assert.strictEqual(levelBundleMeta.userData?.bundleName, 'levelData', 'local mirror bundle name must remain levelData');
assert.strictEqual(level2.levelId, 2, 'local level_2.json must declare physical level 2');
assert.deepStrictEqual(
    [level2.boardWidth, level2.boardHeight, level2.timeLimit, level2.slotTotalCount],
    [12, 12, 600, 96],
    'level 1 settlement must enter the historical no-guide payload as logical level 2',
);
assert.deepStrictEqual(level2.slotPolicy, {
    defaultRows: 1,
    freeUnlockRows: 0,
    adUnlockRows: 1,
}, 'local level 2 must start with one row and expose one optional rewarded unlock row');
assert.match(level2Meta.uuid, /^[0-9a-f-]{36}$/i, 'local level 2 must keep a valid Cocos asset UUID');

console.log('local-level-1-to-2-transition.test.js passed');
