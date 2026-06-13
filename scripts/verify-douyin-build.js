#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const buildCommon = require('./minigame-build-common.js');
const {
    assertBundleNativeFilesExist,
    assertSourceBundleArtifactsExist,
} = require('./verify-bundle-native-files.js');

const projectRoot = path.resolve(__dirname, '..');
const buildPath = process.argv[2] || path.join(projectRoot, 'build', 'bytedance-mini-game');
const levelDataCdnPath = process.argv[3] || path.join(projectRoot, 'build', 'level-data-cdn-douyin');
const buildMode = process.env.DOUYIN_BUILD_MODE || 'release';
const expectedLevelDataCdnUrl = process.env.PDD_LEVEL_DATA_CDN_URL || 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_douyin/levels/';
const mainPackageErrorKB = 4096;
const totalPackageErrorKB = 20480;

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

function readText(filePath) {
    assertFile(filePath, path.basename(filePath));
    return fs.readFileSync(filePath, 'utf8');
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

function normalizeSubpackageRoot(root) {
    return String(root || '').replace(/^\/+|\/+$/g, '');
}

function resolveRuntimeRoot(root) {
    return buildCommon.resolveRuntimeRoot(root);
}

function findSettingsPath(runtimeRoot) {
    return buildCommon.findSettingsPath(runtimeRoot);
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

function getPreloadBundleName(item) {
    return typeof item === 'string' ? item : item && item.bundle;
}

function assertStartupPreloadOrder(settings) {
    const assets = settings.assets || {};
    const preloadBundles = Array.isArray(assets.preloadBundles)
        ? assets.preloadBundles.map(getPreloadBundleName).filter(Boolean)
        : [];
    if (preloadBundles[0] !== 'bootstrap' || preloadBundles[1] !== 'main') {
        fail('settings.assets.preloadBundles 顺序错误，应为 bootstrap -> main');
    }
    for (const forbidden of ['homeAssets', 'gameAssets', 'levelData']) {
        if (preloadBundles.includes(forbidden)) {
            fail('settings.assets.preloadBundles 不应预加载非启动分包: ' + forbidden);
        }
    }
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

function getConfigScenes(bundleDir) {
    const configPath = findBundleConfigPath(bundleDir);
    return fs.existsSync(configPath) ? (readJson(configPath).scenes || {}) : {};
}

function assertRuntimeScenes(runtimeRoot, gameJson) {
    const mainRoot = findSubpackageRoot(gameJson, 'main');
    const mainDir = mainRoot ? path.join(runtimeRoot, mainRoot) : path.join(runtimeRoot, 'assets', 'main');
    const scenes = getConfigScenes(mainDir);
    for (const sceneUrl of ['db://assets/Scenes/Loading.scene', 'db://assets/Scenes/Game.scene']) {
        if (!Object.prototype.hasOwnProperty.call(scenes, sceneUrl)) {
            fail('抖音 main bundle 缺少运行态场景: ' + sceneUrl);
        }
    }
    if (Object.prototype.hasOwnProperty.call(scenes, 'db://assets/HomeAssetsBundle/Scenes/Home.scene')) {
        fail('Home.scene 不应进入抖音 main bundle，应由 homeAssets 分包承载');
    }
}

function assertBundleSubpackage(runtimeRoot, gameJson, settingsSubpackages, bundleName, sourceRoot) {
    if (!settingsSubpackages.includes(bundleName)) fail('settings.assets.subpackages 缺少 ' + bundleName);
    const root = findSubpackageRoot(gameJson, bundleName);
    if (!root) fail('game.json.subpackages 缺少 ' + bundleName);
    const bundleDir = path.join(runtimeRoot, root);
    assertDir(bundleDir, bundleName + ' 抖音分包目录');
    assertFile(path.join(bundleDir, 'game.js'), bundleName + ' 分包 game.js');
    assertFile(findBundleConfigPath(bundleDir), bundleName + ' 分包 config.json');
    const gameJs = readText(path.join(bundleDir, 'game.js'));
    if (!gameJs.includes('virtual:///prerequisite-imports/' + bundleName)) {
        fail(bundleName + ' 抖音分包 game.js 未注册 Cocos prerequisite import');
    }
    if (sourceRoot) {
        assertSourceBundleArtifactsExist(bundleDir, bundleName, sourceRoot, fail);
        assertBundleNativeFilesExist(bundleDir, bundleName, fail);
    }
    return bundleDir;
}

function assertNoLocalBundle(runtimeRoot, bundleName) {
    const localDir = path.join(runtimeRoot, 'assets', bundleName);
    if (fs.existsSync(localDir)) fail('抖音主包中仍存在 assets/' + bundleName);
}

function assertRuntimeMarkers(runtimeRoot) {
    const gameJs = readText(path.join(runtimeRoot, 'game.js'));
    for (const required of [
        '__PDD_BUILD_PLATFORM__',
        'douyin',
        '__PDD_DOUYIN_BUILD__',
        '__PDD_DOUYIN_BUILD_MODE__',
        '__PDD_LEVEL_DATA_CDN_URL__',
        '__PDD_DOUYIN_CLOUD_ENV__',
        '__PDD_DOUYIN_CLOUD_PATH_PREFIX__',
        expectedLevelDataCdnUrl,
    ]) {
        if (!gameJs.includes(required)) fail('抖音 game.js 缺少运行时标记: ' + required);
    }
    if (gameJs.includes('__PDD_WECHAT_BUILD__')) fail('抖音 game.js 不应包含微信构建标记 __PDD_WECHAT_BUILD__');
}

function assertDouyinSidebarCode(runtimeRoot) {
    const jsText = buildCommon.walkFiles(runtimeRoot)
        .filter((filePath) => filePath.endsWith('.js'))
        .map((filePath) => fs.readFileSync(filePath, 'utf8'))
        .join('\n');
    for (const required of ['checkScene', 'navigateToScene']) {
        if (!jsText.includes(required)) fail('抖音包缺少侧边栏 API 代码: tt.' + required);
    }
}

function assertPackageSize(runtimeRoot, gameJson) {
    const subpackageRoots = (Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [])
        .map((item) => normalizeSubpackageRoot(item && item.root))
        .filter(Boolean)
        .map((root) => path.join(runtimeRoot, root));
    const mainKB = Math.round(buildCommon.dirSize(runtimeRoot, subpackageRoots) / 1024);
    const totalKB = Math.round(buildCommon.dirSize(runtimeRoot) / 1024);
    if (mainKB > mainPackageErrorKB) fail('抖音主包超过 4MB 硬限制: ' + mainKB + 'KB');
    if (totalKB > totalPackageErrorKB) fail('抖音总包超过 20MB 硬限制: ' + totalKB + 'KB');
}

function assertLevelDataCdn() {
    assertDir(levelDataCdnPath, '抖音关卡数据 CDN 目录');
    const livePath = path.join(levelDataCdnPath, 'level_live.json');
    const manifest = readJson(livePath);
    if (manifest.manifestVersion !== 1 || manifest.schemaVersion !== 1) fail('抖音 level_live.json schema 不正确');
    if (!Array.isArray(manifest.packs) || manifest.packs.length < 1) fail('抖音 level_live.json 缺少 packs');
    if (typeof manifest.levelCount !== 'number' || manifest.levelCount < 1) fail('抖音 level_live.json levelCount 不正确');
    const sourceEntries = collectSourceLevelDataEntries();
    const sourceKeys = new Set(sourceEntries.map((entry) => entry.key));
    const sourcePrefixCounts = countLevelDataPrefixes(sourceEntries);
    const manifestPrefixCounts = manifest.levelCounts || {};
    const cdnKeys = new Set();
    const cdnPrefixCounts = {};
    let levelCount = 0;
    for (const pack of manifest.packs) {
        if (!pack || typeof pack.url !== 'string') fail('抖音 level_live.json pack.url 不正确');
        if (!pack.url.startsWith('level_packs/')) fail('抖音 level_live.json pack.url 不正确: ' + pack.url);
        const packPrefix = String(pack.prefix || 'level_');
        if (packPrefix !== 'level_' && packPrefix !== 'zt_level_') fail('抖音 level_live.json pack.prefix 不正确: ' + pack.url);
        const packPath = path.join(levelDataCdnPath, pack.url);
        assertFile(packPath, '抖音关卡数据 pack');
        const packJson = readJson(packPath);
        if (packJson.id !== pack.id) fail('抖音关卡数据 pack id 不一致: ' + pack.url);
        if (String(packJson.prefix || packPrefix) !== packPrefix) fail('抖音关卡数据 pack prefix 不一致: ' + pack.url);
        if (!Array.isArray(packJson.levels) || packJson.levels.length !== pack.levelCount) fail('抖音关卡数据 pack levelCount 不一致: ' + pack.url);
        const packPayloadKeys = [];
        for (const entry of packJson.levels) {
            const levelId = Math.max(1, Math.floor(Number(entry && entry.levelId) || 1));
            const entryPrefix = String((entry && entry.prefix) || packJson.prefix || packPrefix);
            const key = entryPrefix + levelId;
            if (entryPrefix !== packPrefix) fail('抖音关卡数据 pack entry prefix 不一致: ' + pack.url + ' ' + key);
            if (cdnKeys.has(key)) fail('抖音关卡数据 CDN 重复关卡 key: ' + key);
            cdnKeys.add(key);
            packPayloadKeys.push(key);
            cdnPrefixCounts[entryPrefix] = (cdnPrefixCounts[entryPrefix] || 0) + 1;
        }
        if (Array.isArray(pack.levelKeys)) {
            const manifestKeys = pack.levelKeys.slice().sort();
            const payloadKeys = packPayloadKeys.slice().sort();
            if (manifestKeys.length !== payloadKeys.length || manifestKeys.some((key, index) => key !== payloadKeys[index])) {
                fail('抖音 level_live.json pack.levelKeys 与 pack 内容不一致: ' + pack.url);
            }
        }
        levelCount += packJson.levels.length;
    }
    if (levelCount !== manifest.levelCount) fail('抖音 level_live.json levelCount 不一致: ' + levelCount + ' != ' + manifest.levelCount);
    if (levelCount !== sourceKeys.size) fail('抖音关卡数据 CDN 关卡数量异常: ' + levelCount + ' != assets/LevelData ' + sourceKeys.size);
    for (const prefix of ['level_', 'zt_level_']) {
        const sourceCount = sourcePrefixCounts[prefix] || 0;
        if ((manifestPrefixCounts[prefix] || 0) !== sourceCount) {
            fail('抖音 level_live.json levelCounts.' + prefix + ' 不一致: ' + (manifestPrefixCounts[prefix] || 0) + ' != ' + sourceCount);
        }
        if ((cdnPrefixCounts[prefix] || 0) !== sourceCount) {
            fail('抖音关卡数据 CDN ' + prefix + ' 数量异常: ' + (cdnPrefixCounts[prefix] || 0) + ' != assets/LevelData ' + sourceCount);
        }
    }
    for (const key of sourceKeys) {
        if (!cdnKeys.has(key)) fail('抖音关卡数据 CDN 缺少真源关卡: ' + key);
    }
    for (const key of cdnKeys) {
        if (!sourceKeys.has(key)) fail('抖音关卡数据 CDN 包含未知关卡: ' + key);
    }
}

assertDir(buildPath, '抖音构建目录');
const runtimeRoot = resolveRuntimeRoot(buildPath);
assertDir(runtimeRoot, '抖音运行时目录');
assertFile(path.join(runtimeRoot, 'game.json'), '抖音 game.json');
assertFile(path.join(buildPath, 'project.config.json'), '抖音 project.config.json');
const gameJson = readJson(path.join(runtimeRoot, 'game.json'));
const settingsPath = findSettingsPath(runtimeRoot);
const settings = readJson(settingsPath);
assertStartupPreloadOrder(settings);

const settingsSubpackages = Array.isArray(settings.assets && settings.assets.subpackages)
    ? settings.assets.subpackages
    : [];
assertRuntimeScenes(runtimeRoot, gameJson);
const homeAssetsDir = assertBundleSubpackage(runtimeRoot, gameJson, settingsSubpackages, 'homeAssets', path.join(projectRoot, 'assets', 'HomeAssetsBundle'));
const gameAssetsDir = assertBundleSubpackage(runtimeRoot, gameJson, settingsSubpackages, 'gameAssets', path.join(projectRoot, 'assets', 'GameAssetsBundle'));
if (buildMode === 'debug') {
    assertBundleSubpackage(runtimeRoot, gameJson, settingsSubpackages, 'levelData', null);
} else {
    if (settingsSubpackages.includes('levelData')) fail('release settings.assets.subpackages 不应包含 levelData');
    if (findSubpackageRoot(gameJson, 'levelData')) fail('release game.json.subpackages 不应包含 levelData');
    if (fs.existsSync(path.join(runtimeRoot, 'subpackages', 'levelData'))) fail('release 包不应包含本地 levelData 分包');
}
assertNoLocalBundle(runtimeRoot, 'homeAssets');
assertNoLocalBundle(runtimeRoot, 'gameAssets');
assertRuntimeMarkers(runtimeRoot);
assertDouyinSidebarCode(runtimeRoot);
assertPackageSize(runtimeRoot, gameJson);
assertLevelDataCdn();

console.log('抖音产物验证通过');
console.log('runtime: ' + runtimeRoot);
console.log('homeAssets: ' + homeAssetsDir);
console.log('gameAssets: ' + gameAssetsDir);
