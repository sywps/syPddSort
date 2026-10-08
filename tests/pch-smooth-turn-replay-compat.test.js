'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const level = { boardWidth: 6, boardHeight: 1, timeLimit: 30, conveyorCapacity: 60,
    correctColorArr: [[1, 1, 1, 2, 2, 2]], initRandomColorArr: [[2, 2, 2, 1, 1, 1]], singleSelectionLimit: 12 };

for (const runtime of ['pvpService/bot-runtime', 'coopService/runtime']) {
    const file = path.resolve(__dirname, '../cloudfunctions', runtime, 'PvpHumanReplay.js');
    const localRequire = createRequire(file);
    const { PvpHumanReplay: Current } = require(file);
    const oldModule = { exports: {} };
    // Golden historical exit gate; use the actual replay engine and all actual rules.
    new Function('module', 'exports', 'require', fs.readFileSync(file, 'utf8'))(
        oldModule, oldModule.exports, name => name === './PchConveyorGeometry'
            ? { ...localRequire(name), conveyorExitProgress: () => 0.5344395919157496 }
            : localRequire(name));
    const Legacy = oldModule.exports.PvpHumanReplay;
    for (const speed of [1, 2, 3]) for (const step of [250, 300]) {
        const current = new Current(level), legacy = new Legacy(level);
        const events = [[0, 0, speed], [0, 2, 0, 0, 2, 3], [0, 2, 0, 3, 1, 3]];
        for (const time of [160, 160, 172, 172, 184, 184]) events.push([time, 3]);
        for (let time = 200; time <= 15000; time += 20) events.push([time, 1, time / step * speed]);
        let resumed;
        for (const event of events) {
            current.apply(event); legacy.apply(event);
            assert.deepEqual(current.checkpoint(), legacy.checkpoint(), `${runtime}: historical checkpoint parity`);
            assert.deepEqual(current.boardTimeline, legacy.boardTimeline);
            if (resumed) {
                resumed.apply(event);
                assert.deepEqual(resumed.checkpoint(), current.checkpoint(), 'historical checkpoint resumes unchanged');
            } else if (event[0] === 200) resumed = Current.fromCheckpoint(level, legacy.checkpoint());
        }
        assert.equal(current.actions.length, 2);
        assert.equal(current.progress, 1, 'populated conveyor must deliver every bean');
        assert.ok(current.completedAt > 0);
        assert.equal(current.pendingReady.length, 0);
    }
}
console.log('pch-smooth-turn-replay-compat: PASS (populated replay, historical gate, checkpoint, 1/2/3X, both runtimes)');
