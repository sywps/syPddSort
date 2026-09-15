'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const config = require('../cloudfunctions/coopService/runtime/CoopModeConfig');
const replay = require('../cloudfunctions/coopService/runtime/PvpHumanReplay');
const { BoardModel } = require('../cloudfunctions/coopService/runtime/BoardModel');
const full = require('../assets/LevelData/coop_level_7.json');
const local = new Map();
const sys = { localStorage: { getItem: key => local.get(key) ?? null,
    setItem: (key, value) => local.set(key, value), removeItem: key => local.delete(key) } };
const noop = () => {};
const shared = { BoardModel, AnalyticsMgr: { inst: { finalizePendingFailedLevel: noop, setLevelContext: noop } },
    AudioMgr: { inst: { init: noop, preload: noop } } };
let app, mgr;
function load(file) {
    const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core', file), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    } }).outputText;
    const loaded = { exports: {} };
    new Function('module', 'exports', 'require', code)(loaded, loaded.exports, id => {
        if (id === 'cc') return { sys };
        if (id.endsWith('/AppRoot')) return { AppRoot: { tryGet: () => app } };
        if (id.endsWith('/CoopServiceMgr')) return { CoopServiceMgr: { get inst() { return mgr; } } };
        if (id.endsWith('/CoopModeConfig')) return config;
        if (id.endsWith('/CoopBrowserRuntime')) return load('CoopBrowserRuntime.ts');
        if (id.endsWith('/CoopBrowserStore')) return load('CoopBrowserStore.ts');
        if (id.endsWith('/BrowserLevelPreview')) return { getBrowserLevelPreview: () => ({ active: false }) };
        if (id.endsWith('/LevelDataCdnService')) return { LevelDataCdnService: { inst: { getLevelAnalyticsMetadata: () => ({}) } } };
        if (id.endsWith('/GameplayJudgmentFeedbackModule')) return { GAMEPLAY_JUDGMENT_PRELOAD_SFX_NAMES: [] };
        if (id.endsWith('/PvpHumanReplay')) return replay;
        if (id.endsWith('/GameCtrlShared')) return shared;
        if (id.endsWith('/LevelConfig')) return require('../cloudfunctions/coopService/runtime/LevelConfig');
        if (id.endsWith('/WorkbenchPreviewService')) return { isWorkbenchPreviewRequested: () => false };
        if (id.endsWith('/HardLevelIntroController')) return { ensureHardLevelIntroController: () => ({ stop: noop, play: noop }) };
        if (id.endsWith('/PchConveyorGameplayController')) return { ensurePchConveyorGameplayController: () => ({ stop: noop, start: noop }) };
        if (['PlatformCloudMgr', 'MiniGamePlatform', 'RemoteDataCdnClient', 'WeChatShareReturnService', 'UserMgr',
            'CoopPanelController', 'PixelPosterPreviewRenderer', 'CompletedPatternPreview', 'BoardSlotBatchRenderer', 'RuntimeLog', 'LevelExperimentService',
            'DebugPerfTrace', 'AnalyticsMgr', 'StartupTrace'].some(name => id.endsWith('/' + name))) return {};
        throw new Error(`Unexpected dependency ${id}`);
    });
    return loaded.exports;
}
const { AppSession } = load('AppSession.ts');
const { CoopServiceMgr } = load('CoopServiceMgr.ts');
const { GameplaySessionController } = load('GameplaySessionController.ts');
const { installCoopModeModule } = load('GameCtrlModules/CoopModeModule.ts');
const { installSettlementHudModule } = load('GameCtrlModules/SettlementHudModule.ts');

