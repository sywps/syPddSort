#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const roots = process.argv.slice(2);
if (roots.length === 0) roots.push(path.resolve(__dirname, '..', 'assets'));

const ignoredDirs = new Set(['.git', 'build', 'library', 'node_modules', 'temp']);
const importerStarHits = [];
const invalidJsonHits = [];

function rel(filePath) {
    return path.relative(process.cwd(), filePath) || filePath;
}

function findImporterStar(value, filePath, trail) {
    if (!value || typeof value !== 'object') return;
    if (value.importer === '*') {
        importerStarHits.push(rel(filePath) + (trail ? '#' + trail : ''));
    }
    for (const [key, child] of Object.entries(value)) {
        if (child && typeof child === 'object') {
            findImporterStar(child, filePath, trail ? trail + '.' + key : key);
        }
    }
}

function inspectMeta(filePath) {
    try {
        const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        findImporterStar(json, filePath, '');
    } catch (error) {
        invalidJsonHits.push(rel(filePath) + ': ' + error.message);
    }
}

function walk(targetPath) {
    if (!fs.existsSync(targetPath)) throw new Error('path does not exist: ' + targetPath);
    const stat = fs.statSync(targetPath);
    if (stat.isFile()) {
        if (targetPath.endsWith('.meta')) inspectMeta(targetPath);
        return;
    }
    if (!stat.isDirectory()) return;
    for (const item of fs.readdirSync(targetPath, { withFileTypes: true })) {
        if (item.isDirectory() && ignoredDirs.has(item.name)) continue;
        walk(path.join(targetPath, item.name));
    }
}

for (const root of roots) walk(path.resolve(root));

if (invalidJsonHits.length > 0) {
    console.error('ERROR: invalid Cocos .meta JSON files found:');
    for (const hit of invalidJsonHits.slice(0, 50)) console.error('  - ' + hit);
    if (invalidJsonHits.length > 50) console.error('  ... and ' + (invalidJsonHits.length - 50) + ' more');
    process.exit(1);
}

if (importerStarHits.length > 0) {
    console.error('ERROR: Cocos .meta files contain importer "*":');
    for (const hit of importerStarHits.slice(0, 50)) console.error('  - ' + hit);
    if (importerStarHits.length > 50) console.error('  ... and ' + (importerStarHits.length - 50) + ' more');
    process.exit(1);
}

console.log('OK Cocos .meta importer scan passed (' + roots.map(rel).join(', ') + ')');
