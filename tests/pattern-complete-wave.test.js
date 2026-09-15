const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const clip = json('assets/GameAssetsBundle/UI/Animations/PatternCompleteBean.anim');
const prefab = json('assets/GameAssetsBundle/UI/Prefabs/Fx/PatternCompleteBean.prefab');
const curve = clip._tracks[0]._channel._curve;
assert.equal(clip._duration, 0.4);
assert.equal(curve._values.length, 24);
assert.equal(curve._values[0], null);
assert.equal(prefab.filter((x) => x.__type__ === 'cc.Sprite').length, 1);
assert.equal(prefab.find((x) => x.__type__ === 'cc.Animation').playOnLoad, false);
for (let i = 1; i <= 23; i++) {
  const name = 'baoshishanguang_' + String(i).padStart(4, '0');
  const asset = `assets/GameAssetsBundle/UI/Atlases/PatternComplete/${name}.png`;
  const actual = fs.readFileSync(path.join(root, asset));
  assert.deepEqual(actual, fs.readFileSync(path.join(root, `temp/rotate-completion-fx/png/map/${name}.png`)));
  const image = PNG.sync.read(actual);
  assert.equal(image.width, 61); assert.equal(image.height, 61);
  assert.equal(curve._times[i], i / 60);
  assert.equal(curve._values[i].__uuid__, json(asset + '.meta').uuid + '@f9941');
}
let created = 0;
class Sprite { spriteFrame = null; }
class UITransform { setContentSize(w, h) { this.width = w; this.height = h; } }
class Animation {
  defaultClip = { name: clip._name, duration: clip._duration };
  constructor(node) { this.state = { time: 0, initialize() {}, sample() { node.sprite.spriteFrame = Math.floor(this.time * 60 + 1e-7); } }; }
  getState() { return this.state; }
}
class Node {
  children = []; active = true; layer = 33554432;
  constructor() { this.sprite = new Sprite(); this.transform = new UITransform(); this.animation = new Animation(this); }
  addChild(node) { node.parent = this; this.children.push(node); }
  getComponent(type) { return type === Sprite ? this.sprite : type === Animation ? this.animation : this.transform; }
  setPosition(x, y) { this.x = x; this.y = y; }
  setScale() {}
  setSiblingIndex() {}
  destroy() { this.destroyed = true; }
}
class Component { node = new Node(); }
const cc = { _decorator: { ccclass: () => (type) => type }, Animation, Component, Node, Sprite, UITransform, instantiate() { created++; return new Node(); } };
const compiled = ts.transpileModule(read('assets/Scripts/Core/PatternCompleteWaveFx.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true }, reportDiagnostics: true });
assert.deepEqual(compiled.diagnostics, []);
const ctx = { exports: {}, require: (name) => { assert.equal(name, 'cc'); return cc; } };
vm.runInNewContext(compiled.outputText, ctx);
const { PatternCompleteWaveFx, getPatternWaveDuration } = ctx.exports;
const cell = (row, col) => ({ row, col, x: col * 62, y: -row * 62, size: 62 });
let done = 0;
const wave = new PatternCompleteWaveFx();
wave.play({}, [cell(0, 0), cell(0, 1), cell(1, 0), cell(3, 2)], () => done++);
assert.equal(wave.node.children.length, 1);
assert.equal(wave.node.children[0].sprite.spriteFrame, 0, 'first instant is blank');
wave.update(1 / 60);
assert.equal(wave.node.children[0].sprite.spriteFrame, 1);
wave.update(0.03 - 1 / 60);
assert.equal(wave.node.children.length, 3, 'equal diagonals start together');
wave.update(0.51);
assert.equal(done, 0, 'do not finish before last cell reaches .4s');
wave.update(0.01);
assert.equal(done, 1);
wave.update(1);
assert.equal(done, 1, 'completion fires once');
assert.ok(wave.node.children.every((n) => !n.active));
const before = created;
wave.play({}, [cell(0, 0)], () => done++);
assert.equal(created, before, 'reuse pooled nodes');
wave.stop(); wave.update(3);
assert.equal(done, 1, 'cancelled playback must not reveal settlement');
assert.ok(Math.abs(getPatternWaveDuration([cell(99, 99)]) - 6.34) < 1e-8, 'large boards use the 0.03s diagonal interval without a 1s cap');
console.log('pattern-complete-wave.test.js passed: resource references, frame timing, diagonal grouping, pooling, cancellation, completion.');
