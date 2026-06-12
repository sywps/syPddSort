#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
    assertBundleNativeFilesExist,
    assertSourceBundleArtifactsExist,
} = require('./verify-bundle-native-files.js');

const buildPath = process.argv[2] || path.resolve(__dirname, '..', 'build', 'wechatgame');
const levelDataCdnPath = process.argv[3] || path.resolve(__dirname, '..', 'build', 'level-data-cdn');
const projectRoot = path.resolve(__dirname, '..');
const WECHAT_APP_ID = process.env.WECHAT_APPID || 'wxbb6160c828f380ca';
const LEVEL_DATA_CDN_URL = process.env.PDD_LEVEL_DATA_CDN_URL || 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat/levels/';
const PREVIEW_SCENE_NAMES = ['UIPreview', 'PanelPreview', 'FxPreview'];
const ALLOWED_GAME_SCENE_DIRECT_PREFABS = new Set([
    'assets/Prefabs/Panels/RevivePanel.prefab',
]);

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function assertFile(filePath, label) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) fail(label + ' 不存在: ' + filePath);
}

function assertDir(dirPath, label) {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) fail(label + ' 不存在: ' + dirPath);
}

function readJson(filePath) {
    assertFile(filePath, path.basename(filePath));
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function dirSize(dir, excludeNames) {
    let size = 0;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (excludeNames && excludeNames.includes(item.name)) {
            continue;
        }
        const full = path.join(dir, item.name);
        size += item.isDirectory() ? dirSize(full, excludeNames) : fs.statSync(full).size;
    }
    return size;
}

function resolveRuntimeRoot(root) {
    const minigame = path.join(root, 'minigame');
    if (findSettingsPath(minigame)) return minigame;
    return root;
}

function findSettingsPath(runtimeRoot) {
    const srcDir = path.join(runtimeRoot, 'src');
    if (!fs.existsSync(srcDir)) return '';
    const exact = path.join(srcDir, 'settings.json');
    if (fs.existsSync(exact)) return exact;
    const matches = fs.readdirSync(srcDir)
        .filter((name) => /^settings(?:\.[0-9a-f]+)?\.json$/i.test(name))
        .sort();
    return matches.length === 1 ? path.join(srcDir, matches[0]) : '';
}

function findApplicationPath(runtimeRoot) {
    const exact = path.join(runtimeRoot, 'application.js');
    if (fs.existsSync(exact)) return exact;
    const matches = fs.existsSync(runtimeRoot)
        ? fs.readdirSync(runtimeRoot)
            .filter((name) => /^application(?:\.[0-9a-f]+)?\.js$/i.test(name))
            .sort()
        : [];
    return matches.length === 1 ? path.join(runtimeRoot, matches[0]) : exact;
}

function walkFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    const result = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) result.push(...walkFiles(full));
        else result.push(full);
    }
    return result;
}

function normalizeSlashes(filePath) {
    return filePath.split(path.sep).join('/');
}

function normalizeSubpackageRoot(root) {
    return String(root || '').replace(/^\/+|\/+$/g, '');
}

function parseLevelDataSourceFile(name) {
    const match = /^(zt_level_|level_)(\d+)\.json$/.exec(name);
    if (!match) return null;
    const levelId = Math.max(1, Math.floor(Number(match[2]) || 1));
    return {
        file: name,
        prefix: match[1],
        levelId,
        key: match[1] + levelId,
    };
}

function collectSourceLevelDataEntries() {
    const levelDataRoot = path.join(projectRoot, 'assets', 'LevelData');
    assertDir(levelDataRoot, 'assets/LevelData');
    return fs.readdirSync(levelDataRoot)
        .map(parseLevelDataSourceFile)
        .filter(Boolean)
        .sort((a, b) => a.prefix.localeCompare(b.prefix) || a.levelId - b.levelId);
}

