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
new Function('exports', 'Vec2', 'Vec3', 'ZOOM_HINT_SCALE_HEADROOM', 'RANKED_PVP_BOARD_CENTER_OFFSET_Y', js)(mod.exports, Vec2, Vec3, .06, -28);
function fit(data, options = {}) {
    const max = Math.max(data.boardWidth, data.boardHeight), padding = max > 20 ? 8 : 28;
    const cell = Math.max(max > 48 ? 6 : max > 32 ? 8 : 12, Math.min(62, Math.floor((660 - padding) / max)));
    const viewport = { setScaleBounds(min, max) { this.min = min; this.max = max; },
        setViewTransformClamped(scale, offset) { this.scale = Math.max(this.min, Math.min(this.max, scale)); this.offset = offset; },
        setHomeFromCurrent() {}, getHomeTransform() { return { scale: this.scale, offset: this.offset }; } };
    const h = new mod.exports.Harness();
    h.runtime = { levelData: data, cellSize: cell, cellGap: 0, boardViewport: viewport,
        constructor: { MIN_SCALE: .8, MAX_SCALE: 2.2, BOARD_PLAYABLE_CELL_UI_SIZE: 44, BOARD_DYNAMIC_MAX_SCALE_CAP: 6.5 },
        getBoardInitialFitRect: () => options.rect || { left: -359.919, right: 359.919, top: 632.8180152671755, bottom: -335.47501526717565 },
        shouldUseContentAwareInitialFit: () => true,
        getBoardInitialFitObstacles: () => options.obstacles || [] };
    h.fitBoardViewportToSafeRect(data.boardWidth, data.boardHeight, padding);
    return { scale: viewport.scale, offset: viewport.offset, cell, padding, h };
}
const level = id => JSON.parse(fs.readFileSync(path.join(root, 'assets/LevelData/level_' + id + '.json')));
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
for (const file of fs.readdirSync(path.join(root, 'assets/LevelData')).filter(n => /^level_\d+\.json$/.test(n))) {
    const data = JSON.parse(fs.readFileSync(path.join(root, 'assets/LevelData', file)));
    const result = fit(data, { rect: { left: -359.919, right: 359.919, top: 380, bottom: -120 } });
    const b = result.h.getTargetContentBounds(data.correctColorArr, data.boardWidth, data.boardHeight);
    assert.ok(((b.maxCol-b.minCol+1)*result.cell+result.padding)*result.scale <= 719.838+1e-6, file+' width');
    assert.ok(((b.maxRow-b.minRow+1)*result.cell+result.padding)*result.scale <= 500+1e-6, file+' height');
}
console.log('board-content-fit: approved samples, shape replacement, side-button avoidance, home and 600 short-screen fits passed');
