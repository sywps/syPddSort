#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    LEVEL_DATA_CLIENT_BUILD,
    LEVEL_DATA_CONTRACT,
    LEVEL_DATA_SCHEMA_VERSION,
    validateSlotPolicy,
} = require('./slot-policy-contract');
const {
    configureWechatCdnEnvironment,
    resolveWechatCdnSlot,
} = require('./wechat-cdn-slot-config');

const projectDir = path.resolve(__dirname, '..');
const LY_0224_EXPERIMENT_ID = 'ly_0224';
const LY_0224_RUNTIME_MINIMUM_LEVEL_ID = 2;
const LY_0224_OVERRIDE_LEVEL_IDS = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9]);
const LY_0224_STABLE_SOURCE_DIR = 'assets/LevelData';
const LY_0224_TUTORIAL_CONTRACTS = Object.freeze({
    2: {
        mode: 'slot_intro',
        stepCount: 1,
        guideCopies: ['点击【解锁按钮】'],
    },
    3: {
        mode: 'zoom',
        stepCount: 1,
        title: '双指【缩放图案】',
        subtitle: '也可以直接开始游戏',
        guideCopies: ['双指【缩放图案】'],
    },
});
const LY_0224_TREATMENT_CDN_URL =
    'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat_b/0722_levels/front10_v1/treatment/';
const LY_0224_TREATMENT_OSS_PATH =
    'syGame/pdd_v2/remote_wechat_b/0722_levels/front10_v1/treatment/';
const LY_0224_OUTPUT_DIR = 'build/level-experiment-cdn/ly_0224/treatment';
const cdnPlatform = process.env.PDD_CDN_PLATFORM === 'douyin' ? 'douyin' : 'wechat';
const syncCommand = parseSyncCommand(process.argv.slice(2), cdnPlatform);
const dryRun = syncCommand.dryRun;
const wechatCdnTarget = syncCommand.wechatCdnTarget;
const levelExperimentTarget = syncCommand.levelExperimentTarget;
const platformLabel = levelExperimentTarget
    ? '微信 ' + levelExperimentTarget.experimentId + ' 实验桶'
    : (cdnPlatform === 'douyin' ? '抖音' : '微信');
const platformRemoteDir = cdnPlatform === 'douyin'
    ? 'remote_douyin'
    : (levelExperimentTarget ? 'remote_wechat_b' : wechatCdnTarget.remoteDir);
const levelDataSourceDir = levelExperimentTarget
    ? levelExperimentTarget.stableSourceDir
    : path.join(projectDir, 'assets', 'LevelData');
const levelDataSourceLabel = path.relative(projectDir, levelDataSourceDir).split(path.sep).join('/');
const levelDataManifestSourceLabel = levelExperimentTarget
    ? levelExperimentTarget.manifestSourceLabel
    : levelDataSourceLabel;
const defaultLevelDataDir = levelExperimentTarget
    ? levelExperimentTarget.outputDir
    : (cdnPlatform === 'douyin' ? 'build/level-data-cdn-douyin' : 'build/level-data-cdn');
const levelDataDir = path.resolve(projectDir, process.env.PDD_LEVEL_DATA_CDN_DIR || defaultLevelDataDir);
const packDir = path.join(levelDataDir, 'level_packs');
const liveManifestPath = path.join(levelDataDir, 'level_live.json');

