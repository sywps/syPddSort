#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'assets', 'RemoteBundle', 'LevelData');

function seededRandom(seed) {
    let s = seed;
    return function() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function rebalanceColors(grid, rng) {
    const h = grid.length, w = grid[0].length;
    const filled = [];
    const colorSet = new Set();
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            if (grid[y][x] !== 0) { filled.push({y, x}); colorSet.add(grid[y][x]); }
    if (filled.length < 2 || colorSet.size < 2) return;
    const colors = [...colorSet].sort((a,b) => a-b);
    for (let i = filled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [filled[i], filled[j]] = [filled[j], filled[i]];
    }
    for (let i = 0; i < filled.length; i++)
        grid[filled[i].y][filled[i].x] = colors[i % colors.length];
}

function shuffleGrid(grid, rng) {
    const h = grid.length, w = grid[0].length;
    const result = grid.map(r => [...r]);
    const cells = [];
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            if (grid[y][x] !== 0) cells.push({y, x, orig: grid[y][x]});
    const total = cells.length;
    if (total < 2) return result;
    const maxCorrect = Math.floor(total * 0.05);
    const vals = cells.map(c => c.orig);
    for (let i = vals.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [vals[i], vals[j]] = [vals[j], vals[i]];
    }
    for (let pass = 0; pass < 100; pass++) {
        const correctIdx = [];
        for (let i = 0; i < total; i++)
            if (vals[i] === cells[i].orig) correctIdx.push(i);
        if (correctIdx.length <= maxCorrect) break;
        let improved = false;
        for (const ci of correctIdx) {
            if (vals[ci] !== cells[ci].orig) continue;
            const start = Math.floor(rng() * total);
            for (let k = 0; k < total; k++) {
                const j = (start + k) % total;
                if (j === ci || vals[j] === cells[j].orig) continue;
                if (vals[j] !== cells[ci].orig && vals[ci] !== cells[j].orig) {
                    [vals[ci], vals[j]] = [vals[j], vals[ci]];
                    improved = true; break;
                }
            }
        }
        if (!improved) {
            for (let a = 0; a < correctIdx.length - 1; a++) {
                const i = correctIdx[a];
                if (vals[i] !== cells[i].orig) continue;
                for (let b = a + 1; b < correctIdx.length; b++) {
                    const j = correctIdx[b];
                    if (vals[j] !== cells[j].orig) continue;
                    if (vals[i] !== vals[j]) {
                        [vals[i], vals[j]] = [vals[j], vals[i]];
                        improved = true; break;
                    }
                }
                if (improved) break;
            }
        }
        if (!improved) break;
    }
    for (let i = 0; i < total; i++)
        result[cells[i].y][cells[i].x] = vals[i];
    return result;
}

let fixed = 0;
for (let lvl = 100; lvl <= 172; lvl++) {
    const f = path.join(DIR, `level_${lvl}.json`);
    if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const rng = seededRandom(lvl * 7919 + 42);
    rebalanceColors(d.correctColorArr, rng);
    d.initRandomColorArr = shuffleGrid(d.correctColorArr, rng);
    fs.writeFileSync(f, JSON.stringify(d, null, 4) + '\n');
    fixed++;
}
console.log(`Fixed ${fixed} levels (100-172)`);
