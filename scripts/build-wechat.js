#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const buildCommon = require('./minigame-build-common.js');
const platformConfig = require('./minigame-platform-config.js');

const projectDir = path.resolve(__dirname, '..');
const finalBuildDir = path.join(projectDir, 'build', 'wechatgame');
const stagingBuildName = 'wechatgame-staging';
const buildDir = path.join(projectDir, 'build', stagingBuildName);
const levelDataCdnDir = path.join(projectDir, 'build', 'level-data-cdn');
const skinDataCdnDir = path.join(projectDir, 'build', 'skin-cdn');
const buildConfigPath = path.join(projectDir, 'temp', 'wechat-build-config.json');
const assetDbPrewarmPath = path.join(projectDir, 'temp', 'pdd-assetdb-prewarm.json');
const startSceneUrl = 'db://assets/Scenes/Boot.scene';
const buildMode = parseBuildMode(process.argv.slice(2));
const mainPackageTargetKB = 3072;
const startupDownloadTargetKB = 3072;
const wechatFirstScreenBgColor = [0.9607843137254902, 0.9215686274509803, 0.8627450980392157, 1];
const wechatFirstScreenBgLiteral = '[' + wechatFirstScreenBgColor.join(',') + ']';
const wechatAppId = process.env.WECHAT_APPID || platformConfig.wechat.appId;
const openDevtools = process.env.WECHAT_OPEN_DEVTOOLS || '1';
process.env.WECHAT_BUILD_MODE = buildMode;
process.env.WECHAT_GAME_ASSETS_MODE = 'subpackage';
process.env.WECHAT_APPID = wechatAppId;
process.env.WECHAT_OPEN_DEVTOOLS = openDevtools;
process.env.PDD_COCOS_ASSETDB_PREWARM = process.env.PDD_COCOS_ASSETDB_PREWARM || '0';
process.env.PDD_COCOS_ASSETDB_PREWARM_FILE = assetDbPrewarmPath;

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

function promoteStagingBuild() {
    if (!fs.existsSync(buildDir)) {
        fail('微信 staging 构建目录不存在，不能发布到 build/wechatgame: ' + buildDir);
    }
    rm(finalBuildDir);
    fs.renameSync(buildDir, finalBuildDir);
}

