#!/usr/bin/env node
/**
 * 图片优化脚本（Phase 1）
 *
 * 行为：
 * 1. 扫描 assets/BootstrapBundle 和 assets/GameAssetsBundle 下的 .png
 * 2. 按规则压缩：
 *    - 无 alpha 且大小 > MIN_BYTES → JPEG q85 (用 sips)
 *    - 有 alpha 的 PNG 保持 PNG，避免微信开发者工具/Cocos WebP 兼容风险
 *    - bean-atlas / effects-atlas 等带 alpha 图集保持 PNG
 * 3. 同步重写 .meta 文件中的 files 字段，把 .png 替换为新扩展
 * 4. 保留 uuid 不变
 *
 * Usage: node scripts/optimize-images.js [--dry-run] [--quality=82]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectDir = path.resolve(__dirname, '..');
const SCAN_DIRS = [
    path.join(projectDir, 'assets', 'BootstrapBundle'),
    path.join(projectDir, 'assets', 'GameAssetsBundle'),
];

const MIN_BYTES = 20 * 1024;   // 小于 20 KB 不动
const JPEG_QUALITY = 85;
const DRY_RUN = process.argv.includes('--dry-run');

function listPngs(dir) {
    const result = [];
    function walk(p) {
        for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
            const full = path.join(p, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) result.push(full);
        }
    }
    walk(dir);
    return result;
}

function hasAlpha(pngPath) {
    try {
        const out = execFileSync('sips', ['-g', 'hasAlpha', pngPath], { encoding: 'utf8' });
        return /hasAlpha:\s*yes/i.test(out);
    } catch (_) {
        return true;
    }
}

function bytesOf(p) {
    return fs.statSync(p).size;
}

function convertToJpeg(pngPath, outPath) {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(JPEG_QUALITY), pngPath, '--out', outPath], { stdio: 'pipe' });
}

function rewriteMeta(originalPngPath, newExt) {
    const metaPath = originalPngPath + '.meta';
    if (!fs.existsSync(metaPath)) return false;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (!Array.isArray(meta.files)) return false;
    const newFiles = meta.files.map((f) => (f === '.png' ? '.' + newExt : f));
    if (JSON.stringify(meta.files) === JSON.stringify(newFiles)) return false;
    meta.files = newFiles;
    if (newExt === 'jpeg' || newExt === 'jpg') {
        if (!meta.userData) meta.userData = {};
        meta.userData.hasAlpha = false;
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
    return true;
}

let totalBefore = 0;
let totalAfter = 0;
const report = [];

const SKIP_FILES = new Set([
    path.join(projectDir, 'assets', 'BootstrapBundle', 'Beans', 'bean-atlas.png'),
    path.join(projectDir, 'assets', 'GameAssetsBundle', 'Textures', 'Pindd', 'Effects', 'effects-atlas.png'),
]);

for (const dir of SCAN_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const pngs = listPngs(dir);
    for (const png of pngs) {
        const size = bytesOf(png);
        if (size < MIN_BYTES) continue;
        if (SKIP_FILES.has(png)) { console.log('[skip-atlas]', path.relative(projectDir, png)); continue; }
        const alpha = hasAlpha(png);
        if (alpha) continue;
        const ext = 'jpeg';
        const newPath = png.replace(/\.png$/i, '.' + ext);

        try {
            convertToJpeg(png, newPath);
        } catch (e) {
            console.warn('[skip] convert failed:', png, e.message);
            continue;
        }

        const newSize = bytesOf(newPath);
        // 如果转换后反而更大 5% 以内的话保留 png（罕见）
        if (newSize >= size * 0.95) {
            fs.unlinkSync(newPath);
            continue;
        }

        totalBefore += size;
        totalAfter += newSize;
        report.push({ file: path.relative(projectDir, png), ext, before: size, after: newSize });

        if (!DRY_RUN) {
            // 删除原 png；新文件已经在 newPath
            fs.unlinkSync(png);
            // 重命名 meta
            rewriteMeta(png, ext);
            // .png.meta 改名为 .<ext>.meta
            const oldMeta = png + '.meta';
            const newMeta = newPath + '.meta';
            if (fs.existsSync(oldMeta)) fs.renameSync(oldMeta, newMeta);
        } else {
            fs.unlinkSync(newPath);
        }
    }
}

report.sort((a, b) => (b.before - b.after) - (a.before - a.after));
for (const r of report) {
    const pct = (((r.before - r.after) / r.before) * 100).toFixed(0);
    console.log(`[${r.ext}] -${pct}% ${r.before} -> ${r.after}  ${r.file}`);
}

console.log('\n=== Summary ===');
console.log('files changed:', report.length);
console.log('before:', (totalBefore / 1024).toFixed(1), 'KB');
console.log('after :', (totalAfter / 1024).toFixed(1), 'KB');
console.log('saved :', ((totalBefore - totalAfter) / 1024).toFixed(1), 'KB',
    `(${((1 - totalAfter / totalBefore) * 100).toFixed(0)}%)`);
console.log(DRY_RUN ? '\n(dry-run, no files changed)' : '\n(applied)');
