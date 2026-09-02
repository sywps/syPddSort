#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const runtimeRoot = process.argv[2] || path.join(projectRoot, 'build', 'wechatgame', 'minigame');
const bootstrapSourceRoot = path.join(projectRoot, 'assets', 'BootstrapBundle');
const libraryRoot = path.join(projectRoot, 'library');
const bootstrapBundleName = 'bootstrap';
const gameAssetsBundleName = 'gameAssets';
const homeAssetsBundleName = 'homeAssets';
const bootstrapImageAllowlist = new Set([
	'Beans/bean-atlas',
	'GameUI/gameplay_skill_slot_background',
	'GameUI/RainbowConveyor/compact_conveyor_track',
	'GameUI/RainbowConveyor/conveyor_0',
	'GameUI/RainbowConveyor/conveyor_1',
	'GameUI/RainbowConveyor/conveyor_2',
	'GameUI/RainbowConveyor/conveyor_3',
	'GameUI/RainbowConveyor/conveyor_4',
	'GameUI/RainbowConveyor/conveyor_5',
	'GameUI/RainbowConveyor/conveyor_7a',
	'GameUI/RainbowConveyor/conveyor_7b',
	'GameUI/RainbowConveyor/exit_1',
	'GameUI/RainbowConveyor/exit_1_2',
	'GameUI/RainbowConveyor/exit_1_3',
	'GameUI/RainbowConveyor/exit_1_4',
	'GameUI/RainbowConveyor/exit_2',
	'GameUI/RainbowConveyor/gameProp_2007',
	'GameUI/RainbowConveyor/wf_base_14',
	'GameUI/bg_game_pindd',
	'GameUI/board_zoom_fill',
	'GameUI/board_zoom_locate',
	'GameUI/board_zoom_minus',
	'GameUI/board_zoom_plus',
	'GameUI/board_zoom_thumb',
	'GameUI/board_zoom_track',
	'GameUI/block_bright_pindd',
	'GameUI/倒计时',
	'GameUI/guide_hand',
	'GameUI/guide_bubble_frame',
	'GameUI/guide_prompt_button',
	'GameUI/loading_cover',
	'GameUI/pdpx_eff_Mask_01',
	'GameUI/pdpx_eff_Star_01',
	'GameUI/pdpx_eff_Trail_02',
	'GameUI/pch_speed_inactive',
	'GameUI/popup_ad_play_icon',
	'GameUI/popup_primary_button',
	'GameUI/popup_tool_add_badge',
	'GameUI/popup_tool_count_badge',
	'GameUI/popup_tool_wand_icon',
	'GameUI/popup_tool_freeze_icon',
	'GameUI/popup_tool_brush_icon',
	'GameUI/popup_tool_magnet_icon',
	'GameUI/progress_fill',
	'GameUI/solid_white',
	'GameUI/toast_bubble_background',
	'GameUI/设置',
	'GameUI/进度条',
]);
const criticalGameAssetsPathMap = new Map([
    ['Audio/bgm', 'Audio/bgm'],
    ['Audio/pindd/bean_pickup', 'Audio/pindd/bean_pickup'],
    ['Audio/pindd/bean_correct_place', 'Audio/pindd/bean_correct_place'],
    ['Audio/pindd/bean_return_settle', 'Audio/pindd/bean_return_settle'],
    ['Audio/pindd/bean_fly', 'Audio/pindd/bean_fly'],
    ['Audio/pindd/error', 'Audio/pindd/error'],
    ['Audio/ui', 'Audio/ui'],
    ['Audio/tick', 'Audio/tick'],
    ['Audio/pindd/shelf', 'Audio/pindd/shelf'],
    ['Audio/win', 'Audio/win'],
    ['Audio/lose', 'Audio/lose'],
    ['Audio/winColor', 'Audio/winColor'],
    ['Audio/winSettlement', 'Audio/winSettlement'],
    ['UI/Prefabs/Panels/WinPanel', 'UI/Prefabs/Panels/WinPanel'],
    ['UI/Prefabs/Panels/RevivePanelV2', 'UI/Prefabs/Panels/RevivePanelV2'],
    ['UI/Prefabs/Panels/BufferFullRevivePanelV2', 'UI/Prefabs/Panels/BufferFullRevivePanelV2'],
    ['UI/Prefabs/Panels/LosePanel', 'UI/Prefabs/Panels/LosePanel'],
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

function resolveBundleOutputRoot(bundleName) {
    const localRoot = path.join(runtimeRoot, 'assets', bundleName);
    if (fs.existsSync(localRoot)) return localRoot;
    const gameJson = readGameJson();
    const subpackages = Array.isArray(gameJson?.subpackages) ? gameJson.subpackages : [];
    for (const item of subpackages) {
        const root = String(item?.root || '').replace(/^\/+|\/+$/g, '');
        if (item?.name === bundleName || root === bundleName || root === `subpackages/${bundleName}`) {
            return path.join(runtimeRoot, root || `subpackages/${bundleName}`);
        }
    }
    return path.join(runtimeRoot, 'subpackages', bundleName);
}

const bootstrapOutputRoot = resolveBootstrapOutputRoot();

function decodeUuid(base64) {
    const separator = '@';
    const base = base64.split(separator)[0];
    if (base.length !== 22) {
        return base64;
    }

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const values = new Array(123).fill(0);
    for (let i = 0; i < chars.length; i += 1) {
        values[chars.charCodeAt(i)] = i;
    }

    const hexChars = '0123456789abcdef'.split('');
    const template = ['', '', '', '', '', '', '', '', '-', '', '', '', '', '-', '', '', '', '', '-', '', '', '', '', '-', '', '', '', '', '', '', '', '', '', '', '', ''];
    const indices = [];
    for (let i = 0; i < template.length; i += 1) {
        if (template[i] !== '-') {
            indices.push(i);
        }
    }

    template[0] = base[0];
    template[1] = base[1];
    for (let i = 2, j = 2; i < 22; i += 2) {
        const lhs = values[base64.charCodeAt(i)];
        const rhs = values[base64.charCodeAt(i + 1)];
        template[indices[j++]] = hexChars[lhs >> 2];
        template[indices[j++]] = hexChars[((lhs & 3) << 2) | (rhs >> 4)];
        template[indices[j++]] = hexChars[rhs & 0xF];
    }

    return base64.replace(base, template.join(''));
}

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

function findLibraryArtifactsByDecodedUuid(decodedUuid, kind) {
    const dir = path.join(libraryRoot, decodedUuid.slice(0, 2));
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter((fileName) => {
            if (!fileName.startsWith(decodedUuid)) return false;
            return kind === 'import' ? fileName.endsWith('.json') : !fileName.endsWith('.json');
        })
        .sort((a, b) => a.length - b.length || a.localeCompare(b))
        .map((fileName) => path.join(dir, fileName));
}

function copyLibraryImportArtifacts(uuid) {
    const decoded = decodeUuid(uuid);
    const sources = findLibraryArtifactsByDecodedUuid(decoded, 'import');
    if (sources.length === 0) return false;
    const destDir = path.join(bootstrapOutputRoot, 'import', decoded.slice(0, 2));
    ensureDir(destDir);
    for (const src of sources) {
        const dest = path.join(destDir, path.basename(src));
        if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    }
    return true;
}

function copyLibraryNativeArtifacts(uuid) {
    const decoded = decodeUuid(uuid).split('@')[0];
    const sources = findLibraryArtifactsByDecodedUuid(decoded, 'native');
    if (sources.length === 0) return false;
    const destDir = path.join(bootstrapOutputRoot, 'native', decoded.slice(0, 2));
    ensureDir(destDir);
    for (const src of sources) {
        const dest = path.join(destDir, path.basename(src));
        if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    }
    return true;
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

function isNumericPathKey(key) {
    return /^\d+$/.test(String(key));
}

function usesUuidPathKeys(config) {
    return Object.keys(config.paths || {}).some((key) => !isNumericPathKey(key));
}

function buildUuidIndexLookup(config) {
    const lookup = new Map();
    const uuids = Array.isArray(config.uuids) ? config.uuids : [];
    for (let index = 0; index < uuids.length; index += 1) {
        const uuid = uuids[index];
        if (typeof uuid !== 'string' || !uuid) continue;
        lookup.set(uuid, index);
        const decoded = decodeUuid(uuid);
        lookup.set(decoded, index);
        const separatorIndex = uuid.indexOf('@');
        if (separatorIndex > 0) {
            const base = uuid.slice(0, separatorIndex);
            const suffix = uuid.slice(separatorIndex);
            lookup.set(`${decodeUuid(base)}${suffix}`, index);
        }
    }
    return lookup;
}

function normalizePackIndices(config, configPath) {
    if (!config.packs || typeof config.packs !== 'object') return 0;
    if (usesUuidPathKeys(config)) {
        const uuids = Array.isArray(config.uuids) ? config.uuids : [];
        let normalized = 0;
        for (const [packName, entries] of Object.entries(config.packs)) {
            if (!Array.isArray(entries)) continue;
            for (let index = 0; index < entries.length; index += 1) {
                const entry = entries[index];
                if (typeof entry === 'string') continue;
                if (typeof entry === 'number' && typeof uuids[entry] === 'string') {
                    entries[index] = uuids[entry];
                    normalized += 1;
                    continue;
                }
                fail(`bootstrap web pack 引用无法解析: ${path.basename(configPath)} ${packName}[${index}]=${entry}`);
            }
        }
        return normalized;
    }
    const uuidIndexLookup = buildUuidIndexLookup(config);
    let normalized = 0;
    for (const [packName, entries] of Object.entries(config.packs)) {
        if (!Array.isArray(entries)) continue;
        for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index];
            if (typeof entry === 'number') continue;
            if (typeof entry === 'string') {
                const mappedIndex = uuidIndexLookup.get(entry);
                if (typeof mappedIndex === 'number') {
                    entries[index] = mappedIndex;
                    normalized += 1;
                    continue;
                }
            }
            fail(`bootstrap pack 引用无法解析: ${path.basename(configPath)} ${packName}[${index}]=${entry}`);
        }
    }
    return normalized;
}

function appendAssetEntry(config, uuid, assetPath, typeName) {
    if (!Array.isArray(config.uuids)) config.uuids = [];
    if (!config.paths || typeof config.paths !== 'object') config.paths = {};
    const existingPaths = findPathEntries(config);
    if (existingPaths.has(assetPath)) return false;
    if (usesUuidPathKeys(config)) {
        if (!config.uuids.includes(uuid)) config.uuids.push(uuid);
        config.paths[uuid] = [assetPath, typeName, 1];
        return true;
    }
    const typeIndex = ensureType(config, typeName);
    const index = config.uuids.length;
    config.uuids.push(uuid);
    config.paths[index] = [assetPath, typeIndex, 1];
    return true;
}

function appendCriticalGameAssetEntry(config, entry) {
    if (!Array.isArray(config.uuids)) config.uuids = [];
    if (!config.paths || typeof config.paths !== 'object') config.paths = {};
    let index = config.uuids.indexOf(entry.uuid);
    if (index < 0) {
        index = config.uuids.length;
        config.uuids.push(entry.uuid);
    }
    if (!entry.newPath) return false;
    const existingPaths = findPathEntries(config);
    if (existingPaths.has(entry.newPath)) return false;
    if (usesUuidPathKeys(config)) {
        config.paths[entry.uuid] = [entry.newPath, entry.typeName, 1];
        return true;
    }
    const typeIndex = ensureType(config, entry.typeName);
    config.paths[index] = [entry.newPath, typeIndex, 1];
    return true;
}

function getEntryTypeName(config, entry) {
    if (!entry || !entry.value) return '';
    const typeIndex = entry.value[1];
    if (typeof typeIndex === 'string') return typeIndex;
    return Array.isArray(config.types) ? (config.types[typeIndex] || '') : '';
}

function requiresNativeArtifact(entry) {
    return entry.typeName === 'cc.AudioClip'
        || entry.typeName === 'cc.ImageAsset'
        || (!!entry.nativeVersionHash && !String(entry.uuid || '').includes('@'));
}

function buildVersionHashByIndex(config, kind) {
    const versions = config.versions && Array.isArray(config.versions[kind]) ? config.versions[kind] : [];
    const hashes = new Map();
    const uuids = Array.isArray(config.uuids) ? config.uuids : [];
    for (let i = 0; i < versions.length; i += 2) {
        const key = versions[i];
        const hash = versions[i + 1];
        if (typeof hash !== 'string') continue;
        if (typeof key === 'number') {
            hashes.set(key, hash);
            if (uuids[key]) {
                hashes.set(uuids[key], hash);
                hashes.set(decodeUuid(uuids[key]), hash);
            }
        } else if (typeof key === 'string') {
            hashes.set(key, hash);
            hashes.set(decodeUuid(key), hash);
        }
    }
    return hashes;
}

function appendVersionHash(config, kind, uuid, hash) {
    if (!hash) return false;
    if (!Array.isArray(config.uuids)) config.uuids = [];
    let index = config.uuids.indexOf(uuid);
    if (index < 0) {
        index = config.uuids.length;
        config.uuids.push(uuid);
    }
    if (!config.versions || typeof config.versions !== 'object') config.versions = {};
    if (!Array.isArray(config.versions[kind])) config.versions[kind] = [];
    const versions = config.versions[kind];
    for (let i = 0; i < versions.length; i += 2) {
        if (versions[i] === index) {
            if (versions[i + 1] === hash) return false;
            versions[i + 1] = hash;
            return true;
        }
    }
    versions.push(index, hash);
    return true;
}

function removeVersionHashByIndex(config, kind, targetIndex) {
    const versions = config.versions && Array.isArray(config.versions[kind]) ? config.versions[kind] : [];
    if (versions.length === 0) return false;
    let removed = false;
    const next = [];
    for (let i = 0; i < versions.length; i += 2) {
        if (versions[i] === targetIndex) {
            removed = true;
            continue;
        }
        next.push(versions[i], versions[i + 1]);
    }
    if (!removed) return false;
    config.versions[kind] = next;
    return true;
}

function ensureStableBootstrapPackImportFiles(config) {
    if (!config.packs || typeof config.packs !== 'object' || !Array.isArray(config.uuids)) return { copied: 0, versionEntriesRemoved: 0 };
    const importVersions = buildVersionHashByIndex(config, 'import');
    let copied = 0;
    let versionEntriesRemoved = 0;
    for (const packName of Object.keys(config.packs)) {
        const packIndex = config.uuids.indexOf(packName);
        if (packIndex < 0) continue;
        const hash = importVersions.get(packIndex);
        const packDir = path.join(bootstrapOutputRoot, 'import', packName.slice(0, 2));
        const stablePath = path.join(packDir, `${packName}.json`);
        const versionedPath = hash ? path.join(packDir, `${packName}.${hash}.json`) : '';
        if (!fs.existsSync(stablePath)) {
            if (!versionedPath || !fs.existsSync(versionedPath)) {
                fail('bootstrap pack import 缺失: ' + packName + (hash ? ' version=' + hash : ''));
            }
            fs.copyFileSync(versionedPath, stablePath);
            copied += 1;
        }
        if (removeVersionHashByIndex(config, 'import', packIndex)) {
            versionEntriesRemoved += 1;
        }
    }
    return { copied, versionEntriesRemoved };
}

function isCconBinary(filePath) {
    const file = fs.openSync(filePath, 'r');
    try {
        const header = Buffer.alloc(4);
        return fs.readSync(file, header, 0, header.length, 0) === header.length
            && header.toString('ascii') === 'CCON';
    } finally {
        fs.closeSync(file);
    }
}

function listCconImportFiles(bundleRoot) {
    const importRoot = path.join(bundleRoot, 'import');
    if (!fs.existsSync(importRoot)) return [];
    const files = [];
    const visit = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                visit(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.bin') && isCconBinary(fullPath)) {
                files.push(fullPath);
            }
        }
    };
    visit(importRoot);
    return files.sort();
}

