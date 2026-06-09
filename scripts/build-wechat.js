#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const projectDir = path.resolve(__dirname, '..');
const buildDir = path.join(projectDir, 'build', 'wechatgame');
const levelDataCdnDir = path.join(projectDir, 'build', 'level-data-cdn');
const gameAssetsRoot = path.join(projectDir, 'assets', 'GameAssetsBundle');
const levelDataRoot = path.join(projectDir, 'assets', 'LevelData');
const buildConfigPath = path.join(projectDir, 'temp', 'wechat-build-config.json');
const startSceneUrl = 'db://assets/Scenes/Game.scene';
const buildMode = parseBuildMode(process.argv.slice(2));
const mainPackageBudgetKB = 3072;
const wechatAppId = process.env.WECHAT_APPID || 'wxbb6160c828f380ca';
const openDevtools = process.env.WECHAT_OPEN_DEVTOOLS || '1';
process.env.WECHAT_BUILD_MODE = buildMode;
process.env.WECHAT_GAME_ASSETS_MODE = 'subpackage';
process.env.WECHAT_APPID = wechatAppId;
process.env.WECHAT_OPEN_DEVTOOLS = openDevtools;

function logStep(message) {
    console.log('');
    console.log(message);
}
function logInfo(message) {
    console.log('   ' + message);
}

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function parseBuildMode(args) {
    if (args.length > 1) fail('用法: node scripts/build-wechat.js [--release|--debug]');
    const mode = args[0] || '--release';
    if (mode === '--release' || mode === 'release') return 'release';
    if (mode === '--debug' || mode === 'debug') return 'debug';
    fail('未知构建模式: ' + mode);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function rm(target) {
    fs.rmSync(target, { recursive: true, force: true });
}

function cleanCocosGeneratedCaches() {
    if (process.env.WECHAT_CLEAN_COCOS_CACHE === '0') {
        logInfo('已跳过 Cocos 项目级生成缓存清理');
        return;
    }
    for (const relPath of [
        'library',
        'temp/asset-db',
        'temp/builder',
        'temp/programming',
    ]) {
        rm(path.join(projectDir, relPath));
    }
    logInfo('已清理 Cocos 项目级生成缓存，避免 stale asset-db/importer 状态污染构建');
}

function movePath(src, dest) {
    rm(dest);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
        fs.renameSync(src, dest);
    } catch (err) {
        fs.cpSync(src, dest, { recursive: true });
        rm(src);
    }
}

function walkFiles(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walkFiles(full, out);
        else out.push(full);
    }
    return out;
}

function dirSize(dir, excludeRoot) {
    if (!fs.existsSync(dir)) return 0;
    const excludedRoots = (Array.isArray(excludeRoot) ? excludeRoot : (excludeRoot ? [excludeRoot] : []))
        .map((entry) => path.resolve(entry));
    let size = 0;
    for (const filePath of walkFiles(dir)) {
        const abs = path.resolve(filePath);
        if (excludedRoots.some((excluded) => abs === excluded || abs.startsWith(excluded + path.sep))) continue;
        size += fs.statSync(filePath).size;
    }
    return size;
}

