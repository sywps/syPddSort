#!/usr/bin/env node

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const buildCommon = require('./minigame-build-common.js');

const projectRoot = path.resolve(__dirname, '..');
const buildPath = process.argv[2] || process.env.BUILD_PATH || path.join(projectRoot, 'build', 'bytedance-mini-game');
const buildMode = process.env.DOUYIN_BUILD_MODE || 'release';
const debugLevelDataBundle = buildMode === 'debug';
const levelDataCdnUrl = process.env.PDD_LEVEL_DATA_CDN_URL || 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_douyin/levels/';
const douyinCloudEnv = process.env.PDD_DOUYIN_CLOUD_ENV || '';
const douyinCloudPathPrefix = process.env.PDD_DOUYIN_CLOUD_PATH_PREFIX || '';

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function movePath(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.rmSync(dest, { recursive: true, force: true });
    try {
        fs.renameSync(src, dest);
    } catch (err) {
        fs.cpSync(src, dest, { recursive: true });
        fs.rmSync(src, { recursive: true, force: true });
    }
}

function runNode(script, args) {
    const result = childProcess.spawnSync(process.execPath, [path.join(projectRoot, script), ...args], {
        cwd: projectRoot,
        env: process.env,
        stdio: 'inherit',
    });
    if (result.error) fail(result.error.message);
    if (result.status !== 0) process.exit(result.status || 1);
}

function resolveRuntimeRoot(root) {
    if (fs.existsSync(path.join(root, 'game.json'))) return root;
    const minigame = path.join(root, 'minigame');
    if (fs.existsSync(path.join(minigame, 'game.json'))) return minigame;
    return root;
}

function findSettingsPath(runtimeRoot) {
    return buildCommon.findSettingsPath(runtimeRoot);
}

function normalizeSubpackageRoot(root) {
    return String(root || '').replace(/^\/+|\/+$/g, '');
}

function findBundleFile(bundleDir, baseName, extName) {
    const exact = path.join(bundleDir, baseName + '.' + extName);
    if (fs.existsSync(exact)) return exact;
    if (!fs.existsSync(bundleDir)) return exact;
    const pattern = new RegExp('^' + baseName + '(?:\\.[0-9a-f]+)?\\.' + extName + '$', 'i');
    const matches = fs.readdirSync(bundleDir)
        .filter((name) => pattern.test(name))
        .sort();
    return matches.length === 1 ? path.join(bundleDir, matches[0]) : exact;
}

function ensureStableBundleFiles(bundleDir) {
    if (!fs.existsSync(bundleDir)) return;
    const configPath = findBundleFile(bundleDir, 'config', 'json');
    const stableConfigPath = path.join(bundleDir, 'config.json');
    if (fs.existsSync(configPath) && configPath !== stableConfigPath && !fs.existsSync(stableConfigPath)) {
        fs.copyFileSync(configPath, stableConfigPath);
    }
    const indexPath = findBundleFile(bundleDir, 'index', 'js');
    const stableIndexPath = path.join(bundleDir, 'index.js');
    if (fs.existsSync(indexPath) && indexPath !== stableIndexPath && !fs.existsSync(stableIndexPath)) {
        fs.copyFileSync(indexPath, stableIndexPath);
    }
}

function ensureSubpackageGameJs(bundleDir, bundleName) {
    if (!fs.existsSync(bundleDir)) return;
    const indexPath = findBundleFile(bundleDir, 'index', 'js');
    const gameJsPath = path.join(bundleDir, 'game.js');
    const content = fs.existsSync(indexPath)
        ? fs.readFileSync(indexPath, 'utf8')
        : 'System.register("virtual:///prerequisite-imports/' + bundleName + '", [], function() { return { setters: [], execute: function() {} }; });\n';
    if (!fs.existsSync(gameJsPath) || fs.readFileSync(gameJsPath, 'utf8') !== content) {
        fs.writeFileSync(gameJsPath, content);
    }
}

