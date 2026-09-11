'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/UserStateSyncMgr.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
}).outputText;
const pendingCalls = [];
let cloudAvailable = true;
const platform = {
  canUseCloud: () => cloudAvailable,
  getDiagnostics: () => ({ platform: 'wechat', cloudReady: true }),
  callFunction: (_name, event) => new Promise((resolve, reject) => pendingCalls.push({ event, resolve, reject })),
};
const moduleRef = { exports: {} };
vm.runInNewContext(code, {
  module: moduleRef,
  exports: moduleRef.exports,
  console,
  setTimeout,
  clearTimeout,
  globalThis: {},
  require(id) {
    if (id === 'cc') return { _decorator: { ccclass: () => Type => Type } };
    if (id.endsWith('MiniGamePlatform')) return { getMiniGameBuildMode: () => 'debug' };
    if (id.endsWith('PlatformCloudMgr')) return { PlatformCloudMgr: { inst: platform } };
    if (id.endsWith('RuntimeLog')) return { runtimeLog() {}, runtimeWarn() {} };
    throw new Error(`unexpected require: ${id}`);
  },
}, { filename: 'UserStateSyncMgr.js' });

async function waitForCalls(count) {
  for (let attempt = 0; attempt < 20 && pendingCalls.length < count; attempt++) await Promise.resolve();
  assert.strictEqual(pendingCalls.length, count, `expected ${count} cloud calls`);
}