function toFinalBuildPath(filePath) {
    const relPath = path.relative(buildDir, filePath);
    if (!relPath || relPath.startsWith('..') || path.isAbsolute(relPath)) return filePath;
    return path.join(finalBuildDir, relPath);
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

function sleepMs(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForSettingsPath(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastPath = '';
    while (Date.now() < deadline) {
        lastPath = findSettingsPath(buildDir) || findSettingsPath(path.join(buildDir, 'minigame'));
        if (lastPath) return lastPath;
        sleepMs(500);
    }
    return lastPath;
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
    const subpackageRoot = findSubpackageRoot(gameJson || {}, bundleName);
    if (subpackageRoot) return path.join(runtimeDir, subpackageRoot);
    const localDir = path.join(runtimeDir, 'assets', bundleName);
    if (fs.existsSync(localDir)) return localDir;
    return path.join(runtimeDir, 'subpackages', bundleName);
}

function resolveRuntimeDir() {
    for (const runtime of [path.join(buildDir, 'minigame'), buildDir]) {
        if (findSettingsPath(runtime)) return runtime;
    }
    fail('构建后未生成 settings.json/settings.<hash>.json');
}

function getRecentLogFiles(logDir, startedAtMs) {
    if (!fs.existsSync(logDir)) return [];
    return fs.readdirSync(logDir)
        .map((name) => path.join(logDir, name))
        .filter((filePath) => fs.statSync(filePath).isFile())
        .filter((filePath) => fs.statSync(filePath).mtimeMs >= startedAtMs - 5000)
        .sort();
}

function parseCocosLogLineTimeMs(line) {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/.exec(line);
    if (!match) return null;
    const [, year, month, day, hour, minute, second] = match;
    return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
    ).getTime();
}

function readCocosLogTextSince(logPath, startedAtMs) {
    const cutoffMs = startedAtMs - 2000;
    return fs.readFileSync(logPath, 'utf8')
        .split(/\r?\n/)
        .filter((line) => {
            const lineTimeMs = parseCocosLogLineTimeMs(line);
            return lineTimeMs !== null && lineTimeMs >= cutoffMs;
        })
        .join('\n');
}

function collectCocosImporterHealth(startedAtMs) {
    const assetDbLogs = getRecentLogFiles(path.join(projectDir, 'temp', 'asset-db', 'log'), startedAtMs);
    const builderLogs = getRecentLogFiles(path.join(projectDir, 'temp', 'builder', 'log'), startedAtMs);
    const importerFailures = [];
    for (const logPath of assetDbLogs) {
        const text = readCocosLogTextSince(logPath, startedAtMs);
        const matches = text.match(/Can not find the importer [^\r\n]+ in editor/g);
        if (matches && matches.length > 0) {
            importerFailures.push(`${path.relative(projectDir, logPath)}: ${matches.slice(0, 5).join('; ')}`);
        }
    }
    const emptyAssetStats = [];
    for (const logPath of builderLogs) {
        const text = readCocosLogTextSince(logPath, startedAtMs);
        if (/Number of all scenes:\s*0\b/.test(text) && /Number of all scripts:\s*0\b/.test(text)) {
            emptyAssetStats.push(path.relative(projectDir, logPath));
        }
    }
    return { importerFailures, emptyAssetStats };
}

function formatCocosImporterHealthError(health) {
    return [
        'Cocos AssetDB 导入器未正确注册，构建产物不可用。',
        health.importerFailures.length ? '导入器错误: ' + health.importerFailures.join(' | ') : '',
        health.emptyAssetStats.length ? '空资源统计: ' + health.emptyAssetStats.join(', ') : '',
        '请先修复 Cocos batch/importer 环境，不能继续用空 bundle 做浏览器或微信验证。',
    ].filter(Boolean).join(' ');
}

function runCocosBuildWithAssetDbRetry() {
    let startedAtMs = Date.now();
    let result = buildCommon.spawnCocosBuild(projectDir, buildConfigPath);
    repairCocosMetaFiles();
    assertCocosAssetDbPrewarmRan(startedAtMs);
    let health = collectCocosImporterHealth(startedAtMs);
    if (health.importerFailures.length === 0 && health.emptyAssetStats.length === 0) {
        return result;
    }

    logInfo('Cocos AssetDB 首次构建未就绪，准备在当前已导入缓存上自动重试一次');
    logInfo(formatCocosImporterHealthError(health));
    rm(buildDir);
    rm(assetDbPrewarmPath);

    startedAtMs = Date.now();
    result = buildCommon.spawnCocosBuild(projectDir, buildConfigPath);
    repairCocosMetaFiles();
    assertCocosAssetDbPrewarmRan(startedAtMs);
    health = collectCocosImporterHealth(startedAtMs);
    if (health.importerFailures.length > 0 || health.emptyAssetStats.length > 0) {
        fail(formatCocosImporterHealthError(health));
    }
    logInfo('Cocos AssetDB 自动重试通过');
    return result;
}

function assertCocosAssetDbPrewarmRan(startedAtMs) {
    if (process.env.PDD_COCOS_ASSETDB_PREWARM !== '1') return;
    if (!fs.existsSync(assetDbPrewarmPath)) {
        fail('Cocos AssetDB prewarm 扩展未执行: ' + path.relative(projectDir, assetDbPrewarmPath));
    }
    const stat = fs.statSync(assetDbPrewarmPath);
    if (stat.mtimeMs < startedAtMs - 5000) {
        fail('Cocos AssetDB prewarm 哨兵文件不是本次构建生成: ' + path.relative(projectDir, assetDbPrewarmPath));
    }
    const result = readJson(assetDbPrewarmPath);
    if (!result.assetDbReady) {
        fail('Cocos AssetDB prewarm 未等到 asset-db ready: ' + (result.refreshError || '<unknown>'));
    }
    if (result.refreshError) {
        fail('Cocos AssetDB prewarm refresh 失败: ' + result.refreshError);
    }
    logInfo('AssetDB prewarm 已执行: ' + path.relative(projectDir, assetDbPrewarmPath));
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

function readBundleConfig(bundleDir, bundleName) {
    let configPath = path.join(bundleDir, 'config.json');
    if (!fs.existsSync(configPath) && fs.existsSync(bundleDir)) {
        const matches = fs.readdirSync(bundleDir)
            .filter((name) => /^config(?:\.[0-9a-f]+)?\.json$/i.test(name))
            .sort();
        if (matches.length > 0) configPath = path.join(bundleDir, matches[0]);
    }
    if (!fs.existsSync(configPath)) fail(bundleName + ' 缺少 config.json: ' + configPath);
    return readJson(configPath);
}

function bundleConfigHasPath(config, expectedPath) {
    return Object.values(config.paths || {}).some((entry) => Array.isArray(entry) && entry[0] === expectedPath);
}

function bundleConfigPathsWithPrefix(config, prefix) {
    return Object.values(config.paths || {})
        .filter((entry) => Array.isArray(entry) && String(entry[0] || '').startsWith(prefix))
        .map((entry) => entry[0]);
}

function assertRuntimeBundleNoPath(bundleDir, bundleName, forbiddenPath) {
    const config = readBundleConfig(bundleDir, bundleName);
    if (bundleConfigHasPath(config, forbiddenPath)) {
        fail(bundleName + ' config 不应包含资源路径: ' + forbiddenPath);
    }
}

function collectMetaUuids(sourceDir) {
    if (!fs.existsSync(sourceDir)) return [];
    const uuids = new Set();
    for (const filePath of walkFiles(sourceDir)) {
        if (!filePath.endsWith('.meta')) continue;
        const meta = readJson(filePath);
        if (meta && typeof meta.uuid === 'string' && meta.uuid) uuids.add(meta.uuid);
        for (const subMeta of Object.values(meta.subMetas || {})) {
            if (subMeta && typeof subMeta.uuid === 'string' && subMeta.uuid) uuids.add(subMeta.uuid);
        }
    }
    return Array.from(uuids).sort();
}

function findUuidArtifactFiles(bundleDir, uuid) {
    const result = [];
    const importDir = path.join(bundleDir, 'import', uuid.slice(0, 2));
    if (fs.existsSync(importDir)) {
        for (const name of fs.readdirSync(importDir)) {
            if (name === uuid + '.json' || name.startsWith(uuid + '.')) {
                result.push(path.join(importDir, name));
            }
        }
    }
    const nativeUuid = uuid.split('@')[0];
    const nativeDir = path.join(bundleDir, 'native', nativeUuid.slice(0, 2));
    if (fs.existsSync(nativeDir)) {
        for (const name of fs.readdirSync(nativeDir)) {
            if (name.startsWith(nativeUuid + '.') && !/\.json$/i.test(name)) {
                result.push(path.join(nativeDir, name));
            }
        }
    }
    return result;
}

function assertRuntimeBundleNoSourceArtifacts(bundleDir, bundleName, sourceDir, label) {
    const hits = [];
    for (const uuid of collectMetaUuids(sourceDir)) {
        for (const filePath of findUuidArtifactFiles(bundleDir, uuid)) {
            hits.push(path.relative(bundleDir, filePath));
        }
    }
    if (hits.length > 0) {
        fail(bundleName + ' release 不应包含 ' + label + ' 产物: ' + hits.slice(0, 8).join(', '));
    }
}

function assertRuntimeBundleConfig(bundleDir, bundleName, expectedPaths, expectedSceneUrl) {
    const config = readBundleConfig(bundleDir, bundleName);
    if (expectedSceneUrl && (!config.scenes || config.scenes[expectedSceneUrl] === undefined)) {
        fail(bundleName + ' config 缺少场景: ' + expectedSceneUrl);
    }
    for (const expectedPath of expectedPaths) {
        if (!bundleConfigHasPath(config, expectedPath)) {
            fail(bundleName + ' config 缺少资源路径: ' + expectedPath);
        }
    }
}

function assertWechatFirstScreenBackground(runtimeDir, settings) {
    const firstScreenPath = path.join(runtimeDir, 'first-screen.js');
    if (!fs.existsSync(firstScreenPath)) {
        fail('微信 runtime 缺少 first-screen.js，无法确认启动首帧背景');
    }
    const firstScreen = fs.readFileSync(firstScreenPath, 'utf8');
    if (!firstScreen.includes('let bgColor = ' + wechatFirstScreenBgLiteral + ';')) {
        fail('微信 first-screen.js 未使用项目浅色首帧背景，可能产生黑屏截图');
    }
    const color = settings && settings.splashScreen && settings.splashScreen.background
        ? settings.splashScreen.background.color
        : null;
    const luma = color
        ? Number(color.x || 0) * 0.2126 + Number(color.y || 0) * 0.7152 + Number(color.z || 0) * 0.0722
        : 0;
    if (luma < 0.75) {
        fail('微信 settings.splashScreen.background.color 过暗，可能产生黑屏截图');
    }
}

function assertRuntimeBundleNoPathPrefix(bundleDir, bundleName, forbiddenPrefix) {
    const config = readBundleConfig(bundleDir, bundleName);
    const matches = bundleConfigPathsWithPrefix(config, forbiddenPrefix);
    if (matches.length > 0) {
        fail(bundleName + ' config 不应包含资源路径前缀 ' + forbiddenPrefix + ': ' + matches.slice(0, 8).join(', '));
    }
}

function assertRuntimeBundleNoDeps(bundleDir, bundleName, forbiddenDeps) {
    const config = readBundleConfig(bundleDir, bundleName);
    const deps = Array.isArray(config.deps) ? config.deps : [];
    const forbidden = forbiddenDeps.filter((dep) => deps.includes(dep));
    if (forbidden.length > 0) {
        fail(bundleName + ' config 不应依赖: ' + forbidden.join(', '));
    }
}

function assertRuntimeCoreConfig(runtimeDir, gameJson, settings) {
    const launchScene = settings && settings.launch && settings.launch.launchScene;
    if (launchScene !== startSceneUrl) {
        fail('settings.launch.launchScene 不正确: ' + (launchScene || '<empty>'));
    }
    const preloadBundles = getPreloadBundleNames(settings.assets || {});
    for (const forbidden of ['bootstrap', 'homeAssets', 'gameAssets']) {
        if (preloadBundles.includes(forbidden)) {
            fail('启动 preloadBundles 不应包含 ' + forbidden + ': ' + preloadBundles.join(', '));
        }
    }
}

function assertOpenDataContextConfig(runtimeDir, gameJson) {
    const openDataContext = String(gameJson.openDataContext || '').replace(/^\/+|\/+$/g, '');
    if (openDataContext !== 'openDataContext') {
        fail('game.json openDataContext 配置不正确: ' + (openDataContext || '<empty>'));
    }

    const openDataContextDir = path.join(runtimeDir, openDataContext);
    const requiredFiles = ['game.js', 'index.js'];
    for (const fileName of requiredFiles) {
        const filePath = path.join(openDataContextDir, fileName);
        if (!fs.existsSync(filePath)) {
            fail('开放数据域缺少入口文件: ' + path.relative(buildDir, filePath));
        }
    }
    const nestedProjectConfigPath = path.join(openDataContextDir, 'project.config.json');
    if (fs.existsSync(nestedProjectConfigPath)) {
        fail('开放数据域不应包含嵌套 project.config.json: ' + path.relative(buildDir, nestedProjectConfigPath));
    }

    const gameEntry = fs.readFileSync(path.join(openDataContextDir, 'game.js'), 'utf8');
    if (gameEntry.includes('cocos-js') || gameEntry.includes('src/settings') || gameEntry.includes('application.')) {
        fail('开放数据域 game.js 不应加载主域 Cocos 入口');
    }
    const forbiddenOpenDataMarkers = [
        'cocos-js',
        'src/settings',
        'application.',
        'System.register',
        '__ccSettings',
        '_virtual_cc',
        'assetManager',
        '"packs"',
        "'packs'",
    ];
    for (const filePath of walkFiles(openDataContextDir)) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.js' && ext !== '.json') continue;
        const content = fs.readFileSync(filePath, 'utf8');
        const marker = forbiddenOpenDataMarkers.find((item) => content.includes(item));
        if (marker) {
            fail('开放数据域文件疑似混入 Cocos 运行时代码: ' + path.relative(buildDir, filePath) + ' marker=' + marker);
        }
    }

    const projectConfigPath = path.join(buildDir, 'project.config.json');
    if (!fs.existsSync(projectConfigPath)) return;
    const projectConfig = readJson(projectConfigPath);
    if (String(projectConfig.miniprogramRoot || '') !== 'minigame/') {
        fail('project.config.json miniprogramRoot 不正确: ' + (projectConfig.miniprogramRoot || '<empty>'));
    }
    const expectedSubContext = path.posix.join(
        String(projectConfig.miniprogramRoot || '').replace(/^\/+|\/+$/g, ''),
        openDataContext,
    );
    if (projectConfig.subContext !== expectedSubContext) {
        fail('project.config.json subContext 不正确: ' + (projectConfig.subContext || '<empty>') + '，期望 ' + expectedSubContext);
    }
    const projectSubContextDir = path.join(buildDir, expectedSubContext);
    if (!fs.existsSync(projectSubContextDir)) {
        fail('project.config.json subContext 指向不存在目录: ' + expectedSubContext);
    }
}

function assertWechatProjectConfig() {
    const projectConfigPath = path.join(buildDir, 'project.config.json');
    if (!fs.existsSync(projectConfigPath)) return;
    const config = readJson(projectConfigPath);
    if (Object.prototype.hasOwnProperty.call(config, 'libVersion')) {
        const libVersion = String(config.libVersion || '').trim();
        if (libVersion !== 'latest' && !/^[0-9]+\.[0-9]+(?:\.[0-9]+)?$/.test(libVersion)) {
            fail('project.config.json libVersion 无效: ' + libVersion);
        }
    }
}

function maybeReloadWechatDevtools(projectPath) {
    if (openDevtools !== '1' || process.platform !== 'darwin') {
        logInfo('已跳过微信开发者工具自动重载');
        return;
    }
    const scriptPath = path.join(projectDir, 'scripts', 'open-wechat-devtools.js');
    if (!fs.existsSync(scriptPath)) {
        logInfo('未找到微信开发者工具打开脚本，跳过自动重载');
        return;
    }
    const result = spawnSync(process.execPath, [scriptPath, '--project', projectPath, '--mode', 'open'], {
        cwd: projectDir,
        env: process.env,
        stdio: 'inherit',
        shell: false,
    });
    if (result.error || result.status !== 0) {
        logInfo('微信开发者工具 CLI 打开失败，请手动执行 npm run wechat:devtools:open');
        return;
    }
    logInfo('已通过微信开发者工具 CLI 打开项目');
}

console.log('=== 微信小游戏打包 ===');
logInfo('Mode: ' + buildMode);
logInfo('GameAssets bundle: wechat subpackage');

logStep('0. 清理旧产物...');
rm(buildDir);
rm(finalBuildDir);
rm(levelDataCdnDir);
rm(skinDataCdnDir);
logInfo('build/wechatgame、build/wechatgame-staging、build/level-data-cdn 与 build/skin-cdn 已清理');
cleanCocosGeneratedCaches();
repairCocosMetaFiles();

logStep('0.15 生成远程关卡数据包...');
runNode('scripts/write-level-data-cdn.js', [levelDataCdnDir]);
logInfo('关卡数据 CDN 产物已生成: ' + levelDataCdnDir);

logStep('0.16 生成远程皮肤数据包...');
runNode('scripts/write-skin-data-cdn.js', [skinDataCdnDir]);
logInfo('皮肤数据 CDN 产物已生成: ' + skinDataCdnDir);

logStep('0.2 准备 BootstrapBundle 游戏入口快照...');
runNode('scripts/prepare-bootstrap.js');
logInfo('BootstrapBundle 源目录已准备');

const startSceneUuid = getStartSceneUuid();
runNode('scripts/write-wechat-build-config.js', [buildConfigPath, startSceneUrl, startSceneUuid, '--' + buildMode, stagingBuildName]);
logInfo('微信构建配置已生成: ' + buildConfigPath);

logStep('1. Cocos Creator 构建 wechatgame...');
rm(assetDbPrewarmPath);
const buildResult = runCocosBuildWithAssetDbRetry();
if (!findSettingsPath(buildDir) && !findSettingsPath(path.join(buildDir, 'minigame'))) {
    logInfo('Cocos 构建进程已返回，等待 settings.json/settings.<hash>.json 落盘...');
    if (!waitForSettingsPath(45000)) {
        fail('Cocos 构建失败，未生成 settings.json/settings.<hash>.json');
    }
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
let gameJson = readJson(path.join(runtimeDir, 'game.json'));
let settings = readJson(findSettingsPath(runtimeDir));
assertWechatProjectConfig();
assertRuntimeCoreConfig(runtimeDir, gameJson, settings);
assertWechatFirstScreenBackground(runtimeDir, settings);
assertOpenDataContextConfig(runtimeDir, gameJson);
logStep('2.1 补齐本地小游戏公共 bundle 产物...');
runNode('scripts/postbuild-minigame-bundles.js', [runtimeDir]);
gameJson = readJson(path.join(runtimeDir, 'game.json'));
settings = readJson(findSettingsPath(runtimeDir));

logStep('3. 输出体积...');
const runtimeInfo = {
    mainDir: resolveBundleDir(runtimeDir, 'main', gameJson),
    bootstrapDir: resolveBundleDir(runtimeDir, 'bootstrap', gameJson),
    homeAssetsDir: resolveBundleDir(runtimeDir, 'homeAssets', gameJson),
    gameAssetsDir: resolveBundleDir(runtimeDir, 'gameAssets', gameJson),
};
assertRuntimeBundleConfig(runtimeInfo.mainDir, 'cocosCore/main', [], startSceneUrl);
assertRuntimeBundleNoDeps(runtimeInfo.mainDir, 'cocosCore/main', ['bootstrap', 'homeAssets', 'gameAssets']);
assertRuntimeBundleConfig(runtimeInfo.bootstrapDir, 'gameEntry/bootstrap', ['LevelData/level_1', 'Beans/bean-atlas', 'GameUI/block_bright_pindd'], 'db://assets/BootstrapBundle/Scenes/Game.scene');
assertRuntimeBundleNoDeps(runtimeInfo.bootstrapDir, 'gameEntry/bootstrap', ['homeAssets', 'gameAssets']);
assertRuntimeBundleConfig(runtimeInfo.homeAssetsDir, 'homeAssets', [], 'db://assets/HomeAssetsBundle/Scenes/Home.scene');
assertRuntimeBundleNoDeps(runtimeInfo.homeAssetsDir, 'home/homeAssets', ['bootstrap', 'gameAssets']);
assertRuntimeBundleConfig(runtimeInfo.gameAssetsDir, 'gameAssets', buildMode === 'debug' ? ['Skins/skins', 'Skins/Icons/bg_000'] : [], '');
assertRuntimeBundleNoPath(runtimeInfo.gameAssetsDir, 'gameplay/gameAssets', 'Textures/UI/block_bright_pindd');
if (buildMode === 'release') {
    assertRuntimeBundleNoPathPrefix(runtimeInfo.gameAssetsDir, 'gameAssets', 'Skins/');
    assertRuntimeBundleNoSourceArtifacts(runtimeInfo.gameAssetsDir, 'gameAssets', path.join(projectDir, 'assets', 'GameAssetsBundle', 'Skins'), 'GameAssetsBundle/Skins 本地镜像');
}
assertRuntimeBundleNoDeps(runtimeInfo.gameAssetsDir, 'gameplay/gameAssets', ['bootstrap', 'homeAssets']);
const subpackageRoots = (Array.isArray(gameJson.subpackages) ? gameJson.subpackages : [])
    .map((item) => String(item && item.root || '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .map((root) => path.join(runtimeDir, root));
const mainBytes = dirSize(runtimeDir, subpackageRoots);
const runtimeBytes = dirSize(runtimeDir);
const mainKB = Math.round(mainBytes / 1024);
const startupDownload = computeStartupDownloadBytes(runtimeDir, gameJson, settings.assets || {}, mainBytes);
const startupDownloadKB = Math.round(startupDownload.total / 1024);
const finalRuntimeDir = toFinalBuildPath(runtimeDir);
const finalRuntimeInfo = {
    bootstrapDir: toFinalBuildPath(runtimeInfo.bootstrapDir),
    homeAssetsDir: toFinalBuildPath(runtimeInfo.homeAssetsDir),
    gameAssetsDir: toFinalBuildPath(runtimeInfo.gameAssetsDir),
};
promoteStagingBuild();
console.log('   - 本地包项目:        ' + finalBuildDir);
console.log('   - 运行时根目录:      ' + finalRuntimeDir);
console.log('   - 关卡数据 CDN:      ' + levelDataCdnDir);
console.log('   - 皮肤数据 CDN:      ' + skinDataCdnDir);
console.log('   - gameEntry/bootstrap: ' + formatMB(dirSize(finalRuntimeInfo.bootstrapDir)));
console.log('   - homeAssets 分包:       ' + formatMB(dirSize(finalRuntimeInfo.homeAssetsDir)));
console.log('   - gameAssets 分包:       ' + formatMB(dirSize(finalRuntimeInfo.gameAssetsDir)));
console.log('   - 关卡数据包:        ' + formatMB(dirSize(levelDataCdnDir)));
console.log('   - 皮肤数据包:        ' + formatMB(dirSize(skinDataCdnDir)));
console.log('');
console.log('4. 微信上传主包: ' + formatMB(mainBytes) + ' (' + mainKB + 'KB / ' + mainPackageTargetKB + 'KB 目标, 排除 game.json.subpackages)');
console.log('   启动下载量: ' + formatMB(startupDownload.total) + ' (' + startupDownloadKB + 'KB / ' + startupDownloadTargetKB + 'KB 目标, 硬主包 + preloadBundles)');
for (const item of startupDownload.included) {
    console.log('     + preload ' + item.bundleName + ' (' + item.root + '): ' + formatMB(item.bytes));
}
console.log('   minigame 实际目录: ' + formatMB(runtimeBytes));
console.log('');
console.log('=== 打包完成 ===');
console.log('本地包：' + finalBuildDir);
console.log('关卡数据包：' + levelDataCdnDir);
console.log('皮肤数据包：' + skinDataCdnDir);
console.log('如需上传全部 CDN 数据，再执行：npm run sync:cdn:wechat');
console.log('如需只上传关卡数据，再执行：npm run sync:cdn:wechat:level_data');
console.log('如需只上传皮肤数据，再执行：npm run sync:cdn:wechat:skin_data');
maybeReloadWechatDevtools(finalBuildDir);
