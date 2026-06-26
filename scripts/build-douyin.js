#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const buildCommon = require('./minigame-build-common.js');
const platformConfig = require('./minigame-platform-config.js');

const projectDir = path.resolve(__dirname, '..');
const buildDir = path.join(projectDir, 'build', 'bytedance-mini-game');
const levelDataCdnDir = path.join(projectDir, 'build', 'level-data-cdn-douyin');
const skinDataCdnDir = path.join(projectDir, 'build', 'skin-cdn-douyin');
const buildConfigPath = path.join(projectDir, 'temp', 'douyin-build-config.json');
const startSceneUrl = 'db://assets/Scenes/Boot.scene';
const buildMode = buildCommon.parseBuildMode(process.argv.slice(2), 'node scripts/build-douyin.js <--release|--debug>');
const douyinAppId = process.env.DOUYIN_APPID || platformConfig.douyin.appId;
const douyinLevelDataCdnUrl = process.env.PDD_LEVEL_DATA_CDN_URL || 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_douyin/levels/';
const mainPackageTargetKB = 4096;
const startupDownloadTargetKB = 4096;
const mainPackageLimitBytes = mainPackageTargetKB * 1024;

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

function normalizeSubpackageRoot(root) {
    return String(root || '').replace(/^\/+|\/+$/g, '');
}

function findSubpackageRoot(gameJson, bundleName) {
    const subpackages = Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [];
    for (const item of subpackages) {
        const root = normalizeSubpackageRoot(item && item.root);
        if ((item && item.name === bundleName) || root === bundleName || root === 'subpackages/' + bundleName) {
            return root || 'subpackages/' + bundleName;
        }
    }
    return '';
}

function findSubpackageRoots(runtimeRoot) {
    const gameJsonPath = path.join(runtimeRoot, 'game.json');
    const gameJson = fs.existsSync(gameJsonPath) ? buildCommon.readJson(gameJsonPath) : {};
    return (Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [])
        .map((item) => normalizeSubpackageRoot(item && item.root))
        .filter(Boolean)
        .map((root) => path.join(runtimeRoot, root));
}

function resolveBundleDir(runtimeRoot, bundleName, gameJson) {
    const localDir = path.join(runtimeRoot, 'assets', bundleName);
    if (fs.existsSync(localDir)) return localDir;
    const subpackageRoot = findSubpackageRoot(gameJson || {}, bundleName);
    if (subpackageRoot) return path.join(runtimeRoot, subpackageRoot);
    return path.join(runtimeRoot, 'subpackages', bundleName);
}

function getPreloadBundleName(item) {
    return typeof item === 'string' ? item : item && item.bundle;
}

function getPreloadBundleNames(assets) {
    return Array.isArray(assets.preloadBundles)
        ? assets.preloadBundles.map(getPreloadBundleName).filter(Boolean)
        : [];
}

