'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../cloudfunctions/pvpService/core');

assert.strictEqual(core.rankFromRating(0).displayName, '倔强青铜 III');
assert.strictEqual(core.rankFromRating(1500).displayName, '永恒钻石 V');
assert.strictEqual(core.rankFromRating(2000).displayName, '最强王者');
assert.strictEqual(core.rankFromRating(2500).displayName, '荣耀王者');
assert.strictEqual(core.rankFromRating(3000).displayName, '传奇王者');
assert.strictEqual(core.rankFromStars(0).displayName, '倔强青铜 III');
assert.strictEqual(core.rankFromStars(100).displayName, '最强王者');

assert.strictEqual(core.resolveOutcome('PASS', 40000, 'PASS', 50000), 'win');
assert.strictEqual(core.resolveOutcome('PASS', 50000, 'PASS', 40000), 'lose');
assert.strictEqual(core.resolveOutcome('DEAD_TIMEOUT', 50000, 'DEAD_CONVEYOR_FULL', 40000), 'win');
assert.strictEqual(core.resolveOutcome('DEAD_TIMEOUT', 40000, 'DEAD_CONVEYOR_FULL', 50000), 'lose');
assert.strictEqual(core.resolveOutcome('PASS', 40000, 'DEAD_TIMEOUT', 20000), 'win');
assert.strictEqual(core.resolveOutcome('FORFEIT', 40000, 'PASS', 40000), 'lose');
assert.strictEqual(core.resolveOutcome('SURVIVED_OPPONENT_DEATH', 40001, 'DEAD_CONVEYOR_FULL', 40000), 'win');

assert(core.ratingDelta(1000, 1000, 'win', 0) > 0);
assert(core.ratingDelta(1000, 1000, 'lose', 0) < 0);
assert.strictEqual(core.ratingDelta(1000, 1000, 'draw', 0), 0);

const botA = core.createBotRun({ seed: 'same-seed', rating: 1500, levelId: 12 });
const botB = core.createBotRun({ seed: 'same-seed', rating: 1500, levelId: 12 });
assert.deepStrictEqual(botA, botB, 'bot runs must be deterministic for replayability');
assert(['PASS', 'DEAD_TIMEOUT', 'DEAD_CONVEYOR_FULL'].includes(botA.terminalType));
assert(botA.boardTimeline.length && botA.actions.length, 'bot must freeze a legal board replay and actions');
assert.strictEqual(botA.policyVersion, 'pch-legal-v3');
assert(new Set(botA.progressTimeline.slice(1).map((point, index) => point.elapsedMs - botA.progressTimeline[index].elapsedMs)).size > 2, 'bot pacing should include human-like timing variance');

assert.strictEqual(core.isFriendChallengeJoinReady({ status: 'PLAYING_CREATOR', submissions: {}, playerBOpenid: '' }), false);
assert.strictEqual(core.isFriendChallengeJoinReady({ status: 'WAITING_OPPONENT', submissions: { a: { terminalType: 'PASS' } }, playerBOpenid: '' }), true);
assert.strictEqual(core.isFriendChallengeJoinReady({ status: 'WAITING_OPPONENT', submissions: { a: { terminalType: 'PASS' } }, playerBOpenid: 'joined' }), false);
assert.strictEqual(core.canSubmitFriendChallenge('PLAYING_CREATOR', 'a'), true);
assert.strictEqual(core.canSubmitFriendChallenge('PLAYING_CREATOR', 'b'), false);
assert.strictEqual(core.canSubmitFriendChallenge('PLAYING_CHALLENGER', 'b'), true);
assert.strictEqual(core.canSubmitFriendChallenge('WAITING_OPPONENT', 'a'), false);

const profile = core.publicProfile({ displayName: '玩家甲', rating: 1500, openid: 'secret' }, 'human_replay');
assert.strictEqual(profile.displayName, '玩家甲');
assert.strictEqual(Object.prototype.hasOwnProperty.call(profile, 'openid'), false, 'public profile must not leak openid');
assert.strictEqual(Object.prototype.hasOwnProperty.call(profile, 'rating'), false, 'public profile must not leak hidden MMR');

const code = core.makeChallengeCode('player:time:level');
assert.strictEqual(code.length, 6);
assert(/^[A-Z2-9]+$/.test(code));

