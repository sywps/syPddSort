const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const warmup = require('../scripts/warm-cocos-assetdb.js');
const buildCommon = require('../scripts/minigame-build-common.js');
const monitorExtension = require('../extensions/pdd-assetdb-warm-monitor/dist/main.js');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const monitorPackage = JSON.parse(read('extensions/pdd-assetdb-warm-monitor/package.json'));
assert.strictEqual(monitorPackage.version, '1.0.1', 'the warm monitor package version must invalidate the cached 1.0.0 extension');

assert.doesNotThrow(() => warmup.assertHealthyWarmResult({
    done: true,
    assetDbReady: true,
    sceneCount: 7,
    scriptCount: 105,
}));
assert.throws(
    () => warmup.assertHealthyWarmResult({ done: true, assetDbReady: true, sceneCount: 0, scriptCount: 0 }),
    /inventory is empty/,
    'warmup must reject the 0-scene/0-script inventory seen in the failed builds',
);
assert.deepStrictEqual(
    warmup.parseProcessTable('  10   1\n  11  10\ninvalid\n'),
    [{ pid: 10, ppid: 1 }, { pid: 11, ppid: 10 }],
    'warmup process tracking must parse only exact pid/ppid pairs',
);
assert.ok(
    buildCommon.getCocosCliCandidates('win32').includes('C:\\ProgramData\\cocos\\editors\\Creator\\3.8.8\\CocosCreator.exe'),
    'Windows release builds must discover the Cocos Creator installation path used by this workspace',
);

const requestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-assetdb-request-test-'));
try {
    const requestPath = path.join(requestRoot, 'temp', monitorExtension.warmupRequestFileName);
    const resultPath = path.join(requestRoot, 'temp', 'result.json');
    const nodePath = path.join(requestRoot, 'node.exe');
    const repairScript = path.join(requestRoot, 'scripts', 'repair-cocos-meta.js');
    fs.mkdirSync(path.dirname(requestPath), { recursive: true });
    fs.writeFileSync(requestPath, JSON.stringify({
        version: 1,
        createdAtMs: Date.now(),
        resultPath,
        projectPath: requestRoot,
        nodePath,
        metaRepairScript: repairScript,
        forceRefresh: true,
        timeoutMs: 300000,
    }));
    const activation = monitorExtension.readWarmupRequest(requestRoot);
    assert.strictEqual(activation.resultPath, resultPath);
    assert.strictEqual(activation.projectPath, requestRoot);
    assert.strictEqual(activation.nodePath, nodePath);
    assert.strictEqual(activation.metaRepairScript, repairScript);
    assert.strictEqual(activation.forceRefresh, true);
    assert.strictEqual(activation.timeoutMs, 300000);
    assert.strictEqual(activation.source, 'request');
    let activationLog = '';
    monitorExtension.logWarmupActivation(activation, (message) => {
        activationLog = message;
    });
    assert.match(activationLog, /source=request, request consumed/, 'request consumption must produce a positive activation log');
    assert.ok(!fs.existsSync(requestPath), 'warmup request must be consumed exactly once');
    assert.strictEqual(monitorExtension.readWarmupRequest(requestRoot), null, 'ordinary editor must remain inert without a request');
} finally {
    fs.rmSync(requestRoot, { recursive: true, force: true });
}

const buildWechat = read('scripts/build-wechat.js');
assert.ok(
    buildWechat.includes("process.env.WECHAT_CLEAN_COCOS_CACHE = process.env.WECHAT_CLEAN_COCOS_CACHE || '0';"),
    'the workspace command must preserve the inventory it just warmed unless cache cleaning is explicitly requested',
);
const entryMarker = "console.log('=== 微信小游戏打包 ===');";
const entry = buildWechat.slice(buildWechat.indexOf(entryMarker));
const warmIndex = entry.indexOf('warmCocosAssetDb();');
const buildIndex = entry.indexOf('runCocosBuildWithAssetDbRetry();');
assert.ok(warmIndex >= 0 && warmIndex < buildIndex, 'normal-editor warmup must complete before the batch build');

const retry = buildWechat.slice(buildWechat.indexOf('function runCocosBuildWithAssetDbRetry()'));
const retryBody = retry.slice(0, retry.indexOf('function assertCocosAssetDbPrewarmRan'));
const retryMarkerIndex = retryBody.indexOf("logInfo('Cocos AssetDB 首次构建未就绪");
const retryRepairIndex = retryBody.indexOf('repairCocosMetaFiles();', retryMarkerIndex);
const retryWarmIndex = retryBody.indexOf('warmCocosAssetDb();', retryRepairIndex);
const retryBuildIndex = retry.indexOf('buildCommon.spawnCocosBuild(projectDir, buildConfigPath);', retryWarmIndex);
assert.ok(
    retryRepairIndex >= 0 && retryWarmIndex > retryRepairIndex && retryBuildIndex > retryWarmIndex,
    'an importer retry must repair metadata and re-warm AssetDB before rebuilding',
);
assert.ok(
    !retryBody.includes('cleanCocosGeneratedCacheDirs('),
    'an importer retry must preserve the only library cache that a normal editor can recover',
);

