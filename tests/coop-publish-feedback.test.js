const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
class Node {
    isValid = true; active = true; children = []; components = new Map();
    constructor(name) { this.name = name; }
    addChild(n) { this.children.push(n); }
    setPosition() {}
    addComponent(T) { const c = new T(); c.isValid = true; this.components.set(T, c); return c; }
    getComponent(T) { return this.components.get(T); }
    getChildByName(n) { return this.children.find(c => c.name === n); }
    on(event, action) { this.click = action; }
}
class Label { static HorizontalAlign = { CENTER: 0 }; static VerticalAlign = { CENTER: 0 }; static Overflow = { SHRINK: 0 }; }
class Button { static EventType = { CLICK: 'click' }; interactable = true; }
Button.Transition = { SCALE: 3 };
class Graphics { roundRect() {} fill() {} }
class UITransform { setContentSize() {} }
class Color { static WHITE = {}; }
const cc = { Node, Label, Button, Graphics, UITransform, Color, Layers: { Enum: { UI_2D: 1 } }, BlockInputEvents: class {} };
let mgr, panelExports;
const sounds = [];
function load(file) {
    const exports = {};
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
    } }).outputText;
    new Function('exports', 'require', js)(exports, id => {
        if (id.endsWith('/AudioMgr')) return { AudioMgr: { inst: { play: name => sounds.push(name) } } };
        if (id === 'cc') return cc;
        if (id.endsWith('/CoopServiceMgr')) return { CoopServiceMgr: { get inst() { return mgr; } } };
        if (id.endsWith('/CoopPanelController')) return panelExports;
        if (id.endsWith('/AnalyticsMgr')) return { AnalyticsMgr: { inst: {
            beginSettlement() {}, finishMultiplayerAnalytics() {}, settlement: { shown() {} },
        } } };
        return {};
    });
    return exports;
}
panelExports = load('assets/Scripts/Core/Panels/CoopPanelController.ts');
const { installCoopModeModule } = load('assets/Scripts/Core/GameCtrlModules/CoopModeModule.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
    const requests = [], toasts = [];
    const post = { id: 'test-post', levelId: 1, creatorDone: true, published: false };
    const run = { role: 'creator', status: 'complete' };
    mgr = { active: { post, run }, flushAll: async () => {}, call(action, data) {
        if (action === 'detail') return Promise.resolve({ post, run, isCreator: true });
        return new Promise((resolve, reject) => requests.push({ action, data, resolve, reject }));
    } };
    return { requests, toasts, post, run, runtime: { showToast: text => toasts.push(text) } };
}
async function main() {
    for (const failFirst of [false, true]) {
        const h = setup(), overlay = new Node('Overlay');
        const runtime = { ...h.runtime, requireCanvasUiRoot: () => overlay, unschedule() {} };
        installCoopModeModule(runtime); runtime.isCoopMode = () => true;
        assert.equal(runtime.handleCoopTerminal(true), true); await tick();
        const panel = overlay.getChildByName('CoopResult'), publish = panel.getChildByName('发布到广场');
        const text = publish.getChildByName('Text').getComponent(Label), button = publish.getComponent(Button);
        const beforeSound = sounds.length;
        publish.click(); publish.click();
        assert.equal(sounds.length, beforeSound + 1, 'busy publish click must not double-play');
        assert.equal(h.requests.length, 1); assert.equal(text.string, '发布中…'); assert.equal(button.interactable, false);
        if (failFirst) {
            h.requests[0].reject(Error('test network failure')); await tick();
            assert.equal(text.string, '重新发布'); assert.equal(button.interactable, true);
            assert.equal(h.post.published, false); assert.equal(h.toasts.length, 0);
            publish.click();
        }
        h.requests.at(-1).resolve({ ok: true }); await tick();
        assert.equal(text.string, '已发布到广场'); assert.equal(button.interactable, false);
        assert.equal(h.post.published, true); assert.match(h.toasts[0], /发布成功/);
        assert.match(panel.children[0].getComponent(Label).string, /发布成功/);
    }
    for (const failFirst of [false, true]) {
        const h = setup(), p = new panelExports.CoopPanelController(h.runtime);
        p.root = new Node('CoopLobby'); p.body = new Node('Body'); p.status = { isValid: true, string: '' };
        p.reset = () => ++p.revision; p.picture = async () => {};
        await p.detail('test-post');
        const publish = p.body.getChildByName('发布到广场'), text = publish.getChildByName('Text').getComponent(Label);
        publish.click(); publish.click();
        assert.equal(h.requests.length, 1); assert.equal(text.string, '发布中…');
        assert.match(p.status.string, /正在发布/);
        if (failFirst) {
            h.requests[0].reject(Error('test network failure')); await tick();
            assert.equal(h.post.published, false); assert.match(p.status.string, /失败/);
            assert.equal(text.string, '发布到广场'); publish.click();
        }
        h.requests.at(-1).resolve({ ok: true }); await tick();
        assert.equal(h.post.published, true); assert.match(p.status.string, /发布成功/);
        assert.equal(text.string, '从广场撤下'); assert.match(h.toasts[0], /发布成功/);
        publish.click(); assert.equal(text.string, '撤下中…');
        h.requests.at(-1).resolve({ ok: true }); await tick();
        assert.equal(h.post.published, false); assert.match(p.status.string, /已从合作广场撤下/);
    }
    console.log('coop publish feedback passed: pending, success, retry, withdrawal and double-click protection');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
