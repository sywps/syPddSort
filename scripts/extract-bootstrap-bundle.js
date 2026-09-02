#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BOOTSTRAP_BUNDLE_NAME = 'bootstrap';
const GAME_ASSETS_BUNDLE_NAME = 'gameAssets';

const BOOTSTRAP_PATH_MAP = (() => {
    const map = new Map();
    map.set('LevelData/level_1', 'LevelData/level_1');

    for (const audioPath of [
        'Audio/bgm',
        'Audio/pindd/bean_pickup',
        'Audio/pindd/bean_correct_place',
        'Audio/pindd/bean_return_settle',
        'Audio/pindd/bean_fly',
        'Audio/pindd/error',
        'Audio/ui',
        'Audio/tick',
        'Audio/pindd/shelf',
        'Audio/win',
        'Audio/lose',
        'Audio/winColor',
        'Audio/winSettlement',
    ]) {
        map.set(audioPath, audioPath);
    }

    for (const prefabPath of [
        'UI/Prefabs/Panels/WinPanel',
        'UI/Prefabs/Panels/RevivePanelV2',
        'UI/Prefabs/Panels/BufferFullRevivePanelV2',
        'UI/Prefabs/Panels/LosePanel',
    ]) {
        map.set(prefabPath, prefabPath);
    }

    return map;
})();

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

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

function renderBundleIndex(bundleName) {
    return `System.register("chunks:///_virtual/${bundleName}",[],(function(){return{execute:function(){}}}));\n\n(function(r) {\n  r('virtual:///prerequisite-imports/${bundleName}', 'chunks:///_virtual/${bundleName}'); \n})(function(mid, cid) {\n    System.register(mid, [cid], function (_export, _context) {\n    return {\n        setters: [function(_m) {\n            var _exportObj = {};\n\n            for (var _key in _m) {\n              if (_key !== "default" && _key !== "__esModule") _exportObj[_key] = _m[_key];\n            }\n      \n            _export(_exportObj);\n        }],\n        execute: function () { }\n    };\n    });\n});\n`;
}

function copyFile(srcPath, destPath) {
    ensureDir(path.dirname(destPath));
    fs.copyFileSync(srcPath, destPath);
}

function copyImportArtifact(gameAssetsDir, targetDir, compressedUuid) {
    const decoded = decodeUuid(compressedUuid);
    const candidates = [decoded];
    const atIndex = decoded.indexOf('@');
    if (atIndex >= 0) {
        candidates.push(decoded.slice(0, atIndex));
    }
    for (const candidate of candidates) {
        const importSrc = path.join(gameAssetsDir, 'import', candidate.slice(0, 2), `${candidate}.json`);
        if (!fs.existsSync(importSrc)) continue;
        const importDest = path.join(targetDir, 'import', candidate.slice(0, 2), `${candidate}.json`);
        copyFile(importSrc, importDest);
        return true;
    }
    return false;
}

function copyNativeArtifact(gameAssetsDir, targetDir, compressedUuid) {
    const decoded = decodeUuid(compressedUuid);
    const nativeUuid = decoded.split('@')[0];
    const nativeDir = path.join(gameAssetsDir, 'native', nativeUuid.slice(0, 2));
    if (!fs.existsSync(nativeDir)) {
        throw new Error(`未找到 native 目录: ${nativeDir}`);
    }
    const nativeFile = fs.readdirSync(nativeDir).find((fileName) => fileName.startsWith(`${nativeUuid}.`));
    if (!nativeFile) {
        throw new Error(`未找到 native 资源: ${nativeUuid}`);
    }
    copyFile(path.join(nativeDir, nativeFile), path.join(targetDir, 'native', nativeUuid.slice(0, 2), nativeFile));
}

function requiresNativeArtifact(gameAssetsConfig, entry) {
    if (!entry || !entry.value) return false;
    const typeIndex = entry.value[1];
    const typeName = Array.isArray(gameAssetsConfig.types) ? gameAssetsConfig.types[typeIndex] : '';
    return typeName === 'cc.AudioClip' || typeName === 'cc.ImageAsset';
}

function getEntryTypeName(gameAssetsConfig, entry) {
    if (!entry || !entry.value) return '';
    const typeIndex = entry.value[1];
    return Array.isArray(gameAssetsConfig.types) ? (gameAssetsConfig.types[typeIndex] || '') : '';
}

function buildPackIndex(gameAssetsConfig, gameAssetsDir) {
    const gameAssetsUuids = gameAssetsConfig.uuids || [];
    const gameAssetsPacks = gameAssetsConfig.packs || {};
    const uuidToPackInfo = new Map();
    for (const [packUuid, indices] of Object.entries(gameAssetsPacks)) {
        const decoded = decodeUuid(packUuid);
        const packFile = path.join(gameAssetsDir, 'import', decoded.slice(0, 2), `${decoded}.json`);
        if (!fs.existsSync(packFile)) continue;
        const packData = JSON.parse(fs.readFileSync(packFile, 'utf8'));
        for (let pos = 0; pos < indices.length; pos++) {
            const globalIdx = indices[pos];
            if (globalIdx < gameAssetsUuids.length) {
                uuidToPackInfo.set(gameAssetsUuids[globalIdx], {
                    packUuid,
                    packData,
                    position: pos,
                });
            }
        }
    }
    return uuidToPackInfo;
}

