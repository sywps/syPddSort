'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const { configuration, verifyPackage } = require('../scripts/build-douyin-dev-launch');
const slots = require('../scripts/douyin-cdn-slot-config');
const buildId = 'douyin-a-dev-launch-test-r1';
const args = ['--cdn-slot=A', '--build-id=' + buildId];
const settings = configuration(args, {});
assert.equal(settings.env.PDD_DOUYIN_BUSINESS_MODE, 'dev');
assert.equal(settings.env.PDD_DOUYIN_ANALYTICS_MODE, 'dev');
assert.equal(settings.env.PDD_DOUYIN_IDENTITY_TEST, '0');
for (const bad of [[], ['--cdn-slot=A'], ['--cdn-slot=B', '--build-id=' + buildId], [...args, '--debug']]) assert.throws(() => configuration(bad, {}));
for (const env of [{ PDD_DOUYIN_CLOUD_ENV: 'prod' }, { PDD_DOUYIN_BUSINESS_MODE: 'off' },
    { PDD_DOUYIN_IDENTITY_TEST: '1' }, { PDD_DOUYIN_CLOUD_PATH_PREFIX: '/test' }, { DOUYIN_APPID: 'wrong' },
    { PDD_LEVEL_DATA_CDN_URL: 'https://example.com/wechat/' }]) assert.throws(() => configuration(args, env));
const plan = path.resolve('.planning/douyin-dev-launch-20261011'); fs.mkdirSync(plan, { recursive: true });
const dir = fs.mkdtempSync(path.join(plan, 'fixture-'));
try {
    fs.mkdirSync(path.join(dir, 'sdk/douyin'), { recursive: true });
    fs.copyFileSync('sdk/douyin/adapter.js', path.join(dir, 'sdk/douyin/adapter.js'));
    const config = { appid: 'ttf45082ed6a36c15802', setting: { urlCheck: true } };
    const project = path.join(dir, 'project.config.json');
    fs.writeFileSync(project, JSON.stringify(config));
    fs.writeFileSync(path.join(dir, 'game.json'), JSON.stringify({ subpackages: [] }));
    const target = slots.resolveDouyinCdnSlot('A');
    const markers = { __PDD_BUILD_PLATFORM__: 'douyin', __PDD_CDN_SLOT__: 'A',
        __PDD_LEVEL_DATA_CDN_URL__: target.levelDataCdnUrl, __PDD_SKIN_DATA_CDN_URL__: target.skinDataCdnUrl,
        __PDD_PROFILE_DATA_CDN_URL__: target.profileDataCdnUrl, __PDD_DOUYIN_BUILD_MODE__: 'release',
        __PDD_DOUYIN_CLOUD_ENV__: settings.env.PDD_DOUYIN_CLOUD_ENV, __PDD_DOUYIN_CLOUD_PATH_PREFIX__: '' };
    const file = path.join(dir, 'game.js');
    fs.writeFileSync(file, Object.entries(markers).map(([k, v]) => 'globalThis.' + k + '=' + JSON.stringify(v) + ';').join('\n') + '\n');
    require('../scripts/install-douyin-business')(dir, settings.env);
    require('../scripts/install-douyin-analytics')(dir, settings.env);
    const original = fs.readFileSync(file, 'utf8');
    assert.equal(verifyPackage(dir, settings).backend, 'dev');
    for (const mutate of [x => x.replace('"release"', '"debug"'), x => x.replace('"dev"', '"prod"'),
        x => x.replace(buildId, 'wrong'), x => x + '\n// PDD_DOUYIN_IDENTITY_TEST_BEGIN',
        x => x + '\n// DOUYIN_ADMIN_TOKEN', x => x + '\nrequire("./startup-diagnostic.js");',
        x => x + '\nglobalThis.__PDD_SIDEBAR_DIAGNOSTIC__={};',
        x => x + '\nglobalThis.__PDD_DOUYIN_CLOUD_ENV__="wrong";']) {
        fs.writeFileSync(file, mutate(original)); assert.throws(() => verifyPackage(dir, settings));
    }
    fs.writeFileSync(file, original);
    fs.writeFileSync(project, JSON.stringify({ ...config, setting: { urlCheck: false } }));
    assert.throws(() => verifyPackage(dir, settings));
    fs.writeFileSync(project, JSON.stringify(config));
    const diagnostic = path.join(dir, 'startup-diagnostic.js');
    fs.writeFileSync(diagnostic, '');
    assert.throws(() => verifyPackage(dir, settings));
    fs.unlinkSync(diagnostic);
    fs.writeFileSync(path.join(dir, 'cloud-identity-test.js'), '');
    assert.throws(() => verifyPackage(dir, settings));
} finally {
    if (path.dirname(dir) !== plan || !path.basename(dir).startsWith('fixture-')) throw Error('Unsafe cleanup');
    fs.rmSync(dir, { recursive: true });
}
console.log('PASS DEV launch configuration and generated-package mismatch/diagnostic/domain checks (fixture only)');