async function main() {
    for (const role of ['creator', 'collaborator']) {
        const session = new AppSession();
        app = { session, markGameRequested: (...args) => session.markPendingGameplayRequest(...args),
            markGameActive: (...args) => session.markActiveGameplayContext(...args) };
        mgr = new CoopServiceMgr();
        mgr.fullLevel = async () => full;
        const post = { id: `post-${role}`, levelId: 7, levelHash: config.coopLevelHash(full) };
        const run = { id: `run-${role}`, role, status: 'playing', version: 0 };
        await mgr.prepare({}, post, run);
        app.markGameRequested(7, 'zt_level_', 'theme', 'none', config.COOP_ROUTE_REASON);
        app.markGameActive(7, 'zt_level_', 'theme');
        assert.equal(session.pendingGameplayRequest, null, 'first entry consumed its route request');
        const initialBoard = JSON.stringify(mgr.active.replay.board.currentColors);
        mgr.active.replay.apply([1, 5, 0]);
        mgr.active.events.push([1, 5, 0]);
        mgr.active.elapsedMs = 80000;
        const oldReplay = mgr.active.replay;
        const runtime = { _isThemeLevel: true, _currentThemeLevelId: 7, levelData: mgr.active.half,
            isGameEnd: true, _activeLoseReason: 'buffer-full', _coopTerminal: true,
            panelLose: { active: true }, errors: [], renders: 0,
            showToast(message) { this.errors.push(message); },
            stopPulseTweens: noop, clearDragNodes: noop, unschedule: noop, unscheduleAllCallbacks: noop,
            clearGuideReminderTimer: noop, hideGuideReminderVisuals: noop, clearGuideHighlight: noop,
            clearForcedSkillHiddenState: noop, clearSelectionOverlay: noop, clearIdleHint: noop,
            clearEndgameHints: noop, detachGameplayInputHandlers: noop, assertGameplayVisualReadiness: noop,
            buildUI() { this.panelLose.active = false; },
            renderBoard() { this.renders++; assert(this.isCoopMode(), 'board rendering must retain co-op mode'); },
            startGameplayWithBackgroundSkinReady(_data, _id, init) { init(); },
        };
        installSettlementHudModule(runtime);
        installCoopModeModule(runtime);
        const controller = new GameplaySessionController(runtime);
        controller.failGameplayInitialization = noop;
        runtime.initGame = (...args) => controller.initGame(...args);
        for (let attempt = 0; attempt < 2; attempt++) {
            runtime.restart();
            for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));
            assert.deepEqual(runtime.errors, []);
            assert.equal(runtime.renders, attempt + 1);
            assert.equal(session.activeGameplayContext.routeReason, config.COOP_ROUTE_REASON);
            assert.equal(session.activeGameplayContext.activeLevelId, post.levelId);
            assert.equal(session.pendingGameplayRequest, null);
            assert.equal(mgr.active.post, post);
            assert.equal(mgr.active.run, run);
            assert.notEqual(mgr.active.replay, oldReplay);
            assert.equal(runtime.boardModel, mgr.active.replay.board);
            assert.equal(runtime._coopReplayResumeState, mgr.active.replay);
            assert.equal(JSON.stringify(runtime.boardModel.currentColors), initialBoard);
            assert.deepEqual(mgr.active.events, [[0, 0, 1]]);
            assert.equal(mgr.active.elapsedMs, 0);
            assert.equal(runtime._currentLevelUnlimitedTime, true);
            assert.equal(runtime.timeRemain, 0);
            assert.equal(runtime.isGameEnd, false);
            assert.equal(runtime.panelLose.active, false);
            assert.equal(runtime._coopTerminal, false);
            runtime.isGameEnd = true; runtime.panelLose.active = true;
        }
        const beforeFailure = runtime.renders;
        mgr.fullLevel = async () => { throw new Error('关卡读取失败'); };
        await runtime.restartCoop();
        assert.equal(runtime.renders, beforeFailure, 'failed preparation must not restart a different game');
        assert.equal(runtime.panelLose.active, true, 'failed preparation keeps restart controls available');
        assert.equal(runtime.errors.at(-1), '暂时无法开始，请稍后再试');
        assert.equal(runtime._coopRestarting, false);
        app.markGameRequested(7, 'zt_level_', 'theme');
        app.markGameActive(7, 'zt_level_', 'theme');
        assert.equal(runtime.isCoopMode(), false, 'an explicit ordinary route clears co-op mode');
    }
    console.log('COOP_RESTART_TESTS_PASSED: real restart, prepare, initialization and session routing for both roles');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
