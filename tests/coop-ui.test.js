'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
class Node {
    constructor(name) { this.name = name; this.children = []; this.isValid = true; this.components = new Map(); this.handlers = {}; }
    addChild(node) { node.parent = this; this.children.push(node); }
    addComponent(Type) { const value = new Type(); value.node = this; value.isValid = true; this.components.set(Type, value); return value; }
    getComponent(Type) { return this.components.get(Type); }
    getChildByName(name) { return this.children.find(child => child.name === name); }
    setPosition(x, y) { this.position = { x, y }; }
    on(name, callback) { this.handlers[name] = callback; }
    removeFromParent() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
    destroy() { this.isValid = false; for (const value of this.components.values()) value.isValid = false; this.children.forEach(child => child.destroy()); this.removeFromParent(); }
}
class Label {}
Label.HorizontalAlign = Label.VerticalAlign = { CENTER: 0 }; Label.Overflow = { SHRINK: 0 };
class UITransform { setContentSize(width, height) { this.width = width; this.height = height; } setAnchorPoint() {} }
class ScrollView { static EventType = { SCROLL_TO_BOTTOM: 'bottom' }; }
class Graphics { rect() {} roundRect() {} fill() {} }
class Button {}
Button.EventType = { CLICK: 'click' };
class Color { constructor(hex) { this.hex = hex; } }
Color.WHITE = new Color('#fff');
const root = new Node('OverlayRoot'), calls = [], images = [];
const catalog = require('../assets/GameAssetsBundle/coop-manifest.json').levels;
const post = { id: 'a'.repeat(24), levelId: 7, creatorName: 'A', creatorDone: true, published: false, completedCount: 0 };
const mgr = {
    isLocalSimulation: () => false,
    catalog: async () => catalog,
    fullLevel: async (_runtime, id) => require(`../cloudfunctions/coopService/levels/coop_level_${id}.json`),
    overview: async () => ({ overview: { activeCreated: null, activeJoined: null, unlocked: { coop_original_01: 1 } } }),
    prepare: async (...args) => calls.push(['prepare', args[1], args[2]]),
    call: async (action, args) => {
        calls.push([action, args]);
        if (action === 'square') return { posts: [post], next: '' };
        if (action === 'detail') return { post, run: null, isCreator: false };
        if (action === 'join') return { post, run: { id: 'runB', role: 'collaborator', status: 'playing' } };
        if (action === 'history') return { runs: Array.from({ length: args.cursor ? 1 : 20 }, () => ({ postId: post.id, role: 'creator', status: 'complete' })), next: args.cursor ? '' : 'more' };
        throw new Error(`unexpected ${action}`);
    },
};
const app = { markGameRequested: (...args) => calls.push(['route', ...args]), router: { toGame: async () => calls.push(['game']) } };
const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/Panels/CoopPanelController.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', 'require', code)(loaded, loaded.exports, id => {
    if (id === 'cc') return { Node, Label, UITransform, Graphics, Button, Color, ScrollView, Mask: class {}, BlockInputEvents: class {}, Layers: { Enum: { UI_2D: 1 } }, view: { getVisibleSize: () => ({ width: 720, height: 1280 }) } };
    if (id.endsWith('CoopServiceMgr')) return { CoopServiceMgr: { inst: mgr } };
    if (id.endsWith('AppRoot')) return { AppRoot: { ensure: () => app } };
    if (id.endsWith('CoopModeConfig')) return require('../cloudfunctions/coopService/runtime/CoopModeConfig');
    if (id.endsWith('PixelPosterPreviewRenderer')) return { releasePixelPosterPreviewTree() {}, renderPixelPosterPreview: (...args) => images.push(args) };
    throw new Error(id);
});
const findAll = (node, name) => [node, ...node.children.flatMap(child => findAll(child, name))].filter(item => item.name === name);
const click = name => { const nodes = findAll(root, name); assert.equal(nodes.length, 1, `${name} exists exactly once`); nodes[0].handlers.click(); };
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

