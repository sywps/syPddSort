'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const pollIntervalMs = 1000;
const activationPollIntervalMs = 250;
const activationWaitTimeoutMs = 30000;
const warmupRequestFileName = 'pdd-assetdb-warm-request.json';
const timeoutMs = Math.max(
    30000,
    Number(process.env.WECHAT_COCOS_ASSETDB_WARM_TIMEOUT_MS) || 110000,
);
const importedAssetContracts = [
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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeResult(filePath, result) {
    if (!filePath) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(result, null, 2) + '\n');
    fs.renameSync(tempPath, filePath);
}

function readWarmupRequest(projectPath) {
    if (!projectPath) return null;
    const resolvedProjectPath = path.resolve(projectPath);
    const requestPath = path.join(resolvedProjectPath, 'temp', warmupRequestFileName);
    if (!fs.existsSync(requestPath)) return null;
    let request;
    try {
        request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
    } finally {
        fs.rmSync(requestPath, { force: true });
    }
    const requestTimeoutMs = Math.max(30000, Number(request && request.timeoutMs) || timeoutMs);
    const createdAtMs = Number(request && request.createdAtMs) || 0;
    if (
        !request
        || request.version !== 1
        || path.resolve(String(request.projectPath || '')) !== resolvedProjectPath
        || !path.isAbsolute(String(request.resultPath || ''))
        || !path.isAbsolute(String(request.nodePath || ''))
        || !path.isAbsolute(String(request.metaRepairScript || ''))
        || createdAtMs <= 0
        || Math.abs(Date.now() - createdAtMs) > requestTimeoutMs + 60000
    ) {
        return null;
    }
    return {
        source: 'request',
        resultPath: path.resolve(request.resultPath),
        projectPath: resolvedProjectPath,
        nodePath: path.resolve(request.nodePath),
        metaRepairScript: path.resolve(request.metaRepairScript),
        forceRefresh: request.forceRefresh === true,
        timeoutMs: requestTimeoutMs,
    };
}

function resolveWarmupActivation() {
    const editorProjectPath = typeof Editor !== 'undefined' && Editor.Project
        ? String(Editor.Project.path || '')
        : '';
    const envResultPath = process.env.PDD_COCOS_ASSETDB_WARM_MONITOR_FILE || '';
    if (envResultPath) {
        const projectPath = process.env.PDD_COCOS_PROJECT_DIR || editorProjectPath;
        const nodePath = process.env.PDD_COCOS_NODE_PATH || '';
        const metaRepairScript = process.env.PDD_COCOS_META_REPAIR_SCRIPT || '';
        return {
            source: 'env',
            resultPath: path.resolve(envResultPath),
            projectPath: projectPath ? path.resolve(projectPath) : '',
            nodePath: nodePath ? path.resolve(nodePath) : '',
            metaRepairScript: metaRepairScript ? path.resolve(metaRepairScript) : '',
            forceRefresh: process.env.PDD_COCOS_ASSETDB_FORCE_REFRESH === '1',
            timeoutMs,
        };
    }
    return readWarmupRequest(editorProjectPath);
}

async function waitForWarmupActivation(options = {}) {
    const resolveActivation = options.resolveActivation || resolveWarmupActivation;
    const now = options.now || Date.now;
    const wait = options.sleep || sleep;
    const waitTimeoutMs = options.timeoutMs === undefined
        ? activationWaitTimeoutMs
        : Math.max(0, Number(options.timeoutMs));
    const waitIntervalMs = options.intervalMs === undefined
        ? activationPollIntervalMs
        : Math.max(1, Number(options.intervalMs));
    const startedAt = now();
    while (true) {
        const activation = resolveActivation();
        if (activation) return activation;
        const elapsedMs = now() - startedAt;
        if (elapsedMs >= waitTimeoutMs) return null;
        await wait(Math.min(waitIntervalMs, waitTimeoutMs - elapsedMs));
    }
}

function logWarmupActivation(activation, logger = console.log) {
    const consumedText = activation.source === 'request' ? ', request consumed' : '';
    logger('PDD AssetDB warmup activation started: source=' + activation.source + consumedText);
}

async function requestReady() {
    try {
        return await Editor.Message.request('asset-db', 'query-ready') === true;
    } catch (_) {
        return false;
    }
}

async function queryCounts() {
    const [scenes, scripts] = await Promise.all([
        Editor.Message.request('asset-db', 'query-assets', { ccType: 'cc.SceneAsset' }),
        Editor.Message.request('asset-db', 'query-assets', { ccType: 'cc.Script' }),
    ]);
    return {
        sceneCount: Array.isArray(scenes) ? scenes.length : 0,
        scriptCount: Array.isArray(scripts) ? scripts.length : 0,
    };
}

