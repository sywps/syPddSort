'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const install = require('../scripts/install-douyin-business'), analytics = require('../scripts/install-douyin-analytics');
const plan = path.resolve('.planning/douyin-business-cloud-20261010'); fs.mkdirSync(plan, { recursive: true });
const dir = fs.mkdtempSync(path.join(plan, 'installer-')), file = path.join(dir, 'game.js');
try {
    const entry = 'globalThis.__PDD_DOUYIN_CLOUD_ENV__="env-nvk6FNcrq5";\n';
    fs.writeFileSync(file, entry);
    assert.throws(() => install(dir, { PDD_DOUYIN_BUSINESS_MODE: 'release' }), /production disabled/);
    assert.throws(() => install(dir, { PDD_DOUYIN_BUSINESS_MODE: 'dev' }), /mismatch/);
    const env = { PDD_DOUYIN_BUSINESS_MODE: 'dev', PDD_DOUYIN_CLOUD_ENV: 'env-nvk6FNcrq5', PDD_DOUYIN_ANALYTICS_MODE: 'dev', PDD_DOUYIN_ANALYTICS_BUILD_ID: 'business-test' };
    install(dir, env); analytics(dir, env); install(dir, env); analytics(dir, env);
    const code = fs.readFileSync(file, 'utf8'), scope = {};
    vm.runInNewContext(code, scope);
    assert.equal(scope.__PDD_DOUYIN_BUSINESS__.envID, scope.__PDD_DOUYIN_ANALYTICS__.envID);
    assert.equal(scope.__PDD_DOUYIN_BUSINESS__.mode, 'dev');
    assert.equal((code.match(/__PDD_DOUYIN_BUSINESS__/g) || []).length, 1);
    assert.throws(() => install(dir, { ...env, PDD_DOUYIN_IDENTITY_TEST: '1' }), /mismatch/);
    assert.throws(() => install(dir, { ...env, PDD_DOUYIN_CLOUD_PATH_PREFIX: '/wrong' }), /mismatch/);
    install(dir, {}); analytics(dir, {}); assert.equal(fs.readFileSync(file, 'utf8'), entry);
} finally { fs.unlinkSync(file); fs.rmdirSync(dir); }
console.log('PASS business dev explicit opt-in, analytics coexistence, production/incorrect configuration rejected');
