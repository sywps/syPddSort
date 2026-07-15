#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');
const { LEVEL_DATA_CLIENT_BUILD, LEVEL_DATA_SCHEMA_VERSION, validateSlotPolicy } = require('./slot-policy-contract');

const EXPERIMENT_ID = 'level_exp';
const DEFAULT_CDN_URL = 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat/level_experiments/level_exp/levels/';
const DEFAULT_OSS_PATH = 'syGame/pdd_v2/remote_wechat/level_experiments/level_exp/levels/';

const projectDir = path.resolve(__dirname, '..');
const options = parseArgs(process.argv.slice(2));
const dryRun = options.dryRun;
const sourceDir = options.source ? path.resolve(options.source) : '';
const rangeText = options.range || process.env.PDD_LEVEL_EXP_RANGE || '';
const outputDir = path.resolve(options.output || path.join(projectDir, 'build', 'level-exp-cdn', EXPERIMENT_ID, 'levels'));
const packDir = path.join(outputDir, 'level_packs');
const liveManifestPath = path.join(outputDir, 'level_live.json');

const cdnUrl = process.env.PDD_LEVEL_EXP_CDN_URL || DEFAULT_CDN_URL;
const ossutilBin = process.env.PDD_OSSUTIL_BIN || 'ossutil';
const ossEndpoint = process.env.PDD_OSS_ENDPOINT || 'https://oss-cn-beijing.aliyuncs.com';
const ossBucket = process.env.PDD_OSS_BUCKET || 'game-pdd-v2';
const ossPath = process.env.PDD_LEVEL_EXP_OSS_PATH || DEFAULT_OSS_PATH;

function parseArgs(args) {
    const parsed = {
        dryRun: false,
        source: '',
        range: '',
        output: '',
    };
    const positionals = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--dry-run') {
            parsed.dryRun = true;
        } else if (arg === '--source') {
            parsed.source = args[++i] || '';
        } else if (arg.startsWith('--source=')) {
            parsed.source = arg.slice('--source='.length);
        } else if (arg === '--range') {
            parsed.range = args[++i] || '';
        } else if (arg.startsWith('--range=')) {
            parsed.range = arg.slice('--range='.length);
        } else if (arg === '--output') {
            parsed.output = args[++i] || '';
        } else if (arg.startsWith('--output=')) {
            parsed.output = arg.slice('--output='.length);
        } else if (!arg.startsWith('-')) {
            positionals.push(arg);
        } else {
            fail('未知参数: ' + arg);
        }
    }
    if (!parsed.source && positionals.length) parsed.source = positionals[0];
    return parsed;
}

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

function parseRange(value) {
    if (!value) return null;
    const match = /^(\d+)\s*[-:]\s*(\d+)$/.exec(String(value || '').trim());
    if (!match) fail('range 格式应为 start-end，例如 1-351: ' + value);
    const min = Math.max(1, Math.floor(Number(match[1]) || 1));
    const max = Math.max(1, Math.floor(Number(match[2]) || 1));
    if (min > max) fail('range 起点不能大于终点: ' + value);
    return { min, max, text: min + '-' + max };
}

function inferSourceRange(dirPath) {
    const levelIds = fs.readdirSync(dirPath)
        .map((name) => {
            const match = /^level_(\d+)\.json$/.exec(name);
            return match ? Math.max(1, Math.floor(Number(match[1]) || 1)) : 0;
        })
        .filter((levelId) => levelId > 0)
        .sort((a, b) => a - b);
    if (levelIds.length < 1) fail('实验关卡源码目录没有 level_*.json: ' + dirPath);
    const min = levelIds[0];
    const max = levelIds[levelIds.length - 1];
    const seen = new Set(levelIds);
    for (let levelId = min; levelId <= max; levelId++) {
        if (!seen.has(levelId)) fail('实验关卡源码目录关卡不连续，缺少 level_' + levelId + '.json');
    }
    if (seen.size !== levelIds.length) fail('实验关卡源码目录存在重复关卡编号');
    return { min, max, text: min + '-' + max };
}

