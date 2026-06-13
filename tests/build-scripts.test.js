const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function exists(relPath) {
    return fs.existsSync(path.join(root, relPath));
}

function runNode(script, args, env = {}) {
    const result = childProcess.spawnSync(process.execPath, [path.join(root, script), ...args], {
        cwd: root,
        env: { ...process.env, ...env },
        encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `${script} failed: ${result.stderr || result.stdout}`);
}

const pkg = JSON.parse(read('package.json'));
const scripts = pkg.scripts || {};

for (const [name, expected] of [
    ['test', 'npm run test:build-scripts && npm run verify:ui-ownership'],
    ['test:build-scripts', 'node tests/build-scripts.test.js && node tests/slot-order.test.js && node tests/endgame-hint.test.js && node tests/slot-onboarding-policy.test.js'],
    ['verify:ui-ownership', 'node scripts/verify-ui-ownership.js'],
    ['build:wechat:release', 'node scripts/build-wechat.js --release'],
    ['build:wechat:debug', 'node scripts/build-wechat.js --debug'],
    ['verify:wechat-build', 'node scripts/verify-wechat-build.js'],
    ['build:douyin:release', 'node scripts/build-douyin.js --release'],
    ['build:douyin:debug', 'node scripts/build-douyin.js --debug'],
    ['postbuild:douyin', 'node scripts/postbuild-douyin.js'],
    ['verify:douyin-build', 'node scripts/verify-douyin-build.js'],
    ['verify:wechat-build:runtime', 'npm run verify:wechat-build && npm run smoke:wechat-preview -- --screenshot temp/wechat-preview-smoke/preview.png --logs temp/wechat-preview-smoke/fatal-startup.log'],
    ['smoke:wechat-preview', 'node scripts/smoke-wechat-preview.js'],
    ['verify:cocos-meta', 'node scripts/verify-cocos-meta.js assets'],
    ['audit:assets', 'node scripts/audit-assets.js'],
    ['levels:manifest', 'node scripts/write-level-manifest.js'],
    ['levels:cdn', 'node scripts/write-level-data-cdn.js'],
    ['sync:cdn:wechat', 'node scripts/sync-cdn-wechat.js'],
    ['sync:cdn:wechat:dry', 'node scripts/sync-cdn-wechat.js --dry-run'],
]) {
    assert.strictEqual(scripts[name], expected, `package.json script ${name} must be ${expected}`);
}

for (const forbidden of [
    'build:wechat',
    'build:douyin',
    'verify:douyin-artifacts',
    'sync:cdn:douyin',
    'douyin:postbuild',
]) {
    assert.strictEqual(scripts[forbidden], undefined, `package.json must not keep ambiguous script ${forbidden}`);
}

for (const filePath of [
    'scripts/build-wechat.js',
    'scripts/build-douyin.js',
    'scripts/minigame-build-common.js',
    'scripts/write-wechat-build-config.js',
    'scripts/write-douyin-build-config.js',
    'scripts/prepare-bootstrap.js',
    'scripts/postbuild-wechat.js',
    'scripts/postbuild-wechat-minigame.js',
    'scripts/postbuild-minigame-bundles.js',
    'scripts/postbuild-douyin.js',
    'scripts/verify-douyin-build.js',
    'scripts/verify-wechat-build.js',
    'scripts/patch-home-assets-bundle.js',
    'scripts/verify-bundle-native-files.js',
    'scripts/smoke-wechat-preview.js',
    'scripts/verify-ui-ownership.js',
    'scripts/verify-cocos-meta.js',
    'scripts/audit-assets.js',
    'scripts/write-level-manifest.js',
    'scripts/write-level-data-cdn.js',
    'scripts/sync-cdn-wechat.js',
]) {
    assert.ok(exists(filePath), `${filePath} must exist`);
}

const buildWechat = read('scripts/build-wechat.js');
for (const required of [
    'WECHAT_APPID',
    'WECHAT_GAME_ASSETS_MODE',
    'minigame-build-common.js',
    'scripts/prepare-bootstrap.js',
    'scripts/write-level-data-cdn.js',
    'scripts/write-wechat-build-config.js',
    'scripts/postbuild-wechat.js',
    'scripts/postbuild-minigame-bundles.js',
    'build/level-data-cdn',
    'build/wechatgame',
    'cleanCocosGeneratedCaches',
    'repairCocosMetaFiles',
    'spawnCocosBuild',
    'assets/LevelData',
    'BootstrapBundle',
    'HomeAssetsBundle',
    'validateHomeAssetsBundle',
    '本地 homeAssets bundle script 缺少稳定入口 index.js',
    '本地 gameAssets bundle script 缺少稳定入口 index.js',
    'assertRuntimeScenes',
    'assertSourceBundleArtifactsExist',
    'db://assets/Scenes/Loading.scene',
    'db://assets/HomeAssetsBundle/Scenes/Home.scene',
    'db://assets/Scenes/Game.scene',
    'bean-atlas-data.json',
    'GameUI/bg_game_pindd',
    'GameUI/solid_white',
    'GameAssetsBundle 不应包含豆豆图集资源',
    'GameAssetsBundle 不应包含旧单豆图片目录',
    'validateLevelDataCdn',
    'level_live.json',
    'zt_level_',
    'collectSourceLevelDataEntries',
    'getAnimationInterval',
    'gameAssets 分包',
    'homeAssets 分包',
    '启动下载量',
    'gameAssets 微信分包缺少入口 game.js',
    'main bundle 不应依赖 \' + bundleName',
]) {
    assert.ok(buildWechat.includes(required), `build-wechat.js must include ${required}`);
}
const minigameBuildCommon = read('scripts/minigame-build-common.js');
for (const required of [
    'parseBuildMode',
    'stale asset-db/importer',
    'scripts/repair-cocos-meta.js',
    'configPath=',
    'resolveCocosCli',
    'spawnCocosBuild',
]) {
    assert.ok(minigameBuildCommon.includes(required), `minigame-build-common.js must include ${required}`);
}
assert.strictEqual(buildWechat.includes('syncBootstrapSourceAssets'), false, 'build-wechat.js must delegate bootstrap preparation to prepare-bootstrap.js');
assert.strictEqual(buildWechat.includes('build-douyin'), false, 'build-wechat.js must stay Douyin-free');
assert.strictEqual(buildWechat.includes('remote_dy'), false, 'build-wechat.js must not point to Douyin CDN');
const legacyResourcesPath = 'assets/' + 'Resources';
assert.strictEqual(buildWechat.includes(legacyResourcesPath), false, 'build-wechat.js must not depend on legacy Resources');
assert.strictEqual(buildWechat.includes('profiles/v2/packages/wechatgame.json'), false, 'build-wechat.js must not depend on missing Creator profile files');
assert.strictEqual(buildWechat.includes('Atlas/bootstrap-atlas'), false, 'build-wechat.js must not restore legacy bootstrap atlas path');
assert.strictEqual(exists('assets/BootstrapBundle/Atlas'), false, 'BootstrapBundle must not keep legacy Atlas/bootstrap-atlas source directory');
assert.strictEqual(exists('assets/GameAssetsBundle/Textures/Beans/bean-atlas.json'), false, 'Remote bean atlas JSON must not share the PNG logical path');
assert.strictEqual(exists('assets/GameAssetsBundle/Textures/Beans/bean-atlas-data.json'), false, 'Remote bean atlas data must move to BootstrapBundle');
assert.strictEqual(exists('assets/GameAssetsBundle/Textures/Beans/bean-atlas.png'), false, 'Remote bean atlas image must move to BootstrapBundle');
assert.ok(exists('assets/BootstrapBundle/Beans/bean-atlas-data.json'), 'Bootstrap bean atlas JSON must exist');
assert.ok(exists('assets/BootstrapBundle/Beans/bean-atlas.png'), 'Bootstrap bean atlas PNG must exist');
assert.strictEqual(exists('assets/GameAssetsBundle/Textures/Pindd/Beans'), false, 'GameAssetsBundle must not keep legacy single bean PNG directory');
assert.ok(exists('assets/BootstrapBundle/LevelData/level_1.json'), 'BootstrapBundle must keep mainline first level_1');
assert.strictEqual(exists('assets/BootstrapBundle/LevelData/level_2.json'), false, 'BootstrapBundle must not keep stale first-level snapshot level_2');
assert.ok(exists('assets/GameAssetsBundle/UI/Prefabs/Panels/RewardResultPopup.prefab'), 'RewardResultPopup prefab must exist');
const auditAssets = read('scripts/audit-assets.js');
assert.ok(auditAssets.includes('solid_white.png must stay a 1x1 8-bit RGBA PNG'), 'audit-assets must guard solid_white.png against WeChat 4930 decode regressions');
assert.ok(auditAssets.includes('Home.scene startup SpriteFrames must remain in HomeAssetsBundle'), 'audit-assets must keep Home startup SpriteFrames in HomeAssetsBundle');
assert.ok(auditAssets.includes('Scenes must not reference missing SpriteFrame assets'), 'audit-assets must catch deleted scene SpriteFrame sources');
assert.ok(auditAssets.includes('Scenes must not strong-reference GameAssetsBundle SpriteFrames'), 'audit-assets must keep scene SpriteFrames out of GameAssetsBundle strong references');
assert.ok(auditAssets.includes('assets/GameAssetsBundle/Textures/UI/主页标题.png'), 'audit-assets must forbid duplicated Home startup art in GameAssetsBundle');
assert.ok(auditAssets.includes('e82626ae-c0c9-aa40-532e-293d6db5eaf2@f9941'), 'audit-assets must require the Home BG SpriteFrame UUID');
assert.ok(auditAssets.includes('collectSceneSpriteFrameRefs'), 'audit-assets must scan scene SpriteFrame refs for missing source assets');
assert.ok(auditAssets.includes('slot_row_lock_dash_ui.png'), 'audit-assets must require first-level lock dash source art');

const prepareBootstrap = read('scripts/prepare-bootstrap.js');
for (const required of [
    'const bootstrapLevelIds = [1]',
    'BootstrapBundle/Beans',
    'assets/LevelData',
    'bean-atlas-data.json',
    'bean-atlas.png',
    'validateRemoteDoesNotOwnBeanAtlas',
    'Bootstrap bean atlas 缺少首屏/全关卡豆豆帧',
]) {
    assert.ok(prepareBootstrap.includes(required), `prepare-bootstrap.js must include ${required}`);
}
const patchBootstrapAssets = read('scripts/patch-bootstrap-dynamic-assets.js');
for (const required of [
    'BootstrapBundle',
    'cc.ImageAsset',
    'cc.Texture2D',
    'cc.SpriteFrame',
    'subMetas',
    'native',
    'configEntries',
]) {
    assert.ok(patchBootstrapAssets.includes(required), `patch-bootstrap-dynamic-assets.js must include ${required}`);
}
const patchHomeAssets = read('scripts/patch-home-assets-bundle.js');
for (const required of [
    'HomeAssetsBundle',
    'GameAssetsBundle',
    'collectSourceBundleArtifacts',
    'assetDbImportPath',
    'copyNative',
    'artifacts patched',
]) {
    assert.ok(patchHomeAssets.includes(required), `patch-home-assets-bundle.js must include ${required}`);
}
const postbuildMinigameBundles = read('scripts/postbuild-minigame-bundles.js');
for (const required of [
    'scripts/patch-bootstrap-dynamic-assets.js',
    'scripts/patch-home-assets-bundle.js',
    '补齐 bootstrap 动态图片',
    '补齐 homeAssets 分包资源产物',
    '补齐 gameAssets 分包资源产物',
]) {
    assert.ok(postbuildMinigameBundles.includes(required), `postbuild-minigame-bundles.js must include ${required}`);
}
const postbuildDouyin = read('scripts/postbuild-douyin.js');
for (const required of [
    'scripts/postbuild-minigame-bundles.js',
    'scripts/verify-douyin-build.js',
    'ensureBundleSubpackage',
    "path.join(runtimeRoot, 'assets', bundleName)",
    '__PDD_BUILD_PLATFORM__',
    '__PDD_DOUYIN_BUILD_MODE__',
    '__PDD_DOUYIN_CLOUD_ENV__',
    '__PDD_DOUYIN_CLOUD_PATH_PREFIX__',
    'remote_douyin/levels/',
    'bootstrap',
    'homeAssets',
    'gameAssets',
    'preloadBundles',
    'subpackages',
]) {
    assert.ok(postbuildDouyin.includes(required), `postbuild-douyin.js must include ${required}`);
}
const buildDouyin = read('scripts/build-douyin.js');
for (const required of [
    'node scripts/build-douyin.js <--release|--debug>',
    'build/bytedance-mini-game',
    'build/level-data-cdn-douyin',
    'scripts/prepare-bootstrap.js',
    'scripts/write-douyin-build-config.js',
    'scripts/postbuild-douyin.js',
    'scripts/verify-douyin-build.js',
    'spawnCocosBuild',
    'DOUYIN_CLEAN_COCOS_CACHE',
    'remote_douyin/levels/',
    'validateLevelDataCdn',
    'zt_level_',
    'collectSourceLevelDataEntries',
    'levelCounts.',
    'pack.levelKeys',
]) {
    assert.ok(buildDouyin.includes(required), `build-douyin.js must include ${required}`);
}
const douyinBuildConfig = read('scripts/write-douyin-build-config.js');
for (const required of [
    'platform: \'bytedance-mini-game\'',
    'outputName: \'bytedance-mini-game\'',
    'taskName: \'bytedance-mini-game\'',
    'DOUYIN_APPID',
    'mainBundleCompressionType: \'subpackage\'',
    'db://assets/HomeAssetsBundle',
    'name: \'homeAssets\'',
    'db://assets/GameAssetsBundle',
    'name: \'gameAssets\'',
    'db://assets/LevelData',
    'name: \'levelData\'',
    'compressionType: \'subpackage\'',
]) {
    assert.ok(douyinBuildConfig.includes(required), `write-douyin-build-config.js must include ${required}`);
}
const verifyDouyinBuild = read('scripts/verify-douyin-build.js');
for (const required of [
    'bytedance-mini-game',
    'assertSourceBundleArtifactsExist',
    'assertBundleNativeFilesExist',
    'HomeAssetsBundle',
    'GameAssetsBundle',
    'settings.assets.preloadBundles 顺序错误，应为 bootstrap -> main',
    'settings.assets.subpackages 缺少 \' + bundleName',
    '__PDD_LEVEL_DATA_CDN_URL__',
    'checkScene',
    'navigateToScene',
    '抖音主包超过 4MB 硬限制',
    '抖音总包超过 20MB 硬限制',
    'release game.json.subpackages 不应包含 levelData',
    'collectSourceLevelDataEntries',
    'zt_level_',
    'levelCounts.',
    'pack.levelKeys',
    '抖音关卡数据 CDN 重复关卡 key',
    '抖音关卡数据 CDN 缺少真源关卡',
]) {
    assert.ok(verifyDouyinBuild.includes(required), `verify-douyin-build.js must include ${required}`);
}
const verifyBundleNativeFiles = read('scripts/verify-bundle-native-files.js');
for (const required of [
    'decodeUuid',
    'collectVersionedUuids',
    'collectSourceBundleArtifacts',
    'assertSourceBundleArtifactsExist',
    'assertBundleNativeFilesExist',
    'importArtifactPath',
    'findImportArtifact',
    'findNativeArtifact',
    'isRuntimeImportJson',
]) {
    assert.ok(verifyBundleNativeFiles.includes(required), `verify-bundle-native-files.js must include ${required}`);
}
assert.strictEqual(verifyBundleNativeFiles.includes("subMeta.importer === 'texture'"), false, 'bundle artifact verification must not skip texture subMeta import JSON');
const extractBootstrap = read('scripts/extract-bootstrap-bundle.js');
assert.ok(extractBootstrap.includes('LevelData/level_1'), 'bootstrap extraction must keep level_1');
for (const required of [
    'cc.Prefab',
    'collectReferencedUuids',
    'expandPrefabDependencyEntries',
]) {
    assert.ok(extractBootstrap.includes(required), `bootstrap extraction must include ${required}`);
}
assert.strictEqual(extractBootstrap.includes('LevelData/level_2'), false, 'bootstrap extraction must not keep stale level_2');
assert.strictEqual(extractBootstrap.includes('Audio/'), false, 'bootstrap extraction must not copy audio into the main package');

const gameAssetsBundleMeta = JSON.parse(read('assets/GameAssetsBundle.meta'));
assert.strictEqual(gameAssetsBundleMeta.userData?.compressionType, 'subpackage', 'GameAssetsBundle must build as a WeChat subpackage');
assert.strictEqual(gameAssetsBundleMeta.userData?.isRemote, undefined, 'GameAssetsBundle must not be a Cocos gameAssets bundle');
const homeAssetsBundleMeta = JSON.parse(read('assets/HomeAssetsBundle.meta'));
assert.strictEqual(homeAssetsBundleMeta.userData?.isBundle, true, 'HomeAssetsBundle must be a Cocos bundle');
assert.strictEqual(homeAssetsBundleMeta.userData?.bundleName, 'homeAssets', 'HomeAssetsBundle bundle name must be homeAssets');

const buildConfig = read('scripts/write-wechat-build-config.js');
for (const required of [
    '<--release|--debug>',
    'wxbb6160c828f380ca',
    'platform: \'wechatgame\'',
    'buildMode: \'minify\'',
    'WECHAT_SEPARATE_ENGINE',
    'resolveSeparateEngine',
    'sourceMaps: false',
    'debug: false',
    'md5Cache: true',
    'startScene',
    'readAssetUuid',
    'makeRuntimeScenes',
    'db://assets/Scenes/Game.scene',
    'db://assets/HomeAssetsBundle',
    'name: \'homeAssets\'',
    'mainBundleCompressionType: \'subpackage\'',
    'db://assets/GameAssetsBundle',
    'name: \'gameAssets\'',
    'db://assets/LevelData',
    'name: \'levelData\'',
    'compressionType: \'subpackage\'',
    'isRemote: false',
]) {
    assert.ok(buildConfig.includes(required), `write-wechat-build-config.js must include ${required}`);
}

const debugConfigPath = path.join(root, 'temp', 'test-wechat-build-config-debug.json');
const releaseConfigPath = path.join(root, 'temp', 'test-wechat-build-config-release.json');
const douyinReleaseConfigPath = path.join(root, 'temp', 'test-douyin-build-config-release.json');
runNode('scripts/write-wechat-build-config.js', [
    debugConfigPath,
    'db://assets/Scenes/Game.scene',
    'test-scene-uuid',
    '--debug',
]);
runNode('scripts/write-wechat-build-config.js', [
    releaseConfigPath,
    'db://assets/Scenes/Game.scene',
    'test-scene-uuid',
    '--release',
]);
runNode('scripts/write-douyin-build-config.js', [
    douyinReleaseConfigPath,
    'db://assets/Scenes/Game.scene',
    'test-scene-uuid',
    '--release',
]);
assert.strictEqual(JSON.parse(fs.readFileSync(debugConfigPath, 'utf8')).packages.wechatgame.separateEngine, false, 'debug 微信构建必须关闭 Cocos 插件分离引擎');
assert.strictEqual(JSON.parse(fs.readFileSync(releaseConfigPath, 'utf8')).packages.wechatgame.separateEngine, false, 'release 微信构建也必须默认关闭 Cocos 插件分离引擎');
assert.strictEqual(JSON.parse(fs.readFileSync(douyinReleaseConfigPath, 'utf8')).platform, 'bytedance-mini-game', 'release 抖音构建必须使用 Cocos 抖音平台');
fs.rmSync(debugConfigPath, { force: true });
fs.rmSync(releaseConfigPath, { force: true });
fs.rmSync(douyinReleaseConfigPath, { force: true });

const postbuildEntrypoint = read('scripts/postbuild-wechat.js');
assert.ok(postbuildEntrypoint.includes("require('./postbuild-wechat-minigame.js')"), 'postbuild-wechat.js must wrap the WeChat minigame postbuild implementation');
const postbuild = postbuildEntrypoint + '\n' + read('scripts/postbuild-wechat-minigame.js');
for (const required of [
    'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat/levels/',
    'PDD_LEVEL_DATA_CDN_URL',
    '__PDD_BUILD_PLATFORM__',
    '__PDD_WECHAT_BUILD__',
    '__PDD_WECHAT_BUILD_MODE__',
    '__PDD_GAME_ASSETS_MODE__',
    '__PDD_LEVEL_DATA_CDN_URL__',
    '__PDD_RELEASE_LOG_GATE_INSTALLED__',
    'ensureStableGameAssetsBundleScriptLoader',
    'function walkFiles',
    'minigameRootPath',
    'openDataContext',
    'globalThis.__rawWx',
    'homeAssets/gameAssets 必须是微信分包/本地 bundle',
    'ensureHomeAssetsWechatSubpackage',
    'ensureGameAssetsWechatSubpackage',
    'ensureSubpackageGameJs',
    'HOME_ASSETS_BUNDLE_NAME',
    'subpackages/gameAssets',
    "'subpackages/' + LEVEL_DATA_BUNDLE_NAME",
    '本地 resources bundle 已移除',
    'projectBundles',
    'ensureStartupPreloadBundles',
    'startup preload: bootstrap -> main',
    'homeAssets/gameAssets 分包目录由微信 subpackages 承载',
    'patchDeprecatedDirectorAnimationIntervalWarning',
    'getAnimationInterval',
    '微信运行时代码仍包含 director.getAnimationInterval',
]) {
    assert.ok(postbuild.includes(required), `postbuild-wechat-minigame.js must include ${required}`);
}
for (const forbidden of [
    '__PDD_BOOT_REPORT_SENT__',
    'wxApi.reportAnalytics',
    'pdd_boot_probe',
    'game_js_top',
    '__PDD_REMOTE_LIVE_URL__',
    'resolvePddRemoteLiveVersion',
    '__PDD_REMOTE_LIVE_VERSION__',
    'writeLiveManifest',
    'minigame/remote (local)',
]) {
    assert.strictEqual(postbuild.includes(forbidden), false, `postbuild-wechat-minigame.js must not keep uncertain boot probe ${forbidden}`);
}

const verifyWechat = read('scripts/verify-wechat-build.js');
for (const required of [
    'wxbb6160c828f380ca',
    'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat/levels/',
    'UIPreview',
    'PanelPreview',
    'FxPreview',
    'Game.scene 直接引用了未登记 prefab',
    'Game.scene 直接引用了 GameAssetsBundle 资源',
    'assertRuntimeScenes',
    'db://assets/Scenes/Loading.scene',
    'db://assets/HomeAssetsBundle/Scenes/Home.scene',
    'db://assets/Scenes/Game.scene',
    'assets/Prefabs/Panels/RevivePanel.prefab',
    'openDataContext',
    '微信包不应启用 Cocos 插件分离引擎',
    '微信包仍引用未授权 Cocos 插件',
    'plugin:cocos',
    'wx0446ba2621dda60a',
    'Arrow(?:Left|Right)',
    '微信包仍将 CollectionPanel 翻页箭头当成 prefab 必需节点',
    'findSubpackageRoot',
    'resolveBundleDir',
    'main bundle 不应依赖 \' + bundleName',
    'subMetas',
    'bootstrap stable index.js',
    'game.js 不应注入 Cocos remote live.json 启动逻辑',
    'level_live.json',
    'levelDataCdnPath',
    '__PDD_WECHAT_BUILD__',
    '__PDD_WECHAT_BUILD_MODE__',
    '__PDD_LEVEL_DATA_CDN_URL__',
    'settings.assets.subpackages 缺少 homeAssets',
    'game.json.subpackages 缺少 homeAssets',
    'settings.assets.subpackages 缺少 gameAssets',
    'game.json.subpackages 缺少 gameAssets',
    'homeAssets 微信分包目录',
    'homeAssets 分包 game.js',
    'assertSourceBundleArtifactsExist',
    'gameAssets 微信分包目录',
    'gameAssets 分包 game.js',
    'levelData 微信分包目录',
    'release 包不应包含本地 levelData bundle',
    'assets/gameAssets',
    'GameCtrl',
    'Beans/bean-atlas-data',
    'GameUI/bg_game_pindd',
    'GameUI/solid_white',
    '关卡数据 CDN 关卡数量异常',
    'zt_level_',
    'collectSourceLevelDataEntries',
    'getAnimationInterval',
    'LevelData/level_1',
    'bootstrap 不应包含非首关候选关卡',
    '未与 assets/LevelData 真源同步',
    'assertStartupPreloadOrder',
    'bootstrap -> main',
    'startupDownload',
]) {
    assert.ok(verifyWechat.includes(required), `verify-wechat-build.js must include ${required}`);
}
for (const forbidden of [
    '__PDD_BOOT_REPORT_SENT__',
    'wxApi.reportAnalytics',
    'pdd_boot_probe',
    'game_js_top',
    'CDN live.json remoteVersion',
    'gameAssets bundle-scripts versioned stub',
]) {
    assert.strictEqual(verifyWechat.includes(forbidden), false, `verify-wechat-build.js must not require uncertain boot probe ${forbidden}`);
}
assert.strictEqual(verifyWechat.includes('Douyin'), false, 'verify-wechat-build.js must stay Douyin-free');

const wechatPreviewSmoke = read('scripts/smoke-wechat-preview.js');
for (const required of [
    '--screenshot',
    '--logs',
    '--url',
    'Please load bundle gameAssets first',
    'gameAssets_bundle_missing_after_preload',
    '预览截图疑似黑屏',
    'WECHAT_PREVIEW_URL',
    'playwright',
]) {
    assert.ok(wechatPreviewSmoke.includes(required), `smoke-wechat-preview.js must include ${required}`);
}

const syncWechat = read('scripts/sync-cdn-wechat.js');
for (const required of [
    '--dry-run',
    'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat/levels/',
    'oss-cn-beijing',
    'game-pdd-v2',
    'syGame/pdd_v2/remote_wechat/levels/',
    'build\', \'level-data-cdn',
    'level_packs',
    'level_live.json',
    'liveOssTarget',
    'level_live.json 已最后处理',
    'dataVersion',
    'validateLevelDataPackage',
    'zt_level_',
    'collectSourceLevelDataKeys',
    'public-read',
]) {
    assert.ok(syncWechat.includes(required), `sync-cdn-wechat.js must include ${required}`);
}
assert.ok(syncWechat.includes('remote_dy'), 'sync-cdn-wechat.js must guard against Douyin CDN targets');
assert.strictEqual(syncWechat.includes('bundleVers.gameAssets'), false, 'sync-cdn-wechat.js must not depend on Cocos gameAssets bundle versions');
assert.strictEqual(syncWechat.includes('CDN config'), false, 'sync-cdn-wechat.js must not upload Cocos gameAssets bundle config');

const metaCheck = read('scripts/verify-cocos-meta.js');
assert.ok(metaCheck.includes("importer === '*'"), 'verify-cocos-meta.js must detect importer "*"');

const uiOwnershipCheck = read('scripts/verify-ui-ownership.js');
for (const required of [
    'LEGACY_RUNTIME_UI_FILES',
    'CODE_OWNED_DYNAMIC_UI_FILES',
    'OWNERSHIP_RISK_PATTERNS',
    'getOrCreateUiChild',
    'ensureSpriteNode',
    'forceSize',
    'new Node',
    'Graphics',
    'setContentSize',
    'Label.fontSize',
    'frozen stable-UI owner files',
    'code-owned dynamic UI files',
    'new runtime stable-UI owner files detected',
    'assertGameSceneStaticUiOwnership',
    'GameplayFixedRoot must not own SafeArea',
    'BoardArea must not own a static Widget viewport',
    'CollectionPanel.prefab must not keep obsolete',
]) {
    assert.ok(uiOwnershipCheck.includes(required), `verify-ui-ownership.js must include ${required}`);
}

const assetAudit = read('scripts/audit-assets.js');
for (const required of [
    'root Textures duplicates runtime bundle source',
    'Textures/Beans and Textures/Pindd/Beans',
    'assets contains cleaned legacy runtime resources',
    '.DS_Store',
]) {
    assert.ok(assetAudit.includes(required), `audit-assets.js must guard ${required}`);
}

const openDataContextIndex = read('openDataContext/index.js');
assert.ok(openDataContextIndex.includes('wx.getSharedCanvas()'), 'openDataContext/index.js must use the WeChat shared canvas');
assert.strictEqual(openDataContextIndex.includes('Canvas.width ='), false, 'openDataContext/index.js must not assign read-only shared canvas width');
assert.strictEqual(openDataContextIndex.includes('Canvas.height ='), false, 'openDataContext/index.js must not assign read-only shared canvas height');

const levelManifestWriter = read('scripts/write-level-manifest.js');
for (const required of [
    "'assets', 'LevelData'",
    'levelId',
    'timeLimit',
    'colorIds',
]) {
    assert.ok(levelManifestWriter.includes(required), `write-level-manifest.js must include ${required}`);
}
assert.ok(exists('assets/LevelData/level-manifest.json'), 'level manifest must be generated into assets/LevelData');

const levelDataCdnWriter = read('scripts/write-level-data-cdn.js');
for (const required of [
    "'assets', 'LevelData'",
    "'build', 'level-data-cdn'",
    'level_packs',
    'level_live.json',
    'dataVersion',
    'packSize',
    'zt_level_',
    'prefix',
    'theme',
]) {
    assert.ok(levelDataCdnWriter.includes(required), `write-level-data-cdn.js must include ${required}`);
}

const gameCtrlEntry = read('assets/Scripts/Core/GameCtrl.ts');
const gameCtrlShared = read('assets/Scripts/Core/GameCtrlShared.ts');
const gameCtrlHelperFiles = [
    'assets/Scripts/Core/GameRuntimeHost.ts',
    'assets/Scripts/Core/GameCtrlState.ts',
    'assets/Scripts/Core/AppRoot.ts',
    'assets/Scripts/Core/AppSession.ts',
    'assets/Scripts/Core/SceneRouter.ts',
    'assets/Scripts/Core/GameSceneRuntimeController.ts',
    'assets/Scripts/Core/LevelDataCdnService.ts',
    'assets/Scripts/Core/SlotOnboardingPolicy.ts',
    'assets/Scripts/Core/GameplaySessionController.ts',
    'assets/Scripts/Core/GameplaySlotUiController.ts',
    'assets/Scripts/Core/GameplaySkillUiController.ts',
    'assets/Scripts/Core/GameplayViewController.ts',
    'assets/Scripts/Core/installGameCtrlModules.ts',
    'assets/Scripts/Platform/installPlatformGameCtrlModules.ts',
    'assets/Scripts/Platform/Douyin/installDouyinGameCtrlModules.ts',
    'assets/Scripts/Platform/Douyin/DouyinSidebarModule.ts',
].filter(exists);
const gameCtrlPanelControllerFiles = exists('assets/Scripts/Core/Panels')
    ? fs.readdirSync(path.join(root, 'assets/Scripts/Core/Panels'))
        .filter((name) => name.endsWith('.ts'))
        .sort()
        .map((name) => `assets/Scripts/Core/Panels/${name}`)
    : [];
const gameCtrlModuleFiles = fs.readdirSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules'))
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => `assets/Scripts/Core/GameCtrlModules/${name}`);
const gameCtrl = [gameCtrlEntry, gameCtrlShared, ...gameCtrlHelperFiles.map(read), ...gameCtrlPanelControllerFiles.map(read), ...gameCtrlModuleFiles.map(read)].join('\n');
const gameplaySkillUiController = read('assets/Scripts/Core/GameplaySkillUiController.ts');
const levelDataCdnService = read('assets/Scripts/Core/LevelDataCdnService.ts');
const sySdkMgr = read('assets/Scripts/Core/SySDKMgr.ts');
const boardInputViewportModule = read('assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts');
const settlementHudModule = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const tutorialGuideModule = read('assets/Scripts/Core/GameCtrlModules/TutorialGuideModule.ts');
const gameplayViewController = read('assets/Scripts/Core/GameplayViewController.ts');
const audioMgr = read('assets/Scripts/Core/AudioMgr.ts');
const audioManifest = read('assets/Scripts/Core/AudioManifest.ts');
const uiManifest = read('assets/Scripts/Core/UiManifest.ts');
const gameScene = read('assets/Scenes/Game.scene');
const gameSceneJson = JSON.parse(gameScene);
const homeScene = read('assets/HomeAssetsBundle/Scenes/Home.scene');
const homeSceneJson = JSON.parse(homeScene);
const collectionPanelJson = JSON.parse(read('assets/GameAssetsBundle/UI/Prefabs/Panels/CollectionPanel.prefab'));

