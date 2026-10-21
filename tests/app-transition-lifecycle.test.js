const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/AppTransitionController.ts'),
    'utf8',
);

class Component {}
class BlockInputEvents {
    constructor() {
        this.enabled = true;
    }
}
class Camera {}
Camera.ClearFlag = { DEPTH_ONLY: 2 };
class Canvas {
    constructor(camera) {
        this.cameraComponent = camera;
    }
}
class Mask {}
class UITransform {
    setContentSize(width, height) {
        this.width = width;
        this.height = height;
    }
}
class Node {
    setPosition(x, y, z) { this.position = { x, y, z }; }
    setScale(x, y, z) { this.scale = { x, y, z }; }
    constructor(name) {
        this.name = name;
        this.active = true;
        this.children = [];
        this.components = new Map();
        this.isValid = true;
    }
    getChildByName(name) {
        return this.children.find((child) => child.name === name) || null;
    }
    getComponent(Type) {
        return this.components.get(Type) || null;
    }
    addComponent(Type) {
        const component = new Type();
        component.node = this;
        this.components.set(Type, component);
        return component;
    }
}

const events = new EventEmitter();
const director = {
    once(event, callback) { events.once(event, callback); },
    off(event, callback) { events.off(event, callback); },
};
const viewListeners = new Map();
const view = {
    getVisibleSize() { return { width: 720, height: 1280 }; },
    on(event, callback) { viewListeners.set(event, callback); },
    off(event, callback) {
        if (viewListeners.get(event) === callback) viewListeners.delete(event);
    },
};
const cc = {
    _decorator: { ccclass: () => (Type) => Type },
    BlockInputEvents,
    Camera,
    Canvas,
    Component,
    Director: { EVENT_AFTER_DRAW: 'after-draw' },
    director,
    Mask,
    Node,
    UITransform,
    view,
};

const output = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        experimentalDecorators: true,
    },
}).outputText;
const moduleUnderTest = { exports: {} };
vm.runInNewContext(output, {
    module: moduleUnderTest,
    exports: moduleUnderTest.exports,
    require(id) {
        if (id === 'cc') return cc;
        if (id === './AppSession') return {};
        throw new Error(`unmocked import: ${id}`);
    },
    console,
});
const { AppTransitionController } = moduleUnderTest.exports;

function makeController() {
    const camera = new Camera();
    const rootNode = new Node('AppTransition');
    rootNode.components.set(UITransform, new UITransform());
    rootNode.components.set(Canvas, new Canvas(camera));
    rootNode.components.set(BlockInputEvents, new BlockInputEvents());
    const cameraNode = new Node('Camera');
    const irisMaskNode = new Node('IrisMask');
    const contentNode = new Node('Content');
    const backgroundNode = new Node('Background');
    const patternNode = new Node('Pattern');
    const patternUI = new UITransform();
    patternUI.node = patternNode;
    patternNode.components.set(UITransform, patternUI);
    contentNode.children.push(patternNode);
    cameraNode.components.set(UITransform, new UITransform());
    irisMaskNode.components.set(UITransform, new UITransform());
    irisMaskNode.components.set(Mask, new Mask());
    contentNode.components.set(UITransform, new UITransform());
    backgroundNode.components.set(UITransform, new UITransform());
    contentNode.children.push(backgroundNode);
    irisMaskNode.children.push(contentNode);
    rootNode.children.push(cameraNode, irisMaskNode);
    const controller = new AppTransitionController();
    controller.node = rootNode;
    controller.initialize();
    return {
        controller,
        rootNode,
        blocker: rootNode.getComponent(BlockInputEvents),
        camera,
        irisMask: irisMaskNode.getComponent(UITransform),
        background: backgroundNode.getComponent(UITransform),
        pattern: patternUI,
    };
}

async function flushPromises() {
    await new Promise((resolve) => setImmediate(resolve));
}

