#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const buildCommon = require('./minigame-build-common.js');

const projectDir = path.resolve(__dirname, '..');
const buildDir = path.join(projectDir, 'build', 'wechatgame');
const levelDataCdnDir = path.join(projectDir, 'build', 'level-data-cdn');
const buildConfigPath = path.join(projectDir, 'temp', 'wechat-build-config.json');
const startSceneUrl = 'db://assets/Scenes/Boot.scene';
const buildMode = parseBuildMode(process.argv.slice(2));
const mainPackageTargetKB = 3072;
const startupDownloadTargetKB = 3072;
const wechatAppId = process.env.WECHAT_APPID || 'wxbb6160c828f380ca';
const openDevtools = process.env.WECHAT_OPEN_DEVTOOLS || '1';
process.env.WECHAT_BUILD_MODE = buildMode;
process.env.WECHAT_GAME_ASSETS_MODE = 'subpackage';
process.env.WECHAT_APPID = wechatAppId;
process.env.WECHAT_OPEN_DEVTOOLS = openDevtools;

function logStep(message) {
    console.log('');
    console.log(message);
}
function logInfo(message) {
    console.log('   ' + message);
}

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function parseBuildMode(args) {
    return buildCommon.parseBuildMode(args, 'node scripts/build-wechat.js <--release|--debug>');
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function rm(target) {
    fs.rmSync(target, { recursive: true, force: true });
}

function cleanCocosGeneratedCaches() {
    buildCommon.cleanCocosGeneratedCaches(projectDir, 'WECHAT_CLEAN_COCOS_CACHE', logInfo);
}

function walkFiles(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walkFiles(full, out);
        else out.push(full);
    }
    return out;
}

function dirSize(dir, excludeRoot) {
    if (!fs.existsSync(dir)) return 0;
    const excludedRoots = (Array.isArray(excludeRoot) ? excludeRoot : (excludeRoot ? [excludeRoot] : []))
        .map((entry) => path.resolve(entry));
    let size = 0;
    for (const filePath of walkFiles(dir)) {
        const abs = path.resolve(filePath);
        if (excludedRoots.some((excluded) => abs === excluded || abs.startsWith(excluded + path.sep))) continue;
        size += fs.statSync(filePath).size;
    }
    return size;
}

