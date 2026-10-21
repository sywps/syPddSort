'use strict';
const assert = require('assert'), fs = require('fs'), vm = require('vm'), ts = require('typescript');
function actualMethod(file, name, globals) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    let method;
    function visit(node) { if (ts.isMethodDeclaration(node) && node.name.getText(source) === name) method = node.getText(source); ts.forEachChild(node, visit); }
    visit(source); assert(method, name);
    const code = ts.transpileModule('class Probe {' + method + '}\nexports.method=Probe.prototype.' + name,
        { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {}; vm.runInNewContext(code, { exports, Date, Math, ...globals }); return exports.method;
}
async function main() {
    const coop = 'assets/Scripts/Core/GameCtrlModules/CoopModeModule.ts', pvp = 'assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts';
    const calls = [], stop = Error('stop before untested Cocos drawing');
    const AnalyticsMgr = { inst: {
        trackMultiplayerLobby: (...args) => calls.push(args),
        beginSettlement: () => 'settlement',
        finishMultiplayerAnalytics: (...args) => { calls.push(args); throw stop; },
    } };
    const openCoop = actualMethod(coop, 'openCoopLobby', { AnalyticsMgr, CoopPanelController: class { open() { calls.push(['panel-open']); } } });
    openCoop.call({}, 'square');
    assert.deepEqual(calls.splice(0), [['coop', 'multiplayer_lobby_open', 'square'], ['panel-open']]);
    const openPvp = actualMethod(pvp, 'openPvpLobby', { AnalyticsMgr, mountPixelPuzzleLobby: () => calls.push(['panel-open']) });
    openPvp.call({});
    assert.deepEqual(calls.splice(0), [['pvp', 'multiplayer_lobby_open'], ['panel-open']]);
    const finishCoop = actualMethod(coop, 'handleCoopTerminal', { AnalyticsMgr });
    assert.equal(finishCoop.call({ isCoopMode: () => false }, true), false); assert.equal(calls.length, 0);
    assert.throws(() => finishCoop.call({ isCoopMode: () => true }, true), error => error === stop);
    assert.deepEqual(calls.splice(0), [['coop', 'COMPLETE', 'completed']]);
    const finishPvp = actualMethod(pvp, 'finishPvpBattle', { AnalyticsMgr,
        getPvpContext: () => ({ startedAtMs: Date.now(), opponentTerminalType: 'PASS', opponentTargetMs: 3000 }),
        appendPvpBoardDelta() {}, resolvePvpOutcome: () => 'lose',
    });
    await assert.rejects(finishPvp.call({ unschedule() {} }, 'DEAD_TIMEOUT', 5000, 'timeout'), error => error === stop);
    assert.deepEqual(calls.splice(0), [['pvp', 'DEAD_TIMEOUT', 'lose']]);
    const common = require('../cloudfunctions-douyin/analyticsCommon');
    const pipelines = [];
    const database = { collection: () => ({
        aggregate: pipeline => { pipelines.push(pipeline); return { toArray: async () => [] }; },
        countDocuments: async () => 0,
    }) };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync('cloudfunctions-douyin/analyticsReport.js', 'utf8'), {
        module, Date, require: () => ({ ...common, adminAllowed: () => true, database: async () => database }),
    });
    const report = await module.exports({ date: '2026-10-10' }, { trigger: 'console' });
    assert.equal(report.ok, true); assert.equal(report.telemetryScopeVersion, 2);
    assert.deepEqual(Array.from(report.acceptedGameplayModes), ['main', 'coop', 'pvp']);
    assert.equal(report.replayUploadEnabled, false);
    assert(pipelines.some(p => p.some(stage => stage.$group?._id?.gameplayEntryMode === '$gameplayEntryMode'
        && stage.$group._id.eventName === '$eventName')), 'cloud summary separates mode/event counts');
    assert(pipelines.some(p => p.some(stage => stage.$group?._id?.gameplayEntryMode === '$gameplayEntryMode'
        && stage.$group._id.endReason === '$endReason')), 'cloud terminal counts cannot mix modes');
    console.log('PASS actual coop/PVP lobby and local terminal caller hooks (Cocos drawing not exercised)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
