const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const load = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const panelPath = 'assets/GameAssetsBundle/UI/Prefabs/Panels/DouyinSidebarGuidePanel.prefab';
const panel = load(panelPath);
const node = name => {
    const result = panel.find(x => x.__type__ === 'cc.Node' && x._name === name);
    assert.ok(result, `missing editable node ${name}`);
    return result;
};
const component = (n, type) => n._components.map(r => panel[r.__id__]).find(c => c.__type__ === type);
const label = name => component(node(name), 'cc.Label')._string;
for (const name of ['Box', 'CollContent', 'XBtn', 'EnterBtn', 'PopupTitleBadge']) node(name);
assert.strictEqual(label('PopupTitleLabel'), '入口有礼');
assert.strictEqual(label('EnterLabel'), '进入侧边栏');
assert.strictEqual(label('RewardLabel'), '随机道具 ×1');
assert.strictEqual(label('Step2Title'), '2. 点击手指解压');
for (const [name, file] of [['SidebarDemo', 'douyin_sidebar_step_open'], ['GameEntryDemo', 'douyin_sidebar_step_return']]) {
    const n = node(name);
    const meta = load(`assets/GameAssetsBundle/Textures/UI/${file}.png.meta`);
    assert.strictEqual(component(n, 'cc.Sprite')._spriteFrame.__uuid__, meta.uuid + '@f9941');
    const size = component(n, 'cc.UITransform')._contentSize;
    const image = meta.subMetas.f9941.userData;
    assert.ok(Math.abs(size.width / size.height - image.width / image.height) < 0.001, 'phone artwork must retain its aspect ratio');
    assert.strictEqual(n._children.length, 0, 'old drawn labels and hands must not cover supplied artwork');
}
for (const name of ['DailyLimitLabel', 'IntroLabel', 'PreviewHint']) {
    assert.ok(!panel.some(x => x.__type__ === 'cc.Node' && x._name === name));
}
assert.strictEqual(component(node('RewardGiftIcon'), 'cc.Sprite')._spriteFrame.__uuid__,
    '40d5ff4b-d1be-4a1e-acdc-3472263bb101@f9941');
const texts = panel.filter(x => x.__type__ === 'cc.Label').map(x => x._string).join('\n');
assert.ok(!/金币|游戏圈/.test(texts), 'guide must not advertise the superseded gold reward or WeChat entry');
assert.ok(node('Step1Title')._lpos.y > node('Step2Title')._lpos.y);
assert.ok(node('Step2Title')._lpos.y > node('Step3Title')._lpos.y);
assert.ok(node('Step3Title')._lpos.y > node('RewardGiftIcon')._lpos.y);
for (const name of ['RewardCard']) {
    assert.strictEqual(node(name)._active, false, `${name} must not appear in the confirmed layout`);
}
const boxSize = component(node('Box'), 'cc.UITransform')._contentSize;
for (const name of ['EnterBtn', 'RewardCard']) {
    const n = node(name), s = component(n, 'cc.UITransform')._contentSize;
    assert.ok(Math.abs(n._lpos.y) + s.height / 2 < boxSize.height / 2, `${name} must fit inside panel`);
}
function checkRefs(o) {
    if (!o || typeof o !== 'object') return;
    if ('__id__' in o) assert.ok(Number.isInteger(o.__id__) && panel[o.__id__], 'prefab reference must resolve');
    else Object.values(o).forEach(checkRefs);
}
panel.forEach(checkRefs);
const ids = panel.filter(x => x.__type__ === 'cc.PrefabInfo' || x.__type__ === 'cc.CompPrefabInfo').map(x => x.fileId);
assert.strictEqual(new Set(ids).size, ids.length, 'editor identities must be unique');
assert.notStrictEqual(load(panelPath + '.meta').uuid,
    load('assets/GameAssetsBundle/UI/Prefabs/Panels/GameCirclePanel.prefab.meta').uuid);
const entry = load('assets/HomeAssetsBundle/UI/Prefabs/Buttons/DouyinSidebarTaskButton.prefab');
const title = entry.find(n => n._name === 'SidebarTaskLbl');
assert.strictEqual(title._components.map(r => entry[r.__id__]).find(x => x.__type__ === 'cc.Label')._string, '入口有礼');
console.log('douyin-sidebar-prefab.test.js passed');
