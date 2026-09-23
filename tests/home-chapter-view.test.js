const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
class Label {}
class UIOpacity { constructor() { this.opacity = 255; } }
class Vec3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
const animations = [];
const Tween = { stopAllByTarget() {} };
function tween(target) {
    const steps = [];
    const chain = {
        delay(time) { steps.push(['delay', time]); return chain; },
        to(time, props) { steps.push(['to', time, props]); return chain; },
        call(fn) { steps.push(['call', fn]); return chain; },
        start() { animations.push({ target, steps }); return chain; },
    };
    return chain;
}
class UITransform { constructor() { this.width = 140; this.height = 140; } }
class Node {
    static EventType = { TOUCH_END: 'end' };
    on(event, handler) { (this.events ||= new Map()).set(event, handler); }
    off(event, handler) { if (this.events?.get(event) === handler) this.events.delete(event); }
    constructor(name) { this.name = name; this.children = []; this.isValid = true; this.active = true; }
    getChildByName(name) { return this.children.find(node => node.name === name); }
    getComponent(type) { return this.components?.get(type); }
    addComponent(type) { const component = new type(); component.node = this; this.components.set(type, component); return component; }
    setScale(x, y, z) { this.scale = new Vec3(x, y, z); }
    removeFromParent() { this.parent.children = this.parent.children.filter(node => node !== this); }
    destroy() { this.isValid = false; }
}
const rendered = [], failures = [], opened = [];
const previewState = { active: false, level: 1, getLevel() { return this.level; } };
const route = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/Scripts/Core/LevelRouteService.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: route.exports });
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/Scripts/Core/HomeChapterView.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, {
    exports: mod.exports,
    require: name => name === 'cc' ? { Node, Label, UITransform, UIOpacity, Vec3, Tween, tween } : name === './HomeArtworkPreview' ? { openHomeArtworkPreview: (...args) => opened.push(args) } : name === './LevelRouteService' ? route.exports : name === './BrowserLevelPreview' ? { getBrowserLevelPreview: () => previewState } : {
        renderCompletedPatternPreview: (...args) => { rendered.push(args); args[4]?.(true); },
        releaseCompletedPatternPreviewTree: () => {},
    },
    console: { error: text => failures.push(text) },
});
const { getHomeChapter, renderHomeChapter } = mod.exports;
assert.equal(getHomeChapter(1, 1).completed, 0);
assert.equal(getHomeChapter(9, 9).chapter, 1);
assert.equal(getHomeChapter(9, 9).completed, 8);
assert.equal(getHomeChapter(10, 10).chapter, 2);
assert.equal(getHomeChapter(10, 10).completed, 0);
assert.equal(getHomeChapter(11, 11).cells[0].level, 10);
assert.equal(getHomeChapter(11, 11).completed, 1);
assert.equal(getHomeChapter(19, 19).chapter, 3);
assert.equal(getHomeChapter(99, 1).completed, 0, 'Browser-selected levels must not fabricate completion');
assert.throws(() => getHomeChapter(0, 1), /Invalid/);
function add(parent, name, type) {
    const node = new Node(name); node.parent = parent; parent.children.push(node);
    node.components = new Map();
    if (type) { const c = new type(); c.node = node; node.components.set(type, c); }
    return node;
}
const hero = new Node('HeroCard');
add(hero, 'ChapterTitle', Label); add(hero, 'ChapterProgress', Label);
const grid = add(hero, 'ChapterGrid');
for (let i = 1; i <= 9; i++) {
    const slot = add(grid, `Cell${i}`);
    add(slot, 'LevelNumber', Label); add(slot, 'PreviewAnchor', UITransform);
    add(slot, 'Status', Label); add(slot, 'CurrentMark');
    add(slot, 'CompletedBackground'); add(slot, 'PendingBackground');
}
const loads = [];
const runtime = { getSavedLevel: () => 11, loadLevelData: (level, callback) => loads.push({ level, callback }) };
renderHomeChapter(runtime, hero, 11);
grid.children[0].events.get('end')({});
assert.deepEqual(Array.from(opened[0][1]), [10]);
assert.equal(opened[0][2], 10);
grid.children[1].events.get('end')({});
assert.equal(opened.length, 1, 'Incomplete cells do not open artwork');
assert.equal(loads.length, 1, 'Only completed images should load');
assert.equal(loads[0].level, 10);
renderHomeChapter(runtime, hero, 11);
loads[0].callback({ correctColorArr: [[1]] });
assert.equal(rendered.length, 0, 'Stale asynchronous responses must not repaint a rebound slot');
loads[1].callback(null);
assert.equal(grid.children[0].getChildByName('Status').getComponent(Label).string, '加载失败');
assert.equal(failures.length, 1, 'Missing data must be visible and logged');
renderHomeChapter(runtime, hero, 11);
loads[2].callback({ correctColorArr: [[1]] });
assert.equal(rendered.length, 1);
assert.equal(grid.children[0].getChildByName('CompletedBackground').active, true);
assert.equal(grid.children[0].getChildByName('PendingBackground').active, false);
assert.equal(grid.children[1].getChildByName('CompletedBackground').active, false);
assert.equal(grid.children[1].getChildByName('PendingBackground').active, true);
for (const savedLevel of [600, 601, 602, 889]) {
    loads.length = 0;
    runtime.getSavedLevel = () => savedLevel;
    renderHomeChapter(runtime, hero, savedLevel);
    const model = getHomeChapter(savedLevel, savedLevel);
    assert.deepEqual(loads.map(load => load.level), Array.from(model.cells.filter(cell => cell.completed), cell => Math.min(600, cell.level)));
    assert.equal(hero.getChildByName('ChapterTitle').getComponent(Label).string, `第 ${model.chapter} 章`);
    model.cells.forEach((cell, index) => {
        assert.equal(grid.children[index].getChildByName('LevelNumber').getComponent(Label).string, String(cell.level));
    });
    loads.forEach(load => load.callback({ correctColorArr: [[1]] }));
    model.cells.filter(cell => cell.completed).forEach((cell, index) => {
        assert.equal(grid.children[index].getChildByName('Status').active, false);
    });
}
assert.equal(loads.length, 6, 'Level 889 has six completed chapter previews');
assert.equal(failures.length, 1, 'Mapped high levels must render without additional failures');
assert.equal(animations.filter(item => item.target instanceof Node).length > 0, true, 'New completion queues flips');
animations.length = 0;
renderHomeChapter(runtime, hero, 889);
loads.slice(-6).forEach(load => load.callback({ correctColorArr: [[1]] }));
assert.equal(animations.length, 0, 'Same progress must not replay');
runtime.getSavedLevel = () => 892;
renderHomeChapter(runtime, hero, 892);
assert.equal(animations.length, 0, 'New empty chapter must not replay previous chapter');
loads.length = 0;
runtime.getSavedLevel = () => 895;
renderHomeChapter(runtime, hero, 895);
loads.slice().reverse().forEach(load => load.callback({ correctColorArr: [[1]] }));
const flips = animations.filter(item => item.target instanceof Node);
assert.equal(flips.length, 3, 'Three newly completed cells animate');
assert.deepEqual(flips.map(item => item.steps[0][1]).sort(), [0.12, 0.22, 0.32], 'Load order must not change stagger order');
loads.length = 0;
animations.length = 0;
previewState.active = true;
runtime.getSavedLevel = () => { throw Error('Preview must not read persisted progress'); };
renderHomeChapter(runtime, hero, 1);
assert.equal(loads.length, 0, 'Preview level 1 must have no completed cells');
previewState.level = 3;
renderHomeChapter(runtime, hero, 3);
assert.deepEqual(loads.map(load => load.level), [1, 2], 'Preview level 3 must only load two completed cells');
loads.forEach(load => load.callback({ correctColorArr: [[1]] }));
assert.equal(animations.filter(item => item.target instanceof Node).length, 2);
assert.equal(grid.children[2].getChildByName('PendingBackground').active, true);
previewState.active = false;
runtime.getSavedLevel = () => 895;
loads.length = 0;
animations.length = 0;
renderHomeChapter(runtime, hero, 895);
loads.forEach(load => load.callback({ correctColorArr: [[1]] }));
assert.equal(loads.length, 3, 'Normal mode still uses saved progress');
assert.equal(animations.length, 0, 'Preview must not overwrite normal animation baseline');
console.log('home-chapter-view.test.js passed');
