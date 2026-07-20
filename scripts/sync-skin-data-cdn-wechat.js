#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    configureWechatCdnEnvironment,
    extractRequiredWechatCdnSlot,
} = require('./wechat-cdn-slot-config');

const projectDir = path.resolve(__dirname, '..');
const cdnPlatform = process.env.PDD_CDN_PLATFORM === 'douyin' ? 'douyin' : 'wechat';
const syncCommand = parseSyncCommand(process.argv.slice(2), cdnPlatform);
const dryRun = syncCommand.dryRun;
const wechatCdnTarget = syncCommand.wechatCdnTarget;
const platformLabel = cdnPlatform === 'douyin' ? '抖音' : '微信';
const platformRemoteDir = cdnPlatform === 'douyin' ? 'remote_douyin' : wechatCdnTarget.remoteDir;
const skinDataDir = path.resolve(projectDir, process.env.PDD_SKIN_DATA_CDN_DIR || (cdnPlatform === 'douyin' ? 'build/skin-cdn-douyin' : 'build/skin-cdn'));
const assetDir = path.join(skinDataDir, 'assets');
const liveManifestPath = path.join(skinDataDir, 'skin_live.json');

const cdnUrl = cdnPlatform === 'wechat'
    ? wechatCdnTarget.skinDataCdnUrl
    : (process.env.PDD_SKIN_DATA_CDN_URL || 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/' + platformRemoteDir + '/skin/');
const ossutilBin = process.env.PDD_OSSUTIL_BIN || 'ossutil';
const ossEndpoint = process.env.PDD_OSS_ENDPOINT || 'https://oss-cn-beijing.aliyuncs.com';
const ossBucket = process.env.PDD_OSS_BUCKET || 'game-pdd-v2';
const ossPath = cdnPlatform === 'wechat'
    ? wechatCdnTarget.skinDataOssPath
    : (process.env.PDD_SKIN_DATA_OSS_PATH || 'syGame/pdd_v2/' + platformRemoteDir + '/skin/');

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function parseSyncCommand(args, platform) {
    let remainingArgs = args.slice();
    let wechatCdnTarget = null;
    if (platform === 'wechat') {
        try {
            const parsed = extractRequiredWechatCdnSlot(remainingArgs);
            wechatCdnTarget = configureWechatCdnEnvironment(parsed.target, process.env);
            remainingArgs = parsed.remainingArgs;
        } catch (error) {
            fail(error && error.message ? error.message : String(error));
        }
    }
    const dryRunArgs = remainingArgs.filter((arg) => arg === '--dry-run');
    const unknownArgs = remainingArgs.filter((arg) => arg !== '--dry-run');
    if (unknownArgs.length > 0) fail('未知参数: ' + unknownArgs.join(' '));
    if (dryRunArgs.length > 1) fail('只能传入一次 --dry-run');
    return { dryRun: dryRunArgs.length === 1, wechatCdnTarget };
}

function runNode(script, args, label) {
    const result = spawnSync(process.execPath, [path.join(projectDir, script)].concat(args), {
        cwd: projectDir,
        env: process.env,
        stdio: 'inherit',
        shell: false,
    });
    if (result.error) fail('无法执行 node: ' + result.error.message);
    if (result.status !== 0) fail(label + '失败');
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

function hashFile(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function dirSize(dir) {
    let size = 0;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        size += item.isDirectory() ? dirSize(full) : fs.statSync(full).size;
    }
    return size;
}

function assertSkinDataTarget(cdn, oss) {
    const normalizedCdn = normalizeTrailingSlash(cdn);
    const normalizedOss = normalizeOssPath(oss);
    if (cdnPlatform === 'wechat') {
        if (
            normalizedCdn !== wechatCdnTarget.skinDataCdnUrl
            || normalizedOss !== wechatCdnTarget.skinDataOssPath
        ) {
            fail('微信皮肤数据 CDN 与槽位 ' + wechatCdnTarget.slot + ' 不一致: ' + normalizedCdn + ' / ' + normalizedOss);
        }
        return;
    }
    const otherRemoteDir = cdnPlatform === 'douyin' ? 'remote_wechat' : 'remote_douyin';
    if (normalizedCdn.includes(otherRemoteDir) || normalizedOss.includes(otherRemoteDir)) {
        fail(platformLabel + '皮肤数据 CDN 不能指向 ' + otherRemoteDir + ': ' + normalizedCdn + ' / ' + normalizedOss);
    }
    const required = platformRemoteDir + '/skin/';
    if (!normalizedCdn.includes(required) || !normalizedOss.includes(required)) {
        fail(platformLabel + '皮肤数据 CDN 目标必须包含 ' + required + ': ' + normalizedCdn + ' / ' + normalizedOss);
    }
}

function validateAsset(asset, seenUrls) {
    if (!asset || typeof asset.url !== 'string' || !asset.url.startsWith('assets/')) {
        fail('skin_live.json asset.url 不正确');
    }
    if (seenUrls.has(asset.url)) fail('skin_live.json asset.url 重复: ' + asset.url);
    seenUrls.add(asset.url);
    if (!asset.hash || typeof asset.hash !== 'string') fail('skin_live.json asset 缺少 hash: ' + asset.url);
    if (!Number.isFinite(Number(asset.bytes)) || Number(asset.bytes) <= 0) fail('skin_live.json asset.bytes 异常: ' + asset.url);
    if (!Number.isFinite(Number(asset.width)) || Number(asset.width) <= 0) fail('skin_live.json asset.width 异常: ' + asset.url);
    if (!Number.isFinite(Number(asset.height)) || Number(asset.height) <= 0) fail('skin_live.json asset.height 异常: ' + asset.url);
    const filePath = path.join(skinDataDir, asset.url);
    assertFile(filePath, '皮肤资源文件');
    const stat = fs.statSync(filePath);
    if (stat.size !== Number(asset.bytes)) fail('skin_live.json asset.bytes 与文件不一致: ' + asset.url);
    const actualHash = hashFile(filePath);
    if (actualHash !== asset.hash) fail('skin_live.json asset.hash 与文件不一致: ' + asset.url);
}

function validateSkinDataPackage() {
    assertDir(skinDataDir, '皮肤数据 CDN 目录');
    assertDir(assetDir, '皮肤资源 assets 目录');
    assertFile(liveManifestPath, 'skin_live.json');
    const manifest = readJson(liveManifestPath);
    if (manifest.manifestVersion !== 1 || manifest.schemaVersion !== 1) fail('skin_live.json schema 不正确');
    if (cdnPlatform === 'wechat' && manifest.cdnSlot !== wechatCdnTarget.slot) {
        fail('skin_live.json cdnSlot 不正确: ' + String(manifest.cdnSlot || '<missing>') + ' != ' + wechatCdnTarget.slot);
    }
    if (!manifest.skinDataVersion || typeof manifest.skinDataVersion !== 'string') fail('skin_live.json 缺少 skinDataVersion');
    if (!Array.isArray(manifest.skins) || manifest.skins.length === 0) fail('skin_live.json 缺少 skins');
    if (manifest.skinCount !== manifest.skins.length) fail('skin_live.json skinCount 不一致');
    const seenIds = new Set();
    const seenUrls = new Set();
    let assetCount = 0;
    for (const skin of manifest.skins) {
        const id = Math.floor(Number(skin && skin.id) || 0);
        if (id <= 0) fail('skin_live.json skin.id 不正确');
        if (seenIds.has(id)) fail('skin_live.json skin.id 重复: ' + id);
        seenIds.add(id);
        if (skin.type !== 'background') fail('skin_live.json 暂只支持 background 皮肤: ' + id);
        const assets = skin.assets || {};
        validateAsset(assets.background, seenUrls);
        validateAsset(assets.icon, seenUrls);
        assetCount += 2;
    }
    if (manifest.assetCount !== assetCount) fail('skin_live.json assetCount 不一致: ' + manifest.assetCount + ' != ' + assetCount);
    return { manifest, assetCount };
}

function requestJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error('HTTP ' + res.statusCode));
                    return;
                }
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                } catch (err) {
                    reject(err);
                }
            });
        }).on('error', reject).setTimeout(15000, function () {
            this.destroy(new Error('request timeout'));
        });
    });
}

