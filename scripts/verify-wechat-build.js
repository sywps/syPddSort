#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

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
    const remoteRefs = new Set();
    const unexpectedPrefabs = new Set();
    for (const ref of refs) {
        const assetPath = uuidIndex.get(ref.uuid);
        if (!assetPath) continue;
        if (assetPath.startsWith('assets/RemoteBundle/')) {
            remoteRefs.add(`${assetPath} <- ${ref.path}`);
        }
        if (ref.expectedType === 'cc.Prefab' && !ALLOWED_GAME_SCENE_DIRECT_PREFABS.has(assetPath)) {
            unexpectedPrefabs.add(`${assetPath} <- ${ref.path}`);
        }
    }
    if (remoteRefs.size) {
        fail('Game.scene 直接引用了 RemoteBundle 资源: ' + [...remoteRefs].join(', '));
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
    const scenes = readJson(mainConfigPath).scenes || {};
    for (const sceneUrl of ['db://assets/Scenes/Home.scene', 'db://assets/Scenes/Game.scene']) {
        if (!Object.prototype.hasOwnProperty.call(scenes, sceneUrl)) {
            fail('微信构建缺少运行态场景: ' + sceneUrl);
        }
    }
}

function assertMainBundleDoesNotDependOnRemote(root) {
    const gameJsonPath = path.join(root, 'game.json');
    const gameJson = fs.existsSync(gameJsonPath) ? readJson(gameJsonPath) : {};
    const mainConfigPath = findBundleConfigPath(resolveBundleDir(root, 'main', gameJson));
    const deps = readJson(mainConfigPath).deps || [];
    if (deps.includes('remote')) fail('main bundle 不应依赖 remote；启动场景仍有 remote 强引用');
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
    if (preloadNames.includes('remote')) fail('settings.assets.preloadBundles 不应启动预加载 remote 分包');
}

assertDir(buildPath, '微信构建目录');
const runtimeRoot = resolveRuntimeRoot(buildPath);
const settingsPath = findSettingsPath(runtimeRoot);
assertFile(settingsPath, 'settings.json/settings.<hash>.json');
const settings = readJson(settingsPath);
const assets = settings.assets || {};
const settingsServer = String(assets.server || '');
const normalizedSettingsServer = settingsServer.trim();
if (normalizedSettingsServer) fail('settings.assets.server 应为空，remote 不再作为 Cocos CDN bundle: ' + settingsServer);
if (Array.isArray(assets.remoteBundles) && assets.remoteBundles.includes('remote')) fail('settings.assets.remoteBundles 不应包含 remote');

assertFile(path.join(runtimeRoot, 'game.js'), 'game.js');
const gameJs = fs.readFileSync(path.join(runtimeRoot, 'game.js'), 'utf8');
if (!gameJs.includes('globalThis.__PDD_WECHAT_BUILD__=true;')) fail('game.js 缺少微信构建标记 __PDD_WECHAT_BUILD__');
if (!gameJs.includes('__PDD_LEVEL_DATA_CDN_URL__')) fail('game.js 缺少关卡数据 CDN 地址标记');
if (!gameJs.includes(LEVEL_DATA_CDN_URL)) fail('game.js 关卡数据 CDN 地址不正确');
if (gameJs.includes('__PDD_REMOTE_LIVE_URL__') || gameJs.includes('resolvePddRemoteLiveVersion')) {
    fail('game.js 不应注入 Cocos remote live.json 启动逻辑');
}
assertFile(path.join(runtimeRoot, 'game.json'), 'game.json');
const applicationPath = findApplicationPath(runtimeRoot);
assertFile(applicationPath, 'application.js/application.<hash>.js');
const applicationJs = fs.readFileSync(applicationPath, 'utf8');
if (applicationJs.includes('__PDD_REMOTE_LIVE_VERSION__')) fail('application.js 不应注入 remote bundle live version override');
assertFile(path.join(runtimeRoot, 'engine-adapter.js'), 'engine-adapter.js');
const engineAdapterJs = fs.readFileSync(path.join(runtimeRoot, 'engine-adapter.js'), 'utf8');
const stableLocalBundleScript = 'i="src/bundle-scripts/".concat';
if (!engineAdapterJs.includes(stableLocalBundleScript) || !engineAdapterJs.includes('"/index.js"')) {
    fail('engine-adapter.js 未将本地 remote bundle 入口固定为 index.js');
}
if (/remoteServerAddress\.replace\(\/\\\/\$\/,\s*""\),i="src\/bundle-scripts\/"\.concat\([^,]+,"\/index\."\)\.concat/.test(engineAdapterJs)) {
    fail('engine-adapter.js 仍会按 live hash require 本地 remote bundle 入口脚本');
}
const gameJson = readJson(path.join(runtimeRoot, 'game.json'));
assertFile(findBundleConfigPath(resolveBundleDir(runtimeRoot, 'main', gameJson)), 'main config.json');
assertGameCtrlBinding(runtimeRoot);
assertRuntimeScenes(runtimeRoot);
assertMainBundleDoesNotDependOnRemote(runtimeRoot);
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
assertDir(path.join(runtimeRoot, 'openDataContext'), 'openDataContext');