function computeStartupDownloadBytes(runtimeRoot, gameJson, assets, rootPackageBytes) {
    let total = rootPackageBytes;
    const included = [];
    const seenSubpackageRoots = new Set();
    for (const bundleName of getPreloadBundleNames(assets)) {
        const subpackageRoot = findSubpackageRoot(gameJson, bundleName);
        if (!subpackageRoot || seenSubpackageRoots.has(subpackageRoot)) continue;
        const dir = path.join(runtimeRoot, subpackageRoot);
        const bytes = buildCommon.dirSize(dir);
        seenSubpackageRoots.add(subpackageRoot);
        included.push({ bundleName, root: subpackageRoot, bytes });
        total += bytes;
    }
    return { total, included };
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
buildCommon.rm(skinDataCdnDir);
logInfo('build/bytedance-mini-game、build/level-data-cdn-douyin 与 build/skin-cdn-douyin 已清理');
buildCommon.cleanCocosGeneratedCaches(projectDir, 'DOUYIN_CLEAN_COCOS_CACHE', logInfo);
buildCommon.repairCocosMetaFiles(projectDir);

logStep('0.15 生成远程关卡数据包...');
runNode('scripts/write-level-data-cdn.js', [levelDataCdnDir]);
logInfo('关卡数据 CDN 产物已生成: ' + levelDataCdnDir);

logStep('0.16 生成远程皮肤数据包...');
runNode('scripts/write-skin-data-cdn.js', [skinDataCdnDir]);
logInfo('皮肤数据 CDN 产物已生成: ' + skinDataCdnDir);

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
const gameJson = buildCommon.readJson(path.join(runtimeRoot, 'game.json'));
const settings = buildCommon.readJson(buildCommon.findSettingsPath(runtimeRoot));
const runtimeInfo = {
    mainDir: resolveBundleDir(runtimeRoot, 'main', gameJson),
    bootstrapDir: resolveBundleDir(runtimeRoot, 'bootstrap', gameJson),
    homeAssetsDir: resolveBundleDir(runtimeRoot, 'homeAssets', gameJson),
    gameAssetsDir: resolveBundleDir(runtimeRoot, 'gameAssets', gameJson),
};
const subpackageRoots = findSubpackageRoots(runtimeRoot);
const mainBytes = buildCommon.dirSize(runtimeRoot, subpackageRoots);
const runtimeBytes = buildCommon.dirSize(runtimeRoot);
const mainKB = Math.round(mainBytes / 1024);
const startupDownload = computeStartupDownloadBytes(runtimeRoot, gameJson, settings.assets || {}, mainBytes);
const startupDownloadKB = Math.round(startupDownload.total / 1024);

logStep('3. 输出体积...');
console.log('   - 本地包项目:        ' + buildDir);
console.log('   - 运行时根目录:      ' + runtimeRoot);
console.log('   - 关卡数据 CDN:      ' + levelDataCdnDir);
console.log('   - 皮肤数据 CDN:      ' + skinDataCdnDir);
console.log('   - gameEntry/bootstrap: ' + buildCommon.formatMB(buildCommon.dirSize(runtimeInfo.bootstrapDir)));
console.log('   - homeAssets 分包:       ' + buildCommon.formatMB(buildCommon.dirSize(runtimeInfo.homeAssetsDir)));
console.log('   - gameAssets 分包:       ' + buildCommon.formatMB(buildCommon.dirSize(runtimeInfo.gameAssetsDir)));
console.log('   - 关卡数据包:        ' + buildCommon.formatMB(buildCommon.dirSize(levelDataCdnDir)));
console.log('   - 皮肤数据包:        ' + buildCommon.formatMB(buildCommon.dirSize(skinDataCdnDir)));
console.log('');
console.log('4. 抖音上传主包: ' + buildCommon.formatMB(mainBytes) + ' (' + mainKB + 'KB / ' + mainPackageTargetKB + 'KB 目标, 排除 game.json.subpackages)');
console.log('   启动下载量: ' + buildCommon.formatMB(startupDownload.total) + ' (' + startupDownloadKB + 'KB / ' + startupDownloadTargetKB + 'KB 参考, 硬主包 + preloadBundles)');
for (const item of startupDownload.included) {
    console.log('     + preload ' + item.bundleName + ' (' + item.root + '): ' + buildCommon.formatMB(item.bytes));
}
console.log('   bytedance-mini-game 实际目录: ' + buildCommon.formatMB(runtimeBytes));
if (mainBytes > mainPackageLimitBytes) {
    fail('抖音主包超过 4MB: ' + buildCommon.formatMB(mainBytes));
}
console.log('');
console.log('=== 抖音打包完成 ===');
console.log('本地包：' + buildDir);
console.log('关卡数据包：' + levelDataCdnDir);
console.log('皮肤数据包：' + skinDataCdnDir);
console.log('如需上传全部 CDN 数据，再执行：npm run sync:cdn:douyin');
console.log('如需只上传关卡数据，再执行：npm run sync:cdn:douyin:level_data');
console.log('如需只上传皮肤数据，再执行：npm run sync:cdn:douyin:skin_data');
