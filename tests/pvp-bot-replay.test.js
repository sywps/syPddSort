'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createPixelBotReplay, botMatchRating, pixelLevelHash } = require('../cloudfunctions/pvpService/bot-runtime/PvpBotReplay');
const { BoardModel } = require('../cloudfunctions/pvpService/bot-runtime/BoardModel');
const { PchConveyorRules } = require('../cloudfunctions/pvpService/bot-runtime/PchConveyorRules');
const levelRoot = path.join(__dirname, '../cloudfunctions/pvpService/bot-runtime/levels');
const level3 = require(path.join(levelRoot, 'zt_level_3.json'));
assert.strictEqual(botMatchRating({ rating: 1200, gamesPlayed: 0 }), 950);
assert.strictEqual(botMatchRating({ rating: 1200, gamesPlayed: 10, lossStreak: 2 }), 1000);
assert.strictEqual(botMatchRating({ rating: 1200, gamesPlayed: 0, lossStreak: 50 }), 700);
assert.throws(() => createPixelBotReplay(null, 'invalid'), /参数无效/);
assert.throws(() => createPixelBotReplay({ ...level3, initRandomColorArr: [] }, 'invalid'), /尺寸不匹配/);
assert.notStrictEqual(pixelLevelHash(level3), pixelLevelHash({ ...level3, timeLimit: level3.timeLimit + 1 }));

// Replay the frozen input log without the bot's decision policy. Check every
// legal tap, transport event, completed cell and terminal state independently.
function verifyRun(level, run) {
  const board = new BoardModel(level);
  const rules = new PchConveyorRules(board, level.conveyorCapacity, level.singleSelectionLimit);
  const cells = new Map();
  let total = 0;
  for (let row = 0; row < board.height; row++) for (let col = 0; col < board.width; col++) {
    if (board.correctColors[row][col]) total++;
    if (board.locked[row][col]) cells.set(`${row}:${col}`, { row, col, colorId: board.correctColors[row][col], at: 0 });
  }
  let actionIndex = 0;
  let readyAt = Infinity;
  let terminal = 'DEAD_TIMEOUT';
  for (let time = 50; time <= run.terminalTimeMs; time += 50) {
    if (time >= readyAt) { rules.markQueuedBeansReady(rules.entryCount); readyAt = Infinity; }
    for (let carrier = 0; carrier < rules.carrierCount; carrier++) {
      const from = (carrier + (time - 50) / 250) / rules.carrierCount;
      const to = (carrier + time / 250) / rules.carrierCount;
      if (Math.floor(from) < Math.floor(to)) rules.transferReadyBeansToCarrier(carrier);
      if (Math.floor(from - 0.5) < Math.floor(to - 0.5)) {
        const placed = rules.autoPlaceAvailableLayers(carrier);
        placed.boardCells.forEach((cell, index) => {
          const key = `${cell.row}:${cell.col}`;
          assert(!cells.has(key), 'cannot fill the same target twice');
          assert.strictEqual(placed.colorIds[index], board.correctColors[cell.row][cell.col]);
          cells.set(key, { ...cell, colorId: placed.colorIds[index], at: time });
        });
      }
    }
    if (board.isAllLocked() || rules.isBufferDeadlocked()) {
      terminal = board.isAllLocked() ? 'PASS' : 'DEAD_CONVEYOR_FULL';
      assert.strictEqual(time, run.terminalTimeMs, 'result must occur at the actual terminal event');
      break;
    }
    const action = run.actions[actionIndex];
    if (action?.elapsedMs === time) {
      const block = rules.selectBoard(action.row, action.col);
      assert(block, 'recorded input must select a legal block');
      assert.strictEqual(block.colorId, action.colorId);
      const result = rules.storeBlock(block, 0);
      assert.strictEqual(result.moved, action.moved);
      assert(result.moved > 0);
      readyAt = Math.max(Number.isFinite(readyAt) ? readyAt : 0, time + 160 + result.moved * 12);
      assert.strictEqual(action.seq, ++actionIndex);
    }
  }
  assert.strictEqual(actionIndex, run.actions.length);
  assert.strictEqual(terminal, run.terminalType);
  if (terminal === 'DEAD_TIMEOUT') assert.strictEqual(run.terminalTimeMs, level.timeLimit * 1000);
  assert.strictEqual(cells.size / total, run.progress);
  const displayed = new Set();
  let previous = -1;
  for (const point of run.boardTimeline) {
    assert(point.elapsedMs > previous && point.elapsedMs <= run.terminalTimeMs);
    previous = point.elapsedMs;
    for (const cell of point.addedCells) {
      const key = `${cell.row}:${cell.col}`;
      assert(!displayed.has(key));
      const actual = cells.get(key);
      assert(actual && actual.colorId === cell.colorId, 'thumbnail must contain only real completed targets');
      assert(actual.at <= point.elapsedMs && point.elapsedMs - actual.at < 2000, 'thumbnail may batch, never predict future fills');
      displayed.add(key);
    }
    const progressPoint = run.progressTimeline.find(p => p.elapsedMs === point.elapsedMs);
    assert(progressPoint);
    assert.strictEqual(progressPoint.progress, displayed.size / total, 'bar and thumbnail must agree');
  }
  assert.strictEqual(displayed.size, cells.size);
  assert(run.boardTimeline.length <= 512);
}

const fixed = createPixelBotReplay(level3, 'same-seed', { rating: 1200, gamesPlayed: 0 });
assert.deepStrictEqual(fixed, createPixelBotReplay(level3, 'same-seed', { rating: 1200, gamesPlayed: 0 }));
const summary = { levels: 0, pass: 0, timeout: 0, deadlock: 0, maxGenerationMs: 0 };
for (const filename of fs.readdirSync(levelRoot).filter(name => /^zt_level_\d+\.json$/.test(name))) {
  const level = require(path.join(levelRoot, filename));
  const started = Date.now();
  const run = createPixelBotReplay(level, filename, { rating: 1200, gamesPlayed: 0 });
  summary.maxGenerationMs = Math.max(summary.maxGenerationMs, Date.now() - started);
  verifyRun(level, run);
  summary.levels++;
  summary[run.terminalType === 'PASS' ? 'pass' : run.terminalType === 'DEAD_TIMEOUT' ? 'timeout' : 'deadlock']++;
}
for (const rating of [700, 1800, 3000]) {
  for (let seed = 0; seed < 3; seed++) verifyRun(level3, createPixelBotReplay(level3, `advanced-${seed}`, { rating, gamesPlayed: 30 }));
}
console.log('PVP_BOT_REPLAY_TESTS_PASSED', JSON.stringify(summary));
