#!/usr/bin/env node
// Generate level files for levels 11-99
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'LevelData');

// Colors: 0=empty, 1=red, 2=orange, 3=yellow, 4=green, 5=blue
const COLORS = [1, 2, 3, 4, 5];

function seededRandom(seed) {
    let s = seed;
    return function() {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    };
}

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function makeGrid(w, h, val = 0) {
    return Array.from({length: h}, () => Array(w).fill(val));
}

// Shape generators - each returns a grid with colored pixels
function drawCircle(grid, cx, cy, r, color) {
    const h = grid.length, w = grid[0].length;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r)
                grid[y][x] = color;
}

function drawRect(grid, x1, y1, x2, y2, color) {
    for (let y = y1; y <= y2; y++)
        for (let x = x1; x <= x2; x++)
            if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length)
                grid[y][x] = color;
}

function drawTriangle(grid, cx, cy, size, color, direction = 'up') {
    const h = grid.length, w = grid[0].length;
    for (let dy = 0; dy < size; dy++) {
        const row = direction === 'up' ? cy - dy : cy + dy;
        const half = Math.round(dy * size / size);
        for (let dx = -half; dx <= half; dx++) {
            const col = cx + dx;
            if (row >= 0 && row < h && col >= 0 && col < w)
                grid[row][col] = color;
        }
    }
}

function drawDiamond(grid, cx, cy, r, color) {
    const h = grid.length, w = grid[0].length;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            if (Math.abs(x - cx) + Math.abs(y - cy) <= r)
                grid[y][x] = color;
}

function drawHeart(grid, cx, cy, size, color) {
    const h = grid.length, w = grid[0].length;
    const r = size * 0.3;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const dx = (x - cx) / size, dy = (y - cy) / size;
            const inTop = ((dx - 0.3) ** 2 + (dy + 0.2) ** 2 <= r * r) ||
                          ((dx + 0.3) ** 2 + (dy + 0.2) ** 2 <= r * r);
            const inBot = (Math.abs(dx) + (dy - 0.1) <= 0.5) && dy >= -0.15;
            if (inTop || inBot) grid[y][x] = color;
        }
}

function drawStar(grid, cx, cy, r, color) {
    const h = grid.length, w = grid[0].length;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const dx = x - cx, dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const armAngle = ((angle + Math.PI) / (2 * Math.PI)) * 5;
            const armDist = r * (0.4 + 0.6 * Math.abs(Math.cos(armAngle * Math.PI)));
            if (dist <= armDist) grid[y][x] = color;
        }
}

function drawCross(grid, cx, cy, size, thickness, color) {
    drawRect(grid, cx - thickness, cy - size, cx + thickness, cy + size, color);
    drawRect(grid, cx - size, cy - thickness, cx + size, cy + thickness, color);
}

// Outline: replace border cells with outline color
function addOutline(grid, outlineColor) {
    const h = grid.length, w = grid[0].length;
    const result = grid.map(r => [...r]);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            if (grid[y][x] !== 0) {
                const neighbors = [[-1,0],[1,0],[0,-1],[0,1]];
                for (const [dy, dx] of neighbors) {
                    const ny = y + dy, nx = x + dx;
                    if (ny < 0 || ny >= h || nx < 0 || nx >= w || grid[ny][nx] === 0) {
                        result[y][x] = outlineColor;
                        break;
                    }
                }
            }
        }
    return result;
}

