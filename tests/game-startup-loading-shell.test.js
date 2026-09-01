const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readScene(relPath) {
    return JSON.parse(read(relPath));
}

function findNode(scene, name) {
    const index = scene.findIndex((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === name);
    assert.notStrictEqual(index, -1, `missing scene node: ${name}`);
    return { index, node: scene[index] };
}

function componentTypes(scene, node) {
    return (node._components || []).map((ref) => scene[ref.__id__]?.__type__);
}

const gameScene = readScene('assets/BootstrapBundle/Scenes/Game.scene');
const gameSceneRuntime = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const loadingOverlayModule = read('assets/Scripts/Core/GameCtrlModules/GameplayShareLoadingModule.ts');
const firstLevelRouteModule = read('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts');

const loadingCover = findNode(gameScene, 'LoadingCover').node;
const loadingCoverComponents = componentTypes(gameScene, loadingCover);
assert.ok(
    loadingCoverComponents.includes('cc.Sprite'),
    'Game.scene StartupLoadingUI/LoadingCover must have a real Sprite so B-class startup cannot expose the default level-1 HUD',
);

const loadingCoverSprite = (loadingCover._components || [])
    .map((ref) => gameScene[ref.__id__])
    .find((entry) => entry?.__type__ === 'cc.Sprite');
assert.ok(
    loadingCoverSprite?._spriteFrame?.__uuid__,
    'Game.scene LoadingCover Sprite must reference a bootstrap-owned SpriteFrame',
);

for (const nodeName of ['LoadingPercentLabel', 'LoadingPercentLabelShadow']) {
    const node = findNode(gameScene, nodeName).node;
    assert.ok(
        componentTypes(gameScene, node).includes('cc.Label'),
        `Game.scene ${nodeName} must keep its Label component for runtime loading progress binding`,
    );
}

assert.ok(
    gameSceneRuntime.includes('configureExistingGameLoadingOverlay(layer)'),
    'Game startup must size and validate the existing Game.scene loading cover',
);
assert.ok(
    gameSceneRuntime.includes('bindExistingGameLoadingProgress(layer, overlayVersion)'),
    'Game startup must bind the existing Game.scene loading progress label instead of leaving it at 0%',
);
assert.ok(
    gameSceneRuntime.includes('this.runtime.setGameplayStartupRootVisible?.(false)'),
    'Game startup must hide GameplayRoot while the target B-class level is still loading',
);
assert.ok(
    loadingOverlayModule.includes('setGameplayStartupRootVisible(visible: boolean)'),
    'loading overlay module must expose a deterministic way to hide/show GameplayRoot during startup',
);
assert.ok(
    loadingOverlayModule.includes('this.setGameplayStartupRootVisible?.(true);'),
    'loading overlay must restore GameplayRoot before hiding the cover after initGame renders the target level',
);
assert.ok(
    loadingOverlayModule.includes("const authoredOverlay = bootRoot?.getChildByName('StartupLoadingUI') || null;"),
    'gameplay-ready must recover and release the authored loading blocker even when the cached overlay reference is missing',
);
assert.ok(
    loadingOverlayModule.includes('const blocker = overlay.getComponent(BlockInputEvents);')
    && loadingOverlayModule.includes('if (blocker) blocker.enabled = false;'),
    'loading overlay teardown must disable input interception before deactivating the overlay',
);
assert.ok(
    loadingOverlayModule.includes('this._loadingProgressLabel.string = status;')
    && loadingOverlayModule.includes('this._loadingProgressLabelShadow.string = status;'),
    'loading status shadow label must stay in sync with the visible status label',
);
assert.ok(
    loadingOverlayModule.includes('this.scheduleOnce(showProgress, 0.3);')
    && loadingOverlayModule.includes('this.scheduleOnce(showSlowActions, 3);'),
    'startup loading must suppress short flashes and expose recovery actions only after a slow wait',
);
assert.ok(
    loadingOverlayModule.includes("this._loadingHasMeasuredProgress ? `正在准备关卡 ${safePercent}%` : '正在准备关卡…'"),
    'startup loading must show a percentage only when real measured progress exists',
);
assert.ok(
    !loadingOverlayModule.includes('_setLoadingProgress(0.5')
    && !loadingOverlayModule.includes('_setLoadingProgress(0.8'),
    'startup loading must not manufacture the old 50% and 80% milestones',
);
assert.ok(
    firstLevelRouteModule.includes(`this.setGameplayStartupRootVisible?.(true);
            this.hideLoadingOverlay?.();
            this.showRemoteLoadFatalError`),
    'target-level fail-fast errors must hide the loading cover before showing the fatal error panel',
);

console.log('game-startup-loading-shell.test.js passed');
