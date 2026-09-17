const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { copyBuiltSpriteFrameArtifact } = require('../scripts/patch-bootstrap-dynamic-assets');

const root = fs.mkdtempSync(path.join(path.resolve(__dirname, '../temp'), 'spriteframe-format-'));
const source = path.join(root, 'source');
const target = path.join(root, 'target');
const uuid = 'frame@f9941';
function write(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
}
try {
    const raw = { __type__: 'cc.SpriteFrame', content: { name: 'shade', texture: 'texture@6c48a' } };
    const section = [[{ name: 'shade' }], [0], 0, [0], [0], [1]];
    const tables = [1, ['unrelated', 'texture@6c48a'], ['_textureSource'], ['cc.SpriteFrame'], 0];
    write(path.join(source, 'config.json'), { uuids: [uuid], packs: { pack: [0] } });
    write(path.join(source, 'import/pa/pack.json'), [...tables, [section]]);
    write(path.join(source, 'import/fr/frame@f9941.json'), raw);
    write(path.join(target, 'import/fr/frame@f9941.oldhash.json'), raw);
    copyBuiltSpriteFrameArtifact(source, uuid, target);
    const file = path.join(target, 'import/fr/frame@f9941.json');
    const compiled = JSON.parse(fs.readFileSync(file));
    assert.deepEqual(compiled, [...tables, ...section]);
    // BUILD ignores content.texture; the serialized dependency must bind the texture setter.
    const frame = { name: compiled[5][0].name };
    const texture = { getHash: () => 42 };
    const assets = { 'texture@6c48a': texture };
    for (let i = 0; i < compiled[10].length; i++) {
        frame[compiled[2][compiled[9][i]]] = assets[compiled[1][compiled[10][i]]];
    }
    assert.equal(frame._textureSource.getHash(), 42);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target, 'import/fr/frame@f9941.oldhash.json'))), compiled);
    copyBuiltSpriteFrameArtifact(source, uuid, target);
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), compiled);
    write(path.join(source, 'config.json'), { uuids: [uuid], packs: {} });
    assert.throws(() => copyBuiltSpriteFrameArtifact(source, uuid, target), /editor cache forbidden/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), compiled, 'failure must preserve the valid output');
    console.log('bootstrap-spriteframe-build-format.test.js passed');
} finally {
    // Only the directory returned by mkdtempSync above is removed.
    fs.rmSync(root, { recursive: true, force: true });
}
