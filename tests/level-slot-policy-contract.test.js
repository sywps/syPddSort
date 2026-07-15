const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    LEVEL_DATA_CLIENT_BUILD,
    LEVEL_DATA_SCHEMA_VERSION,
    validateSlotPolicy,
} = require('../scripts/slot-policy-contract');

const root = path.resolve(__dirname, '..');

function validateDirectory(relDir) {
    const absDir = path.join(root, relDir);
    const files = fs.readdirSync(absDir).filter((name) => /^(?:level_|zt_level_)\d+\.json$/.test(name));
    assert.ok(files.length > 0, `${relDir} must contain level data`);
    for (const name of files) {
        const data = JSON.parse(fs.readFileSync(path.join(absDir, name), 'utf8'));
        validateSlotPolicy(data, `${relDir}/${name}`);
    }
}

validateDirectory('assets/LevelData');
validateDirectory('assets/BootstrapBundle/LevelData');
validateDirectory('temp/levels_exp');

const slotPolicySource = fs.readFileSync(path.join(root, 'assets/Scripts/Core/SlotOnboardingPolicy.ts'), 'utf8');
assert.ok(slotPolicySource.includes("throw new Error('[SlotPolicy] missing required slotPolicy')"), 'runtime must fail on missing slotPolicy');
assert.ok(!slotPolicySource.includes('configuredUnlockedRows'), 'runtime must not retain the legacy row-count fallback');
assert.ok(!slotPolicySource.includes('let defaultRows = 1'), 'runtime must not derive mainline rows from level numbers');

const cdnService = fs.readFileSync(path.join(root, 'assets/Scripts/Core/LevelDataCdnService.ts'), 'utf8');
assert.ok(cdnService.includes('validateSlotPolicyConfig(entry.data.slotPolicy'), 'CDN pack parsing must validate slotPolicy before returning level data');
assert.ok(cdnService.includes('sessionExperimentAssignment'), 'level experiment assignment must stay stable for the full session');

const assetBootstrap = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts'), 'utf8');
assert.ok(!assetBootstrap.includes('_isReleaseLevelDataCdnOnly'), 'ordinary debug and release must share CDN failure semantics');
assert.ok(!assetBootstrap.includes('_loadLevelDataFromCdnOrLocal'), 'configured data-source selection must not be named as an error fallback');
assert.ok(assetBootstrap.includes('if (isExplicitLocalTestProfile())'), 'local levelData must require the explicit local-test profile');
assert.ok(assetBootstrap.includes('this._loadLevelDataFromLocalBundle(levelId, prefix, callback);'), 'local-test must load the generated local levelData bundle directly');

const remoteDataClient = fs.readFileSync(path.join(root, 'assets/Scripts/Core/RemoteDataCdnClient.ts'), 'utf8');
assert.ok(remoteDataClient.includes("get('profile')"), 'local-test selection must use an explicit profile query');
assert.ok(remoteDataClient.includes("=== 'local-test'"), 'only the local-test profile may select the local mirror');
assert.ok(remoteDataClient.includes('if (!isLocalBrowserPreview()) return false;'), 'local-test must be unavailable outside localhost browser preview');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build/level-data-cdn/level_live.json'), 'utf8'));
assert.strictEqual(manifest.schemaVersion, LEVEL_DATA_SCHEMA_VERSION, 'generated manifest schema must match the slot-policy contract');
assert.strictEqual(manifest.minClientBuild, LEVEL_DATA_CLIENT_BUILD, 'generated manifest client build must match the slot-policy contract');

console.log('level-slot-policy-contract.test.js passed');