function repairMetaFiles(activation) {
    const nodePath = activation.nodePath || '';
    const scriptPath = activation.metaRepairScript || '';
    const projectPath = activation.projectPath || '';
    if (!nodePath || !scriptPath || !projectPath) {
        throw new Error('normal editor warmup is missing its meta-repair environment');
    }
    const result = spawnSync(nodePath, [scriptPath, 'assets'], {
        cwd: projectPath,
        env: process.env,
        encoding: 'utf8',
        shell: false,
    });
    if (result.error || result.status !== 0) {
        const detail = result.error?.message || String(result.stderr || result.stdout || '').trim() || 'status=' + result.status;
        throw new Error('meta repair failed before AssetDB refresh: ' + detail);
    }
}

function importedAssetContractsReady(projectPath) {
    if (!projectPath) return false;
    for (const contract of importedAssetContracts) {
        const metaPath = path.join(projectPath, 'assets', contract.relativePath + '.meta');
        if (!fs.existsSync(metaPath)) return false;
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        const uuid = meta && typeof meta.uuid === 'string' ? meta.uuid : '';
        if (!uuid) return false;
        const libraryPath = path.join(projectPath, 'library', uuid.slice(0, 2), uuid + '.json');
        if (!fs.existsSync(libraryPath)) return false;
        const content = fs.readFileSync(libraryPath, 'utf8');
        if (contract.requiredTexts.some((text) => !content.includes(text))) return false;
    }
    return true;
}

async function monitor(activation) {
    const resultPath = activation.resultPath;
    const monitorTimeoutMs = Math.max(30000, Number(activation.timeoutMs) || timeoutMs);
    const recoveryRefreshDelayMs = Math.min(120000, Math.max(30000, Math.floor(monitorTimeoutMs / 2)));
    const startedAt = Date.now();
    let attempts = 0;
    let lastError = '';
    let healthyCountStreak = 0;
    let forcedRefreshPending = activation.forceRefresh === true;
    let refreshAttempted = false;
    while (Date.now() - startedAt < monitorTimeoutMs) {
        attempts += 1;
        const assetDbReady = await requestReady();
        if (assetDbReady) {
            try {
                const counts = await queryCounts();
                const hasInventory = counts.sceneCount > 0 && counts.scriptCount > 0;
                const assetContractsReady = hasInventory && importedAssetContractsReady(activation.projectPath);
                const recoveryDelayElapsed = Date.now() - startedAt >= recoveryRefreshDelayMs;
                const shouldRefresh = !refreshAttempted && (
                    (forcedRefreshPending && assetContractsReady)
                    || (!assetContractsReady && recoveryDelayElapsed)
                );
                if (shouldRefresh) {
                    repairMetaFiles(activation);
                    await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
                    forcedRefreshPending = false;
                    refreshAttempted = true;
                    healthyCountStreak = 0;
                } else {
                    const forcedRefreshSatisfied = !forcedRefreshPending || refreshAttempted;
                    healthyCountStreak = assetContractsReady && forcedRefreshSatisfied
                        ? healthyCountStreak + 1
                        : 0;
                }
                const result = {
                    done: healthyCountStreak >= 3,
                    assetDbReady,
                    attempts,
                    sceneCount: counts.sceneCount,
                    scriptCount: counts.scriptCount,
                    assetContractsReady,
                    error: '',
                };
                writeResult(resultPath, result);
                if (result.done) return;
            } catch (error) {
                lastError = error && error.message ? error.message : String(error);
            }
        }
        await sleep(pollIntervalMs);
    }
    writeResult(resultPath, {
        done: false,
        assetDbReady: await requestReady(),
        attempts,
        sceneCount: 0,
        scriptCount: 0,
        error: lastError || 'normal editor AssetDB inventory did not recover before timeout',
    });
}

async function startWarmup() {
    let activation;
    try {
        activation = await waitForWarmupActivation();
    } catch (error) {
        console.error('PDD AssetDB warmup activation failed: ' + (error && error.message ? error.message : String(error)));
        return;
    }
    if (!activation) return;
    logWarmupActivation(activation);
    try {
        await monitor(activation);
    } catch (error) {
        writeResult(activation.resultPath, {
            done: false,
            assetDbReady: false,
            attempts: 0,
            sceneCount: 0,
            scriptCount: 0,
            error: error && error.message ? error.message : String(error),
        });
    }
}

function load() {
    setTimeout(() => {
        startWarmup();
    }, 0);
}

function unload() {}

module.exports = {
    activationPollIntervalMs,
    activationWaitTimeoutMs,
    load,
    logWarmupActivation,
    readWarmupRequest,
    resolveWarmupActivation,
    unload,
    waitForWarmupActivation,
    warmupRequestFileName,
};
