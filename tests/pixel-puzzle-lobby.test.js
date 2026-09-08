'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

class UITransform {
  setContentSize(width, height) { this.width = width; this.height = height; }
  setAnchorPoint(x, y) { this.anchor = { x, y }; }
}
class Mask {}
class ScrollView {}
class Sprite {}
Sprite.SizeMode = { CUSTOM: 0 };
class Label {}
Label.Overflow = { SHRINK: 1 };
Label.HorizontalAlign = { CENTER: 1 };
Label.VerticalAlign = { CENTER: 1 };
class Button { constructor() { this.interactable = true; } }
Button.EventType = { CLICK: 'click' };
class Color { constructor(r, g, b, a = 255) { Object.assign(this, { r, g, b, a }); } }
class Graphics {
  constructor() { this._fillColor = new Color(255, 255, 255); this.fills = []; }
  get fillColor() { return this._fillColor; }
  set fillColor(value) { Object.assign(this._fillColor, value); }
  fill() { this.fills.push({ ...this._fillColor }); }
  clear() { this.fills = []; }
}
for (const method of ['roundRect', 'rect', 'stroke', 'moveTo', 'lineTo', 'close', 'circle']) {
  Graphics.prototype[method] = () => {};
}
class BlockInputEvents {}
class Widget {}
class Node {
  constructor(name) {
    this.name = name;
    this.children = [];
    this.components = new Map();
    this.handlers = new Map();
    this.active = true;
    this.isValid = true;
    this.scale = { x: 1, y: 1, z: 1 };
  }
  addChild(child) { child.parent = this; this.children.push(child); }
  getChildByName(name) { return this.children.find(child => child.name === name && child.isValid); }
  addComponent(Type) { const c = new Type(); c.node = this; this.components.set(Type, c); return c; }
  getComponent(Type) { return this.components.get(Type) || null; }
  setPosition(x, y, z) { this.position = { x, y, z }; }
  setScale(x, y, z) { this.scale = { x, y, z }; }
  on(event, handler) { this.handlers.set(event, handler); }
  destroy() { this.isValid = false; this.children.forEach(child => child.destroy()); }
}
Node.EventType = { NODE_DESTROYED: 'destroyed' };

