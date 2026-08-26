const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');
const readJson = (relPath) => JSON.parse(read(relPath));

function extractMethod(source, signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `missing method signature: ${signature}`);
    const open = source.indexOf('{', start);
    assert.ok(open >= 0, `missing method body: ${signature}`);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`unterminated method body: ${signature}`);
}

function refId(ref) {
    return ref && typeof ref.__id__ === 'number' ? ref.__id__ : null;
}

function childNodes(prefab, node) {
    return (node._children || [])
        .map(refId)
        .filter((id) => id !== null)
        .map((id) => prefab[id]);
}

function findComponent(prefab, node, type) {
    return (node._components || [])
        .map(refId)
        .filter((id) => id !== null)
        .map((id) => prefab[id])
        .find((component) => component?.__type__ === type);
}

const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const resultPanel = read('assets/Scripts/Core/GameplayResultPanelController.ts');
const losePrefab = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/LosePanel.prefab');
const adIconMeta = readJson('assets/BootstrapBundle/GameUI/popup_ad_play_icon.png.meta');

const gameLose = extractMethod(settlement, "gameLose(reason: 'timeout' | 'buffer-full' = 'timeout')");
assert.match(
    gameLose,
    /reason === 'buffer-full' && this\.panelBufferFullContinue/,
    'buffer-full failure must keep its dedicated rewarded expansion panel',
);
assert.ok(gameLose.includes('this.showLosePanel();'), 'ordinary timeout must show the failure panel');
assert.doesNotMatch(
    gameLose,
    /if \(this\.panelTimeoutContinue\) \{\s*this\.panelTimeoutContinue\.active = true/,
    'ordinary timeout must not route through the intermediate revive panel',
);

const createLosePanel = extractMethod(resultPanel, 'createLoseSettlementPanel(): Node');
assert.ok(
    createLosePanel.includes('this.bindReviveContinueAction(reviveBtn, overlay);'),
    'failure Continue Game must use the shared direct rewarded-revive action',
);
const bindRevive = extractMethod(resultPanel, 'bindReviveContinueAction(triggerNode: Node, overlay: Node, rewardedSeconds?: number)');
assert.match(
    bindRevive,
    /runtime\.runRewardedGrant\('level_revive',[\s\S]*?runtime\.continueAfterLose\(continueSeconds\);/,
    'completed rewarded video must directly continue gameplay',
);

const continueButtonIndex = losePrefab.findIndex(
    (entry) => entry?.__type__ === 'cc.Node' && entry._name === '复活窗组件3',
);
assert.ok(continueButtonIndex >= 0, 'LosePanel must contain its Continue Game button');
const continueButton = losePrefab[continueButtonIndex];
const continueChildren = childNodes(losePrefab, continueButton);
const labelNode = continueChildren.find((node) => node?._name === 'ReviveBtnLbl');
const iconNode = continueChildren.find((node) => node?._name === 'popup_ad_play_icon');
assert.ok(labelNode, 'Continue Game must retain its text label');
assert.ok(iconNode, 'Continue Game must contain the standard rewarded-ad icon');
assert.strictEqual(refId(iconNode._parent), continueButtonIndex, 'ad icon must be parented to Continue Game');

const label = findComponent(losePrefab, labelNode, 'cc.Label');
const iconUi = findComponent(losePrefab, iconNode, 'cc.UITransform');
const iconSprite = findComponent(losePrefab, iconNode, 'cc.Sprite');
assert.strictEqual(label?.['_string'], '继续游戏', 'failure action label must read Continue Game');
assert.ok(Number(iconUi?._contentSize?.width) > 0 && Number(iconUi?._contentSize?.height) > 0, 'ad icon must have visible dimensions');
assert.strictEqual(
    iconSprite?._spriteFrame?.__uuid__,
    '70f86993-4128-41e8-bc6d-f09aff9fd929@f9941',
    'Continue Game must reuse the established rewarded-ad icon sprite frame',
);
assert.strictEqual(
    adIconMeta.uuid,
    '70f86993-4128-41e8-bc6d-f09aff9fd929',
    'serialized icon reference must resolve to the existing BootstrapBundle asset',
);
assert.ok(iconNode._lpos.x < labelNode._lpos.x, 'ad icon must render to the left of the Continue Game label');

console.log('lose-settlement-rewarded-continue.test.js passed');
