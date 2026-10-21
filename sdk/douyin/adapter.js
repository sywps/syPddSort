'use strict';

// Local fixes for Shengye 1001.1.9. The supplied source is preserved in vendor/.
// Only the pure-ad integration is exposed to the game; cloud authentication is separate.
const createVendor = require('./vendor');
const config = require('./sysdk-conf');
const API_ROOT = 'https://docater1.cn/index.php?g=Wap&m=MiniGameTt&a=';
const TIMEOUT_MS = 10000;

function failure(stage, code) {
    const error = new Error('[DouyinSySDK] ' + stage + (code === undefined ? '' : ' (' + code + ')'));
    error.stage = stage;
    return error;
}

function dateKey() {
    const date = new Date();
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
        .map(value => String(value).padStart(2, '0')).join('');
}

function responseBody(response, stage) {
    if (!response || !Number.isFinite(Number(response.statusCode))
        || Number(response.statusCode) < 200 || Number(response.statusCode) >= 300) {
        throw failure(stage + '_http_failed', Number(response && response.statusCode));
    }
    const data = response.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure(stage + '_invalid_response');
    return data;
}

function requireSuccess(data, stage) {
    if (Number(data.status) !== 1001) throw failure(stage + '_rejected', Number(data.status));
}

function safeVendorReason(value, identities) {
    if (typeof value !== 'string') return '';
    let text = value;
    for (const secret of identities) {
        if (typeof secret === 'string' && secret.length >= 3) text = text.split(secret).join('[redacted]');
    }
    return text.replace(/(?:https?:\/\/|mongodb(?:\+srv)?:\/\/)[^\s]+/gi, '[url]')
        .replace(/["']?(?:openid|wecha_id|dy_openid|real_openid|role_id|action_id|token|session_key|secret|password|game_key|authorization)["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi, '[credential]')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/[a-zA-Z0-9_+\/-]{24,}/g, '[identifier]')
        .replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ').slice(0, 240);
}

