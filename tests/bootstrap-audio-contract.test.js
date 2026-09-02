const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function parseManifestMap(source) {
    const match = source.match(/export const AUDIO_SFX_RESOURCE_PATH = \{([\s\S]*?)\} as const;/);
    assert.ok(match, 'AudioManifest must expose AUDIO_SFX_RESOURCE_PATH');
    return new Map([...match[1].matchAll(/^\s*(\w+):\s*'([^']+)',/gm)].map((item) => [item[1], item[2]]));
}

function parseBootstrapNames(source) {
    const match = source.match(/export const AUDIO_BOOTSTRAP_SFX_NAMES: SfxName\[\] = \[([\s\S]*?)\];/);
    assert.ok(match, 'AudioManifest must expose AUDIO_BOOTSTRAP_SFX_NAMES');
    return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

const audioManifest = read('assets/Scripts/Core/AudioManifest.ts');
const audioPaths = parseManifestMap(audioManifest);
const expectedPaths = new Set(['Audio/bgm']);
for (const name of parseBootstrapNames(audioManifest)) {
    const resourcePath = audioPaths.get(name);
    assert.ok(resourcePath, `Bootstrap SFX ${name} must have a resource path`);
    expectedPaths.add(resourcePath);
}

for (const resourcePath of expectedPaths) {
    const filePath = path.join(root, 'assets', 'GameAssetsBundle', `${resourcePath}.mp3`);
    assert.ok(fs.existsSync(filePath), `Bootstrap audio resource must exist: ${resourcePath}`);
}

for (const scriptPath of [
    'scripts/extract-bootstrap-bundle.js',
    'scripts/patch-bootstrap-dynamic-assets.js',
]) {
    const source = read(scriptPath);
    for (const resourcePath of expectedPaths) {
        assert.ok(source.includes(`'${resourcePath}'`), `${scriptPath} must include ${resourcePath}`);
    }
    for (const retiredPath of [
        'Audio/pindd/right_place_short',
        'Audio/guide_level1_pick_1',
        'Audio/guide_level1_place_1',
        'Audio/guide_level1_pick_2',
        'Audio/guide_level1_place_2',
    ]) {
        assert.ok(!source.includes(retiredPath), `${scriptPath} must not include retired ${retiredPath}`);
    }
}

console.log('bootstrap-audio-contract.test.js passed');
