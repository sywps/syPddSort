#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const buildCommon = require('./minigame-build-common.js');
const {
    configureWechatCdnEnvironment,
    extractRequiredWechatCdnSlot,
} = require('./wechat-cdn-slot-config');

const projectDir = path.resolve(__dirname, '..');
const freshWorkerPrefix = 'game-pdd-v2-wechat-release.';
const generatedOutputNames = [
    'wechatgame',
    'wechatgame-staging',
    'level-data-cdn',
    'skin-cdn',
];
const sourceSyncExcludes = [
    '.git',
    '.planning',
    '.playwright-cli',
    'artifacts',
    'build',
    'build-preview',
    'library',
    'local',
    'node_modules',
    'output',
    'outputs',
    'temp',
];
const heldAssetDbTimeoutMs = Math.max(
    30000,
    Number(process.env.WECHAT_RELEASE_ASSETDB_TIMEOUT_MS) || 300000,
);
const workerAssetDbContracts = [
    {
        relativePath: 'BootstrapBundle/Scenes/Game.scene',
        requiredTexts: [
            'TutorialGuideHands',
            'GuideHandSingle',
            'GuideHandPinchLeft',
            'GuideHandPinchRight',
        ],
    },
];

function fail(message) {
    throw new Error(message);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createFreshWorkerDir(tempRoot = os.tmpdir()) {
    const absoluteTempRoot = path.resolve(tempRoot);
    fs.mkdirSync(absoluteTempRoot, { recursive: true });
    return fs.mkdtempSync(path.join(absoluteTempRoot, freshWorkerPrefix));
}

function assertSafeFreshWorkerPath(workerDir, tempRoot = os.tmpdir()) {
    if (!workerDir || !path.isAbsolute(workerDir)) {
        fail('Release 临时工位必须是绝对路径: ' + String(workerDir || ''));
    }
    if (!fs.existsSync(workerDir)) return;
    const stat = fs.lstatSync(workerDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
        fail('Release 临时工位必须是实体目录: ' + workerDir);
    }
    const expectedParent = fs.realpathSync(path.resolve(tempRoot));
    const actualParent = fs.realpathSync(path.dirname(workerDir));
    if (actualParent !== expectedParent || !path.basename(workerDir).startsWith(freshWorkerPrefix)) {
        fail('拒绝操作非本次 Release runner 管理的目录: ' + workerDir);
    }
}

function cleanupFreshWorkerDir(workerDir, tempRoot = os.tmpdir()) {
    assertSafeFreshWorkerPath(workerDir, tempRoot);
    if (!fs.existsSync(workerDir)) return;
    fs.rmSync(workerDir, { recursive: true, force: false });
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd || projectDir,
        env: options.env || process.env,
        stdio: options.stdio || 'inherit',
        encoding: options.encoding,
        shell: false,
    });
    if (result.error) fail(result.error.message);
    if (result.status !== 0) fail(options.label + ' failed with status ' + result.status);
    return result;
}

function runRsync(args, label, stdio = 'inherit') {
    return run('rsync', args, { label, stdio, encoding: stdio === 'pipe' ? 'utf8' : undefined });
}

function collectAssetTree(rootDir) {
    const entries = new Map();
    const visit = (currentDir) => {
        for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
            if (entry.name === '.DS_Store') continue;
            const absolutePath = path.join(currentDir, entry.name);
            const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join('/');
            if (entry.isDirectory()) {
                entries.set(relativePath, { absolutePath, type: 'directory' });
                visit(absolutePath);
                continue;
            }
            if (entry.isSymbolicLink()) {
                entries.set(relativePath, {
                    absolutePath,
                    target: fs.readlinkSync(absolutePath),
                    type: 'symlink',
                });
                continue;
            }
            const stat = fs.statSync(absolutePath);
            entries.set(relativePath, { absolutePath, size: stat.size, type: 'file' });
        }
    };
    visit(rootDir);
    return entries;
}