const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function find(node, name) {
  if (node.name === name && node.isValid) return node;
  for (const child of node.children) { const found = find(child, name); if (found) return found; }
  return null;
}
function click(root, name) {
  const node = find(root, name);
  assert(node, `missing ${name}`);
  if (node.getComponent(Button)?.interactable) node.handlers.get('click')?.();
}
function setup(options = {}) {
  const overlayRoot = new Node('OverlayRoot');
  const calls = { chapter: [], ranked: 0, clear: 0, reveals: [], preview: [] };
  const session = {
    pvpBattleContext: { matchId: 'existing' },
    clearPvpBattleContext() { this.pvpBattleContext = null; },
    setPvpBattleContext(context) { this.pvpBattleContext = context; },
  };
  const app = { session };
  const match = options.match || null;
  const rewards = require('../cloudfunctions/pvpService/economy').RANK_REWARDS.map((r, i) => ({ ...r, status: i === 0 ? 'claimable' : i === 1 ? 'claimed' : r.pending ? 'pending' : 'locked' }));
  let economy = { tickets: options.tickets ?? 3, capacity: 3, shareUsed: options.shareUsed || 0, shareLimit: 2,
    serverTime: Date.now(), resetAt: Date.now() + 3600000, seasonId: 'S01', rewardsEnabled: true, rewards, inventory: null };
  const service = {
    syncInventory: async () => { if (options.syncError) throw new Error('sync failed'); },
    getEconomy: async () => economy,
    simulateTicketReward: async source => {
      assert(!options.cloud, 'formal UI must not simulate rewards');
      calls.simulations = (calls.simulations || 0) + 1;
      economy = { ...economy, tickets: economy.tickets + 1, shareUsed: economy.shareUsed + (source === 'share' ? 1 : 0) };
      return economy;
    },
    hasPendingTicketReward: () => false,
    beginTicketReward: async source => { calls.offers = (calls.offers || 0) + 1; calls.source = source; return { claimId: 'ticket-offer' }; },
    claimTicketReward: async () => { calls.ticketClaims = (calls.ticketClaims || 0) + 1; economy = { ...economy, tickets: economy.tickets + 1 }; return economy; },
    claimRankReward: async tier => { calls.prizes = (calls.prizes || 0) + 1; calls.tier = tier; return economy; },
    isLocalPreview: () => !options.cloud,
    hasReplayConsent: () => false,
    setReplayConsent: () => {},
    getRankedLevel: async () => ({ levelId: 3, levelHash: 'test-hash', poolVersion: 'test-pool' }),
    getProfile: async () => ({ rankName: '荣耀黄金 IV', stars: 2 }),
    getActiveMatch: async () => {
      if (options.checkError) throw new Error('offline');
      return match;
    },
    loadPersistedBattle: () => options.persisted || null,
    clearPersistedBattle: () => { calls.clear++; },
    persistBattle: context => context,
    toBattleContext: result => ({ matchId: result.matchId, resumeElapsedMs: 1000 }),
    matchmake: async levelId => { calls.ranked++; return { matchId: 'new', levelId }; },
  };
  const shared = { Node, UITransform, Label, Button, Graphics, Color, Widget, BlockInputEvents, Layers: { Enum: { UI_2D: 1 } }, AudioMgr: { inst: { play() {} } } };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console, setTimeout, clearTimeout,
    require(id) {
      if (id === 'cc') return { Mask, ScrollView, Sprite, view: { getVisibleSize: () => ({ width: 720, height: 1558 }) } };
      if (id.endsWith('GameCtrlShared')) return shared;
      if (id.endsWith('AppRoot')) return { AppRoot: { inst: app, tryGet: () => app, ensure: () => app } };
      if (id.endsWith('PvpServiceMgr')) return { PvpServiceMgr: { inst: service } };
      if (id.endsWith('PvpBotReplay')) return { pixelLevelHash: () => 'test-hash' };
      if (id.endsWith('PixelPosterPreviewRenderer')) return { renderPixelPosterPreview: (...args) => calls.preview.push(args) };
      return {};
    },
  });
  const runtime = {
    getVigor: () => options.vigor ?? 10,
    updateVigor() {},
    applyPvpEconomySnapshot: () => { calls.applied = (calls.applied || 0) + 1; },
    showNoLivesAdModal: () => { calls.recoverVigor = true; },
    getSF: name => options.missingIcon ? null : { name },
    _loadSpriteFrameByName: (name, done) => done(null),
    runRewardedGrant: (page, grant, settings) => {
      calls.platform = 'ad';
      void (options.cancelPlatform ? Promise.resolve() : grant()).finally(settings.onFinally);
      return true;
    },
    runShareGrant: (page, grant, settings) => {
      calls.platform = 'share';
      void (options.cancelPlatform ? Promise.resolve() : grant()).finally(settings.onFinally);
      return true;
    },
    requireCanvasUiRoot: () => overlayRoot,
    loadThemeConfig: (done, fail) => options.configError ? fail(new Error('bad config')) : done(),
    getThemeDirectPlayLevelId: () => 23,
    getThemeLevelDisplayNumber: () => 8,
    loadLevelData: (level, done, prefix) => { assert.strictEqual(prefix, 'zt_level_'); done(options.assetError ? null : { correctColorArr: [[1, 2]] }); },
    startThemeLevel: async levelId => { calls.chapter.push(levelId); return true; },
    getSavedLevel: () => 3,
    openSettingsPanel: () => { calls.settings = true; },
  };
  module.exports.installPvpModeModule(runtime);
  runtime.showPvpOpponentReveal = (parent, context) => calls.reveals.push(context);
  runtime.openPvpLobby();
  return { runtime, overlayRoot, calls, session };
}

