'use strict';

// Included only when PDD_DOUYIN_IDENTITY_TEST=1. No game cloud manager or database calls.
module.exports = function installIdentityTest(scope, tt) {
    if (scope.__PDD_RUN_CLOUD_IDENTITY_TEST__) return;
    const target = { envID: 'env-nvk6FNcrq5', serviceID: '1m0ub3f29wtv7' };
    const appId = 'ttf45082ed6a36c15802';
    let pending = null;

    function present(result) {
        scope.__PDD_CLOUD_IDENTITY_TEST_RESULT__ = result;
        console.log('[CloudIdentityTest] ' + JSON.stringify(result));
        const yes = value => value === true ? '有' : value === false ? '无' : '未确认';
        const content = [
            'DEV 身份诊断 / A 槽',
            '环境：' + target.envID,
            '结果：' + result.reason,
            'AppID匹配：' + yes(result.appMatches),
            '环境匹配：' + yes(result.envMatches),
            '账号身份：' + yes(result.hasOpenId),
            '匿名身份：' + yes(result.hasAnonymousOpenId),
            '平台来源：' + (result.source || '未确认'),
            '设备：' + result.platform,
            result.errNo !== undefined ? '错误码：' + result.errNo : '',
            '请截图此弹窗；本测试不保存游戏进度。'
        ].filter(Boolean).join('\n');
        if (tt && typeof tt.showModal === 'function') {
            try {
                tt.showModal({ title: result.ok ? '身份字段检查通过' : '身份检查未通过',
                    content, showCancel: false, confirmText: '知道了',
                    fail: () => console.error('[CloudIdentityTest] RESULT_MODAL_FAILED; see console result') });
            } catch (_) {
                console.error('[CloudIdentityTest] RESULT_MODAL_FAILED; see console result');
            }
        }
        return result;
    }

    scope.__PDD_RUN_CLOUD_IDENTITY_TEST__ = function runIdentityTest() {
        if (pending) return pending;
        let platform = 'unknown';
        try {
            const value = tt && tt.getSystemInfoSync && tt.getSystemInfoSync().platform;
            if (['ios', 'android', 'devtools', 'windows', 'mac'].includes(value)) platform = value;
        } catch (_) { /* Device info is diagnostic only; never blocks the request. */ }
        const task = new Promise(resolve => {
            let settled = false;
            const finish = result => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve({ ...result, platform });
            };
            const timer = setTimeout(() => finish({ ok: false, reason: 'REQUEST_TIMEOUT' }), 16000);
            if (scope.__PDD_DOUYIN_CLOUD_ENV__) {
                finish({ ok: false, reason: 'BUSINESS_CLOUD_MUST_BE_DISABLED' });
                return;
            }
            if (!tt || typeof tt.createCloud !== 'function') {
                finish({ ok: false, reason: 'CREATE_CLOUD_UNAVAILABLE' });
                return;
            }
            let cloud;
            try { cloud = tt.createCloud(target); } catch (_) {
                finish({ ok: false, reason: 'CREATE_CLOUD_FAILED' });
                return;
            }
            if (!cloud || typeof cloud.callContainer !== 'function') {
                finish({ ok: false, reason: 'CALL_CONTAINER_UNAVAILABLE' });
                return;
            }
            console.log('[CloudIdentityTest] requesting dev /cloudIdentity');
            try {
                const request = cloud.callContainer({
                    path: '/cloudIdentity',
                    init: { method: 'POST', header: { 'content-type': 'application/json' }, body: {}, timeout: 15000 },
                    success(res) {
                        if (settled) return;
                        const statusCode = res && res.statusCode;
                        if (statusCode !== 200) {
                            finish({ ok: false, reason: 'HTTP_FAILED', statusCode: typeof statusCode === 'number' ? statusCode : null });
                            return;
                        }
                        let data;
                        try { data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data; } catch (_) {
                            finish({ ok: false, reason: 'RESPONSE_NOT_JSON' });
                            return;
                        }
                        if (!data || data.message !== 'douyin-cloud-identity' ||
                            ['hasOpenId', 'hasAnonymousOpenId', 'hasUnionId'].some(key => typeof data[key] !== 'boolean')) {
                            finish({ ok: false, reason: 'RESPONSE_SCHEMA_INVALID' });
                            return;
                        }
                        // Deliberately omit raw IDs, headers, and untrusted response/error text.
                        const result = {
                            appMatches: data.appId === appId,
                            envMatches: data.envId === target.envID,
                            source: data.source === 'APP' ? 'APP' : 'OTHER',
                            triggerOnline: data.trigger === 'online',
                            hasOpenId: data.hasOpenId,
                            hasAnonymousOpenId: data.hasAnonymousOpenId,
                            hasUnionId: data.hasUnionId
                        };
                        const reason = !result.appMatches ? 'APP_MISMATCH'
                            : !result.envMatches ? 'ENV_MISMATCH'
                            : result.source !== 'APP' || !result.triggerOnline ? 'CALL_SOURCE_UNCONFIRMED'
                            : !result.hasOpenId ? 'OPENID_MISSING' : 'IDENTITY_FIELDS_OK';
                        finish({ ok: reason === 'IDENTITY_FIELDS_OK', reason, ...result });
                    },
                    fail(error) {
                        const denied = error && typeof error.errMsg === 'string' && /\b13010\b/.test(error.errMsg);
                        const result = { ok: false, reason: denied ? 'ACCESS_DENIED_13010' : 'REQUEST_FAILED' };
                        if (error && Number.isFinite(error.errNo)) result.errNo = error.errNo;
                        finish(result);
                    }
                });
                // The observed SDK uses callbacks. Consume a rejection without exposing raw details.
                if (request && typeof request.catch === 'function') {
                    request.catch(() => finish({ ok: false, reason: 'REQUEST_REJECTED' }));
                }
            } catch (_) {
                finish({ ok: false, reason: 'REQUEST_THREW' });
            }
        });
        pending = task.then(result => { pending = null; return present(result); });
        return pending;
    };
    setTimeout(() => { void scope.__PDD_RUN_CLOUD_IDENTITY_TEST__(); }, 2500);
};