function countLevelDataPrefixes(entries) {
    return entries.reduce((counts, entry) => {
        counts[entry.prefix] = (counts[entry.prefix] || 0) + 1;
        return counts;
    }, {});
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

function resolveBundleDir(runtimeRoot, bundleName, gameJson) {
    const localDir = path.join(runtimeRoot, 'assets', bundleName);
    if (fs.existsSync(localDir)) return localDir;
    const subpackageRoot = findSubpackageRoot(gameJson || {}, bundleName);
    if (subpackageRoot) return path.join(runtimeRoot, subpackageRoot);
    return path.join(runtimeRoot, 'subpackages', bundleName);
}

function buildAssetUuidIndex(rootDir) {
    const assetRoot = path.join(rootDir, 'assets');
    const index = new Map();
    for (const filePath of walkFiles(assetRoot)) {
        if (!filePath.endsWith('.meta')) continue;
        try {
            const meta = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (!meta || typeof meta.uuid !== 'string' || !meta.uuid) continue;
            const assetPath = path.relative(rootDir, filePath.slice(0, -'.meta'.length));
            const normalizedAssetPath = normalizeSlashes(assetPath);
            index.set(meta.uuid, normalizedAssetPath);
            for (const [subName, subMeta] of Object.entries(meta.subMetas || {})) {
                if (!subMeta || typeof subMeta.uuid !== 'string' || !subMeta.uuid) continue;
                index.set(subMeta.uuid, normalizedAssetPath + '#' + subName);
            }
        } catch (err) {
            fail('解析资源 meta 失败: ' + filePath + ' -> ' + (err && err.message ? err.message : err));
        }
    }
    return index;
}

function collectSceneAssetRefs(value, out, segments) {
    if (!value) return;
    if (Array.isArray(value)) {
        value.forEach((item, index) => collectSceneAssetRefs(item, out, segments.concat(String(index))));
        return;
    }
    if (typeof value !== 'object') return;
    if (typeof value.__uuid__ === 'string' && typeof value.__expectedType__ === 'string') {
        out.push({
            uuid: value.__uuid__,
            expectedType: value.__expectedType__,
            path: segments.join('.'),
        });
        return;
    }
    for (const [key, child] of Object.entries(value)) {
        collectSceneAssetRefs(child, out, segments.concat(key));
    }
}

function assertPreviewAssetsExcluded(runtimeRoot) {
    const configFiles = [
        findSettingsPath(runtimeRoot),
        ...walkFiles(path.join(runtimeRoot, 'assets')).filter((filePath) => /^config(?:\.[0-9a-f]+)?\.json$/i.test(path.basename(filePath))),
        ...walkFiles(path.join(runtimeRoot, 'subpackages')).filter((filePath) => /^config(?:\.[0-9a-f]+)?\.json$/i.test(path.basename(filePath))),
    ].filter((filePath, index, list) => fs.existsSync(filePath) && list.indexOf(filePath) === index);
    const text = configFiles.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n');
    for (const sceneName of PREVIEW_SCENE_NAMES) {
        const sceneUrl = `db://assets/Scenes/${sceneName}.scene`;
        const scenePath = `db:/assets/Scenes/${sceneName}`;
        if (text.includes(sceneUrl) || text.includes(scenePath)) {
            fail(`正式微信包不应包含 preview 场景: ${sceneName}.scene`);
        }
    }
}

function assertGameSceneStrongReferences(rootDir) {
    const scenePath = path.join(rootDir, 'assets', 'Scenes', 'Game.scene');
    const sceneData = readJson(scenePath);
    const refs = [];
    collectSceneAssetRefs(sceneData, refs, ['Game.scene']);
    const uuidIndex = buildAssetUuidIndex(rootDir);
    const gameAssetsRefs = new Set();
    const unexpectedPrefabs = new Set();
    for (const ref of refs) {
        const assetPath = uuidIndex.get(ref.uuid);
        if (!assetPath) continue;
        if (assetPath.startsWith('assets/GameAssetsBundle/')) {
            gameAssetsRefs.add(`${assetPath} <- ${ref.path}`);
        }
        if (ref.expectedType === 'cc.Prefab' && !ALLOWED_GAME_SCENE_DIRECT_PREFABS.has(assetPath)) {
            unexpectedPrefabs.add(`${assetPath} <- ${ref.path}`);
        }
    }
    if (gameAssetsRefs.size) {
        fail('Game.scene 直接引用了 GameAssetsBundle 资源: ' + [...gameAssetsRefs].join(', '));
    }
    if (unexpectedPrefabs.size) {
        fail('Game.scene 直接引用了未登记 prefab: ' + [...unexpectedPrefabs].join(', '));
    }
}

function assertGameCtrlBinding(root) {
    const gameCtrlClassId = '82628JsoLVO36TidTplI+is';
    const gameJsonPath = path.join(root, 'game.json');
    const gameJson = fs.existsSync(gameJsonPath) ? readJson(gameJsonPath) : {};
    const mainBundleDir = resolveBundleDir(root, 'main', gameJson);
    const mainBundleScripts = fs.existsSync(mainBundleDir)
        ? fs.readdirSync(mainBundleDir)
            .filter((name) => /^(?:index|game)(?:\.[0-9a-f]+)?\.js$/i.test(name))
            .map((name) => path.join(mainBundleDir, name))
        : [];
    const scriptFiles = [
        ...mainBundleScripts,
        path.join(root, 'src', 'chunks', 'bundle.js'),
    ].filter((filePath) => fs.existsSync(filePath));
    const scriptText = scriptFiles.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n');
    if (!scriptText.includes(gameCtrlClassId) || !scriptText.includes('GameCtrl')) {
        fail('业务脚本未注册 GameCtrl class id，场景可能触发 Cocos 3817');
    }

    const mainImportDir = path.join(mainBundleDir, 'import');
    const importText = fs.existsSync(mainImportDir)
        ? walkFiles(mainImportDir).map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n')
        : scriptText;
    if (!importText.includes(gameCtrlClassId)) fail('启动场景未保留 GameCtrl 组件');
    if (importText.includes('"Game",[null]')) fail('启动场景 Game 节点组件被构建为 null');
}

function assertRuntimeScenes(root) {
    const gameJsonPath = path.join(root, 'game.json');
    const gameJson = fs.existsSync(gameJsonPath) ? readJson(gameJsonPath) : {};
    const mainConfigPath = findBundleConfigPath(resolveBundleDir(root, 'main', gameJson));
    const mainScenes = readJson(mainConfigPath).scenes || {};
    for (const sceneUrl of ['db://assets/Scenes/Loading.scene', 'db://assets/Scenes/Game.scene']) {
        if (!Object.prototype.hasOwnProperty.call(mainScenes, sceneUrl)) {
            fail('微信 main bundle 缺少运行态场景: ' + sceneUrl);
        }
    }
    if (Object.prototype.hasOwnProperty.call(mainScenes, 'db://assets/HomeAssetsBundle/Scenes/Home.scene')) {
        fail('Home.scene 不应进入 main bundle，应由 homeAssets 分包承载');
    }
    const homeAssetsConfigPath = findBundleConfigPath(resolveBundleDir(root, 'homeAssets', gameJson));
    if (!fs.existsSync(homeAssetsConfigPath)) fail('缺少 homeAssets bundle 配置: ' + homeAssetsConfigPath);
    const homeAssetsConfig = readJson(homeAssetsConfigPath);
    const homeDeps = homeAssetsConfig.deps || [];
    if (homeDeps.includes('gameAssets')) fail('homeAssets 分包不应依赖 gameAssets；老用户 Home 首屏会被 gameAssets 阻塞');
    const homeScenes = homeAssetsConfig.scenes || {};
    if (!Object.prototype.hasOwnProperty.call(homeScenes, 'db://assets/HomeAssetsBundle/Scenes/Home.scene')) {
        fail('homeAssets 分包缺少 Home.scene');
    }
}

function assertMainBundleDoesNotDependOnSubpackages(root) {
    const gameJsonPath = path.join(root, 'game.json');
    const gameJson = fs.existsSync(gameJsonPath) ? readJson(gameJsonPath) : {};
    const mainConfigPath = findBundleConfigPath(resolveBundleDir(root, 'main', gameJson));
    const deps = readJson(mainConfigPath).deps || [];
    for (const bundleName of ['homeAssets', 'gameAssets', 'levelData']) {
        if (deps.includes(bundleName)) fail('main bundle 不应依赖 ' + bundleName + '；启动场景仍有分包强引用');
    }
}

function getPreloadBundleName(item) {
    return typeof item === 'string' ? item : item && item.bundle;
}

function getPreloadBundleNames(assets) {
    return Array.isArray(assets.preloadBundles)
        ? assets.preloadBundles.map(getPreloadBundleName).filter(Boolean)
        : [];
}

function assertStartupPreloadOrder(assets) {
    const preloadNames = getPreloadBundleNames(assets);
    const requiredOrder = ['bootstrap', 'main'];
    let previous = -1;
    for (const name of requiredOrder) {
        const index = preloadNames.indexOf(name);
        if (index === -1) fail('settings.assets.preloadBundles 缺少启动依赖 bundle: ' + name);
        if (index <= previous) fail('settings.assets.preloadBundles 启动顺序错误，应为 bootstrap -> main，实际: ' + preloadNames.join(' -> '));
        previous = index;
    }
    if (preloadNames.includes('homeAssets')) fail('settings.assets.preloadBundles 不应启动预加载 homeAssets 分包');
    if (preloadNames.includes('gameAssets')) fail('settings.assets.preloadBundles 不应启动预加载 gameAssets 分包');
    if (preloadNames.includes('levelData')) fail('settings.assets.preloadBundles 不应启动预加载 levelData 分包');
}

function computeStartupDownloadBytes(runtimeRoot, gameJson, assets, rootPackageBytes) {
    let total = rootPackageBytes;
    const included = [];
    const seenSubpackageRoots = new Set();
    for (const bundleName of getPreloadBundleNames(assets)) {
        const subpackageRoot = findSubpackageRoot(gameJson, bundleName);
        if (!subpackageRoot || seenSubpackageRoots.has(subpackageRoot)) continue;
        const dir = path.join(runtimeRoot, subpackageRoot);
        const bytes = dirSize(dir);
        seenSubpackageRoots.add(subpackageRoot);
        included.push({ bundleName, root: subpackageRoot, bytes });
        total += bytes;
    }
    return { total, included };
}

assertDir(buildPath, '微信构建目录');
const runtimeRoot = resolveRuntimeRoot(buildPath);
const settingsPath = findSettingsPath(runtimeRoot);
assertFile(settingsPath, 'settings.json/settings.<hash>.json');
const settings = readJson(settingsPath);
const assets = settings.assets || {};
const settingsServer = String(assets.server || '');
const normalizedSettingsServer = settingsServer.trim();
if (normalizedSettingsServer) fail('settings.assets.server 应为空，gameAssets 不再作为 Cocos CDN bundle: ' + settingsServer);
if (Array.isArray(assets.gameAssetsBundles)) fail('settings.assets.gameAssetsBundles 是误写字段，应使用 Cocos remoteBundles');
if (Array.isArray(assets.remoteBundles) && assets.remoteBundles.includes('gameAssets')) fail('settings.assets.remoteBundles 不应包含 gameAssets');

assertFile(path.join(runtimeRoot, 'game.js'), 'game.js');
const gameJs = fs.readFileSync(path.join(runtimeRoot, 'game.js'), 'utf8');
if (!gameJs.includes('globalThis.__PDD_WECHAT_BUILD__=true;')) fail('game.js 缺少微信构建标记 __PDD_WECHAT_BUILD__');
const buildModeMatch = gameJs.match(/globalThis\.__PDD_WECHAT_BUILD_MODE__="([^"]+)";/);
if (!buildModeMatch) fail('game.js 缺少构建模式标记 __PDD_WECHAT_BUILD_MODE__');
const buildMode = buildModeMatch[1];
if (buildMode !== 'debug' && buildMode !== 'release') fail('game.js 构建模式标记不正确: ' + buildMode);
if (!gameJs.includes('__PDD_LEVEL_DATA_CDN_URL__')) fail('game.js 缺少关卡数据 CDN 地址标记');
if (!gameJs.includes(LEVEL_DATA_CDN_URL)) fail('game.js 关卡数据 CDN 地址不正确');
if (gameJs.includes('__PDD_REMOTE_LIVE_URL__') || gameJs.includes('resolvePddRemoteLiveVersion')) {
    fail('game.js 不应注入 Cocos remote live.json 启动逻辑');
}
assertFile(path.join(runtimeRoot, 'game.json'), 'game.json');
const applicationPath = findApplicationPath(runtimeRoot);
assertFile(applicationPath, 'application.js/application.<hash>.js');
const applicationJs = fs.readFileSync(applicationPath, 'utf8');
if (applicationJs.includes('__PDD_REMOTE_LIVE_VERSION__')) fail('application.js 不应注入 gameAssets bundle live version override');
assertFile(path.join(runtimeRoot, 'engine-adapter.js'), 'engine-adapter.js');
const engineAdapterJs = fs.readFileSync(path.join(runtimeRoot, 'engine-adapter.js'), 'utf8');
const stableLocalBundleScript = 'i="src/bundle-scripts/".concat';
if (!engineAdapterJs.includes(stableLocalBundleScript) || !engineAdapterJs.includes('"/index.js"')) {
    fail('engine-adapter.js 未将本地 gameAssets bundle 入口固定为 index.js');
}
if (/remoteServerAddress\.replace\(\/\\\/\$\/,\s*""\),i="src\/bundle-scripts\/"\.concat\([^,]+,"\/index\."\)\.concat/.test(engineAdapterJs)) {
    fail('engine-adapter.js 仍会按 live hash require 本地 gameAssets bundle 入口脚本');
}
const gameJson = readJson(path.join(runtimeRoot, 'game.json'));
assertFile(findBundleConfigPath(resolveBundleDir(runtimeRoot, 'main', gameJson)), 'main config.json');
assertGameCtrlBinding(runtimeRoot);
assertRuntimeScenes(runtimeRoot);
assertMainBundleDoesNotDependOnSubpackages(runtimeRoot);
assertPreviewAssetsExcluded(runtimeRoot);
assertGameSceneStrongReferences(projectRoot);