function findSceneNodeByPath(sceneJson, rootName, childPath) {
    const rootIndex = sceneJson.findIndex((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === rootName);
    if (rootIndex < 0) return null;
    let current = sceneJson[rootIndex];
    for (const segment of childPath.split('/')) {
        const childRef = (current._children || []).find((ref) => sceneJson[ref.__id__]?._name === segment);
        if (!childRef) return null;
        current = sceneJson[childRef.__id__];
    }
    return current;
}

function getSceneDirectChildNames(sceneJson, node) {
    return (node._children || []).map((ref) => sceneJson[ref.__id__]?._name).filter(Boolean);
}

function sceneNodeHasComponent(sceneJson, node, componentType) {
    return (node._components || []).some((ref) => sceneJson[ref.__id__]?.__type__ === componentType);
}

function getSceneNodeComponent(sceneJson, node, componentType) {
    const componentRef = (node._components || []).find((ref) => sceneJson[ref.__id__]?.__type__ === componentType);
    return componentRef ? sceneJson[componentRef.__id__] : null;
}

function assertSceneSpriteFrame(sceneJson, rootName, childPath, expectedUuid) {
    const node = findSceneNodeByPath(sceneJson, rootName, childPath);
    assert.ok(node, `Game.scene must contain ${rootName}/${childPath}`);
    const sprite = getSceneNodeComponent(sceneJson, node, 'cc.Sprite');
    assert.ok(sprite, `Game.scene ${rootName}/${childPath} must own a Sprite component`);
    assert.strictEqual(sprite._spriteFrame?.__uuid__, expectedUuid, `Game.scene ${rootName}/${childPath} must keep SpriteFrame ${expectedUuid}`);
}

function findPrefabRootChild(prefabJson, name) {
    const root = prefabJson[1];
    const childRef = (root._children || []).find((ref) => prefabJson[ref.__id__]?._name === name);
    return childRef ? prefabJson[childRef.__id__] : null;
}

function assertSceneComponentBackrefs(sceneJson, scenePath) {
    sceneJson.forEach((entry, nodeIndex) => {
        if (!entry || entry.__type__ !== 'cc.Node') return;
        for (const componentRef of entry._components || []) {
            const component = sceneJson[componentRef.__id__];
            assert.ok(component, `${scenePath} node ${entry._name} has missing component ${componentRef.__id__}`);
            assert.strictEqual(
                component.node?.__id__,
                nodeIndex,
                `${scenePath} component ${componentRef.__id__} (${component.__type__}) must point back to node ${entry._name}`,
            );
        }
    });
}

assertSceneComponentBackrefs(gameSceneJson, 'Game.scene');
assertSceneComponentBackrefs(homeSceneJson, 'Home.scene');

for (const [requiredHomePath, expected] of Object.entries({
    'BackgroundLayer/BG': { uuid: 'e82626ae-c0c9-aa40-532e-293d6db5eaf2@f9941', file: 'assets/HomeAssetsBundle/GameUI/home_bg.jpeg' },
    'TopBarGroup/SettingsButton/HomeSettingsIcon': { uuid: 'd301f7b8-b783-6861-36c5-31dbb54a2ac0@f9941', file: 'assets/BootstrapBundle/GameUI/设置.png' },
    'TopBarGroup/VigorGroup/LivesBanner': { uuid: '8885ec69-f7f4-bb71-8fd7-e110a5061a63@f9941', file: 'assets/HomeAssetsBundle/GameUI/爱心框.png' },
    'TopBarGroup/GoldGroup/GoldBanner': { uuid: '47b2f68a-ec42-b2e7-59e3-7ceba831b196@f9941', file: 'assets/HomeAssetsBundle/GameUI/金币框 (2).png' },
    'TitleLayer/TitleArt': { uuid: 'f7446f73-3160-35a9-ff10-9a1c6940e181@f9941', file: 'assets/HomeAssetsBundle/GameUI/主页标题.png' },
    'HeroLayer/HeroCard/HeroCardFrame': { uuid: '69f9cc1c-e9a2-8e2a-c828-fbeab6bacd79@f9941', file: 'assets/HomeAssetsBundle/GameUI/预览框.png' },
    'PrimaryActionLayer/StartBtn': { uuid: '75cae3b3-5efb-4d61-a32c-bbe6addd9369@f9941', file: 'assets/HomeAssetsBundle/GameUI/home_main_level_button.png' },
    'PrimaryActionLayer/ThemeBtn': { uuid: 'f27b64cc-2534-4939-a213-f7b380e0a442@f9941', file: 'assets/HomeAssetsBundle/GameUI/home_theme_button.png' },
    'EntryLayer/DailySignInBtn/标题底板': { uuid: '7eca609a-adaf-43b5-98c8-533ed332b8d5@f9941', file: 'assets/HomeAssetsBundle/GameUI/home_icon_title_plate.png' },
    'EntryLayer/DailySignInBtn/DailySignInIcon': { uuid: '68e9eb2e-772d-f1ab-a25c-b2f79daa0083@f9941', file: 'assets/HomeAssetsBundle/GameUI/签到1.png' },
    'EntryLayer/DailySignInBtn': { uuid: 'cedf8dec-7628-40a4-a330-516ee01b04df@f9941', file: 'assets/HomeAssetsBundle/GameUI/home_icon_background.png' },
    'EntryLayer/LeaderboardBtn/标题底板': { uuid: '7eca609a-adaf-43b5-98c8-533ed332b8d5@f9941', file: 'assets/HomeAssetsBundle/GameUI/home_icon_title_plate.png' },
    'EntryLayer/LeaderboardBtn/LeaderboardIcon': { uuid: '91a910e0-aaeb-094c-4b24-0ee12b074d31@f9941', file: 'assets/HomeAssetsBundle/GameUI/排行榜1.png' },
    'EntryLayer/LeaderboardBtn': { uuid: 'cedf8dec-7628-40a4-a330-516ee01b04df@f9941', file: 'assets/HomeAssetsBundle/GameUI/home_icon_background.png' },
    'EntryLayer/CollectionBtn/标题底板': { uuid: '7eca609a-adaf-43b5-98c8-533ed332b8d5@f9941', file: 'assets/HomeAssetsBundle/GameUI/home_icon_title_plate.png' },
    'EntryLayer/CollectionBtn/CollectionIcon': { uuid: '382d81c2-e3f4-5d6e-c6de-abcaed0907fd@f9941', file: 'assets/HomeAssetsBundle/GameUI/图鉴1.png' },
    'EntryLayer/CollectionBtn': { uuid: 'cedf8dec-7628-40a4-a330-516ee01b04df@f9941', file: 'assets/HomeAssetsBundle/GameUI/home_icon_background.png' },
})) {
    const node = findSceneNodeByPath(homeSceneJson, 'MainMenuFixedRoot', requiredHomePath);
    assert.ok(node, `Home.scene must contain startup SpriteFrame path ${requiredHomePath}`);
    assert.ok(sceneNodeHasComponent(homeSceneJson, node, 'cc.Sprite'), `Home.scene startup path must have Sprite component ${requiredHomePath}`);
    const sprite = getSceneNodeComponent(homeSceneJson, node, 'cc.Sprite');
    assert.strictEqual(sprite._spriteFrame?.__uuid__, expected.uuid, `Home.scene ${requiredHomePath} must use startup SpriteFrame ${expected.uuid}`);
    assert.ok(exists(expected.file), `Startup asset must exist: ${expected.file}`);
    assert.ok(exists(`${expected.file}.meta`), `Startup asset meta must exist: ${expected.file}.meta`);
    const gameAssetsDuplicate = expected.file.replace('assets/HomeAssetsBundle/GameUI/', 'assets/GameAssetsBundle/Textures/UI/');
    if (gameAssetsDuplicate !== expected.file) {
        assert.strictEqual(exists(gameAssetsDuplicate), false, `GameAssetsBundle must not duplicate ${gameAssetsDuplicate}`);
        assert.strictEqual(exists(`${gameAssetsDuplicate}.meta`), false, `GameAssetsBundle must not duplicate ${gameAssetsDuplicate}.meta`);
    }
}
const gameSettingsIconNode = findSceneNodeByPath(gameSceneJson, 'GameplayFixedRoot', 'TopBarGroup/Settings/SettingsIcon');
assert.ok(gameSettingsIconNode, 'Game.scene must contain first-level Settings/SettingsIcon');
const gameSettingsIconSprite = getSceneNodeComponent(gameSceneJson, gameSettingsIconNode, 'cc.Sprite');
assert.ok(gameSettingsIconSprite, 'Game.scene Settings/SettingsIcon must have a Sprite component');
assert.strictEqual(
    gameSettingsIconSprite._spriteFrame?.__uuid__,
    'd301f7b8-b783-6861-36c5-31dbb54a2ac0@f9941',
    'Game.scene first-level settings icon must use the Bootstrap settings SpriteFrame',
);
const gameCanvasNode = gameSceneJson.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === 'Canvas');
const gameScreenRootNode = findSceneNodeByPath(gameSceneJson, 'Canvas', 'ScreenRoot');
const gameplayRootNode = findSceneNodeByPath(gameSceneJson, 'ScreenRoot', 'GameplayRoot');
const gameplayFixedRootNode = findSceneNodeByPath(gameSceneJson, 'GameplayRoot', 'GameplayFixedRoot');
const gameplayRuntimeRootNode = findSceneNodeByPath(gameSceneJson, 'GameplayRoot', 'GameplayRuntimeRoot');
const topBarGroupNode = findSceneNodeByPath(gameSceneJson, 'GameplayFixedRoot', 'TopBarGroup');
const bottomHudGroupNode = findSceneNodeByPath(gameSceneJson, 'GameplayFixedRoot', 'BottomHudGroup');
const boardAreaNode = findSceneNodeByPath(gameSceneJson, 'GameplayFixedRoot', 'BoardArea');
const slotAreaNode = findSceneNodeByPath(gameSceneJson, 'GameplayFixedRoot', 'BottomHudGroup/SlotAreaGroup/SlotArea');
const overlayRootNode = findSceneNodeByPath(gameSceneJson, 'ScreenRoot', 'OverlayRoot');
assert.deepStrictEqual(getSceneDirectChildNames(gameSceneJson, gameCanvasNode), ['Camera', 'Game', 'ScreenRoot'], 'Game.scene Canvas must only directly host Camera, Game, and ScreenRoot');
assert.deepStrictEqual(
    getSceneDirectChildNames(gameSceneJson, gameScreenRootNode),
    ['GameplayRoot', 'PopupRoot', 'OverlayRoot', 'FxRoot', 'BootRoot'],
    'Game.scene ScreenRoot must directly host gameplay/popup/overlay/fx/boot roots',
);
assert.ok(gameplayRootNode, 'Game.scene must expose GameplayRoot under ScreenRoot');
assert.deepStrictEqual(
    getSceneDirectChildNames(gameSceneJson, gameplayRootNode),
    ['GameplayFixedRoot', 'GameplayRuntimeRoot'],
    'Game.scene GameplayRoot must directly host fixed and runtime roots',
);
assert.ok(gameplayFixedRootNode, 'Game.scene must expose GameplayRoot/GameplayFixedRoot');
assert.ok(gameplayRuntimeRootNode, 'Game.scene must expose GameplayRoot/GameplayRuntimeRoot');
assert.ok(topBarGroupNode, 'Game.scene must expose GameplayFixedRoot/TopBarGroup');
assert.ok(bottomHudGroupNode, 'Game.scene must expose GameplayFixedRoot/BottomHudGroup');
assert.ok(boardAreaNode, 'Game.scene must expose GameplayFixedRoot/BoardArea');
assert.ok(slotAreaNode, 'Game.scene must expose BottomHudGroup/SlotAreaGroup/SlotArea');
assert.ok(overlayRootNode, 'Game.scene must expose ScreenRoot/OverlayRoot');
assert.ok(getSceneDirectChildNames(gameSceneJson, overlayRootNode).includes('TutorialGuidePrompt'), 'OverlayRoot must expose the scene-owned tutorial guide prompt');
const tutorialGuidePromptNode = findSceneNodeByPath(gameSceneJson, 'OverlayRoot', 'TutorialGuidePrompt');
const tutorialGuidePromptBgNode = findSceneNodeByPath(gameSceneJson, 'OverlayRoot', 'TutorialGuidePrompt/BubbleBg');
const tutorialGuidePromptLabelNode = findSceneNodeByPath(gameSceneJson, 'OverlayRoot', 'TutorialGuidePrompt/PromptLabel');
assert.ok(tutorialGuidePromptNode, 'Game.scene must contain OverlayRoot/TutorialGuidePrompt');
assert.ok(tutorialGuidePromptBgNode, 'Game.scene must contain OverlayRoot/TutorialGuidePrompt/BubbleBg');
assert.ok(tutorialGuidePromptLabelNode, 'Game.scene must contain OverlayRoot/TutorialGuidePrompt/PromptLabel');
assert.strictEqual(tutorialGuidePromptNode._active, false, 'TutorialGuidePrompt must be hidden until tutorial runtime enables it');
const tutorialGuidePromptUi = getSceneNodeComponent(gameSceneJson, tutorialGuidePromptNode, 'cc.UITransform');
assert.ok(tutorialGuidePromptUi, 'TutorialGuidePrompt must own a UITransform');
const tutorialGuidePromptBgSprite = getSceneNodeComponent(gameSceneJson, tutorialGuidePromptBgNode, 'cc.Sprite');
assert.strictEqual(tutorialGuidePromptBgSprite?._spriteFrame?.__uuid__, '52e94005-3ca2-a20b-d083-d9c4e3836418@f9941', 'TutorialGuidePrompt/BubbleBg must use Bootstrap solid_white');
assert.strictEqual(tutorialGuidePromptBgSprite?._color?.a, 0, 'TutorialGuidePrompt/BubbleBg must default to transparent');
const tutorialGuidePromptLabel = getSceneNodeComponent(gameSceneJson, tutorialGuidePromptLabelNode, 'cc.Label');
assert.ok(tutorialGuidePromptLabel, 'TutorialGuidePrompt/PromptLabel must own a Label');
const gameplaySafeArea = getSceneNodeComponent(gameSceneJson, gameplayFixedRootNode, 'cc.SafeArea');
assert.strictEqual(gameplaySafeArea, null, 'GameplayFixedRoot must not own SafeArea');
for (const [label, node] of [['TopBarGroup', topBarGroupNode], ['BottomHudGroup', bottomHudGroupNode]]) {
    const safeArea = getSceneNodeComponent(gameSceneJson, node, 'cc.SafeArea');
    assert.ok(safeArea, `${label} must own a SafeArea`);
    assert.strictEqual(safeArea._enabled, true, `${label} SafeArea must be enabled`);
    assert.strictEqual(safeArea.node?.__id__, gameSceneJson.indexOf(node), `${label} SafeArea component must point back to ${label}`);
}
const boardAreaWidget = getSceneNodeComponent(gameSceneJson, boardAreaNode, 'cc.Widget');
assert.strictEqual(boardAreaWidget, null, 'BoardArea must not own a static Widget viewport');
assert.strictEqual(gameScene.includes('BoardArea_widget_static_viewport_20260608'), false, 'Game.scene must not keep the hard BoardArea viewport Widget id');
const slotAreaWidget = getSceneNodeComponent(gameSceneJson, slotAreaNode, 'cc.Widget');
assert.ok(slotAreaWidget, 'SlotArea must keep its Cocos Widget-owned bottom anchor');
for (const [requiredGamePath, expectedUuid] of [
    ['TopBarGroup/TimerWrap', '5683ea7b-fe35-4af6-9ec4-7dd5404f28f4@f9941'],
    ['BottomHudGroup/SlotAreaGroup/SlotArea/SlotRowLockedBtn', 'f695951c-15e0-425c-a013-409f05fc40a8@f9941'],
    ['BottomHudGroup/SkillArea/SkillWand', '0c10f393-7b94-4d57-a033-435838eb6272@f9941'],
    ['BottomHudGroup/SkillArea/SkillBrush', '0c10f393-7b94-4d57-a033-435838eb6272@f9941'],
    ['BottomHudGroup/SkillArea/SkillMagnet', '0c10f393-7b94-4d57-a033-435838eb6272@f9941'],
    ['BottomHudGroup/SkillArea/SkillWand/ToolIcon', 'fe3b21fb-5bb1-4134-86c7-f04c12f51e4e@f9941'],
    ['BottomHudGroup/SkillArea/SkillBrush/ToolIcon', 'c4c67346-098c-476e-8cb0-1e41de104528@f9941'],
    ['BottomHudGroup/SkillArea/SkillMagnet/ToolIcon', '500dcf3a-feba-4274-91dc-ff3f696bab43@f9941'],
    ['BottomHudGroup/SkillArea/SkillWand/AdPlayIcon', '70f86993-4128-41e8-bc6d-f09aff9fd929@f9941'],
    ['BottomHudGroup/SkillArea/SkillBrush/AdPlayIcon', '70f86993-4128-41e8-bc6d-f09aff9fd929@f9941'],
    ['BottomHudGroup/SkillArea/SkillMagnet/AdPlayIcon', '70f86993-4128-41e8-bc6d-f09aff9fd929@f9941'],
]) {
    assertSceneSpriteFrame(gameSceneJson, 'GameplayFixedRoot', requiredGamePath, expectedUuid);
}
for (const arrowName of ['ArrowLeft', 'ArrowRight']) {
    const arrow = findPrefabRootChild(collectionPanelJson, arrowName);
    assert.strictEqual(arrow, null, `CollectionPanel.prefab must not keep obsolete ${arrowName}`);
}
for (const filePath of ['assets/Scripts/Core/GameCtrl.ts', 'assets/Scripts/Core/GameCtrlShared.ts', ...gameCtrlHelperFiles, ...gameCtrlPanelControllerFiles, ...gameCtrlModuleFiles]) {
    const lineCount = read(filePath).split(/\r?\n/).length;
    assert.ok(lineCount < 1000, `${filePath} must stay below 1000 lines after GameCtrl split (actual ${lineCount})`);
}
assert.ok(
    gameCtrlEntry.includes('extends GameRuntimeHost')
        || gameCtrlEntry.includes('installGameCtrlModules(this);'),
    'GameCtrl entry must install split modules',
);
const gameRuntimeHost = read('assets/Scripts/Core/GameRuntimeHost.ts');
assert.ok(gameRuntimeHost.includes('installPlatformGameCtrlModules(this);'), 'GameRuntimeHost must install platform-specific modules');
assert.ok(gameCtrl.includes('installDouyinGameCtrlModules'), 'platform module installer must include Douyin modules');
assert.ok(gameCtrl.includes('navigateToScene'), 'Douyin sidebar runtime must include navigateToScene');
const prototypePatchNeedle = ['Object.assign(target', 'prototype'].join('.');
assert.strictEqual(gameCtrl.includes(prototypePatchNeedle), false, 'GameCtrl modules must not patch host prototypes');
assert.strictEqual(gameCtrlEntry.includes('class BoardViewportController'), false, 'GameCtrl entry must not inline BoardViewportController');
assert.ok(gameCtrlShared.includes('class BoardViewportController'), 'GameCtrlShared must own BoardViewportController');
assert.strictEqual(gameCtrl.includes('Atlas/bootstrap-atlas'), false, 'GameCtrl must use the current BootstrapBundle bean atlas path');
assert.ok(gameCtrl.includes('Beans/bean-atlas'), 'GameCtrl must use the current BootstrapBundle bean atlas path');
assert.strictEqual(gameCtrl.includes('Textures/Beans/bean-atlas-data'), false, 'GameCtrl must not load bean atlas from remote');
assert.ok(gameCtrl.includes('_clearSpriteFramesBeforeDestroy(root: Node)'), 'panel close must clear SpriteFrames before destroying panel nodes');
assert.ok(gameCtrl.includes('_destroyPanelAndReleaseTextures(panel: Node, names: string[], reason: string)'), 'panel close must centralize safe texture release');
assert.ok(gameCtrl.includes('let settingsClosed = false'), 'settings close must be idempotent');
assert.ok(gameCtrl.includes('evicted ${evicted} panel SpriteFrames from local cache'), 'panel close should only evict local SpriteFrame cache entries');
assert.strictEqual(gameCtrl.includes('releaseUnusedAssets'), false, 'panel close must not call global releaseUnusedAssets during gameplay');
assert.strictEqual(gameCtrl.includes('assetManager.releaseAsset(sf)'), false, 'panel close must not release SpriteFrame assets still possibly used by live renderers');
assert.strictEqual(gameCtrl.includes('releaseAsset(texture)'), false, 'panel close must not release shared textures still possibly used by live renderers');
assert.strictEqual(gameCtrl.includes('prepareMainMenuSceneSpriteFrames'), false, 'Home startup SpriteFrames must stay scene-authored in BootstrapBundle');
assert.ok(gameCtrl.includes('Home.scene is missing SpriteFrame'), 'Home menu must fail fast when a scene-authored startup SpriteFrame is missing');
assert.ok(gameCtrl.includes('renderMainMenuFixedRoot(fixedRoot);'), 'Home menu must render directly from scene-authored Bootstrap SpriteFrames');
assert.strictEqual(gameCtrl.includes('getSkillShellIconFrameName'), false, 'Gameplay skill shells must not fill missing scene SpriteFrames at runtime');
assert.ok(gameCtrl.includes('Game.scene must provide SpriteFrame on SkillArea/${node.name}'), 'Gameplay skill shells must fail fast when scene-authored plate SpriteFrame is missing');
assert.strictEqual(gameplaySkillUiController.includes("new Node('AdPlayIcon')"), false, 'Gameplay skill ad icon must be scene-authored, not runtime-created');
assert.strictEqual(gameplaySkillUiController.includes('new Node("AdPlayIcon")'), false, 'Gameplay skill ad icon must be scene-authored, not runtime-created');
assert.ok(gameplaySkillUiController.includes("getChildByName('AdPlayIcon')"), 'Gameplay skill UI must bind the scene-authored AdPlayIcon node');
assert.ok(gameplaySkillUiController.includes('adPlayIcon.active = showWhenZero'), 'Gameplay skill UI must show AdPlayIcon for zero-count ad entry');
assert.strictEqual(gameplaySkillUiController.includes("count <= 0 ? '+'"), false, 'Gameplay skill zero count must not render a plus/count badge');
assert.strictEqual(gameCtrl.includes("getSF('设置') || this.runtime.getSF('home_settings')"), false, 'Gameplay top bar settings icon must stay scene-authored');
assert.ok(gameCtrl.includes("const names: string[] = ['设置', ...GAMEPLAY_SLOT_TEXTURE_NAMES];"), 'Gameplay critical texture preload must include Bootstrap settings icon');
assert.ok(gameCtrlShared.includes("LOCAL_BOOTSTRAP_ALWAYS_TEXTURE_NAMES = new Set<string>(['设置', ...MAINLINE_SLOT_TEXTURE_NAMES, ...MAINLINE_GAMEPLAY_HUD_TEXTURE_NAMES])"), 'Bootstrap settings, mainline slot shells, timer, unlock button, and skill buttons must always load from BootstrapBundle');
assert.strictEqual(gameCtrl.includes('ensureTimerWrapFrame'), false, 'Gameplay timer frame must stay scene-authored');
assert.ok(gameCtrl.includes('Game.scene must provide SpriteFrame on ${path}'), 'Gameplay top-bar scene SpriteFrames must fail fast when missing');
assert.ok(gameCtrl.includes('Game.scene must provide SpriteFrame on SlotArea/SlotRowLockedBtn'), 'Slot unlock button must fail fast when scene-authored SpriteFrame is missing');
assert.ok(
    gameCtrl.includes("this._destroyPanelAndReleaseTextures(overlay, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, 'settings')")
        || gameCtrl.includes("runtime._destroyPanelAndReleaseTextures(overlay, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, 'settings')"),
    'settings panel must not release textures while destroyed sprites can still render',
);
assert.ok(gameCtrl.includes("from './UiManifest'"), 'GameCtrl must import UI resource dependencies from UiManifest');
assert.ok(uiManifest.includes('GAME_ASSETS_PRELOAD_TEXTURE_PATHS'), 'UiManifest must own remote preload textures');
assert.ok(uiManifest.includes('SETTINGS_PANEL_TEXTURE_NAMES'), 'UiManifest must own settings panel textures');
assert.ok(uiManifest.includes('LEADERBOARD_TEXTURE_NAMES'), 'UiManifest must own leaderboard panel textures');
assert.ok(uiManifest.includes('COLLECTION_TEXTURE_NAMES'), 'UiManifest must own collection panel textures');
assert.ok(uiManifest.includes('REWARD_RESULT_TEXTURE_NAMES'), 'UiManifest must own reward-result popup textures');
for (const requiredPopupTexture of [
    'popup_modal_shade',
    'popup_frame_soft',
    'popup_title_badge_blank',
    'popup_close_button',
    'popup_card_unlocked',
    'popup_card_locked',
    'popup_list_row_bg',
    'popup_primary_button',
    'popup_secondary_button',
    'popup_result_preview_plate',
    'popup_progress_bar_bg',
    'popup_progress_bar_fill',
    'popup_guide_bubble',
    'popup_guide_highlight_ring',
]) {
    assert.ok(uiManifest.includes(`'${requiredPopupTexture}'`), `UiManifest popup textures must include ${requiredPopupTexture}`);
    assert.ok(exists(`assets/GameAssetsBundle/Textures/UI/${requiredPopupTexture}.png`), `GameAssetsBundle must contain ${requiredPopupTexture}.png`);
    assert.ok(exists(`assets/GameAssetsBundle/Textures/UI/${requiredPopupTexture}.png.meta`), `GameAssetsBundle must contain ${requiredPopupTexture}.png.meta`);
}
assert.ok(audioMgr.includes("from './AudioManifest'"), 'AudioMgr must import audio resources from AudioManifest');
assert.ok(audioManifest.includes('AUDIO_SFX_RESOURCE_PATH'), 'AudioManifest must own SFX paths');
assert.ok(audioManifest.includes('AUDIO_BGM_RESOURCE_PATH'), 'AudioManifest must own BGM path');
assert.ok(audioManifest.includes("place: 'Audio/pindd/right_place_short'"), 'place SFX must use the trimmed short landing clip');
assert.ok(exists('assets/GameAssetsBundle/Audio/pindd/right_place_short.mp3'), 'trimmed place SFX asset must exist');
assert.ok(exists('assets/GameAssetsBundle/Audio/pindd/right_place_short.mp3.meta'), 'trimmed place SFX meta must exist');
assert.ok(audioMgr.includes('preload(name: SfxName)'), 'AudioMgr must expose a no-autoplay SFX preload entry point');
assert.ok(gameCtrl.includes("AudioMgr.inst.preload('place');"), 'gameplay init must preload place SFX before board-return landings');
assert.strictEqual(audioMgr.includes('const SFX_RESOURCE_PATH'), false, 'AudioMgr must not keep local SFX path map');
assert.strictEqual(audioMgr.includes("bundle.load('Audio/bgm'"), false, 'AudioMgr must load BGM through AudioManifest');
assert.ok(gameCtrl.includes('runtime.hideLoadingOverlayAfterGameplayReady();'), 'gameplay init must close loading only after visual readiness');
assert.ok(gameCtrl.includes('hideLoadingOverlayAfterGameplayReady()'), 'loading overlay module must expose a readiness-close method');
assert.strictEqual(gameCtrl.includes('this.hideLoadingOverlay();\n                this.initGame(data, activeLevelId);'), false, 'fast startup must not hide loading before initGame');
assert.strictEqual(gameCtrl.includes('this.hideLoadingOverlay();\r\n                this.initGame(data, activeLevelId);'), false, 'fast startup must not hide loading before initGame');
assert.ok(gameCtrl.includes("void AppRoot.inst.requestHomeSceneTransition('settings');"), 'settings home button must route through AppRoot');
assert.ok(gameCtrl.includes('function isSceneTraceEnabled()'), 'SceneRouter must gate trace logging by explicit debug query');
assert.ok(gameCtrl.includes('params.get(\'debug\') === \'1\' || params.get(\'log\') === \'1\' || !!params.get(\'ab\')'), 'SceneSplitTrace must only be enabled by debug/log/ab query');
assert.ok(gameCtrl.includes('ResolutionPolicy.FIXED_WIDTH'), 'scene runtime must use fixed-width resolution policy');
assert.strictEqual(gameCtrl.includes('ResolutionPolicy.SHOW_ALL'), false, 'Home/Game must not split into different resolution policies');
assert.ok(gameCtrl.includes("screenRoot?.getChildByName(name) || host.getChildByName(name)"), 'runtime root lookup must prefer ScreenRoot and fall back to Canvas');
const progressFillMeta = JSON.parse(read('assets/GameAssetsBundle/Textures/UI/progress_fill.png.meta'));
const progressFillLeftCap = progressFillMeta.subMetas.f9941.userData.borderLeft;
const progressFillRightCap = progressFillMeta.subMetas.f9941.userData.borderRight;
assert.ok(progressFillLeftCap > 0 && progressFillRightCap > 0, 'progress_fill cap insets must protect rounded ends');
assert.strictEqual(progressFillLeftCap, progressFillRightCap, 'progress_fill cap insets must stay symmetric');
assert.ok(
    gameCtrl.includes('this.startFlyToSlots(block.colorId, sources.slice(0, storedIdxs.length), storedIdxs, block.cells)'),
    'level2_slot guide must repaint source board cells when moving beans to slots',
);
assert.ok(
    gameCtrl.includes('const guideDirtyBoardCells = block.source === \'board\''),
    'guide board placement must collect source board dirty cells',
);
assert.ok(
    gameCtrl.includes('const guideDirtySlotIndices = [...this._selectedSlotIndices]'),
    'guide slot placement must collect source slot dirty indices',
);
assert.ok(
    gameCtrl.includes('this.startFlyPlace(block.colorId, sources, result.placed, guideDirtyBoardCells, guideDirtySlotIndices)'),
    'guide board placement must pass dirty board cells and slot indices to startFlyPlace',
);
assert.ok(gameCtrl.includes('const FLY_DELAY = 0.028'), 'board return visual flight stagger must keep original speed');
assert.ok(
    gameCtrl.includes("AudioMgr.inst.play('place');\r\n                        AudioMgr.inst.vibrate(30);")
        || gameCtrl.includes("AudioMgr.inst.play('place');\n                        AudioMgr.inst.vibrate(30);"),
    'board return place SFX must play on the bean landing callback',
);
assert.strictEqual(gameCtrl.includes('PLACE_SFX_STAGGER'), false, 'board return place SFX must not use delayed audio-only queue');
assert.strictEqual(gameCtrl.includes('placeSfxDelay'), false, 'board return place SFX must not continue after bean landing');
assert.ok(gameCtrl.includes("'slot_row_empty_pindd'"), 'slot rows must preload the visible Pindd empty row art');
assert.ok(gameCtrl.includes("showTrackedRewardedAd('unlock_slot_row'"), 'slot unlock rewarded ad must use the unified unlock_slot_row page');
assert.strictEqual(gameCtrl.includes("'expand_slot'"), false, 'slot unlock ads must not use the retired expand_slot page');
assert.strictEqual(gameCtrl.includes("consumePropCount('expand')"), false, 'slot row unlock must not consume retired expand inventory');
assert.strictEqual(gameCtrl.includes('doExpandSlot'), false, 'slot unlock flow must not keep the retired direct expand-slot ability');
assert.strictEqual(gameCtrl.includes('_addSlotUsed'), false, 'slot unlock flow must not keep retired expand-slot counters');
assert.strictEqual(gameCtrl.includes('解锁槽 x1'), false, 'gold shop must not expose retired unlock-slot prop');
assert.strictEqual(gameCtrl.includes('purchaseCost.expandSlot'), false, 'economy config must not keep retired unlock-slot purchase cost');
assert.strictEqual(gameCtrl.includes('reward.expand'), false, 'daily sign-in must not grant retired unlock-slot prop');
assert.ok(exists('assets/Scripts/Core/SlotOnboardingPolicy.ts.meta'), 'SlotOnboardingPolicy.ts must have Cocos meta');
assert.ok(exists('assets/Scripts/Core/LevelDataCdnService.ts.meta'), 'LevelDataCdnService.ts must have Cocos meta');
assert.ok(gameCtrl.includes('resolveSlotRowPolicy({'), 'gameplay session must resolve slot row policy at level start');
assert.ok(gameCtrl.includes('if (levelId === 1)'), 'slot policy must special-case level 1 as one-row onboarding');
assert.ok(gameCtrl.includes('levelId >= 3 && levelId <= 5'), 'slot policy must special-case levels 3-5');
assert.ok(gameCtrl.includes("return normalizeLevelId(levelId) === 2 ? 'free' : 'ad';"), 'level 2 slot unlock must be free');
assert.ok(gameCtrl.includes('return normalizeLevelId(levelId) >= 6;'), 'level 6+ must append ad-gated expansion rows after unlock');
assert.ok(gameCtrl.includes('if (currentLevel < 2)'), 'skill area must be hidden only for level 1');
assert.ok(gameCtrlShared.includes('const SKILL_UNLOCK_WAND = 3;'), 'magic wand must unlock when entering level 3');
assert.ok(gameCtrlShared.includes('const SKILL_UNLOCK_BROOM = 3;'), 'brush must unlock when entering level 3');
assert.ok(gameCtrlShared.includes('const SKILL_UNLOCK_MAGNET = 3;'), 'magnet must unlock when entering level 3');
assert.strictEqual(gameCtrl.includes("label.string = unlockMode === 'free' ? '免费解锁' : '看广告';"), false, 'slot unlock button must not render free/ad text labels');
assert.ok(gameCtrl.includes("'SlotUnlockIconFree'"), 'slot unlock button must expose a free mode icon');
assert.ok(gameCtrl.includes("'SlotUnlockIconAd'"), 'slot unlock button must expose an ad mode icon');
assert.ok(gameCtrl.includes("getChildByName('SlotUnlockModeLabel')"), 'slot unlock button must clean up legacy text labels');
assert.ok(gameCtrl.includes("const guideHandFrame = runtime.getSF('guide_hand')"), 'level 2 slot unlock guide must use the existing guide hand art');
assert.ok(gameCtrl.includes("new Node('SlotUnlockGuideHand')"), 'level 2 slot unlock guide must create a guide hand node');
assert.strictEqual(gameCtrl.includes("new Node('ExpandBubble')"), false, 'slot unlock guide must not use text-only bubble copy');
assert.ok(gameCtrl.includes('resolveSlotAreaSceneBaseRowCount(panelUi, sceneRowSpacing)'), 'slot UI must derive the visual base row count from the validated scene layout');
assert.ok(gameCtrl.includes('runtime.slotRowCount - this.getSlotAreaBaseRowCount()'), 'slot UI extra-row positioning must use the scene base row count');
assert.ok(gameCtrl.includes('SlotPanelSingleRow'), 'slot UI must read the Cocos-editable single-row slot panel anchor');
assert.ok(gameCtrl.includes('shouldUseSingleRowSlotPanel'), 'slot UI must isolate the level 1 single-row panel layout');
const slotAreaIndex = gameSceneJson.findIndex((entry) => entry && entry._name === 'SlotArea');
const slotPanelIndex = gameSceneJson.findIndex((entry) => entry && entry._name === 'SlotPanel');
const singleRowSlotPanelIndex = gameSceneJson.findIndex((entry) => entry && entry._name === 'SlotPanelSingleRow');
assert.ok(slotAreaIndex >= 0, 'Game.scene must contain SlotArea');
assert.ok(slotPanelIndex >= 0, 'Game.scene must contain SlotPanel');
assert.ok(singleRowSlotPanelIndex >= 0, 'Game.scene must expose a Cocos-editable SlotPanelSingleRow anchor');
const slotAreaChildIds = (gameSceneJson[slotAreaIndex]._children || []).map((child) => child?.__id__);
assert.ok(slotAreaChildIds.includes(singleRowSlotPanelIndex), 'SlotPanelSingleRow must be a direct SlotArea child');
const slotPanelUi = (gameSceneJson[slotPanelIndex]._components || [])
    .map((componentRef) => gameSceneJson[componentRef.__id__])
    .find((component) => component?.__type__ === 'cc.UITransform');
