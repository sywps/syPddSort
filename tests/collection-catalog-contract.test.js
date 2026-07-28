const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ts = require('typescript');
const vm = require('vm');
const { expandCollectionCatalog } = require('../scripts/collection-catalog-contract');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
    return JSON.parse(read(relativePath));
}

function loadClientCollectionCatalogContract(liveManifest = null) {
    const source = read('assets/Scripts/Core/LevelDataCdnService.ts');
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    const module = { exports: {} };
    const sandbox = {
        module,
        exports: module.exports,
        console,
        __PDD_LEVEL_DATA_CDN_URL__: liveManifest ? 'https://example.test/levels/' : '',
        require(id) {
            if (id === './LevelExperimentService') {
                return {
                    getFrontLevelExperimentDiagnostics: () => ({}),
                    resolveFrontLevelExperimentContext: () => null,
                };
            }
            if (id === './MiniGamePlatform') {
                return {
                    getMiniGameBuildPlatform: () => 'wechat',
                    isDouyinMiniGameRuntime: () => false,
                    isMiniGameRuntime: () => true,
                    isWeChatMiniGameRuntime: () => true,
                };
            }
            if (id === './RemoteDataCdnClient') {
                return {
                    canUseCdn: () => !!liveManifest,
                    getCdnPlatformRequester: () => null,
                    getCdnUnavailableReason: () => '',
                    isBrowserBackedRequester: () => false,
                    isLocalBrowserCdnOptIn: () => false,
                    joinCdnUrl: (base, file) => base + file,
                    normalizeCdnBaseUrl: (value) => String(value || ''),
                    parseJsonText: JSON.parse,
                    readCdnStorageObject: () => null,
                    requestCdnText: () => liveManifest
                        ? Promise.resolve(JSON.stringify(liveManifest))
                        : Promise.reject(new Error('not used')),
                    withCdnQuery: (url) => url,
                    writeCdnStorageObject: () => {},
                };
            }
            if (id === './RuntimeLog') {
                return { runtimeWarn: () => {} };
            }
            if (id === './SlotOnboardingPolicy') {
                return {
                    LEVEL_DATA_SLOT_POLICY_MAX_ROWS: 4,
                    validateSlotPolicyConfig: () => {},
                };
            }
            throw new Error(`unexpected require: ${id}`);
        },
    };
    vm.runInNewContext(output, sandbox, { filename: 'LevelDataCdnService.ts' });
    return module.exports;
}

const config = readJson('config/collection-catalog.json');
const availableLevelKeys = new Set(
    fs.readdirSync(path.join(root, 'assets', 'LevelData'))
        .map((name) => /^(level_|zt_level_)(\d+)\.json$/.exec(name))
        .filter(Boolean)
        .map((match) => match[1] + Number(match[2])),
);
const catalog = expandCollectionCatalog(config, availableLevelKeys);

assert.strictEqual(catalog.version, 1, 'collection catalog version must stay explicit');
assert.strictEqual(catalog.entries.length, 300, 'current collection product scope must remain 300 mainline cards');
assert.deepStrictEqual(catalog.entries[0], { levelId: 1, prefix: 'level_', unlockLevel: 1 });
assert.deepStrictEqual(catalog.entries.at(-1), { levelId: 300, prefix: 'level_', unlockLevel: 300 });
assert.ok(catalog.entries.every((entry) => availableLevelKeys.has(entry.prefix + entry.levelId)), 'every collection entry must resolve to a source level');
assert.ok(!catalog.entries.some((entry) => entry.levelId >= 100001), 'removed special ids must not return');

const clientCatalogContract = loadClientCollectionCatalogContract();
const legacyCatalog = clientCatalogContract.resolveLevelCollectionEntries({
    manifestVersion: 1,
    dataVersion: 'legacy-v0',
    schemaVersion: 2,
    minClientBuild: 2,
    levelCount: 1691,
    packs: [],
});
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(legacyCatalog)),
    catalog.entries,
    'new client must map a legacy manifest with both catalog fields absent to the frozen mainline 1..300 contract',
);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(clientCatalogContract.resolveLevelCollectionEntries({
        collectionCatalogVersion: 1,
        collectionEntries: [{ levelId: 7, prefix: 'zt_level_', unlockLevel: 9 }],
    }))),
    [{ levelId: 7, prefix: 'zt_level_', unlockLevel: 9 }],
    'explicit catalog v1 must remain authoritative',
);
assert.throws(
    () => clientCatalogContract.resolveLevelCollectionEntries({
        collectionEntries: catalog.entries,
    }),
    /collection catalog incomplete/,
    'a half-published catalog must not be mistaken for the legacy protocol',
);
assert.throws(
    () => clientCatalogContract.resolveLevelCollectionEntries({
        collectionCatalogVersion: 2,
        collectionEntries: catalog.entries,
    }),
    /collectionCatalogVersion unsupported/,
    'an explicit future catalog version must fail fast',
);

