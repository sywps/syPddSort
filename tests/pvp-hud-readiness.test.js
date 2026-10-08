const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

class Color {}
class UITransform { setContentSize(width, height) { this.width = width; this.height = height; } }
class Widget { updateAlignment() {} }
class Label { static HorizontalAlign = { CENTER: 0 }; static VerticalAlign = { CENTER: 0 }; static Overflow = { SHRINK: 0 }; }
class Graphics { clear() {} roundRect() {} fill() {} stroke() {} rect() {} }
class Node {
    constructor(name) { this.name = name; this.children = []; this.components = []; this.isValid = true; this.scale = { y: 1 }; }
    addChild(child) { child.parent = this; this.children.push(child); }
    getChildByName(name) { return this.children.find(n => n.name === name && n.isValid); }
    getComponent(type) { return this.components.find(c => c instanceof type); }
    addComponent(type) { const c = new type(); c.node = this; this.components.push(c); return c; }
    setPosition() {} setSiblingIndex() {}
    destroy() { this.isValid = false; this.children.forEach(n => n.destroy()); }
}
const shared = { Color, UITransform, Widget, Label, Graphics, Node, Layers: { Enum: { UI_2D: 1 } } };
const session = { pendingGameplayRequest: { routeReason: 'pvp-ranked', entryMode: 'theme', prefix: 'zt_level_' } };
const moduleRef = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, {
    exports: moduleRef.exports, module: moduleRef, console, Date,
    require(id) {
        if (id === '../GameCtrlShared') return shared;
        if (id === '../AppRoot') return { AppRoot: { tryGet: () => ({ session }) } };
        if (id === '../PvpModeConfig') return { PVP_LEVEL_PREFIX: 'zt_level_', isPixelPvpMatch: () => true,
            isPvpRouteReason: reason => reason === 'pvp-ranked', clampPvpProgress: v => Math.max(0, Math.min(1, v)) };
        if (id === '../PvpServiceMgr') return { PvpServiceMgr: { inst: { preparePreviewBattle() {}, persistBattle() {} } } };
        if (id === '../LevelConfig') return { COLOR_HEX: {} };
        return {};
    },
});
function context() {
    return { demo: true, entryConfirmed: true, self: { displayName: 'Self' }, opponent: { displayName: 'Opponent' },
        matchType: 'friend', friendRole: 'creator', opponentTargetMs: Infinity, startedAtMs: Date.now() };
}
function host() {
    const runtime = { levelData: {}, boardModel: { correctColors: [], locked: [] }, mountLeaderboardAvatar() {},
        _pvpLastRecordedProgress: 0 };
    moduleRef.exports.installPvpModeModule(runtime);
    const top = new Node('TopBarGroup');
    new Node('Fixed').addChild(top);
    for (const name of ['LevelTitle', 'LevelTitleLevel1', 'TimerWrap', 'PchSpeedButton', 'Settings']) {
        const n = new Node(name); top.addChild(n); n.addComponent(UITransform).setContentSize(50, 50); n.addComponent(Widget);
    }
    const timer = new Node('Timer'); timer.addComponent(Label); top.getChildByName('TimerWrap').addChild(timer);
    runtime.getGameplayFixedGroup = () => top;
    runtime.getGameplayBottomHudChild = () => ({});
    return runtime;
}
session.pvpBattleContext = context();
const home = host();
const game = host();
for (let i = 0; i < 60; i++) {
    home.updatePvpBattle(); game.updatePvpBattle(); // Shared pending route, no local HUD yet.
}
game.mountPvpBattleHud();
game.updatePvpBattle();
assert.strictEqual(game._pvpSelfProgress.label.string, '0%');
assert.strictEqual(game._pvpOpponentProgress.label.string, '待好友挑战');
home.updatePvpBattle(); // Home must not use the Game runtime's readiness.
const firstHud = game._pvpBattleHud;
session.pvpBattleContext = context();
game._pvpSelfProgress.label.string = 'unchanged';
game.updatePvpBattle();
assert.strictEqual(game._pvpSelfProgress.label.string, 'unchanged', 'old HUD must not update a new match');
game.mountPvpBattleHud();
assert.strictEqual(firstHud.isValid, false);
game.updatePvpBattle();
assert.strictEqual(game._pvpSelfProgress.label.string, '0%');
game._pvpBattleHud.destroy();
game._pvpSelfProgress = undefined;
game.updatePvpBattle(); // Scene destruction must stop the updater.
// A failed mount must not publish a ready state or hide the actual initialization error.
game.getGameplayFixedGroup = () => { throw new Error('missing top bar'); };
assert.throws(() => game.mountPvpBattleHud(), /missing top bar/);
game.updatePvpBattle();
console.log('pvp-hud-readiness.test.js passed');
