const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readJson(relPath) {
    return JSON.parse(read(relPath));
}

const prefab = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/AcquireResourcePanel.prefab');

function findNodeIndex(name) {
    return prefab.findIndex((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === name);
}

function findNode(name) {
    const index = findNodeIndex(name);
    assert.ok(index >= 0, `AcquireResourcePanel.prefab must include ${name}`);
    return prefab[index];
}

function childNames(nodeName) {
    const node = findNode(nodeName);
    return (node._children || []).map((ref) => prefab[ref.__id__]?._name);
}

function getComponent(nodeName, typeName) {
    const node = findNode(nodeName);
    for (const ref of node._components || []) {
        const component = prefab[ref.__id__];
        if (component && component.__type__ === typeName) return component;
    }
    assert.fail(`${nodeName} must include ${typeName}`);
}

assert.ok(childNames('PopupTitleBadge').includes('TitleFreeze'), 'title variant group must include TitleFreeze');
assert.ok(childNames('Box').includes('IconFreeze'), 'icon variant group must include IconFreeze');
assert.ok(childNames('Box').includes('TextFreeze'), 'text variant group must include TextFreeze');
assert.ok(childNames('Box').includes('AcquireInsufficientGoldTip'), 'acquire panel must include prefab-owned insufficient gold tip');

assert.strictEqual(getComponent('TitleFreeze', 'cc.Label')._string, '冻结', 'freeze title must be prefab-owned');
assert.strictEqual(getComponent('TextFreeze', 'cc.Label')._string, '冻结当前时间180秒', 'freeze description must be prefab-owned');
assert.strictEqual(getComponent('AcquireInsufficientGoldTip', 'cc.Label')._string, '金币不足，可观看视频领取', 'insufficient gold tip text must be prefab-owned');
assert.strictEqual(
    getComponent('IconFreeze', 'cc.Sprite')._spriteFrame.__uuid__,
    '7d9b48cd-c975-4ce9-96fe-8a0c1e523cb4@f9941',
    'freeze icon must be prefab-owned',
);
assert.strictEqual(findNode('TitleFreeze')._active, false, 'TitleFreeze must default inactive');
assert.strictEqual(findNode('IconFreeze')._active, false, 'IconFreeze must default inactive');
assert.strictEqual(findNode('TextFreeze')._active, false, 'TextFreeze must default inactive');
assert.strictEqual(findNode('AcquireInsufficientGoldTip')._active, false, 'insufficient gold tip must default inactive');
assert.strictEqual(findNode('AcquireCancelBtn')._active, false, 'ad wait cancellation must stay hidden until an ad request starts');
assert.strictEqual(getComponent('AcquireCancelLbl', 'cc.Label')._string, '取消等待', 'ad wait cancellation copy must be prefab-owned');

const controller = read('assets/Scripts/Core/Panels/CommercePanelController.ts');
assert.ok(controller.includes("freeze: 'TitleFreeze'"), 'freeze title variant must map to TitleFreeze');
assert.ok(controller.includes("freeze: 'IconFreeze'"), 'freeze icon variant must map to IconFreeze');
assert.ok(controller.includes("freeze: 'TextFreeze'"), 'freeze text variant must map to TextFreeze');
assert.ok(controller.includes("['TitleGold', 'TitleWand', 'TitleFreeze', 'TitleBrush', 'TitleMagnet']"), 'title active group must include TitleFreeze');
assert.ok(controller.includes("['IconGold', 'IconWand', 'IconFreeze', 'IconBrush', 'IconMagnet']"), 'icon active group must include IconFreeze');
assert.ok(controller.includes("['GoldAmountLabel', 'TextWand', 'TextFreeze', 'TextBrush', 'TextMagnet']"), 'text active group must include TextFreeze');
assert.ok(!controller.includes("options.variant === 'freeze'"), 'freeze variant must not mutate static prefab labels at runtime');
assert.ok(!controller.includes('popup_tool_freeze_icon'), 'freeze icon must not be assigned by runtime code');
assert.ok(!controller.includes('暂停倒计时'), 'old freeze copy must not remain in runtime code');
assert.ok(controller.includes("this.setAcquireInsufficientGoldTipActive(box, false);"), 'acquire panel must hide insufficient gold tip on open');
assert.ok(controller.includes("this.setAcquireInsufficientGoldTipActive(box, true);"), 'failed coin buy must show insufficient gold tip');
assert.ok(!controller.includes('金币不足'), 'insufficient gold copy must not be hardcoded in controller');
assert.ok(controller.includes("setAdPanelState('广告准备中…', true, true, '取消等待');"), 'the panel must expose a cancellable loading state');
assert.ok(controller.includes('onAdShown: hidePanelForNativeAd'), 'the panel must stay open until the native ad actually becomes visible');
assert.ok(controller.includes("setAdPanelState('正在确认结果…', true, true, '结束等待');"), 'a delayed native close must expose an explicit end-wait action');
assert.ok(controller.includes("outcome?.status === 'verified_incomplete'"), 'early close and technical failure must restore distinct retry copy');
assert.ok(!controller.includes('if (started) closePanel'), 'request acceptance alone must never close the panel');

console.log('freeze-acquire-prefab.test.js passed');
