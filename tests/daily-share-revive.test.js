const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const controllerPath = 'assets/Scripts/Core/GameplayResultPanelController.ts';
const controllerSource = fs.readFileSync(path.join(root, controllerPath), 'utf8');
const shareIconUuid = '24e32438-c0a3-4a61-8483-8aeaf69da441@f9941';

function extractMethod(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `missing method signature: ${signature}`);
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`unterminated method: ${signature}`);
}

function transpile(relPath) {
    return ts.transpileModule(fs.readFileSync(path.join(root, relPath), 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
}

function findPrefabNode(records, name) {
    const index = records.findIndex((record) => record?.__type__ === 'cc.Node' && record._name === name);
    assert.ok(index >= 0, `missing prefab node: ${name}`);
    return { index, node: records[index] };
}

function findPrefabComponent(records, node, type) {
    const component = (node._components || [])
        .map((ref) => records[ref.__id__])
        .find((candidate) => candidate?.__type__ === type);
    assert.ok(component, `missing ${type} on ${node._name}`);
    return component;
}

function assertStaticShareButton(relPath, expectedLabel) {
    const records = JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
    const box = findPrefabNode(records, 'Box');
    const shareBtn = findPrefabNode(records, 'ShareBtn');
    const shareIcon = findPrefabNode(records, 'ShareIcon');
    const shareLabel = findPrefabNode(records, 'ShareBtnLbl');
    assert.ok(
        box.node._children.some((ref) => ref.__id__ === shareBtn.index),
        `${relPath} must serialize ShareBtn directly under Box`,
    );
    assert.strictEqual(shareBtn.node._active, false, `${relPath} must let runtime eligibility control ShareBtn visibility`);
    assert.strictEqual(shareIcon.node._parent?.__id__, shareBtn.index);
    assert.strictEqual(shareLabel.node._parent?.__id__, shareBtn.index);
    assert.strictEqual(findPrefabComponent(records, shareIcon.node, 'cc.Sprite')._spriteFrame?.__uuid__, shareIconUuid);
    assert.strictEqual(findPrefabComponent(records, shareLabel.node, 'cc.Label')._string, expectedLabel);
    assert.ok(findPrefabComponent(records, shareBtn.node, 'cc.UITransform'));
    assert.ok(findPrefabComponent(records, shareBtn.node, 'cc.Sprite'));
}

function createStorage() {
    const values = new Map();
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, value); },
        clear() { values.clear(); },
        getJson(key) { return JSON.parse(values.get(key)); },
    };
}

function loadController(storage, pchController) {
    const module = { exports: {} };
    class Label {}
    vm.runInNewContext(transpile(controllerPath), {
        module,
        exports: module.exports,
        require(id) {
            if (id === './GameCtrlShared') {
                return {
                    AnalyticsMgr: { inst: {} },
                    AudioMgr: { inst: { play() {} } },
                    BlockInputEvents: class {},
                    Button: class {},
                    Bundle: class {},
                    Color: class {},
                    Graphics: class {},
                    Label,
                    Node: class {},
                    PerformanceMgr: { inst: {} },
                    Prefab: class {},
                    ProgressBar: class {},
                    Sprite: class {},
                    Tween: class {},
                    UIOpacity: class {},
                    UITransform: class {},
                    Vec3: class {},
                    assetManager: {},
                    GAME_ASSETS_BUNDLE_NAME: 'gameAssets',
                    LOCAL_BOOTSTRAP_BUNDLE_NAME: 'bootstrap',
                    instantiate() { throw new Error('not used by this contract test'); },
                    sys: { localStorage: storage },
                    tween() {},
                };
            }
            if (id === './AppRoot') return { AppRoot: {} };
            if (id === './MiniGamePlatform') return { isMiniGameRuntime: () => false };
            if (id === './PchConveyorGameplayController') {
                return { ensurePchConveyorGameplayController: () => pchController };
            }
            throw new Error(`unexpected require: ${id}`);
        },
        console,
        Date,
        JSON,
        Math,
        Map,
        Set,
        WeakMap,
    }, { filename: 'GameplayResultPanelController.ts' });
    return module.exports.GameplayResultPanelController;
}

function makeRuntime() {
    const calls = [];
    const runtime = {
        _adShowing: false,
        _shareShowing: false,
        _isThemeLevel: false,
        _activeGameplayEntryMode: 'main',
        panelTimeoutContinue: null,
        panelBufferFullContinue: null,
        getActiveLogicalLevelId: () => 4,
        getWeChatRuntime: () => ({
            shareAppMessage() {},
            onShow() {},
            offShow() {},
        }),
        continueAfterLose(seconds) { calls.push(['continue', seconds]); },
        runShareGrant(page, grant, options) {
            calls.push(['share', page, grant, options]);
            return true;
        },
    };
    return { runtime, calls };
}

