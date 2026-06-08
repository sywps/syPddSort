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
    ['build:wechat', 'node scripts/build-wechat.js --release'],
    ['build:wechat:debug', 'node scripts/build-wechat.js --debug'],
    ['verify:wechat-build', 'node scripts/verify-wechat-build.js'],
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
    'build:douyin',
    'verify:douyin-build',
    'sync:cdn:douyin',
    'douyin:postbuild',
]) {
    assert.strictEqual(scripts[forbidden], undefined, `V1 微信迁移不能新增 ${forbidden}`);
}

for (const filePath of [
    'scripts/build-wechat.js',
    'scripts/write-wechat-build-config.js',
    'scripts/prepare-wechat-bootstrap.js',
    'scripts/postbuild-wechat.js',
    'scripts/fix-game-json.js',
    'scripts/verify-wechat-build.js',
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
    'WECHAT_REMOTE_MODE',
    'scripts/prepare-wechat-bootstrap.js',
    'scripts/write-level-data-cdn.js',
    'scripts/write-wechat-build-config.js',
    'scripts/postbuild-wechat.js',
    'configPath=',
    'build/level-data-cdn',
    'build/wechatgame',
    'cleanCocosGeneratedCaches',
    'stale asset-db/importer',
    'repairCocosMetaFiles',
    'scripts/repair-cocos-meta.js',
    'RemoteBundle/LevelData',
    'BootstrapBundle',
    '本地 remote bundle script 缺少稳定入口 index.js',
    'assertRuntimeScenes',
    'db://assets/Scenes/Home.scene',
    'db://assets/Scenes/Game.scene',
    'bean-atlas-data.json',
    'GameUI/bg_game_pindd',
    'GameUI/solid_white',
    'RemoteBundle 不应包含豆豆图集资源',
    'RemoteBundle 不应包含旧单豆图片目录',
    'validateLevelDataCdn',
    'level_live.json',
    'remote 分包',
    'remote 微信分包缺少入口 game.js',
    'main bundle 不应依赖 remote',
]) {
    assert.ok(buildWechat.includes(required), `build-wechat.js must include ${required}`);
}
assert.strictEqual(buildWechat.includes('syncBootstrapSourceAssets'), false, 'build-wechat.js must delegate bootstrap preparation to prepare-wechat-bootstrap.js');
assert.strictEqual(buildWechat.includes('build-douyin'), false, 'build-wechat.js must stay Douyin-free');
assert.strictEqual(buildWechat.includes('remote_dy'), false, 'build-wechat.js must not point to Douyin CDN');
const legacyResourcesPath = 'assets/' + 'Resources';
assert.strictEqual(buildWechat.includes(legacyResourcesPath), false, 'build-wechat.js must not depend on legacy Resources');
assert.strictEqual(buildWechat.includes('profiles/v2/packages/wechatgame.json'), false, 'build-wechat.js must not depend on missing Creator profile files');
assert.strictEqual(buildWechat.includes('Atlas/bootstrap-atlas'), false, 'build-wechat.js must not restore legacy bootstrap atlas path');
assert.strictEqual(exists('assets/BootstrapBundle/Atlas'), false, 'BootstrapBundle must not keep legacy Atlas/bootstrap-atlas source directory');
assert.strictEqual(exists('assets/RemoteBundle/Textures/Beans/bean-atlas.json'), false, 'Remote bean atlas JSON must not share the PNG logical path');
assert.strictEqual(exists('assets/RemoteBundle/Textures/Beans/bean-atlas-data.json'), false, 'Remote bean atlas data must move to BootstrapBundle');
assert.strictEqual(exists('assets/RemoteBundle/Textures/Beans/bean-atlas.png'), false, 'Remote bean atlas image must move to BootstrapBundle');
assert.ok(exists('assets/BootstrapBundle/Beans/bean-atlas-data.json'), 'Bootstrap bean atlas JSON must exist');
assert.ok(exists('assets/BootstrapBundle/Beans/bean-atlas.png'), 'Bootstrap bean atlas PNG must exist');
assert.strictEqual(exists('assets/RemoteBundle/Textures/Pindd/Beans'), false, 'RemoteBundle must not keep legacy single bean PNG directory');
assert.ok(exists('assets/BootstrapBundle/LevelData/level_1.json'), 'BootstrapBundle must keep mainline first level_1');
assert.strictEqual(exists('assets/BootstrapBundle/LevelData/level_2.json'), false, 'BootstrapBundle must not keep stale first-level snapshot level_2');

