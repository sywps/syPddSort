#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const buildCommon = require('./minigame-build-common.js');

const projectDir = path.resolve(__dirname, '..');
const defaultResultPath = path.join(projectDir, 'temp', 'pdd-assetdb-warm.json');
const warmupRequestFileName = 'pdd-assetdb-warm-request.json';
const pollIntervalMs = 250;
const cacheSettleMs = 3000;
const processExitSettleMs = 3000;
const timeoutMs = Math.max(30000, Number(process.env.WECHAT_COCOS_ASSETDB_WARM_TIMEOUT_MS) || 110000);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function readResult(resultPath) {
    try {
        return JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    } catch (_) {
        return null;
    }
}

function writeWarmupRequest(resultPath) {
    const requestPath = path.join(projectDir, 'temp', warmupRequestFileName);
    writeJsonAtomically(requestPath, {
        version: 1,
        createdAtMs: Date.now(),
        resultPath: path.resolve(resultPath),
        projectPath: projectDir,
        nodePath: process.execPath,
        metaRepairScript: path.join(projectDir, 'scripts', 'repair-cocos-meta.js'),
        forceRefresh: process.env.PDD_COCOS_ASSETDB_FORCE_REFRESH === '1',
        timeoutMs,
    });
    return requestPath;
}

function assertHealthyWarmResult(result) {
    if (!result || result.done !== true || result.assetDbReady !== true) {
        const detail = result && result.error ? result.error : 'AssetDB warmup did not finish';
        throw new Error(detail);
    }
    if (Number(result.sceneCount) <= 0 || Number(result.scriptCount) <= 0) {
        throw new Error(
            'AssetDB inventory is empty: scenes=' + Number(result.sceneCount || 0)
            + ', scripts=' + Number(result.scriptCount || 0),
        );
    }
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

function parseProcessTable(text) {
    return String(text || '').split(/\r?\n/).map((line) => {
        const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
        return match ? { pid: Number(match[1]), ppid: Number(match[2]) } : null;
    }).filter(Boolean);
}

function collectDescendantPids(rootPid) {
    if (process.platform === 'win32') return [];
    const result = spawnSync('ps', ['-axo', 'pid=,ppid='], {
        encoding: 'utf8',
        shell: false,
    });
    if (result.error || result.status !== 0) {
        throw result.error || new Error('无法读取 Cocos 子进程列表: status=' + result.status);
    }
    const childrenByParent = new Map();
    for (const entry of parseProcessTable(result.stdout)) {
        if (!childrenByParent.has(entry.ppid)) childrenByParent.set(entry.ppid, []);
        childrenByParent.get(entry.ppid).push(entry.pid);
    }
    const descendants = [];
    const pending = [...(childrenByParent.get(rootPid) || [])];
    while (pending.length > 0) {
        const pid = pending.shift();
        descendants.push(pid);
        pending.push(...(childrenByParent.get(pid) || []));
    }
    return descendants;
}

function isPidRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error && error.code === 'EPERM';
    }
}

async function waitForPidsExit(pids, waitMs) {
    const deadline = Date.now() + waitMs;
    let running = pids.filter(isPidRunning);
    while (running.length > 0 && Date.now() < deadline) {
        await sleep(250);
        running = running.filter(isPidRunning);
    }
    if (running.length > 0) {
        throw new Error('本次预热的 Cocos 子进程未完全退出: ' + running.join(', '));
    }
}

async function stopEditor(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const ownedPids = [child.pid, ...collectDescendantPids(child.pid)];
    child.kill('SIGTERM');
    if (!await waitForChildExit(child, 8000)) {
        child.kill('SIGKILL');
        if (!await waitForChildExit(child, 5000)) {
            throw new Error('无法关闭本次构建启动的 Cocos Creator 进程 pid=' + child.pid);
        }
    }
    await waitForPidsExit(ownedPids, 15000);
    await sleep(processExitSettleMs);
}

