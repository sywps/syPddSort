const assert = require('assert');
const buildCommon = require('../scripts/minigame-build-common.js');

assert.strictEqual(
    buildCommon.hasOnlyEmptyCocosAssetStats('no asset stats here'),
    false,
    'a log without asset statistics must not be classified as an empty build',
);

assert.strictEqual(
    buildCommon.hasOnlyEmptyCocosAssetStats([
        'Number of all scenes: 0',
        'Number of all scripts: 0',
        'Number of other assets: 0',
    ].join('\n')),
    true,
    'a completely empty asset group must be rejected',
);

assert.strictEqual(
    buildCommon.hasOnlyEmptyCocosAssetStats([
        'Number of all scenes: 0',
        'Number of all scripts: 0',
        'Number of other assets: 1700',
    ].join('\n')),
    false,
    'a JSON-only level-data bundle is not an empty build',
);

assert.strictEqual(
    buildCommon.hasNoPopulatedCocosSceneScriptStats([
        'Number of all scenes: 0',
        'Number of all scripts: 0',
        'Number of other assets: 1700',
    ].join('\n')),
    true,
    'a platform build with assets but no scenes or scripts must be rejected',
);

assert.strictEqual(
    buildCommon.hasNoPopulatedCocosSceneScriptStats([
        'Number of all scenes: 0',
        'Number of all scripts: 0',
        'Number of other assets: 1700',
        'Number of all scenes: 4',
        'Number of all scripts: 105',
        'Number of other assets: 2404',
    ].join('\n')),
    false,
    'one populated project inventory must make a multi-group build healthy',
);

assert.strictEqual(
    buildCommon.hasOnlyEmptyCocosAssetStats([
        'Number of all scenes: 0',
        'Number of all scripts: 0',
        'Number of other assets: 0',
        'Number of all scenes: 1',
        'Number of all scripts: 4',
        'Number of other assets: 20',
    ].join('\n')),
    false,
    'one populated group must prevent a multi-group build log from being classified as empty',
);

console.log('cocos-asset-stats-health.test.js passed');