const prepareBootstrap = read('scripts/prepare-wechat-bootstrap.js');
for (const required of [
    'const bootstrapLevelIds = [1]',
    'BootstrapBundle/Beans',
    'RemoteBundle/LevelData',
    'bean-atlas-data.json',
    'bean-atlas.png',
    'validateRemoteDoesNotOwnBeanAtlas',
    'Bootstrap bean atlas 缺少首屏/全关卡豆豆帧',
]) {
    assert.ok(prepareBootstrap.includes(required), `prepare-wechat-bootstrap.js must include ${required}`);
}
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

const remoteBundleMeta = JSON.parse(read('assets/RemoteBundle.meta'));
assert.strictEqual(remoteBundleMeta.userData?.compressionType, 'subpackage', 'RemoteBundle must build as a WeChat subpackage');
assert.strictEqual(remoteBundleMeta.userData?.isRemote, undefined, 'RemoteBundle must not be a Cocos remote bundle');

const buildConfig = read('scripts/write-wechat-build-config.js');
for (const required of [
    'wxbb6160c828f380ca',
    'platform: \'wechatgame\'',
    'buildMode: \'minify\'',
    'WECHAT_SEPARATE_ENGINE',
    'resolveSeparateEngine',
    'sourceMaps: false',
    'debug: false',
    'md5Cache: true',
    'startScene',
    'readSceneUuid',
    'makeRuntimeScenes',
    'db://assets/Scenes/Home.scene',
    'mainBundleCompressionType: \'subpackage\'',
    'db://assets/RemoteBundle',
    'compressionType: \'subpackage\'',
    'isRemote: false',
]) {
    assert.ok(buildConfig.includes(required), `write-wechat-build-config.js must include ${required}`);
}

const debugConfigPath = path.join(root, 'temp', 'test-wechat-build-config-debug.json');
const releaseConfigPath = path.join(root, 'temp', 'test-wechat-build-config-release.json');
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
assert.strictEqual(JSON.parse(fs.readFileSync(debugConfigPath, 'utf8')).packages.wechatgame.separateEngine, false, 'debug 微信构建必须关闭 Cocos 插件分离引擎');
assert.strictEqual(JSON.parse(fs.readFileSync(releaseConfigPath, 'utf8')).packages.wechatgame.separateEngine, false, 'release 微信构建也必须默认关闭 Cocos 插件分离引擎');
fs.rmSync(debugConfigPath, { force: true });
fs.rmSync(releaseConfigPath, { force: true });

const postbuildEntrypoint = read('scripts/postbuild-wechat.js');
assert.ok(postbuildEntrypoint.includes("require('./fix-game-json.js')"), 'postbuild-wechat.js must wrap the existing postbuild implementation');
const postbuild = postbuildEntrypoint + '\n' + read('scripts/fix-game-json.js');
for (const required of [
    'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat/levels/',
    'PDD_LEVEL_DATA_CDN_URL',
    '__PDD_WECHAT_BUILD__',
    '__PDD_REMOTE_MODE__',
    '__PDD_LEVEL_DATA_CDN_URL__',
    'ensureStableRemoteBundleScriptLoader',
    'minigameRootPath',
    'openDataContext',
    'globalThis.__rawWx',
    'remote 必须是微信分包/本地 bundle',
    'ensureRemoteWechatSubpackage',
    'ensureSubpackageGameJs',
    'subpackages/remote',
    '本地 resources bundle 已移除',
    'projectBundles',
    'ensureStartupPreloadBundles',
    'startup preload: bootstrap -> main',
    'remote 分包目录由微信 subpackages 承载',
]) {
    assert.ok(postbuild.includes(required), `fix-game-json.js must include ${required}`);
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
    assert.strictEqual(postbuild.includes(forbidden), false, `fix-game-json.js must not keep uncertain boot probe ${forbidden}`);
}