async function launchWarmEditor(resultPath) {
    const cocosCli = buildCommon.resolveCocosCli();
    if (!cocosCli || !fs.existsSync(cocosCli)) {
        throw new Error('Cocos Creator CLI 不存在，请安装 Cocos Creator 3.8.8，或用 COCOS_CLI 指定路径');
    }
    fs.rmSync(resultPath, { force: true });
    fs.rmSync(resultPath + '.tmp', { force: true });
    const requestPath = writeWarmupRequest(resultPath);

    let child;
    try {
        child = spawn(cocosCli, ['--project', projectDir], {
            cwd: projectDir,
            env: {
                ...process.env,
                PDD_COCOS_ASSETDB_WARM_MONITOR_FILE: resultPath,
                PDD_COCOS_NODE_PATH: process.execPath,
                PDD_COCOS_META_REPAIR_SCRIPT: path.join(projectDir, 'scripts', 'repair-cocos-meta.js'),
                PDD_COCOS_PROJECT_DIR: projectDir,
            },
            stdio: 'inherit',
            shell: false,
        });
    } catch (error) {
        fs.rmSync(requestPath, { force: true });
        throw error;
    }
    let spawnError = null;
    child.once('error', (error) => {
        spawnError = error;
    });

    let primaryError = null;
    let result = null;
    try {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (spawnError) throw spawnError;
            result = readResult(resultPath);
            if (result && result.done === true) {
                assertHealthyWarmResult(result);
                break;
            }
            if (result && result.error) throw new Error(result.error);
            if (child.exitCode !== null || child.signalCode !== null) {
                throw new Error(
                    'Cocos Creator 在 AssetDB 预热完成前退出: status=' + child.exitCode
                    + ', signal=' + (child.signalCode || ''),
                );
            }
            await sleep(pollIntervalMs);
        }
        if (!result || result.done !== true) {
            throw new Error('等待正常编辑器 AssetDB 恢复超时: ' + timeoutMs + 'ms');
        }
        await sleep(cacheSettleMs);
    } catch (error) {
        primaryError = error;
    }

    if (primaryError) {
        try {
            await stopEditor(child);
        } catch (_) {
            // Preserve the inventory failure as the primary diagnostic.
        }
        fs.rmSync(requestPath, { force: true });
        throw primaryError;
    }
    fs.rmSync(requestPath, { force: true });
    return { child, result };
}

async function runWarmup(resultPath) {
    const session = await launchWarmEditor(resultPath);
    try {
        return session.result;
    } finally {
        await stopEditor(session.child);
    }
}

function writeJsonAtomically(targetPath, value) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tempPath = targetPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(tempPath, targetPath);
}

function waitForTerminationSignal() {
    return new Promise((resolve) => {
        const finish = (signal) => {
            process.removeListener('SIGTERM', onSigterm);
            process.removeListener('SIGINT', onSigint);
            resolve(signal);
        };
        const onSigterm = () => finish('SIGTERM');
        const onSigint = () => finish('SIGINT');
        process.once('SIGTERM', onSigterm);
        process.once('SIGINT', onSigint);
    });
}

async function holdWarmEditor(readyPath, resultPath) {
    fs.rmSync(readyPath, { force: true });
    fs.rmSync(readyPath + '.tmp', { force: true });
    const session = await launchWarmEditor(resultPath);
    try {
        writeJsonAtomically(readyPath, {
            ready: true,
            editorPid: session.child.pid,
            sceneCount: session.result.sceneCount,
            scriptCount: session.result.scriptCount,
        });
        console.log(
            'Cocos AssetDB editor held for build: scenes=' + session.result.sceneCount
            + ', scripts=' + session.result.scriptCount,
        );
        await waitForTerminationSignal();
    } finally {
        await stopEditor(session.child);
    }
}

async function main() {
    if (process.argv[2] === '--hold') {
        const readyPath = process.argv[3] ? path.resolve(process.argv[3]) : defaultResultPath + '.held';
        const resultPath = process.argv[4] ? path.resolve(process.argv[4]) : defaultResultPath;
        console.log('Launching normal Cocos editor and holding AssetDB through the batch build...');
        await holdWarmEditor(readyPath, resultPath);
        return;
    }
    const resultPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultResultPath;
    console.log('Launching normal Cocos editor to warm AssetDB inventory...');
    const result = await runWarmup(resultPath);
    console.log(
        'Cocos AssetDB warmup ready: scenes=' + result.sceneCount
        + ', scripts=' + result.scriptCount
        + ', attempts=' + result.attempts,
    );
}

if (require.main === module) {
    main().catch((error) => {
        console.error('ERROR: Cocos AssetDB warmup failed: ' + (error && error.message ? error.message : String(error)));
        process.exitCode = 1;
    });
}

module.exports = {
    assertHealthyWarmResult,
    collectDescendantPids,
    holdWarmEditor,
    launchWarmEditor,
    parseProcessTable,
    readResult,
    runWarmup,
    stopEditor,
    warmupRequestFileName,
    writeWarmupRequest,
};
