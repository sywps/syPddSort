const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    LEVEL_DATA_CLIENT_BUILD,
    LEVEL_DATA_CONTRACT,
    LEVEL_DATA_SCHEMA_VERSION,
    validateSlotPolicy,
} = require('../scripts/slot-policy-contract');

const root = path.resolve(__dirname, '..');

function loadLevelDataContract(contract) {
    const modulePath = require.resolve('../scripts/slot-policy-contract');
    const previous = process.env.PDD_LEVEL_DATA_CONTRACT;
    process.env.PDD_LEVEL_DATA_CONTRACT = contract;
    delete require.cache[modulePath];
    try {
        return require(modulePath);
    } finally {
        if (previous === undefined) delete process.env.PDD_LEVEL_DATA_CONTRACT;
        else process.env.PDD_LEVEL_DATA_CONTRACT = previous;
        delete require.cache[modulePath];
    }
}

assert.strictEqual(LEVEL_DATA_CONTRACT, 'v2', 'default CDN contract must remain v2');
assert.strictEqual(LEVEL_DATA_SCHEMA_VERSION, 2, 'default schema must remain v2');
assert.strictEqual(LEVEL_DATA_CLIENT_BUILD, 2, 'default client build must remain v2');
const v1Contract = loadLevelDataContract('v1');
assert.strictEqual(v1Contract.LEVEL_DATA_CONTRACT, 'v1', 'explicit v1 contract must be selected');
assert.strictEqual(v1Contract.LEVEL_DATA_SCHEMA_VERSION, 1, 'v1 schema must be 1');
assert.strictEqual(v1Contract.LEVEL_DATA_CLIENT_BUILD, 1, 'v1 client build must be 1');
assert.throws(() => loadLevelDataContract('v3'), /must be v1 or v2/, 'unknown contract must fail fast');

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

const slotPolicySource = fs.readFileSync(path.join(root, 'assets/Scripts/Core/SlotOnboardingPolicy.ts'), 'utf8');
assert.ok(slotPolicySource.includes("throw new Error('[SlotPolicy] missing required slotPolicy')"), 'runtime must fail on missing slotPolicy');
assert.ok(!slotPolicySource.includes('configuredUnlockedRows'), 'runtime must not retain the legacy row-count fallback');
assert.ok(!slotPolicySource.includes('let defaultRows = 1'), 'runtime must not derive mainline rows from level numbers');
assert.ok(!slotPolicySource.includes('ONBOARDING_TEACHING_TIME_LIMIT_SECONDS'), 'level 2 runtime must not overwrite the swapped JSON time limit');
assert.ok(slotPolicySource.includes('return Math.max(0, Math.floor(Number(options.configuredTimeLimit) || 0));'), 'runtime time limit must preserve the loaded level payload');

const cdnService = fs.readFileSync(path.join(root, 'assets/Scripts/Core/LevelDataCdnService.ts'), 'utf8');
assert.ok(cdnService.includes('validateSlotPolicyConfig(entry.data.slotPolicy'), 'CDN pack parsing must validate slotPolicy before returning level data');
assert.ok(cdnService.includes("namespace: 'stable'"), 'control and non-experiment levels must use the stable CDN namespace');
assert.ok(cdnService.includes('resolveFrontLevelExperimentContext'), 'front10 treatment routing must be isolated in the experiment service');
assert.ok(cdnService.includes("experiment?.variant === 'exp'"), 'only the current exp bucket may leave the stable CDN namespace');

const assetBootstrap = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts'), 'utf8');
assert.ok(!assetBootstrap.includes('_isReleaseLevelDataCdnOnly'), 'ordinary debug and release must share CDN failure semantics');
assert.ok(!assetBootstrap.includes('_loadLevelDataFromCdnOrLocal'), 'configured data-source selection must not be named as an error fallback');
assert.ok(assetBootstrap.includes('if (shouldUseLocalLevelDataMirror())'), 'ordinary localhost preview must select the local levelData mirror before loading');
assert.ok(assetBootstrap.includes('this._loadLevelDataFromLocalBundle(levelId, prefix, callback);'), 'localhost preview must load the generated local levelData bundle directly');

const remoteDataClient = fs.readFileSync(path.join(root, 'assets/Scripts/Core/RemoteDataCdnClient.ts'), 'utf8');
assert.ok(remoteDataClient.includes('return !isMiniGameRuntime() && isLocalBrowserPreview() && !isLocalBrowserCdnOptIn();'), 'only a real localhost browser may use the local mirror; mini-game runtimes must stay CDN-only');
assert.ok(!remoteDataClient.includes('isExplicitLocalTestProfile'), 'local mirror selection must not require the retired profile-only gate');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build/level-data-cdn/level_live.json'), 'utf8'));
assert.strictEqual(manifest.schemaVersion, LEVEL_DATA_SCHEMA_VERSION, 'generated manifest schema must match the slot-policy contract');
assert.strictEqual(manifest.minClientBuild, LEVEL_DATA_CLIENT_BUILD, 'generated manifest client build must match the slot-policy contract');

console.log('level-slot-policy-contract.test.js passed');