const verifyWechat = read('scripts/verify-wechat-build.js');
for (const required of [
    'wxbb6160c828f380ca',
    'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat/levels/',
    'UIPreview',
    'PanelPreview',
    'FxPreview',
    'Game.scene 直接引用了未登记 prefab',
    'Game.scene 直接引用了 RemoteBundle 资源',
    'assertRuntimeScenes',
    'db://assets/Scenes/Home.scene',
    'db://assets/Scenes/Game.scene',
    'assets/Prefabs/Panels/RevivePanel.prefab',
    'openDataContext',
    '微信包不应启用 Cocos 插件分离引擎',
    '微信包仍引用未授权 Cocos 插件',
    'plugin:cocos',
    'wx0446ba2621dda60a',
    'findSubpackageRoot',
    'resolveBundleDir',
    'main bundle 不应依赖 remote',
    'subMetas',
    'bootstrap stable index.js',
    'game.js 不应注入 Cocos remote live.json 启动逻辑',
    'level_live.json',
    'levelDataCdnPath',
    '__PDD_WECHAT_BUILD__',
    '__PDD_LEVEL_DATA_CDN_URL__',
    'settings.assets.subpackages 缺少 remote',
    'game.json.subpackages 缺少 remote',
    'remote 微信分包目录',
    'remote 分包 game.js',
    'assets/remote',
    'GameCtrl',
    'Beans/bean-atlas-data',
    'GameUI/bg_game_pindd',
    'GameUI/solid_white',
    '关卡数据 CDN 关卡数量异常',
    'LevelData/level_1',
    'bootstrap 不应包含非首关候选关卡',
    '未与 RemoteBundle 真源同步',
    'assertStartupPreloadOrder',
    'bootstrap -> main',
]) {
    assert.ok(verifyWechat.includes(required), `verify-wechat-build.js must include ${required}`);
}
for (const forbidden of [
    '__PDD_BOOT_REPORT_SENT__',
    'wxApi.reportAnalytics',
    'pdd_boot_probe',
    'game_js_top',
    'CDN live.json remoteVersion',
    'remote bundle-scripts versioned stub',
]) {
    assert.strictEqual(verifyWechat.includes(forbidden), false, `verify-wechat-build.js must not require uncertain boot probe ${forbidden}`);
}
assert.strictEqual(verifyWechat.includes('Douyin'), false, 'verify-wechat-build.js must stay Douyin-free');

const wechatPreviewSmoke = read('scripts/smoke-wechat-preview.js');
for (const required of [
    '--screenshot',
    '--logs',
    '--url',
    'Please load bundle remote first',
    'remote_bundle_missing_after_preload',
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
    'public-read',
]) {
    assert.ok(syncWechat.includes(required), `sync-cdn-wechat.js must include ${required}`);
}
assert.ok(syncWechat.includes('remote_dy'), 'sync-cdn-wechat.js must guard against Douyin CDN targets');
assert.strictEqual(syncWechat.includes('bundleVers.remote'), false, 'sync-cdn-wechat.js must not depend on Cocos remote bundle versions');
assert.strictEqual(syncWechat.includes('CDN config'), false, 'sync-cdn-wechat.js must not upload Cocos remote bundle config');

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

const levelManifestWriter = read('scripts/write-level-manifest.js');
for (const required of [
    "'assets', 'RemoteBundle', 'LevelData'",
    'levelId',
    'timeLimit',
    'colorIds',
]) {
    assert.ok(levelManifestWriter.includes(required), `write-level-manifest.js must include ${required}`);
}
assert.ok(exists('assets/RemoteBundle/LevelData/level-manifest.json'), 'level manifest must be generated into RemoteBundle LevelData');

