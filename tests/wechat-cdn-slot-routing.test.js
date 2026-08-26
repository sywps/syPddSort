const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
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
const bootstrapInfoPatchStart = postbuild.indexOf('function patchWechatBootstrapSystemInfo(content)');
const bootstrapInfoPatchEnd = postbuild.indexOf('function ensureStableGameAssetsBundleScriptLoader', bootstrapInfoPatchStart);
assert.ok(bootstrapInfoPatchStart >= 0 && bootstrapInfoPatchEnd > bootstrapInfoPatchStart, 'postbuild must own a bounded bootstrap system-info patch');
const bootstrapInfoPatch = postbuild.slice(bootstrapInfoPatchStart, bootstrapInfoPatchEnd);
assert.ok(bootstrapInfoPatch.includes('typeof wxApi.getDeviceInfo==="function"'), 'bootstrap must prefer the maintained device API');
assert.ok(bootstrapInfoPatch.includes('typeof wxApi.getWindowInfo==="function"'), 'bootstrap must prefer the maintained window API');
const bootstrapHelperStart = bootstrapInfoPatch.indexOf('var helper = [');
const bootstrapHelperEnd = bootstrapInfoPatch.indexOf("].join('\\n');", bootstrapHelperStart);
assert.ok(bootstrapHelperStart >= 0 && bootstrapHelperEnd > bootstrapHelperStart, 'bootstrap helper literal must be present');
const bootstrapHelper = bootstrapInfoPatch.slice(bootstrapHelperStart, bootstrapHelperEnd);
assert.ok(
    bootstrapHelper.indexOf('getDeviceInfo') < bootstrapHelper.indexOf('getSystemInfoSync')
        && bootstrapHelper.indexOf('getWindowInfo') < bootstrapHelper.indexOf('getSystemInfoSync'),
    'legacy combined system info must be only a guarded fallback',
);
assert.ok(bootstrapInfoPatch.includes('WeChat bootstrap system info missing:'), 'missing bootstrap fields must fail explicitly');
assert.ok(bootstrapInfoPatch.includes('const info = __pddReadWechatBootstrapSystemInfo();'), 'orientation startup must use the safe helper');
assert.ok(bootstrapInfoPatch.includes('var sysInfo = __pddReadWechatBootstrapSystemInfo();'), 'Android startup routing must use the safe helper');
assert.ok(!bootstrapInfoPatch.includes('?.'), 'raw generated entry helpers must stay compatible with the ES5 compiler profile');
assert.ok(postbuild.includes('patchedGame = patchWechatBootstrapSystemInfo(patchedGame);'), 'the safe helper patch must run for every generated game entry');
const bootstrapFixture = [
    'function __initApp () {',
    'const info = wx.getSystemInfoSync();',
    '}',
    'var sysInfo = wx.getSystemInfoSync();',
    "if (sysInfo.platform.toLocaleLowerCase() === 'android') {}",
].join('\n');
const bootstrapPatchContext = { bootstrapFixture, patchedFixture: '' };
vm.runInNewContext(
    `${bootstrapInfoPatch}\npatchedFixture = patchWechatBootstrapSystemInfo(bootstrapFixture);`,
    bootstrapPatchContext,
);
const patchedFixture = bootstrapPatchContext.patchedFixture;
assert.ok(patchedFixture.includes('function __pddReadWechatBootstrapSystemInfo(){'));
assert.ok(!patchedFixture.includes('const info = wx.getSystemInfoSync();'));
assert.ok(!patchedFixture.includes('var sysInfo = wx.getSystemInfoSync();'));
assert.strictEqual(patchedFixture.split('const info = __pddReadWechatBootstrapSystemInfo();').length - 1, 1);
assert.strictEqual(patchedFixture.split('var sysInfo = __pddReadWechatBootstrapSystemInfo();').length - 1, 1);
assert.ok(
    patchedFixture.indexOf('function __pddReadWechatBootstrapSystemInfo(){') < patchedFixture.indexOf('function __initApp'),
    'the shared bootstrap helper must be top-level before both call sites',
);
bootstrapPatchContext.bootstrapFixture = patchedFixture;
vm.runInNewContext('patchedAgain = patchWechatBootstrapSystemInfo(bootstrapFixture);', bootstrapPatchContext);
assert.strictEqual(bootstrapPatchContext.patchedAgain, patchedFixture, 'bootstrap patch must be idempotent');