const singleRowSlotPanelUi = (gameSceneJson[singleRowSlotPanelIndex]._components || [])
    .map((componentRef) => gameSceneJson[componentRef.__id__])
    .find((component) => component?.__type__ === 'cc.UITransform');
assert.ok(singleRowSlotPanelUi, 'SlotPanelSingleRow must own a UITransform for Cocos editing');
assert.ok(
    singleRowSlotPanelUi._contentSize.height < slotPanelUi._contentSize.height,
    'SlotPanelSingleRow must be shorter than the multi-row SlotPanel',
);
assert.ok(gameScene.includes('"_name": "LevelTitle"'), 'Game.scene must expose a Cocos-editable TopBarGroup/LevelTitle node');
assert.strictEqual(gameScene.includes('"_name": "CompletionProgress"'), false, 'gameplay top HUD must not keep CompletionProgress node');
const levelTitleIndex = gameSceneJson.findIndex((entry) => entry && entry._name === 'LevelTitle');
assert.ok(levelTitleIndex >= 0, 'Game.scene must contain LevelTitle');
const levelTitleNode = gameSceneJson[levelTitleIndex];
const levelTitleLabelChildId = levelTitleNode._children?.[0]?.__id__;
assert.ok(Number.isInteger(levelTitleLabelChildId), 'LevelTitle must be a container with a child label node');
const levelTitleLabelNode = gameSceneJson[levelTitleLabelChildId];
assert.strictEqual(levelTitleLabelNode?._name, 'Label', 'LevelTitle child must be named Label for Cocos editing');
const levelTitleLabelComponent = (levelTitleLabelNode._components || [])
    .map((componentRef) => gameSceneJson[componentRef.__id__])
    .find((component) => component?.__type__ === 'cc.Label');
