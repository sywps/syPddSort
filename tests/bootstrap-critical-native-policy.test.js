'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    requiresNativeArtifact,
} = require('../scripts/patch-bootstrap-dynamic-assets.js');

const root = path.resolve(__dirname, '..');
const patchSource = fs.readFileSync(path.join(root, 'scripts', 'patch-bootstrap-dynamic-assets.js'), 'utf8');
const atlasImageUuid = '70f86993-4128-41e8-bc6d-f09aff9fd929';
const removableNativeUuids = new Set([atlasImageUuid]);

assert.equal(
    requiresNativeArtifact({
        typeName: 'cc.ImageAsset',
        uuid: '70+GmTQShB6Lxt8Jr/n9kp',
        nativeVersionHash: '6895b',
    }, removableNativeUuids),
    false,
    'a compressed ImageAsset UUID confirmed inside an AutoAtlas must not require its removed standalone native',
);

assert.equal(
    requiresNativeArtifact({
        typeName: 'cc.ImageAsset',
        uuid: '11111111-1111-4111-8111-111111111111',
        nativeVersionHash: 'abc12',
    }, removableNativeUuids),
    true,
    'an ImageAsset outside the confirmed AutoAtlas set must still require a native artifact',
);

assert.equal(
    requiresNativeArtifact({
        typeName: 'cc.AudioClip',
        uuid: atlasImageUuid,
        nativeVersionHash: 'def34',
    }, removableNativeUuids),
    true,
    'an AudioClip must still require a native artifact even if its UUID appears in the removable image set',
);

assert.equal(
    (patchSource.match(/requiresNativeArtifact\(entry, autoAtlasRemovableNativeUuids\)/g) || []).length,
    3,
    'critical native copy, version validation, and final verification must share the AutoAtlas-aware policy',
);

console.log('bootstrap-critical-native-policy.test.js passed');
