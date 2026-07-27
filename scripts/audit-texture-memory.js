#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const projectDir = path.resolve(__dirname, '..');
const scanRoots = [
    ['bootstrap', path.join(projectDir, 'assets', 'BootstrapBundle')],
    ['homeAssets', path.join(projectDir, 'assets', 'HomeAssetsBundle')],
    ['gameAssets', path.join(projectDir, 'assets', 'GameAssetsBundle')],
    ['main', path.join(projectDir, 'assets', 'Textures')],
    ['levelData', path.join(projectDir, 'assets', 'LevelData')],
];

const args = new Map();
for (const rawArg of process.argv.slice(2)) {
    const match = rawArg.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) args.set(match[1], match[2] ?? '1');
}

const topLimit = Math.max(1, Number(args.get('top')) || 40);
const minMb = Math.max(0, Number(args.get('min-mb')) || 0);
const onlyBundle = String(args.get('bundle') || '').trim();

function walk(dir, out) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, out);
        } else if (entry.isFile() && /\.(png|jpe?g)$/i.test(entry.name)) {
            out.push(full);
        }
    }
}

function bytesToMb(bytes) {
    return bytes / 1024 / 1024;
}

function formatMb(bytes) {
    return bytesToMb(bytes).toFixed(2);
}

function readMetaInfo(imagePath) {
    const metaPath = `${imagePath}.meta`;
    if (!fs.existsSync(metaPath)) return {};
    try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        const subMetas = Object.values(meta.subMetas || {});
        const spriteFrame = subMetas.find((item) => item && item.importer === 'sprite-frame') || null;
        const userData = spriteFrame?.userData || {};
        return {
            width: Number(userData.rawWidth || userData.width || 0) || 0,
            height: Number(userData.rawHeight || userData.height || 0) || 0,
            hasAlpha: typeof meta.userData?.hasAlpha === 'boolean' ? meta.userData.hasAlpha : null,
            packable: typeof userData.packable === 'boolean' ? userData.packable : null,
            trimType: userData.trimType || '',
        };
    } catch (error) {
        return { metaError: error.message };
    }
}

function readPngSize(imagePath) {
    const buffer = fs.readFileSync(imagePath);
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height };
}

function readJpegSize(imagePath) {
    const buffer = fs.readFileSync(imagePath);
    let offset = 2;
    while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (isSof) {
            return {
                height: buffer.readUInt16BE(offset + 5),
                width: buffer.readUInt16BE(offset + 7),
            };
        }
        offset += 2 + length;
    }
    throw new Error('jpeg dimensions not found');
}

function readImageSize(imagePath) {
    if (/\.png$/i.test(imagePath)) return readPngSize(imagePath);
    return readJpegSize(imagePath);
}

function estimateAstcBytes(width, height, blockSize) {
    return Math.ceil(width / blockSize) * Math.ceil(height / blockSize) * 16;
}

function estimateEtc2RgbaBytes(width, height) {
    return Math.ceil(width / 4) * Math.ceil(height / 4) * 8;
}

function collectRecords() {
    const records = [];
    for (const [bundle, root] of scanRoots) {
        if (onlyBundle && bundle !== onlyBundle) continue;
        const images = [];
        walk(root, images);
        for (const imagePath of images) {
            const meta = readMetaInfo(imagePath);
            let width = meta.width || 0;
            let height = meta.height || 0;
            let sizeError = '';
            if (!width || !height) {
                try {
                    const size = readImageSize(imagePath);
                    width = size.width;
                    height = size.height;
                } catch (error) {
                    sizeError = error.message;
                }
            }
            if (!width || !height) {
                records.push({
                    bundle,
                    file: path.relative(projectDir, imagePath),
                    width,
                    height,
                    fileBytes: fs.statSync(imagePath).size,
                    rgbaBytes: 0,
                    hasAlpha: meta.hasAlpha,
                    packable: meta.packable,
                    issue: sizeError || meta.metaError || 'missing dimensions',
                });
                continue;
            }
            const rgbaBytes = width * height * 4;
            if (bytesToMb(rgbaBytes) < minMb) continue;
            records.push({
                bundle,
                file: path.relative(projectDir, imagePath),
                width,
                height,
                fileBytes: fs.statSync(imagePath).size,
                rgbaBytes,
                astc6x6Bytes: estimateAstcBytes(width, height, 6),
                etc2RgbaBytes: estimateEtc2RgbaBytes(width, height),
                hasAlpha: meta.hasAlpha,
                packable: meta.packable,
                issue: meta.metaError || '',
            });
        }
    }
    return records.sort((a, b) => b.rgbaBytes - a.rgbaBytes);
}

const records = collectRecords();
const grouped = new Map();
for (const record of records) {
    const current = grouped.get(record.bundle) || { count: 0, fileBytes: 0, rgbaBytes: 0 };
    current.count += 1;
    current.fileBytes += record.fileBytes;
    current.rgbaBytes += record.rgbaBytes;
    grouped.set(record.bundle, current);
}

console.log('Texture memory audit (read-only)');
console.log(`Project: ${projectDir}`);
console.log(`Filters: top=${topLimit}, min-mb=${minMb}${onlyBundle ? `, bundle=${onlyBundle}` : ''}`);
console.log('');
console.log('Bundle totals');
for (const [bundle, total] of grouped.entries()) {
    console.log(`${bundle.padEnd(12)} images=${String(total.count).padStart(3)} fileMB=${formatMb(total.fileBytes).padStart(7)} rgbaMB=${formatMb(total.rgbaBytes).padStart(8)}`);
}

console.log('');
console.log('Top texture upload memory candidates');
console.log('rgbaMB  astc6x6MB  etc2MB  fileKB  size        alpha  bundle       file');
for (const record of records.slice(0, topLimit)) {
    const alpha = record.hasAlpha === null ? '?' : record.hasAlpha ? 'yes' : 'no';
    console.log([
        formatMb(record.rgbaBytes).padStart(6),
        formatMb(record.astc6x6Bytes || 0).padStart(10),
        formatMb(record.etc2RgbaBytes || 0).padStart(6),
        String(Math.round(record.fileBytes / 1024)).padStart(6),
        `${record.width}x${record.height}`.padEnd(11),
        alpha.padEnd(5),
        record.bundle.padEnd(11),
        record.file,
    ].join('  '));
}

const errored = records.filter((record) => record.issue);
if (errored.length > 0) {
    console.log('');
    console.log('Records with metadata/dimension issues');
    for (const record of errored.slice(0, 20)) {
        console.log(`${record.file}: ${record.issue}`);
    }
}
