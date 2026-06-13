#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const buildCommon = require('./minigame-build-common.js');

const projectDir = path.resolve(__dirname, '..');
const buildDir = path.join(projectDir, 'build', 'bytedance-mini-game');
const levelDataCdnDir = path.join(projectDir, 'build', 'level-data-cdn-douyin');
const gameAssetsRoot = path.join(projectDir, 'assets', 'GameAssetsBundle');
const homeAssetsRoot = path.join(projectDir, 'assets', 'HomeAssetsBundle');
const levelDataRoot = path.join(projectDir, 'assets', 'LevelData');
const buildConfigPath = path.join(projectDir, 'temp', 'douyin-build-config.json');
const startSceneUrl = 'db://assets/Scenes/Boot.scene';
const buildMode = buildCommon.parseBuildMode(process.argv.slice(2), 'node scripts/build-douyin.js <--release|--debug>');
const douyinAppId = process.env.DOUYIN_APPID || 'ttf45082ed6a36c15802';
const mainPackageErrorKB = 4096;
const totalPackageErrorKB = 20480;
const douyinLevelDataCdnUrl = process.env.PDD_LEVEL_DATA_CDN_URL || 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_douyin/levels/';

process.env.DOUYIN_BUILD_MODE = buildMode;
process.env.DOUYIN_APPID = douyinAppId;
process.env.PDD_LEVEL_DATA_CDN_URL = douyinLevelDataCdnUrl;

function logStep(message) {
    console.log('');
    console.log(message);
}

function logInfo(message) {
    console.log('   ' + message);
}

function fail(message) {
    buildCommon.fail(message);
}

function runNode(script, args = []) {
    buildCommon.runNode(projectDir, script, args);
}

function assertFile(filePath, label) {
    if (!fs.existsSync(filePath)) fail(label + ' 不存在: ' + path.relative(projectDir, filePath));
}

function walkFiles(dir) {
    return buildCommon.walkFiles(dir);
}

function validateGameAssetsBundle() {
    for (const filePath of [
        path.join(gameAssetsRoot, 'themes.json'),
        path.join(gameAssetsRoot, 'Audio', 'bgm.mp3'),
    ]) {
        assertFile(filePath, 'GameAssetsBundle 关键资源');
    }
    if (fs.existsSync(path.join(gameAssetsRoot, 'LevelData')) || fs.existsSync(path.join(gameAssetsRoot, 'LevelData.meta'))) {
        fail('GameAssetsBundle 不应包含 LevelData；关卡源码应放在 assets/LevelData');
    }
    logInfo('GameAssetsBundle 稳定业务资源校验通过');
}

function validateHomeAssetsBundle() {
    for (const filePath of [
        path.join(homeAssetsRoot, 'Scenes', 'Home.scene'),
        path.join(homeAssetsRoot, 'GameUI', 'home_bg.jpeg'),
        path.join(homeAssetsRoot, 'GameUI', '主页标题.png'),
        path.join(homeAssetsRoot, 'GameUI', '预览框.png'),
    ]) {
        assertFile(filePath, 'HomeAssetsBundle 首屏资源');
        if (!fs.existsSync(filePath + '.meta')) fail('HomeAssetsBundle 首屏资源缺少 meta: ' + path.relative(projectDir, filePath));
    }
    logInfo('HomeAssetsBundle 首屏资源校验通过');
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

function collectSourceLevelDataEntries() {
    if (!fs.existsSync(levelDataRoot)) fail('assets/LevelData 目录不存在');
    return fs.readdirSync(levelDataRoot)
        .map(parseLevelDataSourceFile)
        .filter(Boolean)
        .sort((a, b) => a.prefix.localeCompare(b.prefix) || a.levelId - b.levelId);
}

function countLevelDataPrefixes(entries) {
    return entries.reduce((counts, entry) => {
        counts[entry.prefix] = (counts[entry.prefix] || 0) + 1;
        return counts;
    }, {});
}

function validateLevelDataSource() {
    const levels = collectSourceLevelDataEntries();
    const mainlineCount = levels.filter((entry) => entry.prefix === 'level_').length;
    const themeCount = levels.filter((entry) => entry.prefix === 'zt_level_').length;
    if (mainlineCount < 300) fail('assets/LevelData 主线关卡数量异常: ' + mainlineCount);
    if (themeCount < 1) fail('assets/LevelData 缺少主题关卡 zt_level_*.json');
    const keys = new Set();
    for (const level of levels) {
        if (keys.has(level.key)) fail('assets/LevelData 存在重复关卡 key: ' + level.key);
        keys.add(level.key);
    }
    for (const filePath of walkFiles(levelDataRoot).filter((item) => item.endsWith('.json'))) {
        JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!fs.existsSync(filePath + '.meta')) fail('assets/LevelData 缺少 meta: ' + path.basename(filePath));
    }
    logInfo('assets/LevelData 真源校验通过，mainline=' + mainlineCount + ', theme=' + themeCount);
}