function buildRemoteEntryIndex(gameAssetsConfig) {
    const gameAssetsPaths = gameAssetsConfig.paths || {};
    const gameAssetsUuids = gameAssetsConfig.uuids || [];
    const entriesByUuid = new Map();
    for (const [key, value] of Object.entries(gameAssetsPaths)) {
        const oldIndex = Number(key);
        const uuid = gameAssetsUuids[oldIndex];
        if (!uuid || !Array.isArray(value) || !value[0]) continue;
        entriesByUuid.set(uuid, {
            oldIndex,
            oldPath: value[0],
            newPath: null,
            value,
            uuid,
        });
    }
    return entriesByUuid;
}

function readImportArtifactData(gameAssetsDir, compressedUuid, uuidToPackInfo) {
    const decoded = decodeUuid(compressedUuid);
    const standalonePath = path.join(gameAssetsDir, 'import', decoded.slice(0, 2), `${decoded}.json`);
    if (fs.existsSync(standalonePath)) {
        return JSON.parse(fs.readFileSync(standalonePath, 'utf8'));
    }
    const packInfo = uuidToPackInfo.get(compressedUuid);
    if (!packInfo) return null;
    return packInfo.packData.data[packInfo.position] || null;
}

function collectReferencedUuids(value, knownUuids, out) {
    if (!value) return;
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

function expandPrefabDependencyEntries(gameAssetsDir, gameAssetsConfig, selectedEntriesByUuid, gameAssetsEntriesByUuid, uuidToPackInfo) {
    const knownUuids = new Set(gameAssetsConfig.uuids || []);
    const queue = [...selectedEntriesByUuid.values()]
        .filter((entry) => getEntryTypeName(gameAssetsConfig, entry) === 'cc.Prefab')
        .map((entry) => entry.uuid);
    const visited = new Set(queue);

    while (queue.length > 0) {
        const prefabUuid = queue.shift();
        const prefabData = readImportArtifactData(gameAssetsDir, prefabUuid, uuidToPackInfo);
        if (!prefabData) continue;
        const deps = new Set();
        collectReferencedUuids(prefabData, knownUuids, deps);
        for (const depUuid of deps) {
            if (!selectedEntriesByUuid.has(depUuid)) {
                const depEntry = gameAssetsEntriesByUuid.get(depUuid);
                if (depEntry) selectedEntriesByUuid.set(depUuid, depEntry);
            }
            if (!visited.has(depUuid) && getEntryTypeName(gameAssetsConfig, gameAssetsEntriesByUuid.get(depUuid)) === 'cc.Prefab') {
                visited.add(depUuid);
                queue.push(depUuid);
            }
        }
    }
}

function shouldReplaceDuplicateEntry(gameAssetsConfig, currentEntry, nextEntry) {
    if (!currentEntry) return true;
    if (currentEntry.oldPath !== nextEntry.oldPath) return false;
    return false;
}

function extractBootstrapBundle(buildPath) {
    const gameAssetsDir = path.join(buildPath, 'assets', GAME_ASSETS_BUNDLE_NAME);
    if (!fs.existsSync(gameAssetsDir)) {
        throw new Error(`未找到 gameAssets bundle: ${gameAssetsDir}`);
    }

    const gameAssetsConfigPath = path.join(gameAssetsDir, 'config.json');
    const remoteIndexPath = path.join(gameAssetsDir, 'index.js');
    if (!fs.existsSync(gameAssetsConfigPath) || !fs.existsSync(remoteIndexPath)) {
        throw new Error(`gameAssets bundle 不完整: ${gameAssetsDir}`);
    }

    const gameAssetsConfig = JSON.parse(fs.readFileSync(gameAssetsConfigPath, 'utf8'));
    const gameAssetsUuids = gameAssetsConfig.uuids || [];
    const gameAssetsEntriesByUuid = buildRemoteEntryIndex(gameAssetsConfig);

    const selectedEntries = [];
    for (const [, entry] of gameAssetsEntriesByUuid) {
        const targetPath = BOOTSTRAP_PATH_MAP.get(entry.oldPath);
        if (!targetPath) continue;
        selectedEntries.push({
            oldIndex: entry.oldIndex,
            oldPath: entry.oldPath,
            newPath: targetPath,
            value: entry.value,
            uuid: entry.uuid,
        });
    }
    selectedEntries.sort((a, b) => a.oldIndex - b.oldIndex);

    // 去重：gameAssets config.json 中可能存在同一路径的多条索引。
    // bean atlas 现在由 BootstrapBundle/Beans 源码真源直接参与构建，不再从 GameAssetsBundle 抽取。
    const uniqueEntriesMap = new Map();
    for (const entry of selectedEntries) {
        const current = uniqueEntriesMap.get(entry.oldPath);
        if (!current || shouldReplaceDuplicateEntry(gameAssetsConfig, current, entry)) {
            uniqueEntriesMap.set(entry.oldPath, entry);
        }
    }
    const selectedEntriesByUuid = new Map(
        [...uniqueEntriesMap.values()].map((entry) => [entry.uuid, entry]),
    );

    const uniqueEntries = [...uniqueEntriesMap.values()].sort((a, b) => a.oldIndex - b.oldIndex);

    const expectedEntryCount = BOOTSTRAP_PATH_MAP.size;
    if (uniqueEntries.length < expectedEntryCount) {
        const found = new Set(uniqueEntries.map((entry) => entry.oldPath));
        const missing = [...BOOTSTRAP_PATH_MAP.keys()].filter((sourcePath) => !found.has(sourcePath));
        throw new Error(`bootstrap 资源提取不完整，期望 ${expectedEntryCount} 条，实际 ${uniqueEntries.length} 条，缺失: ${missing.join(', ')}`);
    }

    const targetDir = path.join(buildPath, 'assets', BOOTSTRAP_BUNDLE_NAME);
    fs.rmSync(targetDir, { recursive: true, force: true });
    ensureDir(targetDir);

    const uuidToPackInfo = buildPackIndex(gameAssetsConfig, gameAssetsDir);
    expandPrefabDependencyEntries(gameAssetsDir, gameAssetsConfig, selectedEntriesByUuid, gameAssetsEntriesByUuid, uuidToPackInfo);
    const expandedEntries = [...selectedEntriesByUuid.values()].sort((a, b) => a.oldIndex - b.oldIndex);

    const bootstrapConfig = {
        importBase: 'import',
        nativeBase: 'native',
        name: BOOTSTRAP_BUNDLE_NAME,
        deps: [],
        uuids: [],
        paths: {},
        scenes: {},
        packs: {},
        versions: { import: [], native: [] },
        redirect: [],
        debug: !!gameAssetsConfig.debug,
        extensionMap: {},
        hasPreloadScript: true,
        dependencyRelationships: {},
        types: gameAssetsConfig.types || [],
    };

    const copiedImportUuids = new Set();
    const copiedNativeUuids = new Set();
    const packedEntries = new Map();

    expandedEntries.forEach((entry) => {
        const newIndex = bootstrapConfig.uuids.length;
        bootstrapConfig.uuids.push(entry.uuid);
        if (entry.newPath && entry.value) {
            bootstrapConfig.paths[newIndex] = [entry.newPath, ...entry.value.slice(1)];
        }

        if (!copiedImportUuids.has(entry.uuid)) {
            if (copyImportArtifact(gameAssetsDir, targetDir, entry.uuid)) {
                copiedImportUuids.add(entry.uuid);
            } else {
                const packInfo = uuidToPackInfo.get(entry.uuid);
                if (packInfo) {
                    if (!packedEntries.has(packInfo.packUuid)) {
                        packedEntries.set(packInfo.packUuid, []);
                    }
                    packedEntries.get(packInfo.packUuid).push({
                        newIndex,
                        uuid: entry.uuid,
                        packInfo,
                    });
                    copiedImportUuids.add(entry.uuid);
                }
            }
        }
        if (requiresNativeArtifact(gameAssetsConfig, entry) && !copiedNativeUuids.has(entry.uuid)) {
            copyNativeArtifact(gameAssetsDir, targetDir, entry.uuid);
            copiedNativeUuids.add(entry.uuid);
        }
    });

    for (const [, entries] of packedEntries) {
        const first = entries[0].packInfo;
        const miniPackData = { type: first.packData.type, data: [] };
        const miniPackIndices = [];
        for (const e of entries) {
            miniPackIndices.push(e.newIndex);
            miniPackData.data.push(first.packData.data[e.packInfo.position]);
        }
        const miniPackId = 'bp_' + crypto.createHash('md5')
            .update(JSON.stringify(miniPackIndices)).digest('hex').slice(0, 7);
        bootstrapConfig.packs[miniPackId] = miniPackIndices;
        bootstrapConfig.uuids.push(miniPackId);
        const decoded = decodeUuid(miniPackId);
        const packDest = path.join(targetDir, 'import', decoded.slice(0, 2), `${decoded}.json`);
        ensureDir(path.dirname(packDest));
        fs.writeFileSync(packDest, JSON.stringify(miniPackData));
    }

    fs.writeFileSync(path.join(targetDir, 'config.json'), JSON.stringify(bootstrapConfig));
    fs.writeFileSync(path.join(targetDir, 'index.js'), renderBundleIndex(BOOTSTRAP_BUNDLE_NAME));

    return {
        targetDir,
        entryCount: expandedEntries.length,
        importCount: copiedImportUuids.size,
        nativeCount: copiedNativeUuids.size,
    };
}

module.exports = {
    extractBootstrapBundle,
};

if (require.main === module) {
    const buildPath = process.argv[2];
    if (!buildPath) {
        console.error('未指定构建输出目录');
        process.exit(1);
    }
    const result = extractBootstrapBundle(buildPath);
    console.log(`[bootstrap] bundle ready: ${result.targetDir} (entries=${result.entryCount}, import=${result.importCount}, native=${result.nativeCount})`);
}
