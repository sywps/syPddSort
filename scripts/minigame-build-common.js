const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function parseBuildMode(args, usage) {
    if (args.length !== 1) fail('用法: ' + usage);
    const mode = args[0];
    if (mode === '--release' || mode === 'release') return 'release';
    if (mode === '--debug' || mode === 'debug') return 'debug';
    fail('未知构建模式: ' + mode);
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

function runNode(projectDir, script, args = []) {
    const result = childProcess.spawnSync(process.execPath, [path.join(projectDir, script), ...args], {
        cwd: projectDir,
        env: process.env,
        stdio: 'inherit',
        shell: false,
    });
    if (result.error) fail(result.error.message);
    if (result.status !== 0) process.exit(result.status || 1);
}

function cleanCocosGeneratedCaches(projectDir, envName, logInfo) {
    if (process.env[envName] === '0') {
        logInfo('已跳过 Cocos 项目级生成缓存清理');
        return;
    }
    for (const relPath of [
        'library',
        'temp/asset-db',
        'temp/builder',
    ]) {
        rm(path.join(projectDir, relPath));
    }
    logInfo('已清理 Cocos 构建缓存并保留 Preview 临时脚本，避免 stale asset-db/importer 状态污染构建');
}

function repairCocosMetaFiles(projectDir) {
    runNode(projectDir, 'scripts/repair-cocos-meta.js', ['assets']);
}

function readAssetUuid(projectDir, assetUrl, label) {
    const relPath = assetUrl.replace(/^db:\/\/assets\//, '');
    const metaPath = path.join(projectDir, 'assets', relPath + '.meta');
    if (!fs.existsSync(metaPath)) fail(label + ' meta 不存在: ' + path.relative(projectDir, metaPath));
    const uuid = readJson(metaPath).uuid;
    if (!uuid) fail(label + ' meta 缺少 uuid: ' + path.relative(projectDir, metaPath));
    return uuid;
}

function resolveCocosCli() {
    if (process.env.COCOS_CLI) return process.env.COCOS_CLI;
    const candidates = process.platform === 'win32'
        ? [
            'C:\\Program Files\\Cocos\\Creator\\3.8.8\\CocosCreator.exe',
            'C:\\Program Files\\CocosCreator\\CocosCreator.exe',
        ]
        : [
            '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator',
            '/Applications/CocosCreator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator',
            '/Applications/CocosCreator.app/Contents/MacOS/CocosCreator',
        ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function spawnCocosBuild(projectDir, buildConfigPath) {
    const cocosCli = resolveCocosCli();
    if (!cocosCli || !fs.existsSync(cocosCli)) {
        fail('Cocos Creator CLI 不存在，请安装 Cocos Creator 3.8.8，或用 COCOS_CLI 指定路径');
    }
    const result = childProcess.spawnSync(cocosCli, ['--project', projectDir, '--build', 'configPath=' + buildConfigPath], {
        cwd: projectDir,
        env: process.env,
        stdio: 'inherit',
        shell: false,
    });
    if (result.error) fail(result.error.message);
    return result;
}

function findSettingsPath(runtimeRoot) {
    const srcDir = path.join(runtimeRoot, 'src');
    if (!fs.existsSync(srcDir)) return '';
    const exact = path.join(srcDir, 'settings.json');
    if (fs.existsSync(exact)) return exact;
    const matches = fs.readdirSync(srcDir)
        .filter((name) => /^settings(?:\.[0-9a-f]+)?\.json$/i.test(name))
        .sort();
    return matches.length === 1 ? path.join(srcDir, matches[0]) : '';
}

function resolveRuntimeRoot(buildDir) {
    const minigame = path.join(buildDir, 'minigame');
    if (findSettingsPath(minigame) || fs.existsSync(path.join(minigame, 'game.json'))) return minigame;
    return buildDir;
}

module.exports = {
    cleanCocosGeneratedCaches,
    dirSize,
    fail,
    findSettingsPath,
    formatMB,
    parseBuildMode,
    readAssetUuid,
    readJson,
    repairCocosMetaFiles,
    resolveCocosCli,
    resolveRuntimeRoot,
    rm,
    runNode,
    spawnCocosBuild,
    walkFiles,
    writeJson,
};