assert.ok(levelTitleLabelComponent, 'TopBarGroup/LevelTitle/Label must own the cc.Label component');
assert.ok(gameCtrl.includes('runtime.levelLabel = label'), 'gameplay HUD must bind the scene-owned level title label');
assert.ok(gameCtrl.includes('this.levelLabel.string = `第${this.getActiveLogicalLevelId()}关`;'), 'gameplay HUD must show level title instead of completion percent');
assert.strictEqual(gameCtrl.includes('return this.levelData.levelId <= 2;'), false, 'levels 1-2 must not hide the gameplay top HUD');
assert.ok(gameCtrl.includes('shouldHideTopBar(): boolean'), 'gameplay top HUD visibility hook must exist');
assert.ok(gameCtrl.includes('shouldUseLightweightTopBar(): boolean'), 'level 1 lightweight top HUD path must remain available');
assert.strictEqual(gameCtrl.includes('继续教学'), false, 'first-level win primary button must say 下一关, not 继续教学');
assert.strictEqual(gameCtrl.includes('下一段教学'), false, 'first-level win hook copy must not mention another tutorial segment');
assert.strictEqual(gameCtrl.includes('clearChildrenExcept(panel, [])'), false, 'slot rebuild must not destroy scene-owned SlotShell nodes');
assert.ok(
    gameCtrl.includes('private slotMarkerNodes: Node[] = []') || gameCtrl.includes('slotMarkerNodes: [],'),
    'empty slot markers must use separate child nodes',
);
assert.strictEqual(
    gameCtrl.includes("if (this.getSF('slot_row_empty_ui'))"),
    false,
    'empty slot markers must not be hidden just because the pale row art exists',
);
for (const required of [
    'getRuntimeQueryParam(\'ab\')',
    'applyFirstLevelRouteUrlOverride',
    'unknown experiment',
    'first_level_route',
    'bucket=a: stats/bucket_a only, gameplay stays on mainline route',
    'bucket=b: stats/bucket_b only, gameplay stays on mainline route',
    'mainline: level_1 -> level_1',
    'mainline: level_2 -> level_2',
    'mainline: level_3 -> level_3',
    'mainline: level_4 -> level_4',
    'mainline: level_5 -> level_5',
    '?ab=${FIRST_LEVEL_ROUTE_EXPERIMENT_ID}&bucket=a',
    '?ab=${FIRST_LEVEL_ROUTE_EXPERIMENT_ID}&bucket=b',
    'normalizeFirstLevelRouteUrlBucket',
]) {
    assert.ok(gameCtrl.includes(required), `GameCtrl must support AB URL debugging with ${required}`);
}
const levelRouteService = read('assets/Scripts/Core/LevelRouteService.ts');
for (const required of [
    'export function getMainLevelId(levelId: unknown): number',
    'return normalizeMainLevelId(levelId);',
    'export function getPhysicalMainLevelId(levelId: unknown): number',
    'export function getLogicalMainLevelId(levelId: unknown): number',
]) {
    assert.ok(levelRouteService.includes(required), `LevelRouteService must keep single level id helpers ${required}`);
}
for (const required of [
    'private _currentLevelUnlimitedTime = false',
    'resolveSlotOnboardingTimeLimit({',
    'configuredTimeLimit: data.timeLimit',
    'ONBOARDING_TEACHING_TIME_LIMIT_SECONDS = 600',
    'this._currentLevelUnlimitedTime = resolvedTimeLimit <= 0',
    'this.timeRemain = resolvedTimeLimit',
    'formatCurrentTimerText()',
    "return this._currentLevelUnlimitedTime ? '不限时' : this.formatTime(this.timeRemain)",
    'if (this._currentLevelUnlimitedTime) return;',
    'if (!this._currentLevelUnlimitedTime) {',
]) {
    const hasRequired = required === 'private _currentLevelUnlimitedTime = false'
        ? (gameCtrl.includes(required) || gameCtrl.includes('_currentLevelUnlimitedTime: false,'))
        : required === 'this._currentLevelUnlimitedTime = resolvedTimeLimit <= 0'
            ? ((gameCtrl + '\n' + levelRouteService).includes(required) || gameCtrl.includes('runtime._currentLevelUnlimitedTime = resolvedTimeLimit <= 0'))
            : required === 'this.timeRemain = resolvedTimeLimit'
                ? ((gameCtrl + '\n' + levelRouteService).includes(required) || gameCtrl.includes('runtime.timeRemain = resolvedTimeLimit'))
                : (gameCtrl + '\n' + levelRouteService).includes(required);
    assert.ok(hasRequired, `mainline timer must follow level JSON with onboarding override ${required}`);
}
for (const required of [
    'playReturnFeedback(): void',
    'return;',
]) {
    assert.ok(gameCtrl.includes(required), `GameCtrl must keep mainline return SFX mute rule ${required}`);
}
const directReturnSfxCalls = gameCtrl.match(/AudioMgr\.inst\.play\('return'\)/g) || [];
assert.strictEqual(directReturnSfxCalls.length, 0, 'mainline must not play return/error SFX during gameplay');
assert.ok(gameCtrl.includes('this.playReturnFeedback()'), 'return/error SFX call sites must use playReturnFeedback');
const directDragSfxCalls = gameCtrl.match(/this\.tryPlayDragSfx\(uiPos\)/g) || [];
assert.strictEqual(directDragSfxCalls.length, 0, 'mainline must not play drag/fly SFX');
assert.strictEqual(
    gameCtrl.includes("this.setGroupPosClamped(this.panStartGroupPos.x + dx, this.panStartGroupPos.y + dy);\n            this.tryPlayDragSfx(uiPos);"),
    false,
    'board panning must not play drag/fly SFX',
);
for (const required of [
    "type GestureMode = 'idle' | 'tapCandidate' | 'panning' | 'pinching';",
    'class BoardViewportController',
    'uiToViewportParent(uiPos: Vec2): Vec2',
    'uiToBoardLocal(uiPos: Vec2): Vec2 | null',
    'boardLocalToGrid(',
    'margin: number = 0',
    '): BoardGridCell | null {',
    'setViewTransformClamped(scale: number, offset: Vec2): void',
    'setGestureMode(mode: GestureMode): void',
    "this.setGestureMode('pinching')",
    "this.setGestureMode('panning')",
    'this.boardViewport.zoomAround(uiPos, boardLocal, nextScale)',
    'const startLocal = this.uiToBoardLocal(this._wandDragStart)',
]) {
    assert.ok(gameCtrl.includes(required), `board gesture controller must include ${required}`);
}
assert.ok(
    gameCtrl.includes('this.beginBoardPanFromUiPos(new Vec2(uiPos.x, uiPos.y));')
        || gameCtrl.includes('this.beginBoardPanFromUiPos(remaining, true);'),
    'board gesture controller must preserve pan handoff entry points',
);
for (const forbidden of [
    'getBoardParentLocalFromUiPos',
    'getBoardLocalFromWorldPos',
    'getBoardLocalFromUiPos',
    'boardLocalToGridLoose',
    'clampBoardViewportPosition',
    'applyBoardViewportTransform',
    'private tapPending',
    'private isPanning',
    'private isPinching',
    'let col = Math.floor((boardLocal.x + bw / 2 *',
    'let row = Math.floor(((bh / 2 *',
]) {
    assert.strictEqual(gameCtrl.includes(forbidden), false, `board gesture code must not keep legacy path ${forbidden}`);
}
for (const required of [
    'const BOARD_SLOT_PLACE_HIT_MIN_UI = 52',
    'const BOARD_SLOT_PLACE_HIT_CELL_RATIO = 1.05',
    'getSlotBoardPlaceToleranceLocal()',
    'getBoardPlaceTargetFromWorldPos(worldPos: Vec3, colorId: number, fromSlot: boolean = false)',
    'const fromSlot = block.source === \'slot\'',
    'this.getBoardPlaceTargetFromWorldPos(worldPos, block.colorId, fromSlot)',
    'const boardCandidates = this.getBoardTapCandidates(worldPos)',
    'let tappedBoardBlock: BeanBlockInfo | null = null',
    'if (tappedBoardBlock) {',
    'if (fromSlot && !this.isWorldPosInSlotArea(worldPos) && this.isWorldPosNearBoardPlaceArea(worldPos, true))',
]) {
    assert.ok(gameCtrl.includes(required), `slot-selected placement magnet must include ${required}`);
}
for (const forbidden of [
    'pdd_' + 'first_level_v1',
    'ab=' + '1',
    'first_level, ' + 'first_level_route',
    'first-level-' + 'route',
    'bucket=a/' + 'control',
    'bucket=b/' + 'mainline',
    'first_level_route.bucket',
    'readStoredFirstLevelRouteVariant',
    'persistFirstLevelRouteVariant',
    'EXPERIMENT_B_',
    'BUCKET_B_',
    'use_level_2',
]) {
    assert.strictEqual(gameCtrl.includes(forbidden), false, `GameCtrl must not keep legacy AB behavior alias ${forbidden}`);
}
assert.ok(
    gameCtrl.includes('const FIRST_LEVEL_ROUTE_WX_TIMEOUT_MS = 1200'),
    'AB runtime must wait long enough for WeChat experiment APIs',
);
assert.ok(
    gameCtrl.includes('shouldUseFirstLevelExperiment')
        && gameCtrl.includes('this.startFirstLevelRouteExperimentResolve()'),
    'AB runtime must start WeChat experiment resolving only for WeChat builds',
);
assert.ok(
    gameCtrl.includes('source: bucket ? \'wechat_experiment\' : \'default\''),
    'AB runtime must log whether the bucket came from WeChat experiment or default fallback',
);
assert.ok(
    gameCtrl.includes('no valid wx experiment value'),
    'AB runtime must log why WeChat experiment produced no bucket',
);
assert.ok(
    gameCtrl.includes('stringifyAbPayloadForLog'),
    'AB runtime must use a module-local stringify helper for WeChat callbacks',
);
assert.strictEqual(
    gameCtrl.includes('this.stringifyAbPayload('),
    false,
    'AB runtime callbacks must not depend on this.stringifyAbPayload binding',
);

