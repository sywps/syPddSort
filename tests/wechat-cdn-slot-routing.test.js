const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    configureWechatCdnEnvironment,
    extractRequiredWechatCdnSlot,
    resolveWechatCdnSlot,
} = require('../scripts/wechat-cdn-slot-config');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const slotA = resolveWechatCdnSlot('a');
assert.strictEqual(slotA.slot, 'A');
assert.strictEqual(slotA.remoteDir, 'remote_wechat');
assert.strictEqual(
    slotA.levelDataCdnUrl,
    'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat/levels/',
);
assert.strictEqual(slotA.levelDataOssPath, 'syGame/pdd_v2/remote_wechat/levels/');

const slotB = resolveWechatCdnSlot('B');
assert.strictEqual(slotB.slot, 'B');
assert.strictEqual(slotB.remoteDir, 'remote_wechat_b');
assert.strictEqual(
    slotB.skinDataCdnUrl,
    'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat_b/skin/',
);
assert.strictEqual(slotB.skinDataOssPath, 'syGame/pdd_v2/remote_wechat_b/skin/');

assert.throws(() => extractRequiredWechatCdnSlot([]), /必须显式传入 --cdn-slot/);
assert.throws(() => extractRequiredWechatCdnSlot(['--cdn-slot=C']), /必须是 A 或 B/);
assert.throws(
    () => extractRequiredWechatCdnSlot(['--cdn-slot=EXP']),
    /必须是 A 或 B/,
    'build/release slot parsing must remain restricted to stable A/B',
);
assert.throws(
    () => extractRequiredWechatCdnSlot(['--cdn-slot=A', '--cdn-slot=B']),
    /只能传入一个/,
);
const parsed = extractRequiredWechatCdnSlot(['--dry-run', '--cdn-slot', 'b']);
assert.strictEqual(parsed.slot, 'B');
assert.deepStrictEqual(parsed.remainingArgs, ['--dry-run']);

const configuredEnv = {};
configureWechatCdnEnvironment(slotB, configuredEnv);
assert.strictEqual(configuredEnv.PDD_WECHAT_CDN_SLOT, 'B');
assert.strictEqual(configuredEnv.PDD_LEVEL_DATA_CDN_URL, slotB.levelDataCdnUrl);
assert.strictEqual(configuredEnv.PDD_SKIN_DATA_OSS_PATH, slotB.skinDataOssPath);
assert.throws(
    () => configureWechatCdnEnvironment(slotB, { PDD_LEVEL_DATA_CDN_URL: slotA.levelDataCdnUrl }),
    /与 CDN 槽位不一致/,
);

for (const scriptName of ['sync-level-data-cdn-wechat.js', 'sync-skin-data-cdn-wechat.js', 'sync-wechat-cdn.js']) {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', scriptName), '--dry-run'], {
        cwd: root,
        encoding: 'utf8',
    });
    assert.notStrictEqual(result.status, 0, `${scriptName} must reject a missing CDN slot`);
    assert.match(result.stdout + result.stderr, /--cdn-slot=A.*--cdn-slot=B/, `${scriptName} must explain the required slot`);
}

const runnerMissingSlot = spawnSync(process.execPath, [path.join(root, 'scripts', 'run-wechat-release.js')], {
    cwd: root,
    encoding: 'utf8',
});
assert.notStrictEqual(runnerMissingSlot.status, 0, 'Release runner must reject a missing CDN slot');
assert.match(runnerMissingSlot.stdout + runnerMissingSlot.stderr, /--cdn-slot=A.*--cdn-slot=B/);

const runnerExpSlot = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'run-wechat-release.js'),
    '--cdn-slot=EXP',
], {
    cwd: root,
    encoding: 'utf8',
});
assert.notStrictEqual(runnerExpSlot.status, 0, 'Release runner must reject EXP before starting a build');
assert.match(runnerExpSlot.stdout + runnerExpSlot.stderr, /必须是 A 或 B/);

const packageJson = JSON.parse(read('package.json'));
assert.strictEqual(packageJson.scripts['sync:cdn:wechat'], 'node scripts/sync-wechat-cdn.js');
assert.strictEqual(packageJson.scripts['sync:cdn:wechat:all'], 'node scripts/sync-wechat-cdn.js');
assert.strictEqual(packageJson.scripts['sync:cdn:wechat:dry'], 'node scripts/sync-wechat-cdn.js --dry-run');
assert.strictEqual(packageJson.scripts['sync:cdn:wechat:all:dry'], 'node scripts/sync-wechat-cdn.js --dry-run');

