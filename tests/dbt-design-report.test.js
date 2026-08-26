'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const analysis = JSON.parse(fs.readFileSync(path.join(root, 'tools/dbt/dbt_level_analysis.json'), 'utf8'));
const report = fs.readFileSync(path.join(root, 'tools/dbt/dbt-level-design-report.html'), 'utf8');

assert.equal(analysis.summary.count, 182);
assert.equal(analysis.levels.length, 182);
assert.equal(Object.values(analysis.summary.categoryCounts).reduce((sum, value) => sum + value, 0), 182);
assert.equal(Object.values(analysis.summary.tierCounts).reduce((sum, value) => sum + value, 0), 182);
assert.equal(analysis.summary.fullBoardCount, 73);
assert.equal(analysis.summary.fullyDisplacedCount, 121);
assert.equal(analysis.summary.hardCount, 48);
assert.match(report, /<title>DBT 182 关 · 关卡设计解剖<\/title>/);
assert.match(report, /const DATA=\{"methodVersion":1/);
assert.match(report, /const BOARDS=\{"1":/);
assert.doesNotMatch(report, /__ANALYSIS__|__BOARDS__|__PALETTE__/);
assert.doesNotMatch(report, /fetch\(|XMLHttpRequest|WebSocket/);
assert.ok(Buffer.byteLength(report) < 500_000, 'report should remain a compact standalone file');

console.log('DBT design report tests passed');