const helperEnd = patchedFixture.indexOf('\nfunction __initApp');
assert.ok(helperEnd > 0, 'patched fixture must expose the generated helper boundary');
const generatedBootstrapHelper = patchedFixture.slice(0, helperEnd);
const topLevelContext = {
    calls: { legacy: 0 },
    wx: {
        getDeviceInfo() { return { platform: 'ios' }; },
        getWindowInfo() { return { screenWidth: 720, screenHeight: 1280 }; },
        getSystemInfoSync() {
            topLevelContext.calls.legacy += 1;
            return { platform: 'legacy', screenWidth: 1, screenHeight: 1 };
        },
    },
};
vm.runInNewContext(patchedFixture, topLevelContext);
assert.strictEqual(topLevelContext.calls.legacy, 0, 'the outer Android route must access the top-level maintained-API helper');
const preferredApiContext = {
    calls: { device: 0, window: 0, legacy: 0 },
    wx: {
        getDeviceInfo() {
            preferredApiContext.calls.device += 1;
            return { platform: 'android' };
        },
        getWindowInfo() {
            preferredApiContext.calls.window += 1;
            return { screenWidth: 720, screenHeight: 1280 };
        },
        getSystemInfoSync() {
            preferredApiContext.calls.legacy += 1;
            return { platform: 'legacy', screenWidth: 1, screenHeight: 1 };
        },
    },
    bootstrapInfo: null,
};
vm.runInNewContext(
    `${generatedBootstrapHelper}\nbootstrapInfo = __pddReadWechatBootstrapSystemInfo();`,
    preferredApiContext,
);
assert.strictEqual(preferredApiContext.calls.device, 1);
assert.strictEqual(preferredApiContext.calls.window, 1);
assert.strictEqual(preferredApiContext.calls.legacy, 0, 'complete maintained APIs must avoid the legacy bridge path');
assert.strictEqual(preferredApiContext.bootstrapInfo.platform, 'android');
assert.strictEqual(preferredApiContext.bootstrapInfo.screenWidth, 720);
assert.strictEqual(preferredApiContext.bootstrapInfo.screenHeight, 1280);

const fallbackApiContext = {
    calls: { legacy: 0 },
    wx: {
        getDeviceInfo() { return {}; },
        getWindowInfo() { return { screenWidth: 720, screenHeight: 1280 }; },
        getSystemInfoSync() {
            fallbackApiContext.calls.legacy += 1;
            return { platform: 'devtools', screenWidth: 720, screenHeight: 1280 };
        },
    },
    bootstrapInfo: null,
};
vm.runInNewContext(
    `${generatedBootstrapHelper}\nbootstrapInfo = __pddReadWechatBootstrapSystemInfo();`,
    fallbackApiContext,
);
assert.strictEqual(fallbackApiContext.calls.legacy, 1, 'legacy system info must remain a compatibility fallback');
assert.strictEqual(fallbackApiContext.bootstrapInfo.platform, 'devtools');
assert.throws(
    () => vm.runInNewContext(
        `${generatedBootstrapHelper}\n__pddReadWechatBootstrapSystemInfo();`,
        { wx: { getDeviceInfo() { return {}; }, getWindowInfo() { return {}; } } },
    ),
    /WeChat bootstrap system info missing: platform,screenWidth,screenHeight/,
);

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
    const zipPath = path.join(metaRepairDir, 'sample.zip');
    const zipMetaPath = zipPath + '.meta';
    const zipMetaText = JSON.stringify({
        ver: '1.0.0',
        importer: '*',
        imported: true,
        uuid: 'fedcbafe-1234-4234-8234-123456789abc',
        files: ['.json', '.zip'],
        subMetas: {},
        userData: {},
    });
    fs.writeFileSync(zipPath, 'opaque zip fixture');
    fs.writeFileSync(zipMetaPath, zipMetaText);
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
    assert.strictEqual(
        fs.readFileSync(zipMetaPath, 'utf8'),
        zipMetaText,
        'valid imported zip wildcard metadata must remain byte-identical',
    );
} finally {
    fs.rmSync(metaRepairDir, { recursive: true, force: true });
}

const invalidZipDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pdd-invalid-zip-meta-'));
try {
    const invalidZipPath = path.join(invalidZipDir, 'invalid.zip');
    fs.writeFileSync(invalidZipPath, 'invalid opaque fixture');
    fs.writeFileSync(invalidZipPath + '.meta', JSON.stringify({
        importer: '*',
        imported: false,
        uuid: '01234567-1234-4234-8234-123456789abc',
        files: ['.zip'],
    }));
    const invalidRepairResult = spawnSync(process.execPath, [
        path.join(root, 'scripts', 'repair-cocos-meta.js'),
        invalidZipDir,
    ], {
        cwd: root,
        encoding: 'utf8',
    });
    assert.notStrictEqual(invalidRepairResult.status, 0, 'malformed zip wildcard metadata must still fail fast');
    assert.match(invalidRepairResult.stderr, /Unsupported meta asset type/);
} finally {
    fs.rmSync(invalidZipDir, { recursive: true, force: true });
}

for (const relPath of ['scripts/write-level-data-cdn.js', 'scripts/write-skin-data-cdn.js']) {
    assert.ok(read(relPath).includes('cdnSlot'), `${relPath} must bind generated manifests to the selected slot`);
}

console.log('wechat-cdn-slot-routing.test.js passed');
