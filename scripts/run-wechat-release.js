#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
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
    fs.rmSync(workerDir, {
        recursive: true,
        force: false,
        maxRetries: 20,
        retryDelay: 250,
    });
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

function canUseRsync() {
    if (process.platform === 'win32') return false;
    const result = spawnSync('rsync', ['--version'], {
        stdio: 'ignore',
        shell: false,
    });
    return !result.error && result.status === 0;
}

function copyDirectoryContents(sourceDir, targetDir, options = {}) {
    const excludedTopLevelNames = new Set(options.excludedTopLevelNames || []);
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        if (excludedTopLevelNames.has(entry.name)) continue;
        fs.cpSync(
            path.join(sourceDir, entry.name),
            path.join(targetDir, entry.name),
            {
                recursive: true,
                dereference: false,
                force: true,
                verbatimSymlinks: true,
            },
        );
    }
}

function replaceDirectoryContents(sourceDir, targetDir, options = {}) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    copyDirectoryContents(sourceDir, targetDir, options);
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
    if (!canUseRsync()) {
        copyDirectoryContents(projectDir, workerDir, {
            excludedTopLevelNames: sourceSyncExcludes,
        });
        return;
    }
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
    const useRsync = canUseRsync();
    for (const name of generatedOutputNames) {
        const sourceDir = path.join(workerDir, 'build', name);
        const targetDir = path.join(projectDir, 'build', name);
        if (!fs.existsSync(sourceDir)) fail('Release 构建工位缺少产物: ' + sourceDir);
        if (useRsync) {
            fs.mkdirSync(targetDir, { recursive: true });
            runRsync(['-a', '--delete', sourceDir + path.sep, targetDir + path.sep], '同步 ' + name);
            const diff = runRsync(
                ['-ani', '--delete', sourceDir + path.sep, targetDir + path.sep],
                '校验 ' + name,
                'pipe',
            );
            if (String(diff.stdout || '').trim()) fail(name + ' 回传后仍有差异');
            continue;
        }
        replaceDirectoryContents(sourceDir, targetDir);
        if (listAssetTreeContentDiff(sourceDir, targetDir)) fail(name + ' 回传后仍有差异');
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

function warmFreshWorkerAssetDb(workerDir) {
    const resultPath = path.join(workerDir, 'temp', 'pdd-release-assetdb-monitor.json');
    fs.rmSync(resultPath, { force: true });
    fs.rmSync(resultPath + '.tmp', { force: true });
    run(process.execPath, [path.join(workerDir, 'scripts', 'warm-cocos-assetdb.js'), resultPath], {
        cwd: workerDir,
        env: {
            ...process.env,
            PDD_COCOS_ASSETDB_FORCE_REFRESH: '1',
            WECHAT_COCOS_ASSETDB_WARM_TIMEOUT_MS:
                process.env.WECHAT_COCOS_ASSETDB_WARM_TIMEOUT_MS || String(heldAssetDbTimeoutMs),
        },
        label: 'Release 构建工位 AssetDB 预热',
    });
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    const contractErrors = getWorkerAssetDbContractErrors(workerDir);
    if (contractErrors.length > 0) {
        fail('Release 构建工位 AssetDB 导入契约失败:\n' + contractErrors.join('\n'));
    }
    return result;
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
    const workerDir = createFreshWorkerDir();
    console.log('=== 微信 Release 隔离构建工位 ===');
    console.log('   CDN slot:  ' + wechatCdnTarget.slot + ' (' + wechatCdnTarget.cdnRootUrl + ')');
    console.log('   Workspace: ' + projectDir);
    console.log('   Worker:    ' + workerDir);
    let primaryError = null;
    try {
        console.log('   正在同步当前源码与 assets 快照...');
        syncProjectSource(workerDir);
        linkWorkspaceDependencies(workerDir);
        validateFreshWorkerDir(workerDir);
        console.log('   正在校验全新工位 assets 字节一致性...');
        assertAssetTreesByteIdentical(workerDir);
        console.log('   正在从零生成 AssetDB，并在编辑器完全退出后启动 batch 构建...');
        const ready = warmFreshWorkerAssetDb(workerDir);
        console.log('   AssetDB 清单: scenes=' + ready.sceneCount + ', scripts=' + ready.scriptCount);
        console.log('   batch 构建仅使用本次刚生成的 AssetDB，不与预热编辑器并发访问工位');
        runDirectRelease(workerDir, wechatCdnTarget.slot, {
            ...process.env,
            COCOS_PREVIEW_PORTS: process.env.COCOS_PREVIEW_PORTS || '1',
            WECHAT_CLEAN_COCOS_CACHE: '0',
            WECHAT_OPEN_DEVTOOLS: '0',
            WECHAT_WARM_COCOS_ASSETDB: '0',
        });
    } catch (error) {
        primaryError = error;
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
    copyDirectoryContents,
    createFreshWorkerDir,
    canUseRsync,
    freshWorkerPrefix,
    generatedOutputNames,
    heldAssetDbTimeoutMs,
    linkWorkspaceDependencies,
    listAssetTreeContentDiff,
    replaceDirectoryContents,
    sourceSyncExcludes,
    syncGeneratedOutputs,
    syncProjectSource,
    validateFreshWorkerDir,
};