const abUserStateSyncMgr = read('assets/Scripts/Core/UserStateSyncMgr.ts');
const abSyncUserState = read('cloudfunctions/syncUserState/index.js');
assert.strictEqual(abUserStateSyncMgr.includes('firstLevelRouteVariant'), false, 'AB bucket must not be part of client cloud user state');
assert.strictEqual(abSyncUserState.includes('firstLevelRouteVariant'), false, 'AB bucket must not be persisted by syncUserState');
for (const required of [
    'reportLevelDataLoadDiagnostic(activeLevelId, \'gameAssets_config_start\'',
    '\'gameAssets_config_loaded\'',
    '\'gameAssets_config_failed\'',
    '\'level_data_startup_diagnostics\'',
    '\'level_data_load_start\'',
    '\'bootstrap_level_start\'',
    '\'first_level_json_loaded\'',
    '\'first_level_json_failed\'',
    'stopLevelDataLoadWithFatalError(',
    'showLevelDataLoadFatalError(',
    'getRuntimeRemoteHash()',
    'LevelDataCdnService',
    'levelDataCdn: LevelDataCdnService.inst.getAvailabilityDiagnostics()',
    'level_data_cdn',
    'const bundlePath = `${prefix}${levelId}`;',
    'bundle.load(bundlePath, JsonAsset',
    'remoteHash: this.getRuntimeRemoteHash()',
    'remoteServer: this.getRuntimeRemoteServer()',
    'levelPath',
    'gameAssets_bundle_missing_after_preload',
    'gameAssets_bean_assets_failed',
    'gameAssets_bean_assets_missing',
    '_hasBootstrapAtlasFramesForLevelData(',
    '_bootstrapBeanAtlasReady',
    '[bean] required bean SpriteFrame missing:',
    '[bean] required bean SpriteFrames unavailable for level:',
    '已停止进入默认关卡，避免关卡数据错乱',
    'AnalyticsMgr.inst.markFirstLevelReady',
    '\'first_touch\'',
    '\'first_valid_select\'',
    '\'first_place_attempt\'',
    '\'first_place_success\'',
    '\'tutorial_step_show\'',
    '\'tutorial_step_done\'',
    '\'tutorial_wrong_tap\'',
    '\'tutorial_done\'',
    '\'timer_started\'',
    '\'level_pass\'',
    '\'level_fail\'',
]) {
    assert.ok(gameCtrl.includes(required), `GameCtrl must report first-level funnel event ${required}`);
}
for (const required of [
    'function isWechatMiniGameRuntime()',
    'typeof platform.getSystemInfoSync === \'function\'',
    'const wechatRuntime = isWechatMiniGameRuntime();',
    'isBrowserBackedRequester(requester) && !wechatRuntime',
    'local_browser_external_cdn_disabled',
    'getAvailabilityDiagnostics()',
    'THEME_LEVEL_PREFIX',
    'normalizeLevelPrefix',
]) {
    assert.ok(levelDataCdnService.includes(required), `LevelDataCdnService must allow WeChat DevTools CDN requester: ${required}`);
}
assert.ok(sySdkMgr.includes('sySdkDebug'), 'SySDKMgr production logs must go through the debug log gate');
assert.strictEqual(sySdkMgr.includes("console.log('[SySDK] module eval')"), false, 'SySDKMgr must not log at module evaluation in release');
for (const forbidden of [
    'this.initGame(data || this.getBuiltinLevel()',
    'BeanSpriteFactory',
    'getGeneratedBootstrapBeanFrame',
    '_cacheGeneratedBootstrapBeanFrames',
    'generated fallback',
    '_ensureRemoteBeanAtlasLoaded',
    '_preloadBeanFrameTasksFromGameAssetsBundle',
    'private _hasRemoteBeanFramesForLevelData(',
]) {
    assert.strictEqual(gameCtrl.includes(forbidden), false, `GameCtrl remote loading must not silently fallback with ${forbidden}`);
}
for (const required of [
    'getGameplayNodeBoundsInFixedRoot',
    'getGameplayNodeVerticalBoundsInFixedRoot',
    'getGameplayChildrenVerticalBounds',
    'getTopBarAvoidBottomY',
    'getBottomHudAvoidTopY',
]) {
    assert.ok(boardInputViewportModule.includes(required), `BoardInputViewportModule must use Cocos scene bounds for board safe viewport: ${required}`);
}
assert.strictEqual(boardInputViewportModule.includes("getGameplayFixedGroup?.('BoardArea')"), false, 'BoardInputViewportModule must not use BoardArea bounds as the board safe viewport');
assert.strictEqual(boardInputViewportModule.includes('const boardAreaBounds = this.getGameplayNodeBoundsInFixedRoot(boardArea);'), false, 'BoardInputViewportModule must not keep static BoardArea viewport ownership');
for (const required of [
    'getGuideNodeVerticalBoundsInLayer',
    'getGuideTopBarAvoidBottomY',
    'getGuideBoardAvoidTopY',
    'getGuidePromptCenterY',
    'targetUi.convertToNodeSpaceAR(world)',
    'const bottomLimit = boardTop + promptHeight / 2 + boardGap;',
    'return (topBarBottom + boardTop) / 2;',
]) {
    assert.ok(settlementHudModule.includes(required), `SettlementHudModule must make tutorial prompts avoid the scene TopBar: ${required}`);
}
assert.ok(
    settlementHudModule.includes("root.getChildByName('TutorialGuidePrompt')")
        && settlementHudModule.includes("guidePrompt.getChildByName('PromptLabel')?.getComponent(Label)"),
    'SettlementHudModule tutorial prompt must bind the scene-owned OverlayRoot/TutorialGuidePrompt nodes',
);
assert.strictEqual(
    settlementHudModule.includes("new Node('GuideBubble')") || settlementHudModule.includes("new Node('BubbleLbl')"),
    false,
    'tutorial guide prompt shell must not be rebuilt at runtime',
);
assert.strictEqual(
    settlementHudModule.includes('bubble.setPosition(') || tutorialGuideModule.includes('bubble.setPosition('),
    false,
    'tutorial guide prompt position must stay scene-owned',
);
assert.strictEqual(
    settlementHudModule.includes('bubble.setPosition(0, 470);') || tutorialGuideModule.includes('bubble.setPosition(0, 470);'),
    false,
    'tutorial guide prompts must not keep the old fixed y=470 that overlaps WeChat top HUD',
);
assert.ok(
    boardInputViewportModule.includes('this.getSceneGuidePromptBounds()')
        && boardInputViewportModule.includes('this.getGuidePromptCenterY(450, 52)')
        && boardInputViewportModule.includes('const tutorialBubbleGap = 12;'),
    'BoardInputViewportModule must reserve the scene-owned tutorial prompt band with the old topbar-aware fallback',
);
assert.strictEqual(
    gameCtrl.includes('return topEdge - 30 - safeInsets.top;'),
    false,
    'gameplay topbar fallback must not subtract safeInsets on top of scene SafeArea',
);

