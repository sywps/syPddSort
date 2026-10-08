const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
class Component {}
class Label { constructor() { this.string = ''; } }
class UITransform { constructor() { this.width = 176; this.height = 80; } }
class Sprite {}
class Node {
    constructor(name) { this.name = name; this.children = []; this.components = new Map(); this.active = true; this.isValid = true; this.position = { x: 0, y: 0 }; }
    getChildByName(name) { return this.children.find(child => child.name === name); }
    getComponent(type) { return this.components.get(type); }
    setPosition(x, y) { this.position = { x, y }; }
}
const cc = { _decorator: { ccclass: () => target => target }, Component, Label, UITransform, Sprite, Node,
    Tween: { stopAllByTarget() {} }, tween: () => ({ to() { return this; }, start() {} }) };
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
const policy = { exports: {} };
vm.runInNewContext(compile('assets/Scripts/Core/ChapterRewardPolicy.ts'), { exports: policy.exports });
let claim, previewActive = false, previewResult;
const errors = [];
const mod = { exports: {} };
vm.runInNewContext(compile('assets/Scripts/Core/ChapterRewardView.ts'), {
    exports: mod.exports, console: { error: (...args) => errors.push(args) },
    require(name) {
        if (name === 'cc') return cc;
        if (name === './ChapterRewardPolicy') return policy.exports;
        if (name === './ProfileCustomizationMgr') return { ProfileCustomizationMgr: { inst: { claimChapterRewards: () => claim() } } };
        if (name === './BrowserLevelPreview') return { getBrowserLevelPreview: () => ({ active: previewActive }) };
        if (name === './WorkbenchPreviewService') return { isWorkbenchPreviewRequested: () => false };
        if (name === './MiniGamePlatform') return { isMiniGameRuntime: () => false };
        if (name === './PreviewRewardSave') return { PreviewRewardSave: { claim: () => previewResult } };
        return {};
    },
});
const { beginChapterRewards, renderChapterRewards } = mod.exports;
function fixture(level) {
    const data = JSON.parse(fs.readFileSync('assets/GameAssetsBundle/UI/Prefabs/Panels/WinPanel.prefab', 'utf8'));
    function load(index) {
        const raw = data[index], node = new Node(raw._name); node.active = raw._active; node.position = { x: raw._lpos.x, y: raw._lpos.y };
        for (const ref of raw._components) {
            const c = data[ref.__id__], type = cc[c.__type__.replace('cc.', '')];
            if (![Label, UITransform, Sprite].includes(type)) continue;
            const value = new type();
            if (type === UITransform) Object.assign(value, c._contentSize);
            if (type === Label) value.string = c._string;
            node.components.set(type, value);
        }
        node.children = raw._children.map(ref => load(ref.__id__)); return node;
    }
    const panelWin = load(data.findIndex(n => n.__type__ === 'cc.Node' && n._name === 'WinPanel'));
    panelWin.active = true;
    const group = panelWin.getChildByName('Box').getChildByName('BottomGroup').getChildByName('ChapterRewards');
    // Decoration art loading is outside these receipt and layout checks.
    for (const milestone of [4, 9]) {
        const reward = policy.exports.chapterReward(Math.floor((level - 1) / 9) + 1, milestone);
        group.getChildByName(`Milestone${milestone}`).getChildByName('Preview').__avatarId = `${reward.avatarId}/${reward.frameId}/${reward.beanSkinId}/${reward.backgroundSkinId}`;
    }
    return { runtime: { panelWin, isValid: true, _settlementRevealToken: 1, getSavedLevel: () => level + 1 }, group };
}
const texts = group => [4, 9].map(m => group.getChildByName(`Reward${m}Label`).getComponent(Label).string);
const flushClaim = () => new Promise(resolve => setImmediate(resolve));
async function settled(level, claimed) {
    const state = fixture(level); claim = async () => ({ claimed, granted: [] });
    beginChapterRewards(state.runtime, level); await flushClaim(); renderChapterRewards(state.runtime); return state;
}
(async () => {
    assert.deepEqual(texts((await settled(1, [])).group), ['再过3关', '完成9关']);
    const pending = fixture(4); let resolveClaim;
    claim = () => new Promise(resolve => { resolveClaim = resolve; });
    beginChapterRewards(pending.runtime, 4); renderChapterRewards(pending.runtime);
    assert.deepEqual(texts(pending.group), ['待确认', '完成9关'], 'Reaching a milestone is not a receipt');
    assert.equal(pending.group.getChildByName('Milestone4').getChildByName('Opened').active, false);
    resolveClaim({ claimed: ['v1:1:4'], granted: [] }); await flushClaim();
    assert.deepEqual(texts(pending.group), ['已领取', '再过5关']);
    const failed = fixture(4); claim = async () => { throw Error('offline'); };
    beginChapterRewards(failed.runtime, 4); await flushClaim();
    assert.deepEqual(texts(failed.group), ['待确认', '完成9关']); assert.equal(errors.length, 1);
    assert.deepEqual(texts((await settled(8, ['v1:1:4'])).group), ['已领取', '再过1关']);
    assert.deepEqual(texts((await settled(9, ['v1:1:4', 'v1:1:9'])).group), ['已领取', '已领取']);
    assert.deepEqual(texts((await settled(10, ['v1:1:4', 'v1:1:9'])).group), ['再过3关', '完成9关']);
    const late = await settled(145, []);
    const bubble = late.group.getChildByName('Milestone9').getChildByName('Preview');
    const resourceNodes = ['Gold', 'Brush', 'Magnet'].map(name => bubble.getChildByName(name));
    assert.deepEqual(resourceNodes.map(n => n.position.x), [0, -50, 50]);
    assert.deepEqual(resourceNodes.map(n => n.position.y), [24, -14, -14]);
    assert.ok(late.group.getChildByName('Milestone9').position.x + bubble.position.x + bubble.getComponent(UITransform).width / 2 <= 350, 'The last milestone bubble keeps a margin inside the 720-wide screen');
    assert.deepEqual(resourceNodes.map(n => n.getChildByName('Count').getComponent(Label).string), ['×100', '×1', '×1']);
    resourceNodes.forEach(node => {
        const icon = node.getChildByName('Icon'), count = node.getChildByName('Count');
        const iconSize = icon.getComponent(UITransform), countSize = count.getComponent(UITransform);
        assert.ok(icon.position.x + iconSize.width / 2 < count.position.x - countSize.width / 2, 'Icon and amount sit side by side without overlap');
        assert.equal(icon.position.y, count.position.y, 'Icon and amount share a horizontal center line');
        for (const child of [icon, count]) {
            const size = child.getComponent(UITransform);
            assert.ok(Math.abs(node.position.x + child.position.x) + size.width / 2 <= bubble.getComponent(UITransform).width / 2 - 8, 'Reward content stays inside the bubble horizontally');
            assert.ok(node.position.y + child.position.y + size.height / 2 <= bubble.getComponent(UITransform).height / 2 - 8, 'Reward content stays inside the bubble top');
            assert.ok(node.position.y + child.position.y - size.height / 2 >= -bubble.getComponent(UITransform).height / 2 + 14, 'Reward content stays above the bubble arrow');
        }
    });
    const upperBottom = resourceNodes[0].position.y - 17;
    const lowerTop = resourceNodes[1].position.y + 17;
    assert.ok(upperBottom - lowerTop >= 4, 'The two reward rows keep visible separation');
    renderChapterRewards(late.runtime);
    assert.equal(bubble.position.y, 86, 'Repeated renders must not accumulate the bubble offset');
    previewActive = true; previewResult = { claimed: [], granted: [] };
    const local = fixture(1); local.runtime.getSavedLevel = () => { throw Error('Preview must not read real progress'); };
    beginChapterRewards(local.runtime, 1); renderChapterRewards(local.runtime);
    assert.deepEqual(texts(local.group), ['再过3关', '完成9关']);
    console.log('Chapter labels: nearest goal, pending/failed receipt, claimed, chapter boundary, preview isolation and triple reward spacing passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