async function verifyRemoteLiveManifest(expectedServer, localManifest) {
    if (dryRun) {
        console.log('[dry-run] 跳过远端 skin_live.json 回读校验');
        return;
    }
    const remoteUrl = expectedServer + 'skin_live.json?t=' + Date.now();
    const remoteManifest = await requestJson(remoteUrl);
    if (cdnPlatform === 'wechat' && remoteManifest.cdnSlot !== wechatCdnTarget.slot) {
        fail('远端 skin_live.json cdnSlot 异常: ' + String(remoteManifest.cdnSlot || '<missing>') + ' != ' + wechatCdnTarget.slot);
    }
    if (remoteManifest.skinDataVersion !== localManifest.skinDataVersion) {
        fail('远端 skin_live.json skinDataVersion 未更新: ' + remoteManifest.skinDataVersion + ' != ' + localManifest.skinDataVersion);
    }
    if (remoteManifest.skinCount !== localManifest.skinCount) {
        fail('远端 skin_live.json skinCount 异常: ' + remoteManifest.skinCount + ' != ' + localManifest.skinCount);
    }
    if (remoteManifest.assetCount !== localManifest.assetCount) {
        fail('远端 skin_live.json assetCount 异常: ' + remoteManifest.assetCount + ' != ' + localManifest.assetCount);
    }
    console.log('远端 skin_live.json 回读校验通过: ' + remoteUrl);
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

console.log('=== 同步' + platformLabel + '皮肤数据 CDN ===');
console.log('');
if (wechatCdnTarget) console.log('CDN 槽位: ' + wechatCdnTarget.slot);

assertSkinDataTarget(cdnUrl, ossPath);
runNode('scripts/write-skin-data-cdn.js', [skinDataDir], '生成' + platformLabel + '皮肤 CDN 数据');
const { manifest, assetCount } = validateSkinDataPackage();
const expectedServer = normalizeTrailingSlash(cdnUrl);
const normalizedOssPath = normalizeOssPath(ossPath);
const ossTarget = 'oss://' + ossBucket + '/' + normalizedOssPath;
const assetsOssTarget = ossTarget + 'assets/';
const liveOssTarget = ossTarget + 'skin_live.json';

console.log('皮肤数据目录: ' + skinDataDir);
console.log('皮肤数据大小: ' + Math.round(dirSize(skinDataDir) / 1024 / 1024) + 'MB');
console.log('CDN URL: ' + expectedServer);
console.log('skinDataVersion: ' + manifest.skinDataVersion);
console.log('skins: ' + manifest.skins.length);
console.log('assets: ' + assetCount);
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
    assetDir + path.sep,
    assetsOssTarget,
], platformLabel + '皮肤资源 assets 上传');

runOssutil([
    'cp',
    '--acl',
    'public-read',
    '--force',
    '--endpoint',
    ossEndpoint,
    liveManifestPath,
    liveOssTarget,
], platformLabel + ' skin_live.json 上传');

console.log('');
console.log(dryRun ? '=== Dry-run 校验完成，未上传 ===' : '=== 同步完成 ===');
console.log('skin_live.json 已最后处理: ' + expectedServer + 'skin_live.json');

verifyRemoteLiveManifest(expectedServer, manifest).catch((err) => {
    fail('远端 skin_live.json 回读校验失败: ' + (err && err.message ? err.message : err));
});
