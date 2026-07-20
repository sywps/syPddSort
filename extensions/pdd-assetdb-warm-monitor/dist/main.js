'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const pollIntervalMs = 1000;
const refreshIntervalMs = 5000;
const timeoutMs = 90000;
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

function repairMetaFiles() {
    const nodePath = process.env.PDD_COCOS_NODE_PATH || '';
    const scriptPath = process.env.PDD_COCOS_META_REPAIR_SCRIPT || '';
    const projectPath = process.env.PDD_COCOS_PROJECT_DIR || '';
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

function importedAssetContractsReady() {
    const projectPath = process.env.PDD_COCOS_PROJECT_DIR || '';
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

async function monitor(resultPath) {
    const startedAt = Date.now();
    let attempts = 0;
    let lastRefreshAt = 0;
    let lastError = '';
    let healthyCountStreak = 0;
    let forcedRefreshPending = process.env.PDD_COCOS_ASSETDB_FORCE_REFRESH === '1';
    while (Date.now() - startedAt < timeoutMs) {
        attempts += 1;
        const assetDbReady = await requestReady();
        if (assetDbReady) {
            try {
                const counts = await queryCounts();
                const hasInventory = counts.sceneCount > 0 && counts.scriptCount > 0;
                const assetContractsReady = hasInventory && importedAssetContractsReady();
                healthyCountStreak = assetContractsReady ? healthyCountStreak + 1 : 0;
                if ((forcedRefreshPending || !assetContractsReady) && Date.now() - lastRefreshAt >= refreshIntervalMs) {
                    repairMetaFiles();
                    await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets');
                    forcedRefreshPending = false;
                    healthyCountStreak = 0;
                    lastRefreshAt = Date.now();
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

function load() {
    const resultPath = process.env.PDD_COCOS_ASSETDB_WARM_MONITOR_FILE || '';
    if (!resultPath) return;
    setTimeout(() => {
        monitor(resultPath).catch((error) => {
            writeResult(resultPath, {
                done: false,
                assetDbReady: false,
                attempts: 0,
                sceneCount: 0,
                scriptCount: 0,
                error: error && error.message ? error.message : String(error),
            });
        });
    }, 0);
}

function unload() {}

module.exports = { load, unload };
