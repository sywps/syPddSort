#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function fail(message) {
    throw new Error(message);
}

function restoreAssetMtimes(projectDir, assetInfoPath) {
    const assetsDir = path.join(projectDir, 'assets');
    const info = JSON.parse(fs.readFileSync(assetInfoPath, 'utf8'));
    if (!info || !info.map || typeof info.map !== 'object') {
        fail('AssetDB inventory is invalid: ' + assetInfoPath);
    }

    const missing = [];
    let restored = 0;
    for (const [relativePath, entry] of Object.entries(info.map)) {
        const targetPath = path.resolve(assetsDir, relativePath);
        if (!targetPath.startsWith(assetsDir + path.sep)) fail('Unsafe AssetDB path: ' + relativePath);
        if (!entry || !Number.isFinite(entry.time)) fail('AssetDB mtime is invalid: ' + relativePath);
        if (!fs.existsSync(targetPath)) {
            missing.push(relativePath);
            continue;
        }
        const stat = fs.statSync(targetPath);
        fs.utimesSync(targetPath, stat.atimeMs / 1000, entry.time / 1000);
        restored += 1;
    }
    if (missing.length > 0) {
        fail('AssetDB inventory references missing assets: ' + missing.slice(0, 20).join(', '));
    }
    return restored;
}

function main() {
    const projectDir = path.resolve(process.argv[2] || path.join(__dirname, '..'));
    const assetInfoPath = path.resolve(
        process.argv[3] || path.join(projectDir, 'library', '.assets-info.json'),
    );
    const restored = restoreAssetMtimes(projectDir, assetInfoPath);
    console.log('Restored Cocos AssetDB mtimes: ' + restored);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error('ERROR: ' + (error && error.message ? error.message : String(error)));
        process.exitCode = 1;
    }
}

module.exports = { restoreAssetMtimes };
