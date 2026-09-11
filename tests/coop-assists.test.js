'use strict';
const assert = require('node:assert/strict');
const { PvpHumanReplay } = require('../cloudfunctions/coopService/runtime/PvpHumanReplay');
const { coopHalfLevel, COOP_MAX_ELAPSED_MS } = require('../cloudfunctions/coopService/runtime/CoopModeConfig');
const full = require('../cloudfunctions/coopService/levels/coop_level_7.json');
const half = coopHalfLevel(full, 'creator');
const fresh = () => { const replay = new PvpHumanReplay(half, COOP_MAX_ELAPSED_MS, true); replay.apply([0, 0, 1]); return replay; };
let replay = fresh();
replay.apply([1000, 8]);
assert.equal(replay.timeRemaining, 599);
replay.apply([1000, 9, 90]);
for (let i = 0; i < 20; i++) replay.apply([2000 + i * 1000, 8]);
assert.equal(replay.timeRemaining, 599, 'freeze pauses ordinary countdown');
assert.equal(replay.freezeRemaining, 70);
replay.apply([22000, 7, 12]);
assert.equal(replay.rules.bufferCapacity, half.conveyorCapacity + 12);
const state = replay.checkpoint();
replay = PvpHumanReplay.fromCheckpoint(half, JSON.parse(JSON.stringify(state)), COOP_MAX_ELAPSED_MS, true);
assert.deepEqual(replay.checkpoint(), state, 'expanded capacity, remaining time and freeze survive restart');
replay.apply([22000, 5, 500000]);
assert(replay.progress > 0, 'magnet completes a real color');
let block;
for (let row = 0; row < half.boardHeight && !block; row++) for (let col = 0; col < half.boardWidth && !block; col++) {
    const selected = replay.rules.selectBoard(row, col);
    if (selected) block = { row, col, selected };
}
const count = Math.min(block.selected.cells.length, replay.rules.bufferCapacity - replay.rules.bufferCount);
replay.apply([23000, 2, block.row, block.col, block.selected.colorId, count]);
for (let i = 0; i < count; i++) replay.apply([23200 + i * 12, 3]);
const beforeBrush = replay.progress;
replay.apply([24000, 6]);
assert.equal(replay.rules.bufferCount, 0, 'brush clears stored beans through shared rules');
assert(replay.progress >= beforeBrush);
const resumed = PvpHumanReplay.fromCheckpoint(half, replay.checkpoint(), COOP_MAX_ELAPSED_MS, true);
assert.deepEqual(resumed.board.currentColors, replay.board.currentColors);
const timed = fresh();
for (let i = 1; i <= 600; i++) timed.apply([i * 1000, 8]);
assert.equal(timed.timeRemaining, 0);
const expired = PvpHumanReplay.fromCheckpoint(half, timed.checkpoint(), COOP_MAX_ELAPSED_MS, true);
let lateBlock;
for (let row = 0; row < half.boardHeight && !lateBlock; row++) for (let col = 0; col < half.boardWidth && !lateBlock; col++) {
    const selected = expired.rules.selectBoard(row, col);
    if (selected) lateBlock = { row, col, selected };
}
const lateCount = Math.min(lateBlock.selected.cells.length, expired.rules.bufferCapacity);
expired.apply([720000, 2, lateBlock.row, lateBlock.col, lateBlock.selected.colorId, lateCount]);
assert(expired.rules.bufferCount > 0, 'old zero-time checkpoint remains playable beyond ten minutes');
for (let i = 0; i < lateCount; i++) expired.apply([720200 + i * 12, 3]);
for (let i = 0; i < 20 && !expired.board.isAllLocked(); i++) expired.apply([722000 + i, 5, 0]);
assert.equal(expired.progress, 1, 'cooperation can finish beyond the former deadline');
assert(expired.completedAt > 600000);
timed.apply([600000, 10, 120]);
assert.equal(timed.timeRemaining, 120, 'ordinary rewarded timeout revive adds 120 seconds');
assert.throws(() => timed.apply([600000, 10, 120]), /invalid time revive/);
for (const event of [[0, 5, 1], [0, 6], [0, 7, 12], [0, 8], [0, 9, 90], [0, 10, 120]]) {
    const ranked = new PvpHumanReplay(half); ranked.apply([0, 0, 1]);
    assert.throws(() => ranked.apply(event), /unknown replay command/, 'ranked still rejects props and ad grants');
}
const finished = fresh();
for (let i = 0; i < 20 && !finished.board.isAllLocked(); i++) finished.apply([i, 5, 0]);
assert(finished.board.isAllLocked(), 'skill finish reaches the same completion condition');
assert.equal(finished.progress, 1);
const fs = require('node:fs');
const session = fs.readFileSync(require('node:path').join(__dirname, '../assets/Scripts/Core/GameplaySessionController.ts'), 'utf8');
const policy = session.match(/runtime\._currentLevelUnlimitedTime =[^;]+;\s*runtime\.timeRemain =[^;]+;/)[0];
for (const coop of [true, false]) {
    const runtime = { isCoopMode: () => coop };
    new Function('runtime', 'dynamicTimeLimit', policy)(runtime, 600);
    assert.equal(runtime._currentLevelUnlimitedTime, coop);
    assert.equal(runtime.timeRemain, coop ? 0 : 600);
}
const timerSource = fs.readFileSync(require('node:path').join(__dirname, '../assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts'), 'utf8');
const timerGuards = timerSource.slice(timerSource.indexOf('tickTimer() {') + 'tickTimer() {'.length, timerSource.indexOf('if (this.tickFreezeTimer()) return;'));
const unlimitedRuntime = { _currentLevelUnlimitedTime: true, isCoopMode: () => true,
    recordCoopRuleEvent() { throw new Error('unlimited mode must not emit countdown ticks'); } };
new Function(timerGuards).call(unlimitedRuntime);
console.log('COOP_ASSISTS_TESTS_PASSED: unlimited gameplay, expired checkpoint recovery, props and ranked isolation');
