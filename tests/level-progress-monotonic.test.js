const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const assetBootstrap = read('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts');
const gameplaySession = read('assets/Scripts/Core/GameplaySessionController.ts');
const settlementHud = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');

assert.ok(
    assetBootstrap.includes("const s = sys.localStorage.getItem(LS_LEVEL);"),
    'saved level must be read from the canonical pdd.level key',
);
assert.ok(
    assetBootstrap.includes('const nextLevel = Math.max(currentLevel || 0, normalizedLevel);'),
    'recordMainlineLevelEntry must never lower an existing local pdd.level',
);
assert.ok(
    assetBootstrap.includes("sys.localStorage.setItem(LS_LEVEL, String(nextLevel));"),
    'recordMainlineLevelEntry must write the monotonic next level to pdd.level',
);
assert.ok(
    assetBootstrap.includes('const nextLevel = Math.max(currentLevel, normalizedLevel);'),
    'saveLevelProgress must keep the higher local level when a lower value is requested',
);
assert.ok(
    assetBootstrap.includes("sys.localStorage.setItem(LS_LEVEL, '' + nextLevel);"),
    'saveLevelProgress must persist the monotonic level',
);
assert.ok(
    assetBootstrap.includes('const effectiveLevel = Math.max(localSavedLevel, cloudSavedLevel);'),
    'cloud restore must merge pdd.level with cloud savedLevel by max, not overwrite local high progress',
);
assert.ok(
    gameplaySession.includes('runtime.recordMainlineLevelEntry(activeLogicalLevelId);'),
    'main gameplay ready must record the active logical level without lowering existing progress',
);
assert.ok(
    settlementHud.includes('this.saveLevelProgress(logicalLevelId + 1);'),
    'win settlement must advance pdd.level to the next mainline level',
);

console.log('level-progress-monotonic.test.js passed');