function resolveExtensionMappedUuid(config, reference) {
    const uuids = Array.isArray(config.uuids) ? config.uuids : [];
    if (typeof reference === 'number') return decodeUuid(uuids[reference] || '');
    if (typeof reference !== 'string') return '';
    if (/^\d+$/.test(reference) && uuids[Number(reference)]) {
        return decodeUuid(uuids[Number(reference)]);
    }
    return decodeUuid(reference);
}

function ensureStandaloneCconExtensionMap(bundleRoot, config, configPath = '') {
    const uuids = Array.isArray(config.uuids) ? config.uuids : [];
    const importVersions = buildVersionHashByIndex(config, 'import');
    const records = [];
    for (let index = 0; index < uuids.length; index += 1) {
        const storedUuid = uuids[index];
        if (typeof storedUuid !== 'string' || !storedUuid) continue;
        const decodedUuid = decodeUuid(storedUuid);
        const version = importVersions.get(index)
            || importVersions.get(storedUuid)
            || importVersions.get(decodedUuid)
            || '';
        const fileName = `${decodedUuid}${version ? `.${version}` : ''}.bin`;
        const filePath = path.join(bundleRoot, config.importBase || 'import', decodedUuid.slice(0, 2), fileName);
        if (!fs.existsSync(filePath) || !isCconBinary(filePath)) continue;
        records.push({ index, storedUuid, decodedUuid, filePath });
    }

    const expectedFiles = new Set(records.map((record) => path.resolve(record.filePath)));
    const orphanFiles = listCconImportFiles(bundleRoot)
        .filter((filePath) => !expectedFiles.has(path.resolve(filePath)));
    if (orphanFiles.length > 0) {
        const label = configPath ? path.basename(configPath) : 'config';
        throw new Error(`bootstrap CCON import 无法映射到 ${label} uuid/version: ${orphanFiles.map((filePath) => path.relative(bundleRoot, filePath)).join(', ')}`);
    }

    if (!config.extensionMap || typeof config.extensionMap !== 'object') config.extensionMap = {};
    if (config.extensionMap['.cconb'] !== undefined && !Array.isArray(config.extensionMap['.cconb'])) {
        throw new Error('bootstrap extensionMap[.cconb] 必须是数组');
    }
    const extensionEntries = config.extensionMap['.cconb'] || (config.extensionMap['.cconb'] = []);
    const mappedUuids = new Set(extensionEntries.map((reference) => resolveExtensionMappedUuid(config, reference)));
    const useUuidReferences = usesUuidPathKeys(config);
    let added = 0;
    for (const record of records) {
        if (mappedUuids.has(record.decodedUuid)) continue;
        extensionEntries.push(useUuidReferences ? record.storedUuid : record.index);
        mappedUuids.add(record.decodedUuid);
        added += 1;
    }
    return { imports: records.length, added };
}

