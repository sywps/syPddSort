#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const runtimeRoot = process.argv[2] || path.join(projectRoot, 'build', 'wechatgame', 'minigame');
const bootstrapSourceRoot = path.join(projectRoot, 'assets', 'BootstrapBundle');
const libraryRoot = path.join(projectRoot, 'library');
const bootstrapBundleName = 'bootstrap';
const bootstrapImageAllowlist = new Set([
	'Beans/bean-atlas',
	'GameUI/bg_game_pindd',
	'GameUI/loading_cover_firstplay',
	'GameUI/slot_groove_b_ui',
	'GameUI/slot_panel_shell_b_ui',
	'GameUI/slot_row_lock_dash_ui',
	'GameUI/slot_row_lock_mask_ui',
	'GameUI/倒计时',
	'GameUI/guide_hand',
	'GameUI/popup_guide_highlight_ring',
	'GameUI/popup_ad_play_icon',
	'GameUI/popup_primary_button',
	'GameUI/popup_gameplay_tool_slot_plate',
	'GameUI/popup_tool_add_badge',
	'GameUI/popup_tool_count_badge',
	'GameUI/popup_tool_wand_icon',
	'GameUI/popup_tool_brush_icon',
	'GameUI/popup_tool_magnet_icon',
	'GameUI/progress_fill',
	'GameUI/solid_white',
	'GameUI/设置',
	'GameUI/进度条',
	'UI/Textures/scene_transition_circle_crisp',
	'UI/Textures/scene_transition_logo',
	'UI/Textures/scene_transition_solid',
]);

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

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data));
}

function normalizeSlashes(filePath) {
    return filePath.split(path.sep).join('/');
}

function readGameJson() {
    const gameJsonPath = path.join(runtimeRoot, 'game.json');
    if (!fs.existsSync(gameJsonPath)) return null;
    return readJson(gameJsonPath);
}

function resolveBootstrapOutputRoot() {
    const localRoot = path.join(runtimeRoot, 'assets', bootstrapBundleName);
    if (fs.existsSync(localRoot)) return localRoot;
    const gameJson = readGameJson();
    const subpackages = Array.isArray(gameJson?.subpackages) ? gameJson.subpackages : [];
    for (const item of subpackages) {
        const root = String(item?.root || '').replace(/^\/+|\/+$/g, '');
        if (item?.name === bootstrapBundleName || root === bootstrapBundleName || root === `subpackages/${bootstrapBundleName}`) {
            return path.join(runtimeRoot, root || `subpackages/${bootstrapBundleName}`);
        }
    }
    return path.join(runtimeRoot, 'subpackages', bootstrapBundleName);
}

const bootstrapOutputRoot = resolveBootstrapOutputRoot();

function walkImages(dir) {
    if (!fs.existsSync(dir)) return [];
    const result = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
            result.push(...walkImages(full));
        } else if (/\.(png|jpe?g)$/i.test(item.name)) {
            result.push(full);
        }
    }
    return result;
}

function typeNameForImporter(importer) {
    if (importer === 'image') return 'cc.ImageAsset';
    if (importer === 'texture') return 'cc.Texture2D';
    if (importer === 'sprite-frame') return 'cc.SpriteFrame';
    return '';
}

function importPathForUuid(uuid) {
    return path.join(libraryRoot, uuid.slice(0, 2), `${uuid}.json`);
}

function nativePathForUuid(uuid) {
    const nativeDir = path.join(libraryRoot, uuid.slice(0, 2));
    if (!fs.existsSync(nativeDir)) return '';
    const nativeFile = fs.readdirSync(nativeDir).find((fileName) => fileName.startsWith(`${uuid}.`) && !fileName.endsWith('.json'));
    return nativeFile ? path.join(nativeDir, nativeFile) : '';
}

function copyImport(uuid) {
    const src = importPathForUuid(uuid);
    if (!fs.existsSync(src)) return false;
    const dest = path.join(bootstrapOutputRoot, 'import', uuid.slice(0, 2), `${uuid}.json`);
    if (fs.existsSync(dest)) return false;
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    return true;
}