function formatMB(bytes) {
    return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

function runNode(script, args = []) {
    const result = spawnSync(process.execPath, [path.join(projectDir, script), ...args], {
        cwd: projectDir,
        env: process.env,
        stdio: 'inherit',
        shell: false,
    });
    if (result.error) fail(result.error.message);
    if (result.status !== 0) process.exit(result.status || 1);
}

function repairCocosMetaFiles() {
    buildCommon.repairCocosMetaFiles(projectDir);
}

function getStartSceneUuid() {
    return buildCommon.readAssetUuid(projectDir, startSceneUrl, '启动场景');
}

function findSettingsPath(runtimeDir) {
    const srcDir = path.join(runtimeDir, 'src');
    if (!fs.existsSync(srcDir)) return '';
    const exact = path.join(srcDir, 'settings.json');
    if (fs.existsSync(exact)) return exact;
    const matches = fs.readdirSync(srcDir)
        .filter((name) => /^settings(?:\.[0-9a-f]+)?\.json$/i.test(name))
        .sort();
    return matches.length === 1 ? path.join(srcDir, matches[0]) : '';
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

function resolveBundleDir(runtimeDir, bundleName, gameJson) {
    const localDir = path.join(runtimeDir, 'assets', bundleName);
    if (fs.existsSync(localDir)) return localDir;
    const subpackageRoot = findSubpackageRoot(gameJson || {}, bundleName);
    if (subpackageRoot) return path.join(runtimeDir, subpackageRoot);
    return path.join(runtimeDir, 'subpackages', bundleName);
}

function resolveRuntimeDir() {
    for (const runtime of [path.join(buildDir, 'minigame'), buildDir]) {
        if (findSettingsPath(runtime)) return runtime;
    }
    fail('构建后未生成 settings.json/settings.<hash>.json');
}

function getPreloadBundleName(item) {
    return typeof item === 'string' ? item : item && item.bundle;
}

function getPreloadBundleNames(assets) {
    return Array.isArray(assets.preloadBundles)
        ? assets.preloadBundles.map(getPreloadBundleName).filter(Boolean)
        : [];
}

function computeStartupDownloadBytes(runtimeDir, gameJson, assets, rootPackageBytes) {
    let total = rootPackageBytes;
    const included = [];
    const seenSubpackageRoots = new Set();
    for (const bundleName of getPreloadBundleNames(assets)) {
        const subpackageRoot = findSubpackageRoot(gameJson, bundleName);
        if (!subpackageRoot || seenSubpackageRoots.has(subpackageRoot)) continue;
        const dir = path.join(runtimeDir, subpackageRoot);
        const bytes = dirSize(dir);
        seenSubpackageRoots.add(subpackageRoot);
        included.push({ bundleName, root: subpackageRoot, bytes });
        total += bytes;
    }
    return { total, included };
}

function maybeReloadWechatDevtools() {
    if (openDevtools !== '1' || process.platform !== 'darwin') {
        logInfo('已跳过微信开发者工具自动重载');
        return;
    }
    const cli = '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatwebdevtools';
    if (!fs.existsSync(cli)) {
        logInfo('未找到微信开发者工具，跳过自动重载');
        return;
    }
    const child = spawn(cli, [buildDir], { detached: true, stdio: 'ignore' });
    child.unref();
    logInfo('已通知微信开发者工具重新加载项目');
}

console.log('=== 微信小游戏打包 ===');
logInfo('Mode: ' + buildMode);
logInfo('GameAssets bundle: wechat subpackage');

logStep('0. 清理旧产物...');
rm(buildDir);
rm(levelDataCdnDir);
logInfo('build/wechatgame 与 build/level-data-cdn 已清理');
cleanCocosGeneratedCaches();
repairCocosMetaFiles();

logStep('0.15 生成远程关卡数据包...');
runNode('scripts/write-level-data-cdn.js', [levelDataCdnDir]);
logInfo('关卡数据 CDN 产物已生成: ' + levelDataCdnDir);

logStep('0.2 准备 BootstrapBundle 首关快照...');
runNode('scripts/prepare-bootstrap.js');
logInfo('BootstrapBundle 源目录已准备');

const startSceneUuid = getStartSceneUuid();
runNode('scripts/write-wechat-build-config.js', [buildConfigPath, startSceneUrl, startSceneUuid, '--' + buildMode]);
logInfo('微信构建配置已生成: ' + buildConfigPath);

logStep('1. Cocos Creator 构建 wechatgame...');
const buildResult = buildCommon.spawnCocosBuild(projectDir, buildConfigPath);
repairCocosMetaFiles();
if (!findSettingsPath(buildDir) && !findSettingsPath(path.join(buildDir, 'minigame'))) {
    fail('Cocos 构建失败，未生成 settings.json/settings.<hash>.json');
}
if (buildResult.status !== 0 || buildResult.signal) {
    logInfo('Cocos 构建进程返回非零状态，但产物已生成，继续后处理: status=' + buildResult.status + ' signal=' + (buildResult.signal || ''));
}
logInfo('Cocos 构建完成');

logStep('2. 运行构建后处理...');
runNode('scripts/postbuild-wechat.js', [buildDir]);
if (fs.existsSync(path.join(projectDir, 'cloudfunctions'))) {
    rm(path.join(buildDir, 'cloudfunctions'));
    fs.cpSync(path.join(projectDir, 'cloudfunctions'), path.join(buildDir, 'cloudfunctions'), { recursive: true });
    logInfo('cloudfunctions 已复制到本地包');
}

const runtimeDir = resolveRuntimeDir();
logStep('2.1 补齐本地小游戏公共 bundle 产物...');
runNode('scripts/postbuild-minigame-bundles.js', [runtimeDir]);

logStep('3. 输出体积...');
const gameJson = readJson(path.join(runtimeDir, 'game.json'));
const runtimeInfo = {
    homeAssetsDir: resolveBundleDir(runtimeDir, 'homeAssets', gameJson),
    gameAssetsDir: resolveBundleDir(runtimeDir, 'gameAssets', gameJson),
};
const subpackageRoots = (Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [])
    .map((item) => String(item && item.root || '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .map((root) => path.join(runtimeDir, root));
const mainBytes = dirSize(runtimeDir, subpackageRoots);
const runtimeBytes = dirSize(runtimeDir);
const mainKB = Math.round(mainBytes / 1024);
const settings = readJson(findSettingsPath(runtimeDir));
const startupDownload = computeStartupDownloadBytes(runtimeDir, gameJson, settings.assets || {}, mainBytes);
const startupDownloadKB = Math.round(startupDownload.total / 1024);
console.log('   - 本地包项目:        ' + buildDir);
console.log('   - 运行时根目录:      ' + runtimeDir);
console.log('   - 关卡数据 CDN:      ' + levelDataCdnDir);
console.log('   - assets/bootstrap: ' + formatMB(dirSize(path.join(runtimeDir, 'assets', 'bootstrap'))));
console.log('   - homeAssets 分包:       ' + formatMB(dirSize(runtimeInfo.homeAssetsDir)));
console.log('   - gameAssets 分包:       ' + formatMB(dirSize(runtimeInfo.gameAssetsDir)));
console.log('   - 关卡数据包:        ' + formatMB(dirSize(levelDataCdnDir)));
console.log('');
console.log('4. 微信上传主包: ' + formatMB(mainBytes) + ' (' + mainKB + 'KB / ' + mainPackageTargetKB + 'KB 目标, 排除 game.json.subpackages)');
console.log('   启动下载量: ' + formatMB(startupDownload.total) + ' (' + startupDownloadKB + 'KB / ' + startupDownloadTargetKB + 'KB 目标, 硬主包 + preloadBundles)');
for (const item of startupDownload.included) {
    console.log('     + preload ' + item.bundleName + ' (' + item.root + '): ' + formatMB(item.bytes));
}
console.log('   minigame 实际目录: ' + formatMB(runtimeBytes));
console.log('');
console.log('=== 打包完成 ===');
console.log('本地包：' + buildDir);
console.log('关卡数据包：' + levelDataCdnDir);
console.log('如需上传关卡数据，再执行：npm run sync:cdn:wechat');
maybeReloadWechatDevtools();