function findArtifactByDecodedUuid(bundleRoot, kind, decodedUuid) {
    const artifacts = findArtifactsByDecodedUuid(bundleRoot, kind, decodedUuid);
    if (kind === 'import') {
        const plain = artifacts.find((filePath) => path.basename(filePath) === `${decodedUuid}.json`);
        return plain || artifacts[0] || '';
    }
    return artifacts[0] || '';
}

function findArtifactsByDecodedUuid(bundleRoot, kind, decodedUuid) {
    const dir = path.join(bundleRoot, kind, decodedUuid.slice(0, 2));
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter((fileName) => fileName.startsWith(decodedUuid) && (kind !== 'import' || fileName.endsWith('.json')))
        .sort((a, b) => a.length - b.length || a.localeCompare(b))
        .map((fileName) => path.join(dir, fileName));
}

function copyGameAssetImportArtifacts(gameAssetsRoot, uuid) {
    const decoded = decodeUuid(uuid);
    const sources = findArtifactsByDecodedUuid(gameAssetsRoot, 'import', decoded);
    if (sources.length === 0) return false;
    const destDir = path.join(bootstrapOutputRoot, 'import', decoded.slice(0, 2));
    ensureDir(destDir);
    for (const src of sources) {
        const dest = path.join(destDir, path.basename(src));
        if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    }
    const plainDest = path.join(destDir, `${decoded}.json`);
    if (!fs.existsSync(plainDest)) {
        fs.copyFileSync(sources[0], plainDest);
    }
    return true;
}

