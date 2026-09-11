const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));

function byId(records, ref) {
    return ref && Number.isInteger(ref.__id__) ? records[ref.__id__] : null;
}

function componentsOf(records, node) {
    return (node?._components || []).map((ref) => byId(records, ref)).filter(Boolean);
}

function childrenOf(records, node) {
    return (node?._children || []).map((ref) => byId(records, ref)).filter(Boolean);
}

function findNode(records, name) {
    const index = records.findIndex((record) => record?.__type__ === 'cc.Node' && record._name === name);
    assert.ok(index >= 0, `missing node: ${name}`);
    return { index, node: records[index] };
}

function findChild(records, parent, name) {
    const child = childrenOf(records, parent).find((node) => node._name === name);
    assert.ok(child, `missing ${name} below ${parent._name}`);
    return child;
}

function findLabel(records, node) {
    const label = componentsOf(records, node).find((component) => component.__type__ === 'cc.Label');
    assert.ok(label, `missing Label on ${node._name}`);
    return label;
}

function findLabelByText(records, text) {
    for (const node of records) {
        if (node?.__type__ !== 'cc.Node') continue;
        const label = componentsOf(records, node).find((component) => component.__type__ === 'cc.Label');
        if (label?._string === text) return label;
    }
    assert.fail(`missing Label text: ${text}`);
}

function rgba(color) {
    return [color?.r, color?.g, color?.b, color?.a];
}

function verifyPrefab(relativePath) {
    const records = readJson(relativePath);
    const { node: box } = findNode(records, 'Box');
    const summary = findChild(records, box, 'CompletionSummary');
    const prefix = findChild(records, summary, 'CompletionPrefix');
    const percent = findChild(records, summary, 'CompletionPercent');
    const summaryUi = componentsOf(records, summary).find((component) => component.__type__ === 'cc.UITransform');
    const prefixLabel = findLabel(records, prefix);
    const percentLabel = findLabel(records, percent);

    assert.deepStrictEqual([summary._lpos?.x, summary._lpos?.y], [0, 220], 'summary must occupy the confirmed text-only position');
    assert.deepStrictEqual(
        [summaryUi?._contentSize?.width, summaryUi?._contentSize?.height],
        [500, 58],
        'summary must reserve one compact text row',
    );
    assert.strictEqual(
        componentsOf(records, summary).some((component) => component.__type__ === 'cc.Sprite'),
        false,
        'summary must not introduce a white rounded background',
    );
    assert.deepStrictEqual(childrenOf(records, summary).map((node) => node._name), ['CompletionPrefix', 'CompletionPercent']);

    assert.strictEqual(prefixLabel._string, '关卡已完成');
    assert.strictEqual(prefixLabel._enableOutline, true);
    assert.strictEqual(prefixLabel._outlineWidth, 3);
    assert.strictEqual(prefixLabel._isBold, true);
    assert.deepStrictEqual(rgba(prefixLabel._color), [255, 255, 255, 255]);
    assert.deepStrictEqual(rgba(prefixLabel._outlineColor), [55, 75, 98, 255]);

    assert.strictEqual(percentLabel._string, '0%');
    assert.strictEqual(percentLabel._enableOutline, true);
    assert.strictEqual(percentLabel._outlineWidth, 3);
    assert.strictEqual(percentLabel._isBold, true);
    assert.deepStrictEqual(rgba(percentLabel._color), [255, 195, 42, 255]);
    assert.deepStrictEqual(rgba(percentLabel._outlineColor), [55, 75, 98, 255]);

    const isBufferFull = relativePath.includes('BufferFull');
    const promptLabel = findLabelByText(records, isBufferFull ? '啊哦！传送带满了！' : '时间不够啦！');
    const rewardLabel = findLabelByText(records, isBufferFull ? '复活并扩展传送带12格' : '获得120秒额外时间+扩展传送带');
    assert.deepStrictEqual(rgba(promptLabel._color), [255, 195, 42, 255]);
    assert.deepStrictEqual(rgba(promptLabel._outlineColor), [55, 75, 98, 255]);
    assert.strictEqual(promptLabel._outlineWidth, 2);
    assert.deepStrictEqual(rgba(rewardLabel._color), [247, 243, 232, 255]);
    assert.deepStrictEqual(rgba(rewardLabel._outlineColor), [55, 75, 98, 255]);
    assert.strictEqual(rewardLabel._outlineWidth, 2);
}

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

function compileExtractedMethod(source, signature, argumentNames) {
    const method = extractMethod(source, signature);
    return new Function(...argumentNames, method.slice(method.indexOf('{') + 1, -1));
}

verifyPrefab('assets/GameAssetsBundle/UI/Prefabs/Panels/RevivePanel.prefab');
verifyPrefab('assets/GameAssetsBundle/UI/Prefabs/Panels/BufferFullRevivePanel.prefab');

const settlementSource = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const summaryMethod = extractMethod(
    settlementSource,
    'syncSettlementCompletionSummary(panel: Node | null | undefined, percent: number): boolean',
);
for (const panelName of ['RevivePanel', 'BufferFullRevivePanel', 'ReviveSettlementOverlay', 'BufferFullSettlementOverlay']) {
    assert.ok(summaryMethod.includes(`panel?.name === '${panelName}'`), `${panelName} must use the revive completion summary path`);
}
assert.ok(
    summaryMethod.includes("?.getChildByName('CompletionSummary')")
        && summaryMethod.includes("?.getChildByName('CompletionPercent')"),
    'revive overlays must bind the prefab-owned percentage label',
);
assert.ok(
    summaryMethod.includes("throw new Error('[settlement-progress] revive panel is missing CompletionSummary/CompletionPercent')"),
    'a malformed revive prefab must fail explicitly instead of silently losing the percentage',
);

const syncCompletionSummary = compileExtractedMethod(
    settlementSource,
    'syncSettlementCompletionSummary(panel: Node | null | undefined, percent: number): boolean',
    ['panel', 'percent', 'Label'],
);
function makeRevivePanel(name) {
    const percentLabel = { string: '0%' };
    const percentNode = { getComponent() { return percentLabel; } };
    const summaryNode = {
        getChildByName(childName) { return childName === 'CompletionPercent' ? percentNode : null; },
    };
    const box = {
        getChildByName(childName) { return childName === 'CompletionSummary' ? summaryNode : null; },
    };
    return {
        panel: { name, getChildByName(childName) { return childName === 'Box' ? box : null; } },
        percentLabel,
    };
}

for (const panelName of ['ReviveSettlementOverlay', 'BufferFullSettlementOverlay']) {
    const runtimePanel = makeRevivePanel(panelName);
    assert.strictEqual(
        syncCompletionSummary.call({}, runtimePanel.panel, 87, function Label() {}),
        true,
        `${panelName} must report that it handled the completion summary`,
    );
    assert.strictEqual(runtimePanel.percentLabel.string, '87%', `${panelName} must write the current completion percentage`);
}

const malformedPanel = {
    name: 'ReviveSettlementOverlay',
    getChildByName(childName) {
        return childName === 'Box' ? { getChildByName() { return null; } } : null;
    },
};
assert.throws(
    () => syncCompletionSummary.call({}, malformedPanel, 87, function Label() {}),
    /revive panel is missing CompletionSummary\/CompletionPercent/,
    'missing dynamic revive text must surface as an explicit contract failure',
);

console.log('revive-completion-summary.test.js passed');