function copyNative(uuid) {
    const src = nativePathForUuid(uuid);
    if (!src) fail('BootstrapBundle 图片 native 缓存不存在: ' + uuid);
    const dest = path.join(bootstrapOutputRoot, 'native', uuid.slice(0, 2), path.basename(src));
    if (fs.existsSync(dest)) return;
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

function ensureType(config, typeName) {
    if (!Array.isArray(config.types)) config.types = [];
    let index = config.types.indexOf(typeName);
    if (index < 0) {
        index = config.types.length;
        config.types.push(typeName);
    }
    return index;
}

function findPathEntries(config) {
    const entries = new Map();
    for (const [key, value] of Object.entries(config.paths || {})) {
        if (Array.isArray(value) && value[0]) entries.set(value[0], key);
    }
    return entries;
}

function appendAssetEntry(config, uuid, assetPath, typeName) {
    if (!Array.isArray(config.uuids)) config.uuids = [];
    if (!config.paths || typeof config.paths !== 'object') config.paths = {};
    const existingPaths = findPathEntries(config);
    if (existingPaths.has(assetPath)) return false;
    const typeIndex = ensureType(config, typeName);
    const index = config.uuids.length;
    config.uuids.push(uuid);
    config.paths[index] = [assetPath, typeIndex, 1];
    return true;
}

function findMissingAssets(configs, assets) {
    return assets.filter((asset) => configs.some((config) => !findPathEntries(config).has(asset.assetPath)));
}

function collectAssets() {
    const assets = [];
    for (const imagePath of walkImages(bootstrapSourceRoot).sort()) {
        const metaPath = `${imagePath}.meta`;
        if (!fs.existsSync(metaPath)) fail('BootstrapBundle 图片 meta 不存在: ' + metaPath);
        const meta = readJson(metaPath);
        const baseRel = normalizeSlashes(path.relative(bootstrapSourceRoot, imagePath)).replace(/\.(png|jpe?g)$/i, '');
        if (!bootstrapImageAllowlist.has(baseRel)) {
            fail('BootstrapBundle 图片不在主包白名单内: ' + baseRel);
        }
        if (!meta.uuid) fail('BootstrapBundle 图片 meta 缺少 uuid: ' + metaPath);
        assets.push({
            uuid: meta.uuid,
            assetPath: baseRel,
            typeName: typeNameForImporter(meta.importer),
            native: true,
            optionalImport: true,
        });
    }
    return assets;
}

if (!fs.existsSync(bootstrapOutputRoot)) fail('未找到 bootstrap bundle: ' + bootstrapOutputRoot);
const configPaths = fs.readdirSync(bootstrapOutputRoot)
    .filter((name) => /^config(?:\.[0-9a-f]+)?\.json$/i.test(name))
    .map((name) => path.join(bootstrapOutputRoot, name))
    .sort();
if (configPaths.length === 0) fail('bootstrap config 不存在: ' + bootstrapOutputRoot);

const assets = collectAssets();
const configRecords = configPaths.map((configPath) => ({
    configPath,
    config: readJson(configPath),
}));
const missingAssets = findMissingAssets(configRecords.map((record) => record.config), assets);
const copiedImports = new Set();
const copiedNative = new Set();
for (const asset of missingAssets) {
    if (!copiedImports.has(asset.uuid)) {
        if (copyImport(asset.uuid)) copiedImports.add(asset.uuid);
        else if (!asset.optionalImport) fail('BootstrapBundle 图片导入缓存不存在: ' + importPathForUuid(asset.uuid));
    }
    if (asset.native && !copiedNative.has(asset.uuid)) {
        copyNative(asset.uuid);
        copiedNative.add(asset.uuid);
    }
}

let addedEntries = 0;
for (const { configPath, config } of configRecords) {
    for (const asset of assets) {
        if (appendAssetEntry(config, asset.uuid, asset.assetPath, asset.typeName)) addedEntries += 1;
    }
    writeJson(configPath, config);
}

console.log(`[bootstrap] dynamic assets patched: images=${copiedNative.size}, imports=${copiedImports.size}, configEntries=${addedEntries}, configs=${configPaths.length}`);