(async () => {
  const manager = moduleRef.exports.UserStateSyncMgr.inst;
  assert.strictEqual(manager.queueSave({ profile: { displayName: 'first' } }), true);
  const firstFlush = manager.flushPendingSave();
  await waitForCalls(1);

  assert.strictEqual(manager.queueSave({ profile: { displayName: 'second' } }), true);
  const concurrentFlush = manager.flushPendingSave();
  pendingCalls[0].resolve({ ok: true, profile: pendingCalls[0].event.profile });
  await waitForCalls(2);
  pendingCalls[1].resolve({ ok: true, profile: pendingCalls[1].event.profile });

  assert.strictEqual(await firstFlush, true, 'the owner flush must include a patch queued while its first save was in flight');
  assert.strictEqual(await concurrentFlush, true, 'a concurrent waiter must not misreport another successful flush as failure');
  assert.strictEqual(await manager.flushPendingSave(), true, 'an already-flushed queue is a successful synchronization state');
  assert.deepStrictEqual(pendingCalls.map(call => call.event.profile.displayName), ['first', 'second']);

  const transientLoad = manager.loadState();
  await waitForCalls(3);
  pendingCalls[2].reject(new Error('cloud.callFunction:fail request:fail system error'));
  assert.strictEqual(await transientLoad, null, 'a transient startup failure may fall back to local state');
  assert.strictEqual(manager.canUseCloud(), true, 'a transient cloud call failure must not disable asset synchronization for the session');

  assert.strictEqual(manager.queueSave({ profile: { displayName: 'recovered' } }), true);
  const recoveryFlush = manager.flushPendingSave();
  await waitForCalls(4);
  pendingCalls[3].resolve({ ok: true, profile: pendingCalls[3].event.profile });
  assert.strictEqual(await recoveryFlush, true, 'the next explicit asset flush must recover after a transient startup failure');
  assert.deepStrictEqual(pendingCalls.slice(2, 4).map(call => call.event.action), ['get', 'save']);

  const queueInvalidatedRecovery = manager.recoverState();
  await waitForCalls(5);
  assert.strictEqual(manager.queueSave({ profile: { displayName: 'queued-during-recovery' } }), true);
  pendingCalls[4].resolve({ ok: true, profile: null, gameState: null });
  assert.strictEqual(await queueInvalidatedRecovery, null, 'a profile patch queued during recovery must invalidate the older cloud read');
  const queuedFlush = manager.flushPendingSave();
  await waitForCalls(6);
  pendingCalls[5].resolve({ ok: true, profile: pendingCalls[5].event.profile });
  assert.strictEqual(await queuedFlush, true);

  assert.strictEqual(manager.queueSave({ profile: { displayName: 'inflight-before-recovery' } }), true);
  const inflightFlush = manager.flushPendingSave();
  await waitForCalls(7);
  assert.strictEqual(await manager.recoverState(), null, 'recovery must not race an existing asset save');
  assert.strictEqual(pendingCalls.length, 7, 'blocked recovery must not issue a cloud GET');
  pendingCalls[6].resolve({ ok: true, profile: pendingCalls[6].event.profile });
  assert.strictEqual(await inflightFlush, true);

  const validRecovery = manager.recoverState();
  await waitForCalls(8);
  pendingCalls[7].resolve({ ok: true, profile: null, gameState: null });
  const recovery = await validRecovery;
  assert(recovery, 'an acknowledged recovery read with no concurrent mutation must return a candidate');
  assert.strictEqual(manager.validateRecoveredState(recovery.generation), true);

  const malformedRecovery = manager.recoverState();
  await waitForCalls(9);
  pendingCalls[8].resolve({});
  assert.strictEqual(await malformedRecovery, null, 'a recovery response without ok:true must be rejected');
  assert.strictEqual(manager.canUseCloud(), true);

  const olderStartupLoad = manager.loadState();
  await waitForCalls(10);
  const newerRecovery = manager.recoverState();
  await waitForCalls(11);
  pendingCalls[10].resolve({ ok: true, profile: null, gameState: null });
  const newerCandidate = await newerRecovery;
  assert(newerCandidate);
  pendingCalls[9].reject({ errMsg: 'cloud.callFunction:fail function not found', errCode: -1 });
  assert.strictEqual(await olderStartupLoad, null);
  assert.strictEqual(manager.canUseCloud(), true, 'an older startup request must not disable a newer successful recovery session');
  assert.strictEqual(manager.validateRecoveredState(newerCandidate.generation), true);

  manager.setAuthoritativeStateHandler(() => { throw new Error('invalid authoritative economy'); });
  assert.strictEqual(manager.queueSave({ profile: { displayName: 'handler-failure' } }), true);
  const handlerFailureFlush = manager.flushPendingSave();
  await waitForCalls(12);
  pendingCalls[11].resolve({ ok: true, profile: pendingCalls[11].event.profile });
  assert.strictEqual(await handlerFailureFlush, false, 'authoritative runtime apply failure must fail the asset flush');
  manager.setAuthoritativeStateHandler(null);
  const handlerRecoveryFlush = manager.flushPendingSave();
  await waitForCalls(13);
  pendingCalls[12].resolve({ ok: true, profile: pendingCalls[12].event.profile });
  assert.strictEqual(await handlerRecoveryFlush, true);

  assert.strictEqual(manager.queueSave({ profile: { displayName: 'permanent-save-failure' } }), true);
  const permanentSave = manager.flushPendingSave();
  await waitForCalls(14);
  pendingCalls[13].reject({ errMsg: 'cloud.callFunction:fail missing user_profile collection', errCode: -1 });
  assert.strictEqual(await permanentSave, false);
  assert.strictEqual(manager.canUseCloud(), false, 'the cloud function collection-missing contract must disable synchronization for the session');
  assert.strictEqual(await manager.flushPendingSave(), false, 'a permanently disabled flush must not call the missing cloud function again');
  assert.strictEqual(pendingCalls.length, 14);
  assert.strictEqual(manager.queueSave({ profile: { displayName: 'must-not-queue' } }), false);
  assert.strictEqual(await manager.recoverState(), null, 'permanent deployment failures must not be reprobed by lobby refresh');
  assert.strictEqual(pendingCalls.length, 14);
  cloudAvailable = false;
  console.log('USER_STATE_SYNC_CONCURRENCY_TESTS_PASSED');
})().catch(error => { console.error(error); process.exitCode = 1; });