// Run real AppRoot and runtime entry methods against the same frame-driven controller.
async function verifyGameplayEntries(fixture) {
    const { controller, rootNode, blocker } = fixture;
    const errors = [];
    const shared = {
        AudioMgr: { inst: { init() {} } },
        AnalyticsMgr: { inst: { finalizePendingFailedLevel() {}, trackLevelExitIntent() {}, trackFunnelEvent() {},
            settlement: { action: () => 'attempt', transition() {}, gate() {}, finish() {}, failTransition() {} } } },
        mapLogicalToPhysicalLevelId: id => id,
    };
    let AppRoot;
    const dependencies = {
        cc,
        './AppSession': { AppSession: class {} },
        './SceneRouter': { SceneRouter: class {} },
        './StartupLoadingController': {},
        './AppTransitionController': { AppTransitionController },
        '../GameCtrlShared': shared, './GameCtrlShared': shared,
        '../HomeIconIdleWiggle': {}, '../LevelDataCdnService': {},
        '../WeChatLevelPreparation': {},
        '../Panels/GameCirclePanelController': {}, '../RemoteDataCdnClient': {},
        '../WorkbenchPreviewService': { isWorkbenchPreviewRequested: () => false },
        './WorkbenchPreviewService': { isWorkbenchPreviewRequested: () => false },
        '../MiniGamePlatform': { isMiniGameRuntime: () => false }, './MiniGamePlatform': { isMiniGameRuntime: () => false },
        '../RuntimeLog': {}, '../PixelPosterPreviewRenderer': {}, '../LevelExperimentService': {},
        '../StartupTrace': {}, './StartupTrace': {},
        '../DebugPerfTrace': {},
        './DebugPerfTrace': { debugPerfSnapshot() {} },
        './RuntimeLog': {}, './StartupRouteService': {},
        './Panels/FeedbackPanelController': {},
        '../PatternCompleteWaveFx': {},
        '../BrowserLevelPreview': { getBrowserLevelPreview: () => ({ active: false }) },
        '../ChapterRewardView': {},
        '../CompletedPatternPreview': {},
        '../RuntimeAssetRelease': {},
        '../FirstLevelContent': {},
        './BrowserLevelPreview': { getBrowserLevelPreview: () => ({ active: false }) },
        './HardLevelIntroController': { ensureHardLevelIntroController: () => ({ stop() {} }) },
        './PchConveyorGameplayController': { ensurePchConveyorGameplayController: () => ({ stop() {} }) },
        './LevelExperimentService': {}, './LevelConfig': {},
        './AnalyticsMgr': {}, './LevelDataCdnService': {},
        './GameCtrlModules/GameplayJudgmentFeedbackModule': {},
        './StartupCloudRestoreHelper': {},
        '../../Platform/WeChatShareReturnService': {},
        '../../Platform/Douyin/DouyinLeaderboardService': {},
        '../../Platform/Douyin/DouyinShareService': {},
        '../GameplayVoiceController': { ensureGameplayVoiceController: () => ({ stopVoice() {}, beginLevel() {} }) },
        '../AnalyticsMgr': shared,
        '../CreatorWeb': { isCreatorWeb: () => false, getCreatorWebConfig: () => null },
        './GameplayVoiceController': { ensureGameplayVoiceController: () => ({ stopVoice() {}, beginLevel() {} }) },
        './Panels/GameplayHelpAnimation': {},
    };
    dependencies['./StartupTrace'] = { markStartupTrace() {}, flushStartupTrace() {} };
    function load(relativePath) {
        const compiled = ts.transpileModule(fs.readFileSync(path.join(root, 'assets/Scripts/Core', relativePath), 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
        }).outputText;
        const module = { exports: {} };
        vm.runInNewContext(compiled, {
            module, exports: module.exports,
            console: { error: (...args) => errors.push(args), warn() {}, log() {} },
            require(id) {
                if (id === '../AppRoot' || id === './AppRoot') return { AppRoot };
                assert.ok(Object.hasOwn(dependencies, id), `missing test dependency ${id}`);
                return dependencies[id];
            },
        }, { filename: relativePath });
        return module.exports;
    }
    ({ AppRoot } = load('AppRoot.ts'));
    const app = new AppRoot();
    app.node = { isValid: true };
    app.appTransition = controller;
    app.ensureAppTransition = async () => controller;
    app.router.logTransitionTrace = () => {};
    AppRoot._instance = app;
    const sceneEntry = load('GameCtrlModules/SceneHomeEntryModule.ts');
    const settlement = load('GameCtrlModules/SettlementHudModule.ts');
    const theme = load('GameCtrlModules/ThemeLoadingOverlayModule.ts');
    const firstLevel = load('GameCtrlModules/FirstLevelRouteModule.ts');
    const { GameSceneRuntimeController } = load('GameSceneRuntimeController.ts');
    const { GameplaySessionController } = load('GameplaySessionController.ts');
    const fx = load('GameCtrlModules/GameplayColorCompleteFxModule.ts');
    function runtime() {
        const r = { isValid: true };
        sceneEntry.installSceneHomeEntryModule(r);
        settlement.installSettlementHudModule(r);
        theme.installThemeLoadingOverlayModule(r);
        Object.assign(r, {
            levelData: { levelId: 1 }, _gameplayInitSeq: 1,
            getRuntimeSceneName: () => 'Game', getActiveLogicalLevelId: () => 1,
            costVigorForLevel: () => true,
            isTutorialVigorFreeLevel: (id, mode) => mode === 'main' && id <= 2,
            deactivateMainMenuNode() {}, saveLevelProgress() {},
            unschedule() {}, unscheduleAllCallbacks() {}, stopPulseTweens() {}, clearDragNodes() {},
            setWinPrimaryButtonInteractable() {}, refreshWinAdBonusUI() {},
            setGameplayStartupRootVisible() {}, hideLoadingOverlay() {},
            showRemoteLoadFatalError(_path, code) { r.fatal = code; },
            loadLevel(id) { r.loaded = id; },
            initGame() { r.initialized = true; },
        });
        return r;
    }
    async function cover() {
        await flushPromises();
        assert.equal(blocker.enabled, true);
        controller.update(0.32);
        await flushPromises();
    }
    async function finish(r, success = true) {
        const pending = r._gameplayTransitionPromise;
        app.completeAppTransitionAfterDraw('Game');
        events.emit('after-draw');
        controller.update(0.34);
        assert.equal(await pending, success);
        assert.equal(rootNode.active, false);
        assert.equal(blocker.enabled, false);
    }
    for (const entry of ['tutorial', 'next', 'restart', 'theme']) {
        const r = runtime();
        if (entry === 'tutorial') r.continueTutorialToSlotIntro(2);
        if (entry === 'next') r.goNextLevel();
        if (entry === 'restart') r.restart();
        if (entry === 'theme') r.startThemeLevel(8);
        assert.equal(r.loaded, undefined, `${entry} must wait for full cover`);
        assert.equal(r.initialized, undefined);
        r.costVigorForLevel = () => { throw new Error('duplicate entry must not spend vigor'); };
        if (entry === 'next') r.goNextLevel();
        if (entry === 'restart') r.restart();
        if (entry === 'theme') assert.equal(r.startThemeLevel(8), false);
        await flushPromises();
        assert.equal(app.completeAppTransitionAfterDraw('Game'), false, 'old round ready during covering is ignored');
        await cover();
        if (entry === 'restart') assert.equal(r.initialized, true);
        else assert.equal(r.loaded, entry === 'theme' ? 8 : 2);
        controller.update(5);
        assert.equal(rootNode.active, true, 'no fixed delay may reveal a level before ready');
        await finish(r);
    }
    for (const entry of ['next', 'restart', 'theme']) {
        for (const outcome of ['cancelled', 'granted']) {
            const r = runtime();
            let grant;
            let vigor = false;
            r.costVigorForLevel = () => vigor;
            r.showNoLivesAdModal = options => { grant = options.onResult; };
            if (entry === 'next') r.goNextLevel();
            if (entry === 'restart') r.restart();
            if (entry === 'theme') r.startThemeLevel(8);
            await flushPromises();
            assert.equal(rootNode.active, false, 'advertising stays outside the transition');
            vigor = outcome === 'granted';
            grant({ status: outcome });
            if (!vigor) {
                await flushPromises();
                assert.equal(rootNode.active, false);
                assert.equal(r.loaded, undefined);
                continue;
            }
            await cover();
            await finish(r);
        }
    }
    const joinedRuntime = runtime();
    const request = joinedRuntime.requestLevelTransition(3);
    assert.equal(joinedRuntime.requestLevelTransition(3), request, 'double request shares pending prefab/transaction');
    assert.equal(await joinedRuntime.requestLevelTransition(4), false, 'conflicting level cannot replace the first request');
    await cover();
    assert.equal(joinedRuntime.loaded, 3);
    await finish(joinedRuntime);

    for (const failure of ['local', 'remote', 'sync', 'ready-then-error', 'gameplay-init', 'fx-prewarm']) {
        const r = runtime();
        if (failure === 'sync') r.loadLevel = () => { throw new Error('sync load failure'); };
        r.requestLevelTransition(9);
        await cover();
        if (failure === 'ready-then-error') app.completeAppTransitionAfterDraw('Game');
        if (failure === 'gameplay-init') {
            const session = new GameplaySessionController(r);
            session.clearTutorialRuntimeState = () => {};
            r.showRemoteLoadFatalError = (_path, code) => {
                r.fatal = code;
                r._remoteLoadErrorOverlay = { isValid: true };
            };
            session.failGameplayInitialization(r, {
                error: new Error('gameplay-init failure'), initStage: 'visual_readiness',
                resolvedLevelId: 9, activeLogicalLevelId: 9, gameplayPrefix: 'level_', gameplayEntryMode: 'main',
            });
        } else if (failure === 'fx-prewarm') {
            fx.installGameplayColorCompleteFxMethods(r);
            r._pinddSpineFxPrewarmLoading = true;
            let prefabCallback;
            r._withGameAssetsBundle = done => done({ load: (_path, _type, cb) => { prefabCallback = cb; } });
            r.ensurePatternCompleteFxPrefab(() => { throw new Error('must not initialize with a missing prefab'); });
            assert.throws(() => prefabCallback(new Error('missing pattern prefab'), null), /required prefab load failed/);
            assert.equal(r._pinddSpineFxPrewarmLoading, false);
        } else if (failure === 'remote') {
            firstLevel.installFirstLevelRouteModule(r);
            r.reportLevelDataLoadDiagnostic = () => {};
            r.showRemoteLoadFatalError = (_path, code) => { r.fatal = code; };
            r.stopLevelDataLoadWithFatalError(9, 'level_9', 'failed', 'missing_data', 'missing');
        } else if (failure !== 'sync') {
            r._stopGameplayEntryWithFatalError('level_9', 'missing_asset', 'missing');
        }
        await finish(r, false);
        assert.ok(r.fatal, 'failure must be visible after the transition exits');
    }

    const homeError = new Error('Home UI missing');
    app.router.toHome = async () => {};
    app.markHomeVisible = () => {};
    const homePending = app.requestHomeRoute('test', 'auto');
    const rejectedHome = assert.rejects(homePending, /Home UI missing/);
    await cover();
    const homeRuntime = new GameSceneRuntimeController({});
    app.router.attachCurrentScene = () => {};
    homeRuntime.prepareSceneFrame = () => { throw homeError; };
    assert.throws(() => homeRuntime.startHomeSceneRuntime(), /Home UI missing/);
    events.emit('after-draw');
    controller.update(0.34);
    await rejectedHome;
    assert.equal(rootNode.active, false, 'Home UI initialization failure releases the cover');
    assert.equal(blocker.enabled, false);

    const destroyedRuntime = runtime();
    destroyedRuntime.requestLevelTransition(10);
    await cover();
    destroyedRuntime.isValid = false;
    const destroyError = new Error('stop after the destruction notification');
    dependencies['./Panels/FeedbackPanelController'].disposeFeedbackPanel = () => { throw destroyError; };
    assert.throws(() => new GameSceneRuntimeController(destroyedRuntime).destroy(), /destruction notification/);
    await finish(destroyedRuntime, false);

    const cancelledRuntime = runtime();
    cancelledRuntime.requestLevelTransition(11);
    cancelledRuntime.isValid = false;
    await cover();
    assert.equal(cancelledRuntime.loaded, undefined, 'a runtime destroyed before cover cannot start its task');
    await finish(cancelledRuntime, false);
    assert.ok(errors.length > 0, 'simulated failures must be reported');
}

