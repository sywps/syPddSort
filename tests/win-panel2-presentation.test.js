const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const vector = (x = 0, y = 0, z = 0) => ({ x, y, z, clone() { return vector(x, y, z); } });
class Component { constructor() { this.isValid = true; this.enabled = true; } }
class Node {
    static EventType = { SIZE_CHANGED: 'size-changed' };
    constructor(name) { this.name = name; this.children = []; this.components = []; this.isValid = true; this.active = true; this.activeInHierarchy = true; this.scale = vector(1, 1, 1); this.eulerAngles = vector(); }
    getComponent(type) { return this.components.find(c => c instanceof type) || null; }
    getComponents(type) { return this.components.filter(c => c instanceof type); }
    getComponentsInChildren(type) { return [...this.getComponents(type), ...this.children.flatMap(n => n.getComponentsInChildren(type))]; }
    getChildByName(name) { return this.children.find(n => n.name === name); }
    getChildByPath(path) { return path.split('/').reduce((n, part) => n?.getChildByName(part), this); }
    setScale(x, y, z) { this.scale = typeof x === 'object' ? x.clone() : vector(x, y, z); }
    setRotationFromEuler(value) { this.eulerAngles = value.clone(); }
    on() {} off() {}
}
class UITransform extends Component { setContentSize(width, height) { this.width = width; this.height = height; } }
class Widget extends Component { updateAlignment() {} }
class Canvas extends Component {}
class Sprite extends Component {}
class Label extends Component {}
class UIOpacity extends Component { constructor() { super(); this.opacity = 255; } }
class Animation extends Component { play(name) { this.played = name; this.running = true; } stop() { this.running = false; } }
class AudioSource extends Component { play() { this.running = true; } stop() { this.running = false; } }
class ParticleSystem2D extends Component { resetSystem() { this.resets = (this.resets || 0) + 1; this.running = true; } stopSystem() { this.running = false; } }
class SpriteFrame { constructor() { this.isValid = true; } destroy() { this.isValid = false; } }
class Rect { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }
class Size { constructor(width, height) { Object.assign(this, { width, height }); } }
class Color { constructor(...value) { this.value = value; } }
let sfx = true;
const activeTweens = new Set();
const cc = { Node, Component, UITransform, Widget, Canvas, Sprite, Label, UIOpacity, Animation, AudioSource, ParticleSystem2D, SpriteFrame, Rect, Size, Color,
    _decorator: { ccclass: () => value => value, property: () => () => {} },
    Tween: { stopAllByTarget: node => activeTweens.delete(node) },
    tween: node => ({ by() { return this; }, repeatForever() { return this; }, start() { activeTweens.add(node); } }),
};
const output = ts.transpileModule(fs.readFileSync('assets/Scripts/Core/WinPanel2Presentation.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(output, { exports: mod.exports, require: name => name === 'cc' ? cc : { AudioMgr: { inst: { isSfxEnabled: () => sfx } } } });
const raw = JSON.parse(fs.readFileSync('assets/GameAssetsBundle/UI/Prefabs/Panels/WinPanel2.prefab', 'utf8'));
function load(id) {
    const data = raw[id], node = new Node(data._name);
    node.active = data._active;
    node.scale = vector(data._lscale.x, data._lscale.y, data._lscale.z);
    for (const ref of data._components) {
        const entry = raw[ref.__id__], Type = cc[entry.__type__.replace('cc.', '')];
        if (!Type) continue;
        const component = new Type(); component.node = node;
        if (Type === UITransform) component.setContentSize(entry._contentSize.width, entry._contentSize.height);
        if (Type === Animation) component.defaultClip = { name: node.name === 'Sweep' ? 'WinPanel2Sweep' : 'WinPanel2Entrance' };
        if (Type === AudioSource) component.clip = {};
        if (Type === ParticleSystem2D) component.spriteFrame = {};
        if (Type === UIOpacity) component.opacity = entry._opacity;
        node.components.push(component);
    }
    node.children = data._children.map(r => load(r.__id__));
    node.children.forEach(n => n.parent = node);
    return node;
}
const panel = load(1), canvas = new Node('Canvas');
canvas.components.push(new Canvas()); panel.parent = canvas; panel.scene = { name: 'PreviewScene' };
const rootOpacity = new UIOpacity(); rootOpacity.opacity = 0; panel.components.push(rootOpacity);
const presentation = new mod.exports.WinPanel2Presentation(); presentation.node = panel;
presentation.confettiAtlas = { texture: {}, rotated: false, rect: new Rect(0, 0, 128, 128) };
presentation.streakBadges = Array.from({ length: 3 }, () => new SpriteFrame());
presentation.onLoad();
assert.equal(rootOpacity.opacity, 0, 'loading gate stays hidden until artwork is ready');
assert.strictEqual(panel.getComponent(Widget).target, panel.scene, 'full-screen Widget uses viewport, not fixed-size preview Canvas');
const particles = panel.getComponentsInChildren(ParticleSystem2D);
assert.equal(particles.length, 27);
assert.equal(new Set(particles.map(p => p.spriteFrame)).size, 3, 'only three shared slices are allocated');
assert(particles.every(p => p.spriteFrame.texture === presentation.confettiAtlas.texture));
const fill = panel.getChildByPath('Box/BottomGroup/WinStreakBar/Fill').getComponent(Sprite);
const badge = panel.getChildByPath('Box/BottomGroup/PrimaryBtn/WinStreakBadge').getComponent(Sprite);
for (const [streak, fraction, tier] of [[0, 0, 0], [1, 1 / 6, 0], [3, .5, 1], [6, 1, 2], [12, 1, 2]]) {
    presentation.setWinStreak(streak); assert.equal(fill.fillRange, fraction); assert.strictEqual(badge.spriteFrame, presentation.streakBadges[tier]);
}
assert.throws(() => presentation.setWinStreak(-1), /invalid win streak/);
assert.throws(() => presentation.setWinStreak(1.5), /invalid win streak/);
panel.getComponent(UITransform).height = 960;
presentation.play();
assert.equal(panel.getChildByName('Box').scale.x, .75, 'replay preserves compact viewport fit');
assert(particles.every(p => p.running)); assert.equal(activeTweens.size, 1);
presentation.playSweep(); assert(panel.getChildByPath('Box/MiddleGroup/Sweep').getComponent(Animation).running);
presentation.play(); assert.equal(activeTweens.size, 1, 'replay does not accumulate light tweens');
assert(!panel.getChildByPath('Box/MiddleGroup/Sweep').active, 'replay resets sweep until its timed event');
sfx = false; presentation.update(); assert(panel.getComponents(AudioSource).every(a => !a.running));
presentation.onDisable(); assert.equal(activeTweens.size, 0); assert(particles.every(p => !p.running));
assert(!panel.getChildByName('Confetti').active);
const frames = particles.map(p => p.spriteFrame);
presentation.onDestroy(); assert(frames.every(f => !f.isValid));
console.log('PASS WinPanel2: shared own-atlas slices, streak thresholds, viewport fit, replay, mute, cleanup, artwork opacity gate.');