function assertHomeHasOnlyUnifiedPixelEntry() {
  const homeSource = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts'), 'utf8');
  const homeCompiled = ts.transpileModule(homeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const homeModule = { exports: {} };
  vm.runInNewContext(homeCompiled, { module: homeModule, exports: homeModule.exports, console, require: () => ({}) });
  const runtime = {};
  homeModule.exports.installHomeAdFlowModule(runtime);
  const menu = new Node('MainMenuFixedRoot');
  const child = (parent, name) => { const node = new Node(name); parent.addChild(node); return node; };
  child(child(menu, 'BackgroundLayer'), 'BG');
  child(menu, 'TopBarGroup');
  child(child(child(menu, 'HeroLayer'), 'HeroCard'), 'HeroCardFrame');
  const primary = child(menu, 'PrimaryActionLayer');
  const theme = child(primary, 'ThemeBtn');
  const entries = child(menu, 'EntryLayer');
  const legacy = child(entries, 'PvpEntryButton');
  let destroyRequested = false;
  legacy.destroy = () => { destroyRequested = true; }; // Cocos destroys nodes at the end of the frame.
  let unifiedRenders = 0;
  Object.assign(runtime, {
    constructor: { LOADING_COVER_BLEED: 0 },
    requireUiChild: (parent, name) => { const node = parent.getChildByName(name); assert(node, `missing ${name}`); return node; },
    requireSceneSpriteFrame: () => ({}),
    _getLoadingVisibleSize: () => ({ width: 720, height: 1280 }),
    _getLoadingCoverSourceSize: () => ({ width: 720, height: 1280 }),
    _applySpriteFrame() {},
    getDefaultEntryLevel: () => 3,
    drawHomeLevelPixelPreview() {},
    syncTopHud: () => ({}),
    drawStartButton() {},
    drawThemeChallengeButton: parent => { assert.strictEqual(parent.getChildByName('ThemeBtn'), theme); unifiedRenders++; },
    drawLeaderboardButton() {},
    drawCollectionButton() {},
  });
  runtime.renderMainMenuFixedRoot(menu);
  assert.strictEqual(legacy.active, false, 'legacy ranked entry must stop rendering/input before deferred destruction');
  assert.strictEqual(destroyRequested, true, 'legacy ranked entry must be removed');
  assert.strictEqual(theme.active, true, 'unified pixel-puzzle home entry must remain visible');
  entries.children = [];
  runtime.renderMainMenuFixedRoot(menu);
  assert.strictEqual(entries.getChildByName('PvpEntryButton'), undefined, 'home refresh must not recreate standalone ranked entry');
  assert.strictEqual(unifiedRenders, 2, 'every home render must retain the unified pixel-puzzle entry');
}

(async () => {
  assertHomeHasOnlyUnifiedPixelEntry();
  const chapter = setup();
  assert.strictEqual(find(chapter.overlayRoot, 'LobbySettings').active, false, 'lobby settings must remain temporarily hidden');
  assert.strictEqual(find(chapter.overlayRoot, 'Close').active, true, 'hiding settings must preserve the back button');
  assert.deepStrictEqual(find(chapter.overlayRoot, 'StartChapter').getComponent(Graphics).fills[1], { r: 77, g: 139, b: 239, a: 255 }, 'shadow drawing must preserve blue button fill');
  assert.deepStrictEqual(find(chapter.overlayRoot, 'StartMatch').getComponent(Graphics).fills[1], { r: 102, g: 87, b: 200, a: 255 }, 'shadow drawing must preserve purple button fill');
  assert(find(chapter.overlayRoot, 'ChapterLevel').getComponent(Label).string.includes('第 8 关'));
  assert.strictEqual(chapter.calls.preview.length, 1, 'use actual loaded level preview');
  assert.strictEqual(find(chapter.overlayRoot, 'FriendChallenge').getComponent(Button).interactable, false);
  click(chapter.overlayRoot, 'FriendChallenge');
  assert.strictEqual(find(chapter.overlayRoot, 'PvpFriendBattleOverlay'), null);
  click(chapter.overlayRoot, 'StartChapter');
  await flush();
  assert.deepStrictEqual(chapter.calls.chapter, [23], 'use physical theme ID, not displayed chapter or mainline level');
  assert.strictEqual(chapter.session.pvpBattleContext, null);
  assert.strictEqual(chapter.calls.clear, 0, 'chapter entry must preserve recoverable ranked save');
  assert.strictEqual(chapter.session.pixelPuzzleLobbyActive, true, 'return to unified lobby after chapter');

  const ranked = setup();
  await flush();
  click(ranked.overlayRoot, 'StartMatch');
  click(ranked.overlayRoot, 'StartMatch');
  await flush();
  assert.strictEqual(ranked.calls.ranked, 1, 'double clicks must not duplicate matchmaking');
  assert.strictEqual(ranked.calls.reveals.length, 1);
  assert.strictEqual(ranked.calls.reveals[0].levelId, 23, 'ranked must use physical pixel-puzzle ID, never saved mainline 3');

  const resume = setup({ cloud: true, match: { matchId: 'current' }, persisted: { matchId: 'other', resumeElapsedMs: 90000 } });
  await flush();
  assert.strictEqual(find(resume.overlayRoot, 'LobbySettings').active, false, 'cloud lobby refresh must not reveal settings');
  assert.strictEqual(find(resume.overlayRoot, 'StartMatch').getChildByName('Label').getComponent(Label).string, '恢复对局');
  click(resume.overlayRoot, 'StartMatch');
  await flush();
  assert.strictEqual(resume.calls.ranked, 0, 'resume must not call matchmaking');
  assert.strictEqual(resume.calls.reveals[0].resumeElapsedMs, 1000, 'never merge another match time');

  const offline = setup({ cloud: true, checkError: true });
  await flush();
  click(offline.overlayRoot, 'StartMatch');
  await flush();
  assert.strictEqual(offline.calls.ranked, 0, 'failed active lookup must not create a new match');
  assert.strictEqual(find(offline.overlayRoot, 'StartChapter').getComponent(Button).interactable, true, 'rank service failure must not block chapter mode');
  assert(find(ranked.overlayRoot, 'TicketCount').getComponent(Label).string.includes('3/3'));
  const noTickets = setup({ tickets: 0 });
  await flush();
  click(noTickets.overlayRoot, 'StartMatch');
  await flush();
  assert.strictEqual(noTickets.calls.ranked, 0);
  assert(find(noTickets.overlayRoot, 'PvpTicketsOverlay'), 'empty tickets opens recovery instead of creating a match');
  click(noTickets.overlayRoot, 'WatchAd');
  click(noTickets.overlayRoot, 'WatchAd');
  await flush();
  assert.strictEqual(noTickets.calls.simulations, 1, 'double click grants once');
  assert.strictEqual(noTickets.calls.platform, undefined, 'preview must not request native ad SDK');
  assert.strictEqual(noTickets.calls.offers, undefined, 'preview must not request a cloud receipt');
  assert.strictEqual(find(noTickets.overlayRoot, 'Balance').getComponent(Label).string, '1/3');
  const ticketModal = find(noTickets.overlayRoot, 'PvpTicketsOverlay');
  assert(find(ticketModal, 'Message').getComponent(Label).string.includes('本地模拟广告完成'));
  click(noTickets.overlayRoot, 'Share');
  await flush();
  assert.strictEqual(find(ticketModal, 'Balance').getComponent(Label).string, '2/3');
  assert(find(ticketModal, 'Share').getChildByName('Label').getComponent(Label).string.includes('1/2'));
  click(noTickets.overlayRoot, 'Share');
  await flush();
  assert.strictEqual(find(ticketModal, 'Balance').getComponent(Label).string, '3/3');
  assert.strictEqual(find(ticketModal, 'WatchAd').getComponent(Button).interactable, false);
  assert.strictEqual(find(ticketModal, 'Share').getComponent(Button).interactable, false);
  assert.strictEqual(find(noTickets.overlayRoot, 'TicketCount').getComponent(Label).string.includes('3/3'), true, 'lobby balance updates too');
  for (const [button, platform] of [['WatchAd', 'ad'], ['Share', 'share']]) {
    const formal = setup({ cloud: true, tickets: 0 });
    await flush();
    click(formal.overlayRoot, 'TicketMore');
    await flush();
    click(formal.overlayRoot, button);
    await flush();
    assert.strictEqual(formal.calls.platform, platform);
    assert.strictEqual(formal.calls.ticketClaims, 1);
    assert.strictEqual(formal.calls.simulations, undefined);
  }
  const cancelledAd = setup({ cloud: true, tickets: 0, cancelPlatform: true });
  await flush();
  click(cancelledAd.overlayRoot, 'TicketMore');
  await flush();
  click(cancelledAd.overlayRoot, 'WatchAd');
  await flush();
  assert.strictEqual(cancelledAd.calls.ticketClaims || 0, 0, 'cancelled platform flow grants nothing');
  const cappedShare = setup({ tickets: 0, shareUsed: 2 });
  await flush();
  click(cappedShare.overlayRoot, 'TicketMore');
  await flush();
  assert.strictEqual(find(cappedShare.overlayRoot, 'Share').getComponent(Button).interactable, false);
  assert.strictEqual(find(cappedShare.overlayRoot, 'WatchAd').getComponent(Button).interactable, true);
  click(cappedShare.overlayRoot, 'Share');
  assert.strictEqual(cappedShare.calls.offers || 0, 0);
  const noVigor = setup({ vigor: 0 });
  await flush();
  click(noVigor.overlayRoot, 'StartMatch');
  assert.strictEqual(noVigor.calls.recoverVigor, true);
  assert.strictEqual(noVigor.calls.ranked, 0);
  const resumeEmpty = setup({ cloud: true, tickets: 0, vigor: 0, match: { matchId: 'paid' } });
  await flush();
  click(resumeEmpty.overlayRoot, 'StartMatch');
  await flush();
  assert.strictEqual(resumeEmpty.calls.reveals[0].matchId, 'paid', 'paid match can resume with no remaining resources');
  const prizes = setup();
  await flush();
  click(prizes.overlayRoot, 'RankRewards');
  await flush();
  assert(find(prizes.overlayRoot, 'PvpRankRewardsOverlay'));
  const bronze = find(prizes.overlayRoot, 'Reward_bronze');
  assert.strictEqual(find(bronze, 'GoldAmount').getComponent(Label).string, '×188');
  assert.strictEqual(find(bronze, 'PropAmount').getComponent(Label).string, '×1');
  assert.strictEqual(find(bronze, 'PropIcon').getComponent(Sprite).spriteFrame.name, 'popup_tool_magnet_icon');
  assert.strictEqual(find(bronze, 'PropIcon').getComponent(Sprite).sizeMode, Sprite.SizeMode.CUSTOM, 'reward art must not resize to the source texture dimensions');
  assert.strictEqual(find(prizes.overlayRoot, 'PvpRankRewardsOverlay').getComponent(UITransform).height, 1558, 'modal input shield must cover tall screens');
  assert.strictEqual(find(find(prizes.overlayRoot, 'Reward_silver'), 'Claim').getComponent(Button).interactable, false);
  assert.strictEqual(find(find(prizes.overlayRoot, 'Reward_king'), 'Claim').getChildByName('Label').getComponent(Label).string, '待配置');
  click(bronze, 'Claim');
  click(bronze, 'Claim');
  await flush();
  assert.strictEqual(prizes.calls.prizes, 1, 'double click must not issue two prize claims');
  assert.strictEqual(find(bronze, 'Claim').getChildByName('Label').getComponent(Label).string, '已领取');
  const missingRewardArt = setup({ missingIcon: true });
  await flush();
  click(missingRewardArt.overlayRoot, 'RankRewards');
  await flush();
  assert.strictEqual(find(missingRewardArt.overlayRoot, 'PvpRankRewardsOverlay'), null, 'missing icons must fail visibly');
  assert(find(missingRewardArt.overlayRoot, 'Status').getComponent(Label).string.includes('图标缺失'));
  const syncFailed = setup({ syncError: true });
  await flush();
  click(syncFailed.overlayRoot, 'StartMatch');
  await flush();
  assert.strictEqual(syncFailed.calls.ranked, 0, 'failed asset sync must never fall back to an unpaid match');
  for (const failure of ['assetError', 'configError']) {
    const blocked = setup({ [failure]: true });
    click(blocked.overlayRoot, 'StartMatch');
    await flush();
    assert.strictEqual(blocked.calls.ranked, 0, 'missing pixel-puzzle data must not fall back to mainline');
    click(blocked.overlayRoot, 'StartChapter');
    assert.strictEqual(blocked.calls.chapter.length, 0, `${failure} must fail visibly, not silently start`);
    assert(find(blocked.overlayRoot, 'Status').getComponent(Label).string.length > 0);
  }
  const close = setup();
  click(close.overlayRoot, 'Close');
  assert.strictEqual(close.session.pixelPuzzleLobbyActive, false, 'back must return to home rather than reopen lobby');
  console.log('PIXEL_PUZZLE_LOBBY_TESTS_PASSED');
})().catch(error => { console.error(error); process.exitCode = 1; });
