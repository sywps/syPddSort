'use strict';

const CDN_ORIGIN = 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com';
const OSS_ROOT = 'syGame/pdd_v2';
const SLOT_REMOTE_DIRS = Object.freeze({
    A: 'remote_wechat',
    B: 'remote_wechat_b',
});

function normalizeWechatCdnSlot(value) {
    const slot = String(value || '').trim().toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(SLOT_REMOTE_DIRS, slot)) {
        throw new Error('微信 CDN 槽位必须是 A 或 B: ' + String(value || '<missing>'));
    }
    return slot;
}

function resolveWechatCdnSlot(value) {
    const slot = normalizeWechatCdnSlot(value);
    const remoteDir = SLOT_REMOTE_DIRS[slot];
    const cdnRootUrl = `${CDN_ORIGIN}/${OSS_ROOT}/${remoteDir}/`;
    const ossRootPath = `${OSS_ROOT}/${remoteDir}/`;
    return Object.freeze({
        slot,
        remoteDir,
        cdnRootUrl,
        ossRootPath,
        levelDataCdnUrl: `${cdnRootUrl}levels/`,
        skinDataCdnUrl: `${cdnRootUrl}skin/`,
        levelDataOssPath: `${ossRootPath}levels/`,
        skinDataOssPath: `${ossRootPath}skin/`,
    });
}

function extractRequiredWechatCdnSlot(args) {
    const sourceArgs = Array.isArray(args) ? args.slice() : [];
    const remainingArgs = [];
    const values = [];
    for (let index = 0; index < sourceArgs.length; index++) {
        const arg = String(sourceArgs[index] || '');
        if (arg === '--cdn-slot') {
            if (index + 1 >= sourceArgs.length || String(sourceArgs[index + 1] || '').startsWith('--')) {
                throw new Error('缺少 --cdn-slot 的值；必须显式传入 --cdn-slot=A 或 --cdn-slot=B');
            }
            values.push(sourceArgs[index + 1]);
            index += 1;
            continue;
        }
        if (arg.startsWith('--cdn-slot=')) {
            values.push(arg.slice('--cdn-slot='.length));
            continue;
        }
        remainingArgs.push(sourceArgs[index]);
    }
    if (values.length === 0) {
        throw new Error('必须显式传入 --cdn-slot=A 或 --cdn-slot=B；命令不再默认写入线上 A');
    }
    if (values.length > 1) {
        throw new Error('只能传入一个 --cdn-slot 参数');
    }
    const target = resolveWechatCdnSlot(values[0]);
    return { slot: target.slot, target, remainingArgs };
}

function normalizeUrl(value) {
    return String(value || '').trim().replace(/\/?$/, '/');
}

function normalizeOssPath(value) {
    return String(value || '').trim().replace(/^\/+/, '').replace(/\/?$/, '/');
}

function assertCompatibleOverride(env, key, expected, normalizer) {
    const existing = env[key];
    if (!existing) return;
    if (normalizer(existing) !== normalizer(expected)) {
        throw new Error(`${key} 与 CDN 槽位不一致: ${existing} != ${expected}`);
    }
}

function configureWechatCdnEnvironment(target, env = process.env) {
    const resolved = resolveWechatCdnSlot(target && target.slot ? target.slot : target);
    assertCompatibleOverride(env, 'PDD_WECHAT_CDN_SLOT', resolved.slot, (value) => String(value || '').trim().toUpperCase());
    assertCompatibleOverride(env, 'PDD_LEVEL_DATA_CDN_URL', resolved.levelDataCdnUrl, normalizeUrl);
    assertCompatibleOverride(env, 'PDD_SKIN_DATA_CDN_URL', resolved.skinDataCdnUrl, normalizeUrl);
    assertCompatibleOverride(env, 'PDD_LEVEL_DATA_OSS_PATH', resolved.levelDataOssPath, normalizeOssPath);
    assertCompatibleOverride(env, 'PDD_SKIN_DATA_OSS_PATH', resolved.skinDataOssPath, normalizeOssPath);
    env.PDD_WECHAT_CDN_SLOT = resolved.slot;
    env.PDD_LEVEL_DATA_CDN_URL = resolved.levelDataCdnUrl;
    env.PDD_SKIN_DATA_CDN_URL = resolved.skinDataCdnUrl;
    env.PDD_LEVEL_DATA_OSS_PATH = resolved.levelDataOssPath;
    env.PDD_SKIN_DATA_OSS_PATH = resolved.skinDataOssPath;
    return resolved;
}

module.exports = {
    CDN_ORIGIN,
    SLOT_REMOTE_DIRS,
    configureWechatCdnEnvironment,
    extractRequiredWechatCdnSlot,
    normalizeWechatCdnSlot,
    resolveWechatCdnSlot,
};