const analyticsMgr = read('assets/Scripts/Core/AnalyticsMgr.ts');
for (const required of [
    'export type FunnelEventOptions',
    'private readonly funnelSessionId',
    'private readonly appLaunchTime',
    'private firstLevelAliveTimers',
    'trackFunnelEvent',
    'markFirstLevelReady',
    'alive_${Math.floor(ms / 1000)}s_after_ui_ready',
    'elapsedMsFromLaunch',
    'elapsedMsFromLevelReady',
    'funnelQueue.splice(0, this.funnelQueue.length - 200)',
    'private funnelUploadDisabled = false',
    'private disableFunnelUpload(',
    'private isPermanentFunnelUploadFailure(',
    'functionname parameter could not be found',
    'errcode: -501000',
    'clearFirstLevelAliveTimers',
    'addFunnelEvents',
    "this.disableFunnelUpload('addFunnelEvents unavailable');",
]) {
    assert.ok(analyticsMgr.includes(required), `AnalyticsMgr must include first-level funnel support ${required}`);
}

const addFunnelEvents = read('cloudfunctions/addFunnelEvents/index.js');
for (const required of [
    'first_level_funnel',
    'MAX_EVENTS_PER_CALL',
    'sessionId',
    'eventSeq',
    'dedupeKey',
    'elapsedMsFromLaunch',
    'elapsedMsFromLevelReady',
    'cloud.getWXContext',
    'sanitizeExtra',
    'abBucket',
]) {
    assert.ok(addFunnelEvents.includes(required), `addFunnelEvents must persist first-level funnel field ${required}`);
}
assert.strictEqual(addFunnelEvents.includes('abVariant'), false, 'addFunnelEvents must not keep legacy abVariant field');

