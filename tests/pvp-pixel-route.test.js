'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');
const root = path.join(__dirname, '../assets/Scripts/Core');
function load(file, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, console, Date, URLSearchParams,
    require: id => imports[id] || {},
  });
  return module.exports;
}
const config = load('PvpModeConfig.ts');
const startup = load('StartupRouteService.ts', {
  './StartupLocalProgress': { resolveStartupLocalProgressFromRaw: raw => ({ level: Number(raw) || 1 }) },
});
const route = startup.resolveStartupRouteDecisionFromInputs({ pvppreview: '1', level: '3' }, 77);
assert.strictEqual(route.prefix, 'zt_level_');
assert.strictEqual(route.levelId, 3);
assert.strictEqual(startup.resolveStartupRouteDecisionFromInputs({}, 77).prefix, 'level_', 'normal startup must remain mainline');

const requests = [];
const session = { pendingGameplayRequest: { levelId: 3, prefix: 'zt_level_', routeReason: 'pvp-ranked' } };
const app = { session, markGameRequested: (...args) => requests.push(args) };
const scene = load('GameCtrlModules/SceneHomeEntryModule.ts', { '../AppRoot': { AppRoot: { tryGet: () => app } } });
const runtime = {};
scene.installSceneHomeEntryModule(runtime);
runtime.syncAppSessionForGameplayRequest(3, 'zt_level_');
assert.strictEqual(requests[0][2], 'theme');
assert.strictEqual(requests[0][4], 'pvp-ranked', 'theme loader must preserve the ranked mode reason');
runtime.syncAppSessionForGameplayRequest(3, 'level_');
assert.strictEqual(requests[1][4], '', 'same numeric mainline ID must not inherit ranked restrictions');
runtime.syncAppSessionForGameplayRequest(4, 'zt_level_');
assert.strictEqual(requests[2][4], '', 'another chapter must not inherit ranked restrictions');

const storage = new Map();
const cc = { _decorator: { ccclass: () => value => value }, sys: { localStorage: {
  getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
} } };
const serviceModule = load('PvpServiceMgr.ts', { cc, './PvpModeConfig': config });
const service = serviceModule.PvpServiceMgr.inst;
const match = { matchId: 'pixel-3', levelId: 3, levelPrefix: 'zt_level_', rulesVersion: config.PVP_RULES_VERSION,
  matchType: 'ranked', self: {}, opponent: {}, opponentRun: { terminalTimeMs: 5000, terminalType: 'PASS' } };
assert.strictEqual(service.toBattleContext(match).levelPrefix, 'zt_level_');
assert.throws(() => service.toBattleContext({ ...match, levelPrefix: 'level_' }), /像素拼图版本/);
assert.throws(() => service.toBattleContext({ ...match, rulesVersion: 'pvp-ranked-v1' }), /像素拼图版本/);
service.persistBattle({ ...match, levelPrefix: 'level_' });
assert.strictEqual(service.loadPersistedBattle(), null, 'old saved boards cannot resume on a theme board');
assert.strictEqual(storage.size, 1, 'do not delete legacy saves as a migration side effect');
service.persistBattle(service.toBattleContext(match));
assert.strictEqual(service.loadPersistedBattle().matchId, match.matchId);
console.log('PVP_PIXEL_ROUTE_TESTS_PASSED');