module.exports = function createDouyinSdk(tt) {
    const sdk = createVendor(tt, config);
    let initialized = false;
    let loginPromise = null;
    let loginReady = false;
    let loginError = '';
    let sidebarPromise = null;
    let guidePromise = null;
    let iconVisible = null;
    let capability = 'unknown';
    let entryDate = '';
    let sidebarError = '';
    const listeners = new Set();
    const adReports = new Map();
    let lastAdReportRejection = null;
    let roleIdentityProvider = null, rolePromise = null, roleReady = false, roleId = '';
    let roleError = '', lastRoleReportRejection = null, roleReportAttempts = 0;
    let adReportAcceptedCount = 0, adReportFailedCount = 0, lastAdReportError = '';

    // One deadline covers the entire operation. Settled/late native callbacks cannot mutate identity.
    function operation(stage, start, timeoutMs = TIMEOUT_MS) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const requests = [];
            const finish = (error, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (error) {
                    for (const request of requests) {
                        try { if (request && request.abort) request.abort(); } catch (_) { /* already settled */ }
                    }
                    reject(error);
                } else resolve(value);
            };
            const timer = setTimeout(() => finish(failure(stage + '_timeout')), timeoutMs);
            const api = {
                isActive: () => !settled,
                resolve: value => finish(null, value),
                reject: error => finish(error),
                call(method, args, onSuccess) {
                    if (settled) return;
                    if (typeof tt[method] !== 'function') return finish(failure(method + '_unavailable'));
                    let received = false;
                    const options = Object.assign({}, args, {
                        success(result) {
                            if (settled || received) return;
                            received = true;
                            try { onSuccess(result); } catch (error) { finish(error); }
                        },
                        fail() {
                            if (settled || received) return;
                            received = true;
                            finish(failure(stage + '_' + method + '_failed'));
                        },
                    });
                    try { requests.push(tt[method](options)); } catch (_) { finish(failure(stage + '_' + method + '_threw')); }
                },
            };
            try { start(api); } catch (error) { finish(error); }
        });
    }

    function notifySidebar() {
        const state = sdk.getSidebarState();
        for (const listener of Array.from(listeners)) {
            try { listener(state); } catch (error) { console.error('[DouyinSySDK] sidebar listener failed', error); }
        }
    }

    function receiveEntry(options) {
        // This is the actual launch/show source, never the result of navigateToScene.
        entryDate = options && options.launch_from === 'homepage' && options.location === 'sidebar_card'
            ? dateKey() : '';
        sdk.sidebarIconInfo.allowGetReward = entryDate ? 1 : 0;
        notifySidebar();
    }

    sdk.init = function init(options) {
        if (initialized) return;
        if (!tt || typeof tt.getLaunchOptionsSync !== 'function' || typeof tt.onShow !== 'function') {
            throw failure('runtime_unavailable');
        }
        if (config.APP_ID !== 'ttf45082ed6a36c15802' || !config.GAME_KEY) throw failure('config_invalid');
        const launch = options || tt.getLaunchOptionsSync();
        if (!launch || typeof launch !== 'object') throw failure('launch_options_invalid');
        sdk.appid = config.APP_ID;
        sdk.channel = config.GAME_KEY;
        sdk.query = JSON.parse(JSON.stringify(launch.query || {}));
        sdk.scene = launch.scene;
        tt.onShow(options => {
            receiveEntry(options);
            if (loginReady) void sdk.refreshSidebar().catch(() => {}); // refresh logs and exposes its failure
        });
        initialized = true;
        receiveEntry(launch);
    };

    sdk.syLogin = function syLogin() {
        if (loginReady) return Promise.resolve({ openid: sdk.openid, dyOpenid: sdk.dy_openid || '', realOpenid: sdk.real_openid || '' });
        if (loginPromise) return loginPromise;
        try { sdk.init(); } catch (error) { return Promise.reject(error); }
        loginError = '';
        loginPromise = operation('login', api => {
            api.call('login', {}, result => {
                if (!result || typeof result.code !== 'string' || !result.code.trim()) throw failure('login_no_code');
                api.call('request', {
                    url: API_ROOT + 'login',
                    data: { code: result.code, appid: sdk.appid, version: sdk.app_version,
                        query: JSON.stringify(sdk.query), scene: sdk.scene, channel: sdk.channel },
                }, response => {
                    const data = responseBody(response, 'login');
                    // The document does not define code's success values. Fail closed on unrecognized codes.
                    for (const key of ['status', 'code']) {
                        if (data[key] !== undefined && Number(data[key]) !== 1001) {
                            throw failure('login_' + key + '_unconfirmed', Number(data[key]));
                        }
                    }
                    if (typeof data.openid !== 'string' || !data.openid.trim()) throw failure('login_identity_missing');
                    // The vendor documents dy_openid as the Douyin ID, not as an alias of real_openid.
                    for (const key of ['dy_openid', 'real_openid']) {
                        if (data[key] !== undefined && data[key] !== null && typeof data[key] !== 'string') {
                            throw failure('login_douyin_identity_invalid');
                        }
                    }
                    api.resolve({ openid: data.openid.trim(), dyOpenid: (data.dy_openid || '').trim(),
                        realOpenid: (data.real_openid || '').trim() });
                });
            });
        }).then(identity => {
            sdk.openid = identity.openid;
            sdk.dy_openid = identity.dyOpenid;
            sdk.real_openid = identity.realOpenid;
            loginReady = true;
            loginPromise = null;
            return identity;
        }, error => {
            loginPromise = null;
            loginError = error.stage || 'login_failed';
            console.error('[DouyinSySDK] login failed:', error.message);
            throw error;
        });
        return loginPromise;
    };

    function vendorRejection(body, stage) {
        const code = Number(body.status);
        const value = [body.msg, body.message, body.info].find(x => typeof x === 'string');
        const message = safeVendorReason(value, [sdk.openid, sdk.dy_openid, sdk.real_openid, config.GAME_KEY, roleId]);
        const detail = { code: Number.isFinite(code) ? code : null, message };
        const error = failure(stage + '_rejected', code);
        if (message) error.message += ': ' + message;
        return { detail, error };
    }

    sdk.setRoleIdentityProvider = provider => {
        if (typeof provider !== 'function') throw failure('role_identity_provider_invalid');
        roleIdentityProvider = provider;
    };
    sdk.ensureRole = function ensureRole() {
        if (rolePromise) return rolePromise;
        roleError = '';
        rolePromise = operation('role', api => {
            if (!roleIdentityProvider) return api.reject(failure('role_identity_provider_missing'));
            const identity = Promise.resolve().then(() => roleIdentityProvider()).catch(() => { throw failure('role_identity_failed'); });
            Promise.all([sdk.syLogin(), identity]).then(([, id]) => {
                if (!api.isActive()) return;
                if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw failure('role_identity_invalid');
                if (roleId && roleId !== id) throw failure('role_identity_changed');
                if (roleReady) return api.resolve(id);
                // A fixed default server; this game has no RPG level/VIP/power system.
                api.call('request', { url: API_ROOT + 'reportRoleInfo', method: 'POST',
                    data: { role_id: id, role_name: '玩家', role_level: 1, server_id: '1', server_name: '默认区服',
                        role_vip: 0, role_power: 0, report_type: 'entergame', wecha_id: sdk.openid,
                        real_openid: sdk.real_openid, channel: sdk.channel, query: sdk.query, scene: sdk.scene,
                        appid: sdk.appid, version: sdk.app_version },
                }, response => {
                    const body = responseBody(response, 'role_report');
                    if (Number(body.status) !== 1001) {
                        const rejected = vendorRejection(body, 'role_report');
                        lastRoleReportRejection = rejected.detail;
                        throw rejected.error;
                    }
                    api.resolve(id);
                });
                roleReportAttempts++;
            }).catch(api.reject);
        }, 30000).then(id => {
            roleId = id; sdk.role_id = id; roleReady = true; rolePromise = null;
            return { ready: true };
        }, error => {
            roleReady = false; rolePromise = null; roleError = error.stage || 'role_failed';
            console.error('[DouyinSySDK] role initialization failed:', error.message);
            throw error;
        });
        return rolePromise;
    };

    sdk.getDiagnostics = () => ({ initialized, loginReady, loginPending: !!loginPromise, loginError,
        roleReady, rolePending: !!rolePromise, roleError, roleReportAttempts,
        lastRoleReportRejection: lastRoleReportRejection && { ...lastRoleReportRejection },
        adReportAcceptedCount, adReportFailedCount, lastAdReportError,
        lastAdReportRejection: lastAdReportRejection && { ...lastAdReportRejection },
        vendorVersion: sdk.app_version, cloudIdentityVerified: false });
    sdk.getSidebarState = () => ({ iconVisible, capability, error: sidebarError,
        canShow: iconVisible === true && capability === 'available',
        eligibleToday: entryDate === dateKey() });
    sdk.subscribeSidebar = listener => {
        listeners.add(listener);
        listener(sdk.getSidebarState());
        return () => listeners.delete(listener);
    };

    sdk.syGetSidebarIconOpenStatus = function syGetSidebarIconOpenStatus() {
        if (!loginReady) return Promise.reject(failure('sidebar_login_required'));
        return operation('sidebar_status', api => api.call('request', {
            url: API_ROOT + 'getIconShowStatus', method: 'POST', dataType: 'json',
            data: { wecha_id: sdk.openid, appid: sdk.appid, channel: sdk.channel, version: sdk.app_version },
        }, response => {
            const data = responseBody(response, 'sidebar');
            requireSuccess(data, 'sidebar');
            if (![0, 1, '0', '1'].includes(data.iconShowStatus)) throw failure('sidebar_icon_status_invalid');
            api.resolve({ iconShowStatus: Number(data.iconShowStatus) });
        }));
    };

    sdk.refreshSidebar = function refreshSidebar() {
        if (sidebarPromise) return sidebarPromise;
        sidebarError = '';
        sidebarPromise = sdk.syLogin().then(() => Promise.all([
            sdk.syGetSidebarIconOpenStatus(),
            operation('sidebar_capability', api => api.call('checkScene', { scene: 'sidebar' }, result => {
                if (!result || typeof result.isExist !== 'boolean') throw failure('sidebar_capability_invalid');
                const canGuide = result.isExist ? typeof tt.navigateToScene === 'function' : typeof tt.showRevisitGuide === 'function';
                api.resolve(canGuide && typeof tt.onTouchStart === 'function' && typeof tt.offTouchStart === 'function');
            })),
        ])).then(results => {
            iconVisible = results[0].iconShowStatus === 1;
            sdk.sidebarIconInfo.iconShowStatus = results[0].iconShowStatus;
            capability = results[1] ? 'available' : 'unavailable';
            sidebarPromise = null;
            notifySidebar();
            return sdk.getSidebarState();
        }, error => {
            iconVisible = null;
            capability = 'unknown';
            sidebarError = error.stage || 'sidebar_failed';
            sidebarPromise = null;
            notifySidebar();
            console.error('[DouyinSySDK] sidebar unavailable:', error.message);
            throw error;
        });
        return sidebarPromise;
    };

    sdk.sySidebarGuide = function sySidebarGuide() {
        if (guidePromise) return guidePromise;
        if (!sdk.getSidebarState().canShow) return Promise.reject(failure('sidebar_not_ready'));
        guidePromise = operation('sidebar_guide', api => api.call('checkScene', { scene: 'sidebar' }, result => {
            if (!result || typeof result.isExist !== 'boolean') throw failure('sidebar_capability_invalid');
            if (result.isExist) api.call('navigateToScene', { scene: 'sidebar' }, () => api.resolve(true));
            else api.call('showRevisitGuide', {}, () => api.resolve(true));
        })).then(value => { guidePromise = null; return value; }, error => {
            guidePromise = null;
            console.error('[DouyinSySDK] sidebar guide failed:', error.message);
            throw error;
        });
        return guidePromise;
    };

    sdk.reportRewardGranted = function reportRewardGranted(task, transactionId) {
        if (typeof transactionId !== 'string' || !transactionId) return Promise.reject(failure('ad_transaction_missing'));
        if (adReports.has(transactionId)) return adReports.get(transactionId);
        // Record before login/network. A rejected/unknown receipt is never automatically retried.
        const report = sdk.ensureRole().then(() => {
            const actionId = sdk.openid + '_1_' + Date.now() + Math.floor(Math.random() * 1000);
            return operation('ad_report', api => api.call('request', {
                url: API_ROOT + 'uploadCasualAction', method: 'POST',
                data: { action_id: actionId, action_time: sdk.formatTime(new Date()), action_type: 5,
                    position: 1, task: String(task || ''), role_id: sdk.role_id, wecha_id: sdk.openid, appid: sdk.appid },
            }, response => {
                const body = responseBody(response, 'ad_report');
                if (Number(body.status) !== 1001) {
                    const code = Number(body.status);
                    const message = safeVendorReason(typeof body.msg === 'string' ? body.msg : body.message,
                        [sdk.openid, sdk.dy_openid, sdk.real_openid, sdk.session_key, config.GAME_KEY, actionId]);
                    lastAdReportRejection = { code: Number.isFinite(code) ? code : null, message };
                    const error = failure('ad_report_rejected', code);
                    if (message) error.message += ': ' + message;
                    throw error;
                }
                api.resolve({ accepted: true });
            }));
        }).then(result => {
            adReportAcceptedCount++; lastAdReportError = '';
            return result;
        }).catch(error => {
            adReportFailedCount++; lastAdReportError = error.stage || 'ad_report_failed';
            console.error('[DouyinSySDK] reward already granted; ad report unconfirmed, no retry:', error.message);
            throw error;
        });
        adReports.set(transactionId, report);
        return report;
    };

    // Do not expose raw vendor login/pay helpers or their unrestricted payload logging to game callers.
    return {
        init: sdk.init, syLogin: sdk.syLogin, getDiagnostics: sdk.getDiagnostics,
        setRoleIdentityProvider: sdk.setRoleIdentityProvider, ensureRole: sdk.ensureRole,
        getSidebarState: sdk.getSidebarState, subscribeSidebar: sdk.subscribeSidebar,
        refreshSidebar: sdk.refreshSidebar, sySidebarGuide: sdk.sySidebarGuide,
        reportRewardGranted: sdk.reportRewardGranted,
    };
};
