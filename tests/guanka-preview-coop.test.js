'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const preview = fs.readFileSync(path.join(root, 'tools/guanka-preview.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'tools/server.py'), 'utf8');
const coopFiles = fs.readdirSync(path.join(root, 'assets/LevelData'))
    .filter(name => /^coop_level_\d+\.json$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

assert.equal(coopFiles.length, 20, 'preview must expose the current 20-level cooperation corpus');
assert.match(preview, /assets\/LevelData::coop">双人合作关卡/);
assert.match(preview, /kind: 'coop'/);
assert.match(preview, /IS_COOP_LEVEL_DIR/);
assert.match(preview, /data\?\.coopRegions\) \? data\.coopRegions\.flat\(\)/);
assert.match(preview, /col < data\.boardWidth \/ 2 \? 1 : 2/);
assert.match(preview, /双人合作第 \$\{data\.levelId\} 关/);
assert.ok(server.includes("LEVEL_FILENAME_RE = re.compile(r'^(level|lv|daily|zt_level|coop_level)_"));
assert.match(server, /return 'coop'/);
assert.match(server, /return \(f'coop_level_\{level_id\}\.json',\)/);
let explicitRegionCount = 0;
for (let levelId = 1; levelId <= 20; levelId += 1) {
    const level = JSON.parse(fs.readFileSync(path.join(root, 'assets/LevelData', `coop_level_${levelId}.json`), 'utf8'));
    assert.equal(level.levelId, levelId);
    if (Array.isArray(level.coopRegions)) {
        explicitRegionCount += 1;
        assert.equal(level.coopRegions.length, level.boardHeight);
        assert.ok(level.coopRegions.every(row => row.length === level.boardWidth));
    }
}
assert.equal(explicitRegionCount, 19, 'new cooperation levels carry explicit non-axis-aligned region maps');

console.log('guanka-preview-coop.test.js passed');
