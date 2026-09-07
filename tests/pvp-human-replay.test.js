'use strict';
const assert = require('assert');
const { controllerReplay } = require('./pvp-human-replay-fixture');
const { replayHumanEvents } = require('../cloudfunctions/pvpService/bot-runtime/PvpHumanReplay');
const { rankedPool, selectReplay, loadLevel } = require('../cloudfunctions/pvpService/matchmaking');

for (const levelId of [3, 9, 21]) {
  for (const timeout of [false, true]) {
    const level = loadLevel(levelId);
    const fixture = controllerReplay(level, { timeout });
    const replay = replayHumanEvents(level, fixture.envelope);
    const result = replay.finish(fixture.terminalType, fixture.terminalTimeMs);
    assert.deepStrictEqual(replay.board.currentColors, fixture.board.currentColors, 'server must reproduce the original controller board');
    assert.deepStrictEqual(replay.rules.carriers, fixture.rules.carriers);
    assert.deepStrictEqual(replay.rules.entryColors, fixture.rules.entryColors);
    assert.strictEqual(result.completeRun, true);
    assert.strictEqual(result.progress, replay.board.locked.flat().filter(Boolean).length / level.correctColorArr.flat().filter(Boolean).length);
    const restored = replayHumanEvents(level, { ...fixture.envelope, events: fixture.envelope.events.slice(0, 40) });
    for (const event of fixture.envelope.events.slice(40)) restored.apply(event);
    assert.deepStrictEqual(restored.board.currentColors, replay.board.currentColors, 'checkpoint continuation reproduces uninterrupted play');
    console.log('ORIGINAL_CONTROLLER_REPLAY', levelId, timeout, fixture.terminalType, fixture.terminalTimeMs, result.progress);
  }
}
const level = loadLevel(3);
const deadlockLevel = { boardWidth: 6, boardHeight: 1, timeLimit: 30, conveyorCapacity: 3,
  correctColorArr: [[1, 1, 1, 2, 2, 2]], initRandomColorArr: [[2, 2, 2, 1, 1, 1]], singleSelectionLimit: 12 };
const deadlockFixture = controllerReplay(deadlockLevel);
assert.strictEqual(deadlockFixture.terminalType, 'DEAD_CONVEYOR_FULL');
assert.strictEqual(replayHumanEvents(deadlockLevel, deadlockFixture.envelope).finish(deadlockFixture.terminalType,
  deadlockFixture.terminalTimeMs).completeRun, true, 'real deadlock failures are eligible, not just successful runs');
const fixture = controllerReplay(level);
const clone = () => JSON.parse(JSON.stringify(fixture.envelope));
assert.throws(() => replayHumanEvents(level, { ...clone(), levelHash: 'changed' }), /version/);
const fast = clone(); fast.events[1] = [1, 1, 100];
assert.throws(() => replayHumanEvents(level, fast), /clock/);
const skill = clone(); skill.events[1] = [1, 4, 5];
assert.throws(() => replayHumanEvents(level, skill), /speed/);
const illegal = clone(); const tap = illegal.events.find(item => item[1] === 2); tap[2] = 999;
assert.throws(() => replayHumanEvents(level, illegal), /selection/);
assert.throws(() => replayHumanEvents(level, { ...clone(), events: [[0, 0, 1]] }).finish('PASS', 1), /pass/);
assert.throws(() => replayHumanEvents(level, { ...clone(), events: [[0, 0, 1], [1, 3]] }), /arrival/);
const pool = rankedPool(Date.UTC(2026, 8, 7));
assert.strictEqual(new Set(pool.levels.map(item => item.levelId)).size, 12);
assert.notDeepStrictEqual(pool.levels, rankedPool(Date.UTC(2026, 8, 8)).levels);
const result = replayHumanEvents(level, fixture.envelope).finish(fixture.terminalType, fixture.terminalTimeMs);
const now = Date.now();
const candidate = { ...result, _id: 'real-1', ownerOpenid: 'human-1', levelId: 3, levelHash: fixture.envelope.levelHash,
  levelPrefix: 'zt_level_', rulesVersion: 'pvp-pixel-v2', rating: 950, verified: true, verificationLevel: 'replay-verified-v1',
  eligibleForMatchmaking: true, completeRun: true, useCount: 0, validUntil: now + 1000,
  terminalType: fixture.terminalType, terminalTimeMs: fixture.terminalTimeMs };
assert(selectReplay([candidate], 'new-user', 3, { rating: 1200, gamesPlayed: 0 }, now));
for (const patch of [{ verificationLevel: 'structural-v1' }, { levelHash: 'old' }, { developmentOnly: true },
  { completeRun: false }, { terminalType: 'FORFEIT' }, { useCount: 50 }, { validUntil: now - 1 }, { ownerOpenid: 'new-user' }]) {
  assert.strictEqual(selectReplay([{ ...candidate, ...patch }], 'new-user', 3, {}, now), null);
}
assert.strictEqual(selectReplay([candidate], 'new-user', 3, { recentOpponents: [{ ownerOpenid: 'human-1' }] }, now), null);
console.log('PVP_HUMAN_REPLAY_TESTS_PASSED');