function copyGameAssetNativeArtifacts(gameAssetsRoot, uuid) {
    const decoded = decodeUuid(uuid).split('@')[0];
    const sources = findArtifactsByDecodedUuid(gameAssetsRoot, 'native', decoded);
    if (sources.length === 0) return false;
    const destDir = path.join(bootstrapOutputRoot, 'native', decoded.slice(0, 2));
    ensureDir(destDir);
    for (const src of sources) {
        const dest = path.join(destDir, path.basename(src));
        if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    }
    return true;
}

function findNativeArtifactForVersion(bundleRoot, uuid, versionHash) {
    const decoded = decodeUuid(uuid).split('@')[0];
    const dir = path.join(bundleRoot, 'native', decoded.slice(0, 2));
    if (!fs.existsSync(dir)) return '';
    return fs.readdirSync(dir)
        .find((fileName) => fileName.startsWith(`${decoded}.${versionHash}.`) && !fileName.endsWith('.json')) || '';
}

function readImportArtifactData(bundleRoot, uuid) {
    const decoded = decodeUuid(uuid);
    const src = findArtifactByDecodedUuid(bundleRoot, 'import', decoded);
    if (!src) {
        const librarySrc = findLibraryArtifactsByDecodedUuid(decoded, 'import')[0] || '';
        if (!librarySrc) return null;
        return readJson(librarySrc);
    }
    return readJson(src);
}

