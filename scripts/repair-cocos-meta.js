#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const roots = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['assets'];

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walk(full, out);
        else if (full.endsWith('.meta')) out.push(full);
    }
    return out;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function relativeToRoot(filePath) {
    return path.relative(root, filePath).split(path.sep).join('/');
}

function readTrackedMeta(metaPath) {
    try {
        const relPath = relativeToRoot(metaPath);
        const content = execFileSync('git', ['show', 'HEAD:' + relPath], {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const data = JSON.parse(content);
        if (data && data.importer && data.importer !== '*') return content;
    } catch (err) {
        // Untracked generated meta files fall back to deterministic reconstruction.
    }
    return null;
}

function pngSize(filePath) {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(filePath) {
    const buf = fs.readFileSync(filePath);
    let offset = 2;
    while (offset + 9 < buf.length) {
        if (buf[offset] !== 0xff) break;
        const marker = buf[offset + 1];
        const len = buf.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) };
        }
        offset += 2 + len;
    }
    return null;
}

function imageSize(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') return pngSize(filePath);
    if (ext === '.jpg' || ext === '.jpeg') return jpegSize(filePath);
    return null;
}

function imageMeta(meta, assetPath) {
    const uuid = meta.uuid;
    const displayName = path.basename(assetPath, path.extname(assetPath));
    const size = imageSize(assetPath) || { width: 1, height: 1 };
    const halfW = size.width / 2;
    const halfH = size.height / 2;
    return {
        ver: '1.0.27',
        importer: 'image',
        imported: true,
        uuid,
        files: ['.json', path.extname(assetPath).toLowerCase()],
        subMetas: {
            '6c48a': {
                importer: 'texture',
                uuid: uuid + '@6c48a',
                displayName,
                id: '6c48a',
                name: 'texture',
                userData: {
                    wrapModeS: 'clamp-to-edge',
                    wrapModeT: 'clamp-to-edge',
                    imageUuidOrDatabaseUri: uuid,
                    isUuid: true,
                    visible: false,
                    minfilter: 'linear',
                    magfilter: 'linear',
                    mipfilter: 'none',
                    anisotropy: 0,
                },
                ver: '1.0.22',
                imported: true,
                files: ['.json'],
                subMetas: {},
            },
            f9941: {
                importer: 'sprite-frame',
                uuid: uuid + '@f9941',
                displayName,
                id: 'f9941',
                name: 'spriteFrame',
                userData: {
                    trimThreshold: 1,
                    rotated: false,
                    offsetX: 0,
                    offsetY: 0,
                    trimX: 0,
                    trimY: 0,
                    width: size.width,
                    height: size.height,
                    rawWidth: size.width,
                    rawHeight: size.height,
                    borderTop: 0,
                    borderBottom: 0,
                    borderLeft: 0,
                    borderRight: 0,
                    packable: true,
                    pixelsToUnit: 100,
                    pivotX: 0.5,
                    pivotY: 0.5,
                    meshType: 0,
                    vertices: {
                        rawPosition: [-halfW, -halfH, 0, halfW, -halfH, 0, -halfW, halfH, 0, halfW, halfH, 0],
                        indexes: [0, 1, 2, 2, 1, 3],
                        uv: [0, size.height, size.width, size.height, 0, 0, size.width, 0],
                        nuv: [0, 0, 1, 0, 0, 1, 1, 1],
                        minPos: [-halfW, -halfH, 0],
                        maxPos: [halfW, halfH, 0],
                    },
                    isUuid: true,
                    imageUuidOrDatabaseUri: uuid + '@6c48a',
                    atlasUuid: '',
                    trimType: 'auto',
                },
                ver: '1.0.12',
                imported: true,
                files: ['.json'],
                subMetas: {},
            },
        },
        userData: {
            type: 'sprite-frame',
            hasAlpha: true,
            fixAlphaTransparencyArtifacts: false,
            redirect: uuid + '@6c48a',
        },
    };
}

function repair(metaPath) {
    const assetPath = metaPath.slice(0, -5);
    const meta = readJson(metaPath);
    if (meta.importer !== '*') return false;
    const trackedMeta = readTrackedMeta(metaPath);
    if (trackedMeta) {
        fs.writeFileSync(metaPath, trackedMeta.endsWith('\n') ? trackedMeta : trackedMeta + '\n');
        return true;
    }
    const ext = fs.existsSync(assetPath) && fs.statSync(assetPath).isDirectory() ? '<dir>' : path.extname(assetPath).toLowerCase();
    let next = null;
    if (ext === '<dir>') next = { ver: '1.2.0', importer: 'directory', imported: true, uuid: meta.uuid, files: [], subMetas: {}, userData: meta.userData || {} };
    else if (ext === '.json') next = { ver: '2.0.1', importer: 'json', imported: true, uuid: meta.uuid, files: ['.json'], subMetas: {}, userData: meta.userData || {} };
    else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') next = imageMeta(meta, assetPath);
    else if (ext === '.mp3' || ext === '.wav') next = { ver: '1.0.0', importer: 'audio-clip', imported: true, uuid: meta.uuid, files: ['.json', ext], subMetas: {}, userData: { downloadMode: 0 } };
    else if (ext === '.ts') next = { ver: '4.0.24', importer: 'typescript', imported: true, uuid: meta.uuid, files: [], subMetas: {}, userData: meta.userData || {} };
    else if (ext === '.scene') next = { ver: '1.1.50', importer: 'scene', imported: true, uuid: meta.uuid, files: ['.json'], subMetas: {}, userData: meta.userData || {} };
    else if (ext === '.md') next = { ver: '1.0.1', importer: 'text', imported: true, uuid: meta.uuid, files: ['.json'], subMetas: {}, userData: meta.userData || {} };
    if (!next) throw new Error('Unsupported meta asset type: ' + path.relative(root, assetPath));
    writeJson(metaPath, next);
    return true;
}

let count = 0;
for (const input of roots) {
    const target = path.resolve(root, input);
    for (const metaPath of walk(target)) {
        if (repair(metaPath)) count += 1;
    }
}
console.log('Repaired Cocos meta files: ' + count);
