const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const vm = require('vm');

class Component {
    get isValid() { return this.node.isValid; }
    get enabledInHierarchy() { return this.node.active && this.node.isValid; }
    schedule() {} unschedule() {}
}
class Node {
    constructor(name) { this.name = name; this.children = []; this.components = []; this.active = true; this.isValid = true; this.layer = 1; }
    addChild(node) { this.children.push(node); }
    setPosition() {}
    setScale() {}
    addComponent(Type) { const c = new Type(); c.node = this; this.components.push(c); c.onEnable?.(); return c; }
    getComponent(Type) { return this.components.find(c => c instanceof Type) || null; }
    getChildByName(name) { return this.children.find(n => n.name === name && n.isValid) || null; }
    getComponentsInChildren(Type) { return [...this.components.filter(c => c instanceof Type), ...this.children.flatMap(n => n.getComponentsInChildren(Type))]; }
    destroy() { this.components.forEach(c => c.onDestroy?.()); this.children.forEach(c => c.destroy()); this.isValid = false; }
}
class UITransform extends Component { setContentSize(w, h) { this.width = w; this.height = h; } }
class Canvas extends Component {}
class Camera extends Component {}
Camera.ProjectionType = { ORTHO: 1 }; Camera.ClearFlag = { SOLID_COLOR: 1 };
class Sprite extends Component {} Sprite.SizeMode = { CUSTOM: 1 };
class Label extends Component {}
class BoardSlotBatchRenderer extends Component {
    configure(cells) { this.cells = cells.map(c => ({ ...c, uv: c.spriteFrame.uv.slice() })); }
    getPreparedCells() { return this.cells; }
    markForUpdateRenderData() {}
}
class Color {}
const textures = [];
class RenderTexture {
    constructor() { this.isValid = true; textures.push(this); }
    reset({ width, height }) { this.width = width; this.height = height; }
    destroy() { this.isValid = false; }
}
class SpriteFrame { constructor() { this.isValid = true; this.uv = [0, 1, 1, 1, 0, 0, 1, 0]; } reset(options) { Object.assign(this, options); } addRef() {} decRef() {} destroy() { this.isValid = false; } }
const scene = new Node('Scene'); scene.addComponent(Canvas);
const screenCamera = scene.addComponent(Camera); screenCamera.visibility = 0xffffffff;
const captures = [], outlines = [];
const cc = { _decorator: { ccclass: () => C => C }, Component, Node, UITransform, Canvas, Camera, Sprite, Label, Color, RenderTexture, SpriteFrame,
    Director: { EVENT_AFTER_DRAW: 'draw' }, director: { getScene: () => scene, once: (_, fn) => {
        const board = scene.getChildByName('CompletedPatternCapture').getChildByName('CompletedBoard');
        captures.push(board.children.map(layer => ({ name: layer.name, cells: layer.children.flatMap(n => (n.getComponent(BoardSlotBatchRenderer)?.cells || []).map(c => ({size:c.size, frame:c.spriteFrame, layer:n.layer, uv:Array.from(c.uv)}))) })));
        queueMicrotask(fn);
    }, off() {} } };
const source = fs.readFileSync('assets/Scripts/Core/CompletedPatternPreview.ts', 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
const errors = [], exportsObject = {};
const metrics = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/Scripts/Core/GameplayBoardVisualMetrics.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: metrics, require: () => ({ DEFAULT_CELL_SIZE: 62, PINDD_BEAN_TO_SLOT_RATIO: (121 / 134) * 0.9 }) });
vm.runInNewContext(output, { exports: exportsObject, require: name => name === 'cc' ? cc
    : name.endsWith('GameplayBoardVisualMetrics') ? metrics
    : name.endsWith('BoardSlotBatchRenderer') ? { BoardSlotBatchRenderer, BOARD_SLOT_BATCH_MAX_CELLS: 1024 }
    : { buildBoardOutline: (...args) => outlines.push(args) }, setTimeout, clearTimeout, console: { error: (...args) => errors.push(args) } });
const { renderCompletedPatternPreview: render, CompletedPatternPreview: View } = exportsObject;
const frame = new SpriteFrame(); frame.texture = { isValid: true, addRef() {}, decRef() {} };
const slotFrame = new SpriteFrame(); slotFrame.texture = { isValid: true, addRef() {}, decRef() {} };
let skin = 2000, loads = 0;
const runtime = { getEquippedBeanSkinId: () => skin, getPinddColorKey: c => `c${c}`,
    _bootstrapAtlasFrameCache: new Map([[ 'c1_1', frame ], ['c2_1', frame], ['c1_4', slotFrame], ['c2_4', slotFrame]]),
    _ensureBeanSkinAtlasLoaded: (_, done) => { loads++; done(true); } };
const options = { name: 'Pattern', maxW: 475, maxH: 475 };
const holder = () => { const n = new Node('Card'); scene.addChild(n); return n; };
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

