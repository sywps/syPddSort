#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');
const { LEVEL_DATA_CLIENT_BUILD, LEVEL_DATA_SCHEMA_VERSION, validateSlotPolicy } = require('./slot-policy-contract');

const dryRun = process.argv.includes('--dry-run');
const projectDir = path.resolve(__dirname, '..');
const cdnPlatform = process.env.PDD_CDN_PLATFORM === 'douyin' ? 'douyin' : 'wechat';
const platformLabel = cdnPlatform === 'douyin' ? '抖音' : '微信';
const platformRemoteDir = cdnPlatform === 'douyin' ? 'remote_douyin' : 'remote_wechat';
const levelDataSourceDir = path.join(projectDir, 'assets', 'LevelData');
const levelDataDir = path.resolve(projectDir, process.env.PDD_LEVEL_DATA_CDN_DIR || (cdnPlatform === 'douyin' ? 'build/level-data-cdn-douyin' : 'build/level-data-cdn'));
const packDir = path.join(levelDataDir, 'level_packs');
const liveManifestPath = path.join(levelDataDir, 'level_live.json');

const cdnUrl = process.env.PDD_LEVEL_DATA_CDN_URL || 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/' + platformRemoteDir + '/levels/';
const ossutilBin = process.env.PDD_OSSUTIL_BIN || 'ossutil';
const ossEndpoint = process.env.PDD_OSS_ENDPOINT || 'https://oss-cn-beijing.aliyuncs.com';
const ossBucket = process.env.PDD_OSS_BUCKET || 'game-pdd-v2';
const ossPath = process.env.PDD_LEVEL_DATA_OSS_PATH || 'syGame/pdd_v2/' + platformRemoteDir + '/levels/';

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

function assertLevelDataTarget(cdn, oss) {
    const normalizedCdn = normalizeTrailingSlash(cdn);
    const normalizedOss = normalizeOssPath(oss);
    const otherRemoteDir = cdnPlatform === 'douyin' ? 'remote_wechat' : 'remote_douyin';
    if (normalizedCdn.includes(otherRemoteDir) || normalizedOss.includes(otherRemoteDir)) {
        fail(platformLabel + '关卡数据 CDN 不能指向 ' + otherRemoteDir + ': ' + normalizedCdn + ' / ' + normalizedOss);
    }
    const required = platformRemoteDir + '/levels/';
    if (!normalizedCdn.includes(required) || !normalizedOss.includes(required)) {
        fail(platformLabel + '关卡数据 CDN 目标必须包含 ' + required + ': ' + normalizedCdn + ' / ' + normalizedOss);
    }
}

function parseLevelDataSourceFile(name) {
    const match = /^(zt_level_|level_)(\d+)\.json$/.exec(name);
    if (!match) return null;
    const levelId = Math.max(1, Math.floor(Number(match[2]) || 1));
    return {
        prefix: match[1],
        levelId,
        key: match[1] + levelId,
    };
}

function collectSourceLevelDataKeys() {
    assertDir(levelDataSourceDir, 'assets/LevelData');
    return new Set(fs.readdirSync(levelDataSourceDir)
        .map(parseLevelDataSourceFile)
        .filter(Boolean)
        .map((entry) => entry.key));
}

function collectSourceLevelDataPrefixCounts() {
    assertDir(levelDataSourceDir, 'assets/LevelData');
    return fs.readdirSync(levelDataSourceDir)
        .map(parseLevelDataSourceFile)
        .filter(Boolean)
        .reduce((counts, entry) => {
            counts[entry.prefix] = (counts[entry.prefix] || 0) + 1;
            return counts;
        }, {});
}

function runNode(script, args, label) {
    const result = spawnSync(process.execPath, [script].concat(args), {
        cwd: projectDir,
        stdio: 'inherit',
        shell: false,
    });
    if (result.error) fail('无法执行 node: ' + result.error.message);
    if (result.status !== 0) fail(label + '失败');
}

