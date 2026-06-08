#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dryRun = process.argv.includes('--dry-run');
const projectDir = path.resolve(__dirname, '..');
const levelDataDir = path.join(projectDir, 'build', 'level-data-cdn');
const packDir = path.join(levelDataDir, 'level_packs');
const liveManifestPath = path.join(levelDataDir, 'level_live.json');

const cdnUrl = process.env.PDD_LEVEL_DATA_CDN_URL || 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat/levels/';
const ossutilBin = process.env.PDD_OSSUTIL_BIN || 'ossutil';
const ossEndpoint = process.env.PDD_OSS_ENDPOINT || 'https://oss-cn-beijing.aliyuncs.com';
const ossBucket = process.env.PDD_OSS_BUCKET || 'game-pdd-v2';
const ossPath = process.env.PDD_LEVEL_DATA_OSS_PATH || 'syGame/pdd_v2/remote_wechat/levels/';

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function assertDir(dirPath, label) {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) fail(label + ' 不存在: ' + dirPath);
}

function assertFile(filePath, label) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) fail(label + ' 不存在: ' + filePath);
}

function readJson(filePath) {
    assertFile(filePath, path.basename(filePath));
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeTrailingSlash(value) {
    return String(value || '').replace(/\/?$/, '/');
}

function normalizeOssPath(value) {
    return String(value || '').replace(/^\/+/, '').replace(/\/?$/, '/');
}

function dirSize(dir) {
    let size = 0;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        size += item.isDirectory() ? dirSize(full) : fs.statSync(full).size;
    }
    return size;
}

function assertWechatLevelDataTarget(cdn, oss) {
    const normalizedCdn = normalizeTrailingSlash(cdn);
    const normalizedOss = normalizeOssPath(oss);
    if (normalizedCdn.includes('remote_dy') || normalizedOss.includes('remote_dy')) {
        fail('微信关卡数据 CDN 不能指向 remote_dy: ' + normalizedCdn + ' / ' + normalizedOss);
    }
    if (!normalizedCdn.includes('remote_wechat/levels/') || !normalizedOss.includes('remote_wechat/levels/')) {
        fail('微信关卡数据 CDN 目标必须包含 remote_wechat/levels/: ' + normalizedCdn + ' / ' + normalizedOss);
    }
}

function validateLevelDataPackage() {
    assertDir(levelDataDir, '关卡数据 CDN 目录');
    assertDir(packDir, '关卡数据 pack 目录');
    assertFile(liveManifestPath, 'level_live.json');
    const manifest = readJson(liveManifestPath);
    if (manifest.manifestVersion !== 1 || manifest.schemaVersion !== 1) fail('level_live.json schema 不正确');
    if (!manifest.dataVersion || typeof manifest.dataVersion !== 'string') fail('level_live.json 缺少 dataVersion');
    if (!Array.isArray(manifest.packs) || manifest.packs.length === 0) fail('level_live.json 缺少 packs');
    let levelCount = 0;
    for (const pack of manifest.packs) {
        if (!pack || typeof pack.url !== 'string' || !pack.url.startsWith('level_packs/')) {
            fail('level_live.json pack.url 不正确');
        }
        const packPath = path.join(levelDataDir, pack.url);
        assertFile(packPath, '关卡数据 pack');
        const packJson = readJson(packPath);
        if (packJson.id !== pack.id) fail('关卡数据 pack id 不一致: ' + pack.url);
        if (!Array.isArray(packJson.levels) || packJson.levels.length !== pack.levelCount) {
            fail('关卡数据 pack levelCount 不一致: ' + pack.url);
        }
        levelCount += packJson.levels.length;
    }
    if (levelCount !== manifest.levelCount) fail('level_live.json levelCount 不一致: ' + levelCount + ' != ' + manifest.levelCount);
    if (levelCount < 300) fail('关卡数据数量异常: ' + levelCount);
    return { manifest, levelCount };
}

function runOssutil(args, label) {
    if (dryRun) {
        console.log('[dry-run] ' + ossutilBin + ' ' + args.map((item) => item.includes(' ') ? '"' + item + '"' : item).join(' '));
        return;
    }
    const result = spawnSync(ossutilBin, args, {
        cwd: projectDir,
        stdio: 'inherit',
        shell: false,
    });
    if (result.error) fail('无法执行 ' + ossutilBin + ': ' + result.error.message);
    if (result.status !== 0) {
        console.error('');
        console.error(label + '失败，请手动确认 ossutil 登录状态和权限后重试');
        process.exit(result.status || 1);
    }
}

console.log('=== 同步微信关卡数据 CDN ===');
console.log('');

assertWechatLevelDataTarget(cdnUrl, ossPath);
const { manifest, levelCount } = validateLevelDataPackage();
const expectedServer = normalizeTrailingSlash(cdnUrl);
const normalizedOssPath = normalizeOssPath(ossPath);
const ossTarget = 'oss://' + ossBucket + '/' + normalizedOssPath;
const packsOssTarget = ossTarget + 'level_packs/';
const liveOssTarget = ossTarget + 'level_live.json';

console.log('关卡数据目录: ' + levelDataDir);
console.log('关卡数据大小: ' + Math.round(dirSize(levelDataDir) / 1024 / 1024) + 'MB');
console.log('CDN URL: ' + expectedServer);
console.log('dataVersion: ' + manifest.dataVersion);
console.log('packs: ' + manifest.packs.length);
console.log('levels: ' + levelCount);
console.log('OSS 路径: ' + ossTarget);
console.log('');

runOssutil([
    'cp',
    '-r',
    '--acl',
    'public-read',
    '--force',
    '--endpoint',
    ossEndpoint,
    packDir + path.sep,
    packsOssTarget,
], '微信关卡数据 packs 上传');

runOssutil([
    'cp',
    '--acl',
    'public-read',
    '--force',
    '--endpoint',
    ossEndpoint,
    liveManifestPath,
    liveOssTarget,
], '微信 level_live.json 上传');

console.log('');
console.log(dryRun ? '=== Dry-run 校验完成，未上传 ===' : '=== 同步完成 ===');
console.log('level_live.json 已最后处理: ' + expectedServer + 'level_live.json');