function collectReferencedUuids(value, knownUuids, out) {
    if (!value) return;
    if (typeof value === 'string') {
        if (knownUuids.has(value)) out.add(value);
        const plainValue = value.split('@')[0];
        if (knownUuids.has(plainValue)) out.add(plainValue);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) collectReferencedUuids(item, knownUuids, out);
        return;
    }
    if (typeof value !== 'object') return;
    if (typeof value.__uuid__ === 'string' && knownUuids.has(value.__uuid__)) {
        out.add(value.__uuid__);
    }
    for (const child of Object.values(value)) {
        collectReferencedUuids(child, knownUuids, out);
    }
}

function buildGameAssetsEntryIndex(config, bundleRoot = '', bundleName = gameAssetsBundleName, sourceOrder = 0) {
    const entriesByUuid = new Map();
    const uuids = config.uuids || [];
    const uuidIndexLookup = buildUuidIndexLookup(config);
    const importVersions = buildVersionHashByIndex(config, 'import');
    const nativeVersions = buildVersionHashByIndex(config, 'native');
    let order = 0;
    for (const [key, value] of Object.entries(config.paths || {})) {
        const numericKey = isNumericPathKey(key);
        const mappedIndex = numericKey ? Number(key) : uuidIndexLookup.get(key);
        const oldIndex = typeof mappedIndex === 'number' ? mappedIndex : order;
        const uuid = numericKey ? uuids[oldIndex] : key;
        order += 1;
        if (!uuid || !Array.isArray(value) || !value[0]) continue;
        const entry = {
            bundleName,
            bundleRoot,
            sourceOrder,
            oldIndex,
            oldPath: value[0],
            newPath: null,
            value,
            uuid,
            typeName: getEntryTypeName(config, { value }),
            importVersionHash: importVersions.get(oldIndex) || importVersions.get(uuid) || importVersions.get(decodeUuid(uuid)) || '',
            nativeVersionHash: nativeVersions.get(oldIndex) || nativeVersions.get(uuid) || nativeVersions.get(decodeUuid(uuid)) || '',
        };
        entriesByUuid.set(uuid, entry);
    }
    return entriesByUuid;
}