function validateLevelDataCdn() {
    const livePath = path.join(levelDataCdnDir, 'level_live.json');
    if (!fs.existsSync(livePath)) fail('抖音关卡数据 CDN 缺少 level_live.json');
    const manifest = buildCommon.readJson(livePath);
    if (manifest.manifestVersion !== 1 || manifest.schemaVersion !== 1) fail('抖音 level_live.json schema 不正确');
    if (!Array.isArray(manifest.packs) || manifest.packs.length < 1) fail('抖音 level_live.json 缺少 packs');
    const sourceEntries = collectSourceLevelDataEntries();
    const sourceKeys = new Set(sourceEntries.map((entry) => entry.key));
    const sourcePrefixCounts = countLevelDataPrefixes(sourceEntries);
    const manifestPrefixCounts = manifest.levelCounts || {};
    const cdnKeys = new Set();
    const cdnPrefixCounts = {};
    let levelCount = 0;
    for (const pack of manifest.packs) {
        if (!pack || typeof pack.url !== 'string' || !pack.url.startsWith('level_packs/')) fail('抖音 level_live.json pack.url 不正确');
        const packPrefix = String(pack.prefix || 'level_');
        if (packPrefix !== 'level_' && packPrefix !== 'zt_level_') fail('抖音 level_live.json pack.prefix 不正确: ' + pack.url);
        const packPath = path.join(levelDataCdnDir, pack.url);
        if (!fs.existsSync(packPath)) fail('抖音关卡数据 CDN 缺少 pack: ' + pack.url);
        const packJson = buildCommon.readJson(packPath);
        if (packJson.id !== pack.id) fail('抖音关卡数据 pack id 不一致: ' + pack.url);
        if (String(packJson.prefix || packPrefix) !== packPrefix) fail('抖音关卡数据 pack prefix 不一致: ' + pack.url);
        if (!Array.isArray(packJson.levels) || packJson.levels.length !== pack.levelCount) fail('抖音关卡数据 pack levelCount 不一致: ' + pack.url);
        const packPayloadKeys = [];
        for (const entry of packJson.levels) {
            const levelId = Math.max(1, Math.floor(Number(entry && entry.levelId) || 1));
            const entryPrefix = String((entry && entry.prefix) || packJson.prefix || packPrefix);
            const key = entryPrefix + levelId;
            if (entryPrefix !== packPrefix) fail('抖音关卡数据 pack entry prefix 不一致: ' + pack.url + ' ' + key);
            if (cdnKeys.has(key)) fail('抖音关卡数据 CDN 重复关卡 key: ' + key);
            cdnKeys.add(key);
            packPayloadKeys.push(key);
            cdnPrefixCounts[entryPrefix] = (cdnPrefixCounts[entryPrefix] || 0) + 1;
        }
        if (Array.isArray(pack.levelKeys)) {
            const manifestKeys = pack.levelKeys.slice().sort();
            const payloadKeys = packPayloadKeys.slice().sort();
            if (manifestKeys.length !== payloadKeys.length || manifestKeys.some((key, index) => key !== payloadKeys[index])) {
                fail('抖音 level_live.json pack.levelKeys 与 pack 内容不一致: ' + pack.url);
            }
        }
        levelCount += packJson.levels.length;
    }
    if (levelCount !== manifest.levelCount) fail('抖音 level_live.json levelCount 不一致: ' + levelCount + ' != ' + manifest.levelCount);
    if (levelCount !== sourceKeys.size) fail('抖音关卡数据 CDN 关卡数量异常: ' + levelCount + ' != assets/LevelData ' + sourceKeys.size);
    for (const prefix of ['level_', 'zt_level_']) {
        const sourceCount = sourcePrefixCounts[prefix] || 0;
        if ((manifestPrefixCounts[prefix] || 0) !== sourceCount) {
            fail('抖音 level_live.json levelCounts.' + prefix + ' 不一致: ' + (manifestPrefixCounts[prefix] || 0) + ' != ' + sourceCount);
        }
        if ((cdnPrefixCounts[prefix] || 0) !== sourceCount) {
            fail('抖音关卡数据 CDN ' + prefix + ' 数量异常: ' + (cdnPrefixCounts[prefix] || 0) + ' != assets/LevelData ' + sourceCount);
        }
    }
    for (const key of sourceKeys) {
        if (!cdnKeys.has(key)) fail('抖音关卡数据 CDN 缺少真源关卡: ' + key);
    }
    for (const key of cdnKeys) {
        if (!sourceKeys.has(key)) fail('抖音关卡数据 CDN 包含未知关卡: ' + key);
    }
    logInfo('抖音关卡数据 CDN 校验通过，packs=' + manifest.packs.length + ' levels=' + levelCount + ' version=' + manifest.dataVersion);
}