function listAssetTreeContentDiff(sourceAssetsDir, targetAssetsDir) {
    const source = collectAssetTree(sourceAssetsDir);
    const target = collectAssetTree(targetAssetsDir);
    const differences = [];
    for (const relativePath of [...new Set([...source.keys(), ...target.keys()])].sort()) {
        const sourceEntry = source.get(relativePath);
        const targetEntry = target.get(relativePath);
        if (!sourceEntry) {
            differences.push('工位多出: ' + relativePath);
            continue;
        }
        if (!targetEntry) {
            differences.push('工位缺少: ' + relativePath);
            continue;
        }
        if (sourceEntry.type !== targetEntry.type) {
            differences.push('类型不同: ' + relativePath);
            continue;
        }
        if (sourceEntry.type === 'directory') continue;
        if (sourceEntry.type === 'symlink') {
            if (sourceEntry.target !== targetEntry.target) differences.push('链接不同: ' + relativePath);
            continue;
        }
        if (sourceEntry.size !== targetEntry.size) {
            differences.push('大小不同: ' + relativePath);
            continue;
        }
        if (!fs.readFileSync(sourceEntry.absolutePath).equals(fs.readFileSync(targetEntry.absolutePath))) {
            differences.push('内容不同: ' + relativePath);
        }
    }
    return differences.join('\n');
}

function assertAssetTreesByteIdentical(workerDir) {
    const diff = listAssetTreeContentDiff(
        path.join(projectDir, 'assets'),
        path.join(workerDir, 'assets'),
    );
    if (!diff) return;
    const preview = diff.split(/\r?\n/).slice(0, 20).join('\n');
    fail('Release 全新工位 assets 与当前工作区内容不一致:\n' + preview);
}

function readAssetUuid(workerDir, relativePath) {
    const metaPath = path.join(workerDir, 'assets', relativePath + '.meta');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (!meta || typeof meta.uuid !== 'string' || !meta.uuid) {
        fail('Release 构建工位资产缺少有效 UUID: ' + relativePath);
    }
    return meta.uuid;
}

function getWorkerAssetDbContractErrors(workerDir) {
    const errors = [];
    for (const contract of workerAssetDbContracts) {
        const uuid = readAssetUuid(workerDir, contract.relativePath);
        const libraryPath = path.join(workerDir, 'library', uuid.slice(0, 2), uuid + '.json');
        if (!fs.existsSync(libraryPath)) {
            errors.push(contract.relativePath + ' 缺少 library 导入产物');
            continue;
        }
        const content = fs.readFileSync(libraryPath, 'utf8');
        const missingTexts = contract.requiredTexts.filter((text) => !content.includes(text));
        if (missingTexts.length > 0) {
            errors.push(contract.relativePath + ' 的 library 产物缺少: ' + missingTexts.join(', '));
        }
    }
    return errors;
}

function syncProjectSource(workerDir) {
    const args = ['-a', '--delete'];
    for (const excluded of sourceSyncExcludes) args.push('--exclude=' + excluded);
    args.push(projectDir + path.sep, workerDir + path.sep);
    runRsync(args, '同步 Release 构建工位源码');
}

function linkWorkspaceDependencies(workerDir) {
    const sourceDir = path.join(projectDir, 'node_modules');
    const targetDir = path.join(workerDir, 'node_modules');
    if (!fs.existsSync(sourceDir)) {
        fail('当前工作区缺少 node_modules，请先安装依赖: ' + sourceDir);
    }
    if (fs.existsSync(targetDir)) {
        fail('Release 全新工位不应预先包含 node_modules: ' + targetDir);
    }
    fs.symlinkSync(sourceDir, targetDir, process.platform === 'win32' ? 'junction' : 'dir');
}

function syncGeneratedOutputs(workerDir) {
    for (const name of generatedOutputNames) {
        const sourceDir = path.join(workerDir, 'build', name);
        const targetDir = path.join(projectDir, 'build', name);
        if (!fs.existsSync(sourceDir)) fail('Release 构建工位缺少产物: ' + sourceDir);
        fs.mkdirSync(targetDir, { recursive: true });
        runRsync(['-a', '--delete', sourceDir + path.sep, targetDir + path.sep], '同步 ' + name);
        const diff = runRsync(
            ['-ani', '--delete', sourceDir + path.sep, targetDir + path.sep],
            '校验 ' + name,
            'pipe',
        );
        if (String(diff.stdout || '').trim()) fail(name + ' 回传后仍有差异');
    }
}

function runDirectRelease(targetDir, slot, env = process.env) {
    run(process.execPath, [
        path.join(targetDir, 'scripts', 'build-wechat.js'),
        '--release',
        '--cdn-slot=' + slot,
    ], {
        cwd: targetDir,
        env,
        label: '微信 Release 构建',
    });
}