function validateLevelDataPackage() {
    assertDir(levelDataDir, '关卡数据 CDN 目录');
    assertDir(packDir, '关卡数据 pack 目录');
    assertFile(liveManifestPath, 'level_live.json');
    const manifest = readJson(liveManifestPath);
    if (manifest.manifestVersion !== 1 || manifest.schemaVersion !== LEVEL_DATA_SCHEMA_VERSION) fail('level_live.json schema 不正确');
    if (manifest.minClientBuild !== LEVEL_DATA_CLIENT_BUILD) fail('level_live.json minClientBuild 不正确');
    if (!manifest.dataVersion || typeof manifest.dataVersion !== 'string') fail('level_live.json 缺少 dataVersion');
    if (manifest.levelDataVersion && manifest.levelDataVersion !== manifest.dataVersion) fail('level_live.json levelDataVersion 与 dataVersion 不一致');
    if (!Array.isArray(manifest.packs) || manifest.packs.length === 0) fail('level_live.json 缺少 packs');
    const sourceKeys = collectSourceLevelDataKeys();
    const sourcePrefixCounts = collectSourceLevelDataPrefixCounts();
    const manifestPrefixCounts = manifest.levelCounts || {};
    const cdnKeys = new Set();
    const cdnPrefixCounts = {};
    let levelCount = 0;
    for (const pack of manifest.packs) {
        if (!pack || typeof pack.url !== 'string' || !pack.url.startsWith('level_packs/')) {
            fail('level_live.json pack.url 不正确');
        }
        const packPrefix = String(pack.prefix || 'level_');
        if (packPrefix !== 'level_' && packPrefix !== 'zt_level_') fail('level_live.json pack.prefix 不正确: ' + pack.url);
        const packPath = path.join(levelDataDir, pack.url);
        assertFile(packPath, '关卡数据 pack');
        const packJson = readJson(packPath);
        if (packJson.id !== pack.id) fail('关卡数据 pack id 不一致: ' + pack.url);
        if (packJson.schemaVersion !== LEVEL_DATA_SCHEMA_VERSION) fail('关卡数据 pack schema 不正确: ' + pack.url);
        if (String(packJson.prefix || packPrefix) !== packPrefix) fail('关卡数据 pack prefix 不一致: ' + pack.url);
        if (!Array.isArray(packJson.levels) || packJson.levels.length !== pack.levelCount) {
            fail('关卡数据 pack levelCount 不一致: ' + pack.url);
        }
        const packPayloadKeys = [];
        for (const entry of packJson.levels) {
            const levelId = Math.max(1, Math.floor(Number(entry && entry.levelId) || 1));
            const entryPrefix = String((entry && entry.prefix) || packJson.prefix || packPrefix);
            const key = entryPrefix + levelId;
            if (entryPrefix !== packPrefix) fail('关卡数据 pack entry prefix 不一致: ' + pack.url + ' ' + key);
            if (cdnKeys.has(key)) fail('关卡数据 CDN 重复关卡 key: ' + key);
            cdnKeys.add(key);
            packPayloadKeys.push(key);
            cdnPrefixCounts[entryPrefix] = (cdnPrefixCounts[entryPrefix] || 0) + 1;
            try {
                validateSlotPolicy(entry && entry.data, pack.url + ' ' + key);
            } catch (err) {
                fail(err && err.message ? err.message : String(err));
            }
        }
        if (Array.isArray(pack.levelKeys)) {
            const manifestKeys = pack.levelKeys.slice().sort();
            const payloadKeys = packPayloadKeys.slice().sort();
            if (manifestKeys.length !== payloadKeys.length || manifestKeys.some((key, index) => key !== payloadKeys[index])) {
                fail('level_live.json pack.levelKeys 与 pack 内容不一致: ' + pack.url);
            }
        }
        levelCount += packJson.levels.length;
    }
    if (levelCount !== manifest.levelCount) fail('level_live.json levelCount 不一致: ' + levelCount + ' != ' + manifest.levelCount);
    if (levelCount !== sourceKeys.size) fail('关卡数据数量异常: ' + levelCount + ' != assets/LevelData ' + sourceKeys.size);
    for (const prefix of ['level_', 'zt_level_']) {
        const sourceCount = sourcePrefixCounts[prefix] || 0;
        if ((manifestPrefixCounts[prefix] || 0) !== sourceCount) {
            fail('level_live.json levelCounts.' + prefix + ' 不一致: ' + (manifestPrefixCounts[prefix] || 0) + ' != ' + sourceCount);
        }
        if ((cdnPrefixCounts[prefix] || 0) !== sourceCount) {
            fail('关卡数据 CDN ' + prefix + ' 数量异常: ' + (cdnPrefixCounts[prefix] || 0) + ' != assets/LevelData ' + sourceCount);
        }
    }
    for (const key of sourceKeys) {
        if (!cdnKeys.has(key)) fail('关卡数据 CDN 缺少真源关卡: ' + key);
    }
    for (const key of cdnKeys) {
        if (!sourceKeys.has(key)) fail('关卡数据 CDN 包含未知关卡: ' + key);
    }
    return { manifest, levelCount };
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

async function verifyRemoteLiveManifest(expectedServer, localManifest, localLevelCount) {
    if (dryRun) {
        console.log('[dry-run] 跳过远端 level_live.json 回读校验');
        return;
    }
    const remoteUrl = expectedServer + 'level_live.json?t=' + Date.now();
    const remoteManifest = await requestJson(remoteUrl);
    if (remoteManifest.dataVersion !== localManifest.dataVersion) {
        fail('远端 level_live.json dataVersion 未更新: ' + remoteManifest.dataVersion + ' != ' + localManifest.dataVersion);
    }
    if (remoteManifest.levelCount !== localLevelCount) {
        fail('远端 level_live.json levelCount 异常: ' + remoteManifest.levelCount + ' != ' + localLevelCount);
    }
    for (const prefix of ['level_', 'zt_level_']) {
        const localCount = (localManifest.levelCounts || {})[prefix] || 0;
        const remoteCount = (remoteManifest.levelCounts || {})[prefix] || 0;
        if (remoteCount !== localCount) {
            fail('远端 level_live.json levelCounts.' + prefix + ' 未同步: ' + remoteCount + ' != ' + localCount);
        }
    }
    if (!remoteManifest.packs.some((pack) => String(pack && pack.prefix || 'level_') === 'zt_level_')) {
        fail('远端 level_live.json 缺少 zt_level_ 主题关卡 pack');
    }
    console.log('远端 level_live.json 回读校验通过: ' + remoteUrl);
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

console.log('=== 同步' + platformLabel + '关卡数据 CDN ===');
console.log('');

assertLevelDataTarget(cdnUrl, ossPath);
runNode('scripts/write-level-data-cdn.js', [
    levelDataDir,
    '--source',
    levelDataSourceDir,
], '生成' + platformLabel + '关卡 CDN 数据');
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
], platformLabel + '关卡数据 packs 上传');

runOssutil([
    'cp',
    '--acl',
    'public-read',
    '--force',
    '--endpoint',
    ossEndpoint,
    liveManifestPath,
    liveOssTarget,
], platformLabel + ' level_live.json 上传');

console.log('');
console.log(dryRun ? '=== Dry-run 校验完成，未上传 ===' : '=== 同步完成 ===');
console.log('level_live.json 已最后处理: ' + expectedServer + 'level_live.json');

verifyRemoteLiveManifest(expectedServer, manifest, levelCount).catch((err) => {
    fail('远端 level_live.json 回读校验失败: ' + (err && err.message ? err.message : err));
});
