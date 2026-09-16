const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));

function refId(ref) {
    return ref && Number.isInteger(ref.__id__) ? ref.__id__ : null;
}

function byId(records, ref) {
    const id = refId(ref);
    return id === null ? null : records[id];
}

function componentsOf(records, node) {
    return (node?._components || []).map((ref) => byId(records, ref)).filter(Boolean);
}

function findNode(records, name) {
    const index = records.findIndex((record) => record?.__type__ === 'cc.Node' && record._name === name);
    assert.ok(index >= 0, `missing node: ${name}`);
    return { index, node: records[index] };
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

const controller = read('assets/Scripts/Core/GameplayResultPanelController.ts');
const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');

assert.ok(controller.includes("const REVIVE_HOLD_TO_PEEK_HINT_NAME = 'HoldToPeekHint';"));
assert.ok(controller.includes('const REVIVE_HOLD_TO_PEEK_DURATION_SECONDS = 0.18;'));
assert.ok(
    controller.includes("new Set(['ContinueBtn', 'ShareBtn', 'CloseBtn', 'GiveUpBtn'])"),
    'all revive CTA roots must be excluded from the peek gesture',
);

const bindPeek = extractMethod(controller, 'private bindReviveHoldToPeek(overlay: Node, box: Node): void');
for (const required of [
    "box.getChildByName(REVIVE_HOLD_TO_PEEK_HINT_NAME)?.getComponent(Label)",
    "overlay.getChildByName('Shade')",
    'box.getComponent(UIOpacity) || box.addComponent(UIOpacity)',
    'shade.getComponent(UIOpacity) || shade.addComponent(UIOpacity)',
    'Tween.stopAllByTarget(boxOpacity)',
    'Tween.stopAllByTarget(shadeOpacity)',
    'setOpacity(0, false)',
    'setOpacity(255, immediate)',
    'event.propagationStopped = true',
    'Node.EventType.TOUCH_START',
    'Node.EventType.TOUCH_END',
    'Node.EventType.TOUCH_CANCEL',
    'overlay.on(Node.EventType.TOUCH_START, onTouchStart, this, true)',
    'overlay.on(Node.EventType.TOUCH_END, onTouchEndOrCancel, this, true)',
    'overlay.on(Node.EventType.TOUCH_CANCEL, onTouchEndOrCancel, this, true)',
]) {
    assert.ok(bindPeek.includes(required), `peek binding is missing ${required}`);
}
assert.ok(
    !bindPeek.includes('box.on(Node.EventType.TOUCH_START'),
    'hold-to-peek must not remain constrained to the fixed Box hit area',
);
assert.ok(
    bindPeek.indexOf('isInteractiveTarget(event.target as Node | null)') < bindPeek.indexOf('setOpacity(0, false)'),
    'CTA-target filtering must happen before a hold can hide the revive UI',
);
assert.ok(
    !bindPeek.includes('overlay.active = false'),
    'hold-to-peek must preserve the active modal node so the board cannot receive the same gesture',
);

const timeoutFactory = extractMethod(controller, 'createReviveSettlementPanel(): Node');
const bufferFactory = extractMethod(controller, 'createBufferFullSettlementPanel(): Node');
for (const factory of [timeoutFactory, bufferFactory]) {
    assert.ok(factory.includes('box.addComponent(BlockInputEvents)'), 'revive Box must remain a modal input blocker');
    assert.ok(factory.includes('this.bindReviveHoldToPeek(overlay, box);'), 'each revive factory must bind hold-to-peek');
}

const gameLose = extractMethod(settlement, "gameLose(reason: 'timeout' | 'buffer-full' = 'timeout')");
assert.ok(
    gameLose.includes('this.panelTimeoutContinue.active = true;')
        && gameLose.includes('resetReviveHoldToPeek?.(this.panelTimeoutContinue)'),
    'timeout revive must restore a prior interrupted hold before showing',
);
assert.ok(
    gameLose.includes('this.panelBufferFullContinue.active = true;')
        && gameLose.includes('resetReviveHoldToPeek?.(this.panelBufferFullContinue)'),
    'buffer-full revive must restore a prior interrupted hold before showing',
);

for (const [fileName, suffix] of [
    ['RevivePanel.prefab', 'timeout'],
    ['BufferFullRevivePanel.prefab', 'buffer'],
]) {
    const prefab = readJson(`assets/GameAssetsBundle/UI/Prefabs/Panels/${fileName}`);
    const box = findNode(prefab, 'Box');
    const hint = findNode(prefab, 'HoldToPeekHint');
    const hintUi = componentsOf(prefab, hint.node).find((component) => component.__type__ === 'cc.UITransform');
    const hintLabel = componentsOf(prefab, hint.node).find((component) => component.__type__ === 'cc.Label');
    const hintPrefabInfo = byId(prefab, hint.node._prefab);

    assert.strictEqual(byId(prefab, hint.node._parent), box.node, `${fileName} hint must remain prefab-owned below Box`);
    assert.strictEqual(hintLabel?._string, '按住屏幕查看关卡');
    assert.strictEqual(hint.node._active, true);
    assert.deepStrictEqual([hint.node._lpos?.x, hint.node._lpos?.y], [0, -555]);
    assert.ok(
        Number(hintUi?._contentSize?.width) > 0 && Number(hintUi?._contentSize?.height) > 0,
        `${fileName} hint must retain a visible UITransform`,
    );
    assert.strictEqual(hintLabel?._fontSize, 28);
    assert.strictEqual(hintLabel?._lineHeight, 36);
    assert.deepStrictEqual(
        [hintLabel?._color?.r, hintLabel?._color?.g, hintLabel?._color?.b],
        [247, 243, 232],
        'the hint must use the established revive copy color hierarchy',
    );
    assert.strictEqual(hintLabel?._enableOutline, true);
    assert.deepStrictEqual(
        [hintLabel?._outlineColor?.r, hintLabel?._outlineColor?.g, hintLabel?._outlineColor?.b, hintLabel?._outlineWidth],
        [55, 75, 98, 2],
    );
    assert.ok(hintPrefabInfo?.fileId?.startsWith(`revive-v2-hold-peek-${suffix}-node`));
    assert.ok((box.node._children || []).some((ref) => refId(ref) === hint.index));
    assert.strictEqual(
        prefab.some((record) => record?.__type__ === 'cc.UIOpacity'),
        false,
        'the prefab must not carry a permanent transparent state; opacity is hold-only runtime state',
    );
}

console.log('revive-hold-peek.test.js passed');
