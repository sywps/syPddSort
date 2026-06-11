const fs = require('fs');
const path = require('path');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function walkFiles(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walkFiles(full, out);
        else out.push(full);
    }
    return out;
}

function decodeUuid(compressedUuid) {
    const separator = '@';
    const base = String(compressedUuid || '').split(separator)[0];
    if (base.length !== 22) {
        return compressedUuid;
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
        const lhs = values[base.charCodeAt(i)];
        const rhs = values[base.charCodeAt(i + 1)];
        template[indices[j++]] = hexChars[lhs >> 2];
        template[indices[j++]] = hexChars[((lhs & 3) << 2) | (rhs >> 4)];
        template[indices[j++]] = hexChars[rhs & 0xF];
    }

    return String(compressedUuid).replace(base, template.join(''));
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
    for (const metaPath of walkFiles(sourceRoot).filter((filePath) => filePath.endsWith('.meta')).sort()) {
        const meta = readJson(metaPath);
        if (!meta || typeof meta.uuid !== 'string' || !meta.uuid) continue;
        if (hasJsonArtifact(meta)) {
            artifacts.push({ uuid: meta.uuid, native: hasNativeArtifact(meta), source: metaPath });
        }
        for (const subMeta of Object.values(meta.subMetas || {})) {
            if (!subMeta || typeof subMeta.uuid !== 'string' || !subMeta.uuid || !hasJsonArtifact(subMeta)) continue;
            artifacts.push({ uuid: subMeta.uuid, native: false, source: metaPath });
        }
    }
    return artifacts;
}

function importArtifactPath(bundleDir, uuid, importBase) {
    return path.join(bundleDir, importBase || 'import', uuid.slice(0, 2), `${uuid}.json`);
}

function isRuntimeImportJson(filePath) {
    const text = fs.readFileSync(filePath, 'utf8').trimStart();
    return text.startsWith('[');
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

function assertSourceBundleArtifactsExist(bundleDir, bundleName, sourceRoot, fail) {
    const configPath = findBundleConfigPath(bundleDir);
    if (!fs.existsSync(configPath)) {
        failWith(fail, `${bundleName} bundle config 不存在: ${configPath}`);
        return;
    }
    const config = readJson(configPath);
    const importBase = typeof config.importBase === 'string' && config.importBase ? config.importBase : 'import';
    const nativeBase = typeof config.nativeBase === 'string' && config.nativeBase ? config.nativeBase : 'native';
    const missing = [];
    for (const artifact of collectSourceBundleArtifacts(sourceRoot, bundleName, fail)) {
        const importPath = importArtifactPath(bundleDir, artifact.uuid, importBase);
        if (!fs.existsSync(importPath)) {
            missing.push(path.relative(bundleDir, importPath));
        } else if (!isRuntimeImportJson(importPath)) {
            missing.push(path.relative(bundleDir, importPath) + ' is not runtime import JSON');
        }
        if (artifact.native && !findNativeArtifact(bundleDir, artifact.uuid, nativeBase)) {
            missing.push(path.join(nativeBase, artifact.uuid.slice(0, 2), `${artifact.uuid}.*`));
        }
    }
    if (missing.length) {
        failWith(fail, `${bundleName} 分包缺少源资源产物: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' ...' : ''}`);
    }
}

function assertBundleNativeFilesExist(bundleDir, bundleName, fail) {
    const configPath = findBundleConfigPath(bundleDir);
    if (!fs.existsSync(configPath)) {
        failWith(fail, `${bundleName} bundle config 不存在: ${configPath}`);
        return;
    }
    const config = readJson(configPath);
    const uuids = Array.isArray(config.uuids) ? config.uuids : [];
    const nativeVersions = config.versions && Array.isArray(config.versions.native)
        ? config.versions.native
        : [];
    const nativeBase = typeof config.nativeBase === 'string' && config.nativeBase
        ? config.nativeBase
        : 'native';

    if (nativeVersions.length % 2 !== 0) {
        failWith(fail, `${bundleName} versions.native 格式不正确: ${configPath}`);
        return;
    }

    for (let i = 0; i < nativeVersions.length; i += 2) {
        const uuidIndex = nativeVersions[i];
        const version = String(nativeVersions[i + 1] || '');
        const compressedUuid = uuids[uuidIndex];
        if (typeof compressedUuid !== 'string' || !compressedUuid) {
            failWith(fail, `${bundleName} versions.native 引用了不存在的 uuid index: ${uuidIndex}`);
            return;
        }

        const nativeUuid = decodeUuid(compressedUuid).split('@')[0];
        const nativeDir = path.join(bundleDir, nativeBase, nativeUuid.slice(0, 2));
        if (!fs.existsSync(nativeDir)) {
            failWith(fail, `${bundleName} native 目录缺失: ${path.join(nativeBase, nativeUuid.slice(0, 2))}`);
            return;
        }

        const prefix = version ? `${nativeUuid}.${version}.` : `${nativeUuid}.`;
        const matches = fs.readdirSync(nativeDir).filter((fileName) => fileName.startsWith(prefix));
        if (matches.length < 1) {
            failWith(fail, `${bundleName} native 文件缺失: ${path.join(nativeBase, nativeUuid.slice(0, 2), prefix + '*')}`);
            return;
        }
    }
}

module.exports = {
    assertBundleNativeFilesExist,
    assertSourceBundleArtifactsExist,
    collectSourceBundleArtifacts,
    decodeUuid,
    findNativeArtifact,
    importArtifactPath,
    isRuntimeImportJson,
};
