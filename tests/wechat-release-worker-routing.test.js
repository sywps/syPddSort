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
    const firstWorker = runner.createFreshWorkerDir(tempRoot);
    const secondWorker = runner.createFreshWorkerDir(tempRoot);
    assert.notStrictEqual(firstWorker, secondWorker, 'every release must create a unique worker');
    for (const workerDir of [firstWorker, secondWorker]) {
        assert.strictEqual(path.dirname(workerDir), tempRoot);
        assert.ok(path.basename(workerDir).startsWith(runner.freshWorkerPrefix));
        assert.ok(!fs.existsSync(path.join(workerDir, 'library')), 'fresh worker must not reuse library');
        assert.ok(!fs.existsSync(path.join(workerDir, 'temp')), 'fresh worker must not reuse temp');
    }
    fs.mkdirSync(path.join(firstWorker, 'assets'));
    runner.linkWorkspaceDependencies(firstWorker);
    runner.validateFreshWorkerDir(firstWorker, tempRoot);
    fs.mkdirSync(path.join(firstWorker, 'library'));
    assert.throws(
        () => runner.validateFreshWorkerDir(firstWorker, tempRoot),
        /不应包含 library\/temp/,
        'fresh-worker validation must reject an existing AssetDB cache',
    );
    runner.cleanupFreshWorkerDir(firstWorker, tempRoot);
    runner.cleanupFreshWorkerDir(secondWorker, tempRoot);
    assert.ok(!fs.existsSync(firstWorker));
    assert.ok(!fs.existsSync(secondWorker));

    const unmanagedDir = path.join(tempRoot, 'unmanaged-worker');
    fs.mkdirSync(unmanagedDir);
    assert.throws(
        () => runner.cleanupFreshWorkerDir(unmanagedDir, tempRoot),
        /拒绝操作非本次 Release runner 管理的目录/,
        'cleanup must refuse directories not created under the runner prefix',
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
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}

for (const generatedPath of ['.git', 'build', 'library', 'temp', 'node_modules', 'local', 'output', 'outputs']) {
    assert.ok(runner.sourceSyncExcludes.includes(generatedPath), 'fresh source sync must exclude ' + generatedPath);
}
assert.ok(!runner.sourceSyncExcludes.includes('assets'), 'fresh source sync must include current assets');
assert.ok(!runner.sourceSyncExcludes.includes('profiles'), 'fresh source sync must include current Cocos profiles');
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
assert.ok(!source.includes('cocos-release-worker.json'), 'release must not load a persistent worker config');
assert.ok(!source.includes('PDD_COCOS_RELEASE_WORKER_DIR'), 'release must not accept an old persistent worker override');
assert.ok(source.includes('const workerDir = createFreshWorkerDir();'), 'every release must create a new worker');
assert.ok(source.includes("WECHAT_CLEAN_COCOS_CACHE: '0'"), 'batch build must preserve the AssetDB created earlier in the same run');
assert.ok(source.includes("WECHAT_WARM_COCOS_ASSETDB: '0'"), 'batch build must reuse only the fresh same-run warmup');
assert.ok(source.includes("WECHAT_OPEN_DEVTOOLS: '0'"), 'worker build must not open DevTools on a disposable path');
assert.ok(source.includes('maybeOpenWorkspaceWechatDevtools();'), 'auto-open must target the returned workspace package');
assert.ok(source.includes("'--hold', readyPath, resultPath"), 'release runner must keep the normal-editor AssetDB alive through batch build');
assert.ok(source.includes("COCOS_PREVIEW_PORT: process.env.COCOS_PREVIEW_PORT || '7556'"), 'held editor and batch preview guards must use separate ports');
assert.ok(source.includes("PDD_COCOS_ASSETDB_FORCE_REFRESH: '1'"), 'fresh worker warmup must always force a new AssetDB import');
assert.ok(source.includes('getWorkerAssetDbContractErrors'), 'worker readiness must validate imported scene contents, not only inventory counts');
const syncIndex = source.indexOf('syncProjectSource(workerDir);');
const byteCheckIndex = source.indexOf('assertAssetTreesByteIdentical(workerDir);', syncIndex);
const startHeldIndex = source.indexOf('heldAssetDb = startHeldAssetDb(workerDir);');
const directBuildIndex = source.indexOf('runDirectRelease(workerDir, wechatCdnTarget.slot, {', startHeldIndex);
const stopHeldIndex = source.indexOf('await stopHeldAssetDb(heldAssetDb);', directBuildIndex);
const cleanupIndex = source.indexOf('cleanupFreshWorkerDir(workerDir);', stopHeldIndex);
const openDevtoolsIndex = source.indexOf('maybeOpenWorkspaceWechatDevtools();', cleanupIndex);
assert.ok(
    syncIndex >= 0
        && byteCheckIndex > syncIndex
        && startHeldIndex > byteCheckIndex
        && directBuildIndex > startHeldIndex
        && stopHeldIndex > directBuildIndex
        && cleanupIndex > stopHeldIndex
        && openDevtoolsIndex > cleanupIndex,
    'fresh source sync and byte check must precede a held same-run AssetDB, batch build, and cleanup',
);

const buildWechat = read('scripts/build-wechat.js');
assert.ok(
    buildWechat.includes("assertRuntimeJsonArtifactContainsAll(runtimeInfo.bootstrapDir, 'gameEntry/bootstrap'"),
    'release build must reject a compiled bootstrap scene that omits its tutorial hand nodes',
);

console.log('wechat-release-worker-routing.test.js passed');
