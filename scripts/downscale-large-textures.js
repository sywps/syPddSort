#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PNG } = require('pngjs');

const projectDir = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');

const TARGETS = [
    { file: 'assets/GameAssetsBundle/Textures/BG/bg_game.png', max: 1080 },
    { file: 'assets/Textures/UI/loading_cover.jpeg', max: 960 },
    { file: 'assets/BootstrapBundle/GameUI/home_bg.jpeg', max: 960 },
    { file: 'assets/BootstrapBundle/GameUI/popup_tool_add_badge.png', max: 128, preserveSpriteFrameTrim: true },
    { file: 'assets/BootstrapBundle/GameUI/popup_ad_play_icon.png', max: 128, preserveSpriteFrameTrim: true },
    { file: 'assets/BootstrapBundle/GameUI/popup_tool_count_badge.png', max: 128, preserveSpriteFrameTrim: true },
    { file: 'assets/BootstrapBundle/GameUI/popup_primary_button.png', max: 160, preserveSpriteFrameTrim: true },
    { file: 'assets/GameAssetsBundle/Textures/UI/popup_primary_button.png', max: 160, preserveSpriteFrameTrim: true },
    { file: 'assets/HomeAssetsBundle/GameUI/home_primary_button.png', max: 160, preserveSpriteFrameTrim: true },
];

function readPngSize(imagePath) {
    const png = PNG.sync.read(fs.readFileSync(imagePath));
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
    throw new Error(`jpeg dimensions not found: ${imagePath}`);
}

function readImageSize(imagePath) {
    return /\.png$/i.test(imagePath) ? readPngSize(imagePath) : readJpegSize(imagePath);
}

function estimateRgbaMb(size) {
    return (size.width * size.height * 4 / 1024 / 1024);
}

function roundMetaNumber(value) {
    return Math.round(value * 1000) / 1000;
}

function scalePairArray(values, scaleX, scaleY) {
    if (!Array.isArray(values)) return values;
    return values.map((value, index) => {
        if (index % 3 === 2) return value;
        return roundMetaNumber(value * (index % 3 === 0 ? scaleX : scaleY));
    });
}

function scaleUvArray(values, scaleX, scaleY) {
    if (!Array.isArray(values)) return values;
    return values.map((value, index) => roundMetaNumber(value * (index % 2 === 0 ? scaleX : scaleY)));
}

function scaleSpriteFrameUserData(userData, before, after, preserveTrim) {
    if (!preserveTrim) {
        const halfW = after.width / 2;
        const halfH = after.height / 2;
        userData.width = after.width;
        userData.height = after.height;
        userData.rawWidth = after.width;
        userData.rawHeight = after.height;
        userData.offsetX = 0;
        userData.offsetY = 0;
        userData.trimX = 0;
        userData.trimY = 0;
        if (!userData.vertices) userData.vertices = {};
        userData.vertices.rawPosition = [
            -halfW, -halfH, 0,
            halfW, -halfH, 0,
            -halfW, halfH, 0,
            halfW, halfH, 0,
        ];
        userData.vertices.indexes = [0, 1, 2, 2, 1, 3];
        userData.vertices.uv = [
            0, after.height,
            after.width, after.height,
            0, 0,
            after.width, 0,
        ];
        userData.vertices.nuv = [0, 0, 1, 0, 0, 1, 1, 1];
        userData.vertices.minPos = [-halfW, -halfH, 0];
        userData.vertices.maxPos = [halfW, halfH, 0];
        return;
    }

    const scaleX = after.width / before.width;
    const scaleY = after.height / before.height;
    userData.width = Math.max(1, Math.round((userData.width || before.width) * scaleX));
    userData.height = Math.max(1, Math.round((userData.height || before.height) * scaleY));
    userData.rawWidth = after.width;
    userData.rawHeight = after.height;
    userData.offsetX = roundMetaNumber((userData.offsetX || 0) * scaleX);
    userData.offsetY = roundMetaNumber((userData.offsetY || 0) * scaleY);
    userData.trimX = Math.max(0, Math.round((userData.trimX || 0) * scaleX));
    userData.trimY = Math.max(0, Math.round((userData.trimY || 0) * scaleY));
    if (userData.trimX + userData.width > after.width) {
        userData.width = Math.max(1, after.width - userData.trimX);
    }
    if (userData.trimY + userData.height > after.height) {
        userData.height = Math.max(1, after.height - userData.trimY);
    }

    if (!userData.vertices) userData.vertices = {};
    userData.vertices.rawPosition = scalePairArray(userData.vertices.rawPosition, scaleX, scaleY);
    userData.vertices.uv = scaleUvArray(userData.vertices.uv, scaleX, scaleY);
    userData.vertices.minPos = scalePairArray(userData.vertices.minPos, scaleX, scaleY);
    userData.vertices.maxPos = scalePairArray(userData.vertices.maxPos, scaleX, scaleY);
    if (!Array.isArray(userData.vertices.indexes)) {
        userData.vertices.indexes = [0, 1, 2, 2, 1, 3];
    }
}