const actions = [{ seq: 1, elapsedMs: 1200, row: 2, col: 3, colorId: 4, moved: 5 }];
const payload = JSON.stringify(actions);
const submission = { terminalType: 'PASS', terminalTimeMs: 2000, actionCount: 1, actionDigest: core.digest(payload) };
assert.deepStrictEqual(core.verifyActionPayload({ actionChunks: [{ payload }] }, submission), actions);
assert.throws(() => core.verifyActionPayload({ actionChunks: [{ payload }] }, { ...submission, actionDigest: 'wrong' }), /digest/);
assert.throws(() => core.verifyActionPayload({ actionChunks: [] }, { terminalType: 'PASS', terminalTimeMs: 2000, actionCount: 0 }), /requires action log/);
assert.deepStrictEqual(core.normalizeProgressTimeline([{ elapsedMs: 0, progress: 0 }, { elapsedMs: 1500, progress: 0.4 }], 2000), [{ elapsedMs: 0, progress: 0 }, { elapsedMs: 1500, progress: 0.4 }]);
assert.throws(() => core.normalizeProgressTimeline([{ elapsedMs: -1, progress: 0 }], 2000), /timeline/);
assert.throws(() => core.normalizeProgressTimeline([{ elapsedMs: 1500, progress: 0.5 }, { elapsedMs: 1200, progress: 0.6 }], 2000), /timeline/);
const boardTimeline = [{ elapsedMs: 1200, addedCells: [{ row: 2, col: 3, colorId: 4 }] }];
assert.deepStrictEqual(core.normalizeBoardTimeline(boardTimeline, 2000), boardTimeline);
assert.throws(() => core.normalizeBoardTimeline([
  { elapsedMs: -1, addedCells: [{ row: 2, col: 3, colorId: 4 }] },
], 2000), /board timeline/);
assert.throws(() => core.normalizeBoardTimeline([
  ...boardTimeline,
  { elapsedMs: 1500, addedCells: [{ row: 2, col: 3, colorId: 4 }] },
], 2000), /duplicate/);

const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/pvpService/index.js'), 'utf8');
const deploymentManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../cloudfunctions/pvpService/deployment-manifest.json'), 'utf8'));
for (const action of ['matchmake', 'createFriendChallenge', 'joinFriendChallenge', 'getMatch', 'getActiveMatch', 'saveCheckpoint', 'getOpponentState', 'cancelMatch', 'submitResult', 'getLeaderboard', 'getHistory']) {
  assert(source.includes(`case '${action}'`), `missing cloud action ${action}`);
}
for (const action of ['maintenance', 'seedDevelopmentData']) {
  assert(source.includes(`event.action === '${action}'`), `missing protected cloud action ${action}`);
}
assert(source.includes('db.runTransaction'), 'rank settlement must use a database transaction');
assert(source.includes('pvp_settlements'), 'settlement ledger collection must exist');
assert(source.includes('pvp_checkpoints'), 'checkpoint collection must exist');
assert(source.includes('publicSettlement'), 'settlement response must use public projection');
assert(source.includes('`${matchId}_${opponentOpenid}`'), 'friend settlement must write both participant ledgers');
assert(source.includes("(rated ? 1 : 0)"), 'friend matches must not increment ranked game totals');
assert(source.includes('const replay = await findHistoricalReplay'), 'ranked matchmaking must search human replays first');
assert(source.includes('if (activeMatch) return activeMatch;'), 'ranked matchmaking must resume the authoritative active match instead of dead-ending');
assert(!source.includes("async function createRankedMatch(event, openid, profile) {\n  if (await getActiveMatch(openid)) throw new Error('active match already exists');"), 'ranked matchmaking must not reject a recoverable active match');
const matcherSource = fs.readFileSync(path.join(__dirname, '../cloudfunctions/pvpService/matchmaking.js'), 'utf8');
assert(matcherSource.includes('HUMAN_REPLAY_VERIFICATION') && matcherSource.includes('row.completeRun === true'), 'historical candidates must require complete rule-verified replays');
assert(source.indexOf("matchType = 'human_replay'") < source.indexOf("matchType = 'bot'"), 'bot fallback must remain after the human replay branch');
assert(source.includes("const publicMatchType = match.matchType === 'friend' ? 'friend' : 'ranked'"), 'client match projection must conceal ranked opponent source');
assert(!source.includes('matchType: match.matchType,'), 'client response must not expose internal bot or replay match type');
assert(source.includes('terminalType: opponentRun.terminalType'), 'client opponent run must use an explicit public projection');
assert(source.includes('progressed result requires board timeline'), 'progressed results must include a board mirror timeline');
assert(!source.includes("displayName: '像素工匠'"), 'fallback identity must not use the old bot-specific name');
assert(source.includes("status: 'PLAYING_CREATOR'"), 'friend creator must play before sharing the challenge');
assert(source.includes("status: 'PLAYING_CHALLENGER'"), 'friend challenger must play only after the creator run is frozen');
assert(source.includes('friend challenge result is not ready'), 'joining must fail before the creator has submitted a result');
assert(source.includes("const rated = match.matchType !== 'friend'"), 'friend challenge settlement must not change ranked rating or stars');
assert.deepStrictEqual(deploymentManifest.collections.sort(), ['pvp_checkpoints', 'pvp_matches', 'pvp_profiles', 'pvp_rank_reward_claims', 'pvp_replays', 'pvp_settlements', 'pvp_ticket_claims']);
assert.deepStrictEqual(deploymentManifest.existingCollectionDependencies, ['user_profile']);
assert.strictEqual(deploymentManifest.environment.production.PVP_RANK_REWARDS_ENABLED, 'false');
const replayMatchIndex = deploymentManifest.indexes.find((index) => index.name === 'pixel_level_rules_verified_eligible_created');
assert(replayMatchIndex, 'deployment manifest must include the historical replay matchmaking index');
assert(replayMatchIndex.fields.some(([field]) => field === 'levelPrefix'), 'replay namespace must be indexed');
assert(replayMatchIndex.fields.some(([field]) => field === 'useCount'), 'historical replay index must include the reuse-limit range field');
for (const maintenanceIndex of ['status_expires', 'eligible_valid_until']) {
  assert(deploymentManifest.indexes.some((index) => index.name === maintenanceIndex), `deployment manifest is missing maintenance index ${maintenanceIndex}`);
}
const opponentStateSource = source.slice(source.indexOf('async function getOpponentState'), source.indexOf('async function cancelOrForfeit'));
assert(!opponentStateSource.includes('COLLECTIONS.checkpoints'), 'opponent state must never expose a live friend checkpoint');
assert(opponentStateSource.includes("freshness: 'frozen'"), 'opponent state must be an immutable asynchronous run');

