#!/usr/bin/env node
/**
 * Cocos Creator 微信小游戏构建后处理脚本
 *
 * 功能：
 * 1. 创建 src/bundle-scripts/gameAssets/index.js（engine-adapter 同步 require 需要此文件）
 * 2. 将 "gameAssets" 从 remoteBundles 移出，注册为微信分包/本地 bundle
 * 3. 修复 engine-adapter.js URL 拼接与稳定 bundle 入口
 * 4. 当 Cocos CLI 未自动拆出 custom bundle 时，将 assets/gameAssets 迁移到 subpackages/gameAssets
 * 5. 验证主包大小：超过 3MB 预警，超过 4MB 阻断
 *
 * 配置方法：构建面板 → 脚本 → 构建后 → 填此脚本路径
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { configureWechatCdnEnvironment } = require('./wechat-cdn-slot-config');

const buildPath = process.argv[2] || process.env.BUILD_PATH;
if (!buildPath) {
    console.error('未指定构建输出目录');
    process.exit(1);
}
const projectRoot = path.resolve(buildPath, '..', '..');
const gameAssetsMode = 'subpackage';
const buildMode = process.env.WECHAT_BUILD_MODE || 'release';
const debugLevelDataBundle = false;
const screenAdaptDebug = process.env.PDD_SCREEN_ADAPT_DEBUG === '1';
let wechatCdnTarget;
try {
    wechatCdnTarget = configureWechatCdnEnvironment(process.env.PDD_WECHAT_CDN_SLOT, process.env);
} catch (error) {
    console.error('微信 postbuild CDN 槽位无效: ' + (error && error.message ? error.message : String(error)));
    process.exit(1);
}

const BUNDLE_NAME = 'gameAssets';
const BOOTSTRAP_BUNDLE_NAME = 'bootstrap';
const HOME_ASSETS_BUNDLE_NAME = 'homeAssets';
const LEVEL_DATA_BUNDLE_NAME = 'levelData';
const SKIN_BUNDLE_NAMES = [];
const SPINE_WASM_SUBPACKAGE_NAME = 'spineWasm';
const MAIN_PACKAGE_TARGET_KB = 3072;
const MAIN_PACKAGE_ERROR_KB = 4096;
const CDN_SLOT = wechatCdnTarget.slot;
const LEVEL_DATA_CDN_URL = wechatCdnTarget.levelDataCdnUrl;
const SKIN_DATA_CDN_URL = wechatCdnTarget.skinDataCdnUrl;
const WECHAT_GAME_CIRCLE_MIN_LIB_VERSION = '2.30.3';
const WECHAT_GAME_CIRCLE_PLUGIN_NAME = 'MiniGameCommon';
const WECHAT_GAME_CIRCLE_PLUGIN_PROVIDER = 'wxaed5ace05d92b218';
const WECHAT_GAME_CIRCLE_PLUGIN_ENABLED = /^(1|true|yes)$/i.test(String(
    process.env.WECHAT_GAME_CIRCLE_PLUGIN || process.env.PDD_WECHAT_GAME_CIRCLE_PLUGIN || '',
).trim());
const WECHAT_FIRST_SCREEN_BG_COLOR = {
    x: 0.9607843137254902,
    y: 0.9215686274509803,
    z: 0.8627450980392157,
    w: 1,
};
const WECHAT_FIRST_SCREEN_BG_COLOR_LITERAL = '[' + [
    WECHAT_FIRST_SCREEN_BG_COLOR.x,
    WECHAT_FIRST_SCREEN_BG_COLOR.y,
    WECHAT_FIRST_SCREEN_BG_COLOR.z,
    WECHAT_FIRST_SCREEN_BG_COLOR.w,
].join(',') + ']';

function resolveRuntimeRoot() {
    var nested = path.join(buildPath, 'minigame');
    return fs.existsSync(nested) ? nested : buildPath;
}

function ensureCleanDir(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
    fs.mkdirSync(dirPath, { recursive: true });
}

// Cocos 3.8.8 可能把游戏文件放在 minigame/ 子目录下，此函数尝试两种路径
function resolveBuildPath(fileName) {
    var direct = path.join(buildPath, fileName);
    if (fs.existsSync(direct)) return direct;
    var inMinigame = path.join(buildPath, 'minigame', fileName);
    if (fs.existsSync(inMinigame)) return inMinigame;
    return direct; // return original for consistent error messages
}

function resolveRuntimeFile(fileName, pattern) {
    var direct = resolveBuildPath(fileName);
    if (fs.existsSync(direct)) return direct;
    var runtimeRoot = resolveRuntimeRoot();
    var dir = path.join(runtimeRoot, path.dirname(fileName));
    if (fs.existsSync(dir)) {
        var matches = fs.readdirSync(dir)
            .filter(function (name) { return pattern.test(name); })
            .sort();
        if (matches.length === 1) return path.join(dir, matches[0]);
    }
    return direct;
}

function resolveSettingsPath() {
    return resolveRuntimeFile(path.join('src', 'settings.json'), /^settings(?:\.[0-9a-f]+)?\.json$/i);
}

function resolveApplicationPath() {
    return resolveRuntimeFile('application.js', /^application(?:\.[0-9a-f]+)?\.js$/i);
}

function findBundleFile(bundleDir, baseName, extName) {
    var exact = path.join(bundleDir, baseName + '.' + extName);
    if (fs.existsSync(exact)) return exact;
    if (!fs.existsSync(bundleDir)) return exact;
    var pattern = new RegExp('^' + baseName + '(?:\\.[0-9a-f]+)?\\.' + extName + '$', 'i');
    var matches = fs.readdirSync(bundleDir)
        .filter(function (name) { return pattern.test(name); })
        .sort();
    return matches.length === 1 ? path.join(bundleDir, matches[0]) : exact;
}

function ensureStableBundleFiles(bundleDir) {
    if (!fs.existsSync(bundleDir)) return;
    var configPath = findBundleFile(bundleDir, 'config', 'json');
    var stableConfigPath = path.join(bundleDir, 'config.json');
    if (fs.existsSync(configPath) && configPath !== stableConfigPath && !fs.existsSync(stableConfigPath)) {
        fs.copyFileSync(configPath, stableConfigPath);
    }
    var indexPath = findBundleFile(bundleDir, 'index', 'js');
    var stableIndexPath = path.join(bundleDir, 'index.js');
    if (fs.existsSync(indexPath) && indexPath !== stableIndexPath && !fs.existsSync(stableIndexPath)) {
        fs.copyFileSync(indexPath, stableIndexPath);
    }
}

function getBundleVersionFromSettings(settingsFilePath, bundleName) {
    if (!settingsFilePath || !fs.existsSync(settingsFilePath)) return '';
    var settings = readJsonFile(settingsFilePath);
    var bundleVers = settings.assets && settings.assets.bundleVers ? settings.assets.bundleVers : {};
    var version = bundleVers[bundleName];
    return /^[0-9a-f]+$/i.test(String(version || '')) ? String(version) : '';
}

function ensureVersionedBundleIndexFile(bundleDir, bundleName, settingsFilePath) {
    if (!fs.existsSync(bundleDir)) return;
    var version = getBundleVersionFromSettings(settingsFilePath, bundleName);
    if (!version) return;
    var stableIndexPath = path.join(bundleDir, 'index.js');
    var versionedIndexPath = path.join(bundleDir, 'index.' + version + '.js');
    if (fs.existsSync(versionedIndexPath)) return;
    if (!fs.existsSync(stableIndexPath)) {
        var indexPath = findBundleFile(bundleDir, 'index', 'js');
        if (fs.existsSync(indexPath)) {
            fs.copyFileSync(indexPath, stableIndexPath);
        }
    }
    if (fs.existsSync(stableIndexPath)) {
        fs.copyFileSync(stableIndexPath, versionedIndexPath);
        console.log('[4.2/6] 已为 assets/' + bundleName + ' 生成版本入口 index.' + version + '.js ✓');
    }
}

function assertBundleConfigDepsClean(bundleDir, bundleName, forbiddenDeps) {
    if (!fs.existsSync(bundleDir)) return;
    var configFiles = fs.readdirSync(bundleDir)
        .filter(function (name) { return /^config(?:\.[0-9a-f]+)?\.json$/i.test(name); })
        .map(function (name) { return path.join(bundleDir, name); });
    for (var i = 0; i < configFiles.length; i++) {
        var configPath = configFiles[i];
        var config = readJsonFile(configPath);
        if (!Array.isArray(config.deps)) continue;
        var matched = config.deps.filter(function (dep) { return forbiddenDeps.indexOf(dep) !== -1; });
        if (matched.length > 0) {
            console.error('[4/6] ' + bundleName + ' config.json 存在禁止依赖: ' + matched.join(', '));
            console.error('       文件: ' + path.relative(resolveRuntimeRoot(), configPath));
            console.error('       请修正 bundle 归属或资源引用，不要在 postbuild 中删除 deps 掩盖问题。');
            process.exit(1);
        }
    }
}

function decodeUuid(base64) {
    var separator = '@';
    var base = String(base64 || '').split(separator)[0];
    if (base.length !== 22) {
        return String(base64 || '');
    }

    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var values = new Array(123).fill(0);
    for (var i = 0; i < chars.length; i++) {
        values[chars.charCodeAt(i)] = i;
    }

    var hexChars = '0123456789abcdef'.split('');
    var template = ['', '', '', '', '', '', '', '', '-', '', '', '', '', '-', '', '', '', '', '-', '', '', '', '', '-', '', '', '', '', '', '', '', '', '', '', '', ''];
    var indices = [];
    for (var j = 0; j < template.length; j++) {
        if (template[j] !== '-') indices.push(j);
    }

    template[0] = base[0];
    template[1] = base[1];
    for (var k = 2, outIndex = 2; k < 22; k += 2) {
        var lhs = values[String(base64 || '').charCodeAt(k)];
        var rhs = values[String(base64 || '').charCodeAt(k + 1)];
        template[indices[outIndex++]] = hexChars[lhs >> 2];
        template[indices[outIndex++]] = hexChars[((lhs & 3) << 2) | (rhs >> 4)];
        template[indices[outIndex++]] = hexChars[rhs & 0xF];
    }

    return String(base64 || '').replace(base, template.join(''));
}

function listBundleConfigFiles(bundleDir) {
    if (!fs.existsSync(bundleDir)) return [];
    return fs.readdirSync(bundleDir)
        .filter(function (name) { return /^config(?:\.[0-9a-f]+)?\.json$/i.test(name); })
        .sort(function (a, b) {
            if (a === 'config.json') return -1;
            if (b === 'config.json') return 1;
            return a.localeCompare(b);
        })
        .map(function (name) { return path.join(bundleDir, name); });
}

function removeVersionEntries(versionList, removedIndexSet) {
    if (!Array.isArray(versionList) || removedIndexSet.size === 0) return versionList;
    var next = [];
    for (var i = 0; i < versionList.length; i += 2) {
        if (removedIndexSet.has(Number(versionList[i]))) continue;
        next.push(versionList[i], versionList[i + 1]);
    }
    return next;
}

function removeImportFilesForUuid(bundleDir, compressedUuid, importBase) {
    var decoded = decodeUuid(compressedUuid);
    if (!decoded) return 0;
    var importDir = path.join(bundleDir, importBase || 'import', decoded.slice(0, 2));
    if (!fs.existsSync(importDir)) return 0;
    var removed = 0;
    fs.readdirSync(importDir).forEach(function (fileName) {
        if (fileName === decoded + '.json' || fileName.indexOf(decoded + '.') === 0) {
            fs.rmSync(path.join(importDir, fileName), { force: true });
            removed += 1;
        }
    });
    return removed;
}

function removeNativeFilesForUuid(bundleDir, compressedUuid, nativeBase) {
    var decoded = decodeUuid(compressedUuid);
    if (!decoded) return 0;
    var nativeUuid = decoded.split('@')[0];
    var nativeDir = path.join(bundleDir, nativeBase || 'native', nativeUuid.slice(0, 2));
    if (!fs.existsSync(nativeDir)) return 0;
    var removed = 0;
    fs.readdirSync(nativeDir).forEach(function (fileName) {
        if (fileName.indexOf(nativeUuid + '.') === 0 && !/\.json$/i.test(fileName)) {
            fs.rmSync(path.join(nativeDir, fileName), { force: true });
            removed += 1;
        }
    });
    return removed;
}

function findImportArtifactFiles(bundleDir, compressedUuid, importBase) {
    var decoded = decodeUuid(compressedUuid);
    if (!decoded) return [];
    var importDir = path.join(bundleDir, importBase || 'import', decoded.slice(0, 2));
    if (!fs.existsSync(importDir)) return [];
    return fs.readdirSync(importDir)
        .filter(function (fileName) { return fileName === decoded + '.json' || fileName.indexOf(decoded + '.') === 0; })
        .sort()
        .map(function (fileName) { return path.join(importDir, fileName); });
}

function pruneReleaseSkinMirrorFromBundle(bundleDir) {
    if (!fs.existsSync(bundleDir)) return;
    var configFiles = listBundleConfigFiles(bundleDir);
    if (configFiles.length === 0) return;
    var sourceConfig = readJsonFile(configFiles[0]);
    var removedIndexSet = new Set();
    var removedCompressedUuids = new Set();
    Object.keys(sourceConfig.paths || {}).forEach(function (indexKey) {
        var entry = sourceConfig.paths[indexKey];
        if (!Array.isArray(entry) || !String(entry[0] || '').startsWith('Skins/')) return;
        var index = Number(indexKey);
        if (!Number.isFinite(index)) return;
        removedIndexSet.add(index);
        if (Array.isArray(sourceConfig.uuids) && sourceConfig.uuids[index]) {
            removedCompressedUuids.add(sourceConfig.uuids[index]);
        }
    });
    if (removedIndexSet.size === 0) {
        assertReleaseSkinMirrorAbsent(bundleDir);
        return;
    }

    var importBase = sourceConfig.importBase || 'import';
    var nativeBase = sourceConfig.nativeBase || 'native';
    var removedImportFiles = 0;
    var removedNativeFiles = 0;

    Object.keys(sourceConfig.packs || {}).forEach(function (packUuid) {
        var packIndices = Array.isArray(sourceConfig.packs[packUuid]) ? sourceConfig.packs[packUuid] : [];
        var keepMask = packIndices.map(function (index) { return !removedIndexSet.has(Number(index)); });
        if (keepMask.every(Boolean)) return;
        var packFiles = findImportArtifactFiles(bundleDir, packUuid, importBase);
        packFiles.forEach(function (packFile) {
            var packData = readJsonFile(packFile);
            if (!packData || !Array.isArray(packData.data)) return;
            var nextData = [];
            for (var i = 0; i < packData.data.length; i++) {
                if (keepMask[i]) nextData.push(packData.data[i]);
            }
            packData.data = nextData;
            writeJsonFile(packFile, packData);
        });
    });

    removedCompressedUuids.forEach(function (compressedUuid) {
        removedImportFiles += removeImportFilesForUuid(bundleDir, compressedUuid, importBase);
        removedNativeFiles += removeNativeFilesForUuid(bundleDir, compressedUuid, nativeBase);
    });

    configFiles.forEach(function (configPath) {
        var config = readJsonFile(configPath);
        Object.keys(config.paths || {}).forEach(function (indexKey) {
            var entry = config.paths[indexKey];
            if (Array.isArray(entry) && String(entry[0] || '').startsWith('Skins/')) {
                delete config.paths[indexKey];
            }
        });
        if (config.versions) {
            config.versions.import = removeVersionEntries(config.versions.import, removedIndexSet);
            config.versions.native = removeVersionEntries(config.versions.native, removedIndexSet);
        }
        Object.keys(config.packs || {}).forEach(function (packUuid) {
            var packIndices = Array.isArray(config.packs[packUuid]) ? config.packs[packUuid] : [];
            var filtered = packIndices.filter(function (index) { return !removedIndexSet.has(Number(index)); });
            if (filtered.length === 0) delete config.packs[packUuid];
            else config.packs[packUuid] = filtered;
        });
        writeJsonFile(configPath, config);
    });

    console.log('[4.3/6] gameAssets 已移除本地皮肤镜像: paths=' + removedIndexSet.size + ', importFiles=' + removedImportFiles + ', nativeFiles=' + removedNativeFiles + ' ✓');
    assertReleaseSkinMirrorAbsent(bundleDir);
}

function assertReleaseSkinMirrorAbsent(bundleDir) {
    if (!fs.existsSync(bundleDir)) return;
    var configFiles = listBundleConfigFiles(bundleDir);
    for (var i = 0; i < configFiles.length; i++) {
        var configPath = configFiles[i];
        var config = readJsonFile(configPath);
        var skinPaths = Object.values(config.paths || {})
            .filter(function (entry) { return Array.isArray(entry) && String(entry[0] || '').startsWith('Skins/'); })
            .map(function (entry) { return entry[0]; });
        if (skinPaths.length > 0) {
            console.error('[4.3/6] gameAssets config 仍包含本地皮肤路径: ' + skinPaths.slice(0, 8).join(', '));
            console.error('       文件: ' + path.relative(resolveRuntimeRoot(), configPath));
            process.exit(1);
        }
    }
}

function ensureSubpackageGameJs(bundleDir, bundleName) {
    if (!fs.existsSync(bundleDir)) return;
    var indexPath = findBundleFile(bundleDir, 'index', 'js');
    var gameJsPath = path.join(bundleDir, 'game.js');
    var content = '';
    if (fs.existsSync(indexPath)) {
        content = fs.readFileSync(indexPath, 'utf-8');
    } else {
        content = 'System.register("virtual:///prerequisite-imports/' + bundleName + '", [], function() { return { setters: [], execute: function() {} }; });\n';
    }
    if (!fs.existsSync(gameJsPath) || fs.readFileSync(gameJsPath, 'utf-8') !== content) {
        fs.writeFileSync(gameJsPath, content);
        console.log('[4/6] 已生成 ' + bundleName + ' 微信分包入口 game.js ✓');
    }
}

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJsonFile(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalizeWechatSplashSettings(settingsFilePath) {
    if (!settingsFilePath || !fs.existsSync(settingsFilePath)) return false;
    var settings = readJsonFile(settingsFilePath);
    settings.splashScreen = settings.splashScreen || {};
    settings.splashScreen.background = settings.splashScreen.background || {};
    settings.splashScreen.background.type = 'color';
    settings.splashScreen.background.color = Object.assign({}, WECHAT_FIRST_SCREEN_BG_COLOR);
    settings.splashScreen.clearColor = Object.assign({}, WECHAT_FIRST_SCREEN_BG_COLOR);
    writeJsonFile(settingsFilePath, settings);
    return true;
}

function patchWechatFirstScreenBackground(firstScreenContent) {
    if (!/let bgColor = \[[^\]]+\];/.test(firstScreenContent)) {
        console.error('[3.3/7] first-screen.js 未找到 bgColor 配置，不能确认首帧非黑屏');
        process.exit(1);
    }
    return firstScreenContent.replace(
        /let bgColor = \[[^\]]+\];/,
        'let bgColor = ' + WECHAT_FIRST_SCREEN_BG_COLOR_LITERAL + ';',
    );
}

function compareVersion(a, b) {
    var left = String(a || '').split('.').map(function (part) { return parseInt(part, 10) || 0; });
    var right = String(b || '').split('.').map(function (part) { return parseInt(part, 10) || 0; });
    var len = Math.max(left.length, right.length);
    for (var i = 0; i < len; i++) {
        var diff = (left[i] || 0) - (right[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

function normalizeWechatProjectConfig(config) {
    if (!config || typeof config !== 'object') return config;
    var libVersion = typeof config.libVersion === 'string' ? config.libVersion.trim() : '';
    var isValidLibVersion = libVersion === 'latest' || /^[0-9]+\.[0-9]+(?:\.[0-9]+)?$/.test(libVersion);
    if (!isValidLibVersion || !libVersion) {
        config.libVersion = WECHAT_GAME_CIRCLE_MIN_LIB_VERSION;
        return config;
    }
    if (libVersion !== 'latest' && compareVersion(libVersion, WECHAT_GAME_CIRCLE_MIN_LIB_VERSION) < 0) {
        config.libVersion = WECHAT_GAME_CIRCLE_MIN_LIB_VERSION;
        return config;
    }
    config.libVersion = libVersion;
    return config;
}

function ensureWechatGameCirclePluginConfig(gameJson) {
    if (!gameJson || typeof gameJson !== 'object') return gameJson;
    var plugins = gameJson.plugins && typeof gameJson.plugins === 'object' && !Array.isArray(gameJson.plugins)
        ? gameJson.plugins
        : {};
    plugins[WECHAT_GAME_CIRCLE_PLUGIN_NAME] = {
        version: 'latest',
        provider: WECHAT_GAME_CIRCLE_PLUGIN_PROVIDER,
        contexts: [
            { type: 'isolatedContext' },
        ],
    };
    gameJson.plugins = plugins;
    return gameJson;
}

function removeWechatGameCirclePluginConfig(gameJson) {
    if (!gameJson || typeof gameJson !== 'object') return gameJson;
    var plugins = gameJson.plugins && typeof gameJson.plugins === 'object' && !Array.isArray(gameJson.plugins)
        ? gameJson.plugins
        : null;
    if (!plugins) return gameJson;
    delete plugins[WECHAT_GAME_CIRCLE_PLUGIN_NAME];
    if (Object.keys(plugins).length > 0) {
        gameJson.plugins = plugins;
    } else {
        delete gameJson.plugins;
    }
    return gameJson;
}

function syncWechatGameCirclePluginConfig(gameJson) {
    return WECHAT_GAME_CIRCLE_PLUGIN_ENABLED
        ? ensureWechatGameCirclePluginConfig(gameJson)
        : removeWechatGameCirclePluginConfig(gameJson);
}

function ensureWechatGameCirclePluginInGameJson(gameJsonPath) {
    if (!gameJsonPath || !fs.existsSync(gameJsonPath)) return false;
    var gameJson = readJsonFile(gameJsonPath);
    syncWechatGameCirclePluginConfig(gameJson);
    writeJsonFile(gameJsonPath, gameJson);
    return WECHAT_GAME_CIRCLE_PLUGIN_ENABLED;
}

function walkFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    var result = [];
    var items = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < items.length; i++) {
        var full = path.join(dir, items[i].name);
        if (items[i].isDirectory()) result.push.apply(result, walkFiles(full));
        else result.push(full);
    }
    return result;
}

function normalizeSubpackageRoot(root) {
    return String(root || '').replace(/^\/+|\/+$/g, '');
}

function getGameAssetsSubpackageRoot(runtimeRoot) {
    var gameJsonPath = path.join(runtimeRoot, 'game.json');
    if (!fs.existsSync(gameJsonPath)) return 'subpackages/' + BUNDLE_NAME;
    var gameJson = readJsonFile(gameJsonPath);
    var subpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [];
    for (var i = 0; i < subpackages.length; i++) {
        var item = subpackages[i] || {};
        var root = normalizeSubpackageRoot(item.root);
        if (item.name === BUNDLE_NAME || root === BUNDLE_NAME || root === 'subpackages/' + BUNDLE_NAME) {
            return root || 'subpackages/' + BUNDLE_NAME;
        }
    }
    return 'subpackages/' + BUNDLE_NAME;
}

function getBundleSubpackageRoot(runtimeRoot, bundleName) {
    var gameJsonPath = path.join(runtimeRoot, 'game.json');
    if (!fs.existsSync(gameJsonPath)) return 'subpackages/' + bundleName;
    var gameJson = readJsonFile(gameJsonPath);
    var subpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [];
    for (var i = 0; i < subpackages.length; i++) {
        var item = subpackages[i] || {};
        var root = normalizeSubpackageRoot(item.root);
        if (item.name === bundleName || root === bundleName || root === 'subpackages/' + bundleName) {
            return root || 'subpackages/' + bundleName;
        }
    }
    return 'subpackages/' + bundleName;
}

function ensureBundleInSettingsSubpackages(settingsFilePath, bundleName) {
    if (!fs.existsSync(settingsFilePath)) return;
    var settings = readJsonFile(settingsFilePath);
    var assets = settings.assets || {};
    var subpackages = Array.isArray(assets.subpackages) ? assets.subpackages.slice() : [];
    if (subpackages.indexOf(bundleName) === -1) subpackages.push(bundleName);
    assets.subpackages = subpackages;
    var projectBundles = Array.isArray(assets.projectBundles) ? assets.projectBundles.slice() : [];
    if (projectBundles.indexOf(bundleName) === -1) projectBundles.push(bundleName);
    assets.projectBundles = projectBundles;
    settings.assets = assets;
    writeJsonFile(settingsFilePath, settings);
}

function ensureBundleInGameSubpackages(runtimeRoot, bundleName) {
    var gameJsonPath = path.join(runtimeRoot, 'game.json');
    if (!fs.existsSync(gameJsonPath)) return;
    var gameJson = readJsonFile(gameJsonPath);
    var subpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages.slice() : [];
    var targetRoot = 'subpackages/' + bundleName + '/';
    var found = false;
    for (var i = 0; i < subpackages.length; i++) {
        var item = subpackages[i] || {};
        var root = normalizeSubpackageRoot(item.root);
        if (item.name === bundleName || root === bundleName || root === 'subpackages/' + bundleName) {
            item.name = bundleName;
            item.root = targetRoot;
            subpackages[i] = item;
            found = true;
        }
    }
    if (!found) {
        subpackages.push({ name: bundleName, root: targetRoot });
    }
    gameJson.subpackages = subpackages;
    writeJsonFile(gameJsonPath, gameJson);
}

function listNamesByPattern(dirPath, pattern) {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath)
        .filter(function (name) { return pattern.test(name); })
        .sort();
}

function replaceAllLiteral(content, search, replacement) {
    return content.split(search).join(replacement);
}

function patchSpineWasmVirtualChunk(cocosDir, movedJsNames) {
    var virtualNames = listNamesByPattern(cocosDir, /^_virtual_cc-[A-Za-z0-9_-]+\.js$/);
    var patchedCount = 0;
    for (var i = 0; i < virtualNames.length; i++) {
        var virtualPath = path.join(cocosDir, virtualNames[i]);
        var content = fs.readFileSync(virtualPath, 'utf-8');
        if (content.indexOf('loadWasmModuleSpine') === -1 && content.indexOf('spine.wasm-') === -1) continue;
        var patched = content;
        for (var j = 0; j < movedJsNames.length; j++) {
            var name = movedJsNames[j];
            var subpackageImport = '../subpackages/' + SPINE_WASM_SUBPACKAGE_NAME + '/cocos-js/' + name;
            patched = replaceAllLiteral(patched, '"./' + name + '"', '"' + subpackageImport + '"');
            patched = replaceAllLiteral(patched, "'./" + name + "'", "'" + subpackageImport + "'");
        }
        patched = replaceAllLiteral(
            patched,
            't("cocos-js/"+n)',
            't(n&&0===n.indexOf("subpackages/")?n:"cocos-js/"+n)'
        );
        if (patched !== content) {
            fs.writeFileSync(virtualPath, patched);
            patchedCount += 1;
        }
    }
    if (patchedCount === 0) {
        console.error('[4.8/6] 未能修补 Spine wasm 动态 import 路径');
        process.exit(1);
    }
}

function patchMovedSpineWasmJs(subpackageCocosDir) {
    var jsNames = listNamesByPattern(subpackageCocosDir, /^spine(?:\.(?:wasm|asm|js))?-[A-Za-z0-9_-]+\.js$/);
    for (var i = 0; i < jsNames.length; i++) {
        var jsPath = path.join(subpackageCocosDir, jsNames[i]);
        var content = fs.readFileSync(jsPath, 'utf-8');
        var patched = content;
        if (/^spine\.wasm-/.test(jsNames[i])) {
            patched = replaceAllLiteral(patched, '"./_virtual_cc-', '"../../../cocos-js/_virtual_cc-');
            patched = replaceAllLiteral(patched, "'./_virtual_cc-", "'../../../cocos-js/_virtual_cc-");
        } else if (/^spine-[A-Za-z0-9_-]+\.js$/.test(jsNames[i])) {
            patched = patched.replace(
                /("default","|\'default\',\')assets\/(spine-[A-Za-z0-9_-]+\.wasm(?:\.br)?)/g,
                function (match, prefix, assetName) {
                    return prefix + 'subpackages/' + SPINE_WASM_SUBPACKAGE_NAME + '/cocos-js/assets/' + assetName;
                }
            );
        }
        if (patched !== content) fs.writeFileSync(jsPath, patched);
    }
}

function ensureSpineWasmWechatSubpackage() {
    var runtimeRoot = resolveRuntimeRoot();
    var cocosDir = path.join(runtimeRoot, 'cocos-js');
    var cocosAssetsDir = path.join(cocosDir, 'assets');
    if (!fs.existsSync(cocosDir)) return;

    var wasmJsNames = listNamesByPattern(cocosDir, /^spine\.wasm-[A-Za-z0-9_-]+\.js$/);
    var spineJsNames = listNamesByPattern(cocosDir, /^spine(?:\.(?:asm|js))?-[A-Za-z0-9_-]+\.js$/);
    var wasmAssetNames = listNamesByPattern(cocosAssetsDir, /^spine-[A-Za-z0-9_-]+\.wasm(?:\.br)?$/);
    if (wasmJsNames.length === 0 && spineJsNames.length === 0 && wasmAssetNames.length === 0) {
        console.log('[4.8/6] 未发现 root Spine wasm 产物，跳过 spineWasm 分包迁移');
        return;
    }
    if (wasmJsNames.length === 0 || wasmAssetNames.length === 0) {
        console.error('[4.8/6] root Spine wasm 产物不完整: wasmJs=' + wasmJsNames.length + ', wasmAssets=' + wasmAssetNames.length);
        process.exit(1);
    }

    var movedJsNames = Array.from(new Set(wasmJsNames.concat(spineJsNames))).sort();
    patchSpineWasmVirtualChunk(cocosDir, movedJsNames);

    var subpackageRoot = 'subpackages/' + SPINE_WASM_SUBPACKAGE_NAME;
    var subpackageDir = path.join(runtimeRoot, subpackageRoot);
    var subpackageCocosDir = path.join(subpackageDir, 'cocos-js');
    var subpackageAssetsDir = path.join(subpackageCocosDir, 'assets');
    fs.mkdirSync(subpackageCocosDir, { recursive: true });
    fs.mkdirSync(subpackageAssetsDir, { recursive: true });

    for (var i = 0; i < movedJsNames.length; i++) {
        movePathSync(path.join(cocosDir, movedJsNames[i]), path.join(subpackageCocosDir, movedJsNames[i]));
    }
    for (var j = 0; j < wasmAssetNames.length; j++) {
        movePathSync(path.join(cocosAssetsDir, wasmAssetNames[j]), path.join(subpackageAssetsDir, wasmAssetNames[j]));
    }
    patchMovedSpineWasmJs(subpackageCocosDir);
    fs.writeFileSync(path.join(subpackageDir, 'game.js'), "console.log('[PDD] spine wasm subpackage loaded');\n");
    ensureBundleInGameSubpackages(runtimeRoot, SPINE_WASM_SUBPACKAGE_NAME);

    var remainingRootSpineFiles = listNamesByPattern(cocosDir, /^spine(?:\.(?:wasm|asm|js))?-[A-Za-z0-9_-]+\.js$/);
    var remainingRootSpineAssets = listNamesByPattern(cocosAssetsDir, /^spine-[A-Za-z0-9_-]+\.wasm(?:\.br)?$/);
    if (remainingRootSpineFiles.length > 0 || remainingRootSpineAssets.length > 0) {
        console.error('[4.8/6] Spine wasm 仍残留在硬主包: js=' + remainingRootSpineFiles.join(',') + ', assets=' + remainingRootSpineAssets.join(','));
        process.exit(1);
    }
    console.log('[4.8/6] 已将 Spine wasm 运行时迁移为微信分包: ' + subpackageRoot + ' ✓');
}

function ensureGameAssetsInSettingsSubpackages(settingsFilePath) {
    if (!fs.existsSync(settingsFilePath)) return;
    var settings = readJsonFile(settingsFilePath);
    var assets = settings.assets || {};
    var subpackages = Array.isArray(assets.subpackages) ? assets.subpackages.slice() : [];
    if (subpackages.indexOf(BUNDLE_NAME) === -1) subpackages.push(BUNDLE_NAME);
    assets.subpackages = subpackages;
    var projectBundles = Array.isArray(assets.projectBundles) ? assets.projectBundles.slice() : [];
    if (projectBundles.indexOf(BUNDLE_NAME) === -1) projectBundles.push(BUNDLE_NAME);
    assets.projectBundles = projectBundles;
    settings.assets = assets;
    writeJsonFile(settingsFilePath, settings);
}

function ensureGameAssetsInGameSubpackages(runtimeRoot) {
    var gameJsonPath = path.join(runtimeRoot, 'game.json');
    if (!fs.existsSync(gameJsonPath)) return;
    var gameJson = readJsonFile(gameJsonPath);
    var subpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages.slice() : [];
    var targetRoot = 'subpackages/' + BUNDLE_NAME + '/';
    var found = false;
    for (var i = 0; i < subpackages.length; i++) {
        var item = subpackages[i] || {};
        var root = normalizeSubpackageRoot(item.root);
        if (item.name === BUNDLE_NAME || root === BUNDLE_NAME || root === 'subpackages/' + BUNDLE_NAME) {
            item.name = BUNDLE_NAME;
            item.root = targetRoot;
            subpackages[i] = item;
            found = true;
        }
    }
    if (!found) {
        subpackages.push({ name: BUNDLE_NAME, root: targetRoot });
    }
    gameJson.subpackages = subpackages;
    writeJsonFile(gameJsonPath, gameJson);
}

function ensureGameAssetsWechatSubpackage() {
    var runtimeRoot = resolveRuntimeRoot();
    var localBundleDir = path.join(runtimeRoot, 'assets', BUNDLE_NAME);
    var gameAssetsRoot = 'subpackages/' + BUNDLE_NAME;
    var gameAssetsSubpackageDir = path.join(runtimeRoot, gameAssetsRoot);
    if (fs.existsSync(localBundleDir)) {
        movePathSync(localBundleDir, gameAssetsSubpackageDir);
        console.log('[4/6] 已将 assets/gameAssets 迁移为微信分包: ' + gameAssetsRoot + ' ✓');
    }
    ensureStableBundleFiles(gameAssetsSubpackageDir);
    ensureSubpackageGameJs(gameAssetsSubpackageDir, BUNDLE_NAME);
    ensureGameAssetsInGameSubpackages(runtimeRoot);
    ensureGameAssetsInSettingsSubpackages(resolveSettingsPath());
    return gameAssetsSubpackageDir;
}

function ensureBootstrapWechatSubpackage() {
    var runtimeRoot = resolveRuntimeRoot();
    var localBundleDir = path.join(runtimeRoot, 'assets', BOOTSTRAP_BUNDLE_NAME);
    var bootstrapRoot = 'subpackages/' + BOOTSTRAP_BUNDLE_NAME;
    var bootstrapSubpackageDir = path.join(runtimeRoot, bootstrapRoot);
    if (fs.existsSync(localBundleDir)) {
        movePathSync(localBundleDir, bootstrapSubpackageDir);
        console.log('[3.7/7] 已将 assets/bootstrap 迁移为微信分包 gameEntry/bootstrap: ' + bootstrapRoot + ' ✓');
    }
    ensureStableBundleFiles(bootstrapSubpackageDir);
    ensureSubpackageGameJs(bootstrapSubpackageDir, BOOTSTRAP_BUNDLE_NAME);
    ensureBundleInGameSubpackages(runtimeRoot, BOOTSTRAP_BUNDLE_NAME);
    ensureBundleInSettingsSubpackages(resolveSettingsPath(), BOOTSTRAP_BUNDLE_NAME);
    return bootstrapSubpackageDir;
}

function ensureHomeAssetsWechatSubpackage() {
    var runtimeRoot = resolveRuntimeRoot();
    var localBundleDir = path.join(runtimeRoot, 'assets', HOME_ASSETS_BUNDLE_NAME);
    var homeAssetsRoot = 'subpackages/' + HOME_ASSETS_BUNDLE_NAME;
    var homeAssetsSubpackageDir = path.join(runtimeRoot, homeAssetsRoot);
    if (fs.existsSync(localBundleDir)) {
        movePathSync(localBundleDir, homeAssetsSubpackageDir);
        console.log('[4/6] 已将 assets/homeAssets 迁移为微信分包: ' + homeAssetsRoot + ' ✓');
    }
    ensureStableBundleFiles(homeAssetsSubpackageDir);
    assertBundleConfigDepsClean(homeAssetsSubpackageDir, HOME_ASSETS_BUNDLE_NAME, [BUNDLE_NAME]);
    ensureSubpackageGameJs(homeAssetsSubpackageDir, HOME_ASSETS_BUNDLE_NAME);
    ensureBundleInGameSubpackages(runtimeRoot, HOME_ASSETS_BUNDLE_NAME);
    ensureBundleInSettingsSubpackages(resolveSettingsPath(), HOME_ASSETS_BUNDLE_NAME);
    return homeAssetsSubpackageDir;
}

function ensureNamedWechatSubpackage(bundleName) {
    var runtimeRoot = resolveRuntimeRoot();
    var localBundleDir = path.join(runtimeRoot, 'assets', bundleName);
    var bundleRoot = 'subpackages/' + bundleName;
    var bundleDir = path.join(runtimeRoot, bundleRoot);
    if (fs.existsSync(localBundleDir)) {
        movePathSync(localBundleDir, bundleDir);
        console.log('[4/6] moved assets/' + bundleName + ' to WeChat subpackage: ' + bundleRoot);
    }
    ensureStableBundleFiles(bundleDir);
    ensureSubpackageGameJs(bundleDir, bundleName);
    ensureBundleInGameSubpackages(runtimeRoot, bundleName);
    ensureBundleInSettingsSubpackages(resolveSettingsPath(), bundleName);
    return bundleDir;
}

function ensureLevelDataWechatSubpackage() {
    if (!debugLevelDataBundle) return '';
    var runtimeRoot = resolveRuntimeRoot();
    var localBundleDir = path.join(runtimeRoot, 'assets', LEVEL_DATA_BUNDLE_NAME);
    var levelDataRoot = 'subpackages/' + LEVEL_DATA_BUNDLE_NAME;
    var levelDataSubpackageDir = path.join(runtimeRoot, levelDataRoot);
    if (fs.existsSync(localBundleDir)) {
        movePathSync(localBundleDir, levelDataSubpackageDir);
        console.log('[4.1/6] 已将 assets/levelData 迁移为微信分包: ' + levelDataRoot + ' ✓');
    }
    ensureStableBundleFiles(levelDataSubpackageDir);
    ensureSubpackageGameJs(levelDataSubpackageDir, LEVEL_DATA_BUNDLE_NAME);
    ensureBundleInGameSubpackages(runtimeRoot, LEVEL_DATA_BUNDLE_NAME);
    ensureBundleInSettingsSubpackages(resolveSettingsPath(), LEVEL_DATA_BUNDLE_NAME);
    return levelDataSubpackageDir;
}

function isBundleSubpackageItem(item, bundleName) {
    var root = normalizeSubpackageRoot(item && item.root);
    return item && (item.name === bundleName || root === bundleName || root === 'subpackages/' + bundleName);
}

function ensureLocalBundleIndexFile(bundleDir, bundleName) {
    if (!fs.existsSync(bundleDir)) return;
    ensureStableBundleFiles(bundleDir);
    var stableIndexPath = path.join(bundleDir, 'index.js');
    if (fs.existsSync(stableIndexPath)) return;
    var gameJsPath = path.join(bundleDir, 'game.js');
    if (!fs.existsSync(gameJsPath)) {
        console.warn('[4.2/6] ' + bundleName + ' 本地 bundle 缺少 index.js/game.js，保留原样');
        return;
    }
    fs.copyFileSync(gameJsPath, stableIndexPath);
    console.log('[4.2/6] 已为 assets/' + bundleName + ' 生成本地 index.js ✓');
}

function normalizeInternalBundleAsLocal(runtimeRoot, settingsFilePath) {
    var bundleName = 'internal';
    var subpackageDir = path.join(runtimeRoot, 'subpackages', bundleName);
    var localBundleDir = path.join(runtimeRoot, 'assets', bundleName);
    if (fs.existsSync(subpackageDir)) {
        movePathSync(subpackageDir, localBundleDir);
        ensureLocalBundleIndexFile(localBundleDir, bundleName);
        console.log('[4.2/6] internal 已从微信分包归回本地 bundle ✓');
    } else if (fs.existsSync(localBundleDir)) {
        ensureLocalBundleIndexFile(localBundleDir, bundleName);
    }
    ensureVersionedBundleIndexFile(localBundleDir, bundleName, settingsFilePath);

    var gameJsonPath = path.join(runtimeRoot, 'game.json');
    if (fs.existsSync(gameJsonPath)) {
        var gameJson = readJsonFile(gameJsonPath);
        var subpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages.slice() : [];
        var filtered = subpackages.filter(function (item) {
            return !isBundleSubpackageItem(item, bundleName);
        });
        if (filtered.length !== subpackages.length) {
            gameJson.subpackages = filtered;
            writeJsonFile(gameJsonPath, gameJson);
            console.log('[4.2/6] 已从 game.json.subpackages 移除 internal ✓');
        }
    }

    if (fs.existsSync(settingsFilePath)) {
        var settings = readJsonFile(settingsFilePath);
        var assets = settings.assets || {};
        var settingsSubpackages = Array.isArray(assets.subpackages) ? assets.subpackages.slice() : [];
        var nextSubpackages = settingsSubpackages.filter(function (name) {
            return name !== bundleName;
        });
        if (nextSubpackages.length !== settingsSubpackages.length) {
            assets.subpackages = nextSubpackages;
            settings.assets = assets;
            writeJsonFile(settingsFilePath, settings);
            console.log('[4.2/6] 已从 settings.assets.subpackages 移除 internal ✓');
        }
    }
}

function ensureWechatSubpackageStableConfigs(runtimeRoot) {
    var bundleNames = ['main', BOOTSTRAP_BUNDLE_NAME, HOME_ASSETS_BUNDLE_NAME, BUNDLE_NAME];
    if (debugLevelDataBundle) bundleNames.push(LEVEL_DATA_BUNDLE_NAME);
    for (var i = 0; i < bundleNames.length; i++) {
        var bundleName = bundleNames[i];
        var subpackageRoot = getBundleSubpackageRoot(runtimeRoot, bundleName);
        var subpackageDir = path.join(runtimeRoot, subpackageRoot);
        if (!fs.existsSync(subpackageDir)) {
            console.error('[8.4/8] 微信分包目录缺失，无法补齐稳定 config: ' + subpackageRoot);
            process.exit(1);
        }
        ensureStableBundleFiles(subpackageDir);
        var stableConfigPath = path.join(subpackageDir, 'config.json');
        if (!fs.existsSync(stableConfigPath)) {
            console.error('[8.4/8] 微信分包缺少稳定 config.json: ' + stableConfigPath);
            process.exit(1);
        }
    }
    console.log('[8.4/8] 微信分包稳定 config.json 已补齐 ✓');
}

function removeDuplicateStableBundleIndex(runtimeRoot, settingsFilePath) {
    if (!fs.existsSync(settingsFilePath)) return 0;
    var settings = JSON.parse(fs.readFileSync(settingsFilePath, 'utf-8'));
    var bundleVers = settings.assets && settings.assets.bundleVers ? settings.assets.bundleVers : {};
    var removedBytes = 0;
    for (var i = 0; i < ['main', 'internal', 'bootstrap'].length; i++) {
        var bundleName = ['main', 'internal', 'bootstrap'][i];
        var version = bundleVers[bundleName];
        if (!version || !/^[0-9a-f]+$/i.test(version)) continue;
        var bundleDir = path.join(runtimeRoot, 'assets', bundleName);
        var stableIndexPath = path.join(bundleDir, 'index.js');
        var versionedIndexPath = path.join(bundleDir, 'index.' + version + '.js');
        if (!fs.existsSync(stableIndexPath) || !fs.existsSync(versionedIndexPath)) continue;
        var stableContent = fs.readFileSync(stableIndexPath);
        var versionedContent = fs.readFileSync(versionedIndexPath);
        var sameContent = stableContent.length === versionedContent.length
            && crypto.createHash('sha1').update(stableContent).digest('hex') === crypto.createHash('sha1').update(versionedContent).digest('hex');
        if (!sameContent) continue;
        removedBytes += fs.statSync(stableIndexPath).size;
        fs.rmSync(stableIndexPath, { force: true });
        console.log('[4.7/6] 删除重复 bundle index: assets/' + bundleName + '/index.js ✓');
    }
    return removedBytes;
}

function getPreloadBundleName(item) {
    return typeof item === 'string' ? item : item && item.bundle;
}

function ensureStartupPreloadBundles(assets) {
    var preloadBundles = Array.isArray(assets.preloadBundles) ? assets.preloadBundles.slice() : [];
    var requiredOrder = ['main'];
    var byName = new Map();
    for (var i = 0; i < preloadBundles.length; i++) {
        var name = getPreloadBundleName(preloadBundles[i]);
        if (name && !byName.has(name)) byName.set(name, preloadBundles[i]);
    }
    var ordered = requiredOrder.map(function (name) {
        return byName.get(name) || { bundle: name };
    });
    for (var j = 0; j < preloadBundles.length; j++) {
        var existingName = getPreloadBundleName(preloadBundles[j]);
        if (
            requiredOrder.indexOf(existingName) === -1
            && existingName !== BOOTSTRAP_BUNDLE_NAME
            && existingName !== HOME_ASSETS_BUNDLE_NAME
            && existingName !== BUNDLE_NAME
            && existingName !== LEVEL_DATA_BUNDLE_NAME
            && SKIN_BUNDLE_NAMES.indexOf(existingName) === -1
        ) ordered.push(preloadBundles[j]);
    }
    assets.preloadBundles = ordered;
    return assets;
}

function ensureWechatRuntimeMarker(runtimeRoot) {
    var gameJsPath = path.join(runtimeRoot, 'game.js');
    if (!fs.existsSync(gameJsPath)) return;
    var content = fs.readFileSync(gameJsPath, 'utf-8');
    var platformMarker = 'globalThis.__PDD_BUILD_PLATFORM__="wechat";';
    var marker = 'globalThis.__PDD_WECHAT_BUILD__=true;';
    var buildModeMarker = 'globalThis.__PDD_WECHAT_BUILD_MODE__=' + JSON.stringify(buildMode) + ';';
    var gameAssetsModeMarker = 'globalThis.__PDD_GAME_ASSETS_MODE__=' + JSON.stringify(gameAssetsMode) + ';';
    var cdnSlotMarker = 'globalThis.__PDD_CDN_SLOT__=' + JSON.stringify(CDN_SLOT) + ';';
    var levelDataCdnMarker = 'globalThis.__PDD_LEVEL_DATA_CDN_URL__=' + JSON.stringify(LEVEL_DATA_CDN_URL) + ';';
    var skinDataCdnMarker = 'globalThis.__PDD_SKIN_DATA_CDN_URL__=' + JSON.stringify(SKIN_DATA_CDN_URL) + ';';
    var screenAdaptDebugMarker = 'globalThis.__PDD_SCREEN_ADAPT_DEBUG__=' + (screenAdaptDebug ? 'true' : 'false') + ';';
    var domCtorMarker = 'globalThis.__PDD_DOM_CTORS_READY__=true;';
    var releaseLogGateMarker = 'globalThis.__PDD_RELEASE_LOG_GATE_INSTALLED__=true;';
    var releaseLogGateVersionMarker = 'globalThis.__PDD_RELEASE_LOG_GATE_VERSION__=3;';
    var platformMarkerPattern = /globalThis\.__PDD_BUILD_PLATFORM__="[^"]*";/g;
    var buildModeMarkerPattern = /globalThis\.__PDD_WECHAT_BUILD_MODE__="[^"]*";/g;
    var modeMarkerPattern = /globalThis\.__PDD_GAME_ASSETS_MODE__="[^"]*";/g;
    var cdnSlotPattern = /globalThis\.__PDD_CDN_SLOT__="[^"]*";/g;
    var levelDataCdnPattern = /globalThis\.__PDD_LEVEL_DATA_CDN_URL__="[^"]*";/g;
    var skinDataCdnPattern = /globalThis\.__PDD_SKIN_DATA_CDN_URL__="[^"]*";/g;
    var screenAdaptDebugPattern = /globalThis\.__PDD_SCREEN_ADAPT_DEBUG__=(?:true|false);/g;
    var originalContent = content;
    if (platformMarkerPattern.test(content)) {
        content = content.replace(platformMarkerPattern, platformMarker);
    }
    if (buildModeMarkerPattern.test(content)) {
        content = content.replace(buildModeMarkerPattern, buildModeMarker);
    }
    if (modeMarkerPattern.test(content)) {
        content = content.replace(modeMarkerPattern, gameAssetsModeMarker);
    }
    if (cdnSlotPattern.test(content)) {
        content = content.replace(cdnSlotPattern, cdnSlotMarker);
    }
    if (levelDataCdnPattern.test(content)) {
        content = content.replace(levelDataCdnPattern, levelDataCdnMarker);
    }
    if (skinDataCdnPattern.test(content)) {
        content = content.replace(skinDataCdnPattern, skinDataCdnMarker);
    }
    if (screenAdaptDebugPattern.test(content)) {
        content = content.replace(screenAdaptDebugPattern, screenAdaptDebugMarker);
    }
    var missingLines = [];
    if (content.indexOf(platformMarker) === -1) missingLines.push(platformMarker);
    if (content.indexOf(marker) === -1) missingLines.push(marker);
    if (content.indexOf(buildModeMarker) === -1) missingLines.push(buildModeMarker);
    if (content.indexOf(gameAssetsModeMarker) === -1) missingLines.push(gameAssetsModeMarker);
    if (content.indexOf(cdnSlotMarker) === -1) missingLines.push(cdnSlotMarker);
    if (content.indexOf(levelDataCdnMarker) === -1) missingLines.push(levelDataCdnMarker);
    if (content.indexOf(skinDataCdnMarker) === -1) missingLines.push(skinDataCdnMarker);
    if (content.indexOf(screenAdaptDebugMarker) === -1) missingLines.push(screenAdaptDebugMarker);
    if (buildMode === 'debug' && content.indexOf('__PDD_PERF_TRACE_STARTED_AT__') === -1) {
        missingLines.push(
            '(function pddEarlyPerfTrace(){',
            'var g=typeof globalThis!=="undefined"?globalThis:{};',
            'var now=Date.now();g.__PDD_PERF_TRACE_STARTED_AT__=now;',
            'try{console.warn("[PDD_PERF_TRACE]",JSON.stringify({seq:0,t:0,at:now,event:"runtime.gamejs.start",scene:"",mode:"debug",early:true}));}catch(_){ }',
            '})();'
        );
    }
    if (content.indexOf(releaseLogGateVersionMarker) === -1) {
        missingLines.push(
            '(function installPddReleaseLogGate(){',
            'if(' + JSON.stringify(buildMode) + '!=="release")return;',
            'var g=typeof globalThis!=="undefined"?globalThis:{};',
            'if(Number(g.__PDD_RELEASE_LOG_GATE_VERSION__||0)>=3)return;',
            'var c=typeof console!=="undefined"?console:null;if(!c)return;',
            'if(!c.__pddLogGateInstalled){c.__pddOriginalLog=c.log;c.__pddOriginalInfo=c.info;c.__pddOriginalDebug=c.debug;c.__pddOriginalWarn=c.warn;}',
            'if(!c.__pddOriginalTime)c.__pddOriginalTime=c.time;if(!c.__pddOriginalTimeEnd)c.__pddOriginalTimeEnd=c.timeEnd;',
            'var noop=function(){};c.log=noop;c.info=noop;c.debug=noop;c.warn=noop;c.time=noop;c.timeEnd=noop;c.__pddLogGateInstalled=true;',
            releaseLogGateMarker,
            releaseLogGateVersionMarker,
            '})();'
        );
    }
    if (content.indexOf(domCtorMarker) === -1) {
        missingLines.push(
            '(function ensurePddMiniGameDomConstructors(){',
            'if(globalThis.__PDD_DOM_CTORS_READY__)return;',
            'function ensureCtor(name){',
            'if(typeof globalThis[name]!=="function"){globalThis[name]=function '+ 'PDDMiniGameCtor' + '(){};}',
            'if(typeof globalThis.window==="object"&&globalThis.window&&typeof globalThis.window[name]!=="function"){globalThis.window[name]=globalThis[name];}',
            '}',
            'ensureCtor("HTMLElement");',
            'ensureCtor("HTMLCanvasElement");',
            'ensureCtor("HTMLImageElement");',
            'globalThis.__PDD_DOM_CTORS_READY__=true;',
            '})();'
        );
    }
    if (missingLines.length) {
        content = missingLines.join('\n') + '\n' + content;
    }
    if (content !== originalContent) {
        fs.writeFileSync(gameJsPath, content);
    }
}

function patchDeprecatedDirectorAnimationIntervalWarning(runtimeRoot) {
    var engineFiles = walkFiles(runtimeRoot)
        .filter(function (name) { return /\.js$/i.test(name); });
    var patchedCount = 0;
    for (var i = 0; i < engineFiles.length; i++) {
        var enginePath = engineFiles[i];
        var content = fs.readFileSync(enginePath, 'utf-8');
        var patched = content
            .replace(/,?\{name:"(?:setAnimationInterval|getAnimationInterval)",suggest:"please use game\.frameRate instead"\}/g, '')
            .replace(/\[\s*,/g, '[');
        if (patched !== content) {
            fs.writeFileSync(enginePath, patched);
            patchedCount += 1;
        }
        if (patched.indexOf('getAnimationInterval') !== -1 || patched.indexOf('setAnimationInterval') !== -1) {
            console.error('[3.4b/7] 微信运行时代码仍包含 director.getAnimationInterval 废弃属性告警入口: ' + enginePath);
            process.exit(1);
        }
    }
    return patchedCount > 0;
}

function injectScreenAdaptGameJsLog(content) {
    if (content.indexOf('__pddLogScreenAdapt') !== -1) return content;
    var bootstrapLog = [
        'const info = wx.getSystemInfoSync();',
        'function __pddReadScreenAdaptInfo(){',
        '    var wxApi=typeof wx!=="undefined"?wx:null;',
        '    try{',
        '        if(wxApi&&typeof wxApi.getWindowInfo==="function")return wxApi.getWindowInfo();',
        '        if(wxApi&&typeof wxApi.getSystemInfoSync==="function")return wxApi.getSystemInfoSync();',
        '    }catch(e){return {error:e&&e.message?e.message:String(e)};}',
        '    return null;',
        '}',
        'function __pddPickScreenAdaptInfo(raw){',
        '    if(!raw)return null;',
        '    return {windowWidth:raw.windowWidth,windowHeight:raw.windowHeight,screenWidth:raw.screenWidth,screenHeight:raw.screenHeight,pixelRatio:raw.pixelRatio||raw.devicePixelRatio,devicePixelRatio:raw.devicePixelRatio,safeArea:raw.safeArea,platform:raw.platform,model:raw.model,system:raw.system};',
        '}',
        'function __pddLogScreenAdapt(stage){',
        '    var g=typeof globalThis!=="undefined"?globalThis:{};',
        '    if(!g.__PDD_SCREEN_ADAPT_DEBUG__)return;',
        '    var c=typeof canvas!=="undefined"?canvas:null;',
        '    var w=typeof window!=="undefined"?window:null;',
        '    console.warn("[ScreenAdaptDebug:game-js]",{stage:stage,wx:__pddPickScreenAdaptInfo(__pddReadScreenAdaptInfo()),canvas:c?{width:c.width,height:c.height,clientWidth:c.clientWidth,clientHeight:c.clientHeight,styleWidth:c.style&&c.style.width,styleHeight:c.style&&c.style.height}:null,window:w?{innerWidth:w.innerWidth,innerHeight:w.innerHeight,devicePixelRatio:w.devicePixelRatio}:null});',
        '}',
        '__pddLogScreenAdapt("before-orientation-swap");',
    ].join('\n') + '\n';
    var patched = content.replace(/const info = wx\.getSystemInfoSync\(\);\n/, bootstrapLog);
    if (patched === content) return content;
    return patched.replace(
        /\n\}\n\/\/ Adjust initial canvas size/,
        '\n}\n__pddLogScreenAdapt("after-orientation-swap");\n// Adjust initial canvas size'
    );
}

function ensureStableGameAssetsBundleScriptLoader(runtimeRoot) {
    var engineAdapterPath = path.join(runtimeRoot, 'engine-adapter.js');
    if (!fs.existsSync(engineAdapterPath)) return;
    var content = fs.readFileSync(engineAdapterPath, 'utf-8');
    var versionedScriptPattern = /i="src\/bundle-scripts\/"\.concat\(([^,]+),"\/index\."\)\.concat\(([^,]+),"js"\)/g;
    var patched = content.replace(versionedScriptPattern, function (_match, bundleNameExpr) {
        return 'i="src/bundle-scripts/".concat(' + bundleNameExpr + ',"/index.js")';
    });
    if (patched !== content) {
        fs.writeFileSync(engineAdapterPath, patched);
    }
}

function ensureStableWechatSubpackageConfigLoader(runtimeRoot) {
    var engineAdapterPath = path.join(runtimeRoot, 'engine-adapter.js');
    if (!fs.existsSync(engineAdapterPath)) return;
    var content = fs.readFileSync(engineAdapterPath, 'utf-8');
    var pattern = /([A-Za-z_$][\w$]*)=\(([A-Za-z_$][\w$]*)\.platform===\2\.Platform\.TAOBAO_MINI_GAME\?"":"subpackages\/"\)\.concat\(([^,]+),"\/config\."\)\.concat\(([^,]+),"json"\)/g;
    var patched = content.replace(pattern, function (_match, targetExpr, platformExpr, bundleNameExpr) {
        return targetExpr + '=(' + platformExpr + '.platform===' + platformExpr
            + '.Platform.TAOBAO_MINI_GAME?"":"subpackages/").concat(' + bundleNameExpr + ',"/config.json")';
    });
    if (patched !== content) {
        fs.writeFileSync(engineAdapterPath, patched);
        console.log('[3.0b/7] 微信分包 bundle config 已改为稳定 config.json ✓');
        return;
    }
    if (/subpackages\/"\)\.concat\([^,]+,"\/config\."\)\.concat\([^,]+,"json"\)/.test(content)) {
        console.error('[3.0b/7] 微信分包 bundle config 仍使用版本化路径，patch 未命中');
        process.exit(1);
    }
    console.log('[3.0b/7] 微信分包 bundle config 已是稳定路径 ✓');
}

function ensureBundleScriptStub(runtimeRoot, bundleName, label) {
    var bundleScriptDir = path.join(runtimeRoot, 'src', 'bundle-scripts', bundleName);
    var bundleScriptFile = path.join(bundleScriptDir, 'index.js');
    if (!fs.existsSync(bundleScriptFile)) {
        fs.mkdirSync(bundleScriptDir, { recursive: true });
        fs.writeFileSync(bundleScriptFile,
            'System.register("virtual:///prerequisite-imports/' + bundleName + '", [], function() { return { setters: [], execute: function() {} }; });\n');
        console.log(label + ' 已创建 bundle-scripts stub ✓');
    } else {
        console.log(label + ' bundle-scripts stub 已存在 ✓');
    }
}

// 1. 创建 src/bundle-scripts/gameAssets/index.js
ensureBundleScriptStub(resolveRuntimeRoot(), HOME_ASSETS_BUNDLE_NAME, '[1/6] homeAssets');
ensureBundleScriptStub(resolveRuntimeRoot(), BUNDLE_NAME, '[1/6] gameAssets');
SKIN_BUNDLE_NAMES.forEach(function (bundleName) {
    ensureBundleScriptStub(resolveRuntimeRoot(), bundleName, '[1/6] ' + bundleName);
});
if (debugLevelDataBundle) {
    ensureBundleScriptStub(resolveRuntimeRoot(), LEVEL_DATA_BUNDLE_NAME, '[1.1/6] levelData');
}

// 2. 修复 src/settings.json — gameAssets 是微信分包/本地 bundle，不配置为 Cocos 远程包
const settingsPath = resolveSettingsPath();
if (fs.existsSync(settingsPath)) {
    var settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    var a = settings.assets || {};
    a.server = '';
    delete a.gameAssetsBundles;
    a.remoteBundles = (Array.isArray(a.remoteBundles) ? a.remoteBundles : []).filter(function (name) {
        return name !== HOME_ASSETS_BUNDLE_NAME && name !== BUNDLE_NAME && name !== LEVEL_DATA_BUNDLE_NAME && SKIN_BUNDLE_NAMES.indexOf(name) === -1;
    });
    var projectBundles = Array.isArray(a.projectBundles) ? a.projectBundles.slice() : [];
    if (!debugLevelDataBundle) {
        projectBundles = projectBundles.filter(function (name) { return name !== LEVEL_DATA_BUNDLE_NAME; });
    }
    var requiredProjectBundles = debugLevelDataBundle
        ? [BOOTSTRAP_BUNDLE_NAME, HOME_ASSETS_BUNDLE_NAME, BUNDLE_NAME].concat(SKIN_BUNDLE_NAMES, [LEVEL_DATA_BUNDLE_NAME])
        : [BOOTSTRAP_BUNDLE_NAME, HOME_ASSETS_BUNDLE_NAME, BUNDLE_NAME].concat(SKIN_BUNDLE_NAMES);
    for (var projectBundleIndex = 0; projectBundleIndex < requiredProjectBundles.length; projectBundleIndex++) {
        var projectBundleName = requiredProjectBundles[projectBundleIndex];
        if (projectBundles.indexOf(projectBundleName) === -1) projectBundles.push(projectBundleName);
    }
    a.projectBundles = projectBundles;
    ensureStartupPreloadBundles(a);
    settings.assets = a;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, null));
    console.log('[2/6] projectBundles 已配置 gameEntry/bootstrap + homeAssets + gameAssets' + (debugLevelDataBundle ? ' + levelData' : '') + ' ✓');
    console.log('[2/6] startup preload: cocosCore/main only; gameEntry/bootstrap 由统一游戏入口路由按需加载 ✓');
    console.log('[2/6] gameAssets 模式: ' + gameAssetsMode + ' ✓');
    console.log('[2/6] CDN 槽位: ' + CDN_SLOT);
    console.log('[2/6] 关卡数据 CDN: ' + LEVEL_DATA_CDN_URL);
    console.log('[2/6] 皮肤数据 CDN: ' + SKIN_DATA_CDN_URL);
}

// 3. 修复 engine-adapter.js 的 URL 拼接
// engine-adapter 硬编码了 remoteServerAddress + "remote/" + bundle_name
// 导致路径变成 .../pdd/remote/remote/，去掉 "remote/" 前缀即可
var engineAdapterPath = resolveBuildPath('engine-adapter.js');
if (fs.existsSync(engineAdapterPath)) {
    var content = fs.readFileSync(engineAdapterPath, 'utf-8');
    var patched = content.replace(
        /c=""\.concat\(([a-z])\.remoteServerAddress,"(?:remote\/)?"\)\.concat\(([a-z])\)/g,
        'c=$1.remoteServerAddress?$1.remoteServerAddress.replace(/\\/$/,""):$2'
    ).replace(
        /m\.remoteServerAddress,"remote\/"/g,
        'm.remoteServerAddress,""'
    );
    if (patched !== content) {
        fs.writeFileSync(engineAdapterPath, patched);
        console.log('[3/7] 已修复 engine-adapter.js 远程路径 ✓');
    } else {
        console.log('[3/7] engine-adapter.js 无需修复');
    }
}
ensureStableGameAssetsBundleScriptLoader(resolveRuntimeRoot());
ensureStableWechatSubpackageConfigLoader(resolveRuntimeRoot());

// 3.2 保存原始 wx 对象到 globalThis.__rawWx，并锁定首屏抗锯齿配置
var gameJsPath = resolveBuildPath('game.js');
if (fs.existsSync(gameJsPath)) {
    var gameJs = fs.readFileSync(gameJsPath, 'utf-8');
    // 匹配 function __initApp () {  // init app 后面紧跟的一行
    var patchedGame = gameJs.replace(
        /(function __initApp\s*\(\s*\)\s*\{.*\n)/,
        '$1globalThis.__rawWx = wx;  // save raw wx before web-adapter modifies it\n'
    );
    patchedGame = patchedGame.replace(
        /firstScreen\.start\('default', 'default', 'false'\)/g,
        "firstScreen.start('default', 'false', 'false')"
    );
    // 移除 DPR 倍率乘法 — 微信 canvas 已是物理像素尺寸，引擎内部也会处理 DPR，
    // 重复乘会导致画布被拉伸 2~3 倍。
    patchedGame = patchedGame.replace(
        /if \(canvas && window\.devicePixelRatio >= 2\) \{canvas\.width \*= info\.devicePixelRatio; canvas\.height \*= info\.devicePixelRatio;\}/g,
        '// DPR handled by engine'
    );
    if (screenAdaptDebug) {
        patchedGame = injectScreenAdaptGameJsLog(patchedGame);
    }
    if (patchedGame !== gameJs) {
        fs.writeFileSync(gameJsPath, patchedGame);
        console.log('[3.2/7] 已保存原始 wx 到 __rawWx + 移除 DPR 乘法' + (screenAdaptDebug ? ' + 注入屏幕诊断日志' : '，屏幕诊断关闭') + ' ✓');
    } else {
        console.log('[3.2/7] __rawWx 已存在' + (screenAdaptDebug ? '，屏幕诊断已开启' : '，屏幕诊断关闭') + ' ✓');
    }
    // 注入 SDK 外部脚本 require
    if (patchedGame.indexOf("require('./sdk/sysdk-wxapp')") === -1) {
        patchedGame = "require('./sdk/sysdk-wxapp');\n" + patchedGame;
        fs.writeFileSync(gameJsPath, patchedGame);
        console.log('[3.2b/7] 已注入 SDK 外部脚本 require ✓');
    } else {
        console.log('[3.2b/7] SDK require 已存在 ✓');
    }
}
ensureWechatRuntimeMarker(resolveRuntimeRoot());

// 3.3 强制首屏关闭抗锯齿 + 修正竖屏适配（fitHeight=true 避免拉伸）
var firstScreenPath = resolveBuildPath('first-screen.js');
if (fs.existsSync(firstScreenPath)) {
    var firstScreen = fs.readFileSync(firstScreenPath, 'utf-8');
    var patchedFirstScreen = firstScreen.replace(
        /antialias:\s*true,/g,
        'antialias: false,'
    );
    // Cocos 默认 fitWidth=true, fitHeight=false，竖屏游戏需要 fitHeight=true
    patchedFirstScreen = patchedFirstScreen.replace(
        /let fitWidth = true;\nlet fitHeight = false;/,
        'let fitWidth = false;\nlet fitHeight = true;'
    );
    patchedFirstScreen = patchWechatFirstScreenBackground(patchedFirstScreen);
    if (patchedFirstScreen !== firstScreen) {
        fs.writeFileSync(firstScreenPath, patchedFirstScreen);
        console.log('[3.3/7] 已关闭首屏抗锯齿 + 修正竖屏适配 + 修正首帧浅色背景 ✓');
    } else {
        console.log('[3.3/7] 首屏配置已就绪 ✓');
    }
}
if (normalizeWechatSplashSettings(settingsPath)) {
    console.log('[3.3b/7] 已修正微信 splash settings 为浅色背景 ✓');
}

// 3.4 启动后立即使用休闲游戏默认 30 帧；运行时交互/动画阶段再临时升帧
var applicationPath = resolveApplicationPath();
if (fs.existsSync(applicationPath)) {
    var applicationContent = fs.readFileSync(applicationPath, 'utf-8');
    var patchedApplication = applicationContent.replace(
        /key: "onPostSystemInit",\s+value: function onPostSystemInit\(\) \{\s+\/\/ do custom logic\s+\}/,
        'key: "onPostSystemInit", value: function onPostSystemInit() { cc.game.frameRate = 30; cc.game.setFrameRate(30); }'
    );
    patchedApplication = patchedApplication.replace(
        /key: "onPostSystemInit",\s+value: function onPostSystemInit\(\) \{\s+cc\.game\.frameRate = \d+;\s+cc\.game\.setFrameRate\(\d+\);\s+\}/,
        'key: "onPostSystemInit", value: function onPostSystemInit() { cc.game.frameRate = 30; cc.game.setFrameRate(30); }'
    );
    patchedApplication = patchedApplication.replace(
        /key: "onPostInitBase",\s+value: function onPostInitBase\(\) \{\s+\/\/ cc\.settings\.overrideSettings\('assets', 'server', ''\);\s+\/\/ do custom logic\s+\}/,
        'key: "onPostInitBase",\n          value: function onPostInitBase() {\n          }'
    );
    if (patchedApplication !== applicationContent) {
        fs.writeFileSync(applicationPath, patchedApplication);
        console.log('[3.4/7] 已锁定启动帧率为 30 ✓');
    } else {
        console.log('[3.4/7] 启动帧率已锁定 ✓');
    }
}
console.log(patchDeprecatedDirectorAnimationIntervalWarning(resolveRuntimeRoot())
    ? '[3.4b/7] 已清理 director.getAnimationInterval 废弃属性告警 ✓'
    : '[3.4b/7] director.getAnimationInterval 废弃属性告警已清理 ✓');
// 微信开发者工具里 USER_DATA_PATH 可能表现为 http://usr/...
// Cocos 每次 load gameAssets bundle 都会重复 mkdir 缓存目录；目录已存在时不应打印警告。
var webAdapterPath = resolveBuildPath('web-adapter.js');
if (fs.existsSync(webAdapterPath)) {
    var webContent = fs.readFileSync(webAdapterPath, 'utf-8');
    var webPatched = webContent.replace(
        /makeDirSync:function\(t,e\)\{try{return o\.mkdirSync\(t,e\),null}catch\(e\)\{return console\.warn\("Make directory failed: path: "\.concat\(t," message: "\)\.concat\(e\.message\)\),new Error\(e\.message\)\}\}/g,
        'makeDirSync:function(t,e){try{return o.mkdirSync(t,e),null}catch(e){if(e&&/file already exists/i.test(e.message))return null;return console.warn("Make directory failed: path: ".concat(t," message: ").concat(e.message)),new Error(e.message)}}'
    );
    if (webPatched !== webContent) {
        fs.writeFileSync(webAdapterPath, webPatched);
        console.log('[3.1/7] 已修复 web-adapter.js 缓存目录告警 ✓');
    } else {
        console.log('[3.1/7] web-adapter.js 无需修复');
    }
}

// 3.5 关闭 urlCheck + 添加关卡数据 CDN 域名到白名单
var projectConfigPath = path.join(buildPath, 'project.config.json');
if (fs.existsSync(projectConfigPath)) {
    var pc = JSON.parse(fs.readFileSync(projectConfigPath, 'utf-8'));
    normalizeWechatProjectConfig(pc);
    // 关闭域名校验（开发阶段）
    if (pc.setting.urlCheck) {
        pc.setting.urlCheck = false;
        console.log('[3.5/7] 已关闭 urlCheck ✓');
    } else {
        console.log('[3.5/7] urlCheck 已关闭 ✓');
    }
    // 添加关卡数据 CDN 域名到下载/请求白名单
    var cdnDomain = 'game-pdd-v2.oss-cn-beijing.aliyuncs.com';
    try {
        cdnDomain = new URL(LEVEL_DATA_CDN_URL).host || cdnDomain;
    } catch (e) {}
    // 微信头像域名（开放数据域下载头像需要）
    var wxAvatarDomain = 'thirdwx.qlogo.cn';
    if (!pc.setting.downloadFileDomain) {
        pc.setting.downloadFileDomain = cdnDomain + ',' + wxAvatarDomain;
    } else {
        if (pc.setting.downloadFileDomain.indexOf(cdnDomain) === -1) {
            pc.setting.downloadFileDomain += ',' + cdnDomain;
        }
        if (pc.setting.downloadFileDomain.indexOf(wxAvatarDomain) === -1) {
            pc.setting.downloadFileDomain += ',' + wxAvatarDomain;
        }
    }
    // 添加 request 域名（如有需要）
    if (!pc.setting.requestDomain) {
        pc.setting.requestDomain = cdnDomain;
    } else if (pc.setting.requestDomain.indexOf(cdnDomain) === -1) {
        pc.setting.requestDomain += ',' + cdnDomain;
    }
    fs.writeFileSync(projectConfigPath, JSON.stringify(pc, null, 2));
    console.log('[3.5/7] CDN 域名已加入白名单 ✓');
    // 添加云函数根目录配置（排行榜云开发需要）
    if (!pc.cloudfunctionRoot) {
        pc.cloudfunctionRoot = 'cloudfunctions';
        fs.writeFileSync(projectConfigPath, JSON.stringify(pc, null, 2));
        console.log('[3.6/7] 云函数根目录已配置 ✓');
    } else {
        console.log('[3.6/7] 云函数根目录已存在 ✓');
    }
}

// 3.7 直接使用 Creator 构建出的 bootstrap bundle，并确保 gameEntry/bootstrap 是微信分包。
var stableBundleNames = debugLevelDataBundle
    ? ['internal', HOME_ASSETS_BUNDLE_NAME, BUNDLE_NAME].concat(SKIN_BUNDLE_NAMES, [LEVEL_DATA_BUNDLE_NAME, 'main'])
    : ['internal', HOME_ASSETS_BUNDLE_NAME, BUNDLE_NAME].concat(SKIN_BUNDLE_NAMES, ['main']);
stableBundleNames.forEach(function (bundleName) {
    ensureStableBundleFiles(resolveBuildPath(path.join('assets', bundleName)));
});
var bootstrapBundleDir = ensureBootstrapWechatSubpackage();
var bootstrapConfigPath = path.join(bootstrapBundleDir, 'config.json');
if (!fs.existsSync(bootstrapConfigPath)) {
    console.error('[3.7/7] 未找到 Creator 生成的 bootstrap bundle:', bootstrapConfigPath);
    process.exit(1);
}
try {
    var bootstrapConfig = JSON.parse(fs.readFileSync(bootstrapConfigPath, 'utf-8'));
    var bootstrapPathEntries = Object.values(bootstrapConfig.paths || {}).filter((value) => Array.isArray(value) && value.length > 0);
    var importVersions = bootstrapConfig.versions && Array.isArray(bootstrapConfig.versions.import) ? bootstrapConfig.versions.import.length / 2 : 0;
    var nativeVersions = bootstrapConfig.versions && Array.isArray(bootstrapConfig.versions.native) ? bootstrapConfig.versions.native.length / 2 : 0;
    console.log('[3.7/7] 已使用 Creator 生成的 gameEntry/bootstrap bundle ✓');
    console.log('         entries=' + bootstrapPathEntries.length + ', import=' + importVersions + ', native=' + nativeVersions);
} catch (e) {
    console.error('[3.7/7] 读取 bootstrap bundle 失败:', e.message || e);
    process.exit(1);
}

// 3.7b 创建 bootstrap bundle-scripts stub（引擎 require 需要此文件才能 loadBundle）
ensureBundleScriptStub(resolveRuntimeRoot(), BOOTSTRAP_BUNDLE_NAME, '[3.7b] bootstrap');

// 3.8 注册 bootstrap bundle 到 settings.json（否则 loadBundle 找不到它）
if (fs.existsSync(settingsPath)) {
    var settingsForBootstrap = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    var assetsSection = settingsForBootstrap.assets || {};
    var projBundles = Array.isArray(assetsSection.projectBundles) ? assetsSection.projectBundles.slice() : [];
    if (!projBundles.includes(BOOTSTRAP_BUNDLE_NAME)) {
        projBundles.push(BOOTSTRAP_BUNDLE_NAME);
        assetsSection.projectBundles = projBundles;
        settingsForBootstrap.assets = assetsSection;
        fs.writeFileSync(settingsPath, JSON.stringify(settingsForBootstrap, null, null));
        console.log('[3.8/7] bootstrap 已注册到 projectBundles ✓');
    } else {
        console.log('[3.8/7] bootstrap 已存在于 projectBundles ✓');
    }
}

// 4. homeAssets/gameAssets 必须是微信分包/本地 bundle，不能再作为 Cocos 远程资源包。
// Cocos CLI 有时不会把 custom bundle 自动落到 subpackages/，这里按生成适配器逻辑兜底迁移。
var homeAssetsSubpackageDir = ensureHomeAssetsWechatSubpackage();
if (!fs.existsSync(homeAssetsSubpackageDir)) {
    console.error('[4/6] 未找到 homeAssets 微信分包目录:', homeAssetsSubpackageDir);
    process.exit(1);
}
console.log('[4/6] homeAssets 微信分包已就绪 ✓');
var gameAssetsSubpackageDir = ensureGameAssetsWechatSubpackage();
if (!fs.existsSync(gameAssetsSubpackageDir)) {
    console.error('[4/6] 未找到 gameAssets 微信分包目录:', gameAssetsSubpackageDir);
    process.exit(1);
}
pruneReleaseSkinMirrorFromBundle(gameAssetsSubpackageDir);
console.log('[4/6] gameAssets 微信分包已就绪 ✓');
SKIN_BUNDLE_NAMES.forEach(function (bundleName) {
    var skinSubpackageDir = ensureNamedWechatSubpackage(bundleName);
    if (!fs.existsSync(skinSubpackageDir)) {
        console.error('[4/6] missing skin WeChat subpackage:', bundleName, skinSubpackageDir);
        process.exit(1);
    }
    console.log('[4/6] ' + bundleName + ' WeChat subpackage ready');
});
var levelDataSubpackageDir = ensureLevelDataWechatSubpackage();
if (debugLevelDataBundle && !fs.existsSync(levelDataSubpackageDir)) {
    console.error('[4.1/6] 未找到 levelData 微信分包目录:', levelDataSubpackageDir);
    process.exit(1);
}
if (debugLevelDataBundle) {
    console.log('[4.1/6] levelData debug 分包已就绪 ✓');
}
normalizeInternalBundleAsLocal(resolveRuntimeRoot(), resolveSettingsPath());

// 4.6 移除本地主包里的 resources bundle。
// 小游戏环境的音频、主题、纹理优先走 gameAssets/bootstrap；resources 是历史兜底包。
var localResourcesBundle = path.join(resolveRuntimeRoot(), 'assets', 'resources');
if (fs.existsSync(settingsPath)) {
    var settingsWithoutResources = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    var assetsWithoutResources = settingsWithoutResources.assets || {};
    ensureStartupPreloadBundles(assetsWithoutResources);
    assetsWithoutResources.preloadBundles = (assetsWithoutResources.preloadBundles || []).filter(function (item) {
        return (typeof item === 'string' ? item : item.bundle) !== 'resources';
    });
    assetsWithoutResources.projectBundles = (assetsWithoutResources.projectBundles || []).filter(function (bundleName) {
        return bundleName !== 'resources';
    });
    settingsWithoutResources.assets = assetsWithoutResources;
    fs.writeFileSync(settingsPath, JSON.stringify(settingsWithoutResources, null, null));
    console.log('[4.6/6] resources 已从本地主包配置移除 ✓');
}
if (fs.existsSync(localResourcesBundle)) {
    fs.rmSync(localResourcesBundle, { recursive: true, force: true });
    console.log('[4.6/6] 本地 resources bundle 已移除 ✓');
}

// 4.7 保留 Cocos 稳定名 bundle 入口。
// 关闭微信分离引擎后，运行时会同步 require assets/<bundle>/index.js。
// 即使 index.<hash>.js 内容相同，也不能删除稳定入口，否则微信开发者工具会报模块未定义。
console.log('[4.7/6] 已保留稳定 bundle index 入口，避免运行时 require 缺失 ✓');
ensureSpineWasmWechatSubpackage();

// 5. 验证主包大小
function dirSize(dir, exclude) {
    var size = 0;
    var items = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (exclude && exclude.indexOf(item.name) !== -1) continue;
        var full = path.join(dir, item.name);
        size += item.isDirectory() ? dirSize(full, exclude) : fs.statSync(full).size;
    }
    return size;
}

function getDeclaredSubpackageRootNames() {
    var gameJsonPath = resolveBuildPath('game.json');
    if (!fs.existsSync(gameJsonPath)) return [];
    var gameJson = JSON.parse(fs.readFileSync(gameJsonPath, 'utf-8'));
    var subpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [];
    var seen = {};
    return subpackages
        .map(function (item) { return String(item && item.root || '').replace(/^\/+|\/+$/g, '').split('/')[0]; })
        .filter(function (name) {
            if (!name || seen[name]) return false;
            seen[name] = true;
            return true;
        });
}

var subpackageExcludeNames = getDeclaredSubpackageRootNames();
var mainKB = Math.round(dirSize(buildPath, subpackageExcludeNames) / 1024);
console.log('[5/6] 微信主包: ' + mainKB + 'KB / ' + MAIN_PACKAGE_TARGET_KB + 'KB 目标');
if (subpackageExcludeNames.length > 0) {
    console.log('[5/6] 已按 game.json.subpackages 排除: ' + subpackageExcludeNames.join(', '));
}

if (mainKB > MAIN_PACKAGE_ERROR_KB) {
    console.error('[5/6] 超过 4MB 主包硬限制！');
    process.exit(1);
}
if (mainKB > MAIN_PACKAGE_TARGET_KB) {
    console.warn('[5/6] WARNING: 超过 3MB 主包目标，但未超过 4MB 硬限制');
}
console.log('[5/6] ✓ 主包大小正常');

// 6. CDN 上传已移至 npm run sync:cdn:wechat 独立处理；分项命令使用 :level_data / :skin_data。

// 7. 豆豆图集以 BootstrapBundle/Beans 为唯一真源，由 Cocos 构建自动包含
    // atlas PNG: assets/BootstrapBundle/Beans/bean-atlas.png
    // atlas JSON: assets/BootstrapBundle/Beans/bean-atlas-data.json
    console.log('[7/8] 豆豆图集已包含在 bootstrap bundle 中 ✓');

// 8. 复制开放数据域到构建输出（扁平结构，直接放构建根目录）
var openDataContextSrc = path.join(projectRoot, 'openDataContext');
var openDataContextDest = path.join(resolveRuntimeRoot(), 'openDataContext');
function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) return false;
    fs.mkdirSync(dest, { recursive: true });
    var entries = fs.readdirSync(src, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
        var srcPath = path.join(src, entries[i].name);
        var destPath = path.join(dest, entries[i].name);
        if (entries[i].isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
    return true;
}
if (copyDirSync(openDataContextSrc, openDataContextDest)) {
    var nestedOpenDataProjectConfig = path.join(openDataContextDest, 'project.config.json');
    if (fs.existsSync(nestedOpenDataProjectConfig)) {
        fs.unlinkSync(nestedOpenDataProjectConfig);
    }
    console.log('[8/8] 开放数据域已复制到构建输出 ✓');
    // 同时更新 project.config.json 添加 subContext
    if (fs.existsSync(projectConfigPath)) {
        var pc2 = JSON.parse(fs.readFileSync(projectConfigPath, 'utf-8'));
        if (!pc2.subContext) {
            pc2.subContext = 'openDataContext';
            fs.writeFileSync(projectConfigPath, JSON.stringify(pc2, null, 2));
            console.log('[8/8] subContext 已配置 ✓');
        }
    }
    // 更新 game.json 添加 openDataContext
    var gameJsonPath = resolveBuildPath('game.json');
    if (fs.existsSync(gameJsonPath)) {
        var gj = JSON.parse(fs.readFileSync(gameJsonPath, 'utf-8'));
        if (!gj.openDataContext) {
            gj.openDataContext = 'openDataContext';
            fs.writeFileSync(gameJsonPath, JSON.stringify(gj, null, 2));
            console.log('[8/8] game.json openDataContext 已配置 ✓');
        }
    }
} else {
    console.log('[8/8] 未找到 openDataContext 目录，跳过');
}

// 8. 调整微信项目配置（运行时放入 minigame/，cloudfunctions 保留在项目根目录）
// 最终结构：
//   build/wechatgame/
//     project.config.json
//     cloudfunctions/
//     minigame/
//       cocos-js/, assets/, src/, game.js, openDataContext/ ...
var projectConfigRootPath = path.join(buildPath, 'project.config.json');
var minigameRootPath = path.join(buildPath, 'minigame');
function movePathSync(src, dest) {
    if (!fs.existsSync(src) || src === dest) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
    }
    fs.renameSync(src, dest);
}

function ensureWechatSplashBackgroundAsset() {
    var names = ['background.jpg', 'background.jpeg', 'background.png'];
    var source = '';
    for (var i = 0; i < names.length; i++) {
        var rootCandidate = path.join(buildPath, names[i]);
        if (fs.existsSync(rootCandidate)) {
            source = rootCandidate;
            break;
        }
        var minigameCandidate = path.join(minigameRootPath, names[i]);
        if (fs.existsSync(minigameCandidate)) {
            source = minigameCandidate;
            break;
        }
    }
    if (!source) return;
    fs.mkdirSync(minigameRootPath, { recursive: true });
    var normalizedPath = path.join(minigameRootPath, 'background.jpg');
    if (source !== normalizedPath) {
        fs.copyFileSync(source, normalizedPath);
    }
    console.log('[8/8] 已补齐微信启动背景 minigame/background.jpg ✓');
}

var runtimeEntries = [
    'engine-adapter.js',
    'first-screen.js',
    'game.js',
    'game.json',
    'logo.png',
    'slogan.png',
    'web-adapter.js',
    'assets',
    'cocos-js',
    'src',
    'openDataContext',
];
for (var subpackageMoveIndex = 0; subpackageMoveIndex < subpackageExcludeNames.length; subpackageMoveIndex++) {
    if (runtimeEntries.indexOf(subpackageExcludeNames[subpackageMoveIndex]) === -1) {
        runtimeEntries.push(subpackageExcludeNames[subpackageMoveIndex]);
    }
}

var movedRuntimeCount = 0;
for (var i = 0; i < runtimeEntries.length; i++) {
    var entry = runtimeEntries[i];
    var rootEntryPath = path.join(buildPath, entry);
    var minigameEntryPath = path.join(minigameRootPath, entry);
    if (!fs.existsSync(rootEntryPath)) continue;
    fs.mkdirSync(minigameRootPath, { recursive: true });
    movePathSync(rootEntryPath, minigameEntryPath);
    movedRuntimeCount += 1;
}
var rootRuntimeFiles = fs.existsSync(buildPath) ? fs.readdirSync(buildPath) : [];
for (var runtimeFileIndex = 0; runtimeFileIndex < rootRuntimeFiles.length; runtimeFileIndex++) {
    var rootFileName = rootRuntimeFiles[runtimeFileIndex];
    if (!/^application(?:\.[0-9a-f]+)?\.js$/i.test(rootFileName)) continue;
    fs.mkdirSync(minigameRootPath, { recursive: true });
    movePathSync(path.join(buildPath, rootFileName), path.join(minigameRootPath, rootFileName));
    movedRuntimeCount += 1;
}

ensureWechatSplashBackgroundAsset();

if (fs.existsSync(projectConfigRootPath)) {
    var rootProjectConfig = JSON.parse(fs.readFileSync(projectConfigRootPath, 'utf-8'));
    normalizeWechatProjectConfig(rootProjectConfig);
    // 运行时代码放到 minigame/，避免 cloudfunctions 被小游戏运行时扫描
    rootProjectConfig.miniprogramRoot = 'minigame/';
    rootProjectConfig.cloudfunctionRoot = 'cloudfunctions';
    // 关闭 urlCheck（开发阶段）
    if (rootProjectConfig.setting && rootProjectConfig.setting.urlCheck) {
        rootProjectConfig.setting.urlCheck = false;
    }
    // Cocos/微信开发者工具的 subContext 是相对最终包体根目录，不能按 miniprogramRoot 二次相对。
    rootProjectConfig.subContext = 'minigame/openDataContext';
    fs.writeFileSync(projectConfigRootPath, JSON.stringify(rootProjectConfig, null, 2));
    console.log('[8/8] 已配置 project.config.json (minigame layout) ✓');

    // 更新 game.json 添加 openDataContext
    var gameJsonPath = path.join(minigameRootPath, 'game.json');
    if (fs.existsSync(gameJsonPath)) {
        var gj = JSON.parse(fs.readFileSync(gameJsonPath, 'utf-8'));
        gj.openDataContext = 'openDataContext';
        fs.writeFileSync(gameJsonPath, JSON.stringify(gj, null, 2));
        console.log('[8/8] minigame/game.json openDataContext 已配置 ✓');
    }
    var minigameOpenDataProjectConfig = path.join(minigameRootPath, 'openDataContext', 'project.config.json');
    if (fs.existsSync(minigameOpenDataProjectConfig)) {
        fs.unlinkSync(minigameOpenDataProjectConfig);
        console.log('[8/8] 已移除开放数据域嵌套 project.config.json ✓');
    }
}

if (movedRuntimeCount > 0) {
    console.log('[8/8] 已迁移运行时文件到 minigame/ (' + movedRuntimeCount + ' 项) ✓');
}

// 8.5 homeAssets/gameAssets 分包目录由微信 subpackages 承载。
ensureWechatSubpackageStableConfigs(minigameRootPath);
var minigameHomeAssetsSubpackageRoot = getBundleSubpackageRoot(minigameRootPath, HOME_ASSETS_BUNDLE_NAME);
var minigameHomeAssetsSubpackageDir = path.join(minigameRootPath, minigameHomeAssetsSubpackageRoot);
var minigameBootstrapSubpackageRoot = getBundleSubpackageRoot(minigameRootPath, BOOTSTRAP_BUNDLE_NAME);
var minigameBootstrapSubpackageDir = path.join(minigameRootPath, minigameBootstrapSubpackageRoot);
console.log(fs.existsSync(minigameBootstrapSubpackageDir)
    ? '[8.5/8] gameEntry/bootstrap 微信分包目录已保留: ' + minigameBootstrapSubpackageRoot + ' ✓'
    : '[8.5/8] gameEntry/bootstrap 微信分包目录缺失，交由验证脚本确认: ' + minigameBootstrapSubpackageRoot);
console.log(fs.existsSync(minigameHomeAssetsSubpackageDir)
    ? '[8.5/8] homeAssets 微信分包目录已保留: ' + minigameHomeAssetsSubpackageRoot + ' ✓'
    : '[8.5/8] homeAssets 微信分包目录缺失，交由验证脚本确认: ' + minigameHomeAssetsSubpackageRoot);
var minigameGameAssetsSubpackageRoot = getGameAssetsSubpackageRoot(minigameRootPath);
var minigameGameAssetsSubpackageDir = path.join(minigameRootPath, minigameGameAssetsSubpackageRoot);
console.log(fs.existsSync(minigameGameAssetsSubpackageDir)
    ? '[8.5/8] gameAssets 微信分包目录已保留: ' + minigameGameAssetsSubpackageRoot + ' ✓'
    : '[8.5/8] gameAssets 微信分包目录缺失，交由验证脚本确认: ' + minigameGameAssetsSubpackageRoot);
if (debugLevelDataBundle) {
    var minigameLevelDataSubpackageRoot = getBundleSubpackageRoot(minigameRootPath, LEVEL_DATA_BUNDLE_NAME);
    var minigameLevelDataSubpackageDir = path.join(minigameRootPath, minigameLevelDataSubpackageRoot);
    console.log(fs.existsSync(minigameLevelDataSubpackageDir)
        ? '[8.5/8] levelData debug 分包目录已保留: ' + minigameLevelDataSubpackageRoot + ' ✓'
        : '[8.5/8] levelData debug 分包目录缺失，交由验证脚本确认: ' + minigameLevelDataSubpackageRoot);
}
var gameCirclePluginEnabled = ensureWechatGameCirclePluginInGameJson(path.join(minigameRootPath, 'game.json'));
console.log(gameCirclePluginEnabled
    ? '[8.6/8] 游戏圈 MiniGameCommon 插件声明已配置 ✓'
    : '[8.6/8] 游戏圈 MiniGameCommon 插件声明已跳过，避免未授权插件阻塞启动 ✓');

// 9. 复制 SDK 外部脚本到 minigame/sdk/
var sdkSrc = path.join(projectRoot, 'sdk');
var sdkDest = path.join(minigameRootPath, 'sdk');
if (fs.existsSync(sdkSrc)) {
    if (fs.existsSync(sdkDest)) fs.rmSync(sdkDest, { recursive: true, force: true });
    fs.cpSync(sdkSrc, sdkDest, { recursive: true });
    console.log('[SDK] SDK 外部脚本已复制到 minigame/sdk/ ✓');
} else {
    console.warn('[SDK] 未找到 sdk/ 目录，跳过');
}
console.log('\n=== 完成 ===');