const cdnUrl = levelExperimentTarget
    ? levelExperimentTarget.cdnBaseUrl
    : (cdnPlatform === 'wechat'
    ? wechatCdnTarget.levelDataCdnUrl
    : (process.env.PDD_LEVEL_DATA_CDN_URL || 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/' + platformRemoteDir + '/levels/'));
const ossutilBin = process.env.PDD_OSSUTIL_BIN || 'ossutil';
const ossEndpoint = process.env.PDD_OSS_ENDPOINT || 'https://oss-cn-beijing.aliyuncs.com';
const ossBucket = process.env.PDD_OSS_BUCKET || 'game-pdd-v2';
const ossPath = levelExperimentTarget
    ? levelExperimentTarget.ossPath
    : (cdnPlatform === 'wechat'
    ? wechatCdnTarget.levelDataOssPath
    : (process.env.PDD_LEVEL_DATA_OSS_PATH || 'syGame/pdd_v2/' + platformRemoteDir + '/levels/'));

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function parseSyncCommand(args, platform) {
    let remainingArgs = args.slice();
    let wechatCdnTarget = null;
    let levelExperimentTarget = null;
    if (platform === 'wechat') {
        try {
            const parsed = extractRequiredLevelDataCdnTarget(remainingArgs);
            remainingArgs = parsed.remainingArgs;
            if (parsed.target === 'EXP') {
                levelExperimentTarget = resolveLevelExperimentTarget(LY_0224_EXPERIMENT_ID);
            } else {
                wechatCdnTarget = configureWechatCdnEnvironment(resolveWechatCdnSlot(parsed.target), process.env);
            }
        } catch (error) {
            fail(error && error.message ? error.message : String(error));
        }
    }
    const dryRunArgs = remainingArgs.filter((arg) => arg === '--dry-run');
    const unknownArgs = remainingArgs.filter((arg) => arg !== '--dry-run');
    if (unknownArgs.length > 0) fail('未知参数: ' + unknownArgs.join(' '));
    if (dryRunArgs.length > 1) fail('只能传入一次 --dry-run');
    return {
        dryRun: dryRunArgs.length === 1,
        levelExperimentTarget,
        wechatCdnTarget,
    };
}

function extractRequiredLevelDataCdnTarget(args) {
    const remainingArgs = [];
    const values = [];
    for (let index = 0; index < args.length; index++) {
        const arg = String(args[index] || '');
        if (arg === '--cdn-slot') {
            if (index + 1 >= args.length || String(args[index + 1] || '').startsWith('--')) {
                throw new Error('缺少 --cdn-slot 的值；关卡数据同步必须显式传入 --cdn-slot=A、B 或 EXP');
            }
            values.push(args[index + 1]);
            index += 1;
            continue;
        }
        if (arg.startsWith('--cdn-slot=')) {
            values.push(arg.slice('--cdn-slot='.length));
            continue;
        }
        remainingArgs.push(args[index]);
    }
    if (values.length === 0) {
        throw new Error('必须显式传入 --cdn-slot=A、--cdn-slot=B 或 --cdn-slot=EXP');
    }
    if (values.length > 1) throw new Error('只能传入一个 --cdn-slot 参数');
    const target = String(values[0] || '').trim().toUpperCase();
    if (target !== 'A' && target !== 'B' && target !== 'EXP') {
        throw new Error('关卡数据 CDN 目标必须是 A、B 或 EXP: ' + String(values[0] || '<missing>'));
    }
    return {
        target,
        remainingArgs,
    };
}

function resolveLevelExperimentTarget(experimentId) {
    if (experimentId !== LY_0224_EXPERIMENT_ID) {
        fail('不支持的关卡实验: ' + String(experimentId || '<missing>'));
    }
    const overrideDir = path.join(projectDir, 'experiments', LY_0224_EXPERIMENT_ID, 'treatment');
    const configPath = path.join(overrideDir, 'config.json');
    const config = readJson(configPath);
    const expectedOverrideLevelIds = LY_0224_OVERRIDE_LEVEL_IDS.slice();
    const actualOverrideLevelIds = Array.isArray(config.overrideLevelIds)
        ? config.overrideLevelIds.map((value) => Math.floor(Number(value) || 0))
        : [];
    if (config.schemaVersion !== 1) fail('ly_0224 treatment config schemaVersion 必须是 1');
    if (config.experimentId !== LY_0224_EXPERIMENT_ID || config.bucket !== 'exp') {
        fail('ly_0224 treatment config 实验身份不正确');
    }
    if (config.levelPrefix !== 'level_') fail('ly_0224 treatment 只允许主线 level_ 数据');
    if (Number(config.runtimeMinimumLevelId) !== LY_0224_RUNTIME_MINIMUM_LEVEL_ID) {
        fail('ly_0224 treatment 运行时实验范围必须从第 2 关开始');
    }
    if (config.levelDataContract !== 'v2') fail('ly_0224 treatment 必须使用 v2 关卡协议');
    if (Number(config.packSize) !== 100) fail('ly_0224 treatment packSize 必须是 100');
    if (JSON.stringify(config.tutorialContracts) !== JSON.stringify(LY_0224_TUTORIAL_CONTRACTS)) {
        fail('ly_0224 treatment L2/L3 引导合同不正确');
    }
    if (config.stableSourceDir !== LY_0224_STABLE_SOURCE_DIR || config.sourceMode !== 'stable_full_plus_overrides') {
        fail('ly_0224 treatment 必须由完整稳定关卡真源叠加显式覆盖生成');
    }
    if (config.outputDir !== LY_0224_OUTPUT_DIR) fail('ly_0224 treatment 输出目录不正确');
    if (JSON.stringify(actualOverrideLevelIds) !== JSON.stringify(expectedOverrideLevelIds)) {
        fail('ly_0224 treatment 覆盖必须且只能包含第 2-9 关');
    }
    if (normalizeTrailingSlash(config.cdnBaseUrl) !== LY_0224_TREATMENT_CDN_URL) {
        fail('ly_0224 treatment CDN 地址不正确');
    }
    if (normalizeOssPath(config.ossPath) !== LY_0224_TREATMENT_OSS_PATH) {
        fail('ly_0224 treatment OSS 路径不正确');
    }
    if (process.env.PDD_LEVEL_DATA_CONTRACT && process.env.PDD_LEVEL_DATA_CONTRACT !== config.levelDataContract) {
        fail('PDD_LEVEL_DATA_CONTRACT 与 ly_0224 treatment 不一致');
    }
    const stableSourceDir = path.join(projectDir, config.stableSourceDir);
    const overrideSourceLabel = path.relative(projectDir, overrideDir).split(path.sep).join('/');
    assertDir(stableSourceDir, 'ly_0224 稳定关卡真源');
    assertDir(overrideDir, 'ly_0224 关卡覆盖目录');
    const overrideEntries = fs.readdirSync(overrideDir)
        .map(parseLevelDataSourceFile)
        .filter(Boolean)
        .sort((left, right) => left.levelId - right.levelId);
    const expectedOverrideKeys = expectedOverrideLevelIds.map((levelId) => config.levelPrefix + levelId);
    const actualOverrideKeys = overrideEntries.map((entry) => entry.key);
    if (JSON.stringify(actualOverrideKeys) !== JSON.stringify(expectedOverrideKeys)) {
        fail('ly_0224 treatment 覆盖文件必须且只能是 ' + expectedOverrideKeys.join(', '));
    }
    for (const entry of overrideEntries) {
        const overrideFile = path.join(overrideDir, entry.key + '.json');
        const stableFile = path.join(stableSourceDir, entry.key + '.json');
        const overrideData = readJson(overrideFile);
        if (Math.floor(Number(overrideData.levelId) || 0) !== entry.levelId) {
            fail('ly_0224 treatment 覆盖文件名与 levelId 不一致: ' + entry.key);
        }
        assertFile(stableFile, 'ly_0224 稳定关卡');
    }
    assertExperimentTutorialContracts(overrideDir, config.tutorialContracts);
    assertExperimentTutorialRuntimeSupport();
    return Object.freeze({
        experimentId: config.experimentId,
        bucket: config.bucket,
        levelPrefix: config.levelPrefix,
        runtimeMinimumLevelId: LY_0224_RUNTIME_MINIMUM_LEVEL_ID,
        overrideLevelIds: expectedOverrideLevelIds,
        tutorialContracts: config.tutorialContracts,
        packSize: Number(config.packSize),
        stableSourceDir,
        overrideDir,
        manifestSourceLabel: config.stableSourceDir + ' + ' + overrideSourceLabel,
        outputDir: LY_0224_OUTPUT_DIR,
        cdnBaseUrl: LY_0224_TREATMENT_CDN_URL,
        ossPath: LY_0224_TREATMENT_OSS_PATH,
    });
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

function assertExperimentTutorialContracts(sourceDir, contracts) {
    for (const rawLevelId of Object.keys(contracts || {})) {
        const levelId = Math.floor(Number(rawLevelId) || 0);
        const contract = contracts[rawLevelId];
        const levelData = readJson(path.join(sourceDir, 'level_' + levelId + '.json'));
        const guide = levelData && levelData.tutorialGuide;
        if (!guide || guide.mode !== contract.mode) {
            fail('ly_0224 EXP 第 ' + levelId + ' 关引导 mode 不匹配');
        }
        const guideCopies = Array.isArray(guide.guideCopies) ? guide.guideCopies : [];
        if (guideCopies.length !== contract.stepCount) {
            fail('ly_0224 EXP 第 ' + levelId + ' 关引导步骤数不匹配');
        }
        if (JSON.stringify(guideCopies) !== JSON.stringify(contract.guideCopies)) {
            fail('ly_0224 EXP 第 ' + levelId + ' 关引导文案/步骤不匹配');
        }
        for (const key of ['title', 'subtitle']) {
            if (Object.prototype.hasOwnProperty.call(contract, key) && guide[key] !== contract[key]) {
                fail('ly_0224 EXP 第 ' + levelId + ' 关引导 ' + key + ' 不匹配');
            }
        }
    }
}

function assertExperimentTutorialRuntimeSupport() {
    const sessionSource = fs.readFileSync(
        path.join(projectDir, 'assets', 'Scripts', 'Core', 'GameplaySessionController.ts'),
        'utf8',
    );
    const hudSource = fs.readFileSync(
        path.join(projectDir, 'assets', 'Scripts', 'Core', 'GameCtrlModules', 'SettlementHudModule.ts'),
        'utf8',
    );
    if (!sessionSource.includes("case 'slot_intro': return 'slot_intro';")) {
        fail('当前客户端不支持 EXP 第 2 关 slot_intro 引导');
    }
    if (!sessionSource.includes("case 'zoom': return 'zoom';")) {
        fail('当前客户端不支持 EXP 第 3 关 zoom 引导');
    }
    if (!hudSource.includes("(mode === 'zoom' || mode === 'slot_intro') ? 1 : 0")) {
        fail('当前客户端的 EXP 第 2/3 关引导步骤数不是 1');
    }
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
    if (levelExperimentTarget) {
        if (
            normalizedCdn !== levelExperimentTarget.cdnBaseUrl
            || normalizedOss !== levelExperimentTarget.ossPath
        ) {
            fail(
                levelExperimentTarget.experimentId
                + ' 实验关卡 CDN 目标不正确: '
                + normalizedCdn
                + ' / '
                + normalizedOss,
            );
        }
        return;
    }
    if (cdnPlatform === 'wechat') {
        if (
            normalizedCdn !== wechatCdnTarget.levelDataCdnUrl
            || normalizedOss !== wechatCdnTarget.levelDataOssPath
        ) {
            fail('微信关卡数据 CDN 与槽位 ' + wechatCdnTarget.slot + ' 不一致: ' + normalizedCdn + ' / ' + normalizedOss);
        }
        return;
    }
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
    assertDir(levelDataSourceDir, levelDataSourceLabel);
    return new Set(fs.readdirSync(levelDataSourceDir)
        .map(parseLevelDataSourceFile)
        .filter(Boolean)
        .map((entry) => entry.key));
}

function collectSourceLevelDataPrefixCounts() {
    assertDir(levelDataSourceDir, levelDataSourceLabel);
    return fs.readdirSync(levelDataSourceDir)
        .map(parseLevelDataSourceFile)
        .filter(Boolean)
        .reduce((counts, entry) => {
            counts[entry.prefix] = (counts[entry.prefix] || 0) + 1;
            return counts;
        }, {});
}

function runNode(script, args, label, env = process.env) {
    const result = spawnSync(process.execPath, [script].concat(args), {
        cwd: projectDir,
        env,
        stdio: 'inherit',
        shell: false,
    });
    if (result.error) fail('无法执行 node: ' + result.error.message);
    if (result.status !== 0) fail(label + '失败');
}

function resolveExpectedExperimentLevelFile(prefix, levelId) {
    const fileName = prefix + levelId + '.json';
    if (
        levelExperimentTarget
        && prefix === levelExperimentTarget.levelPrefix
        && levelExperimentTarget.overrideLevelIds.includes(levelId)
    ) {
        return path.join(levelExperimentTarget.overrideDir, fileName);
    }
    return path.join(levelDataSourceDir, fileName);
}

function validateLevelDataPackage() {
    assertDir(levelDataDir, '关卡数据 CDN 目录');
    assertDir(packDir, '关卡数据 pack 目录');
    assertFile(liveManifestPath, 'level_live.json');
    const manifest = readJson(liveManifestPath);
    if (manifest.manifestVersion !== 1 || manifest.schemaVersion !== LEVEL_DATA_SCHEMA_VERSION) fail('level_live.json schema 不正确');
    if (levelExperimentTarget && manifest.cdnSlot != null) {
        fail('实验关卡 level_live.json 不能绑定稳定 A/B 槽位');
    }
    if (!levelExperimentTarget && cdnPlatform === 'wechat' && manifest.cdnSlot !== wechatCdnTarget.slot) {
        fail('level_live.json cdnSlot 不正确: ' + String(manifest.cdnSlot || '<missing>') + ' != ' + wechatCdnTarget.slot);
    }
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
            if (levelExperimentTarget) {
                const expectedData = readJson(resolveExpectedExperimentLevelFile(entryPrefix, levelId));
                if (JSON.stringify(entry.data) !== JSON.stringify(expectedData)) {
                    fail('实验关卡组合数据与真源不一致: ' + key);
                }
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
    if (levelCount !== sourceKeys.size) fail('关卡数据数量异常: ' + levelCount + ' != ' + levelDataSourceLabel + ' ' + sourceKeys.size);
    for (const prefix of ['level_', 'zt_level_']) {
        const sourceCount = sourcePrefixCounts[prefix] || 0;
        if ((manifestPrefixCounts[prefix] || 0) !== sourceCount) {
            fail('level_live.json levelCounts.' + prefix + ' 不一致: ' + (manifestPrefixCounts[prefix] || 0) + ' != ' + sourceCount);
        }
        if ((cdnPrefixCounts[prefix] || 0) !== sourceCount) {
            fail('关卡数据 CDN ' + prefix + ' 数量异常: ' + (cdnPrefixCounts[prefix] || 0) + ' != ' + levelDataSourceLabel + ' ' + sourceCount);
        }
    }
    for (const key of sourceKeys) {
        if (!cdnKeys.has(key)) fail('关卡数据 CDN 缺少真源关卡: ' + key);
    }
    for (const key of cdnKeys) {
        if (!sourceKeys.has(key)) fail('关卡数据 CDN 包含未知关卡: ' + key);
    }
    if (levelExperimentTarget) {
        assertLevelExperimentManifest(manifest, '本地 level_live.json');
        assertExperimentTutorialContracts(
            levelExperimentTarget.overrideDir,
            levelExperimentTarget.tutorialContracts,
        );
    }
    return { manifest, levelCount };
}

function assertLevelExperimentManifest(manifest, label) {
    const expectedKeys = collectSourceLevelDataKeys();
    const expectedPrefixCounts = collectSourceLevelDataPrefixCounts();
    const actualKeys = [];
    for (const pack of manifest.packs || []) {
        for (const key of pack.levelKeys || []) actualKeys.push(String(key));
    }
    const actualKeySet = new Set(actualKeys);
    if (actualKeySet.size !== actualKeys.length) {
        fail(label + ' 包含重复关卡 key');
    }
    if (actualKeySet.size !== expectedKeys.size) {
        fail(label + ' 必须镜像完整稳定关卡集合，共 ' + expectedKeys.size + ' 关');
    }
    for (const key of expectedKeys) {
        if (!actualKeySet.has(key)) fail(label + ' 缺少稳定关卡 key: ' + key);
    }
    for (const key of actualKeySet) {
        if (!expectedKeys.has(key)) fail(label + ' 包含稳定真源之外的 key: ' + key);
    }
    if (manifest.levelCount !== expectedKeys.size) {
        fail(label + ' 关卡数量必须是 ' + expectedKeys.size);
    }
    for (const prefix of ['level_', 'zt_level_']) {
        if ((manifest.levelCounts?.[prefix] || 0) !== (expectedPrefixCounts[prefix] || 0)) {
            fail(label + ' levelCounts.' + prefix + ' 必须与稳定 A/B 一致');
        }
    }
    if (manifest.packSize !== levelExperimentTarget.packSize) {
        fail(label + ' packSize 不正确: ' + String(manifest.packSize));
    }
    if (manifest.source !== levelDataManifestSourceLabel) {
        fail(label + ' source 不正确: ' + String(manifest.source || '<missing>') + ' != ' + levelDataManifestSourceLabel);
    }
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
    if (levelExperimentTarget && remoteManifest.cdnSlot != null) {
        fail('远端实验 level_live.json 不能绑定稳定 A/B 槽位');
    }
    if (!levelExperimentTarget && cdnPlatform === 'wechat' && remoteManifest.cdnSlot !== wechatCdnTarget.slot) {
        fail('远端 level_live.json cdnSlot 异常: ' + String(remoteManifest.cdnSlot || '<missing>') + ' != ' + wechatCdnTarget.slot);
    }
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
    if (levelExperimentTarget) {
        assertLevelExperimentManifest(remoteManifest, '远端 level_live.json');
        const localPackHashes = new Map(localManifest.packs.map((pack) => [pack.id, pack.hash]));
        for (const remotePack of remoteManifest.packs) {
            if (localPackHashes.get(remotePack.id) !== remotePack.hash) {
                fail('远端实验 pack hash 未同步: ' + String(remotePack.id || '<missing>'));
            }
        }
    } else if (!remoteManifest.packs.some((pack) => String(pack && pack.prefix || 'level_') === 'zt_level_')) {
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
if (wechatCdnTarget) console.log('CDN 槽位: ' + wechatCdnTarget.slot);
if (levelExperimentTarget) {
    console.log('实验: ' + levelExperimentTarget.experimentId);
    console.log('实验桶: ' + levelExperimentTarget.bucket);
    console.log('固定 CDN 数据集: 完整镜像稳定 A/B 的全部关卡 key');
    console.log('运行时实验范围: 主线第 ' + levelExperimentTarget.runtimeMinimumLevelId + ' 关起');
    console.log('实验覆盖关卡: ' + levelExperimentTarget.overrideLevelIds.join(', '));
}
console.log('关卡数据协议: ' + LEVEL_DATA_CONTRACT + ' (schemaVersion=' + LEVEL_DATA_SCHEMA_VERSION + ', minClientBuild=' + LEVEL_DATA_CLIENT_BUILD + ')');
console.log('');

assertLevelDataTarget(cdnUrl, ossPath);
const generatorArgs = [
    levelDataDir,
    '--source',
    levelDataSourceDir,
];
const generatorEnv = { ...process.env };
if (levelExperimentTarget) {
    generatorArgs.push('--overlay-source', levelExperimentTarget.overrideDir);
    generatorEnv.PDD_WECHAT_CDN_SLOT = '';
    generatorEnv.PDD_LEVEL_PACK_SIZE = String(levelExperimentTarget.packSize);
}
runNode(
    'scripts/write-level-data-cdn.js',
    generatorArgs,
    '生成' + platformLabel + '关卡 CDN 数据',
    generatorEnv,
);
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
