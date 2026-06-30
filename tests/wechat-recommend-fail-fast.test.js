const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const service = read('assets/Scripts/Core/WeChatRecommendService.ts');
const openMethodStart = service.indexOf('private async openOfficialRecommendComponent');
const openMethodEnd = service.indexOf('private trackSuppressed');
const openMethod = service.slice(openMethodStart, openMethodEnd);
const eligibilityStart = service.indexOf('private getAutoEligibility');
const eligibilityEnd = service.indexOf('private async openAuto');
const eligibilityMethod = service.slice(eligibilityStart, eligibilityEnd);

assert.ok(!service.includes('makeErrorResult'), 'WeChat recommendation platform errors must not be converted to soft results');
assert.ok(!service.includes("status: 'error'"), 'WeChat recommendation platform errors must throw instead of returning error status');
assert.ok(!service.includes("status: 'unknown'"), 'WeChat recommendation must not hide incomplete PageManager callbacks as unknown status');
assert.ok(openMethodStart >= 0 && openMethodEnd > openMethodStart, 'test must locate openOfficialRecommendComponent');
assert.ok(eligibilityStart >= 0 && eligibilityEnd > eligibilityStart, 'test must locate getAutoEligibility');
assert.ok(!openMethod.includes('ok: false'), 'WeChat recommendation platform open path must not return ok:false');
assert.ok(eligibilityMethod.includes("reason: 'not_wechat_runtime'"), 'auto WeChat recommendation must be suppressed outside real WeChat runtime');
assert.ok(eligibilityMethod.includes("reason: 'page_manager_unavailable'"), 'auto WeChat recommendation must be suppressed when PageManager is unavailable');
assert.ok(service.includes("throw createRecommendOpenError('page_manager_unavailable'"), 'missing wx.createPageManager must fail fast');
assert.ok(service.includes("throw createRecommendOpenError('page_manager_invalid'"), 'invalid PageManager API must fail fast');
assert.ok(service.includes("rejectOpen(createRecommendOpenError('destroy_timeout'"), 'missing destroy callback must fail fast');
assert.ok(service.includes("rejectOpen(createRecommendOpenError('missing_recommend_status'"), 'missing recommendation result must fail fast');
assert.ok(service.includes('throw error;'), 'tracked WeChat recommendation errors must be rethrown');

console.log('wechat-recommend-fail-fast.test.js passed');