async function run() {
    const first = makeController();
    assert.equal(first.rootNode.active, false, 'initialized transition must stay hidden');
    assert.equal(first.blocker.enabled, false, 'idle transition must not block input');
    assert.equal(first.camera.priority, 110, 'transition camera must render above startup loading');
    assert.equal(first.camera.clearFlags, Camera.ClearFlag.DEPTH_ONLY, 'transition camera must preserve the scene color buffer');
    assert.equal(first.background.width, 720, 'solid background must cover the visible width');
    assert.equal(first.background.height, 1280, 'background cover-fit must keep the full visible height');
    assert.equal(first.pattern.width, 1280, 'pattern covers horizontal motion with two extra tiles');
    assert.equal(first.pattern.height, 1792, 'pattern covers vertical motion with two extra tiles');
    first.controller.update(1);
    assert.equal(first.pattern.node.position, undefined, 'idle background must not animate');

    let taskCalls = 0;
    const promise = first.controller.run('route:Game:level_1', 'Game', 'forward', async () => {
        taskCalls++;
    });
    const joined = first.controller.run('route:Game:level_1', 'Game', 'forward', async () => {
        taskCalls++;
    });
    assert.equal(joined, promise, 'same-key requests must share one transaction promise');
    await assert.rejects(
        first.controller.run('route:Home', 'Home', 'reverse', async () => {}),
        /transition already in flight/,
        'different routes must fail fast while a transaction is active',
    );
    assert.equal(first.rootNode.active, true);
    assert.equal(first.blocker.enabled, true, 'covering must intercept input immediately');
    assert.equal(taskCalls, 0, 'route task must not start before the old page is covered');

    first.controller.update(0.16);
    assert.ok(first.pattern.node.position.x > 0 && first.pattern.node.position.y < 0, 'tile moves diagonally down/right');
    assert.ok(first.irisMask.width > 0, 'cover must grow the themed circular layer from the screen center');
    first.controller.update(0.16);
    await flushPromises();
    assert.equal(taskCalls, 1, 'joined requests must dispatch the route only once');
    assert.equal(first.controller.completeAfterDraw('Home'), false, 'a stale target must not release the cover');
    assert.equal(first.controller.completeAfterDraw('Game'), true);
    assert.equal(first.controller.completeAfterDraw('Game'), false, 'duplicate ready signals must share one draw listener');
    events.emit('after-draw');
    first.controller.update(0.10);
    const firstRetractDiameter = first.irisMask.width;
    assert.ok(firstRetractDiameter > 0, 'reveal must keep one themed circular layer over the new scene');
    first.controller.update(0.10);
    const secondRetractDiameter = first.irisMask.width;
    assert.ok(
        secondRetractDiameter < firstRetractDiameter,
        'the themed circular layer must retract toward the center',
    );
    first.controller.update(0.14);
    await promise;
    assert.equal(first.rootNode.active, false, 'successful reveal must hide the persistent canvas');
    assert.equal(first.blocker.enabled, false, 'successful reveal must release input');
    const stoppedOffset = first.pattern.node.position.x;
    first.controller.update(10);
    assert.equal(first.pattern.node.position.x, stoppedOffset, 'hidden transition must not move');

    const failed = first.controller.run('route:Home', 'Home', 'reverse', async () => {
        throw new Error('home route failed');
    });
    first.controller.update(0.32);
    await flushPromises();
    first.controller.update(0.34);
    await assert.rejects(failed, /home route failed/, 'route failures must reject after the reverse reveal');
    assert.equal(first.rootNode.active, false);
    assert.equal(first.blocker.enabled, false);

    // Failure redirection cancels queued Game readiness and waits for Home's
    // real draw, even if the old Game task rejects after the redirect.
    let rejectOldTask;
    const redirect = first.controller.run('recover:Game', 'Game', 'forward', () => new Promise((_, reject) => { rejectOldTask = reject; }));
    first.controller.update(0.32);
    await flushPromises();
    first.controller.completeAfterDraw('Game');
    first.controller.redirectAfterFailure('Home', new Error('entry exhausted'));
    rejectOldTask(new Error('old task rejected'));
    await flushPromises();
    assert.equal(first.controller.completeAfterDraw('Game'), false);
    events.emit('after-draw');
    first.controller.update(10);
    assert.equal(first.rootNode.active, true, 'recovery must not reveal an unfinished Home');
    assert.equal(first.controller.completeAfterDraw('Home'), true);
    events.emit('after-draw');
    first.controller.update(0.34);
    await assert.rejects(redirect, /entry exhausted/);
    assert.equal(first.blocker.enabled, false);

    await verifyGameplayEntries(first);

    const doomed = first.controller.run('route:Game:level_2', 'Game', 'forward', async () => {});
    first.controller.update(0.32);
    await flushPromises();
    first.controller.completeAfterDraw('Game');
    first.controller.onDestroy();
    await assert.rejects(doomed, /controller destroyed/);
    assert.equal(events.listenerCount('after-draw'), 0, 'destroy must cancel pending draw readiness');
    assert.equal(viewListeners.size, 0, 'destroy must remove resize listeners');

    console.log('app-transition-lifecycle.test.js passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
