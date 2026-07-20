const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const runner = require('../scripts/run-wechat-release.js');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-release-worker-test-'));
try {
    const configPath = path.join(tempRoot, 'worker.json');
    fs.writeFileSync(configPath, JSON.stringify({ projectDir: '/tmp/pdd-cocos-worker' }));
    assert.strictEqual(
        runner.loadWorkerDir({}, configPath),
        '/tmp/pdd-cocos-worker',
        'machine-local config must route the release command to its validated Cocos worker',
    );
    assert.strictEqual(
        runner.loadWorkerDir({ PDD_COCOS_RELEASE_WORKER_DIR: '/tmp/explicit-worker' }, configPath),
        '/tmp/explicit-worker',
        'an explicit worker environment must override the machine-local config',
    );

    const sourceAssets = path.join(tempRoot, 'source-assets');
    const targetAssets = path.join(tempRoot, 'target-assets');
    fs.mkdirSync(sourceAssets);
    fs.mkdirSync(targetAssets);
    fs.writeFileSync(path.join(sourceAssets, 'same.meta'), 'same bytes');
    fs.writeFileSync(path.join(targetAssets, 'same.meta'), 'same bytes');
    fs.utimesSync(path.join(sourceAssets, 'same.meta'), new Date(1000), new Date(1000));
    fs.utimesSync(path.join(targetAssets, 'same.meta'), new Date(2000), new Date(2000));
    assert.strictEqual(
        runner.listAssetTreeContentDiff(sourceAssets, targetAssets),
        '',
        'asset validation must ignore mtime-only differences',
    );
    fs.writeFileSync(path.join(targetAssets, 'same.meta'), 'changed bytes');
    assert.match(
        runner.listAssetTreeContentDiff(sourceAssets, targetAssets),
        /same\.meta/,
        'asset validation must reject real content differences',
    );

    const mtimeSourceAssets = path.join(tempRoot, 'mtime-source-assets');
    const mtimeWorkerDir = path.join(tempRoot, 'mtime-worker');
    const mtimeWorkerAssets = path.join(mtimeWorkerDir, 'assets');
    fs.mkdirSync(mtimeSourceAssets);
    fs.mkdirSync(mtimeWorkerAssets, { recursive: true });
    fs.writeFileSync(path.join(mtimeSourceAssets, 'Game.scene'), 'same scene bytes');
    fs.writeFileSync(path.join(mtimeWorkerAssets, 'Game.scene'), 'same scene bytes');
    fs.utimesSync(path.join(mtimeSourceAssets, 'Game.scene'), new Date(3000), new Date(3000));
    fs.utimesSync(path.join(mtimeWorkerAssets, 'Game.scene'), new Date(2000), new Date(2000));
    assert.strictEqual(runner.syncAssetMtimes(mtimeWorkerDir, mtimeSourceAssets), 1);
    assert.strictEqual(
        fs.statSync(path.join(mtimeWorkerAssets, 'Game.scene')).mtimeMs,
        fs.statSync(path.join(mtimeSourceAssets, 'Game.scene')).mtimeMs,
        'worker asset mtimes must match the current workspace so AssetDB invalidates stale imports',
    );
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}

for (const protectedPath of ['.git', 'assets', 'build', 'library', 'temp', 'node_modules', 'local']) {
    assert.ok(runner.sourceSyncExcludes.includes(protectedPath), 'source sync must preserve worker ' + protectedPath);
}
assert.deepStrictEqual(
    runner.generatedOutputNames,
    ['wechatgame', 'wechatgame-staging', 'level-data-cdn', 'skin-cdn'],
    'all wrapper-generated Release outputs must be returned to the workspace',
);

const packageJson = JSON.parse(read('package.json'));
assert.strictEqual(
    packageJson.scripts['build:wechat:release'],
    'node scripts/run-wechat-release.js',
    'the exact npm command must enter the worker-aware release runner',
);
const source = read('scripts/run-wechat-release.js');
assert.ok(source.includes("WECHAT_CLEAN_COCOS_CACHE: '0'"), 'worker build must preserve its validated library');
assert.ok(source.includes("WECHAT_WARM_COCOS_ASSETDB: '0'"), 'worker build must not invalidate its healthy inventory');
assert.ok(source.includes("PDD_COCOS_RELEASE_WORKER_ACTIVE: '1'"), 'worker invocation must be recursion-safe');
assert.ok(source.includes("'--hold', readyPath, resultPath"), 'release runner must keep the normal-editor AssetDB alive through batch build');
assert.ok(source.includes("COCOS_PREVIEW_PORT: process.env.COCOS_PREVIEW_PORT || '7556'"), 'held editor and batch preview guards must use separate ports');
assert.ok(source.includes("PDD_COCOS_ASSETDB_FORCE_REFRESH: forceRefresh ? '1' : '0'"), 'worker warmup must refresh only when source asset mtimes changed');
assert.ok(source.includes('syncAssetMtimes(workerDir)'), 'worker assets must inherit workspace mtimes before the normal editor starts');
assert.ok(source.includes('startHeldAssetDb(workerDir, updatedAssetMtimes > 0)'), 'unchanged assets must preserve the already validated worker inventory');
assert.ok(source.includes('getWorkerAssetDbContractErrors'), 'worker readiness must validate imported scene contents, not only inventory counts');
const startHeldIndex = source.indexOf('const heldAssetDb = startHeldAssetDb(workerDir, updatedAssetMtimes > 0);');
const directBuildIndex = source.indexOf('runDirectRelease(workerDir, wechatCdnTarget.slot, {', startHeldIndex);
const stopHeldIndex = source.indexOf('await stopHeldAssetDb(heldAssetDb);', directBuildIndex);
assert.ok(
    startHeldIndex >= 0 && directBuildIndex > startHeldIndex && stopHeldIndex > directBuildIndex,
    'the held AssetDB process must span the entire direct Cocos batch build',
);

const buildWechat = read('scripts/build-wechat.js');
assert.ok(
    buildWechat.includes("assertRuntimeJsonArtifactContainsAll(runtimeInfo.bootstrapDir, 'gameEntry/bootstrap'"),
    'release build must reject a compiled bootstrap scene that omits its tutorial hand nodes',
);

console.log('wechat-release-worker-routing.test.js passed');
