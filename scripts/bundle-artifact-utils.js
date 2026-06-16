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
    for (const metaPath of walkFiles(sourceRoot).filter((filePath) => filePath.endsWith('.meta')).sort()) {
        const meta = readJson(metaPath);
        if (!meta || typeof meta.uuid !== 'string' || !meta.uuid) continue;
        if (hasNativeArtifact(meta)) {
            pushArtifact({ uuid: meta.uuid, native: true, optionalImport: true, source: metaPath });
        } else if (hasJsonArtifact(meta)) {
            pushArtifact({ uuid: meta.uuid, native: false, source: metaPath });
        }
        for (const subMeta of Object.values(meta.subMetas || {})) {
            if (!subMeta || typeof subMeta.uuid !== 'string' || !subMeta.uuid || !hasJsonArtifact(subMeta)) continue;
            pushArtifact({
                uuid: subMeta.uuid,
                native: false,
                optionalImport: subMeta.importer === 'texture' || subMeta.importer === 'sprite-frame',
                source: metaPath,
            });
        }
    }
    return artifacts;
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
    findNativeArtifact,
    importArtifactPath,
};