// Generate a pattern for a given level
function generatePattern(levelId, boardSize, rng) {
    const grid = makeGrid(boardSize, boardSize);
    const cx = Math.floor(boardSize / 2);
    const cy = Math.floor(boardSize / 2);

    const numColors = levelId < 30 ? 3 : levelId < 60 ? 4 : 5;
    const colors = COLORS.slice(0, numColors);
    const pick = () => colors[Math.floor(rng() * colors.length)];
    const pickOther = (c) => { const opts = colors.filter(x => x !== c); return opts[Math.floor(rng() * opts.length)]; };

    const patternType = levelId % 12;
    const mainColor = colors[Math.floor(rng() * colors.length)];
    const outlineColor = pickOther(mainColor);
    const bgColor = 0;

    const sz = Math.floor(boardSize * 0.4);

    switch (patternType) {
        case 0: drawCircle(grid, cx, cy, sz, mainColor); break;
        case 1: drawDiamond(grid, cx, cy, sz, mainColor); break;
        case 2: drawHeart(grid, cx, cy, boardSize * 0.45, mainColor); break;
        case 3: drawStar(grid, cx, cy, sz, mainColor); break;
        case 4: { const t = Math.max(1, Math.floor(sz * 0.3)); drawCross(grid, cx, cy, sz, t, mainColor); break; }
        case 5: {
            const off = Math.floor(boardSize * 0.2);
            drawCircle(grid, cx - off, cy, Math.floor(sz * 0.7), mainColor);
            drawCircle(grid, cx + off, cy, Math.floor(sz * 0.7), pickOther(mainColor));
            break;
        }
        case 6: {
            const s2 = Math.floor(sz * 0.5);
            drawRect(grid, cx - sz, cy - sz, cx + sz, cy + sz, mainColor);
            drawRect(grid, cx - s2, cy - s2, cx + s2, cy + s2, pickOther(mainColor));
            break;
        }
        case 7: {
            for (let row = 0; row < boardSize; row++) {
                const halfW = Math.floor((row / boardSize) * sz);
                for (let dx = -halfW; dx <= halfW; dx++) {
                    const col = cx + dx;
                    if (col >= 0 && col < boardSize) grid[row][col] = mainColor;
                }
            }
            break;
        }
        case 8: {
            drawCircle(grid, cx, cy, sz, mainColor);
            drawCircle(grid, cx, cy, Math.floor(sz * 0.5), bgColor);
            break;
        }
        case 9: {
            const aw = Math.floor(sz * 0.4);
            drawRect(grid, cx - sz, cy - aw, cx, cy + aw, mainColor);
            for (let dy = -sz; dy <= sz; dy++) {
                const rowW = sz - Math.abs(dy);
                for (let dx = 0; dx <= rowW; dx++) {
                    const col = cx + dx;
                    if (col < boardSize && cy + dy >= 0 && cy + dy < boardSize)
                        grid[cy + dy][col] = mainColor;
                }
            }
            break;
        }
        case 10: {
            const off = Math.floor(boardSize * 0.2);
            const r = Math.floor(sz * 0.5);
            drawCircle(grid, cx - off, cy - off, r, colors[0 % colors.length]);
            drawCircle(grid, cx + off, cy - off, r, colors[1 % colors.length]);
            drawCircle(grid, cx - off, cy + off, r, colors[2 % colors.length]);
            drawCircle(grid, cx + off, cy + off, r, colors[3 % colors.length]);
            break;
        }
        case 11: {
            drawCircle(grid, cx, cy, sz, mainColor);
            drawCircle(grid, cx + Math.floor(sz * 0.4), cy - Math.floor(sz * 0.2), Math.floor(sz * 0.7), bgColor);
            break;
        }
    }

    // Colorize interior: assign stripes/zones of different colors to ensure
    // no single color dominates (needed for 95%+ shuffle displacement)
    colorizeInterior(grid, colors, rng);

    return addOutline(grid, outlineColor);
}

// Re-color interior (non-zero, non-border) cells into balanced color stripes
function colorizeInterior(grid, colors, rng) {
    const h = grid.length, w = grid[0].length;
    // Identify interior cells (non-zero cells not adjacent to a 0)
    const interior = [];
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            if (grid[y][x] === 0) continue;
            let isBorder = false;
            for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                const ny = y + dy, nx = x + dx;
                if (ny < 0 || ny >= h || nx < 0 || nx >= w || grid[ny][nx] === 0)
                    { isBorder = true; break; }
            }
            if (!isBorder) interior.push({y, x});
        }

    if (interior.length < 4) return;

    // Use diagonal stripes for balanced coloring
    const stripeWidth = Math.max(2, Math.floor(Math.sqrt(interior.length) / colors.length));
    const offset = Math.floor(rng() * 100);
    for (const {y, x} of interior) {
        const stripe = Math.floor((x + y + offset) / stripeWidth) % colors.length;
        grid[y][x] = colors[stripe];
    }
}