function addGameAssetsEntryAliases(entriesByUuid, entry) {
    if (!entry || !entry.uuid) return;
    entriesByUuid.set(entry.uuid, entry);
    entriesByUuid.set(decodeUuid(entry.uuid), entry);
}

function inferCriticalAssetTypeName(uuid, importVersionHash, nativeVersionHash) {
    if (String(uuid).endsWith('@f9941')) return 'cc.SpriteFrame';
    if (String(uuid).endsWith('@6c48a')) return 'cc.Texture2D';
    if (nativeVersionHash) return 'cc.ImageAsset';
    if (importVersionHash) return 'cc.Asset';
    return '';
}

function buildGameAssetsUuidEntryIndex(config, entriesByUuid, bundleRoot = '', bundleName = gameAssetsBundleName, sourceOrder = 0) {
    const allEntriesByUuid = new Map();
    for (const entry of entriesByUuid.values()) {
        addGameAssetsEntryAliases(allEntriesByUuid, entry);
    }
    const uuids = config.uuids || [];
    const importVersions = buildVersionHashByIndex(config, 'import');
    const nativeVersions = buildVersionHashByIndex(config, 'native');
    for (let oldIndex = 0; oldIndex < uuids.length; oldIndex += 1) {
        const uuid = uuids[oldIndex];
        if (!uuid || allEntriesByUuid.has(uuid)) continue;
        const importVersionHash = importVersions.get(oldIndex) || '';
        const nativeVersionHash = nativeVersions.get(oldIndex) || '';
        addGameAssetsEntryAliases(allEntriesByUuid, {
            bundleName,
            bundleRoot,
            sourceOrder,
            oldIndex,
            oldPath: '',
            newPath: null,
            value: null,
            uuid,
            typeName: inferCriticalAssetTypeName(uuid, importVersionHash, nativeVersionHash),
            importVersionHash,
            nativeVersionHash,
        });
    }
    return allEntriesByUuid;
}

function buildKnownUuidSet(config) {
    const knownUuids = new Set();
    for (const uuid of config.uuids || []) {
        if (!uuid) continue;
        knownUuids.add(uuid);
        knownUuids.add(decodeUuid(uuid));
    }
    return knownUuids;
}

function readOptionalBundleSource(bundleName, sourceOrder, required = false) {
    const bundleRoot = resolveBundleOutputRoot(bundleName);
    const configPath = path.join(bundleRoot, 'config.json');
    if (!fs.existsSync(configPath)) {
        if (required) fail(`未找到 ${bundleName} config: ${configPath}`);
        return null;
    }
    const config = readJson(configPath);
    const entriesByUuid = buildGameAssetsEntryIndex(config, bundleRoot, bundleName, sourceOrder);
    const allEntriesByUuid = buildGameAssetsUuidEntryIndex(config, entriesByUuid, bundleRoot, bundleName, sourceOrder);
    return {
        bundleName,
        bundleRoot,
        config,
        entriesByUuid,
        allEntriesByUuid,
        knownUuids: buildKnownUuidSet(config),
        hasNativeVersionMap: Array.isArray(config.versions?.native) && config.versions.native.length > 0,
    };
}