(async () => {
    const a = render(holder(), [[1, 2]], options, runtime);
    const b = render(holder(), [[1, 2]], options, runtime);
    await settle();
    assert.equal(loads, 1, 'simultaneous identical requests must coalesce');
    assert.strictEqual(a.getComponent(Sprite).spriteFrame, b.getComponent(Sprite).spriteFrame);
    assert.equal(a.getComponent(View).entry.refs, 2);
    assert.equal(captures[0][0].name, 'BoardSlots');
    assert.equal(captures[0][0].cells.length, 2, 'each filled position needs its target cell');
    assert.notStrictEqual(captures[0][0].cells[0].frame, slotFrame, 'capture must not mutate live board SpriteFrames');
    assert.strictEqual(captures[0][0].cells[0].frame.texture, slotFrame.texture);
    assert.equal(captures[0][0].cells[0].size, 62);
    assert.deepEqual(captures[0][0].cells[0].uv, [0.02, 0.98, 0.02, 0.98, 0.02, 0.98, 0.02, 0.98], 'preview slots sample the outer background uniformly');
    assert.deepEqual(captures[0][1].cells[0].uv, frame.uv, 'bean texture details remain unchanged');
    assert.deepEqual(slotFrame.uv, [0, 1, 1, 1, 0, 0, 1, 0], 'live slot frame UVs remain unchanged');
    assert.equal(captures[0][1].cells[0].size, 50, 'completed beans must not fill the entire target cell');
    assert.equal(outlines.length, 0, 'shared Home, collection and win previews omit gameplay outlines');
    assert.deepEqual(captures[0].map(layer => layer.name), ['BoardSlots', 'CompletedBeans']);
    for (let dim = 1; dim <= 120; dim++) {
        const padding = dim > 20 ? 8 : 28;
        const expected = Math.max(dim > 48 ? 6 : dim > 32 ? 8 : 12, Math.min(62, Math.floor((660 - padding) / dim)));
        assert.equal(metrics.getBoardCellSize(dim, dim), expected, 'preserve gameplay board sizing');
        assert.equal(metrics.getBoardBeanSize(expected), Math.max(4, Math.min(Math.max(6, Math.round(expected * (121 / 134) * 0.9)), expected <= 10 ? Math.max(4, expected - 1) : expected)));
    }
    assert.equal(screenCamera.visibility, -1, 'screen camera visibility restored');
    assert.equal(scene.children.filter(n => n.name === 'CompletedPatternCapture' && n.isValid).length, 0);
    a.destroy(); b.destroy();

    const recycledCard = holder();
    const c = render(recycledCard, [[2]], options, runtime);
    render(recycledCard, [[1, 1]], options, runtime);
    await settle();
    assert.equal(c.getComponent(View).entry.refs, 1, 'rebind must not leak a reference');
    c.destroy();

    const before = textures.length;
    const cancelled = render(holder(), [[2, 2, 2]], options, runtime); cancelled.destroy();
    await settle();
    assert.equal(textures.length, before, 'cancelled queued request must not render');

    for (let i = 3; i < 43; i++) {
        const node = render(holder(), [Array(i).fill(1)], options, runtime);
        await settle();
        assert.ok(node.getComponent(Sprite)?.spriteFrame, 'each live request should complete');
        node.destroy();
    }
    assert.ok(textures.filter(t => t.isValid).length <= 8, '512px idle cache must stay within 8 MiB');

    const previous = render(holder(), [[1]], options, runtime); await settle();
    const old = previous.getComponent(Sprite).spriteFrame;
    skin = 2001; runtime._activeBeanSkinAtlasOwner = { skinId: skin, frames: runtime._bootstrapAtlasFrameCache };
    previous.getComponent(View).checkSkin(); await settle();
    assert.notStrictEqual(previous.getComponent(Sprite).spriteFrame, old, 'skin selection changes cache key');
    previous.destroy();
    assert.equal(errors.length, 0, 'successful and cancelled requests must not report errors');

    const invalid = render(holder(), [[99]], options, runtime); await settle();
    assert.equal(invalid.getChildByName('Status').getComponent(Label).string, '图案加载失败');
    assert.equal(errors.length, 1, 'missing artwork must report failure');
    assert.ok(!invalid.getComponent(Sprite)?.spriteFrame, 'no fabricated artwork on failure');
    // Fail before rendering, after only some source references have been acquired.
    let held = 0;
    frame.addRef = () => { held++; };
    frame.decRef = () => { held--; };
    const originalSlotAdd = slotFrame.addRef;
    const originalSlotDec = slotFrame.decRef;
    slotFrame.addRef = () => { throw new Error('injected addRef failure'); };
    slotFrame.decRef = () => { throw new Error('unacquired frame was released'); };
    const assertCleanFailure = node => {
        assert.equal(node.getChildByName('Status').getComponent(Label).string, '图案加载失败');
        assert.equal(scene.children.filter(n => n.name === 'CompletedPatternCapture' && n.isValid).length, 0);
        assert.equal(screenCamera.visibility, -1, 'restore screen camera on failure');
        assert.equal(held, 0, 'release only successfully acquired references');
        assert.equal(textures.at(-1).isValid, false, 'failed render texture must be destroyed');
    };
    const failedRef = render(holder(), [[1, 2, 1, 2]], options, runtime); await settle();
    assertCleanFailure(failedRef);
    slotFrame.addRef = originalSlotAdd; slotFrame.decRef = originalSlotDec;
    const originalReset = RenderTexture.prototype.reset;
    RenderTexture.prototype.reset = () => { throw new Error('injected texture failure'); };
    const failedTexture = render(holder(), [[2, 1, 2, 1]], options, runtime); await settle();
    assertCleanFailure(failedTexture);
    RenderTexture.prototype.reset = originalReset;
    await failedTexture.getComponent(View).refresh();
    assert.ok(failedTexture.getComponent(Sprite)?.spriteFrame, 'failed request can retry successfully');
    assert.equal(held, 0);
    assert.equal(errors.length, 3, 'injected failures stay visible');
    console.log('completed-pattern-preview.test.js passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
