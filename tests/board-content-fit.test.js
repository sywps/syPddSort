const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameplayViewController.ts'), 'utf8');
const ast = ts.createSourceFile('view.ts', source, ts.ScriptTarget.Latest, true);
const cls = ast.statements.find(n => ts.isClassDeclaration(n));
const names = ['getTargetContentBounds', 'getHudSafeInitialScale', 'fitBoardViewportToSafeRect'];
const code = names.map(name => cls.members.find(n => n.name?.getText(ast) === name).getText(ast)).join('\n');
const js = ts.transpileModule('export class Harness {' + code + '}', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
class Vec2 { constructor(x, y) { Object.assign(this, { x, y }); } }
class Vec3 extends Vec2 { constructor(x, y, z) { super(x, y); this.z = z; } }
class Widget {}
class Label {}
class SafeArea {}
new Function('exports', 'Vec2', 'Vec3', 'Widget', 'Label', 'SafeArea', 'ZOOM_HINT_SCALE_HEADROOM', 'RANKED_PVP_BOARD_CENTER_OFFSET_Y', js)(mod.exports, Vec2, Vec3, Widget, Label, SafeArea, .06, -28);
function fit(data, options = {}) {
    const max = Math.max(data.boardWidth, data.boardHeight), padding = max > 20 ? 8 : 28;
    const cell = Math.max(max > 48 ? 6 : max > 32 ? 8 : 12, Math.min(62, Math.floor((660 - padding) / max)));
    const viewport = { setScaleBounds(min, max) { this.min = min; this.max = max; },
        setViewTransformClamped(scale, offset) { this.scale = Math.max(this.min, Math.min(this.max, scale)); this.offset = offset; },
        setHomeFromCurrent() {}, getHomeTransform() { return { scale: this.scale, offset: this.offset }; } };
    const h = new mod.exports.Harness();
    const layoutNode = options.layoutNode || { active: true, activeInHierarchy: false, children: [], parent: null, getComponent: () => null };
    h.getGameplayFixedRoot = () => layoutNode;
    h.getGameplayFixedGroup = name => options.layoutGroups?.[name] || layoutNode;
    h.getGameplayBottomHudGroup = () => layoutNode;
    h.runtime = { levelData: data, cellSize: cell, cellGap: 0, boardViewport: viewport,
        boardGroup: { parent: layoutNode },
        constructor: { MIN_SCALE: .8, MAX_SCALE: 2.2, BOARD_PLAYABLE_CELL_UI_SIZE: 44, BOARD_DYNAMIC_MAX_SCALE_CAP: 6.5 },
        getBoardInitialFitRect: () => options.getRect?.() || options.rect || { left: -359.919, right: 359.919, top: 632.8180152671755, bottom: -335.47501526717565 },
        shouldUseContentAwareInitialFit: () => true,
        getBoardInitialFitObstacles: () => options.obstacles || [] };
    h.fitBoardViewportToSafeRect(data.boardWidth, data.boardHeight, padding);
    return { scale: viewport.scale, offset: viewport.offset, cell, padding, h };
}
const level = id => JSON.parse(fs.readFileSync(path.join(root, 'assets/LevelData/level_' + id + '.json')));
const inputSource = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts'), 'utf8');
const inputAst = ts.createSourceFile('input.ts', inputSource, ts.ScriptTarget.Latest, true);
let obstacleMethod;
function findObstacleMethod(n) {
    if (ts.isMethodDeclaration(n) && n.name?.getText(inputAst) === 'getBoardInitialFitObstacles') obstacleMethod = n;
    ts.forEachChild(n, findObstacleMethod);
}
findObstacleMethod(inputAst);
const obstacleJs = ts.transpileModule('exports.Hud = class {' + obstacleMethod.getText(inputAst) + '}', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const hudExports = {};
const containerDeclaration = inputAst.statements.find(n => ts.isVariableStatement(n)
    && n.declarationList.declarations.some(d => d.name.getText(inputAst) === 'GAMEPLAY_LAYOUT_CONTAINER_NODE_NAMES'));
const containerJs = ts.transpileModule(containerDeclaration.getText(inputAst), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
new Function('exports', containerJs + obstacleJs)(hudExports);
const hudHarness = new hudExports.Hud();
const hiddenByParent = (name, active = true, children = []) => ({ name, active, activeInHierarchy: false, children });
const bounds = { left: -40, right: 40, bottom: 480, top: 540 };
hudHarness.getGameplayNodeBoundsInFixedRoot = () => bounds;
hudHarness.getGameplayFixedGroup = () => ({ children: [
    hiddenByParent('TimerWrap'), hiddenByParent('PchSpeedButton', true, [hiddenByParent('Icon')]),
    hiddenByParent('HiddenControl', false, [hiddenByParent('HiddenIcon')]),
] });
assert.deepEqual(hudHarness.getBoardInitialFitObstacles(), [
    { ...bounds, sideControl: false }, { ...bounds, sideControl: true }, { ...bounds, sideControl: true },
], 'hidden loading root must retain locally enabled HUD obstacles, but exclude disabled subtrees');
for (const container of ['TopHud', 'PvpBattleHud', 'CoopHud']) {
    hudHarness.getGameplayFixedGroup = () => ({ children: [hiddenByParent(container, true, [hiddenByParent('VisibleControl')])] });
    hudHarness.getGameplayNodeBoundsInFixedRoot = node => node.name === container
        ? { left: -360, right: 360, bottom: -640, top: 640 } : bounds;
    assert.deepEqual(hudHarness.getBoardInitialFitObstacles(), [{ ...bounds, sideControl: false }],
        container + ' must preserve visible children without treating the full-screen layout container as an obstacle');
    assert.doesNotThrow(() => fit(level(21), { obstacles: hudHarness.getBoardInitialFitObstacles() }));
}
for (const [id, expected] of [[600, 1.509127587146101], [359, 1.048256880733945 * 1.05], [111, 1.057962962962963 * 1.05]]) {
    const result = fit(level(id));
    assert.ok(Math.abs(result.scale - expected) < 1e-9, 'approved preview scale: ' + id);
    assert.equal(result.h.runtime.boardHomeScale, result.scale, 'home/reset must retain new initial scale');
}
assert.equal(fit({ ...level(359), levelId: 600 }).scale, fit(level(359)).scale, 'replacing level600 with wide artwork must adapt by content');
assert.equal(fit({ ...level(111), levelId: 600 }).scale, fit(level(111)).scale, 'replacing level600 with square artwork must adapt by content');
const full = { levelId: 600, boardWidth: 22, boardHeight: 39, correctColorArr: Array.from({ length: 39 }, () => Array(22).fill(1)) };
const obstacle = { left: -334, right: -249, bottom: 555, top: 640 };
const guarded = fit(full, { obstacles: [obstacle] });
assert.ok(guarded.scale < fit(full).scale, 'a solid upper corner must avoid the side button');
assert.equal(guarded.h.getHudSafeInitialScale(guarded.scale, guarded.offset.x, guarded.offset.y, 0, 0), guarded.scale);
// Initial fitting must read adapted HUD geometry, not the authored 720x1280
// positions still present before Cocos runs the first Widget update.
for (const [width, height] of [[720, 1280], [720, 1560], [720, 1680]]) {
    const order = [];
    let top = 0, bottom = 0;
    const node = (name, update, parent = null) => ({ active: true, activeInHierarchy: false, parent, children: [],
        getComponent: type => type !== Widget ? null : ({ enabled: true, updateAlignment() { order.push(name); update(); } }) });
    let rootHeight = 1280;
    let topInset = 0;
    const rootNode = node('root', () => { rootHeight = height; });
    const fixedNode = node('fixed', () => assert.equal(rootHeight, height), rootNode);
    const topNode = node('hud', () => { top = rootHeight / 2 - 190 - topInset; });
    const hudComponent = topNode.getComponent;
    topNode.getComponent = type => type === SafeArea
        ? { enabled: true, updateArea() { topInset = 100; order.push('safe-area'); } }
        : hudComponent(type);
    const bottomNode = node('conveyor', () => { bottom = -rootHeight / 2 + 400; });
    for (const id of [3, 359, 111, 600]) {
        const result = fit(level(id), { layoutNode: fixedNode,
            layoutGroups: { TopBarGroup: topNode, PchConveyorRoot: bottomNode },
            getRect: () => { assert.ok(top > bottom); return { left: -width/2, right: width/2, top, bottom }; } });
        const b = result.h.getTargetContentBounds(level(id).correctColorArr, level(id).boardWidth, level(id).boardHeight);
        const contentCenterY = (level(id).boardHeight / 2 - (b.minRow + b.maxRow + 1)/2) * result.cell;
        assert.ok(Math.abs(result.offset.y + contentCenterY * result.scale - (top+bottom)/2) < 1e-8, `${id} centered at ${height}`);
    }
    assert.ok(order.indexOf('root') < order.indexOf('fixed') && order.indexOf('fixed') < order.indexOf('hud'));
    assert.ok(order.indexOf('safe-area') < order.indexOf('hud'), 'safe insets must update before the HUD widget');
}
for (const file of fs.readdirSync(path.join(root, 'assets/LevelData')).filter(n => /^level_\d+\.json$/.test(n))) {
    const data = JSON.parse(fs.readFileSync(path.join(root, 'assets/LevelData', file)));
    const result = fit(data, { rect: { left: -359.919, right: 359.919, top: 380, bottom: -120 } });
    const b = result.h.getTargetContentBounds(data.correctColorArr, data.boardWidth, data.boardHeight);
    assert.ok(((b.maxCol-b.minCol+1)*result.cell+result.padding)*result.scale <= 719.838+1e-6, file+' width');
    assert.ok(((b.maxRow-b.minRow+1)*result.cell+result.padding)*result.scale <= 500+1e-6, file+' height');
}
console.log('board-content-fit: approved samples, shape replacement, side-button avoidance, home and 600 short-screen fits passed');
