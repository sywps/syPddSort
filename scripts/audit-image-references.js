#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const projectRoot = path.resolve(__dirname, '..');
const assetsRoot = path.join(projectRoot, 'assets');
const skinsConfigPath = path.join(projectRoot, 'assets', 'GameAssetsBundle', 'Skins', 'skins.json');
const bundleRoots = {
    bootstrap: path.join(projectRoot, 'assets', 'BootstrapBundle'),
    gameAssets: path.join(projectRoot, 'assets', 'GameAssetsBundle'),
    levelData: path.join(projectRoot, 'assets', 'LevelData'),
};
const imageExtensions = ['.png', '.jpg', '.jpeg'];
const allowedLevelDataBackgroundSizes = new Set(['750x1750', '750x1800']);
const forbiddenUuidRefs = new Map([
    ['9308414b-e823-491c-95f1-19c9b3d4ac2a@f9941', 'old inactive settlement banner sprite frame'],
    ['8e0072cb-bfac-42ab-8eec-881b7bf16dfb', 'unused 1.1MB ChatGPT UI image'],
]);

const errors = [];

function toProjectPath(filePath) {
    return path.relative(projectRoot, filePath).split(path.sep).join('/');
}

function walk(dirPath, predicate, out = []) {
    if (!fs.existsSync(dirPath)) return out;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, predicate, out);
        } else if (!predicate || predicate(fullPath)) {
            out.push(fullPath);
        }
    }
    return out;
}

function findImageAsset(bundleName, assetKey) {
    const root = bundleRoots[bundleName];
    if (!root || typeof assetKey !== 'string' || !assetKey) return null;
    for (const ext of imageExtensions) {
        const candidate = path.join(root, `${assetKey}${ext}`);
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

function requireImageMeta(imagePath, context) {
    if (!fs.existsSync(`${imagePath}.meta`)) {
        errors.push(`${context}: missing meta for ${toProjectPath(imagePath)}`);
    }
}

function readPngSize(imagePath, context) {
    try {
        const png = PNG.sync.read(fs.readFileSync(imagePath));
        return { width: png.width, height: png.height };
    } catch (error) {
        errors.push(`${context}: failed to read PNG size for ${toProjectPath(imagePath)}: ${error.message}`);
        return null;
    }
}

function auditImageMetaPairs() {
    for (const imagePath of walk(assetsRoot, (filePath) => imageExtensions.includes(path.extname(filePath).toLowerCase()))) {
        requireImageMeta(imagePath, 'image-meta');
    }
    for (const metaPath of walk(assetsRoot, (filePath) => imageExtensions.some((ext) => filePath.toLowerCase().endsWith(`${ext}.meta`)))) {
        const imagePath = metaPath.slice(0, -'.meta'.length);
        if (!fs.existsSync(imagePath)) {
            errors.push(`image-meta: stale meta without image ${toProjectPath(metaPath)}`);
        }
    }
}

function auditSkinsConfig() {
    if (!fs.existsSync(skinsConfigPath)) {
        errors.push(`skins: missing ${toProjectPath(skinsConfigPath)}`);
        return;
    }
    const config = JSON.parse(fs.readFileSync(skinsConfigPath, 'utf8'));
    if (!Array.isArray(config.skins)) {
        errors.push('skins: skins.json missing skins array');
        return;
    }
    const configuredIconKeys = new Set();
    const enabledBackgroundSkins = config.skins.filter((skin) => skin && skin.enabled !== false && skin.type === 'background');
    for (const skin of enabledBackgroundSkins) {
        const label = `skin ${skin.code || skin.id}`;
        const iconPath = findImageAsset(skin.iconBundle, skin.iconKey);
        if (!iconPath) {
            errors.push(`${label}: missing icon ${skin.iconBundle || '?'}:${skin.iconKey || '?'}`);
        } else {
            configuredIconKeys.add(`${skin.iconBundle}:${skin.iconKey}`);
            requireImageMeta(iconPath, label);
        }

        const assetPath = findImageAsset(skin.assetBundle, skin.assetKey);
        if (!assetPath) {
            errors.push(`${label}: missing background ${skin.assetBundle || '?'}:${skin.assetKey || '?'}`);
            continue;
        }
        requireImageMeta(assetPath, label);
        if (skin.assetBundle === 'levelData') {
            if (path.extname(assetPath).toLowerCase() !== '.png') {
                errors.push(`${label}: levelData background must be PNG, got ${toProjectPath(assetPath)}`);
                continue;
            }
            const size = readPngSize(assetPath, label);
            const sizeKey = size ? `${size.width}x${size.height}` : '';
            if (size && !allowedLevelDataBackgroundSizes.has(sizeKey)) {
                errors.push(`${label}: levelData background size ${sizeKey} is not allowed at ${toProjectPath(assetPath)}; expected one of ${[...allowedLevelDataBackgroundSizes].join(', ')}`);
            }
        }
    }

    const iconDir = path.join(projectRoot, 'assets', 'GameAssetsBundle', 'Skins', 'Icons');
    for (const iconPath of walk(iconDir, (filePath) => imageExtensions.includes(path.extname(filePath).toLowerCase()))) {
        const base = path.basename(iconPath, path.extname(iconPath));
        if (!/^bg_\d+$/.test(base)) continue;
        const iconKey = `gameAssets:Skins/Icons/${base}`;
        if (!configuredIconKeys.has(iconKey)) {
            errors.push(`skins: unconfigured skin icon ${toProjectPath(iconPath)}; add a complete skin with background or delete the icon`);
        }
    }
}

function auditForbiddenReferences() {
    const searchableExtensions = new Set(['.scene', '.prefab', '.json', '.ts', '.js']);
    const files = walk(assetsRoot, (filePath) => searchableExtensions.has(path.extname(filePath)));
    for (const filePath of files) {
        const text = fs.readFileSync(filePath, 'utf8');
        for (const [uuid, reason] of forbiddenUuidRefs) {
            if (text.includes(uuid)) {
                errors.push(`forbidden-ref: ${reason} still referenced in ${toProjectPath(filePath)}`);
            }
        }
    }
}

function main() {
    auditImageMetaPairs();
    auditSkinsConfig();
    auditForbiddenReferences();
    if (errors.length > 0) {
        console.error(`[images:audit] failed with ${errors.length} issue(s):`);
        for (const error of errors) {
            console.error(`- ${error}`);
        }
        process.exit(1);
    }
    console.log('[images:audit] OK: image meta pairs, skin assets, and removed-resource references are valid.');
}

main();
