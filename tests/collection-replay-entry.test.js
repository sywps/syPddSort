const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

class TestLabel {}
class TestSprite {}
class TestUITransform {}

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function loadCollectionGuideModule(appRootRef) {
    const source = read('assets/Scripts/Core/GameCtrlModules/CollectionGuideModule.ts');
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    const module = { exports: {} };
    const sandbox = {
        module,
        exports: module.exports,
        console,
        require(id) {
            if (id === '../GameCtrlShared') {
                return {
                    AudioMgr: { inst: { play() {} } },
                    Label: TestLabel,
                    Sprite: TestSprite,
                    UITransform: TestUITransform,
                };
            }
            if (id === '../Panels/CollectionShellOverlay') {
                return { openCollectionShellOverlay() {} };
            }
            if (id === '../AppRoot') {
                return {
                    AppRoot: {
                        tryGet: () => appRootRef.current,
                    },
                };
            }
            throw new Error(`unexpected require: ${id}`);
        },
    };
    vm.runInNewContext(output, sandbox, { filename: 'CollectionGuideModule.ts' });
    return module.exports;
}

function createAppRoot() {
    return {
        router: { isTransitioning: false },
        session: { pendingGameplayRequest: null },
    };
}

async function run() {
    const appRootRef = { current: createAppRoot() };
    const { installCollectionGuideModule, COLLECTION_REPLAY_ROUTE_REASON } = loadCollectionGuideModule(appRootRef);
    assert.strictEqual(COLLECTION_REPLAY_ROUTE_REASON, 'collection_replay');

    const homeCalls = [];
    let finishHomeRoute;
    const homeRuntime = {
        _collectionReplayStarting: false,
        isValid: true,
        getRuntimeSceneName: () => 'Home',
        costVigorForLevel(levelId, entryMode) {
            homeCalls.push(['cost', levelId, entryMode]);
            return true;
        },
        closeCollection() {
            homeCalls.push(['close']);
        },
        requestGameplayRoute(...args) {
            homeCalls.push(['route', ...args]);
            return new Promise((resolve) => {
                finishHomeRoute = resolve;
            });
        },
        showNoLivesAdModal() {
            throw new Error('vigor modal must not open when one point was spent');
        },
        showToast() {},
    };
    installCollectionGuideModule(homeRuntime);
    homeRuntime.closeCollection = () => homeCalls.push(['close']);

    const firstHomeStart = homeRuntime.startCollectionReplay(7, 'level_');
    const duplicateHomeStart = homeRuntime.startCollectionReplay(7, 'level_');
    assert.strictEqual(duplicateHomeStart, false, 'double tapping must not spend or route twice');
    assert.deepStrictEqual(homeCalls, [
        ['cost', 7, 'collection_replay'],
        ['close'],
        ['route', 7, 'level_', false, 'none', 'collection_replay'],
    ]);
    finishHomeRoute();
    assert.strictEqual(await firstHomeStart, true);

    let recoverOptions = null;
    let successfulSpendCount = 0;
    const recoveredCalls = [];
    const recoveredRuntime = {
        _collectionReplayStarting: false,
        isValid: true,
        getRuntimeSceneName: () => 'Home',
        costVigorForLevel(levelId, entryMode) {
            recoveredCalls.push(['cost', levelId, entryMode]);
            if (!recoverOptions) return false;
            successfulSpendCount += 1;
            return true;
        },
        showNoLivesAdModal(options) {
            recoverOptions = options;
        },
        closeCollection() {
            recoveredCalls.push(['close']);
        },
        requestGameplayRoute(...args) {
            recoveredCalls.push(['route', ...args]);
            return Promise.resolve();
        },
        showToast() {},
    };
    installCollectionGuideModule(recoveredRuntime);
    recoveredRuntime.closeCollection = () => recoveredCalls.push(['close']);

    assert.strictEqual(recoveredRuntime.startCollectionReplay(2, 'level_'), false);
    assert.ok(recoverOptions, 'zero vigor must open the existing recovery flow');
    assert.strictEqual(recoverOptions.source, 'collection_replay');
    assert.strictEqual(recoverOptions.levelId, 2);
    assert.strictEqual(recoverOptions.gameplayEntryMode, 'main');
    assert.strictEqual(recoveredRuntime._collectionReplayStarting, true, 'recovery flow must keep double taps locked');
    assert.deepStrictEqual(recoveredCalls, [['cost', 2, 'collection_replay']]);

    recoverOptions.onResult({ status: 'granted' });
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(successfulSpendCount, 1, 'granted recovery must spend exactly one vigor');
    assert.deepStrictEqual(recoveredCalls, [
        ['cost', 2, 'collection_replay'],
        ['cost', 2, 'collection_replay'],
        ['close'],
        ['route', 2, 'level_', false, 'none', 'collection_replay'],
    ]);

    appRootRef.current = createAppRoot();
    const gameCalls = [];
    const gameRuntime = {
        _collectionReplayStarting: false,
        _isThemeLevel: false,
        _currentThemeLevelId: 0,
        isValid: true,
        getRuntimeSceneName: () => 'Game',
        costVigorForLevel(levelId, entryMode) {
            gameCalls.push(['cost', levelId, entryMode]);
            return true;
        },
        closeCollection() {
            gameCalls.push(['close']);
        },
        deactivateMainMenuNode() {
            gameCalls.push(['deactivate']);
        },
        loadLevel(...args) {
            gameCalls.push(['load', ...args]);
        },
        showNoLivesAdModal() {},
        showToast() {},
    };
    installCollectionGuideModule(gameRuntime);
    gameRuntime.closeCollection = () => gameCalls.push(['close']);
    assert.strictEqual(gameRuntime.startCollectionReplay(12, 'zt_level_'), true);
    assert.strictEqual(gameRuntime._isThemeLevel, true);
    assert.strictEqual(gameRuntime._currentThemeLevelId, 12);
    assert.deepStrictEqual(gameCalls, [
        ['cost', 12, 'collection_replay'],
        ['close'],
        ['deactivate'],
        ['load', 12, 'zt_level_', false, 'collection_replay'],
    ]);

    const replayTitleLabel = { string: '' };
    const replayCostLabel = { string: '' };
    const replayButtonSprite = { spriteFrame: {} };
    const replayVigorSprite = { spriteFrame: {} };
    const replayButtonNode = {
        isValid: true,
        active: false,
        getComponent(type) {
            if (type === TestUITransform) return {};
            if (type === TestSprite) return replayButtonSprite;
            return null;
        },
        getChildByName(name) {
            if (name === 'ReplayTitle') {
                return { getComponent: (type) => type === TestLabel ? replayTitleLabel : null };
            }
            if (name === 'VigorIcon') {
                return {
                    isValid: true,
                    getComponent: (type) => type === TestSprite ? replayVigorSprite : null,
                };
            }
            if (name === 'VigorCost') {
                return { getComponent: (type) => type === TestLabel ? replayCostLabel : null };
            }
            return null;
        },
    };
    const replayBindings = [];
    const replayUiRuntime = {
        bindPanelButton(node, handler) {
            replayBindings.push({ node, handler });
        },
    };
    installCollectionGuideModule(replayUiRuntime);
    replayUiRuntime.bindCollectionReplayButton(
        { getChildByName: (name) => name === 'CollectionReplayButton' ? replayButtonNode : null },
        7,
        'level_',
    );
    assert.strictEqual(replayButtonNode.active, true, 'detail view must explicitly show the replay button');
    assert.strictEqual(replayTitleLabel.string, '重玩本关');
    assert.strictEqual(replayCostLabel.string, '-1');
    assert.strictEqual(replayBindings.length, 1);
    assert.strictEqual(replayBindings[0].node, replayButtonNode);

    const guide = read('assets/Scripts/Core/GameCtrlModules/CollectionGuideModule.ts');
    const collectionPanelController = read('assets/Scripts/Core/Panels/CollectionPanelController.ts');
    const collectionPrefab = JSON.parse(read('assets/GameAssetsBundle/UI/Prefabs/Panels/CollectionPanel.prefab'));
    const sceneEntry = read('assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts');
    const playerMeta = read('assets/Scripts/Core/GameCtrlModules/PlayerMetaStateModule.ts');
    const progressOwner = read('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts');

    const findNodeIndex = (name) => collectionPrefab.findIndex(
        (record) => record?.__type__ === 'cc.Node' && record._name === name,
    );
    const childIds = (node) => (node?._children || []).map((ref) => ref?.__id__).filter(Number.isInteger);
    const findComponent = (node, type) => (node?._components || [])
        .map((ref) => collectionPrefab[ref?.__id__])
        .find((component) => component?.__type__ === type);

    const boxIndex = findNodeIndex('Box');
    const replayIndex = findNodeIndex('CollectionReplayButton');
    const replayButton = collectionPrefab[replayIndex];
    assert.ok(boxIndex >= 0 && replayIndex >= 0, 'collection prefab must contain the replay button under Box');
    assert.strictEqual(replayButton._parent?.__id__, boxIndex);
    assert.ok(childIds(collectionPrefab[boxIndex]).includes(replayIndex));
    assert.strictEqual(replayButton._active, false, 'catalog view must keep the replay button hidden by default');
    assert.deepStrictEqual(
        childIds(replayButton).map((id) => collectionPrefab[id]?._name),
        ['ReplayTitle', 'VigorIcon', 'VigorCost'],
    );

    const replayUi = findComponent(replayButton, 'cc.UITransform');
    const replaySprite = findComponent(replayButton, 'cc.Sprite');
    assert.ok(replayUi?._contentSize?.width > 0 && replayUi?._contentSize?.height > 0, 'replay button size must remain valid');
    assert.strictEqual(replaySprite?._spriteFrame?.__uuid__, 'd32c3490-5ef2-489f-b31d-158385e5b817@f9941');
    assert.strictEqual(replaySprite?._type, 1, 'replay button background must remain sliced');

    const replayTitle = collectionPrefab[findNodeIndex('ReplayTitle')];
    const vigorIcon = collectionPrefab[findNodeIndex('VigorIcon')];
    const vigorCost = collectionPrefab[findNodeIndex('VigorCost')];
    assert.strictEqual(findComponent(replayTitle, 'cc.Label')?._string, '重玩本关');
    assert.strictEqual(findComponent(vigorIcon, 'cc.Sprite')?._spriteFrame?.__uuid__, '52ad05df-1f16-4e9f-8166-18183db47009@f9941');
    assert.strictEqual(findComponent(vigorCost, 'cc.Label')?._string, '-1');

    assert.ok(guide.includes('bindCollectionReplayButton(box, levelId, prefix)'), 'detail modal must bind the prefab replay button');
    assert.ok(!guide.includes("new Node('CollectionReplayButton')"), 'detail modal must not create the replay button at runtime');
    assert.ok(!guide.includes("this.getSF('popup_primary_button')"), 'replay button art must come from the prefab');
    assert.ok(!guide.includes("this.getSF('popup_vigor_icon')"), 'replay vigor art must come from the prefab');
    assert.ok(
        collectionPanelController.includes("runtime.requirePanelChild(box, 'CollectionReplayButton').active = false;"),
        'catalog view must explicitly hide the shared replay button',
    );
    assert.ok(guide.includes("'重玩本关'"), 'replay button must show its main action label');
    assert.ok(guide.includes("'-1'"), 'replay button must show one-vigor cost below the title');
    assert.ok(sceneEntry.includes('routeReason: string ='), 'normal gameplay route must carry the replay source');
    assert.ok(playerMeta.includes("'collection_replay'"), 'the recovery flow must accept the replay source');
    assert.ok(
        progressOwner.includes('const nextLevel = Math.max(currentLevel, normalizedLevel);'),
        'replaying an old level must retain monotonic mainline progress',
    );

    console.log('collection-replay-entry.test.js passed');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