function maybeOpenWorkspaceWechatDevtools(env = process.env) {
    if ((env.WECHAT_OPEN_DEVTOOLS || '1') !== '1' || process.platform !== 'darwin') {
        console.log('   已跳过微信开发者工具自动重载');
        return;
    }
    try {
        run(process.execPath, [
            path.join(projectDir, 'scripts', 'open-wechat-devtools.js'),
            '--project',
            path.join(projectDir, 'build', 'wechatgame'),
            '--mode',
            'open',
        ], {
            cwd: projectDir,
            env,
            label: '微信开发者工具 CLI 打开',
        });
        console.log('   已通过微信开发者工具 CLI 打开工作区产物');
    } catch (_) {
        console.log('   微信开发者工具 CLI 打开失败，请手动执行 npm run wechat:devtools:open');
    }
}

function startHeldAssetDb(workerDir) {
    const readyPath = path.join(workerDir, 'temp', 'pdd-release-assetdb-held.json');
    const resultPath = path.join(workerDir, 'temp', 'pdd-release-assetdb-monitor.json');
    fs.rmSync(readyPath, { force: true });
    fs.rmSync(readyPath + '.tmp', { force: true });
    fs.rmSync(resultPath, { force: true });
    fs.rmSync(resultPath + '.tmp', { force: true });
    const child = spawn(
        process.execPath,
        [path.join(workerDir, 'scripts', 'warm-cocos-assetdb.js'), '--hold', readyPath, resultPath],
        {
            cwd: workerDir,
            env: {
                ...process.env,
                PDD_COCOS_ASSETDB_FORCE_REFRESH: '1',
                WECHAT_COCOS_ASSETDB_WARM_TIMEOUT_MS:
                    process.env.WECHAT_COCOS_ASSETDB_WARM_TIMEOUT_MS || String(heldAssetDbTimeoutMs),
            },
            stdio: 'inherit',
            shell: false,
        },
    );
    const state = { child, readyPath, workerDir, spawnError: null };
    child.once('error', (error) => {
        state.spawnError = error;
    });
    return state;
}

async function waitForHeldAssetDb(state) {
    const deadline = Date.now() + heldAssetDbTimeoutMs;
    let lastContractErrors = [];
    while (Date.now() < deadline) {
        if (state.spawnError) throw state.spawnError;
        if (fs.existsSync(state.readyPath)) {
            const ready = JSON.parse(fs.readFileSync(state.readyPath, 'utf8'));
            if (ready.ready === true && Number(ready.sceneCount) > 0 && Number(ready.scriptCount) > 0) {
                lastContractErrors = getWorkerAssetDbContractErrors(state.workerDir);
                if (lastContractErrors.length === 0) return ready;
                await sleep(250);
                continue;
            }
            fail('Release 构建工位 AssetDB 常驻清单无效: ' + JSON.stringify(ready));
        }
        if (state.child.exitCode !== null || state.child.signalCode !== null) {
            fail(
                'Release 构建工位 AssetDB 常驻进程提前退出: status=' + state.child.exitCode
                + ', signal=' + (state.child.signalCode || ''),
            );
        }
        await sleep(250);
    }
    fail(
        '等待 Release 构建工位 AssetDB 常驻清单超时: ' + heldAssetDbTimeoutMs + 'ms'
        + (lastContractErrors.length > 0 ? '\n' + lastContractErrors.join('\n') : ''),
    );
}

function waitForChildExit(child, waitMs) {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            child.removeListener('exit', onExit);
            resolve(false);
        }, waitMs);
        function onExit() {
            clearTimeout(timer);
            resolve(true);
        }
        child.once('exit', onExit);
    });
}

async function stopHeldAssetDb(state) {
    if (!state || state.child.exitCode !== null || state.child.signalCode !== null) return;
    state.child.kill('SIGTERM');
    if (await waitForChildExit(state.child, 40000)) return;
    state.child.kill('SIGKILL');
    if (!await waitForChildExit(state.child, 5000)) {
        fail('无法关闭 Release 构建工位 AssetDB 常驻进程 pid=' + state.child.pid);
    }
}

