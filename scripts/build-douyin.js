#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const buildCommon = require('./minigame-build-common.js');

const projectDir = path.resolve(__dirname, '..');
const buildDir = path.join(projectDir, 'build', 'bytedance-mini-game');
const levelDataCdnDir = path.join(projectDir, 'build', 'level-data-cdn-douyin');
const buildConfigPath = path.join(projectDir, 'temp', 'douyin-build-config.json');
const startSceneUrl = 'db://assets/Scenes/Boot.scene';
const buildMode = buildCommon.parseBuildMode(process.argv.slice(2), 'node scripts/build-douyin.js <--release|--debug>');
const douyinAppId = process.env.DOUYIN_APPID || 'ttf45082ed6a36c15802';
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

function findSubpackageRoots(runtimeRoot) {
    const gameJsonPath = path.join(runtimeRoot, 'game.json');
    const gameJson = fs.existsSync(gameJsonPath) ? buildCommon.readJson(gameJsonPath) : {};
    return (Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [])
        .map((item) => String(item && item.root || '').replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .map((root) => path.join(runtimeRoot, root));
}

function ensureCocosOutputReady() {
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

logStep('0.15 生成远程关卡数据包...');
runNode('scripts/write-level-data-cdn.js', [levelDataCdnDir]);
logInfo('关卡数据 CDN 产物已生成: ' + levelDataCdnDir);

logStep('0.2 准备 BootstrapBundle 首关快照...');
runNode('scripts/prepare-bootstrap.js');
logInfo('BootstrapBundle 源目录已准备');

const startSceneUuid = buildCommon.readAssetUuid(projectDir, startSceneUrl, '启动场景');
runNode('scripts/write-douyin-build-config.js', [buildConfigPath, startSceneUrl, startSceneUuid, '--' + buildMode]);
logInfo('抖音构建配置已生成: ' + buildConfigPath);

logStep('1. Cocos Creator 构建 bytedance-mini-game...');
const buildResult = buildCommon.spawnCocosBuild(projectDir, buildConfigPath);
buildCommon.repairCocosMetaFiles(projectDir);
ensureCocosOutputReady();
if (buildResult.status !== 0 || buildResult.signal) {
    logInfo('Cocos 构建进程返回非零状态，但产物已生成，继续后处理: status=' + buildResult.status + ' signal=' + (buildResult.signal || ''));
}
logInfo('Cocos 构建完成');

logStep('2. 运行抖音构建后处理...');
runNode('scripts/postbuild-douyin.js', [buildDir]);

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
console.log('   - 抖音主包:          ' + buildCommon.formatMB(mainBytes) + ' (' + mainKB + 'KB)');
console.log('   - 抖音总包:          ' + buildCommon.formatMB(totalBytes) + ' (' + totalKB + 'KB)');
console.log('');
console.log('=== 抖音打包完成 ===');
console.log('本地包：' + buildDir);
console.log('关卡数据包：' + levelDataCdnDir);