if (!Array.isArray(assets.projectBundles) || !assets.projectBundles.includes('bootstrap')) fail('settings.assets.projectBundles 缺少 bootstrap');
if (!Array.isArray(assets.projectBundles) || !assets.projectBundles.includes('remote')) fail('settings.assets.projectBundles 缺少 remote');
if (Array.isArray(assets.projectBundles) && assets.projectBundles.includes('resources')) fail('resources bundle 仍在 projectBundles 中');
const settingsSubpackages = Array.isArray(assets.subpackages) ? assets.subpackages : [];
const gameSubpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [];
const remoteSubpackageRoot = findSubpackageRoot(gameJson, 'remote');
if (!settingsSubpackages.includes('remote')) fail('settings.assets.subpackages 缺少 remote');
if (!remoteSubpackageRoot) fail('game.json.subpackages 缺少 remote');
assertStartupPreloadOrder(assets);
assertFile(path.join(runtimeRoot, 'assets', 'bootstrap', 'index.js'), 'bootstrap stable index.js');
for (const bundleName of ['internal', 'main']) {
    const bundleDir = resolveBundleDir(runtimeRoot, bundleName, gameJson);
    assertFile(findBundleConfigPath(bundleDir), bundleName + ' 分包 config');
}

assertFile(path.join(runtimeRoot, 'src', 'bundle-scripts', 'remote', 'index.js'), 'remote bundle-scripts stub');
const remoteDir = resolveBundleDir(runtimeRoot, 'remote', gameJson);
assertDir(remoteDir, 'remote 微信分包目录');
assertFile(findBundleConfigPath(remoteDir), 'remote 分包 config.json');
assertFile(path.join(remoteDir, 'index.js'), 'remote 分包 index.js');
assertFile(path.join(remoteDir, 'game.js'), 'remote 分包 game.js');
const remoteGameJs = fs.readFileSync(path.join(remoteDir, 'game.js'), 'utf8');
if (!remoteGameJs.includes('virtual:///prerequisite-imports/remote')) {
    fail('remote 分包 game.js 未注册 Cocos prerequisite import');
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
    'GameUI/popup_gameplay_tool_slot_plate',
    'GameUI/solid_white',
]) {
    if (!bootstrapPaths.includes(requiredPath)) fail('bootstrap 缺少首关必要资源: ' + requiredPath);
}
for (const bootstrapPath of bootstrapPaths) {
    if (/^LevelData\/level_\d+$/.test(bootstrapPath) && bootstrapPath !== 'LevelData/level_1') {
        fail('bootstrap 不应包含非首关候选关卡: ' + bootstrapPath);
    }
}
for (const levelId of [1]) {
    const remoteLevel = path.join(projectRoot, 'assets', 'RemoteBundle', 'LevelData', `level_${levelId}.json`);
    const bootstrapLevel = path.join(projectRoot, 'assets', 'BootstrapBundle', 'LevelData', `level_${levelId}.json`);
    if (fs.existsSync(remoteLevel) && fs.existsSync(bootstrapLevel)) {
        const remoteContent = fs.readFileSync(remoteLevel, 'utf8');
        const bootstrapContent = fs.readFileSync(bootstrapLevel, 'utf8');
        if (remoteContent !== bootstrapContent) fail(`BootstrapBundle/LevelData/level_${levelId}.json 未与 RemoteBundle 真源同步`);
    }
}
if (fs.existsSync(path.join(runtimeRoot, 'assets', 'remote'))) fail('assets/remote 仍在微信主包内');

assertDir(levelDataCdnPath, '微信关卡数据 CDN 目录');
assertFile(path.join(levelDataCdnPath, 'level_live.json'), 'level_live.json');
const levelLiveManifest = readJson(path.join(levelDataCdnPath, 'level_live.json'));
if (levelLiveManifest.manifestVersion !== 1 || levelLiveManifest.schemaVersion !== 1) fail('level_live.json schema 不正确');
if (!Array.isArray(levelLiveManifest.packs) || levelLiveManifest.packs.length < 1) fail('level_live.json 缺少 packs');
let cdnLevelCount = 0;
for (const pack of levelLiveManifest.packs) {
    assertFile(path.join(levelDataCdnPath, pack.url), '关卡数据 pack');
    const packJson = readJson(path.join(levelDataCdnPath, pack.url));
    if (packJson.id !== pack.id) fail('关卡数据 pack id 不一致: ' + pack.url);
    if (!Array.isArray(packJson.levels) || packJson.levels.length !== pack.levelCount) fail('关卡数据 pack levelCount 不一致: ' + pack.url);
    cdnLevelCount += packJson.levels.length;
}
if (cdnLevelCount !== levelLiveManifest.levelCount) fail('level_live.json levelCount 不一致');
if (cdnLevelCount < 300) fail('关卡数据 CDN 关卡数量异常: ' + cdnLevelCount);

const subpackageRootNames = gameSubpackages
    .map((item) => String(item && item.root || '').replace(/^\/+|\/+$/g, '').split('/')[0])
    .filter(Boolean);
const mainBytes = dirSize(runtimeRoot, subpackageRootNames);
const mainKB = Math.round(mainBytes / 1024);
if (mainKB > 4096) fail('微信主包超过 4MB: ' + mainKB + 'KB');

console.log('微信构建产物验证通过');
console.log('runtime: ' + runtimeRoot);
console.log('main: ' + mainKB + 'KB');
console.log('levelDataCdn: ' + levelDataCdnPath);
