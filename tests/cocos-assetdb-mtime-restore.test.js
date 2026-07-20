const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { restoreAssetMtimes } = require('../scripts/restore-cocos-assetdb-mtimes.js');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-assetdb-mtime-test-'));
try {
    const assetsDir = path.join(tempRoot, 'assets');
    const assetPath = path.join(assetsDir, 'Scenes', 'Boot.scene');
    const infoPath = path.join(tempRoot, '.assets-info.json');
    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    fs.writeFileSync(assetPath, 'scene');
    fs.writeFileSync(infoPath, JSON.stringify({
        map: {
            Scenes: { time: 1700000000000 },
            'Scenes/Boot.scene': { time: 1700000001000 },
        },
    }));

    assert.strictEqual(restoreAssetMtimes(tempRoot, infoPath), 2);
    assert.strictEqual(Math.round(fs.statSync(assetPath).mtimeMs), 1700000001000);
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('cocos-assetdb-mtime-restore.test.js passed');
