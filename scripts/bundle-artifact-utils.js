const fs = require('fs');
const path = require('path');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function walkFiles(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walkFiles(full, out);
        else out.push(full);
    }
    return out;
}

function hasJsonArtifact(meta) {
    return Array.isArray(meta.files) && meta.files.includes('.json');
}

function hasNativeArtifact(meta) {
    return meta && meta.importer === 'image'
        && Array.isArray(meta.files)
        && meta.files.some((ext) => /\.(?:png|jpe?g)$/i.test(ext));
}

function bundleAssetPath(sourceRoot, metaPath) {
    return path.relative(sourceRoot, metaPath)
        .split(path.sep).join('/')
        .replace(/\.meta$/i, '')
        .replace(/\.[^/.]+$/, '');
}

function findNearestAutoAtlasRemoveImage(metaPath, autoAtlasRecords) {
    const parentDir = path.dirname(metaPath);
    let nearest = null;
    for (const record of autoAtlasRecords) {
        const atlasDir = path.dirname(record.metaPath);
        const relativeDir = path.relative(atlasDir, parentDir);
        if (relativeDir.startsWith('..') || path.isAbsolute(relativeDir)) continue;
        if (!nearest || atlasDir.length > nearest.atlasDir.length) nearest = { atlasDir, meta: record.meta };
    }
    return nearest ? nearest.meta.userData?.removeImageInBundle === true : false;
}

function collectSourceBundleArtifacts(sourceRoot, bundleName, fail) {
    if (!fs.existsSync(sourceRoot)) {
        failWith(fail, `${bundleName} source bundle 不存在: ${sourceRoot}`);
        return [];
    }
    const artifacts = [];
    const seen = new Set();
    const pushArtifact = (artifact) => {
        if (!artifact || !artifact.uuid || seen.has(artifact.uuid)) return;
        seen.add(artifact.uuid);
        artifacts.push(artifact);
    };
    const metaRecords = walkFiles(sourceRoot)
        .filter((filePath) => filePath.endsWith('.meta'))
        .sort()
        .map((metaPath) => ({ metaPath, meta: readJson(metaPath) }));
    const autoAtlasRecords = metaRecords.filter((record) => record.meta && record.meta.importer === 'auto-atlas');
    for (const { metaPath, meta } of metaRecords) {
        if (!meta || typeof meta.uuid !== 'string' || !meta.uuid) continue;
        const assetPath = bundleAssetPath(sourceRoot, metaPath);
        const autoAtlasRemoveImage = findNearestAutoAtlasRemoveImage(metaPath, autoAtlasRecords);
        if (hasNativeArtifact(meta)) {
            pushArtifact({ uuid: meta.uuid, native: true, importer: meta.importer, assetPath, autoAtlasRemoveImage, optionalImport: true, source: metaPath });
        } else if (hasJsonArtifact(meta)) {
            pushArtifact({ uuid: meta.uuid, native: false, importer: meta.importer, assetPath, source: metaPath });
        }
        for (const subMeta of Object.values(meta.subMetas || {})) {
            if (!subMeta || typeof subMeta.uuid !== 'string' || !subMeta.uuid || !hasJsonArtifact(subMeta)) continue;
            pushArtifact({
                uuid: subMeta.uuid,
                native: false,
                importer: subMeta.importer,
                assetPath,
                optionalImport: subMeta.importer === 'texture' || subMeta.importer === 'sprite-frame',
                source: metaPath,
            });
        }
    }
    return artifacts;
}

function findAutoAtlasStandaloneSources(config, artifacts) {
    const pathKeys = new Map();
    for (const [key, value] of Object.entries(config && config.paths || {})) {
        if (!Array.isArray(value) || typeof value[0] !== 'string') continue;
        pathKeys.set(value[0].replace(/\\/g, '/'), String(key));
    }
    const packedKeys = new Set();
    for (const members of Object.values(config && config.packs || {})) {
        if (!Array.isArray(members)) continue;
        for (const member of members) packedKeys.add(String(member));
    }
    const skippedSources = new Set();
    for (const artifact of Array.isArray(artifacts) ? artifacts : []) {
        if (!artifact || artifact.importer !== 'image' || !artifact.native || !artifact.source || !artifact.assetPath) continue;
        const assetPath = String(artifact.assetPath).replace(/\\/g, '/');
        const spriteFrameKey = pathKeys.get(`${assetPath}/spriteFrame`);
        if (!spriteFrameKey || !packedKeys.has(spriteFrameKey)) continue;
        if (pathKeys.has(`${assetPath}/texture`)) continue;
        skippedSources.add(artifact.source);
    }
    return skippedSources;
}

function findAutoAtlasRemovableNativeUuids(config, artifacts) {
    const skippedSources = findAutoAtlasStandaloneSources(config, artifacts);
    return new Set((Array.isArray(artifacts) ? artifacts : [])
        .filter((artifact) => artifact
            && artifact.importer === 'image'
            && artifact.native
            && artifact.autoAtlasRemoveImage === true
            && skippedSources.has(artifact.source))
        .map((artifact) => artifact.uuid));
}

function importArtifactPath(bundleDir, uuid, importBase) {
    return path.join(bundleDir, importBase || 'import', uuid.slice(0, 2), `${uuid}.json`);
}

function findNativeArtifact(bundleDir, uuid, nativeBase) {
    const nativeDir = path.join(bundleDir, nativeBase || 'native', uuid.slice(0, 2));
    if (!fs.existsSync(nativeDir)) return '';
    const match = fs.readdirSync(nativeDir).find((fileName) => fileName.startsWith(`${uuid}.`) && !fileName.endsWith('.json'));
    return match ? path.join(nativeDir, match) : '';
}

function failWith(fail, message) {
    if (typeof fail === 'function') {
        fail(message);
        return;
    }
    throw new Error(message);
}

module.exports = {
    collectSourceBundleArtifacts,
    findAutoAtlasRemovableNativeUuids,
    findAutoAtlasStandaloneSources,
    findNativeArtifact,
    importArtifactPath,
};
