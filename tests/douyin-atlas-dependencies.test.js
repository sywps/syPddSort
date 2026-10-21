'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const { repairAtlasDependencies, verifyAtlasDependencies } = require('../scripts/repair-douyin-atlas-dependencies');
const plan = path.resolve('.planning/douyin-dev-launch-20261011'); fs.mkdirSync(plan, { recursive: true });
const root = fs.mkdtempSync(path.join(plan, 'atlas-fixture-'));
const texture = '1bf0b9ca5@6c48a', image = '1bf0b9ca5';
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
try {
    const home = path.join(root, 'homeAssets'), source = path.join(root, 'gameAssets');
    const base = { uuids: [], paths: {}, types: [], packs: {}, versions: { import: [], native: [] }, debug: false, deps: [], redirect: [] };
    write(path.join(home, 'config.json'), { ...base, name: 'homeAssets' });
    write(path.join(home, 'config.abc12.json'), { ...base, name: 'homeAssets' });
    write(path.join(home, 'import/05/home.json'), [1, [texture], ['_textureSource'], ['cc.SpriteFrame'], 0, []]);
    write(path.join(source, 'config.json'), { ...base, name: 'gameAssets', uuids: [texture, image, 'pack'],
        packs: { pack: [0] }, versions: { import: [1, 'img', 2, 'packhash'], native: [1, 'pnghash'] } });
    write(path.join(source, 'import/pa/pack.packhash.json'), { type: 'cc.Texture2D', data: [['2,2,2,2,0,0', [image]]] });
    write(path.join(source, 'import/1b/' + image + '.img.json'), [1, 0, 0, ['cc.ImageAsset'], 0, [{ fmt: '0', w: 2, h: 2 }]]);
    fs.mkdirSync(path.join(source, 'native/1b'), { recursive: true });
    fs.writeFileSync(path.join(source, 'native/1b/' + image + '.pnghash.png'), Buffer.from('test atlas bytes'));
    assert.throws(() => verifyAtlasDependencies(root), /not registered/);
    const result = repairAtlasDependencies(root);
    assert.equal(result.repaired.length, 1);
    assert.deepEqual(verifyAtlasDependencies(root), [{ bundle: 'homeAssets', texture }]);
    assert.equal(repairAtlasDependencies(root).repaired.length, 0, 'idempotent');
    assert.equal(fs.readFileSync(path.join(home, 'config.json'), 'utf8'), fs.readFileSync(path.join(home, 'config.abc12.json'), 'utf8'));
    const file = path.join(home, 'native/1b/' + image + '.pnghash.png');
    assert(fs.readFileSync(file).equals(fs.readFileSync(path.join(source, 'native/1b/' + image + '.pnghash.png'))));
    fs.unlinkSync(file); assert.throws(() => verifyAtlasDependencies(root), /native missing/);
    write(path.join(home, 'config.json'), { ...base, name: 'homeAssets' });
    fs.unlinkSync(path.join(source, 'native/1b/' + image + '.pnghash.png'));
    assert.throws(() => repairAtlasDependencies(root), /native missing/);
} finally {
    if (path.dirname(root) !== plan || !path.basename(root).startsWith('atlas-fixture-')) throw Error('Unsafe cleanup');
    fs.rmSync(root, { recursive: true });
}
if (process.argv[2]) {
    const source = path.resolve(process.argv[2]);
    assert.throws(() => verifyAtlasDependencies(source), /homeAssets\/1bf0b9ca5@6c48a/, 'real r1 must reproduce screenshot failure');
    const copy = fs.mkdtempSync(path.join(plan, 'atlas-r1-'));
    // Copy only config/import/native, excluding scripts and unrelated assets.
    for (const item of fs.readdirSync(path.join(source, 'subpackages'))) {
        const bundle = path.join(source, 'subpackages', item);
        if (!fs.existsSync(path.join(bundle, 'config.json'))) continue;
        for (const name of fs.readdirSync(bundle).filter(x => x === 'import' || x === 'native' || /^config(?:\.[a-f0-9]+)?\.json$/i.test(x))) {
            fs.cpSync(path.join(bundle, name), path.join(copy, item, name), { recursive: true });
        }
    }
    const result = repairAtlasDependencies(copy);
    assert(result.repaired.some(x => x.bundle === 'homeAssets' && x.texture === texture));
    console.log('Real r1 reproduction repaired in isolated copy:', JSON.stringify(result));
}
console.log('PASS atlas dependency closure: packed Texture2D, versioned image/native, config mirrors, missing native and idempotence');
