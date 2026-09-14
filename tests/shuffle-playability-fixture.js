'use strict';
// Execute current source rules in memory; no generated cloud runtime or fake board.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const cache = new Map();
function load(name) {
    if (cache.has(name)) return cache.get(name);
    assert.ok(['LevelConfig', 'BoardModel', 'PchConveyorRules'].includes(name));
    const source = path.join(__dirname, '../assets/Scripts/Core', name + '.ts');
    const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        fileName: source, reportDiagnostics: true,
    });
    assert.equal(compiled.diagnostics.length, 0);
    const module = { exports: {} };
    new Function('module', 'exports', 'require', compiled.outputText)(module, module.exports, id => load(id.replace('./', '')));
    cache.set(name, module.exports);
    return module.exports;
}
const { BoardModel } = load('BoardModel');
const { PchConveyorRules } = load('PchConveyorRules');
const count = values => {
    const counts = new Map();
    for (const c of values) if (c > 0) counts.set(c, (counts.get(c) || 0) + 1);
    return [...counts].sort((a, b) => a[0] - b[0]);
};

function simulate(level) {
    const snapshot = JSON.stringify(level);
    const board = new BoardModel(level);
    const rules = new PchConveyorRules(board, level.conveyorCapacity, level.singleSelectionLimit, undefined, level.autoConveyorFinishSpeed);
    const inventory = count(level.correctColorArr.flat());
    let clicks = 0, peakBuffer = 0, returned = 0;
    function check() {
        const state = rules.exportTransportState();
        assert.deepEqual(count([...board.currentColors.flat(), ...state.queued, ...state.carriers.flat()]), inventory);
        assert.ok(rules.bufferCount <= rules.bufferCapacity);
        for (let y = 0; y < board.height; y++) for (let x = 0; x < board.width; x++)
            if (board.locked[y][x]) assert.equal(board.currentColors[y][x], board.correctColors[y][x]);
    }
    function settle() {
        rules.markQueuedBeansReady(rules.entryCount);
        // Process legal entry transfers and returns until a full sweep is idle.
        // This validates rule reachability, not conveyor animation or elapsed time.
        while (true) {
            let moved = 0;
            for (let i = 0; i < rules.carrierCount; i++) {
                const n = rules.autoPlaceAvailableLayers(i).moved;
                returned += n; moved += n;
                moved += rules.transferReadyBeansToCarrier(i).moved;
            }
            if (!moved) break;
        }
        check();
    }
    const events = [];
    while (!board.isAllLocked() && clicks <= board.width * board.height * 2) {
        settle();
        if (board.isAllLocked()) break;
        if (rules.bufferCount >= rules.bufferCapacity) break;
        const held = count([...rules.entryColors, ...rules.carriers.flat()]);
        const wanted = new Map(held), seen = new Set();
        let best = null;
        for (let y = 0; y < board.height; y++) for (let x = 0; x < board.width; x++) {
            if (!board.currentColors[y][x] || board.locked[y][x]) continue;
            const block = rules.selectBoard(y, x);
            if (!block) continue;
            assert.ok(block.cells.length <= rules.moveLimit);
            const signature = block.cells.map(c => c.row * board.width + c.col).sort((a,b) => a-b).join(',');
            if (seen.has(signature)) continue;
            seen.add(signature);
            const cells = block.cells.slice(0, rules.bufferCapacity - rules.bufferCount);
            const freed = new Map();
            for (const c of cells) { const t = board.correctColors[c.row][c.col]; freed.set(t, (freed.get(t) || 0) + 1); }
            let immediate = 0;
            for (const [color, n] of freed) immediate += Math.min(n, wanted.get(color) || 0);
            const score = immediate * 100 + cells.length;
            if (!best || score > best.score) best = { block, score, y, x };
        }
        if (!best) break;
        const move = rules.storeBlock(best.block, 0);
        assert.ok(move.moved > 0);
        events.push([best.y, best.x, move.moved]);
        peakBuffer = Math.max(peakBuffer, rules.bufferCount);
        clicks++;
        check();
    }
    settle();
    assert.equal(JSON.stringify(level), snapshot);
    return { completed: board.isAllLocked(), clicks, peakBuffer, capacity: rules.bufferCapacity,
        singleSelectionLimit: rules.moveLimit, returned, events,
        validation: 'current-source eight-neighbour rules; no animation/time or optimality claim' };
}
module.exports = { simulate, BoardModel, PchConveyorRules };
