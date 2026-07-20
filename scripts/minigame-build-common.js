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

const cocosGeneratedCachePaths = [
    'library',
    'temp/asset-db',
    'temp/builder',
    'temp/programming',
];

const DEFAULT_COCOS_PREVIEW_PORT = 7456;
const DEFAULT_COCOS_PREVIEW_PORT_SCAN_COUNT = 10;
const COCOS_PREVIEW_PORT_PROBE_SOURCE = `
const net = require('net');
const ports = JSON.parse(process.argv[1]);
const timeoutMs = Math.max(50, Number(process.argv[2]) || 180);
Promise.all(ports.map((port) => new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (open) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(open ? port : null);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(timeoutMs, () => finish(false));
}))).then((result) => {
    process.stdout.write(JSON.stringify(result.filter((port) => port !== null)));
});
`;

function normalizeTcpPort(value) {
    const port = Math.floor(Number(value) || 0);
    return port >= 1 && port <= 65535 ? port : 0;
}

function parseCocosPreviewPorts(value) {
    const ports = String(value || '')
        .split(',')
        .map((entry) => normalizeTcpPort(entry.trim()))
        .filter(Boolean);
    return Array.from(new Set(ports));
}

function readConfiguredCocosPreviewPort(projectDir) {
    const configPath = path.join(projectDir, 'profiles', 'v2', 'packages', 'server.json');
    if (!fs.existsSync(configPath)) return DEFAULT_COCOS_PREVIEW_PORT;
    try {
        return normalizeTcpPort(readJson(configPath).server_port) || DEFAULT_COCOS_PREVIEW_PORT;
    } catch (_) {
        return DEFAULT_COCOS_PREVIEW_PORT;
    }
}

function resolveCocosPreviewPorts(projectDir, env = process.env) {
    const explicitPorts = parseCocosPreviewPorts(env.COCOS_PREVIEW_PORTS);
    if (explicitPorts.length > 0) return explicitPorts;
    const basePort = normalizeTcpPort(env.COCOS_PREVIEW_PORT) || readConfiguredCocosPreviewPort(projectDir);
    const scanCount = Math.min(20, Math.max(1,
        Math.floor(Number(env.COCOS_PREVIEW_PORT_SCAN_COUNT) || DEFAULT_COCOS_PREVIEW_PORT_SCAN_COUNT),
    ));
    const ports = [];
    for (let offset = 0; offset < scanCount && basePort + offset <= 65535; offset += 1) {
        ports.push(basePort + offset);
    }
    return ports;
}

function probeLocalTcpPorts(ports, timeoutMs = 180) {
    if (!ports.length) return [];
    const result = childProcess.spawnSync(
        process.execPath,
        ['-e', COCOS_PREVIEW_PORT_PROBE_SOURCE, JSON.stringify(ports), String(timeoutMs)],
        {
            encoding: 'utf8',
            shell: false,
            timeout: Math.max(1000, timeoutMs * 2 + 500),
        },
    );
    if (result.error || result.status !== 0) {
        const detail = result.error?.message || String(result.stderr || '').trim() || `status=${result.status}`;
        throw new Error('无法确认 Cocos 本地预览是否仍在运行: ' + detail);
    }
    try {
        const activePorts = JSON.parse(String(result.stdout || '[]'));
        return Array.isArray(activePorts) ? activePorts.map(normalizeTcpPort).filter(Boolean) : [];
    } catch (err) {
        throw new Error('无法解析 Cocos 本地预览端口检测结果: ' + err.message);
    }
}

function findActiveCocosPreviewPorts(projectDir, options = {}) {
    const ports = options.ports || resolveCocosPreviewPorts(projectDir, options.env || process.env);
    const probePorts = options.probePorts || probeLocalTcpPorts;
    return probePorts(ports, options.timeoutMs).map(normalizeTcpPort).filter(Boolean);
}

function assertNoActiveCocosPreview(projectDir, options = {}) {
    const activePorts = findActiveCocosPreviewPorts(projectDir, options);
    if (activePorts.length === 0) return;
    throw new Error([
        `检测到仍在运行的 Cocos 本地预览端口: ${activePorts.join(', ')}`,
        '平台构建会重建 library、temp/asset-db、temp/builder 和 temp/programming；继续会让已打开的 localhost 页面持有失效资源并在关卡切换时出现 404。',
        '请先停止 Cocos Browser Preview；如果编辑器仍占用该端口，请关闭当前 Cocos 项目。关闭或刷新旧 localhost 页面后再重新执行构建。localhost 仍默认读取本地 assets/LevelData，无需切换到 CDN。',
    ].join('\n'));
}

function guardCocosPreviewOrFail(projectDir, options = {}) {
    try {
        assertNoActiveCocosPreview(projectDir, options);
    } catch (err) {
        const failHandler = options.fail || fail;
        failHandler(err instanceof Error ? err.message : String(err));
    }
}

function cleanCocosGeneratedCacheDirs(projectDir, logInfo, message, options = {}) {
    if (!options.skipPreviewGuard) {
        guardCocosPreviewOrFail(projectDir, options);
    }
    for (const relPath of cocosGeneratedCachePaths) {
        rm(path.join(projectDir, relPath));
    }
    logInfo(message || '已清理 Cocos 项目级生成缓存，避免 stale asset-db/importer/script 状态污染构建');
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

function cleanCocosGeneratedCaches(projectDir, envName, logInfo, options = {}) {
    guardCocosPreviewOrFail(projectDir, options);
    if (process.env[envName] === '0') {
        logInfo('已跳过 Cocos 项目级生成缓存清理');
        return;
    }
    cleanCocosGeneratedCacheDirs(projectDir, logInfo, undefined, {
        ...options,
        skipPreviewGuard: true,
    });
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

function hasOnlyEmptyCocosAssetStats(text) {
    const pattern = /Number of all scenes:\s*(\d+)[\s\S]*?Number of all scripts:\s*(\d+)[\s\S]*?Number of other assets:\s*(\d+)/g;
    let sawStats = false;
    let match;
    while ((match = pattern.exec(text))) {
        sawStats = true;
        if (Number(match[1]) + Number(match[2]) + Number(match[3]) > 0) return false;
    }
    return sawStats;
}

function hasNoPopulatedCocosSceneScriptStats(text) {
    const pattern = /Number of all scenes:\s*(\d+)[\s\S]*?Number of all scripts:\s*(\d+)[\s\S]*?Number of other assets:\s*(\d+)/g;
    let sawStats = false;
    let match;
    while ((match = pattern.exec(text))) {
        sawStats = true;
        if (Number(match[1]) > 0 && Number(match[2]) > 0) return false;
    }
    return sawStats;
}

module.exports = {
    assertNoActiveCocosPreview,
    cleanCocosGeneratedCacheDirs,
    cleanCocosGeneratedCaches,
    dirSize,
    fail,
    findActiveCocosPreviewPorts,
    findSettingsPath,
    formatMB,
    guardCocosPreviewOrFail,
    hasNoPopulatedCocosSceneScriptStats,
    hasOnlyEmptyCocosAssetStats,
    parseBuildMode,
    parseCocosPreviewPorts,
    probeLocalTcpPorts,
    readAssetUuid,
    readJson,
    repairCocosMetaFiles,
    resolveCocosPreviewPorts,
    resolveCocosCli,
    resolveRuntimeRoot,
    rm,
    runNode,
    spawnCocosBuild,
    walkFiles,
    writeJson,
};