const levelDataCdnWriter = read('scripts/write-level-data-cdn.js');
for (const required of [
    "'assets', 'RemoteBundle', 'LevelData'",
    "'build', 'level-data-cdn'",
    'level_packs',
    'level_live.json',
    'dataVersion',
    'packSize',
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
    'assets/Scripts/Core/RemoteLevelDataService.ts',
    'assets/Scripts/Core/SlotOnboardingPolicy.ts',
    'assets/Scripts/Core/GameplaySessionController.ts',
    'assets/Scripts/Core/GameplaySlotUiController.ts',
    'assets/Scripts/Core/GameplaySkillUiController.ts',
    'assets/Scripts/Core/GameplayViewController.ts',
    'assets/Scripts/Core/installGameCtrlModules.ts',
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
const audioMgr = read('assets/Scripts/Core/AudioMgr.ts');
const audioManifest = read('assets/Scripts/Core/AudioManifest.ts');
const uiManifest = read('assets/Scripts/Core/UiManifest.ts');
const gameScene = read('assets/Scenes/Game.scene');
const gameSceneJson = JSON.parse(gameScene);
for (const filePath of ['assets/Scripts/Core/GameCtrl.ts', 'assets/Scripts/Core/GameCtrlShared.ts', ...gameCtrlHelperFiles, ...gameCtrlPanelControllerFiles, ...gameCtrlModuleFiles]) {
    const lineCount = read(filePath).split(/\r?\n/).length;
    assert.ok(lineCount < 1000, `${filePath} must stay below 1000 lines after GameCtrl split (actual ${lineCount})`);
}
assert.ok(
    gameCtrlEntry.includes('extends GameRuntimeHost')
        || gameCtrlEntry.includes('installGameCtrlModules(this);'),
    'GameCtrl entry must install split modules',
);
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
assert.ok(
    gameCtrl.includes("this._destroyPanelAndReleaseTextures(overlay, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, 'settings')")
        || gameCtrl.includes("runtime._destroyPanelAndReleaseTextures(overlay, SETTINGS_PANEL_RELEASE_TEXTURE_NAMES, 'settings')"),
    'settings panel must not release textures while destroyed sprites can still render',
);
assert.ok(gameCtrl.includes("from './UiManifest'"), 'GameCtrl must import UI resource dependencies from UiManifest');
assert.ok(uiManifest.includes('REMOTE_PRELOAD_TEXTURE_PATHS'), 'UiManifest must own remote preload textures');
assert.ok(uiManifest.includes('SETTINGS_PANEL_TEXTURE_NAMES'), 'UiManifest must own settings panel textures');
assert.ok(uiManifest.includes('LEADERBOARD_TEXTURE_NAMES'), 'UiManifest must own leaderboard panel textures');
assert.ok(uiManifest.includes('COLLECTION_TEXTURE_NAMES'), 'UiManifest must own collection panel textures');
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
    assert.ok(exists(`assets/RemoteBundle/Textures/UI/${requiredPopupTexture}.png`), `RemoteBundle must contain ${requiredPopupTexture}.png`);
    assert.ok(exists(`assets/RemoteBundle/Textures/UI/${requiredPopupTexture}.png.meta`), `RemoteBundle must contain ${requiredPopupTexture}.png.meta`);
}
assert.ok(audioMgr.includes("from './AudioManifest'"), 'AudioMgr must import audio resources from AudioManifest');
assert.ok(audioManifest.includes('AUDIO_SFX_RESOURCE_PATH'), 'AudioManifest must own SFX paths');
assert.ok(audioManifest.includes('AUDIO_BGM_RESOURCE_PATH'), 'AudioManifest must own BGM path');
assert.ok(audioManifest.includes("place: 'Audio/pindd/right_place_short'"), 'place SFX must use the trimmed short landing clip');
assert.ok(exists('assets/RemoteBundle/Audio/pindd/right_place_short.mp3'), 'trimmed place SFX asset must exist');
assert.ok(exists('assets/RemoteBundle/Audio/pindd/right_place_short.mp3.meta'), 'trimmed place SFX meta must exist');
assert.ok(fs.statSync(path.join(root, 'assets/RemoteBundle/Audio/win.mp3')).size <= 2968, 'win SFX must keep the compressed asset size');
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
assert.ok(gameCtrl.includes('ResolutionPolicy.FIXED_WIDTH'), 'Home scene must use fixed-width resolution policy');
assert.ok(gameCtrl.includes('ResolutionPolicy.SHOW_ALL'), 'Game scene must keep show-all resolution policy');
assert.ok(gameCtrl.includes("screenRoot?.getChildByName(name) || host.getChildByName(name)"), 'runtime root lookup must prefer ScreenRoot and fall back to Canvas');
const progressFillMeta = JSON.parse(read('assets/RemoteBundle/Textures/UI/progress_fill.png.meta'));
assert.strictEqual(progressFillMeta.subMetas.f9941.userData.borderLeft, 13, 'progress_fill left cap inset must protect rounded ends');
assert.strictEqual(progressFillMeta.subMetas.f9941.userData.borderRight, 13, 'progress_fill right cap inset must protect rounded ends');
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
assert.ok(exists('assets/Scripts/Core/RemoteLevelDataService.ts.meta'), 'RemoteLevelDataService.ts must have Cocos meta');
assert.ok(gameCtrl.includes('resolveSlotRowPolicy({'), 'gameplay session must resolve slot row policy at level start');
assert.ok(gameCtrl.includes('if (levelId === 1)'), 'slot policy must special-case level 1 as one-row onboarding');
assert.ok(gameCtrl.includes('levelId >= 3 && levelId <= 5'), 'slot policy must special-case levels 3-5');
assert.ok(gameCtrl.includes("return normalizeLevelId(levelId) === 2 ? 'free' : 'ad';"), 'level 2 slot unlock must be free');
assert.ok(gameCtrl.includes('return normalizeLevelId(levelId) >= 6;'), 'level 6+ must append ad-gated expansion rows after unlock');
assert.ok(gameCtrl.includes('if (currentLevel < 2)'), 'skill area must be hidden only for level 1');
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
    'this.getSavedLevel() > 1',
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
    gameCtrl.includes('const firstLevelRouteResolveTask = this.startFirstLevelRouteExperimentResolve()'),
    'AB runtime must start WeChat experiment resolving in parallel with cloud save restore',
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
    'reportRemoteLoadDiagnostic(activeLevelId, \'remote_config_start\'',
    '\'remote_config_loaded\'',
    '\'remote_config_failed\'',
    '\'remote_startup_diagnostics\'',
    '\'remote_level_load_start\'',
    '\'bootstrap_level_start\'',
    '\'first_level_json_loaded\'',
    '\'first_level_json_failed\'',
    'stopRemoteLoadWithFatalError(',
    'showRemoteLoadFatalError(',
    'getRuntimeRemoteHash()',
    'RemoteLevelDataService',
    'level_data_cdn',
    'remoteHash: this.getRuntimeRemoteHash()',
    'remoteServer: this.getRuntimeRemoteServer()',
    'levelPath',
    'remote_bundle_missing_after_preload',
    'remote_bean_assets_failed',
    'remote_bean_assets_missing',
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
for (const forbidden of [
    'this.initGame(data || this.getBuiltinLevel()',
    'BeanSpriteFactory',
    'getGeneratedBootstrapBeanFrame',
    '_cacheGeneratedBootstrapBeanFrames',
    'generated fallback',
    '_ensureRemoteBeanAtlasLoaded',
    '_preloadBeanFrameTasksFromRemoteBundle',
    'private _hasRemoteBeanFramesForLevelData(',
]) {
    assert.strictEqual(gameCtrl.includes(forbidden), false, `GameCtrl remote loading must not silently fallback with ${forbidden}`);
}

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
assert.ok(levelPreview.includes('../assets/RemoteBundle/LevelData/'), 'level-preview.html must read main levels from RemoteBundle');
assert.strictEqual(levelPreview.includes('../assets/Resources/LevelData/'), false, 'level-preview.html must not read removed Resources LevelData');
const guankaPreview = read('tools/guanka-preview.html');
assert.ok(guankaPreview.includes("const DEFAULT_LEVEL_DIR = 'assets/RemoteBundle/LevelData'"), 'guanka-preview.html must default to RemoteBundle LevelData');
assert.strictEqual(guankaPreview.includes("const DEFAULT_LEVEL_DIR = 'tools/guanka'"), false, 'guanka-preview.html must not default to missing tools/guanka');
assert.ok(guankaPreview.includes("url.searchParams.set('level', String(data.levelId));"), 'guanka-preview.html must open default RemoteBundle levels with ?level=');
assert.ok(guankaPreview.includes("url.searchParams.set('levelfile', getLevelFilePath(data));"), 'guanka-preview.html must keep levelfile fallback for custom directories');
const guankaRefine = read('tools/guanka-refine.html');
assert.ok(guankaRefine.includes("const DEFAULT_LEVEL_DIR = 'assets/RemoteBundle/LevelData'"), 'guanka-refine.html must default to RemoteBundle LevelData');
assert.ok(guankaRefine.includes("fetch(buildApiUrl('/api/load-level'"), 'guanka-refine.html must load levels through the tools API');
assert.ok(guankaRefine.includes("fetch('/api/save-level-game'"), 'guanka-refine.html must save game levels to RemoteBundle through the game save API');
assert.ok(guankaRefine.includes("body: JSON.stringify({ targetType: 'main', levelData: levelToSave })"), 'guanka-refine.html must save a clean wrapped main-level payload');
assert.strictEqual(guankaRefine.includes('./guanka/level_'), false, 'guanka-refine.html must not load from missing tools/guanka');

const themePanelController = read('assets/Scripts/Core/Panels/ThemePanelController.ts');
assert.ok(themePanelController.includes('COLLECTION_TEXTURE_NAMES'), 'ThemePanelController must preload collection card textures before theme card rendering');
assert.ok(themePanelController.includes("_openPanelAfterTextures('theme'"), 'ThemePanelController must gate theme panel opening on sprite frame availability');
assert.ok(themePanelController.includes('home_start_button'), 'ThemePanelController must preload the shared theme card button texture');
assert.strictEqual(/canOpenThemePanel\(\)[\s\S]{0,160}return;/.test(themePanelController), false, 'ThemePanelController must not block the whole theme panel before card-level locks render');
const themeLoadingOverlay = read('assets/Scripts/Core/GameCtrlModules/ThemeLoadingOverlayModule.ts');
assert.ok(/startThemeLevel[\s\S]*getRuntimeSceneName\('Game'\) === 'Home'[\s\S]*requestGameplaySceneTransition\(levelId, 'zt_level_', false\)/.test(themeLoadingOverlay), 'Theme challenge levels must route Home -> Game before loading zt_level gameplay');

const toolsServer = read('tools/server.py');
assert.ok(toolsServer.includes("'assets', 'RemoteBundle', 'LevelData'"), 'tools/server.py must save game levels to RemoteBundle LevelData');
assert.ok(toolsServer.includes('LEVEL_DATA_DIR = GAME_LEVEL_DATA_DIR'), 'tools/server.py default level directory must be RemoteBundle LevelData');
assert.strictEqual(toolsServer.includes("'assets', 'Resources', 'LevelData'"), false, 'tools/server.py must not save game levels to removed Resources LevelData');

const userStateSyncMgr = read('assets/Scripts/Core/UserStateSyncMgr.ts');
const syncUserState = read('cloudfunctions/syncUserState/index.js');
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

console.log('build script checks passed');