function testSourceContract() {
    assert.ok(controllerSource.includes("const REVIVE_SHARE_STATE_KEY = 'pdd.revive.shareState.v1'"));
    assert.ok(controllerSource.includes('const REVIVE_SHARE_DAILY_LIMIT = 1;'));
    assert.ok(controllerSource.includes('elapsedMs > active.minElapsedMs') === false, 'time gate belongs to the platform service');
    assert.ok(controllerSource.includes("const shareBtn = box.getChildByName('ShareBtn');"));
    assert.ok(controllerSource.includes("const shareIcon = shareBtn?.getChildByName('ShareIcon');"));
    assert.ok(controllerSource.includes("getChildByName('ShareBtnLbl')?.getComponent(Label)"));
    assert.ok(!controllerSource.includes('instantiate(continueBtn)'), 'ShareBtn must not be cloned at runtime');
    assert.ok(!controllerSource.includes("shareBtn.name = 'ShareBtn'"));
    assert.ok(!controllerSource.includes("getChildByName('popup_ad_play_icon')"));
    assertStaticShareButton('assets/GameAssetsBundle/UI/Prefabs/Panels/RevivePanel.prefab', '分享复活');
    assertStaticShareButton('assets/GameAssetsBundle/UI/Prefabs/Panels/BufferFullRevivePanel.prefab', '分享送扩展');

    const timeoutFactory = extractMethod(controllerSource, 'createReviveSettlementPanel(): Node');
    const bufferFactory = extractMethod(controllerSource, 'createBufferFullSettlementPanel(): Node');
    const loseFactory = extractMethod(controllerSource, 'createLoseSettlementPanel(): Node');
    assert.ok(timeoutFactory.includes("this.bindReviveShareButton("));
    assert.ok(bufferFactory.includes("this.bindReviveShareButton("));
    assert.ok(!loseFactory.includes('bindReviveShareButton'), 'LosePanel must not expose share revive');
    assert.ok(!loseFactory.includes('runReviveShareAction'), 'LosePanel must retain its ad-only revive route');
}

function testStaticShareButtonBinding() {
    const storage = createStorage();
    const Controller = loadController(storage, { continueAfterBufferFull: () => true });
    const { runtime } = makeRuntime();
    const shareIcon = {};
    const shareLabel = { getComponent: () => ({}) };
    const shareBtn = {
        getChildByName(name) {
            if (name === 'ShareIcon') return shareIcon;
            if (name === 'ShareBtnLbl') return shareLabel;
            return null;
        },
    };
    const box = {
        getChildByName(name) {
            return name === 'ShareBtn' ? shareBtn : null;
        },
    };
    const bindings = [];
    runtime.bindPanelButton = (node, handler) => bindings.push({ node, handler });
    const controller = new Controller(runtime);
    let clicks = 0;

    assert.strictEqual(controller.bindReviveShareButton(box, () => { clicks += 1; }), shareBtn);
    assert.strictEqual(bindings.length, 1);
    assert.strictEqual(bindings[0].node, shareBtn);
    bindings[0].handler();
    assert.strictEqual(clicks, 1);
    assert.throws(
        () => controller.bindReviveShareButton({ getChildByName: () => null }, () => {}),
        /static ShareBtn\/ShareIcon\/ShareBtnLbl/,
    );
}

function testDailyStateAndEligibility() {
    const storage = createStorage();
    const PchController = { continueAfterBufferFull: () => true };
    const Controller = loadController(storage, PchController);
    const { runtime } = makeRuntime();
    const controller = new Controller(runtime);

    assert.strictEqual(controller.canUseReviveShare(), true, 'main level 4 with full WeChat API starts eligible');
    const rollback = controller.reserveReviveShareGrant();
    assert.strictEqual(typeof rollback, 'function');
    assert.strictEqual(storage.getJson('pdd.revive.shareState.v1').count, 1);
    assert.strictEqual(controller.canUseReviveShare(), false, 'both revive panels must see the same daily claim');
    rollback();
    assert.strictEqual(storage.getJson('pdd.revive.shareState.v1').count, 0);
    assert.strictEqual(controller.canUseReviveShare(), true);

    runtime.getActiveLogicalLevelId = () => 3;
    assert.strictEqual(controller.canUseReviveShare(), false, 'level 1-3 must keep the original ad revive');
    runtime.getActiveLogicalLevelId = () => 4;
    runtime._isThemeLevel = true;
    assert.strictEqual(controller.canUseReviveShare(), false, 'theme levels must not consume the main-line daily share');
}

function testBothReviveActionsConsumeOneSharedClaim() {
    const storage = createStorage();
    let bufferContinues = 0;
    const Controller = loadController(storage, {
        continueAfterBufferFull() {
            bufferContinues += 1;
            return true;
        },
    });
    const { runtime, calls } = makeRuntime();
    const controller = new Controller(runtime);
    const timeoutOverlay = { active: true };
    controller.runReviveShareAction('timeout', timeoutOverlay, 120);
    const timeoutShare = calls.find((call) => call[0] === 'share');
    assert.ok(timeoutShare);
    assert.strictEqual(timeoutShare[1], 'level_revive_share');
    assert.strictEqual(timeoutShare[3].busyFlag, '_shareShowing');
    assert.strictEqual(timeoutShare[2](), true);
    assert.deepStrictEqual(calls.filter((call) => call[0] === 'continue'), [['continue', 120]]);
    assert.strictEqual(timeoutOverlay.active, false);
    assert.strictEqual(storage.getJson('pdd.revive.shareState.v1').count, 1);

    const bufferOverlay = { active: true };
    controller.runReviveShareAction('buffer-full', bufferOverlay);
    assert.strictEqual(calls.filter((call) => call[0] === 'share').length, 1, 'daily share claim blocks the other revive panel');
    assert.strictEqual(bufferContinues, 0);
}

testSourceContract();
testStaticShareButtonBinding();
testDailyStateAndEligibility();
testBothReviveActionsConsumeOneSharedClaim();
console.log('daily-share-revive.test.js passed');