function formatMB(bytes) {
    return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

function runNode(script, args = []) {
    const result = spawnSync(process.execPath, [path.join(projectDir, script), ...args], {
        cwd: projectDir,
        env: process.env,
        stdio: 'inherit',
        shell: false,
    });
    if (result.error) fail(result.error.message);
    if (result.status !== 0) process.exit(result.status || 1);
}

function repairCocosMetaFiles() {
    runNode('scripts/repair-cocos-meta.js', ['assets']);
    runNode('scripts/verify-cocos-meta.js', ['assets']);
}

function getStartSceneUuid() {
    const configPath = path.join(projectDir, 'settings', 'v2', 'packages', 'project.json');
    const startScene = readJson(configPath).general && readJson(configPath).general.startScene;
    if (!startScene) fail('settings/v2/packages/project.json 缺少 general.startScene');
    return startScene;
}

function resolveCocosCli() {
    if (process.env.COCOS_CLI) return process.env.COCOS_CLI;
    const candidates = process.platform === 'win32'
        ? [
            'C:\\Program Files\\Cocos\\Creator\\3.8.8\\CocosCreator.exe',
            'C:\\Program Files\\CocosCreator\\CocosCreator.exe',
        ]
        : [
            '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator',
            '/Applications/CocosCreator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator',
            '/Applications/CocosCreator.app/Contents/MacOS/CocosCreator',
        ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

const forbiddenRemoteSourceFiles = [
    'Audio/README.md',
    'Audio/button.wav',
    'Audio/pindd/click.mp3',
    'Audio/pindd/pick_up.mp3',
    'Audio/pindd/victory.mp3',
    'Textures/UI/home_bg1.png',
    'Textures/UI/banner_lives.png',
    'Textures/Slot/slot_row_solid.png',
    'Textures/UI/icon_clock.png',
    'Textures/UI/icon_settings.png',
    'Textures/Slot/slot_empty.png',
    'Textures/Slot/slot_bg.png',
    'Textures/UI/btn_add_home.png',
    'Textures/Pindd/UI/slot_row_bg_pindd.png',
];

const forbiddenRemoteSourceDirs = [
    'Textures/Pindd/Beans',
];

function validateGameAssetsBundle() {
    const requiredFiles = [
        path.join(gameAssetsRoot, 'themes.json'),
        path.join(gameAssetsRoot, 'Audio', 'bgm.mp3'),
        path.join(gameAssetsRoot, 'Textures', 'UI', 'home_start_button.png'),
    ];
    for (const filePath of requiredFiles) {
        if (!fs.existsSync(filePath)) fail('GameAssetsBundle 缺少关键资源: ' + path.relative(projectDir, filePath));
    }
    for (const relPath of forbiddenRemoteSourceFiles) {
        const filePath = path.join(gameAssetsRoot, ...relPath.split('/'));
        if (fs.existsSync(filePath)) fail('GameAssetsBundle 不应包含已清理旧资源: ' + relPath);
        if (fs.existsSync(filePath + '.meta')) fail('GameAssetsBundle 不应包含已清理旧资源 meta: ' + relPath + '.meta');
    }
    for (const relPath of forbiddenRemoteSourceDirs) {
        const dirPath = path.join(gameAssetsRoot, ...relPath.split('/'));
        if (fs.existsSync(dirPath)) fail('GameAssetsBundle 不应包含旧单豆图片目录: ' + relPath);
        if (fs.existsSync(dirPath + '.meta')) fail('GameAssetsBundle 不应包含旧单豆图片目录 meta: ' + relPath + '.meta');
    }
    if (fs.existsSync(path.join(gameAssetsRoot, 'LevelData')) || fs.existsSync(path.join(gameAssetsRoot, 'LevelData.meta'))) {
        fail('GameAssetsBundle 不应包含 LevelData；关卡源码应放在 assets/LevelData');
    }
    const forbiddenBeanAtlasFiles = [
        'bean-atlas.json',
        'bean-atlas.json.meta',
        'bean-atlas-data.json',
        'bean-atlas-data.json.meta',
        'bean-atlas.png',
        'bean-atlas.png.meta',
    ];
    for (const name of forbiddenBeanAtlasFiles) {
        const filePath = path.join(gameAssetsRoot, 'Textures', 'Beans', name);
        if (fs.existsSync(filePath)) {
            fail('GameAssetsBundle 不应包含豆豆图集资源，请放到 BootstrapBundle/Beans: ' + path.relative(projectDir, filePath));
        }
    }
    logInfo('GameAssetsBundle 稳定业务资源校验通过');
}

function validateLevelDataSource() {
    if (!fs.existsSync(levelDataRoot)) fail('assets/LevelData 目录不存在');
    const levels = fs.readdirSync(levelDataRoot).filter((name) => /^level_\d+\.json$/.test(name));
    if (levels.length < 300) fail('assets/LevelData 数量异常: ' + levels.length);
    for (const filePath of walkFiles(levelDataRoot).filter((item) => item.endsWith('.json'))) {
        JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!fs.existsSync(filePath + '.meta')) fail('assets/LevelData 缺少 meta: ' + path.basename(filePath));
    }
    logInfo('assets/LevelData 真源校验通过，levels=' + levels.length);
}

function findSettingsPath(runtimeDir) {
    const srcDir = path.join(runtimeDir, 'src');
    if (!fs.existsSync(srcDir)) return '';
    const exact = path.join(srcDir, 'settings.json');
    if (fs.existsSync(exact)) return exact;
    const matches = fs.readdirSync(srcDir)
        .filter((name) => /^settings(?:\.[0-9a-f]+)?\.json$/i.test(name))
        .sort();
    return matches.length === 1 ? path.join(srcDir, matches[0]) : '';
}

function normalizeSubpackageRoot(root) {
    return String(root || '').replace(/^\/+|\/+$/g, '');
}

function findSubpackageRoot(gameJson, bundleName) {
    const subpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [];
    for (const item of subpackages) {
        const root = normalizeSubpackageRoot(item && item.root);
        if ((item && item.name === bundleName) || root === bundleName || root === 'subpackages/' + bundleName) {
            return root || 'subpackages/' + bundleName;
        }
    }
    return '';
}

function findBundleConfigPath(bundleDir) {
    const exact = path.join(bundleDir, 'config.json');
    if (fs.existsSync(exact)) return exact;
    if (!fs.existsSync(bundleDir)) return exact;
    const matches = fs.readdirSync(bundleDir)
        .filter((name) => /^config(?:\.[0-9a-f]+)?\.json$/i.test(name))
        .sort();
    return matches.length === 1 ? path.join(bundleDir, matches[0]) : exact;
}

function resolveBundleDir(runtimeDir, bundleName, gameJson) {
    const localDir = path.join(runtimeDir, 'assets', bundleName);
    if (fs.existsSync(localDir)) return localDir;
    const subpackageRoot = findSubpackageRoot(gameJson || {}, bundleName);
    if (subpackageRoot) return path.join(runtimeDir, subpackageRoot);
    return path.join(runtimeDir, 'subpackages', bundleName);
}

function resolveRuntimeDir() {
    for (const runtime of [path.join(buildDir, 'minigame'), buildDir]) {
        if (findSettingsPath(runtime)) return runtime;
    }
    fail('构建后未生成 settings.json/settings.<hash>.json');
}

function updateProjectConfigAppid(projectConfigPath) {
    const data = readJson(projectConfigPath);
    let changed = false;
    if (data.appid !== wechatAppId) { data.appid = wechatAppId; changed = true; }
    if (data.compileType !== 'game') { data.compileType = 'game'; changed = true; }
    if (changed) writeJson(projectConfigPath, data);
    return changed;
}

function getConfigPaths(configPath) {
    const cfg = readJson(configPath);
    return Object.values(cfg.paths || {}).map((entry) => Array.isArray(entry) ? entry[0] : '').filter(Boolean);
}

function getPreloadBundleName(item) {
    return typeof item === 'string' ? item : item && item.bundle;
}

function assertStartupPreloadOrder(assets) {
    const preloadNames = Array.isArray(assets.preloadBundles)
        ? assets.preloadBundles.map(getPreloadBundleName).filter(Boolean)
        : [];
    const requiredOrder = ['bootstrap', 'main'];
    let previous = -1;
    for (const name of requiredOrder) {
        const index = preloadNames.indexOf(name);
        if (index === -1) fail('settings.assets.preloadBundles 缺少启动依赖 bundle: ' + name);
        if (index <= previous) fail('settings.assets.preloadBundles 启动顺序错误，应为 bootstrap -> main，实际: ' + preloadNames.join(' -> '));
        previous = index;
    }
    if (preloadNames.includes('gameAssets')) fail('settings.assets.preloadBundles 不应启动预加载 gameAssets 分包');
    if (preloadNames.includes('levelData')) fail('settings.assets.preloadBundles 不应启动预加载 levelData 分包');
}

function validateBootstrapRuntimeBundle(runtimeDir) {
    const configPath = path.join(runtimeDir, 'assets', 'bootstrap', 'config.json');
    if (!fs.existsSync(configPath)) fail('未找到本地 bootstrap bundle: ' + configPath);
    if (!fs.existsSync(path.join(runtimeDir, 'src', 'bundle-scripts', 'bootstrap', 'index.js'))) fail('bootstrap bundle-scripts stub 不存在');
    const paths = new Set(getConfigPaths(configPath));
    for (const required of [
        'LevelData/level_1',
        'Beans/bean-atlas-data',
        'Beans/bean-atlas',
        'Beans/bean-atlas/texture',
        'Beans/bean-atlas/spriteFrame',
        'GameUI/bg_game_pindd',
        'GameUI/home_bg',
        'GameUI/slot_groove_b_ui',
        'GameUI/slot_panel_shell_b_ui',
        'GameUI/slot_row_lock_mask_ui',
        'GameUI/slot_row_lock_dash_ui',
        'GameUI/倒计时',
        'GameUI/unlock_button',
        'GameUI/popup_gameplay_tool_slot_plate',
        'GameUI/popup_tool_wand_icon',
        'GameUI/popup_tool_brush_icon',
        'GameUI/popup_tool_magnet_icon',
        'GameUI/solid_white',
        'GameUI/主关卡按键 (2)',
        'GameUI/主页标题',
        'GameUI/主题挑战',
        'GameUI/图鉴1',
        'GameUI/排行榜1',
        'GameUI/爱心框',
        'GameUI/签到1',
        'GameUI/设置',
        'GameUI/部件底板',
        'GameUI/金币框 (2)',
        'GameUI/预览框',
    ]) {
        if (!paths.has(required)) fail('bootstrap 缺少首关必要资源: ' + required);
    }
    for (const entry of paths) {
        if (/^LevelData\/level_\d+$/.test(entry) && entry !== 'LevelData/level_1') fail('bootstrap 不应包含非首关候选关卡: ' + entry);
    }
}

function assertRuntimeScenes(runtimeDir) {
    const gameJsonPath = path.join(runtimeDir, 'game.json');
    const gameJson = fs.existsSync(gameJsonPath) ? readJson(gameJsonPath) : {};
    const mainConfigPath = findBundleConfigPath(resolveBundleDir(runtimeDir, 'main', gameJson));
    if (!fs.existsSync(mainConfigPath)) fail('缺少 main bundle 配置: ' + mainConfigPath);
    const scenes = readJson(mainConfigPath).scenes || {};
    for (const sceneUrl of ['db://assets/Scenes/Home.scene', 'db://assets/Scenes/Game.scene']) {
        if (!Object.prototype.hasOwnProperty.call(scenes, sceneUrl)) {
            fail('微信构建缺少运行态场景: ' + sceneUrl);
        }
    }
}

function assertMainBundleDoesNotDependOnSubpackages(runtimeDir) {
    const gameJsonPath = path.join(runtimeDir, 'game.json');
    const gameJson = fs.existsSync(gameJsonPath) ? readJson(gameJsonPath) : {};
    const mainConfigPath = findBundleConfigPath(resolveBundleDir(runtimeDir, 'main', gameJson));
    const deps = readJson(mainConfigPath).deps || [];
    for (const bundleName of ['gameAssets', 'levelData']) {
        if (deps.includes(bundleName)) fail('main bundle 不应依赖 ' + bundleName + '；启动场景仍有分包强引用');
    }
}

function validateRuntime(runtimeDir) {
    const projectConfigPath = path.join(buildDir, 'project.config.json');
    if (!fs.existsSync(projectConfigPath)) fail('未找到微信项目配置: ' + projectConfigPath);
    logInfo(updateProjectConfigAppid(projectConfigPath) ? 'project.config.json 已写入 appid: ' + wechatAppId : 'project.config.json appid 已就绪: ' + wechatAppId);
    const projectConfig = readJson(projectConfigPath);
    if (projectConfig.miniprogramRoot !== 'minigame/') fail('project.config.json 未指向 minigame/');
    if (!fs.existsSync(path.join(runtimeDir, 'openDataContext'))) fail('minigame/openDataContext 目录不存在');
    const gameJs = fs.readFileSync(path.join(runtimeDir, 'game.js'), 'utf8');
    if (gameJs.includes('canvas.width *= info.devicePixelRatio')) fail('game.js DPR 乘法未移除');
    const firstScreenPath = path.join(runtimeDir, 'first-screen.js');
    if (fs.existsSync(firstScreenPath) && fs.readFileSync(firstScreenPath, 'utf8').includes('let fitHeight = false;')) fail('first-screen.js 竖屏适配未修正');
    if (fs.existsSync(path.join(runtimeDir, 'assets', 'remote'))) fail('本地包中仍存在 assets/remote');
    if (fs.existsSync(path.join(runtimeDir, 'assets', 'gameAssets'))) fail('本地包中仍存在 assets/gameAssets');
    if (fs.existsSync(path.join(runtimeDir, 'assets', 'resources'))) fail('本地包中仍存在 assets/resources');
    validateBootstrapRuntimeBundle(runtimeDir);
    assertRuntimeScenes(runtimeDir);
    assertMainBundleDoesNotDependOnSubpackages(runtimeDir);
    const settings = readJson(findSettingsPath(runtimeDir));
    const assets = settings.assets || {};
    const server = String(assets.server || '').trim();
    if (server) fail('settings.assets.server 应为空，gameAssets 不作为 Cocos CDN bundle: ' + server);
    if (Array.isArray(assets.gameAssetsBundles)) fail('settings.assets.gameAssetsBundles 是误写字段，应使用 Cocos remoteBundles');
    if (Array.isArray(assets.remoteBundles) && assets.remoteBundles.includes('gameAssets')) fail('settings.assets.remoteBundles 不应包含 gameAssets');
    if (!assets.projectBundles || !assets.projectBundles.includes('bootstrap')) fail('settings.json 缺少 bootstrap bundle 声明');
    if (!assets.projectBundles || !assets.projectBundles.includes('gameAssets')) fail('settings.json 缺少 gameAssets 分包 bundle 声明');
    const settingsSubpackages = Array.isArray(assets.subpackages) ? assets.subpackages : [];
    const gameJson = readJson(path.join(runtimeDir, 'game.json'));
    const gameAssetsSubpackageRoot = findSubpackageRoot(gameJson, 'gameAssets');
    if (!settingsSubpackages.includes('gameAssets')) fail('settings.assets.subpackages 缺少 gameAssets');
    if (!gameAssetsSubpackageRoot) fail('game.json.subpackages 缺少 gameAssets');
    const levelDataSubpackageRoot = findSubpackageRoot(gameJson, 'levelData');
    if (buildMode === 'debug') {
        if (!settingsSubpackages.includes('levelData')) fail('debug settings.assets.subpackages 缺少 levelData');
        if (!levelDataSubpackageRoot) fail('debug game.json.subpackages 缺少 levelData');
        const levelDataDir = resolveBundleDir(runtimeDir, 'levelData', gameJson);
        if (!fs.existsSync(findBundleConfigPath(levelDataDir))) fail('debug 未找到 levelData 分包 bundle 配置');
        const levelDataGameJsPath = path.join(levelDataDir, 'game.js');
        if (!fs.existsSync(levelDataGameJsPath)) fail('debug levelData 微信分包缺少入口 game.js');
        if (!fs.readFileSync(levelDataGameJsPath, 'utf8').includes('virtual:///prerequisite-imports/levelData')) {
            fail('debug levelData 微信分包 game.js 未注册 Cocos prerequisite import');
        }
    } else {
        if (settingsSubpackages.includes('levelData')) fail('release 不应包含本地 levelData 分包');
        if (levelDataSubpackageRoot) fail('release game.json.subpackages 不应包含 levelData');
        if (fs.existsSync(path.join(runtimeDir, 'assets', 'levelData')) || fs.existsSync(path.join(runtimeDir, 'subpackages', 'levelData'))) {
            fail('release 包不应包含本地 levelData bundle');
        }
    }
    assertStartupPreloadOrder(assets);
    if (!fs.existsSync(path.join(runtimeDir, 'src', 'bundle-scripts', 'gameAssets', 'index.js'))) fail('本地 gameAssets bundle script 缺少稳定入口 index.js');
    const gameAssetsDir = resolveBundleDir(runtimeDir, 'gameAssets', gameJson);
    const gameAssetsConfigPath = findBundleConfigPath(gameAssetsDir);
    if (!fs.existsSync(gameAssetsConfigPath)) fail('未找到 gameAssets 分包 bundle 配置: ' + gameAssetsConfigPath);
    const gameAssetsGameJsPath = path.join(gameAssetsDir, 'game.js');
    if (!fs.existsSync(gameAssetsGameJsPath)) fail('gameAssets 微信分包缺少入口 game.js: ' + gameAssetsGameJsPath);
    if (!fs.readFileSync(gameAssetsGameJsPath, 'utf8').includes('virtual:///prerequisite-imports/gameAssets')) {
        fail('gameAssets 微信分包 game.js 未注册 Cocos prerequisite import');
    }
    return { gameAssetsMode: 'subpackage', server, gameAssetsDir };
}

function validateLevelDataCdn() {
    const livePath = path.join(levelDataCdnDir, 'level_live.json');
    if (!fs.existsSync(livePath)) fail('关卡数据 CDN 缺少 level_live.json');
    const manifest = readJson(livePath);
    if (manifest.manifestVersion !== 1 || manifest.schemaVersion !== 1) fail('level_live.json schema 不正确');
    if (!Array.isArray(manifest.packs) || manifest.packs.length < 1) fail('level_live.json 缺少 packs');
    let levelCount = 0;
    for (const pack of manifest.packs) {
        if (!pack || typeof pack.url !== 'string') fail('level_live.json pack.url 不正确');
        const packPath = path.join(levelDataCdnDir, pack.url);
        if (!fs.existsSync(packPath)) fail('关卡数据 CDN 缺少 pack: ' + pack.url);
        const packJson = readJson(packPath);
        if (packJson.id !== pack.id) fail('关卡数据 pack id 不一致: ' + pack.url);
        if (!Array.isArray(packJson.levels) || packJson.levels.length !== pack.levelCount) fail('关卡数据 pack levelCount 不一致: ' + pack.url);
        levelCount += packJson.levels.length;
    }
    if (levelCount !== manifest.levelCount) fail('level_live.json levelCount 不一致: ' + levelCount + ' != ' + manifest.levelCount);
    if (levelCount < 300) fail('关卡数据 CDN 关卡数量异常: ' + levelCount);
    logInfo('关卡数据 CDN 校验通过，packs=' + manifest.packs.length + ' levels=' + levelCount + ' version=' + manifest.dataVersion);
}

function maybeReloadWechatDevtools() {
    if (openDevtools !== '1' || process.platform !== 'darwin') {
        logInfo('已跳过微信开发者工具自动重载');
        return;
    }
    const cli = '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatwebdevtools';
    if (!fs.existsSync(cli)) {
        logInfo('未找到微信开发者工具，跳过自动重载');
        return;
    }
    const child = spawn(cli, [buildDir], { detached: true, stdio: 'ignore' });
    child.unref();
    logInfo('已通知微信开发者工具重新加载项目');
}

console.log('=== 微信小游戏打包 ===');
logInfo('Mode: ' + buildMode);
logInfo('GameAssets bundle: wechat subpackage');

logStep('0. 清理旧产物...');
rm(buildDir);
rm(levelDataCdnDir);
logInfo('build/wechatgame 与 build/level-data-cdn 已清理');
cleanCocosGeneratedCaches();
repairCocosMetaFiles();

logStep('0.1 校验 assets/LevelData 真源...');
validateGameAssetsBundle();
validateLevelDataSource();

logStep('0.15 生成远程关卡数据包...');
runNode('scripts/write-level-data-cdn.js', [levelDataCdnDir]);
logInfo('关卡数据 CDN 产物已生成: ' + levelDataCdnDir);

logStep('0.2 准备 BootstrapBundle 首关快照...');
runNode('scripts/prepare-wechat-bootstrap.js');
logInfo('BootstrapBundle 源目录已通过首关快照与首屏豆豆图集校验');

const startSceneUuid = getStartSceneUuid();
runNode('scripts/write-wechat-build-config.js', [buildConfigPath, startSceneUrl, startSceneUuid, '--' + buildMode]);
logInfo('微信构建配置已生成: ' + buildConfigPath);

logStep('1. Cocos Creator 构建 wechatgame...');
const cocosCli = resolveCocosCli();
if (!cocosCli || !fs.existsSync(cocosCli)) fail('Cocos Creator CLI 不存在，请安装 Cocos Creator 3.8.8，或用 COCOS_CLI 指定路径');
const buildResult = spawnSync(cocosCli, ['--project', projectDir, '--build', 'configPath=' + buildConfigPath], {
    cwd: projectDir,
    env: process.env,
    stdio: 'inherit',
    shell: false,
});
if (buildResult.error) fail(buildResult.error.message);
repairCocosMetaFiles();
if (!findSettingsPath(buildDir) && !findSettingsPath(path.join(buildDir, 'minigame'))) {
    fail('Cocos 构建失败，未生成 settings.json/settings.<hash>.json');
}
if (buildResult.status !== 0 || buildResult.signal) {
    logInfo('Cocos 构建进程返回非零状态，但产物已生成，继续后处理: status=' + buildResult.status + ' signal=' + (buildResult.signal || ''));
}
logInfo('Cocos 构建完成');

logStep('2. 运行构建后处理...');
runNode('scripts/postbuild-wechat.js', [buildDir]);
if (fs.existsSync(path.join(projectDir, 'cloudfunctions'))) {
    rm(path.join(buildDir, 'cloudfunctions'));
    fs.cpSync(path.join(projectDir, 'cloudfunctions'), path.join(buildDir, 'cloudfunctions'), { recursive: true });
    logInfo('cloudfunctions 已复制到本地包');
}

const runtimeDir = resolveRuntimeDir();
logStep('2.1 补齐 bootstrap 动态图片...');
runNode('scripts/patch-bootstrap-dynamic-assets.js', [runtimeDir]);

logStep('2.2 校验本地包与远程包...');
const runtimeInfo = validateRuntime(runtimeDir);
validateLevelDataCdn();
logInfo('本地包、gameAssets 分包与关卡数据 CDN 校验通过，mode=' + runtimeInfo.gameAssetsMode);

logStep('3. 输出体积...');
const gameJson = readJson(path.join(runtimeDir, 'game.json'));
const subpackageRoots = (Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [])
    .map((item) => String(item && item.root || '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .map((root) => path.join(runtimeDir, root));
const mainBytes = dirSize(runtimeDir, subpackageRoots);
const runtimeBytes = dirSize(runtimeDir);
const mainKB = Math.round(mainBytes / 1024);
console.log('   - 本地包项目:        ' + buildDir);
console.log('   - 运行时根目录:      ' + runtimeDir);
console.log('   - 关卡数据 CDN:      ' + levelDataCdnDir);
console.log('   - assets/bootstrap: ' + formatMB(dirSize(path.join(runtimeDir, 'assets', 'bootstrap'))));
console.log('   - gameAssets 分包:       ' + formatMB(dirSize(runtimeInfo.gameAssetsDir)));
console.log('   - 关卡数据包:        ' + formatMB(dirSize(levelDataCdnDir)));
console.log('');
console.log('4. 微信上传主包: ' + formatMB(mainBytes) + ' (' + mainKB + 'KB / ' + mainPackageBudgetKB + 'KB 目标, 排除 game.json.subpackages)');
console.log('   minigame 实际目录: ' + formatMB(runtimeBytes));
if (mainKB > mainPackageBudgetKB) fail('主包超过目标 ' + mainPackageBudgetKB + 'KB: ' + mainKB + 'KB');
logInfo('主包 <= ' + mainPackageBudgetKB + 'KB');

console.log('');
console.log('=== 打包完成 ===');
console.log('本地包：' + buildDir);
console.log('关卡数据包：' + levelDataCdnDir);
console.log('如需上传关卡数据，再执行：npm run sync:cdn:wechat');
maybeReloadWechatDevtools();