function stripBundleConfigDeps(bundleDir, forbiddenDeps) {
    if (!fs.existsSync(bundleDir)) return;
    for (const name of fs.readdirSync(bundleDir).filter((item) => /^config(?:\.[0-9a-f]+)?\.json$/i.test(item))) {
        const configPath = path.join(bundleDir, name);
        const config = readJson(configPath);
        if (!Array.isArray(config.deps)) continue;
        const deps = config.deps.filter((dep) => !forbiddenDeps.includes(dep));
        if (deps.length !== config.deps.length) {
            config.deps = deps;
            writeJson(configPath, config);
        }
    }
}

function ensureBundleSubpackage(runtimeRoot, bundleName) {
    const gameJsonPath = path.join(runtimeRoot, 'game.json');
    if (!fs.existsSync(gameJsonPath)) fail('抖音包缺少 game.json: ' + gameJsonPath);
    const localBundleDir = path.join(runtimeRoot, 'assets', bundleName);
    const bundleDir = path.join(runtimeRoot, 'subpackages', bundleName);
    if (fs.existsSync(localBundleDir)) {
        movePath(localBundleDir, bundleDir);
        console.log('[douyin-postbuild] 已将 assets/' + bundleName + ' 迁移为抖音分包: subpackages/' + bundleName);
    }
    if (!fs.existsSync(bundleDir)) fail('抖音包缺少分包目录: ' + path.relative(runtimeRoot, bundleDir));
    ensureStableBundleFiles(bundleDir);
    if (bundleName === 'homeAssets') stripBundleConfigDeps(bundleDir, ['gameAssets']);
    ensureSubpackageGameJs(bundleDir, bundleName);
    const gameJson = readJson(gameJsonPath);
    const subpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages.slice() : [];
    const targetRoot = 'subpackages/' + bundleName + '/';
    let found = false;
    for (let i = 0; i < subpackages.length; i += 1) {
        const item = subpackages[i] || {};
        const root = normalizeSubpackageRoot(item.root);
        if (item.name === bundleName || root === bundleName || root === 'subpackages/' + bundleName) {
            item.name = bundleName;
            item.root = targetRoot;
            subpackages[i] = item;
            found = true;
        }
    }
    if (!found) subpackages.push({ name: bundleName, root: targetRoot });
    gameJson.subpackages = subpackages;
    writeJson(gameJsonPath, gameJson);
    return bundleDir;
}

function removeReleaseLevelDataSubpackage(runtimeRoot) {
    if (debugLevelDataBundle) return;
    const gameJsonPath = path.join(runtimeRoot, 'game.json');
    const gameJson = readJson(gameJsonPath);
    const subpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [];
    const filtered = subpackages.filter((item) => {
        const root = normalizeSubpackageRoot(item && item.root);
        return item?.name !== 'levelData' && root !== 'levelData' && root !== 'subpackages/levelData';
    });
    if (filtered.length !== subpackages.length) {
        gameJson.subpackages = filtered;
        writeJson(gameJsonPath, gameJson);
    }
    fs.rmSync(path.join(runtimeRoot, 'subpackages', 'levelData'), { recursive: true, force: true });
}

function getPreloadBundleName(item) {
    return typeof item === 'string' ? item : item && item.bundle;
}

function ensureStartupPreloadBundles(assets) {
    const preloadBundles = Array.isArray(assets.preloadBundles) ? assets.preloadBundles.slice() : [];
    const requiredOrder = ['bootstrap', 'main'];
    const byName = new Map();
    for (const item of preloadBundles) {
        const name = getPreloadBundleName(item);
        if (name && !byName.has(name)) byName.set(name, item);
    }
    const ordered = requiredOrder.map((name) => byName.get(name) || { bundle: name });
    for (const item of preloadBundles) {
        const name = getPreloadBundleName(item);
        if (
            requiredOrder.includes(name)
            || name === 'homeAssets'
            || name === 'gameAssets'
            || name === 'levelData'
        ) continue;
        ordered.push(item);
    }
    assets.preloadBundles = ordered;
}