const uiSource = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts'), 'utf8');
const conveyorSource = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/PchConveyorGameplayController.ts'), 'utf8');
const boardViewportSource = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts'), 'utf8');
const gameplayViewSource = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/GameplayViewController.ts'), 'utf8');
const startupRouteSource = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/StartupRouteService.ts'), 'utf8');
const gameRuntimeSource = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/GameSceneRuntimeController.ts'), 'utf8');
for (const requiredUi of ['排位对手', '好友挑战', 'OpponentThumbnail', 'SyncState', 'SelfProgress', 'OpponentProgress', 'PvpOpponentReveal']) {
  assert(uiSource.includes(requiredUi), `formal battle UI is missing ${requiredUi}`);
}
for (const referenceHeaderNode of ['TimerWrap', 'SelfIdentityPlate', 'OpponentIdentityPlate', 'SelfAvatar', 'OpponentAvatar', 'Versus']) {
  assert(uiSource.includes(referenceHeaderNode), `reference battle header is missing ${referenceHeaderNode}`);
}
assert(uiSource.includes("topBar.getChildByName('TimerWrap')"), 'ranked header must reuse the original scene timer wrap');
assert(!uiSource.includes("new Node('ReferenceTimerPill')"), 'ranked header must not create a parallel timer pill');
assert(uiSource.includes('speedNode.active = true'), 'ranked header must retain the functional speed control');
assert(uiSource.includes('const PVP_BATTLE_UTILITY_CENTER_TOP = 50.5;'), 'ranked utilities must share one visual center measured from the top');
assert(uiSource.includes('const PVP_BATTLE_ARTWORK_OPTICAL_TOP_OFFSET = -5;'), 'timer and speed artwork must compensate for their lower visual weight');
assert(uiSource.includes('widget.top = PVP_BATTLE_UTILITY_CENTER_TOP - (transform.height * Math.abs(node.scale.y)) / 2 + opticalTopOffset'), 'ranked utility alignment must account for each scaled node height and artwork bounds');
for (const utilityAlignment of [
  'alignPvpUtilityCenter(timerWrap, timerWidget, PVP_BATTLE_ARTWORK_OPTICAL_TOP_OFFSET)',
  'alignPvpUtilityCenter(speedNode, speedWidget, PVP_BATTLE_ARTWORK_OPTICAL_TOP_OFFSET)',
  'alignPvpUtilityCenter(settingsNode, settingsWidget)',
]) {
  assert(uiSource.includes(utilityAlignment), `ranked utility row is missing ${utilityAlignment}`);
}
assert(conveyorSource.includes('this.bindSpeedButton(topBar, !hideFirstLevelControls)'), 'ranked gameplay lifecycle must bind the original functional speed control');
assert(gameplayViewSource.includes('const RANKED_PVP_BOARD_CENTER_OFFSET_Y = -28;'), 'ranked PvP board must apply the portrait visual-center correction without changing the fitted scale');
assert(gameplayViewSource.includes('runtime.isRankedPvpMode?.() === true ? RANKED_PVP_BOARD_CENTER_OFFSET_Y : 0'), 'ranked PvP visual-center correction must not affect normal gameplay');
assert(uiSource.includes('thumbnail.setPosition(252, 424, 0)'), 'reference board thumbnail must remain in the upper-right header area');
assert(uiSource.includes("addProgress(hud, 'SelfProgress', -105, 352, 460"), 'self progress must use the wide stacked reference layout');
assert(uiSource.includes("addProgress(hud, 'OpponentProgress', -105, 307, 460"), 'opponent progress must use the wide stacked reference layout');
assert(!uiSource.includes("new Node('ArenaHeader')"), 'legacy monolithic arena title must not return');
for (const forbiddenUi of ['AI 对手', 'AiBadge', 'RobotFace']) {
  assert(!uiSource.includes(forbiddenUi), `player-facing UI must not expose fallback source: ${forbiddenUi}`);
}
assert(uiSource.includes('opponentProgressAt(context, elapsedMs)'), 'opponent UI must consume replay timeline progress');
assert(uiSource.includes('resolvePvpBoardTimeline(timeline, elapsedMs)'), 'historical board thumbnail must consume recorded board timeline');
assert(!uiSource.includes('index < visibleCount'), 'opponent thumbnail must not infer cells from an overall percentage');
assert(!uiSource.includes('pollPvpFriendState'), 'asynchronous friend battles must not poll a live opponent');
assert(!uiSource.includes('对手刚刚同步'), 'asynchronous battle UI must not imply live synchronization');
assert(uiSource.includes('先完成本局，成绩保存后再邀请好友挑战'), 'friend challenge must make the creator-run-first flow explicit');
assert(uiSource.includes('loadPersistedBattle()'), 'ranked route must recover a persisted opponent context');
assert(uiSource.includes("startLabel.string = match ? '恢复对局' : '开始排位'"), 'unified lobby must expose authoritative active-match recovery');
assert(/openPvpLobby\(\): void \{\s*this\._pvpMatchStarting = false;/.test(uiSource), 'opening the PVP lobby must clear any stale matchmaking guard');
assert(/getRankedLevel\(\)[\s\S]*?matchmake\(offer.levelId, data, offer.poolVersion\)[\s\S]*?this\._pvpMatchStarting = false;[\s\S]*?this\.showPvpOpponentReveal/.test(uiSource), 'ranked matchmaking must load the server level before revealing the opponent');
assert(/getActiveMatch\(\)\.then\(\(match\) => \{\s*this\._pvpMatchStarting = false;/.test(uiSource), 'successful match recovery must release the start guard before entering battle');
assert(uiSource.includes('进入对战失败：'), 'battle scene routing failures must be visible and retryable');
assert(uiSource.includes("'[PvpMode] opponent HUD failed to mount'"), 'opponent HUD must fail visibly when required nodes are missing');
assert(uiSource.includes("topBar.setSiblingIndex(topBar.parent.children.length - 1)"), 'ranked HUD layer must stay above board and conveyor groups');
assert(uiSource.includes('label.overflow = Label.Overflow.SHRINK'), 'PVP identity labels must shrink within bounded HUD columns');
assert(uiSource.includes('hud.setPosition(0, 0, 0)'), 'reference HUD must use full-screen coordinates');
assert(uiSource.includes('ensureTransform(hud, 720, 1280)'), 'reference HUD must use the project design resolution');
assert(boardViewportSource.includes("new Set(['TopHud', 'PvpBattleHud'])"), 'board safe-area calculation must measure PvP HUD children instead of its full-screen root');
assert(boardViewportSource.includes('if (!conveyorActive && this.shouldShowSlotArea?.() && this.slotAreaNode?.isValid)'), 'hidden slot area must not shift the conveyor-mode board away from the visible safe-area center');
assert(boardViewportSource.includes('if (!conveyorActive && this.shouldShowSlotArea() && this.slotAreaNode?.isValid)'), 'initial board fit must also exclude the covered slot area while conveyor gameplay is active');
assert(boardViewportSource.includes('if (this.isRankedPvpMode?.() !== true)'), 'ranked PvP must not reserve board space for its disabled skill controls');
assert(uiSource.includes("addAvatar(this, hud, 'SelfAvatar', context.self, -230, 507"), 'self portrait must overlap the left identity plate');
assert(uiSource.includes("addAvatar(this, hud, 'OpponentAvatar', context.opponent, 8, 507"), 'opponent portrait must overlap the coral identity plate');
for (const lobbyNode of ['LobbyBackdropDecor', 'SeasonPill', 'RankStage', 'RankMedalWings', 'RankCrest', 'StartMatch', 'PvpLeaderboard', 'History', 'Rules']) {
  assert(uiSource.includes(lobbyNode), `optimized ranked lobby is missing ${lobbyNode}`);
}
for (const friendBattleNode of ['FriendChallenge', 'PvpFriendBattleOverlay', 'JoinFriendCard', 'JoinFriendChallenge', 'CreateFriendCard', 'CreateFriendChallenge']) {
  assert(uiSource.includes(friendBattleNode), `asynchronous friend battle UI is missing ${friendBattleNode}`);
}
assert(uiSource.includes("addButton(overlay, 'FriendChallenge', '好友挑战 · 未解锁', 0, -534, 600, 56, new Color(218, 220, 235), () => {})"), 'friend battle entry must be visibly locked with no navigation callback');
assert(uiSource.includes('friendChallengeButton.getComponent(Button)!.interactable = false'), 'locked friend challenge must reject clicks');
assert(!uiSource.includes('friendChallengeButton.active = false'), 'friend battle entry must not be hidden');
assert(uiSource.includes('回放好友已完成并保存的真实成绩'), 'join path must explain that the opponent result is frozen');
assert(uiSource.includes('你先完成一局，成绩保存后再分享给好友'), 'create path must explain the creator-run-first flow');
assert(uiSource.includes('getLaunchChallengeCode()'), 'friend battle panel must recognize a received share-card challenge code');
assert(uiSource.includes('joinFriendChallenge(launchCode)'), 'friend battle join path must call the authoritative cloud service');
assert(uiSource.includes('createFriendChallenge(levelId)'), 'friend battle create path must call the authoritative cloud service');
assert(uiSource.includes('new Color(238, 241, 255, 255)'), 'ranked lobby must use an opaque high-contrast background');
assert(uiSource.includes("addButton(overlay, 'PvpLeaderboard', '排行榜', -210, -429"), 'lobby secondary actions must share one aligned row');
assert(uiSource.includes("addButton(overlay, 'History', '对战记录', 0, -429"), 'battle history must remain in the aligned secondary row');
assert(uiSource.includes("addButton(overlay, 'Rules', '玩法规则', 210, -429"), 'rules must remain in the aligned secondary row');
assert(uiSource.includes("'ChapterTitle', '闯关模式'"), 'unified lobby must expose chapter mode');
assert(uiSource.includes('this.startThemeLevel(chapterLevelId, { suppressFailureToast: true })'), 'chapter entry must retain theme gameplay and vigor checks');
assert(uiSource.includes('persistedBattle?.matchId === match.matchId'), 'resume must not merge elapsed time from another match');
assert(!uiSource.includes('drawPvpEntry(parent'), 'separate ranked home entry must be removed');
assert(startupRouteSource.includes("query.pvppreview"), 'local runtime must expose an explicit PvP visual verification route');
assert(gameRuntimeSource.includes("directPreviewRoute.reason === 'pvp-ranked'"), 'direct Game-scene preview must preserve the PvP route context');
assert(conveyorSource.includes('this.adButton.active = !hideFirstLevelControls && !rankedPvp'), 'ranked PvP must hide the rewarded capacity button');
assert(conveyorSource.includes('if (this.runtime.isRankedPvpMode?.() === true) return;'), 'ranked PvP must suppress incompatible conveyor guides and ad grants');

console.log('PVP_SERVICE_CORE_TESTS_PASSED');
