'use strict';
const assert = require('assert'), fs = require('fs'), vm = require('vm'), ts = require('typescript');
const local = require('./helpers/local-chapter-runtime')();
const { chapterReward } = require('../cloudfunctions/updateUserProfileAssets/chapter-reward-policy');
const calls = [], moduleBox = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('assets/Scripts/Core/UserStateSyncMgr.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true } }).outputText;
vm.runInNewContext(code, { module: moduleBox, exports: moduleBox.exports, setTimeout, clearTimeout, console: { log() {}, warn() {}, error() {} }, require(id) {
    if (id === 'cc') return { _decorator: { ccclass: () => value => value } };
    if (id === './MiniGamePlatform') return { getMiniGameBuildMode: () => 'release' };
    if (id === './RuntimeLog') return { runtimeLog() {}, runtimeWarn() {} };
    if (id === './LocalChapterRewards') return local;
    if (id === './PlatformCloudMgr') return { PlatformCloudMgr: { inst: { canUseCloud: () => true, getDiagnostics: () => ({}), callFunction: (name, event) => new Promise(resolve => calls.push({ event, resolve })) } } };
    throw Error(id);
} });
async function next(count) { for (let i = 0; i < 30 && calls.length < count; i++) await Promise.resolve(); assert.equal(calls.length, count); }
const response = state => ({ ok: true, userStateSchemaVersion: 2, skinStateSchemaVersion: 2, profile: { lastLevelId: state.savedLevel }, gameState: state });
(async () => {
    const mgr = moduleBox.exports.UserStateSyncMgr.inst;
    const first = { savedLevel: 5, stateUpdatedAt: 1000, gold: 150, brushCount: 1, magnetCount: 0, freezeCount: 0, chapterRewardProtocol: 1, chapterRewardReceipts: [chapterReward(1, 4)], wechatGiftProtocol: 1, wechatGiftTotals: { gold: 50, brushCount: 1, magnetCount: 0 } };
    mgr.queueSave({ gameState: first }); const flushing = mgr.flushPendingSave(); await next(1);
    const second = { ...first, savedLevel: 10, stateUpdatedAt: 1100, chapterRewardReceipts: [chapterReward(1, 4), chapterReward(1, 9)], wechatGiftTotals: { gold: 50, brushCount: 1, magnetCount: 1 } };
    mgr.queueSave({ gameState: second }); calls[0].resolve(response(first)); await next(2);
    const upload = calls[1].event.gameState;
    assert.equal(upload.chapterRewardReceipts.length, 2); assert.equal(upload.wechatGiftTotals.magnetCount, 1);
    assert.equal(upload.magnetCount, 0, 'pending local magnet has already been consumed');
    calls[1].resolve(response(upload)); assert.equal(await flushing, true);
    mgr.queueSave({ gameState: second }); const missing = mgr.flushPendingSave(); await next(3);
    calls[2].resolve(response({ ...second, chapterRewardReceipts: [] })); assert.equal(await missing, false);
    assert(mgr.pendingPatch, 'a response without receipts must not drop the queued save');
    clearTimeout(mgr.saveTimer); mgr.saveTimer = null;
    console.log('PASS actual sync client: in-flight local reward+consumption survives old ACK, missing receipts retain pending save');
})().catch(error => { console.error(error); process.exitCode = 1; });
