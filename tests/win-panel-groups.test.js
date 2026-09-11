const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const records = JSON.parse(read('assets/GameAssetsBundle/UI/Prefabs/Panels/WinPanel.prefab'));
const node = name => records.find(r => r.__type__ === 'cc.Node' && r._name === name);
const childNames = n => n._children.map(ref => records[ref.__id__]._name);
const components = n => n._components.map(ref => records[ref.__id__]);
const box = node('Box');
assert.deepStrictEqual(childNames(box), ['TopGroup', 'MiddleGroup', 'BottomGroup', 'CollectionBtn']);
for (const [name, children, flag] of [
    ['TopGroup', ['横幅光效', 'TitleBanner'], 17],
    ['MiddleGroup', ['PreviewFrame'], 18],
    ['BottomGroup', ['RewardGoldMaskBar', 'RewardGoldIcon', 'AdBonusBtn', 'PrimaryBtn'], 20],
]) {
    const group = node(name);
    assert.deepStrictEqual(childNames(group), children);
    assert.strictEqual(records[group._parent.__id__], box);
    const widget = components(group).find(c => c.__type__ === 'cc.Widget');
    assert.strictEqual(widget._alignFlags, flag);
    for (const child of children) assert.strictEqual(records[node(child)._parent.__id__], group);
}
for (const [name, y] of [
    ['横幅光效', 506.82], ['TitleBanner', 491.573], ['PreviewFrame', 87.189],
    ['RewardGoldMaskBar', -219.7], ['RewardGoldIcon', -219.7],
    ['AdBonusBtn', -317.677], ['PrimaryBtn', -458.473],
]) {
    const n = node(name);
    const parent = records[n._parent.__id__];
    assert.ok(Math.abs(n._lpos.y + parent._lpos.y - y) < 0.00001, `${name} design position changed`);
    assert.ok(!components(n).some(c => c.__type__ === 'cc.Widget'), `${name} must not compete with group layout`);
}
assert.strictEqual(records[node('SettlementTopHud')._parent.__id__], node('WinPanel'));
assert.strictEqual(records[node('CollectionBtn')._parent.__id__], box);
const controller = read('assets/Scripts/Core/GameplayResultPanelController.ts');
assert.ok(controller.includes("this.runtime.requirePanelChild(box, 'TopGroup').children.find"));
assert.ok(controller.includes("this.runtime.requirePanelChild(box, 'TopGroup').getChildByName(WIN_BANNER_LIGHT_NODE_NAME)"));
assert.ok(controller.includes("runtime.requirePanelChild(middleGroup, 'PreviewFrame')"));
assert.ok(controller.includes("runtime.requirePanelChild(bottomGroup, 'AdBonusBtn')"));
assert.ok(controller.includes("runtime.requirePanelChild(bottomGroup, 'PrimaryBtn')"));
const hud = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
assert.ok(hud.includes("this.panelWin.getChildByName('Box')?.getChildByName('MiddleGroup')"));
assert.ok(hud.includes("__basicSettlement ? root : root?.getChildByName('BottomGroup')"));
console.log('win-panel-groups.test.js passed (structure only; live visual acceptance required)');