async function main() {
    const panel = new loaded.exports.CoopPanelController({ requireCanvasUiRoot: () => root });
    panel.open(); await settle();
    assert.equal(findAll(root, '发起合作').length, 6);
    assert.equal(images.length, 6, 'first batch renders six level patterns');
    assert.equal(images[0][2].grayscale, false, 'earned pattern remains in color');
    assert(images.slice(1).every(([, , options]) => options.grayscale), 'unfinished patterns use gallery grayscale');
    assert.equal(findAll(root, '下一页').length, 0);
    assert(findAll(root, '参与记录')[0].position.x > 0);
    assert(findAll(root, '参与记录')[0].position.y > 500);
    const scroll = findAll(root, 'CoopScroll')[0];
    scroll.handlers.bottom(); scroll.handlers.bottom(); await settle();
    assert.equal(findAll(root, '发起合作').length, 10, 'bottom appends remaining patterns without duplicates');
    assert(images.slice(6).every(([, , options]) => options.grayscale), 'loaded-more unfinished patterns are also gray');
    assert.equal(findAll(root, 'CoopCard1').length, 1, 'previous rows remain after loading more');
    scroll.handlers.bottom(); await settle();
    assert.equal(findAll(root, '发起合作').length, 10, 'end of list does not reload');
    assert.equal(findAll(root, '合作图鉴').length, 0, 'collection is accessed from the home gallery only');
    click('参与记录'); await settle();
    assert.equal(findAll(root, '我发起 · 已完成').length, 20);
    const historyScroll = findAll(root, 'CoopScroll')[0];
    historyScroll.handlers.bottom(); historyScroll.handlers.bottom(); await settle();
    assert.equal(findAll(root, '我发起 · 已完成').length, 21, 'server cursor appends records');
    assert.equal(calls.filter(call => call[0] === 'history').length, 2, 'only one request per cursor');
    click('合作广场'); await settle();
    assert.equal(historyScroll.isValid, false, 'switching tabs destroys the previous scroll list');
    assert(images.some(([, grid, options]) => grid[0].length === 32 && options.grayscale === true), 'square displays unfinished half separately');
    click('帮他完成'); await settle();
    click('开始帮忙'); await settle();
    assert(calls.some(call => call[0] === 'join' && call[1].postId === post.id));
    assert(calls.some(call => call[0] === 'route' && call[5] === 'pixel-coop'));
    assert(calls.some(call => call[0] === 'game'));
    panel.close(); assert.equal(root.children.length, 0);
    mgr.overview = async () => { throw new Error('云服务断开'); };
    panel.open(); await settle();
    assert(findAll(root, 'Text').some(node => node.getComponent(Label).string === '云服务断开'), 'cloud errors are visible');
    assert.equal(findAll(root, '发起合作').length, 0, 'no false offline success');
    panel.close();
    const modeSource = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/GameCtrlModules/CoopModeModule.ts'), 'utf8');
    const modeCode = ts.transpileModule(modeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const modeModule = { exports: {} };
    app.session = { activeGameplayContext: { routeReason: 'pixel-coop' } };
    mgr.active = { post, run: { role: 'creator', status: 'playing' } };
    let finishSave;
    mgr.flushAll = () => new Promise(resolve => { finishSave = () => { mgr.active.run.status = 'complete'; resolve(); }; });
    mgr.share = () => calls.push(['share']);
    mgr.call = async (action, data) => { calls.push([action, data]); return {}; };
    new Function('module', 'exports', 'require', modeCode)(modeModule, modeModule.exports, id => {
        if (id === 'cc') return { Label, Graphics, Color, BlockInputEvents: class {} };
        if (id.endsWith('AppRoot')) return { AppRoot: { tryGet: () => app } };
        if (id.endsWith('CoopServiceMgr')) return { CoopServiceMgr: { inst: mgr } };
        if (id.endsWith('CoopModeConfig')) return require('../cloudfunctions/coopService/runtime/CoopModeConfig');
        if (id.endsWith('CoopPanelController')) return loaded.exports;
        if (id.endsWith('PixelPosterPreviewRenderer')) return { releasePixelPosterPreviewTree() {}, renderPixelPosterPreview: (...args) => images.push(args) };
        throw new Error(id);
    });
    const runtime = { requireCanvasUiRoot: () => root, unschedule() {}, _pchConveyorGameplayController: { pauseForSettlement() {} } };
    modeModule.exports.installCoopModeModule(runtime);
    const full = require('../assets/LevelData/coop_level_1.json');
    mgr.active.full = full;
    mgr.active.half = { boardWidth: full.boardWidth / 2 };
    runtime.boardNode = new Node('Board'); runtime.cellSize = 10; runtime.cellGap = 0;
    const originalGrid = JSON.stringify(full.correctColorArr);
    runtime.mountCoopBoardPartner();
    let partner = runtime.boardNode.getChildByName('CoopPartnerHalf');
    assert.equal(partner.position.x, 320, 'creator sees the partner half on the right');
    assert(partner.getChildByName('PartnerMask'), 'creator partner half is masked');
    assert.equal(images.at(-1)[2].grayscale, true, 'creator sees a gray pattern underneath the mask');
    assert.deepEqual(images.at(-1)[1], full.correctColorArr.map(row => row.slice(32)));
    assert.equal(runtime.getCoopBoardContentBounds().maxCol, 63, 'fit includes both halves');
    runtime.mountCoopBoardPartner();
    assert.equal(partner.isValid, false, 'rebuild releases the old display');
    assert.equal(runtime.boardNode.children.length, 1);
    mgr.active.run.role = 'collaborator';
    runtime.mountCoopBoardPartner();
    partner = runtime.boardNode.getChildByName('CoopPartnerHalf');
    assert.equal(partner.position.x, -320, 'collaborator sees completed creator half on the left');
    assert.equal(partner.getChildByName('PartnerMask'), undefined);
    assert.equal(images.at(-1)[2].grayscale, false, 'collaborator sees completed partner half in color');
    assert.deepEqual(images.at(-1)[1], full.correctColorArr.map(row => row.slice(0, 32)));
    assert.equal(runtime.getCoopBoardContentBounds().minCol, -32);
    assert.equal(JSON.stringify(full.correctColorArr), originalGrid, 'display never mutates gameplay data');
    runtime.clearCoopBoardPartner();
    mgr.active.run.role = 'creator';
    assert.equal(runtime.handleCoopTerminal(false), false, 'failure uses the ordinary revive flow');
    assert.equal(root.children.length, 0);
    assert.equal(runtime.handleCoopTerminal(true), true);
    assert.equal(findAll(root, '分享给好友')[0].active, false, 'sharing waits for confirmed save');
    finishSave(); await settle();
    assert.equal(findAll(root, '分享给好友')[0].active, true);
    assert.equal(findAll(root, '发布到广场')[0].active, true);
    click('分享给好友'); click('发布到广场'); await settle();
    assert(calls.some(call => call[0] === 'share'));
    assert(calls.some(call => call[0] === 'publish' && call[1].published));
    mgr.active = { post, run: { status: 'playing' }, completed: false, error: '', elapsedMs: 0, events: Array(2500).fill([0, 1, 0]) };
    mgr.flushAll = () => { throw new Error('must not save incomplete gameplay'); };
    mgr.persist = () => { throw new Error('must not persist process data'); };
    runtime.isGameEnd = false;
    const blocked = [];
    runtime._pchConveyorGameplayController = { isActive: () => true, isSettingsPaused: () => false,
        isPresentationPaused: () => false, setExternalInputBlocked: value => blocked.push(value),
        pauseForSettings() {}, resumeAfterSettings() {} };
    runtime.updateCoopClock(10);
    assert.equal(mgr.active.elapsedMs, 10000);
    assert.equal(blocked[0], false, 'no save-batch pause after 2000 events');
    runtime.flushCoopOnHide();
    runtime.disposeCoop();
    app.requestHomeRoute = async () => {};
    await runtime.leaveCoop();
    assert.equal(mgr.active, null, 'leaving discards in-memory attempt without saving');
    mgr.isLocalSimulation = () => true;
    mgr.localPlayer = 'A';
    mgr.switchLocalPlayer = () => { mgr.localPlayer = 'B'; };
    mgr.localInvitation = () => '';
    mgr.overview = async () => ({ overview: { activeCreated: null, activeJoined: null, unlocked: {} } });
    panel.open(); await settle();
    assert.equal(findAll(root, '本地玩家 A · 切换').length, 1);
    click('本地玩家 A · 切换'); await settle();
    assert.equal(findAll(root, '本地玩家 B · 切换').length, 1);
    click('打开模拟邀请');
    assert(findAll(root, 'Text').some(node => node.getComponent(Label).string.includes('先完成半图并点击分享')));
    panel.close();
    console.log('COOP_UI_TESTS_PASSED: real catalog, page cleanup, no lobby gallery entry, square join and gameplay route, explicit cloud error');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
