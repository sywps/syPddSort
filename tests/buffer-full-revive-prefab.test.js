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
const timeoutFactory = extractMethod(controllerSource, 'createReviveSettlementPanel(): Node');
const bufferReviveAction = extractMethod(controllerSource, 'runBufferFullReviveAction(overlay: Node): void');
const resultProgressSync = extractMethod(controllerSource, 'private syncResultProgressWidget(panel: Node, ratio: number = 0, allowStaticSummary: boolean = false): void');
const settlementHudSource = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
assert.ok(
    resultProgressSync.includes("const completionSummary = box.getChildByName('Label');"),
    'revive-panel creation must recognize the Prefab-controlled text completion summary',
);
assert.ok(
    resultProgressSync.includes('if (hasTextCompletionSummary) return;'),
    'text completion summary must bypass only the obsolete bar-layout contract',
);
assert.ok(
    resultProgressSync.includes('const hasTextCompletionSummary = allowStaticSummary && !!completionSummary?.getComponent(Label);'),
    'only explicitly identified revive panels may use the static summary layout',
);
assert.ok(
    settlementHudSource.includes('syncSettlementCompletionSummary(panel: Node | null | undefined, percent: number): boolean'),
    'settlement summary sync must report whether the Prefab text layout handled the progress',
);
assert.ok(
    settlementHudSource.includes('if (this.syncSettlementCompletionSummary(panel, percent)) return;'),
    'live failure progress must update the text layout before requiring the legacy progress bar',
);
const settlementCompletionSummary = extractMethod(
    settlementHudSource,
    'syncSettlementCompletionSummary(panel: Node | null | undefined, percent: number): boolean',
);
assert.ok(
    settlementCompletionSummary.includes("panel?.name === 'ReviveSettlementOverlay'")
        && settlementCompletionSummary.includes("panel?.name === 'BufferFullSettlementOverlay'"),
    'runtime-named revive overlays must preserve their static prompt instead of receiving a completion percentage',
);
assert.ok(
    settlementHudSource.includes('this._gameplayResultPanelController?.captureReviveFailure?.(reason);'),
    'each loss must freeze its revive reason before the failure UI can be entered',
);
assert.ok(
    controllerSource.includes("bufferFullRevive: 'UI/Prefabs/Panels/BufferFullRevivePanel'"),
    'result-panel loader must declare the dedicated buffer-full prefab path',
);
assert.ok(
    controllerSource.includes("revive: 'UI/Prefabs/Panels/RevivePanel'"),
    'result-panel loader must declare the dedicated timeout prefab path',
);
assert.ok(
    controllerSource.includes("['win', 'revive', 'bufferFullRevive', 'lose']"),
    'prefab readiness must include the dedicated buffer-full prefab',
);
assert.ok(
    bufferFactory.includes("this.instantiateGameplayOverlay('bufferFullRevive', 'BufferFullSettlementOverlay')"),
    'buffer-full settlement must instantiate the dedicated prefab',
);
assert.ok(
    timeoutFactory.includes('this.syncResultProgressWidget(overlay, 0, true);')
        && bufferFactory.includes('this.syncResultProgressWidget(overlay, 0, true);'),
    'only the two revive panels may opt into the static prompt layout',
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
assert.ok(
    bufferFactory.includes('this.bindPanelButton(continueBtn, () => this.runBufferFullReviveAction(overlay));'),
    'buffer-full factory must bind its existing dedicated ad continuation action',
);
assert.match(
    bufferReviveAction,
    /runRewardedGrant\('pch_buffer_full_revive',[\s\S]*?continueAfterBufferFull\(\)/,
    'dedicated prefab migration must preserve the rewarded +12 continuation',
);
assert.ok(bufferReviveAction.includes("successToast: '已增加12个位置'"));

const timeoutPrefab = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/RevivePanel.prefab');
const timeoutMeta = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/RevivePanel.prefab.meta');
const bufferPrefab = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/BufferFullRevivePanel.prefab');
const bufferMeta = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/BufferFullRevivePanel.prefab.meta');
const titleArtMeta = readJson('assets/GameAssetsBundle/Textures/UI/revive_title_ribbon.png.meta');
const timeoutArtMeta = readJson('assets/GameAssetsBundle/Textures/UI/revive_timeout_illustration.png.meta');
const bufferArtMeta = readJson('assets/GameAssetsBundle/Textures/UI/tc_img_40.png.meta');

assert.strictEqual(timeoutPrefab[0]?._name, 'RevivePanel');
assert.strictEqual(timeoutPrefab[1]?._name, 'RevivePanel');
assert.strictEqual(timeoutMeta.userData?.syncNodeName, 'RevivePanel');
assert.strictEqual(timeoutMeta.uuid, '853369d3-bce6-4a04-aaaf-1d8b2040707b');
assert.strictEqual(bufferPrefab[0]?._name, 'BufferFullRevivePanel');
assert.strictEqual(bufferPrefab[1]?._name, 'BufferFullRevivePanel');
assert.strictEqual(bufferMeta.userData?.syncNodeName, 'BufferFullRevivePanel');
assert.strictEqual(bufferMeta.uuid, '1699e623-505e-4752-937d-1da640e21860');
assert.notStrictEqual(bufferMeta.uuid, timeoutMeta.uuid, 'timeout and buffer-full prefabs must have distinct UUIDs');

const title = findLabel(bufferPrefab, '复活');
assert.strictEqual(title.label._fontSize, 88);
assert.strictEqual(title.label._lineHeight, 104);

const message = findLabel(bufferPrefab, '复活并扩展传送带12格');
assert.strictEqual(message.node._active, true, 'buffer-full explanation must be visible from the prefab');
assert.strictEqual(message.label._fontSize, 36);
assert.strictEqual(message.label._lineHeight, 44);
assert.strictEqual(message.label._enableWrapText, false);
assert.strictEqual(message.label._overflow, 2);
assert.strictEqual(message.ui?._contentSize?.width, 650);
assert.strictEqual(message.ui?._contentSize?.height, 70);

assert.ok(
    !JSON.stringify(bufferPrefab).includes('"_string":"120秒"')
        && !JSON.stringify(bufferPrefab).includes('"_string": "120秒"'),
    'buffer-full prefab must not retain the removed standalone timeout label',
);

const reviveLabel = findLabel(bufferPrefab, '免费复活');
assert.strictEqual(reviveLabel.parent?._name, 'ContinueBtn');
assert.strictEqual(reviveLabel.label._fontSize, 56);
assert.strictEqual(reviveLabel.label._lineHeight, 80);

const infoArt = findNode(bufferPrefab, 'BufferFullIllustration');
const infoComponents = componentsOf(bufferPrefab, infoArt.node);
const infoUi = infoComponents.find((component) => component.__type__ === 'cc.UITransform');
const infoSprite = infoComponents.find((component) => component.__type__ === 'cc.Sprite');
assert.strictEqual(infoArt.node._lpos?.y, 0);
assert.strictEqual(infoUi?._contentSize?.width, 644);
assert.strictEqual(infoUi?._contentSize?.height, 308);
assert.strictEqual(infoSprite?._enabled, true);
assert.strictEqual(infoSprite?._sizeMode, 0);
assert.strictEqual(
    infoSprite?._spriteFrame?.__uuid__,
    'de393821-f4c5-4114-9a15-70b4e5ebc12a@f9941',
    'buffer-full art must be serialized on the clean visible illustration node',
);

assert.strictEqual(findLabel(timeoutPrefab, '复活').node._active, true);
assert.ok(
    !JSON.stringify(timeoutPrefab).includes('"_string":"120秒"')
        && !JSON.stringify(timeoutPrefab).includes('"_string": "120秒"'),
    'timeout prefab must use the confirmed combined reward copy instead of a duplicate standalone label',
);
assert.strictEqual(findNode(timeoutPrefab, 'ContinueBtn').node._active, true);
const timeoutReward = findLabel(timeoutPrefab, '获得120秒额外时间+扩展传送带');
assert.strictEqual(timeoutReward.label._fontSize, 32);
assert.strictEqual(timeoutReward.label._lineHeight, 42);
assert.strictEqual(timeoutReward.ui?._contentSize?.width, 650);
assert.strictEqual(timeoutReward.ui?._contentSize?.height, 70);
const timeoutReviveLabel = findLabel(timeoutPrefab, '免费复活');
assert.strictEqual(timeoutReviveLabel.parent?._name, 'ContinueBtn');
assert.strictEqual(timeoutReviveLabel.label._fontSize, reviveLabel.label._fontSize);
assert.strictEqual(timeoutReviveLabel.label._lineHeight, reviveLabel.label._lineHeight);
assert.strictEqual(timeoutReviveLabel.ui?._contentSize?.width, reviveLabel.ui?._contentSize?.width);
const timeoutAdIcon = findNode(timeoutPrefab, 'popup_ad_play_icon');
const bufferAdIcon = findNode(bufferPrefab, 'popup_ad_play_icon');
assert.strictEqual(byId(timeoutPrefab, timeoutAdIcon.node._parent)?._name, 'ContinueBtn');
assert.strictEqual(byId(bufferPrefab, bufferAdIcon.node._parent)?._name, 'ContinueBtn');
for (const [adIcon, ctaLabel, kind] of [
    [timeoutAdIcon, timeoutReviveLabel, 'timeout'],
    [bufferAdIcon, reviveLabel, 'buffer-full'],
]) {
    assert.ok(adIcon.node._lpos?.x < ctaLabel.node._lpos?.x, `${kind} CTA icon must remain left of its label`);
    assert.ok(
        Math.abs((adIcon.node._lpos?.y || 0) - (ctaLabel.node._lpos?.y || 0)) <= 32,
        `${kind} CTA icon and label must remain vertically aligned`,
    );
}
assert.ok(
    !JSON.stringify(timeoutPrefab).includes('de393821-f4c5-4114-9a15-70b4e5ebc12a@f9941'),
    'timeout prefab must remain independent from the buffer-full art',
);

for (const [fileName, meta, uuid, width, height] of [
    ['revive_title_ribbon.png', titleArtMeta, '00895f15-d856-44a5-acd0-326ccedb359a', 1024, 279],
    ['revive_timeout_illustration.png', timeoutArtMeta, '123c4ced-f82b-4826-9499-1d90c53d8478', 1024, 722],
    ['tc_img_40.png', bufferArtMeta, 'de393821-f4c5-4114-9a15-70b4e5ebc12a', 644, 308],
]) {
    assert.strictEqual(meta.uuid, uuid, `${fileName} must keep its serialized asset UUID`);
    assert.strictEqual(meta.subMetas?.f9941?.userData?.rawWidth, width, `${fileName} width must match sprite metadata`);
    assert.strictEqual(meta.subMetas?.f9941?.userData?.rawHeight, height, `${fileName} height must match sprite metadata`);
    const png = fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/Textures/UI', fileName));
    assert.deepStrictEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${fileName} must be a PNG`);
    assert.strictEqual(png.readUInt32BE(16), width, `${fileName} PNG width must match metadata`);
    assert.strictEqual(png.readUInt32BE(20), height, `${fileName} PNG height must match metadata`);
}

for (const prefab of [timeoutPrefab, bufferPrefab]) {
    const box = findNode(prefab, 'Box');
    const boxUi = componentsOf(prefab, box.node).find((component) => component.__type__ === 'cc.UITransform');
    assert.deepStrictEqual([boxUi?._contentSize?.width, boxUi?._contentSize?.height], [720, 1280], 'revive content must use the full screen design area');
    assert.strictEqual(componentsOf(prefab, box.node).some((component) => component.__type__ === 'cc.Sprite'), false, 'clean revive Box must not add a solid content background');
    const shade = findNode(prefab, 'Shade');
    const shadeParent = byId(prefab, shade.node._parent);
    const shadeSprite = componentsOf(prefab, shade.node).find((component) => component.__type__ === 'cc.Sprite');
    assert.strictEqual(byId(prefab, shadeParent?._children?.[0])?._name, 'Shade', 'Shade must remain beneath Box in the Prefab');
    assert.strictEqual(shadeSprite?._color?.a, 190, 'revive Shade must dim the gameplay behind Box');
    const closeButton = findNode(prefab, 'CloseBtn');
    const closeComponents = componentsOf(prefab, closeButton.node);
    const closeUi = closeComponents.find((component) => component.__type__ === 'cc.UITransform');
    const closeSprite = closeComponents.find((component) => component.__type__ === 'cc.Sprite');
    const closeLabel = closeComponents.find((component) => component.__type__ === 'cc.Label');
    assert.deepStrictEqual([closeButton.node._lpos?.x, closeButton.node._lpos?.y], [286, 552], 'CloseBtn must be positioned in the upper right');
    assert.deepStrictEqual([closeUi?._contentSize?.width, closeUi?._contentSize?.height], [76, 76], 'CloseBtn must use a compact hit area instead of the old bottom strip');
    assert.strictEqual(closeSprite?._enabled, true, 'CloseBtn must render its existing close icon');
    assert.strictEqual(closeSprite?._spriteFrame?.__uuid__, '423514ba-fa47-4fc0-be7c-fa1b1378e82a@f9941');
    assert.strictEqual(closeLabel, undefined, 'CloseBtn must not retain the legacy blank-close Label beside its Sprite');

    for (const node of prefab.filter((record) => record?.__type__ === 'cc.Node')) {
        const renderables = componentsOf(prefab, node).filter(
            (component) => component.__type__ === 'cc.Sprite' || component.__type__ === 'cc.Label',
        );
        assert.ok(renderables.length <= 1, `${node._name || '<unnamed>'} must not contain more than one UI renderable`);
    }
    assert.strictEqual(prefab.some((record) => record?.__type__ === 'cc.UIOpacity'), false, 'clean revive prefab must not serialize a permanent opacity component');
    assert.ok(
        prefab.filter((record) => record?.__type__ === 'cc.PrefabInfo').every((record) => String(record.fileId || '').startsWith('revive-v2-')),
        'clean revive prefab must use fresh V2 node file IDs instead of legacy serialization IDs',
    );

    const [prompt, width] = prefab === timeoutPrefab
        ? ['时间不够啦！', 480]
        : ['啊哦！传送带满了！', 520];
    const promptLabel = findLabel(prefab, prompt);
    assert.strictEqual(byId(prefab, promptLabel.node._parent)?._name, 'Box', 'revive prompt must remain in the existing summary position');
    assert.ok(Math.abs(Number(promptLabel.node._lpos?.x) || 0) <= 16, 'revive prompt must remain visually centered');
    assert.strictEqual(promptLabel.label._fontSize, 52, 'revive prompt must be slightly more prominent');
    assert.strictEqual(promptLabel.label._lineHeight, 64);
    assert.strictEqual(promptLabel.label._isBold, true);
    assert.strictEqual(promptLabel.ui?._contentSize?.width, width);
    assert.strictEqual(promptLabel.ui?._contentSize?.height, 86);
    assert.strictEqual(promptLabel.node._children?.length, 0, 'static prompt must not retain a hidden legacy caption child');
    assert.strictEqual(
        prefab.some((record) => record?.__type__ === 'cc.Node' && record._name === 'Label-001'),
        false,
        'legacy completion caption must not remain serialized',
    );
    assert.ok(!JSON.stringify(prefab).includes('"_string":"86%"'), 'revive prefab must not retain a visible completion percentage');
}

for (const prefab of [timeoutPrefab, bufferPrefab]) {
    const banner = findNode(prefab, 'TitleRibbon');
    const bannerSprite = componentsOf(prefab, banner.node).find((component) => component.__type__ === 'cc.Sprite');
    assert.strictEqual(bannerSprite?._spriteFrame?.__uuid__, '00895f15-d856-44a5-acd0-326ccedb359a@f9941', 'both revive panels must use the shared new title ribbon');
}

for (const scriptPath of [
    'scripts/extract-bootstrap-bundle.js',
    'scripts/patch-bootstrap-dynamic-assets.js',
]) {
    assert.ok(
        read(scriptPath).includes('UI/Prefabs/Panels/RevivePanel'),
        `${scriptPath} must promote the formal timeout prefab`,
    );
    assert.ok(
        read(scriptPath).includes('UI/Prefabs/Panels/BufferFullRevivePanel'),
        `${scriptPath} must promote the formal dedicated buffer-full prefab`,
    );
}

console.log('buffer-full-revive-prefab.test.js passed');