// Shuffle non-zero cells ensuring >=95% are displaced from correct position
// while preserving the shape (0 stays 0, non-zero stays non-zero)
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

    // Strategy: circular shift by color group to guarantee displacement.
    // Group cells by color, then rotate assignments so each cell gets
    // a color from a different group.
    const colorGroups = {};
    for (let i = 0; i < total; i++) {
        const c = cells[i].orig;
        if (!colorGroups[c]) colorGroups[c] = [];
        colorGroups[c].push(i);
    }
    const colorKeys = Object.keys(colorGroups).map(Number);

    if (colorKeys.length >= 2) {
        // Build displaced assignment: shift color groups cyclically
        // Each position that had color A now gets color B, B->C, ..., last->A
        const vals = new Array(total);
        for (let ci = 0; ci < colorKeys.length; ci++) {
            const srcColor = colorKeys[ci];
            const dstColor = colorKeys[(ci + 1) % colorKeys.length];
            const srcIndices = colorGroups[srcColor];
            // These positions originally had srcColor, now assign dstColor
            for (const idx of srcIndices) {
                vals[idx] = dstColor;
            }
        }
        // Now shuffle within each NEW color group to add randomness
        // while maintaining the color counts and 100% displacement
        const newGroups = {};
        for (let i = 0; i < total; i++) {
            if (!newGroups[vals[i]]) newGroups[vals[i]] = [];
            newGroups[vals[i]].push(i);
        }
        for (const indices of Object.values(newGroups)) {
            // Fisher-Yates shuffle of positions within same color
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [vals[indices[i]], vals[indices[j]]] = [vals[indices[j]], vals[indices[i]]];
            }
        }

        // Count correct placements
        let correct = 0;
        for (let i = 0; i < total; i++)
            if (vals[i] === cells[i].orig) correct++;

        if (correct <= maxCorrect) {
            for (let i = 0; i < total; i++)
                result[cells[i].y][cells[i].x] = vals[i];
            return result;
        }
    }

    // Fallback: repeated Fisher-Yates with forced swaps
    const vals = cells.map(c => c.orig);
    for (let attempt = 0; attempt < 500; attempt++) {
        for (let i = vals.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [vals[i], vals[j]] = [vals[j], vals[i]];
        }
        let correct = 0;
        for (let i = 0; i < total; i++)
            if (vals[i] === cells[i].orig) correct++;
        if (correct <= maxCorrect) {
            for (let i = 0; i < total; i++)
                result[cells[i].y][cells[i].x] = vals[i];
            return result;
        }
    }

    // Last resort: force swap any remaining correct ones
    for (let i = 0; i < total; i++) {
        if (vals[i] === cells[i].orig) {
            for (let j = (i + 1) % total; j !== i; j = (j + 1) % total) {
                if (vals[j] !== cells[i].orig && vals[i] !== cells[j].orig) {
                    [vals[i], vals[j]] = [vals[j], vals[i]];
                    break;
                }
            }
        }
    }
    for (let i = 0; i < total; i++)
        result[cells[i].y][cells[i].x] = vals[i];
    return result;
}

function countNonZero(grid) {
    let c = 0;
    for (const row of grid) for (const v of row) if (v !== 0) c++;
    return c;
}

// Main generation
for (let levelId = 11; levelId <= 99; levelId++) {
    const t = (levelId - 11) / (99 - 11); // 0..1
    const boardSize = lerp(13, 32, t);
    const timeLimit = lerp(400, 2200, t);
    const rng = seededRandom(levelId * 7919 + 42);

    const correctColorArr = generatePattern(levelId, boardSize, rng);
    const slots = countNonZero(correctColorArr);
    const slotTotalCount = Math.max(12, Math.min(slots, lerp(14, 500, t)));
    const initRandomColorArr = shuffleGrid(correctColorArr, rng);

    const levelData = {
        levelId,
        boardWidth: boardSize,
        boardHeight: boardSize,
        timeLimit,
        slotTotalCount,
        correctColorArr,
        initRandomColorArr
    };

    const filePath = path.join(OUT_DIR, `level_${levelId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(levelData, null, 4) + '\n');
}

console.log('Generated levels 11-99');