const monitor = read('extensions/pdd-assetdb-warm-monitor/dist/main.js');
assert.ok(monitor.includes("process.env.PDD_COCOS_ASSETDB_WARM_MONITOR_FILE || ''"), 'monitor must be inert in ordinary editor sessions');
assert.ok(monitor.includes("const warmupRequestFileName = 'pdd-assetdb-warm-request.json';"), 'monitor must support the one-shot project-local activation request');
assert.ok(monitor.includes('readWarmupRequest(editorProjectPath)'), 'monitor must use the request only when launch environment is unavailable');
assert.ok(monitor.includes('if (!activation) return;'), 'ordinary editor must remain inactive after the bounded activation wait');
assert.ok(monitor.includes('healthyCountStreak >= 3'), 'monitor must require a stable non-empty inventory before closing the editor');
const queryIndex = monitor.indexOf('const counts = await queryCounts();', monitor.indexOf('async function monitor'));
const repairIndex = monitor.indexOf('repairMetaFiles(activation);');
const refreshIndex = monitor.indexOf("Editor.Message.request('asset-db', 'refresh-asset', 'db://assets')");
assert.ok(queryIndex >= 0 && queryIndex < repairIndex, 'monitor must preserve a healthy cache by querying before any refresh');
assert.ok(repairIndex >= 0 && repairIndex < refreshIndex, 'every cold refresh must restore importer metadata first');
assert.ok(monitor.includes("process.env.PDD_COCOS_ASSETDB_FORCE_REFRESH === '1'"), 'worker warmup must support a forced refresh for source mtime changes');
assert.ok(monitor.includes('importedAssetContractsReady(activation.projectPath)'), 'warmup must validate imported scene contents before reporting ready');
assert.ok(
    monitor.includes('Number(process.env.WECHAT_COCOS_ASSETDB_WARM_TIMEOUT_MS)'),
    'the in-editor monitor must honor the same bounded warmup timeout as its launcher',
);
assert.ok(!monitor.includes('const timeoutMs = 90000;'), 'the in-editor monitor must not fail before a configured large-project import bound');
assert.ok(monitor.includes('let refreshAttempted = false;'), 'each warmup must track whether its one AssetDB refresh was already issued');
assert.ok(monitor.includes('const shouldRefresh = !refreshAttempted'), 'a large import must not be reset by repeated full refreshes');
assert.ok(
    monitor.includes('(forcedRefreshPending && assetContractsReady)'),
    'a forced refresh must wait until the importer-backed inventory is healthy',
);
assert.ok(monitor.includes('recoveryRefreshDelayMs'), 'an unhealthy first import may receive one delayed recovery refresh');
assert.ok(monitor.includes('refreshAttempted = true;'), 'the first refresh must close the one-shot gate');
assert.ok(!monitor.includes('Date.now() - lastRefreshAt'), 'refresh polling must not restart a still-running full import');

const helper = read('scripts/warm-cocos-assetdb.js');
assert.ok(helper.includes("child.kill('SIGTERM')"), 'helper must close the exact editor process it launched');
assert.ok(!helper.includes('killall') && !helper.includes('pkill'), 'helper must not terminate unrelated Cocos processes');
assert.ok(helper.includes('PDD_COCOS_NODE_PATH: process.execPath'), 'normal editor must use the system Node repair script, not the Cocos executable');
assert.ok(helper.includes('const requestPath = writeWarmupRequest(resultPath);'), 'launcher must publish a one-shot activation request before starting Cocos');
assert.ok(helper.includes('fs.rmSync(requestPath, { force: true });'), 'launcher must remove any unconsumed activation request');
assert.ok(helper.includes('await waitForPidsExit(ownedPids, 15000);'), 'batch build must wait for every child of the warm editor to exit');
assert.ok(helper.includes("process.argv[2] === '--hold'"), 'release builds must support holding the healthy editor AssetDB through batch mode');
assert.ok(helper.includes('await waitForTerminationSignal();'), 'held AssetDB mode must remain alive until the release runner ends the build');

async function testDelayedActivationPolling() {
    let nowMs = 0;
    let resolveCalls = 0;
    const activation = await monitorExtension.waitForWarmupActivation({
        resolveActivation: () => {
            resolveCalls += 1;
            return resolveCalls === 3 ? { source: 'request' } : null;
        },
        now: () => nowMs,
        sleep: async (delayMs) => {
            nowMs += delayMs;
        },
        timeoutMs: monitorExtension.activationWaitTimeoutMs,
        intervalMs: monitorExtension.activationPollIntervalMs,
    });
    assert.deepStrictEqual(activation, { source: 'request' });
    assert.strictEqual(resolveCalls, 3, 'delayed activation must retry until the request becomes visible');
    assert.strictEqual(nowMs, 500, 'delayed activation must poll at 250 ms intervals');

    nowMs = 0;
    resolveCalls = 0;
    const missingActivation = await monitorExtension.waitForWarmupActivation({
        resolveActivation: () => {
            resolveCalls += 1;
            return null;
        },
        now: () => nowMs,
        sleep: async (delayMs) => {
            nowMs += delayMs;
        },
        timeoutMs: monitorExtension.activationWaitTimeoutMs,
        intervalMs: monitorExtension.activationPollIntervalMs,
    });
    assert.strictEqual(missingActivation, null);
    assert.strictEqual(nowMs, 30000, 'ordinary editor activation polling must stop after 30 seconds');
    assert.strictEqual(resolveCalls, 121, 'the bounded wait must not poll after its 30-second deadline');
}

testDelayedActivationPolling().then(() => {
    console.log('cocos-assetdb-workspace-warmup.test.js passed');
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
