'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ensureStandaloneCconExtensionMap } = require('../scripts/patch-bootstrap-dynamic-assets.js');

const root = path.resolve(__dirname, '..');
const compressedUuid = '4fCKBKfOpJ1rzlJVbo+REw';
const decodedUuid = '4f08a04a-7cea-49d6-bce5-2556e8f91130';
const version = '7e520';
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sypddsort-bootstrap-ccon-'));

function makeBundleRoot(name) {
    const bundleRoot = path.join(tempRoot, name);
    fs.mkdirSync(path.join(bundleRoot, 'import', decodedUuid.slice(0, 2)), { recursive: true });
    fs.writeFileSync(
        path.join(bundleRoot, 'import', decodedUuid.slice(0, 2), `${decodedUuid}.${version}.bin`),
        Buffer.concat([Buffer.from('CCON', 'ascii'), Buffer.alloc(12)]),
    );
    return bundleRoot;
}

try {
    const buildConfigPath = path.join(tempRoot, 'wechat-build-config.json');
    const buildConfigResult = spawnSync(process.execPath, [
        path.join(root, 'scripts', 'write-wechat-build-config.js'),
        buildConfigPath,
        'db://assets/Scenes/Boot.scene',
        '11111111-1111-4111-8111-111111111111',
        '--release',
        'wechatgame-staging',
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(
        buildConfigResult.status,
        0,
        buildConfigResult.stderr || buildConfigResult.stdout || 'WeChat build config generation failed',
    );
    const buildConfig = JSON.parse(fs.readFileSync(buildConfigPath, 'utf8'));
    assert.ok(buildConfig.includeModules.includes('animation'), 'WeChat engine module list must retain animation');
    assert.equal(
        buildConfig.overwriteProjectSettings.includeModules.animation,
        'on',
        'WeChat project override must keep cc.Animation and cc.AnimationClip registered',
    );

    const releaseRoot = makeBundleRoot('release');
    const releaseConfig = {
        debug: false,
        uuids: [compressedUuid],
        paths: { 0: ['Animations/PchCapacityFullWarning', 0, 1] },
        versions: { import: [0, version], native: [] },
        extensionMap: {},
    };
    assert.deepEqual(
        ensureStandaloneCconExtensionMap(releaseRoot, releaseConfig, 'config.release.json'),
        { imports: 1, added: 1 },
    );
    assert.deepEqual(releaseConfig.extensionMap, { '.cconb': [0] });
    assert.deepEqual(
        ensureStandaloneCconExtensionMap(releaseRoot, releaseConfig, 'config.release.json'),
        { imports: 1, added: 0 },
        'repair must be idempotent',
    );

    fs.writeFileSync(
        path.join(releaseRoot, 'import', decodedUuid.slice(0, 2), `${decodedUuid}.${version}.generic.bin`),
        Buffer.from('generic-binary'),
    );
    assert.deepEqual(
        ensureStandaloneCconExtensionMap(releaseRoot, releaseConfig, 'config.release.json'),
        { imports: 1, added: 0 },
        'non-CCON .bin imports must not be remapped',
    );

    const orphanDir = path.join(releaseRoot, 'import', 'aa');
    fs.mkdirSync(orphanDir, { recursive: true });
    fs.writeFileSync(path.join(orphanDir, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.dead1.bin'), Buffer.from('CCON-orphan'));
    assert.throws(
        () => ensureStandaloneCconExtensionMap(releaseRoot, releaseConfig, 'config.release.json'),
        /bootstrap CCON import 无法映射到 config\.release\.json uuid\/version/,
        'orphan CCON imports must fail fast',
    );

    const debugRoot = makeBundleRoot('debug');
    const debugConfig = {
        debug: true,
        uuids: [compressedUuid],
        paths: { [compressedUuid]: ['Animations/PchCapacityFullWarning', 'cc.AnimationClip', 1] },
        versions: { import: [compressedUuid, version], native: [] },
        extensionMap: {},
    };
    assert.deepEqual(
        ensureStandaloneCconExtensionMap(debugRoot, debugConfig, 'config.debug.json'),
        { imports: 1, added: 1 },
    );
    assert.deepEqual(debugConfig.extensionMap, { '.cconb': [compressedUuid] });
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('bootstrap-ccon-extension-map.test.js passed');
