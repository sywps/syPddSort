const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const file = 'assets/Scripts/Core/Panels/GameCirclePanelController.ts';
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const cls = source.statements.find(ts.isClassDeclaration).getText(source).replace('export class', 'class');
function emitter() {
  const handlers = new Map();
  return { on(k, f) { if (!handlers.has(k)) handlers.set(k, new Set()); handlers.get(k).add(f); },
    off(k, f) { handlers.get(k)?.delete(f); }, emit(k) { for (const f of [...(handlers.get(k) || [])]) f(); },
    count() { return [...handlers.values()].reduce((n, s) => n + s.size, 0); } };
}
const director = emitter(), game = emitter();
let options, creates = 0, shows = 0, hides = 0, destroys = 0, taps, rect = { left: 10, top: 20, width: 100, height: 40 }, fail = false;
const records = [], visualButton = { clickEvents: [1], enabled: true };
const enter = { activeInHierarchy: true, getComponent: () => visualButton };
const overlay = { isValid: true, activeInHierarchy: true, getSiblingIndex: () => 0, parent: { children: [] } };
overlay.parent.children = [overlay];
const runtime = { _gameForeground: true, requirePanelChild: () => enter };
const context = { director, game, Director: { EVENT_AFTER_DRAW: 'draw' }, Game: { EVENT_SHOW: 'show', EVENT_HIDE: 'hide' },
  Button: {}, AudioMgr: { inst: { play() {} } }, AnalyticsMgr: { inst: { trackFunnelEvent: e => records.push(e) } },
  hasWeChatGameCircleRuntime: () => true, openCollectionShellOverlay: (r, o) => { options = o; },
  GAME_CIRCLE_PANEL_PREFAB_PATH: 'prefab', GAME_CIRCLE_PANEL_TITLE: '游戏圈',
  resolveNativeButtonStyle: () => ({ ...rect }), runtimeLog() {}, console: { error() {} },
  createWeChatGameCircleButton: (link, style, onTap) => {
    creates++; if (fail) throw Error('native failed'); taps = onTap; shows++;
    return { style, button: { style: { ...style }, show() { shows++; }, hide() { hides++; }, destroy() { destroys++; } } };
  }, destroyWeChatGameCircleButton: button => button?.destroy(),
};
vm.runInNewContext(ts.transpileModule(cls + '\nglobalThis.Controller = GameCirclePanelController;', {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, context);
const controller = new context.Controller(runtime);
controller.open(''); options.onReady({ overlay, box: {} });
assert.equal(visualButton.enabled, false); assert.equal(visualButton.clickEvents.length, 0);
director.emit('draw'); assert.equal(creates, 0, 'no native button during opening animation');
options.onOpened({ overlay }); director.emit('draw'); assert.equal(creates, 1);
director.emit('draw'); assert.equal(creates, 1, 'no per-frame native recreation');
taps(); assert.equal(records[0].eventName, 'csd_game_circle_enter_tap');
rect.left = 25; director.emit('draw'); assert.equal(runtime._gameCircleNativeButton.style.left, 25);
game.emit('hide'); assert.equal(hides, 1); director.emit('draw'); assert.equal(shows, 1);
game.emit('show'); director.emit('draw'); assert.equal(shows, 2);
const cover = { activeInHierarchy: true, getSiblingIndex: () => 1 }; overlay.parent.children.push(cover);
director.emit('draw'); assert.equal(hides, 2); cover.activeInHierarchy = false;
director.emit('draw'); assert.equal(shows, 3);
options.onClose(); assert.equal(destroys, 1); assert.equal(game.count() + director.count(), 0);
options.onOpened({ overlay }); assert.equal(director.count(), 0, 'stale animation callback must not revive a closed overlay');
runtime._gameCircleOverlay = null; fail = true;
controller.open(''); options.onReady({ overlay, box: {} }); options.onOpened({ overlay }); director.emit('draw'); director.emit('draw');
assert.equal(creates, 2, 'no silent per-frame retry after creation error');
assert.equal(records.at(-1).eventName, 'csd_game_circle_native_error');
controller.destroy(); assert.equal(game.count() + director.count(), 0);
console.log('PASS GameCircle native-only lifecycle: animation, draw, tap, resize, cover, background, close, errors');
