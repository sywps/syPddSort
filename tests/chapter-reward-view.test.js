const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
class Component {}
class Label { constructor() { this.string = ''; } }
class UITransform { constructor() { this.width = 176; this.height = 80; } }
class Sprite {}
class BlockInputEvents {}
class Button { static EventType = { CLICK: 'click' }; }
const position = (x = 0, y = 0, z = 0) => ({ x, y, z, clone() { return position(x, y, z); } });
class Node {
    constructor(name) { this.name = name; this.children = []; this.components = new Map(); this.active = true; this.isValid = true; this.position = position(); this.events = {}; }
    getChildByName(name) { return this.children.find(child => child.name === name); }
    getComponent(type) { return this.components.get(type); }
    setPosition(x, y, z) { this.position = position(x, y, z); }
    addComponent(type) { const component = new type(); component.node = this; this.components.set(type, component); return component; }
    addChild(node) { this.children.push(node); node.parent = this; }
    setSiblingIndex() {}
    off(event) { delete this.events[event]; }
    on(event, callback) { this.events[event] = callback; }
}
Node.EventType = { TOUCH_END: 'touch-end' };
let loadRewardPrefab = callback => callback(null, 'reward-prefab');
const cc = { _decorator: { ccclass: () => target => target }, Component, Label, UITransform, Sprite, Button, Node,
    BlockInputEvents, Prefab: class {},
    assetManager: { getBundle: () => ({ load: (path, type, callback) => path.endsWith('popup_tool_freeze_icon/spriteFrame') ? callback(null, 'freeze-frame') : loadRewardPrefab(callback) }) },
    instantiate: () => loadPrefab('assets/GameAssetsBundle/UI/Prefabs/Panels/ChapterRewardPanel.prefab'),
    Tween: { stopAllByTarget() {} }, tween: () => ({ to() { return this; }, start() {} }) };
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
const policy = { exports: {} };
vm.runInNewContext(compile('assets/Scripts/Core/ChapterRewardPolicy.ts'), { exports: policy.exports });
let claim, previewActive = false, previewResult, douyin = false;
const errors = [];
const mod = { exports: {} };
vm.runInNewContext(compile('assets/Scripts/Core/ChapterRewardView.ts'), {
    exports: mod.exports, console: { error: (...args) => errors.push(args) },
    require(name) {
        if (name === './AudioMgr') return { AudioMgr: { inst: { play: name => assert.equal(name, 'button') } } };
        if (name === 'cc') return cc;
        if (name === './ChapterRewardPolicy') return policy.exports;
        if (name === './ProfileResourceService') return { ProfileResourceService: { load: async id => `profile-frame-${id}` } };
        if (name === './ProfileCustomizationMgr') return { ProfileCustomizationMgr: { inst: { claimChapterRewards: () => claim() } } };
        if (name === './BrowserLevelPreview') return { getBrowserLevelPreview: () => ({ active: previewActive }) };
        if (name === './WorkbenchPreviewService') return { isWorkbenchPreviewRequested: () => false };
        if (name === './MiniGamePlatform') return { isMiniGameRuntime: () => douyin, isDouyinMiniGameRuntime: () => douyin };
        if (name === './PreviewRewardSave') return { PreviewRewardSave: { claim: () => previewResult } };
        return {};
    },
});
const { beginChapterRewards, renderChapterRewards, showWinShareReward, showDouyinDesktopReward } = mod.exports;
function loadPrefab(file) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    function load(index) {
        const raw = data[index], node = new Node(raw._name); node.active = raw._active; node.position = position(raw._lpos.x, raw._lpos.y, raw._lpos.z);
        for (const ref of raw._components) {
            const c = data[ref.__id__], type = cc[c.__type__.replace('cc.', '')];
            if (![Label, UITransform, Sprite].includes(type)) continue;
            const value = new type();
            if (type === UITransform) Object.assign(value, c._contentSize);
            if (type === Label) value.string = c._string;
            if (type === Sprite) value.spriteFrame = c._spriteFrame;
            node.components.set(type, value);
        }
        node.children = raw._children.map(ref => load(ref.__id__)); return node;
    }
    return load(data[0].data.__id__);
}
function fixture(level) {
    const panelWin = loadPrefab('assets/GameAssetsBundle/UI/Prefabs/Panels/WinPanel.prefab');
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
    douyin = true;
    const offline = await settled(4, ['v1:1:4']);
    assert.deepEqual(texts(offline.group), ['已领取', '再过5关']);
    assert.equal(errors.length, 0, 'Douyin settlement never calls missing cloud flush before local claim');
    douyin = false;
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
    assert.deepEqual(resourceNodes.map(n => n.position.x), [-56, 0, 56]);
    assert.deepEqual(resourceNodes.map(n => n.position.y), [0, 0, 0]);
    const firstBubble = late.group.getChildByName('Milestone4').getChildByName('Preview');
    assert.equal(bubble.position.x, 0, 'The centered bubble tip stays over the gift');
    assert.equal(bubble.position.y, firstBubble.position.y, 'Milestone bubbles share a baseline');
    assert.equal(bubble.getComponent(UITransform).width, 196);
    assert.equal(firstBubble.getComponent(UITransform).width, 160);
    assert.equal(bubble.getComponent(UITransform).height, firstBubble.getComponent(UITransform).height);
    assert.ok(late.group.getChildByName('Milestone9').position.x + bubble.position.x + bubble.getComponent(UITransform).width / 2 <= 350, 'The last milestone bubble keeps a margin inside the 720-wide screen');
    assert.equal(firstBubble.getChildByName('Gold').getChildByName('Count').active, false, 'Single reward preview hides quantity');
    assert.deepEqual(resourceNodes.map(n => n.getChildByName('Count').active), [false, false, false], 'Multiple reward previews hide quantities');
    resourceNodes.forEach(node => {
        const icon = node.getChildByName('Icon');
        assert.equal(icon.position.y, bubble.getChildByName('Avatar').position.y, 'Resource and decoration icons share the bubble body center');
        for (const child of [icon]) {
            const size = child.getComponent(UITransform);
            assert.ok(Math.abs(node.position.x + child.position.x) + size.width / 2 <= bubble.getComponent(UITransform).width / 2 - 8, 'Reward content stays inside the bubble horizontally');
            assert.ok(node.position.y + child.position.y + size.height / 2 <= bubble.getComponent(UITransform).height / 2 - 8, 'Reward content stays inside the bubble top');
            assert.ok(node.position.y + child.position.y - size.height / 2 >= -bubble.getComponent(UITransform).height / 2 + 14, 'Reward content stays above the bubble arrow');
        }
    });
    renderChapterRewards(late.runtime);
    assert.equal(bubble.position.y, 74, 'Repeated renders must not accumulate the bubble offset');
    for (const level of [1, 10, 19, 28]) {
        const paired = await settled(level, []);
        for (const milestone of [4, 9]) {
            const preview = paired.group.getChildByName(`Milestone${milestone}`).getChildByName('Preview');
            const icons = ['Avatar', 'Gold', 'Brush', 'Magnet'].map(name => preview.getChildByName(name)).filter(node => node.active);
            assert.equal(icons.length, 2, 'Each early milestone has two rewards');
            assert.deepEqual(icons.map(node => node.position.x), [-36, 36], 'Decoration and tool share the centered row');
            assert.equal(preview.getComponent(UITransform).width, 160);
            assert.equal(preview.getComponent(UITransform).height, 72);
        }
        renderChapterRewards(paired.runtime);
        assert.equal(paired.group.getChildByName('Milestone9').getChildByName('Preview').getChildByName('Avatar').position.x, -36);
    }
    previewActive = true; previewResult = { claimed: [], granted: [] };
    const local = fixture(1); local.runtime.getSavedLevel = () => { throw Error('Preview must not read real progress'); };
    beginChapterRewards(local.runtime, 1); renderChapterRewards(local.runtime);
    assert.deepEqual(texts(local.group), ['再过3关', '完成9关']);
    previewActive = false;
    for (const [level, name] of [[9, '豆豆皮肤'], [18, '头像'], [27, '头像框'], [36, '背景皮肤']]) {
        const state = fixture(level);
        claim = async () => ({ claimed: [], granted: [policy.exports.chapterReward(level / 9, 9)] });
        beginChapterRewards(state.runtime, level); await flushClaim();
        const popup = state.runtime.panelWin.getChildByName('ChapterRewardMount').getChildByName('ChapterRewardPanel');
        assert(popup.active);
        assert.equal(popup.getChildByName('Reward0').getChildByName('Count').getComponent(Label).string, level % 18 === 0 ? '画笔 ×1' : '磁铁 ×1');
        assert.equal(popup.getChildByName('Reward1').getChildByName('Count').getComponent(Label).string, name);
        assert(!popup.getChildByName('Detail').active);
        popup.getChildByName('Confirm').events.click(); assert(!popup.active);
    }
    const shared = await settled(4, ['v1:1:4']);
    const mount = shared.runtime.panelWin.getChildByName('ChapterRewardMount');
    const chapterPopup = new Node('ChapterRewardPanel'); mount.addChild(chapterPopup);
    await showWinShareReward(shared.runtime, 100, 1);
    const sharePopup = mount.getChildByName('WinShareRewardPanel');
    assert(sharePopup.active);
    assert(chapterPopup.active, 'share display must preserve a pending chapter popup');
    assert.equal(sharePopup.getChildByName('Reward0').getChildByName('Count').getComponent(Label).string, '金币 ×100');
    assert(!sharePopup.getChildByName('Detail').active, 'dismissal hint is hidden');
    assert.equal(sharePopup.getChildByName('Confirm').getChildByName('Label').getComponent(Label).string, '开心收下');
    assert.equal(sharePopup.getChildByName('Reward0').position.x, 0, 'single gold reward is centered');
    assert(!sharePopup.getChildByName('Reward1').active && !sharePopup.getChildByName('Reward2').active);
    assert(sharePopup.getComponent(BlockInputEvents));
    sharePopup.getChildByName('Shade').events['touch-end']();
    assert(!sharePopup.active && shared.runtime.panelWin.active && chapterPopup.active);
    await showWinShareReward(shared.runtime, 80, 1);
    assert.equal(mount.children.filter(node => node.name === 'WinShareRewardPanel').length, 1);
    assert.equal(sharePopup.getChildByName('Reward0').getChildByName('Count').getComponent(Label).string, '金币 ×80');
    sharePopup.getChildByName('Confirm').events.click();
    assert(!sharePopup.active);
    shared.runtime._settlementRevealToken = 2;
    await showWinShareReward(shared.runtime, 100, 1);
    assert(!sharePopup.active, 'late share completion must not show on another settlement');
    shared.runtime._isThemeLevel = true;
    await showWinShareReward(shared.runtime, 100, 2);
    assert(sharePopup.active, 'theme win shares use the same reward display');
    beginChapterRewards(shared.runtime, 5);
    assert(!sharePopup.active && !chapterPopup.active, 'new settlement hides both previous reward panels');
    await assert.rejects(showWinShareReward(shared.runtime, 0, 2), /金额无效/);
    const stale = fixture(1); let finishLoad;
    loadRewardPrefab = callback => { finishLoad = callback; };
    const showing = showWinShareReward(stale.runtime, 100, 1);
    stale.runtime._settlementNextTransitioning = true;
    finishLoad(null, 'reward-prefab'); await showing;
    assert(!stale.runtime.panelWin.getChildByName('ChapterRewardMount').getChildByName('WinShareRewardPanel').active);
    loadRewardPrefab = callback => callback(Error('prefab load failed'));
    await assert.rejects(showWinShareReward(fixture(1).runtime, 100, 1), /prefab load failed/);
    let desktopGrants = 0;
    await assert.rejects(showDouyinDesktopReward({}, new Node('Guide'), 'brush', () => true, () => desktopGrants++), /prefab load failed/);
    assert.equal(desktopGrants, 0, 'desktop popup load failure cannot grant');
    loadRewardPrefab = callback => callback(null, 'reward-prefab');
    const template = loadPrefab('assets/GameAssetsBundle/UI/Prefabs/Panels/ChapterRewardPanel.prefab');
    const expectedFrames = { freeze: 'freeze-frame', brush: template.getChildByName('Reward1').getChildByName('Icon').getComponent(Sprite).spriteFrame,
        magnet: template.getChildByName('Reward2').getChildByName('Icon').getComponent(Sprite).spriteFrame };
    for (const kind of ['freeze', 'brush', 'magnet']) {
        const guide = new Node('Guide');
        await showDouyinDesktopReward({}, guide, kind, () => true, () => desktopGrants++);
        const popup = guide.getChildByName('DouyinDesktopRewardPanel');
        assert(popup.active, 'desktop reward displays without a win panel');
        const item = popup.getChildByName('Reward0');
        assert.equal(item.position.x, 0);
        assert.deepEqual(item.getChildByName('Icon').getComponent(Sprite).spriteFrame, expectedFrames[kind]);
        assert.equal(item.getChildByName('Count').getComponent(Label).string, { freeze: '冻结道具 ×1', brush: '画笔 ×1', magnet: '磁铁 ×1' }[kind]);
        assert(!popup.getChildByName('Detail').active);
        assert(!popup.getChildByName('Reward1').active && !popup.getChildByName('Reward2').active);
        popup.getChildByName('Confirm').events.click(); assert(!popup.active && guide.active);
    }
    assert.equal(desktopGrants, 3);
    const failedGuide = new Node('Guide');
    await assert.rejects(showDouyinDesktopReward({}, failedGuide, 'brush', () => true, () => { throw Error('grant failed'); }), /grant failed/);
    assert(!failedGuide.getChildByName('DouyinDesktopRewardPanel').active, 'never show an award when inventory commit fails');
    console.log('Share reward popup: amount, centering, chapter isolation, close, reuse, stale load, theme and load failure passed');
    console.log('Chapter labels: nearest goal, pending/failed receipt, claimed, chapter boundary, preview isolation and triple reward spacing passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