const runner = read('scripts/run-wechat-release.js');
assert.ok(runner.includes('extractRequiredWechatCdnSlot'), 'Release runner must parse the explicit slot');
assert.ok(runner.includes("'--cdn-slot=' + slot"), 'Release runner must forward the slot into the worker build');

const buildWechat = read('scripts/build-wechat.js');
assert.ok(buildWechat.includes('assertRuntimeWechatCdnTarget'), 'Release build must inspect generated CDN markers');
assert.ok(buildWechat.includes('wechatCdnTarget.slot'), 'Release build must carry the resolved slot');
assert.ok(buildWechat.includes('createWechatClientBuildId'), 'Release build must create one immutable client build identity');
assert.ok(buildWechat.includes('process.env.PDD_CLIENT_BUILD_ID'), 'Release build must preserve the client build identity through child postbuilds');

const postbuild = read('scripts/postbuild-wechat-minigame.js');
assert.ok(postbuild.includes('__PDD_CDN_SLOT__'), 'postbuild must inject a visible CDN slot marker');
assert.ok(postbuild.includes('__PDD_CLIENT_BUILD_ID__'), 'postbuild must inject a visible client build marker');
assert.ok(postbuild.includes('__PDD_RELEASE_LOG_GATE_VERSION__=5'), 'postbuild must upgrade the Release log gate');
assert.ok(postbuild.includes('__PDD_ENABLE_RELEASE_LOG_GATE__=function'), 'Release log muting must register a deferred action instead of mutating console during cold start');
assert.ok(postbuild.includes('__PDD_RELEASE_LOG_GATE_ACTIVATED_AFTER_START__=true'), 'Release log muting must activate only after application.start resolves');
assert.ok(postbuild.includes('String((wxRef.getSystemInfoSync()||{}).platform||"").toLowerCase()==="devtools"'), 'DevTools Release packages must keep the native console intact');
assert.ok(!postbuild.includes("process.env.PDD_LEVEL_DATA_CDN_URL || 'https://"), 'postbuild must not silently default to A');

const metaRepairDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pdd-meta-repair-'));
try {
    const atlasPath = path.join(metaRepairDir, 'sample.atlas.txt');
    const atlasMetaPath = atlasPath + '.meta';
    fs.writeFileSync(atlasPath, 'sample.png\nsize: 1,1\n');
    fs.writeFileSync(atlasMetaPath, JSON.stringify({
        importer: '*',
        uuid: '12345678-1234-4234-8234-123456789abc',
        userData: {},
    }));
    const prefabPath = path.join(metaRepairDir, 'sample.prefab');
    const prefabMetaPath = prefabPath + '.meta';
    fs.writeFileSync(prefabPath, '[]');
    fs.writeFileSync(prefabMetaPath, JSON.stringify({
        importer: '*',
        uuid: 'abcdefab-1234-4234-8234-123456789abc',
        userData: { syncNodeName: 'Sample' },
    }));
    const repairResult = spawnSync(process.execPath, [
        path.join(root, 'scripts', 'repair-cocos-meta.js'),
        metaRepairDir,
    ], {
        cwd: root,
        encoding: 'utf8',
    });
    assert.strictEqual(repairResult.status, 0, repairResult.stdout + repairResult.stderr);
    const repairedAtlasMeta = JSON.parse(fs.readFileSync(atlasMetaPath, 'utf8'));
    assert.strictEqual(repairedAtlasMeta.importer, 'text');
    assert.deepStrictEqual(repairedAtlasMeta.files, ['.json']);
    const repairedPrefabMeta = JSON.parse(fs.readFileSync(prefabMetaPath, 'utf8'));
    assert.strictEqual(repairedPrefabMeta.importer, 'prefab');
    assert.strictEqual(repairedPrefabMeta.userData.syncNodeName, 'Sample');
} finally {
    fs.rmSync(metaRepairDir, { recursive: true, force: true });
}

for (const relPath of ['scripts/write-level-data-cdn.js', 'scripts/write-skin-data-cdn.js']) {
    assert.ok(read(relPath).includes('cdnSlot'), `${relPath} must bind generated manifests to the selected slot`);
}

console.log('wechat-cdn-slot-routing.test.js passed');
