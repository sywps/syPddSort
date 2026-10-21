const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const scene = JSON.parse(fs.readFileSync(path.join(root, 'assets/BootstrapBundle/Scenes/Game.scene'), 'utf8'));
const templateIndex = scene.findIndex(n => n.__type__ === 'cc.Node' && n._name === 'TutorialGuideCorgiBubble');
assert(templateIndex >= 0);
assert.equal(scene[templateIndex]._active, false, 'the asset template must never render by itself');
const types = {};
class UITransform { setContentSize(width, height) { Object.assign(this, { width, height }); } }
class Sprite {}
class Skeleton {
    findAnimation(name) { return this.skeletonData.animations[name]; }
    setAnimation(track, name, loop) { this.playing = { track, name, loop }; }
}
Object.assign(types, { 'cc.UITransform': UITransform, 'cc.Sprite': Sprite, 'sp.Skeleton': Skeleton });
class Node {
    constructor(name) { this.name = name; this.children = []; this.components = new Map(); this.isValid = true; }
    addChild(node) { this.children.push(node); node.parent = this; }
    getChildByName(name) { return this.children.find(n => n.name === name); }
    getComponent(type) { return this.components.get(type); }
    setPosition(x, y, z) { this.position = { x, y, z }; }
    setScale(x, y, z) { this.scale = { x, y, z }; }
    destroy() { this.isValid = false; }
}
const spineDir = path.join(root, 'assets/BootstrapBundle/Effects/GuideCorgi');
const skeletonData = JSON.parse(fs.readFileSync(path.join(spineDir, 'corgi.json'), 'utf8'));
const skeletonMeta = JSON.parse(fs.readFileSync(path.join(spineDir, 'corgi.json.meta'), 'utf8'));
function hydrate(index) {
    const data = scene[index], node = new Node(data._name);
    node.active = data._active; node.position = { ...data._lpos };
    for (const ref of data._components) {
        const record = scene[ref.__id__], Type = types[record.__type__];
        assert(Type, 'unexpected template component');
        const component = new Type();
        if (Type === UITransform) component.setContentSize(record._contentSize.width, record._contentSize.height);
        if (Type === Sprite) component.spriteFrame = record._spriteFrame;
        if (Type === Skeleton) {
            assert.equal(record._skeletonData.__uuid__, skeletonMeta.uuid, 'scene must directly preload the bundled skeleton');
            component.skeletonData = skeletonData;
        }
        node.components.set(Type, component);
    }
    for (const child of data._children) node.addChild(hydrate(child.__id__));
    return node;
}
const moduleUnderTest = { exports: {} };
const compiled = ts.transpileModule(fs.readFileSync(path.join(root, 'assets/Scripts/Core/GuideCorgiBubble.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
new Function('module', 'exports', 'require', compiled)(moduleUnderTest, moduleUnderTest.exports,
    () => ({ Node, UITransform, Sprite, sp: { Skeleton }, instantiate: () => hydrate(templateIndex) }));
const { createGuideCorgiBubble } = moduleUnderTest.exports;
const source = hydrate(templateIndex), overlay = new Node('OverlayRoot'); overlay.addChild(source);
const runtime = { requireCanvasUiRoot: () => overlay };
for (const [width, height] of [[660, 140], [520, 140], [640, 128], [430, 132]]) {
    const parent = new Node('Prompt'), bubble = createGuideCorgiBubble(runtime, parent, width, height);
    assert.equal(parent.children.length, 1);
    assert.equal(source.active, false);
    assert.deepEqual(bubble.children.map(n => n.name), ['Character', 'Frame', 'RestingPaw'], 'body behind frame, paw in front');
    assert.equal(bubble.getChildByName('Frame').getComponent(UITransform).width, width);
    assert.equal(bubble.getChildByName('Frame').getComponent(UITransform).height, height);
    const body = bubble.getChildByName('Character'), paw = bubble.getChildByName('RestingPaw');
    const baseScale = Math.min(width / 706, 0.72);
    assert.equal(body.scale.x, baseScale * 1.15 * 1.05);
    assert.equal(paw.scale.x, body.scale.x);
    assert(Math.abs(paw.position.x - (-width / 2 + 83 * baseScale)) < 0.001, 'enlargement preserves paw contact x');
    assert(Math.abs(body.position.x + 83 * body.scale.x - paw.position.x) < 0.001, 'body and paw share the same enlargement pivot');
    assert.equal(body.scale.x, body.scale.y, 'never distort the dog when stretching the frame');
    assert(paw.position.y < height / 2 && paw.position.y > height / 2 - 5, 'resting paw stays on the frame edge');
    assert.deepEqual(body.getComponent(Skeleton).playing, { track: 0, name: 'qicr', loop: true });
}
overlay.children = [];
assert.throws(() => createGuideCorgiBubble(runtime, new Node('Prompt'), 520, 140), /missing the complete/);
assert(skeletonData.slots.every(s => s.name !== 'bubble' && s.name !== 'front_paw'), 'stretchable frame and front paw are separate scene nodes');
console.log('guide-corgi-bubble.test.js passed: scene preload, layer order, aspect ratio, edge attachment, loop, missing-resource failure');