async function assertLegacyManifestLoadsEndToEnd() {
    const levelKeys = catalog.entries.map((entry) => entry.prefix + entry.levelId);
    const legacyManifest = {
        manifestVersion: 1,
        dataVersion: 'legacy-v0',
        schemaVersion: 2,
        minClientBuild: 2,
        levelCount: 1691,
        packs: [{
            id: 'level_1_300',
            prefix: 'level_',
            url: 'level_packs/level_1_300.json',
            hash: 'legacy-pack-hash',
            levelRange: [1, 300],
            levelCount: 300,
            levelKeys,
        }],
    };
    const runtimeContract = loadClientCollectionCatalogContract(legacyManifest);
    const entries = await new runtimeContract.LevelDataCdnService().loadCollectionEntries();
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(entries)),
        catalog.entries,
        'the real service path must accept a deployed legacy manifest when all 1..300 packs are indexed',
    );
}

assert.throws(
    () => expandCollectionCatalog(
        { version: 1, ranges: [{ prefix: 'level_', from: 999999, to: 999999 }] },
        availableLevelKeys,
    ),
    /不存在的关卡 key/,
    'catalog generation must fail fast for missing levels',
);
assert.throws(
    () => expandCollectionCatalog(
        {
            version: 1,
            ranges: [
                { prefix: 'level_', from: 1, to: 1 },
                { prefix: 'level_', from: 1, to: 1 },
            ],
        },
        availableLevelKeys,
    ),
    /重复关卡 key/,
    'catalog generation must reject duplicate keys',
);

const localManifest = readJson('assets/LevelData/level-manifest.json');
assert.strictEqual(localManifest.collectionCatalogVersion, catalog.version, 'local manifest must expose the catalog version');
assert.deepStrictEqual(localManifest.collectionEntries, catalog.entries, 'local manifest must use the shared collection catalog');

const tempOutput = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-v2-collection-catalog-'));
try {
    const generated = spawnSync(
        process.execPath,
        [path.join(root, 'scripts', 'write-level-data-cdn.js'), tempOutput],
        { cwd: root, encoding: 'utf8' },
    );
    assert.strictEqual(generated.status, 0, generated.stderr || generated.stdout || 'CDN manifest generation failed');
    const liveManifest = JSON.parse(fs.readFileSync(path.join(tempOutput, 'level_live.json'), 'utf8'));
    assert.strictEqual(liveManifest.collectionCatalogVersion, catalog.version, 'CDN manifest must expose the catalog version');
    assert.deepStrictEqual(liveManifest.collectionEntries, catalog.entries, 'CDN manifest must use the shared collection catalog');
    const expectedDataVersion = crypto.createHash('sha256').update(JSON.stringify({
        packs: liveManifest.packs,
        collectionCatalogVersion: liveManifest.collectionCatalogVersion,
        collectionEntries: liveManifest.collectionEntries,
    })).digest('hex').slice(0, 16);
    assert.strictEqual(liveManifest.dataVersion, expectedDataVersion, 'CDN dataVersion must cover collection catalog changes');
    const packedKeys = new Set(liveManifest.packs.flatMap((pack) => pack.levelKeys || []));
    assert.ok(
        liveManifest.collectionEntries.every((entry) => packedKeys.has(entry.prefix + entry.levelId)),
        'every CDN collection entry must resolve to a generated pack',
    );
} finally {
    fs.rmSync(tempOutput, { recursive: true, force: true });
}

const host = read('assets/Scripts/Core/GameRuntimeHost.ts');
const collection = read('assets/Scripts/Core/GameCtrlModules/CollectionAvatarModule.ts');
const panel = read('assets/Scripts/Core/Panels/CollectionPanelController.ts');
const flow = read('assets/Scripts/Core/GameCtrlModules/ThemePanelFlowModule.ts');
const cloudFunction = read('cloudfunctions/syncUserState/index.js');

assert.ok(!host.includes('COLLECTION_MAIN_LEVEL_COUNT'), 'runtime must not own the collection count');
assert.ok(!host.includes('COLLECTION_SPECIAL_LEVEL_'), 'runtime must not own synthetic special ids');
assert.ok(!collection.includes('collectAllLevelIds'), 'collection rendering must not rebuild a hardcoded catalog');
assert.ok(panel.includes('loadCollectionLevelEntries'), 'collection open must load manifest entries');
assert.ok(collection.includes('entry.unlockLevel <= savedLevel'), 'unlock state must consume the manifest contract');
assert.ok(collection.includes('prefix: entry.prefix'), 'lazy preview state must retain the manifest prefix');
assert.ok(flow.includes('openCollectionImageModal(levelId, prefix)'), 'collection detail must retain the manifest prefix');
assert.ok(!cloudFunction.includes('collection-catalog'), 'syncUserState must not load the collection catalog');
assert.ok(!cloudFunction.includes('level_live.json'), 'syncUserState must not load the level manifest');

assertLegacyManifestLoadsEndToEnd().then(() => {
    console.log('collection-catalog-contract.test.js passed');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
