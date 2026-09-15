'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const LEVEL_DIR = path.join(ROOT, 'assets/LevelData');
const CLOUD_LEVEL_DIR = path.join(ROOT, 'cloudfunctions/coopService/levels');
const MANIFEST = path.join(ROOT, 'assets/GameAssetsBundle/coop-manifest.json');
const mapping = [[2, 1], ...Array.from({ length: 10 }, (_, index) => [11 + index, 2 + index])];

function replaceLevelId(text, from, to) {
    const marker = new RegExp(`("levelId"\\s*:\\s*)${from}(?=\\s*[,}])`);
    assert(marker.test(text), `coop_level_${from}.json 内部关卡编号不匹配`);
    return text.replace(marker, `$1${to}`);
}

function main() {
    const write = process.argv.includes('--write');
    assert(process.argv.length === (write ? 3 : 2), 'Only --write is supported');
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const expectedCollections = ['coop_original_02', ...Array.from({ length: 10 }, (_, index) => `coop_variety_${String(index + 1).padStart(2, '0')}`)];
    const alreadyDone = manifest.levels.length === 11
        && manifest.levels.every((entry, index) => entry.levelId === index + 1 && entry.collectionId === expectedCollections[index]);
    if (alreadyDone) {
        console.log('COOP_RENUMBER_UNCHANGED: 11 levels already use IDs 1..11');
        return;
    }
    assert.equal(manifest.levels.length, 20, 'Expected the pre-migration 20-level manifest');
    const entries = new Map(manifest.levels.map(entry => [entry.levelId, entry]));
    const outputs = mapping.map(([from, to]) => {
        const entry = entries.get(from);
        assert(entry, `Missing manifest entry ${from}`);
        const source = path.join(LEVEL_DIR, entry.file);
        const levelText = replaceLevelId(fs.readFileSync(source, 'utf8'), from, to);
        const file = `coop_level_${to}.json`;
        const nextEntry = { ...entry, levelId: to, file,
            sha256: crypto.createHash('sha256').update(levelText).digest('hex') };
        return { from, to, levelText, metaText: fs.readFileSync(source + '.meta', 'utf8'), entry: nextEntry };
    });
    assert.deepEqual(outputs.map(item => item.entry.collectionId), expectedCollections);
    if (!write) {
        console.log(`COOP_RENUMBER_DRY_RUN: ${mapping.map(([from, to]) => `${from}->${to}`).join(', ')}`);
        return;
    }
    for (let id = 1; id <= 20; id++) {
        for (const suffix of ['.json', '.json.meta']) {
            const file = path.join(LEVEL_DIR, `coop_level_${id}${suffix}`);
            if (fs.existsSync(file)) fs.unlinkSync(file);
        }
        const cloudFile = path.join(CLOUD_LEVEL_DIR, `coop_level_${id}.json`);
        if (fs.existsSync(cloudFile)) fs.unlinkSync(cloudFile);
    }
    for (const output of outputs) {
        fs.writeFileSync(path.join(LEVEL_DIR, `coop_level_${output.to}.json`), output.levelText);
        fs.writeFileSync(path.join(LEVEL_DIR, `coop_level_${output.to}.json.meta`), output.metaText);
    }
    manifest.levels = outputs.map(output => output.entry);
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`COOP_RENUMBERED: ${mapping.map(([from, to]) => `${from}->${to}`).join(', ')}`);
}

if (require.main === module) main();
module.exports = { mapping, replaceLevelId };