const addBehaviorData = read('cloudfunctions/addBehaviorData/index.js');
assert.ok(addBehaviorData.includes('abBucket'), 'addBehaviorData must persist abBucket');
assert.strictEqual(addBehaviorData.includes('abVariant'), false, 'addBehaviorData must not keep legacy abVariant field');

const dashboard = read('cloudfunctions/getAllDashboardData/index.js');
for (const required of [
    'FIRST_LEVEL_FUNNEL_COLLECTION',
    'first_level_funnel',
    'FIRST_LEVEL_FUNNEL_STEPS',
    'buildFirstLevelFunnel',
    'normalizeAbBucket',
    'ab_assigned',
    'sessionBucketMap',
    'abBucket',
    'bucket_a',
    'bucket_b',
    "const bucket = sessionBucketMap.get(sessionKey) || 'unknown'",
    'alive_1s_after_ui_ready',
    'first_place_success',
    'firstLevelFunnel',
]) {
    assert.ok(dashboard.includes(required), `getAllDashboardData must aggregate first-level funnel field ${required}`);
}
assert.strictEqual(dashboard.includes('abVariant'), false, 'getAllDashboardData must not keep legacy abVariant field');

const levelPreview = read('tools/level-preview.html');
assert.ok(levelPreview.includes('../assets/LevelData/'), 'level-preview.html must read main levels from assets/LevelData');
assert.strictEqual(levelPreview.includes('../assets/Resources/LevelData/'), false, 'level-preview.html must not read removed Resources LevelData');
const guankaPreview = read('tools/guanka-preview.html');
assert.ok(guankaPreview.includes("const DEFAULT_LEVEL_DIR = 'assets/LevelData'"), 'guanka-preview.html must default to assets/LevelData');
assert.strictEqual(guankaPreview.includes("const DEFAULT_LEVEL_DIR = 'tools/guanka'"), false, 'guanka-preview.html must not default to missing tools/guanka');
assert.ok(guankaPreview.includes("url.searchParams.set('level', String(data.levelId));"), 'guanka-preview.html must open default GameAssetsBundle levels with ?level=');
assert.ok(guankaPreview.includes("url.searchParams.set('levelfile', getLevelFilePath(data));"), 'guanka-preview.html must keep levelfile fallback for custom directories');
const guankaRefine = read('tools/guanka-refine.html');
assert.ok(guankaRefine.includes("const DEFAULT_LEVEL_DIR = 'assets/LevelData'"), 'guanka-refine.html must default to assets/LevelData');
assert.ok(guankaRefine.includes("fetch(buildApiUrl('/api/load-level'"), 'guanka-refine.html must load levels through the tools API');
assert.ok(guankaRefine.includes("fetch('/api/save-level-game'"), 'guanka-refine.html must save game levels to GameAssetsBundle through the game save API');
assert.ok(guankaRefine.includes("body: JSON.stringify({ targetType: 'main', levelData: levelToSave })"), 'guanka-refine.html must save a clean wrapped main-level payload');
assert.strictEqual(guankaRefine.includes('./guanka/level_'), false, 'guanka-refine.html must not load from missing tools/guanka');

const themePanelController = read('assets/Scripts/Core/Panels/ThemePanelController.ts');
assert.ok(themePanelController.includes('COLLECTION_TEXTURE_NAMES'), 'ThemePanelController must preload collection card textures before theme card rendering');
assert.ok(themePanelController.includes("_openPanelAfterTextures('theme'"), 'ThemePanelController must gate theme panel opening on sprite frame availability');
assert.strictEqual(/canOpenThemePanel\(\)[\s\S]{0,160}return;/.test(themePanelController), false, 'ThemePanelController must not block the whole theme panel before card-level locks render');
const themeLoadingOverlay = read('assets/Scripts/Core/GameCtrlModules/ThemeLoadingOverlayModule.ts');
assert.ok(/startThemeLevel[\s\S]*getRuntimeSceneName\('Game'\) === 'Home'[\s\S]*requestGameplaySceneTransition\(levelId, 'zt_level_', false\)/.test(themeLoadingOverlay), 'Theme challenge levels must route Home -> Game before loading zt_level gameplay');
assert.ok(/buttonText\s*=\s*`\$\{unlockRequirementLevel\}关开放`/.test(themeLoadingOverlay), 'Theme locked card button must omit the leading 主线 text');
assert.strictEqual(themeLoadingOverlay.includes('主线${unlockRequirementLevel}关开放'), false, 'Theme locked card button must not render 主线xx关开放');

