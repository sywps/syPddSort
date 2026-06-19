#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectDir = path.resolve(__dirname, '..');

const args = new Map();
for (const rawArg of process.argv.slice(2)) {
    const match = rawArg.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) args.set(match[1], match[2] ?? '1');
}

const target = String(args.get('target') || 'wechat').trim();
const minKb = Math.max(0, Number(args.get('min-kb')) || 0);
const topLimit = Math.max(1, Number(args.get('top')) || 40);
const explicitRoot = args.get('root') ? path.resolve(projectDir, String(args.get('root'))) : '';

const sourceRoots = [
    path.join(projectDir, 'assets', 'BootstrapBundle'),
    path.join(projectDir, 'assets', 'HomeAssetsBundle'),
    path.join(projectDir, 'assets', 'GameAssetsBundle'),
    path.join(projectDir, 'assets', 'Textures'),
    path.join(projectDir, 'settings'),
];

function resolveWechatRoot() {
    const nested = path.join(projectDir, 'build', 'wechatgame', 'minigame');
    if (fs.existsSync(nested)) return nested;
    return path.join(projectDir, 'build', 'wechatgame');
}

function uniqueExistingRoots(roots) {
    const seen = new Set();
    const result = [];
    for (const root of roots) {
        const normalized = path.resolve(root);
        if (seen.has(normalized) || !fs.existsSync(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}

function getScanRoots() {
    if (explicitRoot) return uniqueExistingRoots([explicitRoot]);
    if (target === 'source') return uniqueExistingRoots(sourceRoots);
    if (target === 'wechat') return uniqueExistingRoots([resolveWechatRoot()]);
    throw new Error(`Unsupported target: ${target}. Use --target=source or --target=wechat.`);
}

function walkImages(dir, out) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkImages(full, out);
        } else if (entry.isFile() && /\.(png|jpe?g)$/i.test(entry.name)) {
            out.push(full);
        }
    }
}

function hashFile(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
}

function formatKb(bytes) {
    return (bytes / 1024).toFixed(1);
}

function relativeFile(filePath) {
    return path.relative(projectDir, filePath).split(path.sep).join('/');
}

function collectDuplicateGroups(roots) {
    const files = [];
    for (const root of roots) walkImages(root, files);

    const groups = new Map();
    for (const file of files) {
        const hash = hashFile(file);
        const stat = fs.statSync(file);
        const group = groups.get(hash) || { hash, files: [], bytes: stat.size };
        group.files.push({ path: relativeFile(file), bytes: stat.size });
        group.bytes = Math.max(group.bytes, stat.size);
        groups.set(hash, group);
    }

    return Array.from(groups.values())
        .filter((group) => group.files.length > 1)
        .map((group) => ({
            hash: group.hash,
            copies: group.files.length,
            bytes: group.bytes,
            wastedBytes: group.files.slice(1).reduce((sum, file) => sum + file.bytes, 0),
            files: group.files.sort((a, b) => a.path.localeCompare(b.path)),
        }))
        .filter((group) => group.wastedBytes / 1024 >= minKb)
        .sort((a, b) => b.wastedBytes - a.wastedBytes);
}

function main() {
    const roots = getScanRoots();
    const groups = collectDuplicateGroups(roots);
    const totalWaste = groups.reduce((sum, group) => sum + group.wastedBytes, 0);

    console.log('Image duplicate audit (read-only)');
    console.log(`Project: ${projectDir}`);
    console.log(`Target: ${target}${explicitRoot ? ` (${relativeFile(explicitRoot)})` : ''}`);
    console.log(`Roots: ${roots.map(relativeFile).join(', ') || '<none>'}`);
    console.log(`Duplicate groups: ${groups.length}`);
    console.log(`Duplicate waste: ${formatKb(totalWaste)}KB`);
    console.log('');

    for (const group of groups.slice(0, topLimit)) {
        console.log(`${formatKb(group.wastedBytes).padStart(8)}KB wasted  copies=${group.copies}  one=${formatKb(group.bytes)}KB  hash=${group.hash.slice(0, 12)}`);
        for (const file of group.files) {
            console.log(`  ${file.path}`);
        }
        console.log('');
    }
}

try {
    main();
} catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
}
