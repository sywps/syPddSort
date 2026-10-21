'use strict';

// Serialized into page.evaluate. Observation only: never invokes game actions or changes state.
async function readGameSnapshot() {
    const canvas = document.querySelector('canvas');
    const base = { url: location.href, title: document.title, observedAt: Date.now(), canvas: !!canvas };
    if (!canvas) return { ...base, phase: 'boot', observationError: 'No canvas yet' };
    let cc;
    try {
        cc = window.System?.import ? await window.System.import('cc') : window.cc;
        if (!cc?.director || !cc.UITransform || !cc.Canvas) throw Error('Cocos inspection API unavailable');
    } catch (error) {
        return { ...base, phase: 'boot', observationError: error.message };
    }
    const scene = cc.director.getScene();
    if (!scene) return { ...base, phase: 'boot', observationError: 'No active Cocos scene' };
    const nodes = [];
    function visit(node, path) {
        if (!node.activeInHierarchy) return;
        const entry = { node, path: path + '/' + node.name };
        nodes.push(entry);
        for (const child of node.children) visit(child, entry.path);
    }
    visit(scene, '');
    const runtimes = nodes.flatMap(({ node }) => node.components || []);
    const runtime = runtimes.find(c => c._pchConveyorGameplayController && c.boardModel);
    const controller = runtime?._pchConveyorGameplayController;
    const rect = canvas.getBoundingClientRect();
    function cameraFor(node) {
        for (let parent = node; parent; parent = parent.parent) {
            const ui = parent.getComponent(cc.Canvas);
            if (ui?.cameraComponent) return ui.cameraComponent;
        }
        return null;
    }
    function project(node, world) {
        const camera = cameraFor(node);
        if (!camera || !world || !canvas.width || !canvas.height) return null;
        const screen = camera.worldToScreen(world);
        const point = { x: rect.left + screen.x / canvas.width * rect.width,
            y: rect.top + (1 - screen.y / canvas.height) * rect.height };
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
            || point.x < rect.left || point.x >= rect.right || point.y < rect.top || point.y >= rect.bottom) return null;
        return point;
    }
    function nodePoint(node) {
        const box = node?.getComponent(cc.UITransform)?.getBoundingBoxToWorld();
        return box ? project(node, new cc.Vec3(box.x + box.width / 2, box.y + box.height / 2, 0)) : null;
    }
    function visible(node) {
        if (!node?.activeInHierarchy) return false;
        for (let n = node; n; n = n.parent) {
            if (cc.UIOpacity && n.getComponent(cc.UIOpacity)?.opacity < 20) return false;
        }
        return true;
    }
    const buttons = [];
    const blockers = [];
    for (const { node, path } of nodes) {
        const button = node.getComponent(cc.Button);
        if (button?.enabledInHierarchy && button.interactable && visible(node)) {
            const point = nodePoint(node);
            if (point) buttons.push({ name: node.name, path, point });
        }
        if (cc.BlockInputEvents && node.getComponent(cc.BlockInputEvents)?.enabledInHierarchy) blockers.push(path);
    }
    const edition = window.__PDD_CREATOR_WEB__ ? 'creator-web-immediate-reward'
        : /(?:^|\/)preview(?:\/|$)/.test(location.pathname) || location.search.includes('scene=') ? 'cocos-preview' : 'web-build';
    const common = { ...base, scene: scene.name, edition, engineVersion: cc.ENGINE_VERSION,
        nodeCount: nodes.length, buttons, blockers,
        frame: cc.director.getTotalFrames?.() ?? null };
    if (!runtime || !controller?.rules) return { ...common, phase: scene.name === 'Home' ? 'home' : 'loading' };
    const rules = controller.rules;
    const panels = ['panelWin', 'panelLose', 'panelTimeoutContinue', 'panelBufferFullContinue']
        .filter(key => visible(runtime[key]));
    const cells = rules.cells.map(cell => ({ ...cell,
        point: project(runtime.boardNode, runtime.getBoardCellWorldPosition(cell.row, cell.col)) }));
    const colors = {};
    const targetColors = {};
    const transportColors = {};
    const count = (map, value) => { if (value > 0) map[value] = (map[value] || 0) + 1; };
    for (const cell of cells) { count(colors, cell.current); count(targetColors, cell.target); }
    for (const stack of rules.carriers) for (const color of stack) { count(colors, color); count(transportColors, color); }
    for (const color of rules.entryColors) { count(colors, color); count(transportColors, color); }
    const guideActive = visible(controller.openingGuide);
    const phase = panels.includes('panelWin') ? 'win'
        : panels.some(key => /Continue$/.test(key)) ? 'revive'
        : panels.includes('panelLose') ? 'lose'
        : runtime.isGameEnd ? 'settling'
        : guideActive ? 'guide' : controller.openingPatternState !== 'done' ? 'opening' : 'playing';
    return { ...common, phase, level: runtime.getActiveLogicalLevelId?.() ?? runtime.levelData.levelId,
        round: runtime._gameplayInitSeq, panels, isGameEnd: runtime.isGameEnd,
        timeRemain: runtime.timeRemain, validActions: controller.analyticsStats?.validActionCount ?? null,
        opening: controller.openingPatternState, inputLocked: controller.inputLocked,
        externalInputBlocked: controller.externalInputBlocked,
        expectedWait: controller.settingsPaused ? 'settings' : runtime._adShowing ? 'ad'
            : runtime._skillActive || controller.skillMovementPaused ? 'skill' : '',
        guide: guideActive ? controller.openingGuide.name : '',
        guideTarget: guideActive && visible(controller.openingGuideTarget) ? nodePoint(controller.openingGuideTarget) : null,
        cells, colors, targetColors, transportColors, bufferCount: rules.bufferCount, bufferCapacity: rules.bufferCapacity,
        entryCount: rules.entryCount, carrierCount: rules.carriers.length, stackDepth: rules.stackDepth,
        carrierSizes: rules.carriers.map(stack => stack.length),
        carrierCapacities: rules.carriers.map((_, index) => rules.getCarrierCapacity(index)),
        beltTravel: controller.beltTravel, pendingReturns: controller.activeReturnAnimations,
        lockedCount: cells.filter(cell => cell.locked).length,
        selectableCount: cells.filter(cell => !cell.locked && cell.current > 0).length,
    };
}

module.exports = { readGameSnapshot };