const collectionAvatarModule = read('assets/Scripts/Core/GameCtrlModules/CollectionAvatarModule.ts');
const themePanelFlowModule = read('assets/Scripts/Core/GameCtrlModules/ThemePanelFlowModule.ts');
assert.ok(collectionAvatarModule.includes('_collectionPreviewBufferRows = 2'), 'Collection preview must keep two buffered rows around the visible viewport');
assert.ok(collectionAvatarModule.includes('renderCollectionVisiblePreviews'), 'Collection panel must render previews through a visible-window pass');
assert.ok(/setupCollectionScroll\(viewport, scrollContent, viewportH, totalH, rowPitch\)/.test(collectionAvatarModule), 'Collection scroll must pass row pitch to lazy preview rendering');
assert.ok(/drawCollectionPixelPreviewOnCard\([\s\S]*options\?: \{ grayscale\?: boolean \}/.test(collectionAvatarModule), 'Collection preview drawing must support grayscale locked previews');
assert.ok(themePanelFlowModule.includes('deferPreview'), 'Collection cards must support deferred preview drawing');
assert.ok(themePanelFlowModule.includes('lockedPreviewGrayscale'), 'Collection locked cards must support grayscale previews');

const toolsServer = read('tools/server.py');
assert.ok(toolsServer.includes("'assets', 'LevelData'"), 'tools/server.py must save game levels to assets/LevelData');
assert.ok(toolsServer.includes('LEVEL_DATA_DIR = GAME_LEVEL_DATA_DIR'), 'tools/server.py default level directory must be assets/LevelData');
assert.strictEqual(toolsServer.includes("'assets', 'Resources', 'LevelData'"), false, 'tools/server.py must not save game levels to removed Resources LevelData');

const userStateSyncMgr = read('assets/Scripts/Core/UserStateSyncMgr.ts');
const userMgr = read('assets/Scripts/Core/UserMgr.ts');
const leaderboardMgr = read('assets/Scripts/Core/LeaderboardMgr.ts');
const wxCloudMgr = read('assets/Scripts/Core/WxCloudMgr.ts');
const miniGamePlatform = read('assets/Scripts/Core/MiniGamePlatform.ts');
const platformCloudMgr = read('assets/Scripts/Core/PlatformCloudMgr.ts');
const douyinCloudMgr = read('assets/Scripts/Core/DouyinCloudMgr.ts');
const adConfig = read('assets/Scripts/Platform/AdConfig.ts');
const rewardedAdProvider = read('assets/Scripts/Platform/RewardedAdProvider.ts');
const homeAdFlowModule = read('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts');
const gameplaySessionController = read('assets/Scripts/Core/GameplaySessionController.ts');
const syncUserState = read('cloudfunctions/syncUserState/index.js');
const leaderboardCloud = read('cloudfunctions/leaderboard/index.js');
const forbiddenResetLevelAction = 'reset' + 'Level';
const forbiddenResetUserLevelAction = 'reset' + 'UserLevel';
const forbiddenQaLevelParam = 'qa' + '_level';
const forbiddenLocalResetApi = '/api/' + 'reset-' + 'user-level';
const forbiddenTcbCli = 't' + 'cb';
const forbiddenLocalResetPage = 'tools/user-' + 'reset.html';
for (const [name, source] of [
    ['GameCtrl.ts', gameCtrl],
    ['UserStateSyncMgr.ts', userStateSyncMgr],
    ['cloudfunctions/syncUserState/index.js', syncUserState],
    ['cloudfunctions/leaderboard/index.js', leaderboardCloud],
]) {
    assert.strictEqual(source.includes(forbiddenResetLevelAction), false, `${name} must not contain runtime/cloud level reset action`);
    assert.strictEqual(source.includes(forbiddenResetUserLevelAction), false, `${name} must not contain runtime/cloud user level reset action`);
    assert.strictEqual(source.includes(forbiddenQaLevelParam), false, `${name} must not contain QA level reset query path`);
}
assert.strictEqual(exists(forbiddenLocalResetPage), false, 'Do not keep a local user level reset page');
assert.strictEqual(toolsServer.includes(forbiddenLocalResetApi), false, 'tools/server.py must not expose local user level reset API');
assert.strictEqual(toolsServer.includes(forbiddenTcbCli), false, 'tools/server.py must not depend on Tencent CloudBase CLI for WeChat cloud data');
assert.ok(syncUserState.includes('isAdminSavedLevelSentinel'), 'syncUserState must reserve savedLevel <= 0 as the admin progress sentinel');
assert.ok(syncUserState.includes('savedLevel: 1') && syncUserState.includes('lastLevelId: 1'), 'syncUserState must stabilize sentinel progress to level 1 on save');
assert.ok(gameCtrl.includes('forceCloudLevelReset'), 'client restore must bypass local-newer protection for savedLevel <= 0 sentinel');
assert.ok(syncUserState.includes("LEADERBOARD_COLLECTION = 'leaderboard'"), 'syncUserState must recover deleted-install progress from legacy leaderboard data');
assert.ok(syncUserState.includes('resolveRestorableProgress'), 'syncUserState must resolve savedLevel from profile/legacy progress sources');
assert.ok(syncUserState.includes('ensureLegacyProgressProfile'), 'syncUserState must create user_profile when only legacy leaderboard progress exists');
assert.ok(leaderboardCloud.includes('syncProgressToUserProfile'), 'leaderboard submitProgress must mirror progress into user_profile for startup restore');
assert.ok(leaderboardCloud.includes('savedLevel') && leaderboardCloud.includes('lastLevelId') && leaderboardCloud.includes('stateUpdatedAt'), 'leaderboard profile mirror must update startup restore fields');
assert.ok(gameCtrlShared.includes('CLOUD_STATE_RESTORE_EMPTY_INSTALL_TIMEOUT_MS = 3000'), 'fresh-install cloud restore must allow enough time for old-user recovery');
assert.ok(gameCtrlShared.includes("'cloud_timeout_unresolved'") && !gameCtrlShared.includes("'skipped'"), 'startup restore statuses must be precise and must not use skipped');
assert.ok(gameCtrl.includes('getRawSavedLevelForStartup') && gameCtrl.includes("sys.localStorage.getItem(LS_LEVEL)"), 'startup must inspect raw pdd.level instead of getSavedLevel default');
assert.ok(gameCtrl.includes("raw === null") && gameCtrl.includes("'rawLevelMissing'"), 'cleared local cache must remain raw pdd.level === null until restore is decided');
assert.ok(gameCtrl.includes('getStartupLocalProgressState') && gameCtrl.includes("parsed > 1 ? 'local_progress_gt_1'"), 'only raw pdd.level > 1 is reliable old-user local progress');
assert.ok(gameCtrl.includes('mergeWeChatSelfProgressFallback'), 'fresh-install restore must also read WeChat friend cloud score fallback');
assert.ok(gameCtrl.includes('LeaderboardMgr.inst.loadWeChatSelfProgress()'), 'startup restore must merge wx.getUserCloudStorage score when cloud DB progress is missing');
assert.strictEqual(gameCtrl.includes('runtime.getActiveLogicalLevelId() === 1 && !runtime._timerStarted'), false, 'late old-user cloud restore must not be blocked after level-1 timer starts');
assert.ok(gameCtrl.includes('restoredLevel > Math.max(beforeLevel, activeLevel)'), 'late old-user cloud restore must route Home when cloud progress is higher than current startup level');
assert.ok(gameCtrl.includes('cloudSavedLevel <= localSavedLevel'), 'higher cloud savedLevel must bypass local-newer timestamp protection');
assert.ok(gameCtrl.includes('canAutoSaveGameStateOnStartup') && gameCtrl.includes("restoreStatus === 'cloud_confirmed_empty'"), 'startup must only save game state after local/cloud progress or confirmed empty cloud restore');
assert.ok(gameCtrl.includes('UserMgr.inst.touchSession(canAutoSaveGameStateOnStartup)'), 'startup must not sync profile progress while restore is unresolved');
assert.ok(gameCtrl.includes('setAuthoritativeStateHandler') && userStateSyncMgr.includes('emitAuthoritativeState'), 'client must apply authoritative cloud save response instead of only logging it');
assert.ok(gameCtrl.includes('keep higher cloud savedLevel'), 'mainline progress save must not downgrade a higher cloud-restored local level');
assert.ok(gameCtrl.includes('UserMgr.inst.markLevelProgress(restoredLevel)'), 'cloud savedLevel restore must update local UserMgr progress as well as pdd.level');
assert.ok(userMgr.includes('allowRegression') && userMgr.includes('Math.max(currentLevel, normalized)'), 'UserMgr level progress must be monotonic unless an explicit reset allows regression');
assert.ok(userStateSyncMgr.includes('__PDD_CLOUD_SYNC_LAST'), 'UserStateSyncMgr must expose the last cloud sync diagnostic for WeChat DevTools debugging');
assert.ok(userStateSyncMgr.includes('[CloudSync]'), 'UserStateSyncMgr must log cloud sync phases in debug builds');
assert.ok(userStateSyncMgr.includes('save:success') && userStateSyncMgr.includes('save:fail'), 'UserStateSyncMgr must log cloud save success and failure');
assert.ok(userStateSyncMgr.includes('console.warn') && userStateSyncMgr.includes('getMiniGameBuildMode'), 'debug mini-game builds must surface cloud sync diagnostics as warnings');
assert.ok(userStateSyncMgr.includes('getDirectWxDiagnosticTarget') && userStateSyncMgr.includes('getDirectTtDiagnosticTarget') && userStateSyncMgr.includes('getGameGlobalDiagnosticTarget'), 'cloud sync diagnostics must be readable from platform contexts');
assert.ok(miniGamePlatform.includes('getMiniGameBuildPlatform') && miniGamePlatform.includes('__PDD_BUILD_PLATFORM__'), 'mini-game platform detection must use the injected build platform marker');
assert.ok(wxCloudMgr.includes('getWeChatMiniGameRuntime') && miniGamePlatform.includes('getDirectWxRuntime'), 'WxCloudMgr must use the unified WeChat runtime resolver');
assert.ok(platformCloudMgr.includes('WxCloudMgr') && platformCloudMgr.includes('DouyinCloudMgr'), 'PlatformCloudMgr must route cloud calls to the active platform provider');
assert.ok(platformCloudMgr.includes('getDouyinLaunchChannel') && platformCloudMgr.includes('getDouyinSystemInfo'), 'PlatformCloudMgr must own platform-specific analytics context lookups');
assert.ok(douyinCloudMgr.includes('callFunction') && douyinCloudMgr.includes('callContainer'), 'DouyinCloudMgr must support Douyin cloud function/container entry points');
assert.ok(adConfig.includes('getRewardedAdProvider') && adConfig.includes('preloadRewardedAd'), 'AdConfig must delegate rewarded ads to the platform provider and expose preload');
assert.strictEqual(adConfig.includes('(window as any).tt'), false, 'AdConfig must not pick rewarded ad platform by probing window.tt directly');
assert.strictEqual(adConfig.includes('(window as any).wx'), false, 'AdConfig must not pick rewarded ad platform by probing window.wx directly');
assert.ok(rewardedAdProvider.includes('getMiniGameBuildPlatform'), 'RewardedAdProvider must use the injected mini-game build platform marker');
assert.ok(rewardedAdProvider.includes("platform === 'douyin'") && rewardedAdProvider.includes("platform === 'wechat'"), 'RewardedAdProvider must split Douyin and WeChat providers explicitly');
assert.ok(rewardedAdProvider.includes('preload(reason') && rewardedAdProvider.includes('after-show'), 'RewardedAdProvider must preload before and after rewarded ad display');
assert.ok(rewardedAdProvider.includes('res?.isEnded') && rewardedAdProvider.includes('shouldSimulateDevtoolsCompletion'), 'RewardedAdProvider must keep strict close semantics while simulating devtools safely');
assert.ok(homeAdFlowModule.includes('AdConfig.hasRewardedAdWindow()'), 'post-ad finalize must use the unified ad provider window state');
assert.strictEqual(homeAdFlowModule.includes('createRewardedVideoAd'), false, 'HomeAdFlowModule must not directly inspect rewarded ad platform APIs');
assert.ok(homeAdFlowModule.includes("AdConfig.preloadRewardedAd('home:visible')"), 'Home screen must warm rewarded ads when ad entries become visible');
assert.ok(gameplaySessionController.includes("AdConfig.preloadRewardedAd('gameplay:init')"), 'Gameplay must warm rewarded ads before prop/ad unlock clicks');
assert.strictEqual(analyticsMgr.includes('WxCloudMgr'), false, 'AnalyticsMgr must not call WeChat cloud directly');
assert.ok(analyticsMgr.includes('PlatformCloudMgr.inst.callFunction'), 'AnalyticsMgr must route cloud calls through PlatformCloudMgr');
assert.ok(leaderboardMgr.includes('loadWeChatSelfProgress'), 'LeaderboardMgr must expose WeChat self score read for deleted-install restore');
assert.ok(leaderboardMgr.includes('getUserCloudStorage'), 'LeaderboardMgr must read existing WeChat friend cloud score');
assert.ok(leaderboardMgr.includes('existingScore >= progressLevel'), 'LeaderboardMgr must not overwrite a higher WeChat score with lower local progress');
assert.ok(leaderboardMgr.includes('skip wx cloud score reset for starter level'), 'LeaderboardMgr must not reset WeChat friend score to level 1 on fresh startup');
assert.ok(leaderboardMgr.includes('getWeChatMiniGameRuntime'), 'LeaderboardMgr must use the unified WeChat runtime resolver for friend cloud storage restore');

console.log('build script checks passed');
