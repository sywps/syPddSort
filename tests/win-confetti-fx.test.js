const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameplayResultPanelController.ts'), 'utf8');
const component = source.slice(source.indexOf("@ccclass('WinConfettiFx')"), source.indexOf('export class GameplayResultPanelController'));
const constants = source.slice(source.indexOf('const WIN_CONFETTI_FX_NAME'), source.indexOf('const REVIVE_SHARE_STATE_KEY'));
// Execute the real particle component; only Cocos rendering objects are replaced.
class Component { enabled = true; }
class Vec3 { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } }
class Color {
    constructor(value) {
        if (typeof value === 'string') this.set(...value.slice(1).match(/../g).map(x => parseInt(x, 16)), 255);
        else Object.assign(this, value);
    }
    set(r, g, b, a = 255) { Object.assign(this, { r, g, b, a }); }
}
class UITransform {
    setContentSize(width, height) { Object.assign(this, { width, height }); }
    convertToNodeSpaceAR(v) { return new Vec3(v.x / this.worldScale - this.offsetX, v.y / this.worldScale - this.offsetY); }
}
class Sprite { static SizeMode = { CUSTOM: 0 }; }
class Node {
    children = []; components = new Map(); active = true; angle = 0;
    constructor(name) { this.name = name; }
    addChild(n) { this.children.push(n); }
    addComponent(T) { const c = new T(); c.node = this; this.components.set(T, c); return c; }
    getComponent(T) { return this.components.get(T); }
    setPosition(x, y, z) { this.position = new Vec3(x, y, z); }
    setScale(x, y, z) { this.scale = new Vec3(x, y, z); }
}
const code = ts.transpileModule(constants + component + '\nreturn WinConfettiFx;', {
    compilerOptions: { target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
}).outputText;
const Fx = new Function('Component', 'Node', 'UITransform', 'Sprite', 'Color', 'Vec3', 'ccclass', code)(
    Component, Node, UITransform, Sprite, Color, Vec3, () => value => value,
);
for (const [width, height, scale] of [[720, 1280, 1], [720, 1600, 0.6], [960, 1280, 1.2]]) {
    const fx = new Fx(); fx.node = new Node('Fx');
    const transform = fx.node.addComponent(UITransform);
    Object.assign(transform, { worldScale: scale, offsetX: 73, offsetY: 91 });
    let rewardTop = -height / 2 + 535;
    const bounds = (y, h) => ({ x: 73 * scale, y: (y + 91) * scale, yMax: (y + h + 91) * scale, height: h * scale });
    const rewards = { getBoundingBoxToWorld: () => bounds(rewardTop - 360, 360) };
    const artworkBottom = -height / 2 + 620;
    const artwork = { getBoundingBoxToWorld: () => bounds(artworkBottom, 475) };
    fx.play([{}, {}, {}], width, height, rewards, artwork);
    assert.equal(fx.node.children.length, 48, 'bounded node pool');
    assert.equal(fx.particles.filter(p => !p.complete).length, 32, 'opening burst retained');
    assert(fx.particles.every(p => p.y >= artworkBottom + 475 * 0.65), 'launch from artwork upper sides');
    const initialRain = fx.configureRainParticle.bind(fx);
    const rainTimes = [];
    fx.configureRainParticle = (particle, sequence) => {
        rainTimes.push(fx.elapsed);
        initialRain(particle, sequence);
        assert(Math.abs(particle.x) >= width * 0.34 && Math.abs(particle.x) <= width * 0.44, 'rain stays near sides');
    };
    let visibleSamples = 0, fadingSamples = 0;
    for (let tick = 0; tick < 361; tick++) {
        if (tick === 120) rewardTop += 110; // Exercise a live layout change.
        if (fx.enabled) fx.update(1 / 60);
        for (const p of fx.particles) {
            if (!p.node.active || !p.sprite.color?.a) continue;
            visibleSamples++;
            assert(p.y - p.radius > rewardTop + 24, 'entire rotating piece stays above rewards');
            if (fx.elapsed > 3.8) {
                assert(p.sprite.color.a <= Math.round(255 * (5 - fx.elapsed) / 1.2), 'global fade before 5s');
                fadingSamples++;
            }
        }
    }
    assert(visibleSamples > 0 && fadingSamples > 0, 'celebration remains visible and fades');
    assert(rainTimes.length >= 2 && rainTimes.length <= 4, 'sparse trailing rain');
    assert(rainTimes.every(t => t >= 1.05 && t < 3), 'no new particles after 3s');
    if (rainTimes.length > 2) assert(rainTimes[2] - rainTimes[1] >= rainTimes[1] - rainTimes[0], 'rain frequency decreases');
    assert.equal(fx.enabled, false, 'updates stop after celebration');
    assert(fx.node.children.every(n => !n.active), 'nothing remains after 5s');
    const stalled = new Fx(); stalled.node = fx.node;
    stalled.play([{}, {}, {}], width, height, rewards, artwork);
    stalled.update(6);
    assert.equal(stalled.enabled, false, 'long frames do not extend the 5s duration');
}
assert(source.includes("getChildByName('BottomGroup')?.getComponent(UITransform)"));
assert(source.includes("getChildByName('PreviewFrame')?.getComponent(UITransform)"));
assert(source.includes('layer.setSiblingIndex(topHud.getSiblingIndex());'), 'top HUD remains above particles');
assert(source.includes('layer.removeFromParent();') && source.includes('layer.destroy();'), 'existing cleanup preserved');
assert(!component.includes('BlockInputEvents') && !component.includes('Button') && !component.includes('tween('), 'noninteractive update-driven effect');
const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/UI/Prefabs/Panels/WinPanel.prefab'), 'utf8'));
const banner = prefab.find(n => n.__type__ === 'cc.Node' && n._name === 'TitleBanner');
assert.equal(banner._lscale.x, 0.855); assert.equal(banner._lscale.y, 0.855);
const artwork = prefab.find(n => n.__type__ === 'cc.Node' && n._name === 'PatternPreview');
assert.equal(artwork._lscale.x, 1); assert.equal(artwork._lscale.y, 1);
const atlasPath = path.join(root, 'assets/GameAssetsBundle/UI/Images/win_confetti_atlas.png');
const atlas = PNG.sync.read(fs.readFileSync(atlasPath));
assert.deepEqual([atlas.width, atlas.height], [128, 128]);
let opaquePixels = 0;
for (let offset = 3; offset < atlas.data.length; offset += 4) if (atlas.data[offset] > 0) opaquePixels++;
assert(opaquePixels > 1000 && opaquePixels < 12000);
const meta = JSON.parse(fs.readFileSync(atlasPath + '.meta', 'utf8'));
assert.equal(meta.userData.hasAlpha, true);
assert.equal(meta.subMetas.f9941.userData.trimType, 'none');
console.log('Confetti runtime simulation passed: 3 sizes/scales, moving reward boundary, 3s stop, 5s fade, banner and atlas checks.');