function validateFreshWorkerDir(workerDir, tempRoot = os.tmpdir()) {
    assertSafeFreshWorkerPath(workerDir, tempRoot);
    if (!fs.existsSync(path.join(workerDir, 'assets'))) fail('Release 全新工位缺少 assets: ' + workerDir);
    if (fs.existsSync(path.join(workerDir, 'library')) || fs.existsSync(path.join(workerDir, 'temp'))) {
        fail('Release 全新工位在 AssetDB 预热前不应包含 library/temp: ' + workerDir);
    }
    if (!fs.existsSync(path.join(workerDir, 'node_modules'))) {
        fail('Release 全新工位缺少 node_modules 依赖链接: ' + workerDir);
    }
    if (fs.realpathSync(workerDir) === fs.realpathSync(projectDir)) {
        fail('Release 构建工位不能指向当前工作区');
    }
}

async function main(args = process.argv.slice(2)) {
    const parsed = extractRequiredWechatCdnSlot(args);
    if (parsed.remainingArgs.length > 0) {
        fail('未知参数: ' + parsed.remainingArgs.join(' '));
    }
    const wechatCdnTarget = configureWechatCdnEnvironment(parsed.target, process.env);
    buildCommon.guardCocosPreviewOrFail(projectDir);
    const workerDir = createFreshWorkerDir();
    console.log('=== 微信 Release 隔离构建工位 ===');
    console.log('   CDN slot:  ' + wechatCdnTarget.slot + ' (' + wechatCdnTarget.cdnRootUrl + ')');
    console.log('   Workspace: ' + projectDir);
    console.log('   Worker:    ' + workerDir);
    let primaryError = null;
    let heldAssetDb = null;
    try {
        console.log('   正在同步当前源码与 assets 快照...');
        syncProjectSource(workerDir);
        linkWorkspaceDependencies(workerDir);
        validateFreshWorkerDir(workerDir);
        console.log('   正在校验全新工位 assets 字节一致性...');
        assertAssetTreesByteIdentical(workerDir);
        console.log('   正在从零生成并保持 AssetDB，直至 batch 构建结束...');
        heldAssetDb = startHeldAssetDb(workerDir);
        const ready = await waitForHeldAssetDb(heldAssetDb);
        console.log('   AssetDB 常驻清单: scenes=' + ready.sceneCount + ', scripts=' + ready.scriptCount);
        console.log('   batch 构建仅使用本次刚生成的 AssetDB，不读取历史 library/temp');
        runDirectRelease(workerDir, wechatCdnTarget.slot, {
            ...process.env,
            COCOS_PREVIEW_PORT: process.env.COCOS_PREVIEW_PORT || '7556',
            COCOS_PREVIEW_PORT_SCAN_COUNT: process.env.COCOS_PREVIEW_PORT_SCAN_COUNT || '1',
            WECHAT_CLEAN_COCOS_CACHE: '0',
            WECHAT_OPEN_DEVTOOLS: '0',
            WECHAT_WARM_COCOS_ASSETDB: '0',
        });
    } catch (error) {
        primaryError = error;
    }
    try {
        if (heldAssetDb) await stopHeldAssetDb(heldAssetDb);
    } catch (error) {
        if (!primaryError) primaryError = error;
    }
    if (!primaryError) {
        try {
            syncGeneratedOutputs(workerDir);
            console.log('=== 工作区 Release 产物回传完成 ===');
            console.log('本地包：' + path.join(projectDir, 'build', 'wechatgame'));
        } catch (error) {
            primaryError = error;
        }
    }
    try {
        cleanupFreshWorkerDir(workerDir);
        console.log('   本次全新 Release 工位已清理');
    } catch (error) {
        if (!primaryError) primaryError = error;
    }
    if (primaryError) throw primaryError;
    maybeOpenWorkspaceWechatDevtools();
}

if (require.main === module) {
    main().catch((error) => {
        console.error('ERROR: ' + (error && error.message ? error.message : String(error)));
        process.exitCode = 1;
    });
}

module.exports = {
    assertAssetTreesByteIdentical,
    cleanupFreshWorkerDir,
    createFreshWorkerDir,
    freshWorkerPrefix,
    generatedOutputNames,
    heldAssetDbTimeoutMs,
    linkWorkspaceDependencies,
    listAssetTreeContentDiff,
    sourceSyncExcludes,
    syncGeneratedOutputs,
    syncProjectSource,
    validateFreshWorkerDir,
};
