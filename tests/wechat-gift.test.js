'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const { createDelivery } = require('../cloudfunctions/wechatMessageCallback/service');
const { createHandler, codec, signature } = require('../cloudfunctions/wechatMessageCallback/protocol');
const baseConfig = require('../cloudfunctions/wechatMessageCallback/config.json');
const config = { ...baseConfig, token: 'unit-token', aesKey: Buffer.alloc(32, 7).toString('base64').slice(0, -1), previewOpenids: ['player'] };
const clone = x => JSON.parse(JSON.stringify(x));
function database(initial) {
  let data = { user_profile: { playerdoc: clone(initial) }, wechat_gift_orders: {} };
  let queue = Promise.resolve(); let fail = false;
  const adapter = store => ({ collection: name => ({
    where: query => { const q = { limit: () => q, get: async () => ({ data: Object.entries(store[name] || {}).map(([id, v]) => ({ ...clone(v), _id: id })).filter(v => Object.entries(query).every(([k, val]) => v[k] === val)) }) }; return q; },
    doc: id => ({ get: async () => ({ data: store[name][id] ? clone(store[name][id]) : null }),
      update: async ({ data: patch }) => { Object.assign(store[name][id], clone(patch)); },
      set: async ({ data: value }) => { if (fail) throw Error('injected DB failure'); store[name][id] = clone(value); } }),
  }) });
  return { collection: name => adapter(data).collection(name),
    runTransaction: operation => { const task = queue.then(async () => { const draft = clone(data); const result = await operation(adapter(draft)); data = draft; return result; }); queue = task.catch(() => {}); return task; },
    read: () => clone(data), fail: value => { fail = value; } };
}
const message = { MsgType: 'event', Event: 'minigame_deliver_goods', MiniGame: {
  OrderId: 'order-1', IsPreview: 0, ToUserOpenid: 'player', Zone: 2001, GiftTypeId: 1, GiftId: config.giftIds[0],
  GoodsList: [{ Id: 'jinbi', Num: 20 }, { Id: 'qingcao', Num: 1 }, { Id: 'citie', Num: 2 }, { Id: 'dongjie', Num: 3 }],
} };
function loadTs(file, dependencies) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require: dependencies, console, Date, setTimeout, clearTimeout });
  return module.exports;
}
async function run() {
  const initial = { openid: 'player', gold: 100, brushCount: 3, magnetCount: 3, freezeCount: 3, wechatGiftProtocol: 1 };
  const db = database(initial); const deliver = createDelivery(db, config);
  await Promise.all(Array.from({ length: 8 }, () => deliver(message)));
  assert.deepStrictEqual(db.read().user_profile.playerdoc, { ...initial, gold: 120, brushCount: 4, magnetCount: 5, freezeCount: 6,
    wechatGiftTotals: { gold: 20, brushCount: 1, magnetCount: 2, freezeCount: 3 } });
  assert.strictEqual(Object.keys(db.read().wechat_gift_orders).length, 1);
  const conflict = clone(message); conflict.MiniGame.GoodsList[0].Num = 99;
  await assert.rejects(deliver(conflict), /conflict/);
  const bad = clone(message); bad.MiniGame.OrderId = 'bad'; bad.MiniGame.GoodsList[0].Num = -1;
  await assert.rejects(deliver(bad), /invalid goods/);
  bad.MiniGame.GoodsList[0] = { Id: 'unknown', Num: 1 };
  await assert.rejects(deliver(bad), /invalid goods/);
  bad.MiniGame.GoodsList[0] = { Id: 'toString', Num: 1 };
  await assert.rejects(deliver(bad), /invalid goods/);
  const second = clone(message); second.MiniGame.OrderId = 'order-2';
  db.fail(true); await assert.rejects(deliver(second), /DB failure/); assert.strictEqual(db.read().user_profile.playerdoc.gold, 120);
  db.fail(false); await deliver(second); assert.strictEqual(db.read().user_profile.playerdoc.gold, 140);
  await assert.rejects(createDelivery(database({ ...initial, wechatGiftProtocol: 0 }), config)(message), /compatible/);
  const absent = clone(message); absent.MiniGame.ToUserOpenid = 'absent';
  await assert.rejects(deliver(absent), e => e.subCode === 172935494);
  const preview = clone(message); preview.MiniGame.IsPreview = 1;
  await assert.rejects(createDelivery(db, { ...config, previewOpenids: [] })(preview), /preview/);

  const cipher = codec(config); const q = { timestamp: '1700000000', nonce: 'unit-nonce' };
  let deliveries = 0;
  const handler = createHandler(config, async value => { assert.strictEqual(value.MiniGame.GoodsList[0].Num, 20); deliveries++; return { ErrCode: 0, ErrMsg: 'Success' }; });
  const encrypted = cipher.encrypt(JSON.stringify(message));
  const request = { httpMethod: 'POST', queryStringParameters: { ...q, msg_signature: signature(config.token, q.timestamp, q.nonce, encrypted) }, body: JSON.stringify({ Encrypt: encrypted }) };
  const result = await handler(request); assert.strictEqual(result.statusCode, 200);
  const envelope = JSON.parse(result.body); assert.strictEqual(JSON.parse(cipher.decrypt(envelope.Encrypt)).ErrCode, 0);
  assert.strictEqual(envelope.MsgSignature, signature(config.token, envelope.TimeStamp, envelope.Nonce, envelope.Encrypt));
  assert.strictEqual((await handler({ ...request, queryStringParameters: { ...q, msg_signature: '0'.repeat(40) } })).statusCode, 403);
  assert.strictEqual(deliveries, 1);
  assert.strictEqual((await handler(message)).statusCode, 405, 'ordinary function invocation is not a trusted callback');
  assert.strictEqual((await handler({ httpMethod: 'GET', queryStringParameters: { ...q, signature: signature(config.token, q.timestamp, q.nonce), echostr: 'hello' } })).body, 'hello');
  const xml = `<xml><MsgType><![CDATA[event]]></MsgType><Event>minigame_deliver_goods</Event><MiniGame><OrderId>xml-order</OrderId><IsPreview>0</IsPreview><ToUserOpenid>player</ToUserOpenid><Zone>2001</Zone><GiftTypeId>1</GiftTypeId><GiftId>${config.giftIds[0]}</GiftId><GoodsList><Id>jinbi</Id><Num>20</Num></GoodsList></MiniGame></xml>`;
  const xmlEncrypted = cipher.encrypt(xml);
  const xmlResult = await handler({ ...request, queryStringParameters: { ...q, msg_signature: signature(config.token, q.timestamp, q.nonce, xmlEncrypted) }, body: `<xml><Encrypt><![CDATA[${xmlEncrypted}]]></Encrypt></xml>` });
  assert.strictEqual(xmlResult.statusCode, 200); assert.match(cipher.decrypt(/CDATA\[([^\]]+)/.exec(xmlResult.body)[1]), /<ErrCode>0<\/ErrCode>/);
  assert.throws(() => codec({ ...config, appId: 'wrong' }).decrypt(encrypted), /appid/);
  const failedHandler = createHandler(config, async () => { const e = Error('missing'); e.subCode = 172935494; throw e; });
  const failed = await failedHandler(request); assert.strictEqual(JSON.parse(cipher.decrypt(JSON.parse(failed.body).Encrypt)).SubErrCode, 172935494);

  const module = { exports: {} }; const ctx = { module, exports: module.exports, console, Date,
    require: () => ({ init() {}, database: () => ({}) }) };
  vm.runInNewContext(fs.readFileSync('cloudfunctions/syncUserState/index.js', 'utf8') + '\nmodule.exports.merge=buildGameStatePatch;', ctx);
  const current = { ...initial, gold: 120, wechatGiftTotals: { gold: 20 }, savedLevel: 3, stateUpdatedAt: 100, backgroundSkinResetVersion: 1, ownedBackgroundSkinIds: [1005], ownedBeanSkinIds: [2000] };
  const local = { ...current, gold: 90, stateUpdatedAt: 200, wechatGiftTotals: {} };
  assert.strictEqual(module.exports.merge(local, current).gold, 110, 'offline spend plus server gift');
  assert.strictEqual(module.exports.merge({ ...local, gold: 110 }, current).gold, 130, 'offline income plus server gift');
  assert.strictEqual(module.exports.merge({ ...local, gold: 110, wechatGiftTotals: { gold: 20 } }, current).gold, 110, 'retry does not regrant');
  assert.throws(() => module.exports.merge({ ...local, wechatGiftProtocol: undefined }, current), /updated client/);
  assert.throws(() => module.exports.merge({ ...local, wechatGiftTotals: { gold: 21 } }, current), /watermark/);

  const calls = []; const deps = id => {
    if (id === 'cc') return { _decorator: { ccclass: () => C => C } };
    if (id.endsWith('MiniGamePlatform')) return { getMiniGameBuildMode: () => 'release' };
    if (id.endsWith('RuntimeLog')) return { runtimeLog() {}, runtimeWarn() {} };
    if (id.endsWith('PlatformCloudMgr')) return { PlatformCloudMgr: { inst: { canUseCloud: () => true, getDiagnostics: () => ({}), callFunction: (_, event) => new Promise(resolve => calls.push({ event, resolve })) } } };
    throw Error(id);
  };
  const sync = loadTs('assets/Scripts/Core/UserStateSyncMgr.ts', deps);
  const pending = { gold: 85, wechatGiftTotals: {} }; sync.rebaseWechatGiftState(pending, { gold: 20 }); assert.strictEqual(pending.gold, 105);
  sync.rebaseWechatGiftState(pending, { gold: 20 }); assert.strictEqual(pending.gold, 105);
  const manager = sync.UserStateSyncMgr.inst;
  manager.queueSave({ gameState: { gold: 90, wechatGiftProtocol: 1, wechatGiftTotals: {} } }); const flush = manager.flushPendingSave();
  manager.queueSave({ gameState: { gold: 85, wechatGiftProtocol: 1, wechatGiftTotals: {} } });
  calls[0].resolve({ ok: true, gameState: { gold: 110, wechatGiftProtocol: 1, wechatGiftTotals: { gold: 20 } } });
  for (let i = 0; i < 20 && calls.length < 2; i++) await Promise.resolve();
  assert.strictEqual(calls[1].event.gameState.gold, 105, 'inflight local spend is preserved');
  calls[1].resolve({ ok: true, gameState: calls[1].event.gameState }); assert.strictEqual(await flush, true);

  const storage = new Map([['gold', '90'], ['brush', '3'], ['magnet', '3'], ['freeze', '3']]);
  let writeFailure = false;
  const sys = { localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => { if (writeFailure && key === 'brush') { writeFailure = false; throw Error('storage interrupted'); } storage.set(key, String(value)); }, removeItem: key => storage.delete(key) } };
  const shared = { sys, LS_GOLD: 'gold', LS_PROP_BRUSH: 'brush', LS_PROP_MAGNET: 'magnet', LS_PROP_FREEZE: 'freeze' };
  const meta = loadTs('assets/Scripts/Core/GameCtrlModules/PlayerMetaStateModule.ts', id => id.endsWith('GameCtrlShared') ? shared : id.endsWith('UserStateSyncMgr') ? sync : id.endsWith('BrowserLevelPreview') ? { getBrowserLevelPreview: () => ({ active: false }) } : {});
  const runtime = {}; meta.installPlayerMetaStateModule(runtime); runtime.setLocalUserStateUpdatedAt = () => {};
  writeFailure = true;
  assert.throws(() => runtime.applyWechatGiftState({ wechatGiftProtocol: 1, wechatGiftTotals: { gold: 20 } }), /interrupted/);
  assert.strictEqual(runtime.getGold(), 110, 'journal recovers after partial write');
  runtime.applyWechatGiftState({ wechatGiftProtocol: 1, wechatGiftTotals: { gold: 20 } }); assert.strictEqual(runtime.getGold(), 110);
  storage.set('gold', '105'); runtime.applyWechatGiftState({ wechatGiftProtocol: 1, wechatGiftTotals: { gold: 40 } }); assert.strictEqual(runtime.getGold(), 125);
  runtime.applyWechatGiftState({ wechatGiftProtocol: 1, wechatGiftTotals: { gold: 20 } }); assert.strictEqual(runtime.getGold(), 125, 'old response cannot revoke/regrant');
  assert.throws(() => runtime.applyWechatGiftState({ wechatGiftProtocol: 1, wechatGiftTotals: { gold: 20 }, gold: 110 }, true), /Stale/);
  assert.strictEqual(runtime.getGold(), 125, 'stale full restore cannot overwrite balance');
  console.log('WECHAT_GIFT_TESTS_PASSED');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
