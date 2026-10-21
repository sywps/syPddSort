'use strict';

// Standalone dev probe. No business cloud, gameplay telemetry, or replay uploads.
module.exports = function installAnalyticsTest(scope, tt) {
    if (scope.__PDD_RUN_CLOUD_ANALYTICS_TEST__) return;
    let pending = null;
    let event = null; // Retries preserve the entire original payload, including its timestamp.
    const target = { envID: 'env-nvk6FNcrq5', serviceID: '1m0ub3f29wtv7' };
    const serverReasons = ['DEV_ONLY', 'APP_GATEWAY_REQUIRED', 'APP_MISMATCH', 'ENV_MISMATCH',
        'OPENID_MISSING', 'INVALID_EVENT', 'DATABASE_CONFIG_MISSING', 'WRITE_NOT_ACKNOWLEDGED',
        'READ_BACK_FAILED', 'EVENT_ID_CONFLICT', 'DATABASE_FAILED'];

    function request(cloud, payload) {
        return new Promise(resolve => {
            let settled = false;
            const finish = result => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(result);
            };
            const timer = setTimeout(() => finish({ ok: false, reason: 'REQUEST_TIMEOUT' }), 16000);
            try {
                const task = cloud.callContainer({ path: '/cloudAnalyticsTest',
                    init: { method: 'POST', header: { 'content-type': 'application/json' },
                        body: { ...payload }, timeout: 15000 },
                    success(res) {
                        if (settled) return;
                        if (!res || res.statusCode !== 200) {
                            finish({ ok: false, reason: 'HTTP_FAILED',
                                statusCode: res && Number.isFinite(res.statusCode) ? res.statusCode : null });
                            return;
                        }
                        let data;
                        try { data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data; }
                        catch (_) { finish({ ok: false, reason: 'RESPONSE_NOT_JSON' }); return; }
                        if (data && data.ok === false) {
                            const result = { ok: false, reason: serverReasons.includes(data.reason) ? data.reason : 'SERVER_REJECTED' };
                            if (['connect', 'write', 'read'].includes(data.stage)) result.databaseStage = data.stage;
                            if (Number.isInteger(data.errorCode)) result.errorCode = data.errorCode;
                            finish(result); return;
                        }
                        if (!data || data.ok !== true || data.reason !== 'EVENT_STORED' ||
                            data.eventId !== payload.eventId || data.writeAcknowledged !== true || data.readBack !== true ||
                            typeof data.duplicate !== 'boolean' || data.collection !== 'analytics_events_dev' ||
                            data.analyticsEnvironment !== 'douyin_dev_test') {
                            finish({ ok: false, reason: 'RESPONSE_SCHEMA_INVALID' }); return;
                        }
                        finish({ ok: true, duplicate: data.duplicate });
                    },
                    fail(error) {
                        const result = { ok: false, reason: error && typeof error.errMsg === 'string' &&
                            /\b13010\b/.test(error.errMsg) ? 'ACCESS_DENIED_13010' : 'REQUEST_FAILED' };
                        if (error && Number.isFinite(error.errNo)) result.errNo = error.errNo;
                        finish(result);
                    }
                });
                if (task && typeof task.catch === 'function') task.catch(() => finish({ ok: false, reason: 'REQUEST_REJECTED' }));
            } catch (_) { finish({ ok: false, reason: 'REQUEST_THREW' }); }
        });
    }

    async function run() {
        if (scope.__PDD_DOUYIN_CLOUD_ENV__ !== '') return { ok: false, reason: 'BUSINESS_CLOUD_MUST_BE_DISABLED' };
        if (scope.__PDD_CDN_SLOT__ !== 'A') return { ok: false, reason: 'A_SLOT_REQUIRED' };
        let platform = 'unknown';
        try {
            const value = tt && tt.getSystemInfoSync && tt.getSystemInfoSync().platform;
            if (['ios', 'android', 'devtools', 'windows', 'mac'].includes(value)) platform = value;
        } catch (_) { /* Missing device info is explicitly rejected below. */ }
        if (!['ios', 'android'].includes(platform)) return { ok: false, reason: 'REAL_DEVICE_REQUIRED', platform };
        if (!tt || typeof tt.createCloud !== 'function') return { ok: false, reason: 'CREATE_CLOUD_UNAVAILABLE', platform };
        let cloud;
        try { cloud = tt.createCloud(target); }
        catch (_) { return { ok: false, reason: 'CREATE_CLOUD_FAILED', platform }; }
        if (!cloud || typeof cloud.callContainer !== 'function') return { ok: false, reason: 'CALL_CONTAINER_UNAVAILABLE', platform };
        if (!event) {
            event = { schemaVersion: 1, eventName: 'analytics_dev_probe',
                eventId: 'probe-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2).padEnd(12, '0') +
                    '-' + Math.random().toString(36).slice(2).padEnd(12, '0'),
                clientTimestamp: Date.now(), platform, cdnSlot: 'A' };
        }
        const first = await request(cloud, event);
        if (!first.ok) return { ...first, phase: 'first', platform, eventId: event.eventId };
        const second = await request(cloud, event);
        if (!second.ok) return { ...second, phase: 'repeat', firstReadBack: true, platform, eventId: event.eventId };
        return { ok: second.duplicate, reason: second.duplicate ? 'ANALYTICS_TEST_OK' : 'DEDUPE_NOT_CONFIRMED',
            platform, eventId: event.eventId, firstDuplicate: first.duplicate, firstReadBack: true,
            secondReadBack: true, deduplicated: second.duplicate };
    }

    function present(result) {
        scope.__PDD_CLOUD_ANALYTICS_TEST_RESULT__ = result;
        console.log('[CloudAnalyticsTest] ' + JSON.stringify(result));
        const content = result.reason === 'REAL_DEVICE_REQUIRED'
            ? '请点击开发者工具“预览”，使用手机抖音扫码。\n模拟器不执行本测试，也不写数据库。'
            : ['DEV 埋点测试 / A 槽', '结果：' + result.reason,
                result.phase ? '请求阶段：' + result.phase : '',
                result.firstReadBack ? '首次请求：写入/回读已确认' : '',
                result.firstDuplicate === true ? '该事件已存在，本次复核通过' : '',
                result.deduplicated === true ? '重复请求：已去重并回读' : '',
                result.databaseStage ? '数据库阶段：' + result.databaseStage : '',
                result.errorCode !== undefined ? '数据库错误码：' + result.errorCode : '',
                result.errNo !== undefined ? '请求错误码：' + result.errNo : '',
                result.eventId ? '事件编号：' + result.eventId : '',
                '请截图此弹窗；仅测试埋点，不保存游戏进度。'].filter(Boolean).join('\n');
        if (tt && typeof tt.showModal === 'function') {
            try { tt.showModal({ title: result.ok ? '埋点入库与去重通过' : '埋点测试提示',
                content, showCancel: false, confirmText: '知道了',
                fail: () => console.error('[CloudAnalyticsTest] RESULT_MODAL_FAILED') }); }
            catch (_) { console.error('[CloudAnalyticsTest] RESULT_MODAL_FAILED'); }
        }
        return result;
    }
    scope.__PDD_RUN_CLOUD_ANALYTICS_TEST__ = function () {
        if (pending) return pending;
        pending = run().catch(() => ({ ok: false, reason: 'TEST_RUNTIME_FAILED' }))
            .then(result => { pending = null; return present(result); });
        return pending;
    };
    setTimeout(() => { void scope.__PDD_RUN_CLOUD_ANALYTICS_TEST__(); }, 2500);
};
