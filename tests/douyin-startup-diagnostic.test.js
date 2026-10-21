'use strict';
const assert = require('assert');
const install = require('../scripts/runtime/douyin-startup-diagnostic');
function harness() {
    const host = {}, listeners = {}, timeouts = [], intervals = [], modals = [], logs = [];
    const log = { error() { logs.push(Array.from(arguments)); } };
    const tt = { getLaunchOptionsSync: () => ({ scene: '990001', query: { token: 'NEVER_SERIALIZE' } }),
        onShow: fn => { listeners.show = fn; }, onError: fn => { listeners.error = fn; },
        onUnhandledRejection: fn => { listeners.reject = fn; }, showModal: data => modals.push(data) };
    const timer = { setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); }, setInterval: fn => intervals.push(fn) };
    const api = install(host, tt, log, { version: 'D1', base: 'r2' }, timer);
    const tick = ms => timeouts.filter(item => item.ms === ms).splice(0).forEach(item => item.fn());
    return { host, listeners, log, tt, timer, api, logs, modals, intervals, tick };
}
const a = harness();
assert.equal(install(a.host, a.tt, a.log, {}, a.timer), a.api, 'singleton');
assert.equal(a.api.snapshot().scene, '990001');
a.listeners.show({ scene: '021036', launch_from: 'homepage', location: 'sidebar_card' });
assert.equal(a.api.snapshot().source, '回前台 / 侧边栏');
assert(!JSON.stringify(a.api.snapshot()).includes('NEVER_SERIALIZE'));
a.log.error('[LevelDataLoad] load failed', { message: 'readFile:fail subpackages/homeAssets/import/1b/test.json',
    openid: 'NEVER_SERIALIZE', request: { token: 'SECRET' } });
assert.equal(a.logs.length, 1, 'original logger preserved');
assert(a.api.snapshot().errors[0].text.includes('subpackages/homeAssets/import/1b/test.json'));
a.tick(100);
assert.equal(a.modals.length, 1);
assert(a.modals[0].content.includes('D1'));
assert(a.modals[0].content.includes('021036'));
assert(!a.modals[0].content.includes('NEVER_SERIALIZE'));
a.listeners.error('load failed https://cdn.example/x.json?token=PRIVATE openid=PRIVATE session_key=PRIVATE');
assert(!a.api.snapshot().errors.at(-1).text.includes('PRIVATE'));
a.tick(100); assert.equal(a.modals.length, 1, 'one native modal per entry');
a.listeners.show({ scene: '990001' });
assert.equal(a.api.snapshot().source, '回前台 / 其他入口', 'never retain sidebar source after normal show');
a.listeners.reject({ reason: new Error('startup crash') }); a.tick(100);
assert.equal(a.modals.length, 2);
const b = harness(); b.tick(20000); b.tick(100);
assert.equal(b.modals.length, 1, 'engine never available: native fallback');
assert(b.modals[0].content.includes('尚未建立诊断画面'));

// Engine-backed UI structure: separate camera, survives scene changes by remounting,
// preserves the game's input and shows captured errors without a debug connection.
const nodes = [], sceneListeners = {};
class Node {
    constructor(name) { this.name = name; this.isValid = true; this.active = true; this.parts = new Map(); nodes.push(this); }
    addComponent(Type) { const part = new Type(); part.node = this; this.parts.set(Type, part); return part; }
    getComponent(Type) { return this.parts.get(Type); }
    setPosition(...values) { this.position = values; }
    destroy() { this.isValid = false; }
}
class UITransform { setContentSize(w, h) { this.size = [w, h]; } }
class Canvas {}
class Camera {}
Camera.ProjectionType = { ORTHO: 0 }; Camera.ClearFlag = { DEPTH_ONLY: 6 };
class Label {}
Label.HorizontalAlign = { LEFT: 0 }; Label.VerticalAlign = { TOP: 0 }; Label.Overflow = { SHRINK: 2 };
class Graphics { clear() {} rect(...values) { this.rectangle = values; } fill() {} }
class Color { constructor(...values) { this.rgba = values; } }
let scene = new Node('Home');
const cc = { Node, UITransform, Canvas, Camera, Label, Graphics, Color,
    view: { getVisibleSize: () => ({ width: 720, height: 1560 }) },
    Director: { EVENT_AFTER_SCENE_LAUNCH: 'launch' }, director: {
        getScene: () => scene, on: (name, fn) => { sceneListeners[name] = fn; } } };
const c = harness(); c.api.attachEngine(cc); c.api.attachEngine(cc);
assert.equal(c.intervals.length, 1, 'engine observer installed once');
sceneListeners.launch();
const first = nodes.find(node => node.name === 'D1DiagnosticCanvas');
const camera = nodes.find(node => node.name === 'D1Camera').getComponent(Camera);
assert.equal(camera.priority, 32760); assert.equal(camera.visibility, 1 << 26);
let labels = nodes.map(node => node.getComponent(Label)).filter(Boolean);
assert(labels.some(label => label.string.includes('排查版 D1')));
assert.equal(nodes.find(node => node.name === 'Errors').active, false);
c.log.error('[StartupLoading] game startup failed', new Error('missing resource'));
assert.equal(nodes.find(node => node.name === 'Errors').active, true);
assert(labels.some(label => label.string.includes('missing resource')));
scene = new Node('Game'); sceneListeners.launch();
assert.equal(first.isValid, false);
c.intervals[0]();
labels = nodes.filter(node => node.parent?.isValid).map(node => node.getComponent(Label)).filter(Boolean);
assert(labels.some(label => label.string.includes('画面: Game')));
for (let i = 0; i < 12; i++) c.log.error('error ' + i);
assert.equal(c.api.snapshot().errors.length, 6, 'bounded in-memory history');
console.log('PASS D1: source changes, original logging, redaction, native fallback, scene remount, camera and bounded history (platform/engine mocks).');
