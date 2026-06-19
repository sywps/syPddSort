#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
    collectSourceBundleArtifacts,
    findNativeArtifact,
    importArtifactPath,
} = require('./bundle-artifact-utils.js');

const projectRoot = path.resolve(__dirname, '..');
const runtimeRoot = process.argv[2] || path.join(projectRoot, 'build', 'wechatgame', 'minigame');
const bundleName = process.argv[3] || 'homeAssets';
const sourceBundleDirByName = {
    homeAssets: 'HomeAssetsBundle',
    gameAssets: 'GameAssetsBundle',
};
const sourceBundleDirName = sourceBundleDirByName[bundleName] || '';
const sourceRoot = sourceBundleDirName ? path.join(projectRoot, 'assets', sourceBundleDirName) : '';
const libraryRoot = path.join(projectRoot, 'library');
const assetDbRoot = path.join(projectRoot, 'temp', 'asset-db', 'assets');

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeSubpackageRoot(root) {
    return String(root || '').replace(/^\/+|\/+$/g, '');
}

function findSubpackageRoot(gameJson, targetBundleName) {
    const subpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [];
    for (const item of subpackages) {
        const root = normalizeSubpackageRoot(item && item.root);
        if ((item && item.name === targetBundleName) || root === targetBundleName || root === 'subpackages/' + targetBundleName) {
            return root || 'subpackages/' + targetBundleName;
        }
    }
    return '';
}

function resolveBundleDir() {
    const localDir = path.join(runtimeRoot, 'assets', bundleName);
    if (fs.existsSync(localDir)) return localDir;
    const gameJsonPath = path.join(runtimeRoot, 'game.json');
    const gameJson = fs.existsSync(gameJsonPath) ? readJson(gameJsonPath) : {};
    const subpackageRoot = findSubpackageRoot(gameJson, bundleName);
    if (subpackageRoot) return path.join(runtimeRoot, subpackageRoot);
    return path.join(runtimeRoot, 'subpackages', bundleName);
}

function assetDbImportPath(uuid) {
    const assetDir = path.join(assetDbRoot, uuid.slice(0, 2), uuid);
    if (!fs.existsSync(assetDir)) return '';
    const buildDirs = fs.readdirSync(assetDir, { withFileTypes: true })
        .filter((item) => item.isDirectory() && /^build/i.test(item.name))
        .map((item) => path.join(assetDir, item.name))
        .sort()
        .reverse();
    for (const buildDir of buildDirs) {
        for (const fileName of ['release.json', 'debug.json']) {
            const candidate = path.join(buildDir, fileName);
            if (fs.existsSync(candidate)) return candidate;
        }
        const fallback = fs.readdirSync(buildDir)
            .filter((name) => /\.json$/i.test(name))
            .sort()[0];
        if (fallback) return path.join(buildDir, fallback);
    }
    return '';
}

function libraryImportPath(uuid) {
    const importDir = path.join(libraryRoot, uuid.slice(0, 2));
    if (!fs.existsSync(importDir)) return '';
    const fileName = fs.readdirSync(importDir).find((name) => {
        if (name === `${uuid}.json`) return true;
        if (name === `${uuid}.scene` || name === `${uuid}.prefab`) return true;
        if (!name.startsWith(`${uuid}.`)) return false;
        return /\.json$/i.test(name);
    });
    return fileName ? path.join(importDir, fileName) : '';
}

function libraryNativePath(uuid) {
    const nativeDir = path.join(libraryRoot, uuid.slice(0, 2));
    if (!fs.existsSync(nativeDir)) return '';
    const fileName = fs.readdirSync(nativeDir).find((name) => name.startsWith(`${uuid}.`) && !name.endsWith('.json'));
    return fileName ? path.join(nativeDir, fileName) : '';
}

function copyFileIfChanged(src, dest) {
    ensureDir(path.dirname(dest));
    if (fs.existsSync(dest)) {
        const srcStat = fs.statSync(src);
        const destStat = fs.statSync(dest);
        if (srcStat.size === destStat.size && fs.readFileSync(src).equals(fs.readFileSync(dest))) {
            return false;
        }
    }
    fs.copyFileSync(src, dest);
    return true;
}

function copyImport(bundleDir, uuid) {
    const dest = importArtifactPath(bundleDir, uuid, 'import');
    if (fs.existsSync(dest)) return 'exists';
    const src = assetDbImportPath(uuid) || libraryImportPath(uuid);
    if (!src) return 'missing';
    return copyFileIfChanged(src, dest) ? 'copied' : 'exists';
}

function copyNative(bundleDir, uuid) {
    const src = libraryNativePath(uuid);
    if (!src) fail('HomeAssetsBundle native 缓存不存在: ' + uuid);
    const existing = findNativeArtifact(bundleDir, uuid, 'native');
    if (existing) return false;
    const dest = path.join(bundleDir, 'native', uuid.slice(0, 2), path.basename(src));
    return copyFileIfChanged(src, dest);
}

const bundleDir = resolveBundleDir();
if (!sourceRoot) fail('不支持的 bundle: ' + bundleName);
if (!fs.existsSync(bundleDir)) fail('未找到 ' + bundleName + ' 分包目录: ' + bundleDir);

const artifacts = collectSourceBundleArtifacts(sourceRoot, sourceBundleDirName, fail);
const copiedImports = new Set();
const copiedNative = new Set();
for (const artifact of artifacts) {
    const importStatus = copyImport(bundleDir, artifact.uuid);
    if (importStatus === 'copied') copiedImports.add(artifact.uuid);
    else if (importStatus === 'missing' && !artifact.optionalImport) fail(sourceBundleDirName + ' runtime import 缓存不存在: ' + artifact.uuid);
    if (artifact.native && copyNative(bundleDir, artifact.uuid)) copiedNative.add(artifact.uuid);
}

console.log(`[${bundleName}] artifacts patched: imports=${copiedImports.size}, native=${copiedNative.size}, checked=${artifacts.length}`);
