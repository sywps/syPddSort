'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    buildBundleSourceRecord,
    localizeRedirectedBundleEntries,
} = require('../scripts/patch-bootstrap-dynamic-assets.js');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-localized-redirect-'));
const sourceRoot = path.join(tempRoot, 'gameAssets');
const outputRoot = path.join(tempRoot, 'bootstrap');
const imageUuid = 'image-source';
const targetTextureUuid = 'target-texture@6c48a';
const sourcePackUuid = 'source-pack';
const sourcePackPayload = {
    type: 'cc.Texture2D',
    data: [
        ['other-record', ['other-image']],
        ['target-record', [imageUuid]],
    ],
};

function write(relativePath, content) {
    const filePath = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
}

try {
    const sourceConfig = {
        uuids: [imageUuid, 'other-texture@6c48a', targetTextureUuid, sourcePackUuid],
        paths: {},
        packs: { [sourcePackUuid]: [1, 2] },
        versions: {
            import: [0, 'imph1', 3, 'pack1'],
            native: [0, 'nat1'],
        },
        types: ['cc.ImageAsset', 'cc.Texture2D'],
    };
    write('gameAssets/import/im/image-source.imph1.json', JSON.stringify({ type: 'image-record' }));
    write('gameAssets/native/im/image-source.nat1.png', 'native-image');
    write('gameAssets/import/so/source-pack.pack1.json', JSON.stringify(sourcePackPayload));

    const targetConfig = {
        deps: ['homeAssets', 'gameAssets', 'laterAssets'],
        uuids: [targetTextureUuid, 'still-redirected'],
        paths: {},
        packs: {},
        versions: { import: [], native: [] },
        redirect: [0, '1', 1, '2'],
        dependencyRelationships: {},
        types: ['cc.ImageAsset', 'cc.Texture2D'],
    };
    const source = buildBundleSourceRecord('gameAssets', sourceRoot, sourceConfig);
    const result = localizeRedirectedBundleEntries(targetConfig, source, outputRoot);

    assert.deepEqual(result, { redirects: 1, imports: 1, native: 1, packed: 1 });
    assert.deepEqual(targetConfig.deps, ['homeAssets', 'laterAssets']);
    assert.deepEqual(targetConfig.redirect, [1, '1']);

    const miniPackId = Object.keys(targetConfig.packs).find((uuid) => uuid.startsWith('br_'));
    assert.ok(miniPackId, 'localized Texture2D must use a deterministic mini pack');
    assert.deepEqual(targetConfig.packs[miniPackId], [0]);
    assert.ok(targetConfig.uuids.includes(miniPackId));

    const miniPack = JSON.parse(fs.readFileSync(path.join(outputRoot, 'import', 'br', `${miniPackId}.json`), 'utf8'));
    assert.deepEqual(miniPack, { type: 'cc.Texture2D', data: [['target-record', [imageUuid]]] });
    assert.equal(JSON.stringify(miniPack).includes('other-record'), false, 'unrelated source-pack entries must not be copied');

    const imageIndex = targetConfig.uuids.indexOf(imageUuid);
    assert.ok(imageIndex >= 0, 'referenced ImageAsset UUID must be local');
    assert.ok(fs.existsSync(path.join(outputRoot, 'import', 'im', 'image-source.imph1.json')));
    assert.ok(fs.existsSync(path.join(outputRoot, 'native', 'im', 'image-source.nat1.png')));
    assert.deepEqual(targetConfig.versions.import, [imageIndex, 'imph1']);
    assert.deepEqual(targetConfig.versions.native, [imageIndex, 'nat1']);

    console.log('bootstrap-localized-redirect.test.js passed');
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}