function collectCriticalGameAssets() {
    const sources = [
        readOptionalBundleSource(gameAssetsBundleName, 0, true),
        readOptionalBundleSource(homeAssetsBundleName, 1, false),
    ].filter(Boolean);
    const allEntriesByUuid = new Map();
    const knownUuids = new Set();
    for (const source of sources) {
        for (const [key, entry] of source.allEntriesByUuid.entries()) {
            if (!allEntriesByUuid.has(key)) allEntriesByUuid.set(key, entry);
        }
        for (const uuid of source.knownUuids) knownUuids.add(uuid);
    }
    const selectedByUuid = new Map();
    const foundPaths = new Set();
    for (const source of sources) {
        for (const entry of source.entriesByUuid.values()) {
            const targetPath = criticalGameAssetsPathMap.get(entry.oldPath);
            if (!targetPath) continue;
            selectedByUuid.set(entry.uuid, { ...entry, newPath: targetPath, sourceHasNativeVersionMap: source.hasNativeVersionMap });
            foundPaths.add(entry.oldPath);
        }
    }
    const missing = [...criticalGameAssetsPathMap.keys()].filter((sourcePath) => !foundPaths.has(sourcePath));
    if (missing.length > 0) {
        fail('bootstrap critical gameAssets 缺失: ' + missing.join(', '));
    }

    const queue = [...selectedByUuid.keys()];
    const visited = new Set();
    while (queue.length > 0) {
        const uuid = queue.shift();
        if (visited.has(uuid)) continue;
        visited.add(uuid);
        const currentEntry = selectedByUuid.get(uuid);
        const sourceRoot = currentEntry?.bundleRoot || sources[0].bundleRoot;
        const importData = readImportArtifactData(sourceRoot, uuid);
        if (!importData) continue;
        const deps = new Set();
        collectReferencedUuids(importData, knownUuids, deps);
        for (const depUuid of deps) {
            const depEntry = allEntriesByUuid.get(depUuid);
            if (!depEntry) continue;
            if (!selectedByUuid.has(depEntry.uuid)) {
                const source = sources.find((item) => item.bundleName === depEntry.bundleName);
                selectedByUuid.set(depEntry.uuid, {
                    ...depEntry,
                    newPath: depEntry.oldPath || null,
                    sourceHasNativeVersionMap: !!source?.hasNativeVersionMap,
                });
            }
            if (!visited.has(depEntry.uuid)) {
                queue.push(depEntry.uuid);
            }
        }
    }

    return {
        fallbackRoot: sources[0].bundleRoot,
        entries: [...selectedByUuid.values()].sort((a, b) => a.sourceOrder - b.sourceOrder || a.oldIndex - b.oldIndex),
    };
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

function main() {
if (!fs.existsSync(bootstrapOutputRoot)) fail('未找到 bootstrap bundle: ' + bootstrapOutputRoot);
const configPaths = fs.readdirSync(bootstrapOutputRoot)
    .filter((name) => /^config(?:\.[0-9a-f]+)?\.json$/i.test(name))
    .map((name) => path.join(bootstrapOutputRoot, name))
    .sort();
if (configPaths.length === 0) fail('bootstrap config 不存在: ' + bootstrapOutputRoot);

const assets = collectAssets();
const criticalGameAssets = collectCriticalGameAssets();
const configRecords = configPaths.map((configPath) => ({
    configPath,
    config: readJson(configPath),
}));
const missingAssets = findMissingAssets(configRecords.map((record) => record.config), assets);
const copiedImports = new Set();
const copiedNative = new Set();
const copiedCriticalImports = new Set();
const copiedCriticalNative = new Set();
let addedCriticalImportVersions = 0;
let addedCriticalNativeVersions = 0;
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
for (const entry of criticalGameAssets.entries) {
    if (!copiedCriticalImports.has(entry.uuid)) {
        const sourceRoot = entry.bundleRoot || criticalGameAssets.fallbackRoot;
        if (!copyGameAssetImportArtifacts(sourceRoot, entry.uuid)
            && !copyLibraryImportArtifacts(entry.uuid)) {
            fail('bootstrap critical import 缺失: ' + entry.oldPath + ' uuid=' + decodeUuid(entry.uuid));
        }
        copiedCriticalImports.add(entry.uuid);
    }
    if (requiresNativeArtifact(entry) && !copiedCriticalNative.has(entry.uuid)) {
        const sourceRoot = entry.bundleRoot || criticalGameAssets.fallbackRoot;
        if (!copyGameAssetNativeArtifacts(sourceRoot, entry.uuid)
            && !copyLibraryNativeArtifacts(entry.uuid)) {
            fail('bootstrap critical native 缺失: ' + entry.oldPath + ' uuid=' + decodeUuid(entry.uuid));
        }
        copiedCriticalNative.add(entry.uuid);
    }
}

let addedEntries = 0;
let addedCriticalEntries = 0;
let normalizedPackEntries = 0;
let stablePackImportsCopied = 0;
let stablePackImportVersionsRemoved = 0;
let cconImportsVerified = 0;
let cconMappingsAdded = 0;
for (const { configPath, config } of configRecords) {
    for (const asset of assets) {
        if (appendAssetEntry(config, asset.uuid, asset.assetPath, asset.typeName)) addedEntries += 1;
    }
    for (const entry of criticalGameAssets.entries) {
        if (appendCriticalGameAssetEntry(config, entry)) addedCriticalEntries += 1;
        if (appendVersionHash(config, 'import', entry.uuid, entry.importVersionHash)) {
            addedCriticalImportVersions += 1;
        }
        if (requiresNativeArtifact(entry)) {
            if (!entry.nativeVersionHash && entry.sourceHasNativeVersionMap) {
                fail('bootstrap critical native version 缺失: ' + entry.oldPath + ' uuid=' + decodeUuid(entry.uuid));
            }
            if (entry.nativeVersionHash && !findNativeArtifactForVersion(bootstrapOutputRoot, entry.uuid, entry.nativeVersionHash)) {
                fail('bootstrap critical native 版本文件缺失: ' + entry.oldPath + ' uuid=' + decodeUuid(entry.uuid) + ' version=' + entry.nativeVersionHash);
            }
            if (appendVersionHash(config, 'native', entry.uuid, entry.nativeVersionHash)) {
                addedCriticalNativeVersions += 1;
            }
        }
    }
    normalizedPackEntries += normalizePackIndices(config, configPath);
    const stablePackResult = ensureStableBootstrapPackImportFiles(config);
    stablePackImportsCopied += stablePackResult.copied;
    stablePackImportVersionsRemoved += stablePackResult.versionEntriesRemoved;
    const cconResult = ensureStandaloneCconExtensionMap(bootstrapOutputRoot, config, configPath);
    cconImportsVerified += cconResult.imports;
    cconMappingsAdded += cconResult.added;
    writeJson(configPath, config);
}

function verifyCriticalBootstrapArtifacts(entries) {
    let verifiedImports = 0;
    let verifiedNative = 0;
    for (const entry of entries) {
        const decoded = decodeUuid(entry.uuid);
        if (findArtifactsByDecodedUuid(bootstrapOutputRoot, 'import', decoded).length === 0) {
            fail('bootstrap critical import 验证失败: ' + (entry.oldPath || '(dependency)') + ' uuid=' + decoded);
        }
        verifiedImports += 1;
        if (!requiresNativeArtifact(entry)) continue;
        const nativeUuid = decoded.split('@')[0];
        if (findArtifactsByDecodedUuid(bootstrapOutputRoot, 'native', nativeUuid).length === 0) {
            fail('bootstrap critical native 验证失败: ' + (entry.oldPath || '(dependency)') + ' uuid=' + nativeUuid);
        }
        verifiedNative += 1;
    }
    return { verifiedImports, verifiedNative };
}

const verifiedCritical = verifyCriticalBootstrapArtifacts(criticalGameAssets.entries);

console.log(`[bootstrap] dynamic assets patched: images=${copiedNative.size}, imports=${copiedImports.size}, configEntries=${addedEntries}, criticalImports=${copiedCriticalImports.size}, criticalNative=${copiedCriticalNative.size}, criticalConfigEntries=${addedCriticalEntries}, criticalImportVersions=${addedCriticalImportVersions}, criticalNativeVersions=${addedCriticalNativeVersions}, verifiedCriticalImports=${verifiedCritical.verifiedImports}, verifiedCriticalNative=${verifiedCritical.verifiedNative}, normalizedPackEntries=${normalizedPackEntries}, stablePackImports=${stablePackImportsCopied}, stablePackImportVersionsRemoved=${stablePackImportVersionsRemoved}, cconImports=${cconImportsVerified}, cconMappingsAdded=${cconMappingsAdded}, configs=${configPaths.length}`);
}

if (require.main === module) main();

module.exports = {
    ensureStandaloneCconExtensionMap,
};