function findSubpackageRoots(runtimeRoot) {
    const gameJsonPath = path.join(runtimeRoot, 'game.json');
    const gameJson = fs.existsSync(gameJsonPath) ? buildCommon.readJson(gameJsonPath) : {};
    return (Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [])
        .map((item) => String(item && item.root || '').replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .map((root) => path.join(runtimeRoot, root));
}

function assertCocosOutputReady() {
    const runtimeRoot = buildCommon.resolveRuntimeRoot(buildDir);
    if (!buildCommon.findSettingsPath(runtimeRoot)) {
        fail('Cocos 构建失败，未生成 settings.json/settings.<hash>.json');
    }
}

console.log('=== 抖音小游戏打包 ===');
logInfo('Mode: ' + buildMode);
logInfo('AppID: ' + douyinAppId);
logInfo('LevelData CDN: ' + douyinLevelDataCdnUrl);

logStep('0. 清理旧产物...');
buildCommon.rm(buildDir);
buildCommon.rm(levelDataCdnDir);
logInfo('build/bytedance-mini-game 与 build/level-data-cdn-douyin 已清理');
buildCommon.cleanCocosGeneratedCaches(projectDir, 'DOUYIN_CLEAN_COCOS_CACHE', logInfo);
buildCommon.repairCocosMetaFiles(projectDir);

logStep('0.1 校验资源真源...');
validateGameAssetsBundle();
validateHomeAssetsBundle();
validateLevelDataSource();

logStep('0.15 生成远程关卡数据包...');
runNode('scripts/write-level-data-cdn.js', [levelDataCdnDir]);
logInfo('关卡数据 CDN 产物已生成: ' + levelDataCdnDir);
validateLevelDataCdn();

logStep('0.2 准备 BootstrapBundle 首关快照...');
runNode('scripts/prepare-bootstrap.js');
logInfo('BootstrapBundle 源目录已通过首关快照与首屏豆豆图集校验');

const startSceneUuid = buildCommon.readAssetUuid(projectDir, startSceneUrl, '启动场景');
runNode('scripts/write-douyin-build-config.js', [buildConfigPath, startSceneUrl, startSceneUuid, '--' + buildMode]);
logInfo('抖音构建配置已生成: ' + buildConfigPath);

logStep('1. Cocos Creator 构建 bytedance-mini-game...');
const buildResult = buildCommon.spawnCocosBuild(projectDir, buildConfigPath);
buildCommon.repairCocosMetaFiles(projectDir);
assertCocosOutputReady();
if (buildResult.status !== 0 || buildResult.signal) {
    logInfo('Cocos 构建进程返回非零状态，但产物已生成，继续后处理: status=' + buildResult.status + ' signal=' + (buildResult.signal || ''));
}
logInfo('Cocos 构建完成');

logStep('2. 运行抖音构建后处理...');
runNode('scripts/postbuild-douyin.js', [buildDir]);

logStep('2.1 校验抖音包与远程包...');
runNode('scripts/verify-douyin-build.js', [buildDir, levelDataCdnDir]);

const runtimeRoot = buildCommon.resolveRuntimeRoot(buildDir);
const subpackageRoots = findSubpackageRoots(runtimeRoot);
const mainBytes = buildCommon.dirSize(runtimeRoot, subpackageRoots);
const totalBytes = buildCommon.dirSize(runtimeRoot);
const mainKB = Math.round(mainBytes / 1024);
const totalKB = Math.round(totalBytes / 1024);

logStep('3. 输出体积...');
console.log('   - 本地包项目:        ' + buildDir);
console.log('   - 运行时根目录:      ' + runtimeRoot);
console.log('   - 关卡数据 CDN:      ' + levelDataCdnDir);
console.log('   - 抖音主包:          ' + buildCommon.formatMB(mainBytes) + ' (' + mainKB + 'KB / ' + mainPackageErrorKB + 'KB 硬限制)');
console.log('   - 抖音总包:          ' + buildCommon.formatMB(totalBytes) + ' (' + totalKB + 'KB / ' + totalPackageErrorKB + 'KB 硬限制)');
if (mainKB > mainPackageErrorKB) fail('抖音主包超过 4MB 硬限制: ' + mainKB + 'KB');
if (totalKB > totalPackageErrorKB) fail('抖音总包超过 20MB 硬限制: ' + totalKB + 'KB');

console.log('');
console.log('=== 抖音打包完成 ===');
console.log('本地包：' + buildDir);
console.log('关卡数据包：' + levelDataCdnDir);
