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

function byId(records, ref) {
    return ref && Number.isInteger(ref.__id__) ? records[ref.__id__] : null;
}

function componentsOf(records, node) {
    return (node?._components || []).map((ref) => byId(records, ref)).filter(Boolean);
}

function findNode(records, name) {
    const index = records.findIndex((record) => record?.__type__ === 'cc.Node' && record._name === name);
    assert.ok(index >= 0, `missing node: ${name}`);
    return { index, node: records[index] };
}

function findLabel(records, text) {
    for (let index = 0; index < records.length; index += 1) {
        const node = records[index];
        if (node?.__type__ !== 'cc.Node') continue;
        const components = componentsOf(records, node);
        const label = components.find((component) => component.__type__ === 'cc.Label');
        if (label?._string !== text) continue;
        const ui = components.find((component) => component.__type__ === 'cc.UITransform');
        return { index, node, label, ui, parent: byId(records, node._parent) };
    }
    assert.fail(`missing label: ${JSON.stringify(text)}`);
}

const controllerSource = read('assets/Scripts/Core/GameplayResultPanelController.ts');
const bufferFactory = extractMethod(controllerSource, 'createBufferFullSettlementPanel(): Node');
assert.ok(
    controllerSource.includes("bufferFullRevive: 'UI/Prefabs/Panels/BufferFullRevivePanel'"),
    'result-panel loader must declare the dedicated buffer-full prefab path',
);
assert.ok(
    controllerSource.includes("['win', 'revive', 'bufferFullRevive', 'lose']"),
    'prefab readiness must include the dedicated buffer-full prefab',
);
assert.ok(
    bufferFactory.includes("this.instantiateGameplayOverlay('bufferFullRevive', 'BufferFullSettlementOverlay')"),
    'buffer-full settlement must instantiate the dedicated prefab',
);
for (const forbiddenRuntimeVisual of [
    'titleLabel',
    'messageLabel',
    'positionLabel',
    'reviveButtonLabel',
    'InfoArt',
    '.fontSize',
    '.lineHeight',
    '.setContentSize(',
]) {
    assert.ok(
        !bufferFactory.includes(forbiddenRuntimeVisual),
        `buffer-full factory must not control prefab visual field: ${forbiddenRuntimeVisual}`,
    );
}
assert.ok(!controllerSource.includes('drawBufferFullConveyorIllustration'), 'buffer-full art must no longer be code-drawn');
assert.ok(!controllerSource.includes('requireLabelWithText'), 'buffer-full copy must no longer be found and rewritten at runtime');
assert.match(
    bufferFactory,
    /runRewardedGrant\('pch_buffer_full_revive',[\s\S]*?continueAfterBufferFull\(\)/,
    'dedicated prefab migration must preserve the rewarded +12 continuation',
);
assert.ok(bufferFactory.includes("successToast: '已增加12个位置'"));

const timeoutPrefab = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/RevivePanel.prefab');
const timeoutMeta = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/RevivePanel.prefab.meta');
const bufferPrefab = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/BufferFullRevivePanel.prefab');
const bufferMeta = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/BufferFullRevivePanel.prefab.meta');
const artMeta = readJson('assets/GameAssetsBundle/Textures/UI/popup_buffer_full_conveyor.png.meta');

assert.strictEqual(bufferPrefab[0]?._name, 'BufferFullRevivePanel');
assert.strictEqual(bufferPrefab[1]?._name, 'BufferFullRevivePanel');
assert.strictEqual(bufferMeta.userData?.syncNodeName, 'BufferFullRevivePanel');
assert.strictEqual(bufferMeta.uuid, 'ef325ffc-7e49-421a-9a09-f9d7314731cd');
assert.notStrictEqual(bufferMeta.uuid, timeoutMeta.uuid, 'timeout and buffer-full prefabs must have distinct UUIDs');

const title = findLabel(bufferPrefab, '继续吗？');
assert.strictEqual(title.label._fontSize, 50);
assert.strictEqual(title.label._lineHeight, 52);

const message = findLabel(bufferPrefab, '暂存槽已满！\n腾出12个位置继续游戏吧！');
assert.strictEqual(message.node._active, true, 'buffer-full explanation must be visible from the prefab');
assert.strictEqual(message.label._fontSize, 26);
assert.strictEqual(message.label._lineHeight, 32);
assert.strictEqual(message.label._enableWrapText, true);
assert.strictEqual(message.label._overflow, 2);
assert.strictEqual(message.ui?._contentSize?.width, 446);
assert.strictEqual(message.ui?._contentSize?.height, 72);

const timeoutSeconds = findLabel(bufferPrefab, '120秒');
assert.strictEqual(timeoutSeconds.node._active, false, 'timeout-only 120-second copy must be hidden in the buffer prefab');

const reviveLabel = findLabel(bufferPrefab, '复活');
assert.strictEqual(reviveLabel.parent?._name, 'ContinueBtn');
assert.strictEqual(reviveLabel.label._fontSize, 50);
assert.strictEqual(reviveLabel.label._lineHeight, 56);

const infoArt = findNode(bufferPrefab, 'InfoArt');
const infoComponents = componentsOf(bufferPrefab, infoArt.node);
const infoUi = infoComponents.find((component) => component.__type__ === 'cc.UITransform');
const infoSprite = infoComponents.find((component) => component.__type__ === 'cc.Sprite');
assert.strictEqual(infoArt.node._lpos?.y, 52);
assert.strictEqual(infoUi?._contentSize?.width, 460);
assert.strictEqual(infoUi?._contentSize?.height, 210);
assert.strictEqual(infoSprite?._enabled, true);
assert.strictEqual(infoSprite?._sizeMode, 0);
assert.strictEqual(
    infoSprite?._spriteFrame?.__uuid__,
    'a8b11686-0609-4525-9442-40c7ee1b4c1d@f9941',
    'buffer-full art must be serialized on InfoArt',
);

assert.strictEqual(findLabel(timeoutPrefab, '快完成啦').node._active, true);
assert.strictEqual(findLabel(timeoutPrefab, '120秒').node._active, true);
assert.strictEqual(findLabel(timeoutPrefab, '+120秒').parent?._name, 'ContinueBtn');
assert.ok(
    !JSON.stringify(timeoutPrefab).includes('popup_buffer_full_conveyor'),
    'timeout prefab must remain independent from the buffer-full art',
);

assert.strictEqual(artMeta.uuid, 'a8b11686-0609-4525-9442-40c7ee1b4c1d');
assert.strictEqual(artMeta.subMetas?.f9941?.userData?.width, 460);
assert.strictEqual(artMeta.subMetas?.f9941?.userData?.height, 210);
assert.strictEqual(artMeta.subMetas?.f9941?.userData?.trimType, 'none');
const png = fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/Textures/UI/popup_buffer_full_conveyor.png'));
assert.deepStrictEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
assert.strictEqual(png.readUInt32BE(16), 460);
assert.strictEqual(png.readUInt32BE(20), 210);

for (const scriptPath of [
    'scripts/extract-bootstrap-bundle.js',
    'scripts/patch-bootstrap-dynamic-assets.js',
]) {
    assert.ok(
        read(scriptPath).includes('UI/Prefabs/Panels/BufferFullRevivePanel'),
        `${scriptPath} must promote the dedicated buffer-full prefab`,
    );
}

console.log('buffer-full-revive-prefab.test.js passed');
