const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function callback(file, marker, context) {
    const source = fs.readFileSync(`assets/Scripts/Core/${file}`, 'utf8');
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    let found;
    function visit(node) {
        if (ts.isCallExpression(node) && node.getText(tree).startsWith(marker)) {
            found = node.arguments.find(ts.isArrowFunction);
        }
        ts.forEachChild(node, visit);
    }
    visit(tree);
    assert(found, marker);
    const js = ts.transpileModule(`var click = ${found.getText(tree)}; click;`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    return vm.runInNewContext(js, context);
}
function audioContext(extra = {}) {
    const sounds = [];
    return { sounds, AudioMgr: { inst: { play: name => sounds.push(name) } }, ...extra };
}

test('artwork arrows only sound on an actual change, not at boundaries', () => {
    const ctx = audioContext({ index: 0, levels: [1, 2], draw() {} });
    const left = callback('HomeArtworkPreview.ts', 'runtime.bindPanelButton(leftArrow!', ctx);
    const right = callback('HomeArtworkPreview.ts', 'runtime.bindPanelButton(rightArrow!', ctx);
    left(); assert.equal(ctx.sounds.length, 0);
    right(); right(); assert.equal(ctx.sounds.length, 1);
    left(); left(); assert.deepEqual(ctx.sounds, ['button', 'button']);
});
test('background unlock does not sound for scroll-suppressed taps', () => {
    let suppressed = true, equips = 0;
    const ctx = audioContext({ consumeSuppressedClick: () => suppressed, action: { getComponent: () => ({}) },
        Button: {}, setActionVisual() {}, skin: { id: 1 }, refreshActions() {},
        equipBackgroundSkin: () => equips++ });
    // The last matching binding is the ad-unlock path.
    const marker = "bindSkinPanelButton(this, action, card.name + '/ActionBtn', () => {";
    const click = callback('GameCtrlModules/SkinBackgroundModule.ts', marker, {
        ...ctx, watchBackgroundSkinUnlockAd: () => equips++,
    });
    click(); assert.equal(ctx.sounds.length, 0);
    suppressed = false; click(); assert.deepEqual(ctx.sounds, ['button']); assert.equal(equips, 1);
});
test('PK lobby guards and shared binding avoid a blanket extra sound', () => {
    const ctx = audioContext({ _pvpMatchStarting: true, openSettingsPanel() {} });
    const click = callback('GameCtrlModules/PvpModeModule.ts', "bindLobbyButton(overlay, 'Content/Header/LobbySettings'", ctx);
    click(); assert.equal(ctx.sounds.length, 0);
    ctx._pvpMatchStarting = false; click(); assert.deepEqual(ctx.sounds, ['button']);
    const shared = fs.readFileSync('assets/Scripts/Core/GameCtrlModules/HomeCommerceModule.ts', 'utf8');
    const body = shared.slice(shared.indexOf('bindPanelButton(node:'), shared.indexOf('playPopupOpenAnim('));
    assert(!body.includes("play('button')"));
});
