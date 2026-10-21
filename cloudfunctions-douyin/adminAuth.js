'use strict';
const crypto = require('crypto');

// PROD console debugging invokes the live endpoint, so trigger/source is not admin authentication.
// The secret belongs only in server configuration and the operator's console request header.
function denialReason(context, env) {
    if (!env || !['DEV', 'PROD'].includes(env.CLOUD_ENV)) return 'CLOUD_ENV_INVALID';
    if (!context) return 'ADMIN_CONTEXT_REQUIRED';
    if (env.CLOUD_ENV === 'DEV') {
        // Preserve the previously verified DEV console path, never apply it in PROD.
        return context.trigger !== 'online' && (!context.headers || context.headers['x-tt-source'] !== 'APP')
            ? '' : 'ADMIN_CONTEXT_REQUIRED';
    }
    const expected = env.DOUYIN_ADMIN_TOKEN;
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) return 'ADMIN_TOKEN_NOT_CONFIGURED';
    const headers = context.headers;
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return 'ADMIN_HEADER_REQUIRED';
    const keys = Object.keys(headers).filter(key => key.toLowerCase() === 'x-pdd-admin-token');
    if (!keys.length) return 'ADMIN_HEADER_REQUIRED';
    if (keys.length !== 1) return 'ADMIN_HEADER_INVALID';
    const supplied = headers[keys[0]];
    if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied)) return 'ADMIN_HEADER_INVALID';
    return crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex')) ? '' : 'ADMIN_TOKEN_MISMATCH';
}
module.exports = function adminAllowed(context, env) {
    return denialReason(context, env) === '';
};
module.exports.revision = 'manual-prod-20261011';
module.exports.failure = function adminFailure(context, env) {
    const reason = denialReason(context, env) || 'ADMIN_CONTEXT_REQUIRED';
    const messages = {
        CLOUD_ENV_INVALID: '云环境配置不正确，请核对平台 CLOUD_ENV；不要将 prod 改成 DEV。',
        ADMIN_CONTEXT_REQUIRED: '此操作需要后台管理员验证，不能使用普通游戏请求。',
        ADMIN_TOKEN_NOT_CONFIGURED: 'prod 尚未配置有效的 DOUYIN_ADMIN_TOKEN；请在发布设置填写管理密钥并发布生效。',
        ADMIN_HEADER_REQUIRED: '请在请求参数的 Headers 添加 x-pdd-admin-token，使用与 prod 配置相同的管理密钥。',
        ADMIN_HEADER_INVALID: '请求头只能有一个 x-pdd-admin-token，值须为64位小写十六进制字符，不带引号或空格。',
        ADMIN_TOKEN_MISMATCH: '请求头与 prod 当前生效的管理密钥不一致，请粘贴同一份密钥，并确认配置已发布。'
    };
    // Never include supplied headers, environment values or credentials in diagnostics.
    return { ok: false, errorCode: 'ADMIN_CONSOLE_REQUIRED', adminReason: reason,
        errorMessage: messages[reason], manualSetupRevision: module.exports.revision };
};
