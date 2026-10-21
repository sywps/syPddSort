'use strict';

const CDN_ORIGIN = 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com';
const OSS_ROOT = 'syGame/pdd_v2';
const OSS_BUCKET = 'game-pdd-v2';
const SLOT_REMOTE_DIRS = Object.freeze({ A: 'remote_douyin', B: 'remote_douyin_b' });

function normalizeDouyinCdnSlot(value) {
    const slot = String(value || '').trim().toUpperCase();
    if (!Object.hasOwn(SLOT_REMOTE_DIRS, slot)) throw new Error('抖音 CDN 槽位必须是 A 或 B: ' + String(value || '<missing>'));
    return slot;
}

function resolveDouyinCdnSlot(value) {
    const slot = normalizeDouyinCdnSlot(value);
    const remoteDir = SLOT_REMOTE_DIRS[slot];
    const cdnRootUrl = `${CDN_ORIGIN}/${OSS_ROOT}/${remoteDir}/`;
    const ossRootPath = `${OSS_ROOT}/${remoteDir}/`;
    return Object.freeze({ slot, remoteDir, cdnRootUrl, ossRootPath,
        levelDataCdnUrl: `${cdnRootUrl}levels/`, skinDataCdnUrl: `${cdnRootUrl}skin/`, profileDataCdnUrl: `${cdnRootUrl}profile/`,
        levelDataOssPath: `${ossRootPath}levels/`, skinDataOssPath: `${ossRootPath}skin/`, profileDataOssPath: `${ossRootPath}profile/` });
}

function extractRequiredDouyinCdnSlot(args) {
    const remainingArgs = [], values = [];
    for (let index = 0; index < args.length; index++) {
        const arg = String(args[index] || '');
        if (arg === '--cdn-slot') {
            if (!args[index + 1] || String(args[index + 1]).startsWith('--')) throw new Error('缺少 --cdn-slot 的值；必须显式传入 --cdn-slot=A 或 --cdn-slot=B');
            values.push(args[++index]);
        } else if (arg.startsWith('--cdn-slot=')) {
            values.push(arg.slice('--cdn-slot='.length));
        } else remainingArgs.push(arg);
    }
    if (!values.length) throw new Error('必须显式传入 --cdn-slot=A 或 --cdn-slot=B；命令不再默认写入线上 A');
    if (values.length !== 1) throw new Error('只能传入一个 --cdn-slot 参数');
    const target = resolveDouyinCdnSlot(values[0]);
    return { slot: target.slot, target, remainingArgs };
}

function configureDouyinCdnEnvironment(target, env = process.env) {
    const resolved = resolveDouyinCdnSlot(target && target.slot ? target.slot : target);
    const slash = value => String(value || '').trim().replace(/\/?$/, '/');
    const checks = [
        ['PDD_DOUYIN_CDN_SLOT', resolved.slot, value => String(value).trim().toUpperCase()],
        ['PDD_LEVEL_DATA_CDN_URL', resolved.levelDataCdnUrl, slash],
        ['PDD_SKIN_DATA_CDN_URL', resolved.skinDataCdnUrl, slash],
        ['PDD_PROFILE_DATA_CDN_URL', resolved.profileDataCdnUrl, slash],
        ['PDD_LEVEL_DATA_OSS_PATH', resolved.levelDataOssPath, value => slash(value).replace(/^\/+/, '')],
        ['PDD_SKIN_DATA_OSS_PATH', resolved.skinDataOssPath, value => slash(value).replace(/^\/+/, '')],
        ['PDD_PROFILE_DATA_OSS_PATH', resolved.profileDataOssPath, value => slash(value).replace(/^\/+/, '')],
        ['PDD_OSS_BUCKET', OSS_BUCKET, value => String(value).trim()],
    ];
    for (const [key, expected, normalize] of checks) {
        if (env[key] && normalize(env[key]) !== normalize(expected)) throw new Error(`${key} 与抖音 CDN 槽位不一致: ${env[key]} != ${expected}`);
    }
    for (const [key, expected] of checks) env[key] = expected;
    env.PDD_CDN_PLATFORM = 'douyin';
    return resolved;
}

function assertDouyinCdnManifest(manifest, target, label) {
    if (manifest.cdnPlatform !== 'douyin' || manifest.cdnSlot !== target.slot) {
        throw new Error(`${label} CDN 平台/槽位不正确: ${manifest.cdnPlatform || '<missing>'}/${manifest.cdnSlot || '<missing>'} != douyin/${target.slot}`);
    }
}

function assertRuntimeDouyinCdnTarget(content, target) {
    const expected = { __PDD_BUILD_PLATFORM__: 'douyin', __PDD_CDN_SLOT__: target.slot,
        __PDD_LEVEL_DATA_CDN_URL__: target.levelDataCdnUrl, __PDD_SKIN_DATA_CDN_URL__: target.skinDataCdnUrl,
        __PDD_PROFILE_DATA_CDN_URL__: target.profileDataCdnUrl };
    for (const [key, value] of Object.entries(expected)) {
        const matches = content.match(new RegExp('globalThis\\.' + key + '="[^"]*";', 'g')) || [];
        if (matches.length !== 1 || matches[0] !== 'globalThis.' + key + '=' + JSON.stringify(value) + ';') {
            throw new Error('抖音构建产物 CDN 标记不正确: ' + key);
        }
    }
}

module.exports = { configureDouyinCdnEnvironment, extractRequiredDouyinCdnSlot, normalizeDouyinCdnSlot,
    resolveDouyinCdnSlot, assertDouyinCdnManifest, assertRuntimeDouyinCdnTarget };