const projectConfig = readJson(path.join(buildPath, 'project.config.json'));
if (projectConfig.appid !== WECHAT_APP_ID) fail('project.config.json appid 不正确: ' + (projectConfig.appid || '<empty>'));
if (projectConfig.compileType && projectConfig.compileType !== 'game') fail('project.config.json compileType 不是 game');
if (projectConfig.miniprogramRoot && projectConfig.miniprogramRoot !== 'minigame/') fail('miniprogramRoot 不是 minigame/');
if (!String(projectConfig.cloudfunctionRoot || '').replace(/\/?$/, '/').endsWith('cloudfunctions/')) {
    fail('project.config.json cloudfunctionRoot 不正确: ' + (projectConfig.cloudfunctionRoot || '<empty>'));
}

if (gameJson.openDataContext !== 'openDataContext') fail('game.json 缺少 openDataContext');
if (gameJson.plugins && gameJson.plugins.cocos) {
    fail('微信包不应启用 Cocos 插件分离引擎，请检查 separateEngine=false');
}
const runtimeJsText = walkFiles(runtimeRoot)
    .filter((filePath) => filePath.endsWith('.js'))
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n');
for (const forbidden of ['plugin:cocos', 'wx0446ba2621dda60a', '__plugin__/wx0446ba2621dda60a']) {
    if (runtimeJsText.includes(forbidden)) {
        fail('微信包仍引用未授权 Cocos 插件: ' + forbidden);
    }
}
for (const forbidden of ['getAnimationInterval', 'setAnimationInterval']) {
    if (runtimeJsText.includes(forbidden)) {
        fail('微信包仍包含 director.' + forbidden + ' 废弃属性告警入口');
    }
}
const staleCollectionShellArrow = runtimeJsText.match(/requirePanelChild\([^)]*["']Arrow(?:Left|Right)["'][^)]*\)/);
if (staleCollectionShellArrow) {
    fail('微信包仍将 CollectionPanel 翻页箭头当成 prefab 必需节点: ' + staleCollectionShellArrow[0]);
}
assertDir(path.join(runtimeRoot, 'openDataContext'), 'openDataContext');

if (!Array.isArray(assets.projectBundles) || !assets.projectBundles.includes('bootstrap')) fail('settings.assets.projectBundles 缺少 bootstrap');
if (!Array.isArray(assets.projectBundles) || !assets.projectBundles.includes('homeAssets')) fail('settings.assets.projectBundles 缺少 homeAssets');
if (!Array.isArray(assets.projectBundles) || !assets.projectBundles.includes('gameAssets')) fail('settings.assets.projectBundles 缺少 gameAssets');
if (Array.isArray(assets.projectBundles) && assets.projectBundles.includes('resources')) fail('resources bundle 仍在 projectBundles 中');
const settingsSubpackages = Array.isArray(assets.subpackages) ? assets.subpackages : [];
const gameSubpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [];
const homeAssetsSubpackageRoot = findSubpackageRoot(gameJson, 'homeAssets');
if (!settingsSubpackages.includes('homeAssets')) fail('settings.assets.subpackages 缺少 homeAssets');
if (!homeAssetsSubpackageRoot) fail('game.json.subpackages 缺少 homeAssets');
const gameAssetsSubpackageRoot = findSubpackageRoot(gameJson, 'gameAssets');
if (!settingsSubpackages.includes('gameAssets')) fail('settings.assets.subpackages 缺少 gameAssets');
if (!gameAssetsSubpackageRoot) fail('game.json.subpackages 缺少 gameAssets');
const levelDataSubpackageRoot = findSubpackageRoot(gameJson, 'levelData');
if (buildMode === 'debug') {
    if (!settingsSubpackages.includes('levelData')) fail('debug settings.assets.subpackages 缺少 levelData');
    if (!levelDataSubpackageRoot) fail('debug game.json.subpackages 缺少 levelData');
} else {
    if (settingsSubpackages.includes('levelData')) fail('release settings.assets.subpackages 不应包含 levelData');
    if (levelDataSubpackageRoot) fail('release game.json.subpackages 不应包含 levelData');
}
assertStartupPreloadOrder(assets);
assertFile(path.join(runtimeRoot, 'assets', 'bootstrap', 'index.js'), 'bootstrap stable index.js');
assertFile(path.join(runtimeRoot, 'src', 'bundle-scripts', 'homeAssets', 'index.js'), 'homeAssets bundle-scripts stub');
const homeAssetsDir = resolveBundleDir(runtimeRoot, 'homeAssets', gameJson);
assertDir(homeAssetsDir, 'homeAssets 微信分包目录');
assertFile(findBundleConfigPath(homeAssetsDir), 'homeAssets 分包 config.json');
assertFile(path.join(homeAssetsDir, 'index.js'), 'homeAssets 分包 index.js');
assertFile(path.join(homeAssetsDir, 'game.js'), 'homeAssets 分包 game.js');
const homeAssetsGameJs = fs.readFileSync(path.join(homeAssetsDir, 'game.js'), 'utf8');
if (!homeAssetsGameJs.includes('virtual:///prerequisite-imports/homeAssets')) {
    fail('homeAssets 分包 game.js 未注册 Cocos prerequisite import');
}
assertSourceBundleArtifactsExist(homeAssetsDir, 'homeAssets', path.join(projectRoot, 'assets', 'HomeAssetsBundle'), fail);
assertBundleNativeFilesExist(homeAssetsDir, 'homeAssets', fail);
for (const bundleName of ['internal', 'main']) {
    const bundleDir = resolveBundleDir(runtimeRoot, bundleName, gameJson);
    assertFile(findBundleConfigPath(bundleDir), bundleName + ' 分包 config');
}

assertFile(path.join(runtimeRoot, 'src', 'bundle-scripts', 'gameAssets', 'index.js'), 'gameAssets bundle-scripts stub');
const gameAssetsDir = resolveBundleDir(runtimeRoot, 'gameAssets', gameJson);
assertDir(gameAssetsDir, 'gameAssets 微信分包目录');
assertFile(findBundleConfigPath(gameAssetsDir), 'gameAssets 分包 config.json');
assertFile(path.join(gameAssetsDir, 'index.js'), 'gameAssets 分包 index.js');
assertFile(path.join(gameAssetsDir, 'game.js'), 'gameAssets 分包 game.js');
const gameAssetsGameJs = fs.readFileSync(path.join(gameAssetsDir, 'game.js'), 'utf8');
if (!gameAssetsGameJs.includes('virtual:///prerequisite-imports/gameAssets')) {
    fail('gameAssets 分包 game.js 未注册 Cocos prerequisite import');
}
assertSourceBundleArtifactsExist(gameAssetsDir, 'gameAssets', path.join(projectRoot, 'assets', 'GameAssetsBundle'), fail);
assertBundleNativeFilesExist(gameAssetsDir, 'gameAssets', fail);
if (buildMode === 'debug') {
    assertFile(path.join(runtimeRoot, 'src', 'bundle-scripts', 'levelData', 'index.js'), 'levelData bundle-scripts stub');
    const levelDataDir = resolveBundleDir(runtimeRoot, 'levelData', gameJson);
    assertDir(levelDataDir, 'levelData 微信分包目录');
    assertFile(findBundleConfigPath(levelDataDir), 'levelData 分包 config.json');
    assertFile(path.join(levelDataDir, 'game.js'), 'levelData 分包 game.js');
    const levelDataGameJs = fs.readFileSync(path.join(levelDataDir, 'game.js'), 'utf8');
    if (!levelDataGameJs.includes('virtual:///prerequisite-imports/levelData')) {
        fail('levelData 分包 game.js 未注册 Cocos prerequisite import');
    }
} else {
    if (fs.existsSync(path.join(runtimeRoot, 'assets', 'levelData')) || fs.existsSync(path.join(runtimeRoot, 'subpackages', 'levelData'))) {
        fail('release 包不应包含本地 levelData bundle');
    }
}
assertFile(path.join(runtimeRoot, 'src', 'bundle-scripts', 'bootstrap', 'index.js'), 'bootstrap bundle-scripts stub');
assertFile(path.join(runtimeRoot, 'assets', 'bootstrap', 'config.json'), 'bootstrap config.json');
const bootstrapConfig = readJson(path.join(runtimeRoot, 'assets', 'bootstrap', 'config.json'));
const bootstrapPaths = Object.values(bootstrapConfig.paths || {})
    .map((entry) => Array.isArray(entry) ? entry[0] : '')
    .filter(Boolean);
for (const requiredPath of [
    'LevelData/level_1',
    'Beans/bean-atlas-data',
    'Beans/bean-atlas',
    'Beans/bean-atlas/texture',
    'Beans/bean-atlas/spriteFrame',
    'GameUI/bg_game_pindd',
    'GameUI/slot_groove_b_ui',
    'GameUI/slot_panel_shell_b_ui',
    'GameUI/slot_row_lock_mask_ui',
    'GameUI/slot_row_lock_dash_ui',
    'GameUI/倒计时',
    'GameUI/unlock_button',
    'GameUI/popup_ad_play_icon',
    'GameUI/popup_gameplay_tool_slot_plate',
    'GameUI/popup_tool_wand_icon',
    'GameUI/popup_tool_brush_icon',
    'GameUI/popup_tool_magnet_icon',
    'GameUI/solid_white',
    'GameUI/设置',
]) {
    if (!bootstrapPaths.includes(requiredPath)) fail('bootstrap 缺少首关必要资源: ' + requiredPath);
}
for (const bootstrapPath of bootstrapPaths) {
    if (/^LevelData\/level_\d+$/.test(bootstrapPath) && bootstrapPath !== 'LevelData/level_1') {
        fail('bootstrap 不应包含非首关候选关卡: ' + bootstrapPath);
    }
}
for (const levelId of [1]) {
    const sourceLevel = path.join(projectRoot, 'assets', 'LevelData', `level_${levelId}.json`);
    const bootstrapLevel = path.join(projectRoot, 'assets', 'BootstrapBundle', 'LevelData', `level_${levelId}.json`);
    if (fs.existsSync(sourceLevel) && fs.existsSync(bootstrapLevel)) {
        const sourceContent = fs.readFileSync(sourceLevel, 'utf8');
        const bootstrapContent = fs.readFileSync(bootstrapLevel, 'utf8');
        if (sourceContent !== bootstrapContent) fail(`BootstrapBundle/LevelData/level_${levelId}.json 未与 assets/LevelData 真源同步`);
    }
}
if (fs.existsSync(path.join(runtimeRoot, 'assets', 'remote'))) fail('assets/remote 仍在微信主包内');
if (fs.existsSync(path.join(runtimeRoot, 'assets', 'homeAssets'))) fail('assets/homeAssets 仍在微信主包内');
if (fs.existsSync(path.join(runtimeRoot, 'assets', 'gameAssets'))) fail('assets/gameAssets 仍在微信主包内');

assertDir(levelDataCdnPath, '微信关卡数据 CDN 目录');
assertFile(path.join(levelDataCdnPath, 'level_live.json'), 'level_live.json');
const levelLiveManifest = readJson(path.join(levelDataCdnPath, 'level_live.json'));
if (levelLiveManifest.manifestVersion !== 1 || levelLiveManifest.schemaVersion !== 1) fail('level_live.json schema 不正确');
if (!Array.isArray(levelLiveManifest.packs) || levelLiveManifest.packs.length < 1) fail('level_live.json 缺少 packs');
const sourceLevelEntries = collectSourceLevelDataEntries();
const sourceLevelKeys = new Set(sourceLevelEntries.map((entry) => entry.key));
const sourceLevelPrefixCounts = countLevelDataPrefixes(sourceLevelEntries);
const manifestLevelPrefixCounts = levelLiveManifest.levelCounts || {};
const cdnLevelKeys = new Set();
const cdnLevelPrefixCounts = {};
let cdnLevelCount = 0;
for (const pack of levelLiveManifest.packs) {
    assertFile(path.join(levelDataCdnPath, pack.url), '关卡数据 pack');
    const packPrefix = String(pack.prefix || 'level_');
    if (packPrefix !== 'level_' && packPrefix !== 'zt_level_') fail('level_live.json pack.prefix 不正确: ' + pack.url);
    const packJson = readJson(path.join(levelDataCdnPath, pack.url));
    if (packJson.id !== pack.id) fail('关卡数据 pack id 不一致: ' + pack.url);
    if (String(packJson.prefix || packPrefix) !== packPrefix) fail('关卡数据 pack prefix 不一致: ' + pack.url);
    if (!Array.isArray(packJson.levels) || packJson.levels.length !== pack.levelCount) fail('关卡数据 pack levelCount 不一致: ' + pack.url);
    const packPayloadKeys = [];
    for (const entry of packJson.levels) {
        const levelId = Math.max(1, Math.floor(Number(entry && entry.levelId) || 1));
        const entryPrefix = String((entry && entry.prefix) || packJson.prefix || packPrefix);
        const key = entryPrefix + levelId;
        if (entryPrefix !== packPrefix) fail('关卡数据 pack entry prefix 不一致: ' + pack.url + ' ' + key);
        if (cdnLevelKeys.has(key)) fail('关卡数据 CDN 重复关卡 key: ' + key);
        cdnLevelKeys.add(key);
        packPayloadKeys.push(key);
        cdnLevelPrefixCounts[entryPrefix] = (cdnLevelPrefixCounts[entryPrefix] || 0) + 1;
    }
    if (Array.isArray(pack.levelKeys)) {
        const manifestKeys = pack.levelKeys.slice().sort();
        const payloadKeys = packPayloadKeys.slice().sort();
        if (manifestKeys.length !== payloadKeys.length || manifestKeys.some((key, index) => key !== payloadKeys[index])) {
            fail('level_live.json pack.levelKeys 与 pack 内容不一致: ' + pack.url);
        }
    }
    cdnLevelCount += packJson.levels.length;
}
if (cdnLevelCount !== levelLiveManifest.levelCount) fail('level_live.json levelCount 不一致');
if (cdnLevelCount !== sourceLevelKeys.size) fail('关卡数据 CDN 关卡数量异常: ' + cdnLevelCount + ' != assets/LevelData ' + sourceLevelKeys.size);
for (const prefix of ['level_', 'zt_level_']) {
    const sourceCount = sourceLevelPrefixCounts[prefix] || 0;
    if ((manifestLevelPrefixCounts[prefix] || 0) !== sourceCount) {
        fail('level_live.json levelCounts.' + prefix + ' 不一致: ' + (manifestLevelPrefixCounts[prefix] || 0) + ' != ' + sourceCount);
    }
    if ((cdnLevelPrefixCounts[prefix] || 0) !== sourceCount) {
        fail('关卡数据 CDN ' + prefix + ' 数量异常: ' + (cdnLevelPrefixCounts[prefix] || 0) + ' != assets/LevelData ' + sourceCount);
    }
}
for (const key of sourceLevelKeys) {
    if (!cdnLevelKeys.has(key)) fail('关卡数据 CDN 缺少真源关卡: ' + key);
}
for (const key of cdnLevelKeys) {
    if (!sourceLevelKeys.has(key)) fail('关卡数据 CDN 包含未知关卡: ' + key);
}

const subpackageRootNames = gameSubpackages
    .map((item) => String(item && item.root || '').replace(/^\/+|\/+$/g, '').split('/')[0])
    .filter(Boolean);
const mainBytes = dirSize(runtimeRoot, subpackageRootNames);
const mainKB = Math.round(mainBytes / 1024);
const mainPackageTargetKB = 3072;
const mainPackageErrorKB = 4096;
const startupDownloadTargetKB = 3072;
const startupDownload = computeStartupDownloadBytes(runtimeRoot, gameJson, assets, mainBytes);
const startupDownloadKB = Math.round(startupDownload.total / 1024);
if (mainKB > mainPackageErrorKB) fail('微信主包超过 4MB 硬限制: ' + mainKB + 'KB');
if (mainKB > mainPackageTargetKB) console.warn('WARNING: 微信主包超过 3MB 目标，但未超过 4MB 硬限制: ' + mainKB + 'KB');
if (startupDownloadKB > startupDownloadTargetKB) fail('微信启动下载量超过 3MB 目标: ' + startupDownloadKB + 'KB');

console.log('微信构建产物验证通过');
console.log('runtime: ' + runtimeRoot);
console.log('mode: ' + buildMode);
console.log('main: ' + mainKB + 'KB');
console.log('startupDownload: ' + startupDownloadKB + 'KB');
console.log('levelDataCdn: ' + levelDataCdnPath);