function updateSpriteFrameMeta(imagePath, before, after, target) {
    const metaPath = `${imagePath}.meta`;
    if (!fs.existsSync(metaPath)) {
        return false;
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    let changed = false;
    for (const item of Object.values(meta.subMetas || {})) {
        if (!item || item.importer !== 'sprite-frame') continue;
        const userData = item.userData || {};
        scaleSpriteFrameUserData(userData, before, after, Boolean(target.preserveSpriteFrameTrim));
        item.userData = userData;
        changed = true;
    }
    if (changed && apply) {
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
    }
    return changed;
}

function downscaleOne(target) {
    const imagePath = path.join(projectDir, target.file);
    if (!fs.existsSync(imagePath)) {
        throw new Error(`missing texture: ${target.file}`);
    }
    const before = readImageSize(imagePath);
    const beforeBytes = fs.statSync(imagePath).size;
    const beforeMb = estimateRgbaMb(before);
    const shouldResize = Math.max(before.width, before.height) > target.max;
    if (!shouldResize) {
        return {
            file: target.file,
            skipped: true,
            before,
            after: before,
            beforeBytes,
            afterBytes: beforeBytes,
            beforeMb,
            afterMb: beforeMb,
        };
    }
    const ext = path.extname(imagePath);
    const tempPath = `${imagePath}.tmp-resize${ext}`;
    execFileSync('sips', ['-Z', String(target.max), imagePath, '--out', tempPath], { stdio: 'pipe' });
    const after = readImageSize(tempPath);
    const afterBytes = fs.statSync(tempPath).size;
    const afterMb = estimateRgbaMb(after);
    if (apply) {
        fs.renameSync(tempPath, imagePath);
        updateSpriteFrameMeta(imagePath, before, after, target);
    } else {
        fs.unlinkSync(tempPath);
    }
    return {
        file: target.file,
        skipped: false,
        before,
        after,
        beforeBytes,
        afterBytes,
        beforeMb,
        afterMb,
    };
}

console.log(`Large texture downscale ${apply ? '(apply)' : '(dry-run)'}`);
let totalBeforeMb = 0;
let totalAfterMb = 0;
for (const target of TARGETS) {
    const result = downscaleOne(target);
    totalBeforeMb += result.beforeMb;
    totalAfterMb += result.afterMb;
    const status = result.skipped ? 'skip' : 'resize';
    const saved = result.beforeMb - result.afterMb;
    console.log([
        `[${status}]`,
        result.before.width + 'x' + result.before.height,
        '->',
        result.after.width + 'x' + result.after.height,
        `${result.beforeMb.toFixed(2)}MB`,
        '->',
        `${result.afterMb.toFixed(2)}MB`,
        `saved=${saved.toFixed(2)}MB`,
        target.file,
    ].join(' '));
}
console.log(`Total estimated RGBA: ${totalBeforeMb.toFixed(2)}MB -> ${totalAfterMb.toFixed(2)}MB, saved ${(totalBeforeMb - totalAfterMb).toFixed(2)}MB`);
if (!apply) {
    console.log('Dry-run only. Re-run with --apply to modify textures and meta files.');
}