function ensureDouyinRuntimeMarker(runtimeRoot) {
    const gameJsPath = path.join(runtimeRoot, 'game.js');
    if (!fs.existsSync(gameJsPath)) return;
    let content = fs.readFileSync(gameJsPath, 'utf8');
    const platformMarker = 'globalThis.__PDD_BUILD_PLATFORM__="douyin";';
    const buildMarker = 'globalThis.__PDD_DOUYIN_BUILD__=true;';
    const modeMarker = 'globalThis.__PDD_DOUYIN_BUILD_MODE__=' + JSON.stringify(buildMode) + ';';
    const levelDataCdnMarker = 'globalThis.__PDD_LEVEL_DATA_CDN_URL__=' + JSON.stringify(levelDataCdnUrl) + ';';
    const cloudEnvMarker = 'globalThis.__PDD_DOUYIN_CLOUD_ENV__=' + JSON.stringify(douyinCloudEnv) + ';';
    const cloudPathPrefixMarker = 'globalThis.__PDD_DOUYIN_CLOUD_PATH_PREFIX__=' + JSON.stringify(douyinCloudPathPrefix) + ';';
    const replacements = [
        [/globalThis\.__PDD_BUILD_PLATFORM__="[^"]*";/g, platformMarker],
        [/globalThis\.__PDD_DOUYIN_BUILD_MODE__="[^"]*";/g, modeMarker],
        [/globalThis\.__PDD_LEVEL_DATA_CDN_URL__="[^"]*";/g, levelDataCdnMarker],
        [/globalThis\.__PDD_DOUYIN_CLOUD_ENV__="[^"]*";/g, cloudEnvMarker],
        [/globalThis\.__PDD_DOUYIN_CLOUD_PATH_PREFIX__="[^"]*";/g, cloudPathPrefixMarker],
    ];
    for (const [pattern, value] of replacements) {
        content = pattern.test(content) ? content.replace(pattern, value) : content;
    }
    const missingLines = [];
    for (const line of [platformMarker, buildMarker, modeMarker, levelDataCdnMarker, cloudEnvMarker, cloudPathPrefixMarker]) {
        if (!content.includes(line)) missingLines.push(line);
    }
    if (missingLines.length) content = missingLines.join('\n') + '\n' + content;
    fs.writeFileSync(gameJsPath, content);
}

function normalizeSettings(runtimeRoot) {
    const settingsPath = findSettingsPath(runtimeRoot);
    if (!settingsPath || !fs.existsSync(settingsPath)) fail('抖音包缺少 settings.json');
    const settings = readJson(settingsPath);
    const assets = settings.assets || {};
    const bundleNames = debugLevelDataBundle
        ? ['bootstrap', 'homeAssets', 'gameAssets', 'levelData']
        : ['bootstrap', 'homeAssets', 'gameAssets'];
    const projectBundles = (Array.isArray(assets.projectBundles) ? assets.projectBundles.slice() : [])
        .filter((name) => debugLevelDataBundle || name !== 'levelData');
    for (const bundleName of bundleNames) {
        if (!projectBundles.includes(bundleName)) projectBundles.push(bundleName);
    }
    assets.projectBundles = projectBundles;
    const subpackages = (Array.isArray(assets.subpackages) ? assets.subpackages.slice() : [])
        .filter((name) => debugLevelDataBundle || name !== 'levelData');
    for (const bundleName of bundleNames.filter((name) => name !== 'bootstrap')) {
        if (!subpackages.includes(bundleName)) subpackages.push(bundleName);
    }
    assets.subpackages = subpackages;
    assets.remoteBundles = (Array.isArray(assets.remoteBundles) ? assets.remoteBundles : [])
        .filter((name) => name !== 'homeAssets' && name !== 'gameAssets' && name !== 'levelData');
    ensureStartupPreloadBundles(assets);
    settings.assets = assets;
    writeJson(settingsPath, settings);
}

const runtimeRoot = resolveRuntimeRoot(buildPath);
if (!fs.existsSync(runtimeRoot)) fail('抖音构建目录不存在: ' + runtimeRoot);

ensureBundleSubpackage(runtimeRoot, 'homeAssets');
ensureBundleSubpackage(runtimeRoot, 'gameAssets');
if (debugLevelDataBundle) ensureBundleSubpackage(runtimeRoot, 'levelData');
removeReleaseLevelDataSubpackage(runtimeRoot);
normalizeSettings(runtimeRoot);
ensureDouyinRuntimeMarker(runtimeRoot);
runNode('scripts/postbuild-minigame-bundles.js', [runtimeRoot]);

console.log('抖音后处理完成: ' + runtimeRoot);
