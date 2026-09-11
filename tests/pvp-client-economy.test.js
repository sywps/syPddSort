'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const storage = new Map();
const revisionKey = 'pdd.pvp.economyRevision.v1';
const sys = { localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) } };
let now = Date.UTC(2026, 8, 7, 15, 59, 59);
class TestDate extends Date { static now() { return now; } }
function load(relative, dependencies) {
  const source = fs.readFileSync(path.join(__dirname, '../', relative), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, console, require: dependencies, setTimeout, clearTimeout, Date: TestDate });
  return module.exports;
}

async function run() {
  const shared = { sys, LS_GOLD: 'gold', LS_PROP_EXPAND: 'expand', LS_PROP_WAND: 'wand', LS_PROP_FREEZE: 'freeze', LS_PROP_BRUSH: 'brush', LS_PROP_MAGNET: 'magnet' };
  const meta = load('assets/Scripts/Core/GameCtrlModules/PlayerMetaStateModule.ts', id => id.endsWith('GameCtrlShared') ? shared : id.endsWith('UserStateSyncMgr') ? { PVP_ECONOMY_REVISION_KEY: revisionKey } : {});
  const runtime = {};
  meta.installPlayerMetaStateModule(runtime);
  Object.assign(runtime, { constructor: { LS_VIGOR: 'vigor', LS_VIGOR_TIME: 'vigorTime' },
    setLocalUserStateUpdatedAt() {}, refreshVigorUI() {}, refreshGoldUI() {}, syncSkillButtonRuntimeStates() {},
    queueCloudGameStateSync() { throw new Error('snapshot must not apply a second local grant'); } });
  const snapshot = { vigor: 9, vigorTime: 300000, gold: 288, expandSlotCount: 0, magicWandCount: 0,
    freezeCount: 0, brushCount: 0, magnetCount: 1, pvpEconomyRevision: 1, stateUpdatedAt: 100 };
  runtime.applyPvpEconomySnapshot(snapshot);
  assert.strictEqual(storage.get('vigor'), '9');
  assert.strictEqual(storage.get('gold'), '288');
  assert.strictEqual(storage.get('magnet'), '1');
  storage.set('gold', '300'); // Ordinary chapter rewards earned after applying this revision.
  runtime.applyPvpEconomySnapshot(snapshot);
  assert.strictEqual(storage.get('gold'), '300', 'same-revision retry cannot erase subsequent local rewards');
  const before = [...storage.entries()];
  assert.throws(() => runtime.applyPvpEconomySnapshot({ ...snapshot, pvpEconomyRevision: 2, gold: -1 }), /invalid authoritative/);
  assert.deepStrictEqual([...storage.entries()], before, 'invalid snapshot must make no partial local writes');

  let platform = 'wechat';
  let sharePlatform = 'wechat';
  const weChatSharePayloads = [];
  const douyinSharePayloads = [];
  const weChatShareRuntime = { shareAppMessage: payload => weChatSharePayloads.push(payload) };
  const douyinShareRuntime = { shareAppMessage: payload => douyinSharePayloads.push(payload) };
  let response = { ok: true, reward: { claimId: 'claim-1', expiresAt: Date.now() + 600000 } };
  const calls = [];
  const inventoryEvents = [];
  let inventoryReady = true;
  let inventoryCloudAvailable = true;
  const userStateSyncManager = {
    canUseCloud() { inventoryEvents.push('canUseCloud'); return inventoryCloudAvailable; },
  };
  const pixelLevel = require('../cloudfunctions/pvpService/bot-runtime/levels/zt_level_3.json');
  const serviceModule = load('assets/Scripts/Core/PvpServiceMgr.ts', id => {
    if (id === 'cc') return { sys, _decorator: { ccclass: () => Type => Type } };
    if (id.endsWith('UserStateSyncMgr')) return { PVP_ECONOMY_REVISION_KEY: revisionKey, UserStateSyncMgr: { inst: userStateSyncManager } };
    if (id.endsWith('UserMgr')) return { UserMgr: { inst: { getProfile: () => ({ uuid: 'test' }) } } };
    if (id.endsWith('PvpModeConfig')) return { createDemoPvpBattle: levelId => ({ demo: true, levelId }) };
    if (id.endsWith('PvpBotReplay')) return require('../cloudfunctions/pvpService/bot-runtime/PvpBotReplay');
    if (id.endsWith('PvpHumanReplay')) return require('../cloudfunctions/pvpService/bot-runtime/PvpHumanReplay');
    if (id.endsWith('MiniGamePlatform')) return {
      getWeChatMiniGameRuntime: () => sharePlatform === 'wechat' ? weChatShareRuntime : null,
      getDouyinMiniGameRuntime: () => sharePlatform === 'douyin' ? douyinShareRuntime : null,
    };
    if (id.endsWith('WeChatShareReturnService')) return {
      applyLocalWeChatShareImage: payload => ({ ...payload, imageUrl: 'local-wechat-image', imageUrlId: 'local-wechat-image-id' }),
    };
    if (id.endsWith('PlatformCloudMgr')) return { PlatformCloudMgr: { inst: { getPlatform: () => platform, init: async () => true,
      callFunction: async (name, event) => { calls.push(event); if (response instanceof Error) throw response; return response; } } } };
    return {};
  });
  const service = serviceModule.PvpServiceMgr.inst;
  const inventoryRuntime = {
    async ensureCloudGameStateSyncReady() { inventoryEvents.push('ensure'); return inventoryReady; },
  };
  await service.syncInventory(inventoryRuntime);
  assert.deepStrictEqual(inventoryEvents, ['ensure', 'canUseCloud']);
  inventoryEvents.length = 0;
  inventoryReady = false;
  await assert.rejects(service.syncInventory(inventoryRuntime), /资产云同步不可用/);
  assert.deepStrictEqual(inventoryEvents, ['ensure'], 'failed recovery must stop before queueing an asset snapshot');
  inventoryEvents.length = 0;
  inventoryReady = true;
  inventoryCloudAvailable = false;
  await assert.rejects(service.syncInventory(inventoryRuntime), /资产云同步不可用/);
  assert.deepStrictEqual(inventoryEvents, ['ensure', 'canUseCloud']);
  inventoryEvents.length = 0;
  inventoryCloudAvailable = true;
  assert.strictEqual(service.shareFriendChallenge('AB C'), true);
  assert.strictEqual(weChatSharePayloads[0].query, 'pvpChallenge=AB%20C');
  assert.strictEqual(weChatSharePayloads[0].imageUrl, 'local-wechat-image');
  assert.strictEqual(weChatSharePayloads[0].imageUrlId, 'local-wechat-image-id');
  sharePlatform = 'douyin';
  assert.strictEqual(service.shareFriendChallenge('XYZ'), true);
  assert.strictEqual(douyinSharePayloads[0].query, 'pvpChallenge=XYZ');
  assert.strictEqual(douyinSharePayloads[0].imageUrl, undefined, 'Douyin challenge payload must not receive WeChat-only image fields');
  const offered = await service.beginTicketReward('ad');
  assert.strictEqual(offered.claimId, 'claim-1');
  assert.strictEqual(service.hasPendingTicketReward(), false, 'an ad offer alone must not create a retryable entitlement');
  response = new Error('network unavailable');
  await assert.rejects(service.claimTicketReward(offered.claimId), /network/);
  assert.strictEqual(service.hasPendingTicketReward(), true, 'completed platform flow retains its ID on network failure');
  response = { ok: true, economy: { tickets: 1 } };
  assert.strictEqual((await service.claimTicketReward()).tickets, 1);
  assert.strictEqual(calls[calls.length - 1].claimId, offered.claimId, 'recovery retries the same claim ID');
  assert.strictEqual(calls[calls.length - 1].economyRevision, 1);
  assert.strictEqual(service.hasPendingTicketReward(), false);
  response = { ok: false, errorMessage: '门票奖励已过期，请重新获取' };
  await assert.rejects(service.claimTicketReward('expired'), /已过期/);
  assert.strictEqual(service.hasPendingTicketReward(), false, 'expired claims must not permanently block the acquisition buttons');
  platform = 'none';
  await assert.rejects(service.beginTicketReward('ad'), /本地预览/);
  await assert.rejects(service.claimRankReward('bronze', 'S01'), /本地预览/);
  const cloudCallsBeforePreview = calls.length;
  await assert.rejects(service.simulateTicketReward('ad'), /门票已满/);
  await assert.rejects(service.matchmake(3), /尚未加载/);
  assert.strictEqual((await service.getEconomy()).tickets, 3, 'invalid level must not consume tickets');
  for (let i = 0; i < 3; i++) assert.strictEqual((await service.matchmake(3, pixelLevel)).demo, true);
  await assert.rejects(service.matchmake(3), /门票已用完/);
  assert.strictEqual((await service.getEconomy()).tickets, 0);
  await assert.rejects(service.simulateTicketReward('invalid'), /无效/);
  assert.strictEqual((await service.simulateTicketReward('share')).shareUsed, 1);
  assert.strictEqual((await service.simulateTicketReward('share')).shareUsed, 2);
  await assert.rejects(service.simulateTicketReward('share'), /今日分享次数/);
  assert.strictEqual((await service.simulateTicketReward('ad')).tickets, 3);
  await assert.rejects(service.simulateTicketReward('ad'), /门票已满/);
  for (let i = 0; i < 5; i++) {
    await service.matchmake(3, pixelLevel);
    const state = await service.simulateTicketReward('ad');
    assert.strictEqual(state.tickets, 3, 'ads may replenish repeatedly after tickets are consumed');
    assert.strictEqual(state.shareUsed, 2, 'ads do not change share quota');
  }
  await service.matchmake(3, pixelLevel);
  now += 1000; // Midnight in UTC+8, not UTC.
  const nextDay = await service.getEconomy();
  assert.strictEqual(nextDay.tickets, 3);
  assert.strictEqual(nextDay.shareUsed, 0);
  const preview = await service.matchmake(3, pixelLevel);
  assert(preview.opponentBoardTimeline.length > 0);
  assert.strictEqual(preview.botPolicyVersion, 'pch-legal-v3');
  const gamesBefore = service.previewBotProfile.gamesPlayed;
  service.recordPreviewResult(preview, 'lose');
  service.recordPreviewResult(preview, 'lose');
  assert.strictEqual(service.previewBotProfile.gamesPlayed, gamesBefore + 1);
  assert.strictEqual(service.previewBotProfile.lossStreak, 1);
  assert.strictEqual((await service.simulateTicketReward('share')).shareUsed, 1);
  storage.set('pdd.pvp.pendingTicket.v1', 'formal-receipt');
  assert.strictEqual(service.hasPendingTicketReward(), false, 'formal pending receipt must not block preview simulation');
  assert.strictEqual(calls.length, cloudCallsBeforePreview, 'simulation and preview matches must never call cloud');
  for (const formalPlatform of ['wechat', 'douyin']) {
    platform = formalPlatform;
    await assert.rejects(service.simulateTicketReward('ad'), /仅本地预览/);
    await assert.rejects(service.simulateTicketReward('share'), /仅本地预览/);
    assert.strictEqual(service.hasPendingTicketReward(), true, 'preview must preserve formal pending receipts');
  }
  console.log('PVP_CLIENT_ECONOMY_TESTS_PASSED');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