function dirSize(dir) {
    let size = 0;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        size += item.isDirectory() ? dirSize(full) : fs.statSync(full).size;
    }
    return size;
}

function assertWechatLevelExpTarget(cdn, oss) {
    const normalizedCdn = normalizeTrailingSlash(cdn);
    const normalizedOss = normalizeOssPath(oss);
    const required = 'remote_wechat/level_experiments/level_exp/levels/';
    if (normalizedCdn.includes('remote_dy') || normalizedOss.includes('remote_dy')) {
        fail('微信关卡实验 CDN 不能指向 remote_dy: ' + normalizedCdn + ' / ' + normalizedOss);
    }
    if (!normalizedCdn.includes(required) || !normalizedOss.includes(required)) {
        fail('微信关卡实验 CDN 目标必须包含 ' + required + ': ' + normalizedCdn + ' / ' + normalizedOss);
    }
    if (normalizedCdn.endsWith('/remote_wechat/levels/') || normalizedOss.endsWith('/remote_wechat/levels/')) {
        fail('关卡实验禁止上传到线上稳定 levels 目录: ' + normalizedCdn + ' / ' + normalizedOss);
    }
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

function validateLevelExpPackage(range) {
    assertDir(outputDir, '关卡实验 CDN 目录');
    assertDir(packDir, '关卡实验 pack 目录');
    assertFile(liveManifestPath, 'level_live.json');
    const manifest = readJson(liveManifestPath);
    if (manifest.manifestVersion !== 1 || manifest.schemaVersion !== LEVEL_DATA_SCHEMA_VERSION) fail('level_live.json schema 不正确');
    if (manifest.minClientBuild !== LEVEL_DATA_CLIENT_BUILD) fail('level_live.json minClientBuild 不正确');
    if (manifest.experimentId !== EXPERIMENT_ID) fail('level_live.json experimentId 不正确: ' + manifest.experimentId);
    if (!manifest.dataVersion || typeof manifest.dataVersion !== 'string') fail('level_live.json 缺少 dataVersion');
    if (manifest.levelDataVersion && manifest.levelDataVersion !== manifest.dataVersion) fail('level_live.json levelDataVersion 与 dataVersion 不一致');
    if (!Array.isArray(manifest.packs) || manifest.packs.length === 0) fail('level_live.json 缺少 packs');
    const expectedCount = range.max - range.min + 1;
    if (manifest.levelCount !== expectedCount) fail('level_live.json levelCount 不一致: ' + manifest.levelCount + ' != ' + expectedCount);
    if ((manifest.levelCounts || {}).level_ !== expectedCount) fail('level_live.json levelCounts.level_ 不一致');
    if ((manifest.levelCounts || {}).zt_level_) fail('关卡实验不应包含 zt_level_');

    const expectedKeys = new Set();
    for (let levelId = range.min; levelId <= range.max; levelId++) {
        expectedKeys.add('level_' + levelId);
    }
    const foundKeys = new Set();
    for (const pack of manifest.packs) {
        if (!pack || typeof pack.url !== 'string' || !pack.url.startsWith('level_packs/')) {
            fail('level_live.json pack.url 不正确');
        }
        if (String(pack.prefix || 'level_') !== 'level_') fail('关卡实验 pack.prefix 必须为 level_: ' + pack.url);
        const packPath = path.join(outputDir, pack.url);
        const packJson = readJson(packPath);
        if (packJson.id !== pack.id) fail('关卡实验 pack id 不一致: ' + pack.url);
        if (packJson.schemaVersion !== LEVEL_DATA_SCHEMA_VERSION) fail('关卡实验 pack schema 不正确: ' + pack.url);
        if (String(packJson.prefix || 'level_') !== 'level_') fail('关卡实验 pack prefix 不一致: ' + pack.url);
        if (!Array.isArray(packJson.levels) || packJson.levels.length !== pack.levelCount) {
            fail('关卡实验 pack levelCount 不一致: ' + pack.url);
        }
        const packKeys = [];
        for (const entry of packJson.levels) {
            const levelId = Math.max(1, Math.floor(Number(entry && entry.levelId) || 1));
            const key = 'level_' + levelId;
            if (levelId < range.min || levelId > range.max) fail('关卡实验包含范围外关卡: ' + key);
            if (foundKeys.has(key)) fail('关卡实验重复关卡: ' + key);
            foundKeys.add(key);
            packKeys.push(key);
            try {
                validateSlotPolicy(entry && entry.data, pack.url + ' ' + key);
            } catch (err) {
                fail(err && err.message ? err.message : String(err));
            }
        }
        if (Array.isArray(pack.levelKeys)) {
            const manifestKeys = pack.levelKeys.slice().sort();
            const payloadKeys = packKeys.slice().sort();
            if (manifestKeys.length !== payloadKeys.length || manifestKeys.some((key, index) => key !== payloadKeys[index])) {
                fail('level_live.json pack.levelKeys 与 pack 内容不一致: ' + pack.url);
            }
        }
    }
    for (const key of expectedKeys) {
        if (!foundKeys.has(key)) fail('关卡实验缺少关卡: ' + key);
    }
    return { manifest, levelCount: expectedCount };
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
    if (remoteManifest.experimentId !== EXPERIMENT_ID) fail('远端 level_live.json experimentId 不正确: ' + remoteManifest.experimentId);
    if (remoteManifest.dataVersion !== localManifest.dataVersion) {
        fail('远端 level_live.json dataVersion 未更新: ' + remoteManifest.dataVersion + ' != ' + localManifest.dataVersion);
    }
    if (remoteManifest.levelCount !== localLevelCount) {
        fail('远端 level_live.json levelCount 异常: ' + remoteManifest.levelCount + ' != ' + localLevelCount);
    }
    console.log('远端关卡实验 level_live.json 回读校验通过: ' + remoteUrl);
}

if (!sourceDir) {
    fail('缺少实验关卡目录。用法: npm run sync:cdn:wechat:level_exp -- --source <dir> [--range 1-351]');
}

assertDir(sourceDir, '实验关卡源码目录');
const range = parseRange(rangeText) || inferSourceRange(sourceDir);
assertWechatLevelExpTarget(cdnUrl, ossPath);

console.log('=== 同步微信关卡实验 CDN: ' + EXPERIMENT_ID + ' ===');
console.log('');

runNode('scripts/write-level-data-cdn.js', [
    outputDir,
    '--source',
    sourceDir,
    '--range',
    range.text,
    '--prefix',
    'level_',
    '--experiment-id',
    EXPERIMENT_ID,
], '生成关卡实验 CDN 数据');

const { manifest, levelCount } = validateLevelExpPackage(range);
const expectedServer = normalizeTrailingSlash(cdnUrl);
const normalizedOssPath = normalizeOssPath(ossPath);
const ossTarget = 'oss://' + ossBucket + '/' + normalizedOssPath;
const packsOssTarget = ossTarget + 'level_packs/';
const liveOssTarget = ossTarget + 'level_live.json';

console.log('实验关卡源码: ' + sourceDir);
console.log('实验关卡范围: ' + range.text);
console.log('实验关卡数据目录: ' + outputDir);
console.log('实验关卡数据大小: ' + Math.round(dirSize(outputDir) / 1024 / 1024) + 'MB');
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
], '微信关卡实验 packs 上传');

runOssutil([
    'cp',
    '--acl',
    'public-read',
    '--force',
    '--endpoint',
    ossEndpoint,
    liveManifestPath,
    liveOssTarget,
], '微信关卡实验 level_live.json 上传');

console.log('');
console.log(dryRun ? '=== Dry-run 校验完成，未上传 ===' : '=== 同步完成 ===');
console.log('关卡实验 level_live.json 已最后处理: ' + expectedServer + 'level_live.json');

verifyRemoteLiveManifest(expectedServer, manifest, levelCount).catch((err) => {
    fail('远端关卡实验 level_live.json 回读校验失败: ' + (err && err.message ? err.message : err));
});
