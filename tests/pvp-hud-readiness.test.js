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
const boardExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/BoardModel.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: boardExports });
const { BoardModel } = boardExports;
const shared = { Color, UITransform, Widget, Label, Graphics, Node, BoardModel, Layers: { Enum: { UI_2D: 1 } } };
const session = { pendingGameplayRequest: { routeReason: 'pvp-ranked', entryMode: 'theme', prefix: 'zt_level_' } };
const moduleRef = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source + '\nexport { playablePvpProgress };', {
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
    const levelData = { boardWidth: 3, boardHeight: 1, correctColorArr: [[1, 1, 2]], initRandomColorArr: [[1, 2, 1]] };
    const runtime = { levelData, boardModel: new BoardModel(levelData), mountLeaderboardAvatar() {},
        _pvpLastRecordedProgress: 0 };
    moduleRef.exports.installPvpModeModule(runtime);
    const top = new Node('TopBarGroup');
    new Node('Fixed').addChild(top);
    for (const name of ['LevelTitle', 'LevelTitleLevel1', 'TimerWrap', 'PchSpeedButton', 'Settings', 'GameplayHelpButton']) {
        const n = new Node(name); top.addChild(n); n.addComponent(UITransform).setContentSize(50, 50); n.addComponent(Widget);
    }
    top.getChildByName('Settings').getComponent(UITransform).setContentSize(85, 85);
    top.getChildByName('GameplayHelpButton').getComponent(UITransform).setContentSize(98, 84);
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
const top = game.getGameplayFixedGroup();
const centerFromTop = node => node.getComponent(Widget).top + node.getComponent(UITransform).height / 2;
assert.equal(centerFromTop(top.getChildByName('GameplayHelpButton')),
    centerFromTop(top.getChildByName('Settings')), 'different-sized help/settings icons share the same top-row center');
game.updatePvpBattle();
assert.strictEqual(game._pvpSelfProgress.label.string, '0%');
assert.strictEqual(game._pvpOpponentProgress.label.string, '待好友挑战');
game.boardModel.locked[0][1] = true;
game.updatePvpBattle();
assert.strictEqual(game._pvpSelfProgress.label.string, '50%', 'only originally unsettled cells count toward HUD completion');
assert.equal(game._pvpProgressTimeline.at(-1).progress, 2 / 3, 'cloud/replay keeps its existing full-board ratio');
game.boardModel.locked[0][2] = true;
game.updatePvpBattle();
assert.strictEqual(game._pvpSelfProgress.label.string, '100%');
game.boardModel.locked[0][2] = false;
game.boardModel.locked[0][1] = false;
const normalize = moduleRef.exports.playablePvpProgress;
assert.equal(normalize(0.66, 0.66), 0, 'existing opponent timeline starts at 0% after baseline removal');
assert.ok(Math.abs(normalize(0.83, 0.66) - 0.5) < 1e-9);
assert.equal(normalize(1, 0.66), 1);
assert.equal(normalize(0, 0.66), 0, 'empty initial timeline must not produce negative progress');
assert.equal(normalize(0.5, 0), 0.5);
assert.equal(normalize(1, 1), 1, 'fully settled level must not divide by zero');
const resumed = host();
resumed.boardModel.locked[0][1] = true;
resumed.mountPvpBattleHud();
resumed.updatePvpBattle();
assert.strictEqual(resumed._pvpSelfProgress.label.string, '50%', 're-entry uses original level baseline, not resumed locked count');
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
