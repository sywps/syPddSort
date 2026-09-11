'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const Module = require('node:module');
const { OUT, LEVEL_DIR, MANIFEST, palette } = require('./generate-coop-levels');
const shuffle = require('./shuffle-comparison');

// Load current pure TypeScript rule sources without rebuilding the cloud runtime.
const root = path.resolve(__dirname, '..');
const cache = new Map();
function loadSource(name) {
    const file = path.join(root, 'assets/Scripts/Core', name + '.ts');
    if (cache.has(file)) return cache.get(file).exports;
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        fileName: file, reportDiagnostics: true,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    assert.equal(compiled.diagnostics.length, 0, `${name}: TypeScript diagnostics`);
    const mod = new Module(file, module);
    cache.set(file, mod);
    mod.filename = file;
    mod.require = request => request.startsWith('./') ? loadSource(request.slice(2)) : require(request);
    mod._compile(compiled.outputText, file);
    return mod.exports;
}
const { createPixelBotReplay } = loadSource('PvpBotReplay');
const { BoardModel } = loadSource('BoardModel');
const { PchConveyorRules } = loadSource('PchConveyorRules');

function verifyActions(level, run) {
    const board = new BoardModel(level);
    const rules = new PchConveyorRules(board, level.conveyorCapacity, level.singleSelectionLimit);
    let index = 0, readyAt = Infinity, peakBuffer = 0;
    for (let time = 50; time <= run.terminalTimeMs; time += 50) {
        if (time >= readyAt) { rules.markQueuedBeansReady(rules.entryCount); readyAt = Infinity; }
        for (let carrier = 0; carrier < rules.carrierCount; carrier++) {
            const from = (carrier + (time - 50) / 250) / rules.carrierCount;
            const to = (carrier + time / 250) / rules.carrierCount;
            if (Math.floor(from) < Math.floor(to)) rules.transferReadyBeansToCarrier(carrier);
            if (Math.floor(from - 0.5) < Math.floor(to - 0.5)) rules.autoPlaceAvailableLayers(carrier);
        }
        assert(!rules.isBufferDeadlocked(), 'saved solution deadlocked');
        const action = run.actions[index];
        if (action?.elapsedMs === time) {
            const block = rules.selectBoard(action.row, action.col);
            assert(block, 'solution must use legal selections');
            assert.equal(block.colorId, action.colorId);
            const moved = rules.storeBlock(block, 0).moved;
            assert.equal(moved, action.moved);
            assert(moved > 0);
            readyAt = Math.max(Number.isFinite(readyAt) ? readyAt : 0, time + 160 + moved * 12);
            index++;
        }
        peakBuffer = Math.max(peakBuffer, rules.bufferCount);
        assert(peakBuffer <= level.conveyorCapacity);
    }
    assert.equal(index, run.actions.length);
    assert(board.isAllLocked(), 'saved solution did not finish the actual board');
    assert.deepEqual(board.currentColors, level.correctColorArr);
    assert.equal(rules.bufferCount, 0);
    return peakBuffer;
}

function main() {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const colors = palette();
    const refs = Array.from({ length: 182 }, (_, i) => JSON.parse(fs.readFileSync(path.join(__dirname, 'dbt', `level_${i + 1}.json`), 'utf8')));
    const profile = shuffle.learnProfile(refs);
    assert.equal(manifest.levels.length, 10);
    assert.equal(new Set(manifest.levels.map(item => item.collectionId)).size, 10);
    const result = [];
    for (const entry of manifest.levels) {
        const raw = fs.readFileSync(path.join(LEVEL_DIR, entry.file));
        assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), entry.sha256);
        const level = JSON.parse(raw);
        assert.equal(level.levelId, entry.levelId);
        assert.equal(level.Hard, 0);
        assert.equal(level.conveyorCapacity, 60);
        assert.equal(level.boardWidth, 64);
        assert.equal(level.boardHeight, 56);
        for (const grid of [level.correctColorArr, level.initRandomColorArr]) {
            assert.equal(grid.length, 56);
            grid.forEach(row => { assert.equal(row.length, 64); row.forEach(v => assert(Number.isInteger(v) && (v === 0 || colors[v]))); });
        }
        assert.equal(level.correctColorArr.flat().filter(Boolean).length, entry.beanCount);
        assert(entry.beanCount > 1000);
        assert.equal(entry.creatorBeanCount, entry.collaboratorBeanCount);
        const halves = [];
        for (let side = 0; side < 2; side++) {
            const half = { ...level, boardWidth: 32,
                correctColorArr: level.correctColorArr.map(row => row.slice(side * 32, side * 32 + 32)),
                initRandomColorArr: level.initRandomColorArr.map(row => row.slice(side * 32, side * 32 + 32)) };
            shuffle.assertOutline(half.correctColorArr, half.initRandomColorArr);
            const inventory = grid => [...shuffle.colorInventory(grid)].sort((a, b) => a[0] - b[0]);
            assert.deepEqual(inventory(half.correctColorArr), inventory(half.initRandomColorArr));
            assert.equal(half.correctColorArr.flat().filter(Boolean).length, entry.beanCount / 2);
            assert.equal(shuffle.matchingCellCount(half.correctColorArr, half.initRandomColorArr), 0, 'no initially completed beans');
            assert.deepEqual(half.initRandomColorArr, shuffle.generate(half.correctColorArr, {
                seed: entry.seeds[side], profile, strictMismatch: true, outlineGrid: half.correctColorArr,
            }));
            const run = createPixelBotReplay(half, `coop-validation-${entry.levelId}-${side}`, { rating: 3000, gamesPlayed: 100 });
            assert.equal(run.terminalType, 'PASS', `${entry.name}/${side}: ${run.terminalType} at ${run.progress}`);
            const peakBuffer = verifyActions(half, run);
            halves.push({ side: side === 0 ? 'creator' : 'collaborator', beanCount: entry.beanCount / 2,
                initialMatches: 0, simulatedSeconds: run.terminalTimeMs / 1000,
                actions: run.actions.length, peakBuffer, metrics: shuffle.metrics(half.correctColorArr, half.initRandomColorArr) });
            const text = JSON.stringify({ levelId: entry.levelId, side, terminalTimeMs: run.terminalTimeMs, actions: run.actions }, null, 2) + '\n';
            const lines = text.match(/[^\n]*\n/g);
            const file = path.join(OUT, `solution_${entry.levelId}_${side}.json`);
            fs.writeFileSync(file, lines.slice(0, 300).join(''));
            for (let i = 300; i < lines.length; i += 300) fs.appendFileSync(file, lines.slice(i, i + 300).join(''));
        }
        result.push({ levelId: entry.levelId, name: entry.name, beanCount: entry.beanCount, halves });
        console.log(`PASS ${entry.name}: ${halves.map(h => `${h.side} ${h.simulatedSeconds}s / peak ${h.peakBuffer}`).join(', ')}`);
    }
    const report = { passed: true, levelCount: 10, halfCount: 20, ruleSource: 'current TypeScript source',
        scope: 'data invariants plus legal action replay; not a device performance test or cooperative runtime integration', levels: result };
    const lines = (JSON.stringify(report, null, 2) + '\n').match(/[^\n]*\n/g);
    fs.writeFileSync(path.join(OUT, 'validation.json'), lines.slice(0, 300).join(''));
    for (let i = 300; i < lines.length; i += 300) fs.appendFileSync(path.join(OUT, 'validation.json'), lines.slice(i, i + 300).join(''));
}

if (require.main === module) main();
