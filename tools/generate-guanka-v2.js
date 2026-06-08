#!/usr/bin/env node
// Generates 200 levels of warm-toned Chinese-style pixel bead puzzles
// Key design principles from studying existing levels:
// 1. One outline color traces shape contours (1-2 cells wide)
// 2. One dominant fill color covers 30-47% of non-zero cells
// 3. 1-2 rare detail colors as "jewel" accents (1-5%)
// 4. Power-law color distribution, NOT flat
// 5. Intentional negative space with 1-cell padding
// 6. Asymmetric but organic patterns

const fs = require('fs');
const path = require('path');

// ============================================================
// Seeded PRNG
// ============================================================
function mulberry32(a) {
    return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const S = (g, y, x, c) => { if (y >= 0 && y < g.length && g[y] && x >= 0 && x < g[y].length) g[y][x] = c; };

// ============================================================
// Shape drawing helpers
// ============================================================

// Draw a filled ellipse with a specific color
function drawEllipse(g, cx, cy, rx, ry, c) {
    for (let y = 0; y < g.length; y++) {
        for (let x = 0; x < g[0].length; x++) {
            if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) S(g, y, x, c);
        }
    }
}

// Draw an ellipse outline
function drawEllipseOutline(g, cx, cy, rx, ry, c) {
    for (let y = 0; y < g.length; y++) {
        for (let x = 0; x < g[0].length; x++) {
            let d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
            if (d >= 0.85 && d <= 1.15) S(g, y, x, c);
        }
    }
}

// Draw a filled rectangle
function drawRect(g, x1, y1, x2, y2, c) {
    for (let y = Math.max(0, y1); y <= Math.min(g.length - 1, y2); y++)
        for (let x = Math.max(0, x1); x <= Math.min(g[0].length - 1, x2); x++)
            S(g, y, x, c);
}

// Draw a line
function drawLine(g, x1, y1, x2, y2, c, thick) {
    thick = thick || 1;
    let dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    let sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    let err = dx - dy, x = x1, y = y1;
    while (true) {
        for (let dy2 = -thick; dy2 <= thick; dy2++)
            for (let dx2 = -thick; dx2 <= thick; dx2++)
                S(g, y + dy2, x + dx2, c);
        if (x === x2 && y === y2) break;
        let e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
    }
}

// Draw a filled polygon from point list
function drawPoly(g, points, c) {
    if (points.length < 3) return;
    let h = g.length, w = g[0].length;
    let minY = Math.max(0, Math.min(...points.map(p => p[1])));
    let maxY = Math.min(h - 1, Math.max(...points.map(p => p[1])));
    for (let y = minY; y <= maxY; y++) {
        let intersections = [];
        for (let i = 0; i < points.length; i++) {
            let j = (i + 1) % points.length;
            let [x1, y1] = points[i], [x2, y2] = points[j];
            if (y1 === y2) continue;
            if (y >= Math.min(y1, y2) && y < Math.max(y1, y2)) {
                let xi = x1 + (y - y1) / (y2 - y1) * (x2 - x1);
                intersections.push(xi);
            }
        }
        intersections.sort((a, b) => a - b);
        for (let i = 0; i < intersections.length - 1; i += 2) {
            let xStart = Math.max(0, Math.ceil(intersections[i]));
            let xEnd = Math.min(w - 1, Math.floor(intersections[i + 1]));
            for (let x = xStart; x <= xEnd; x++)
                S(g, y, x, c);
        }
    }
}

// Flood fill
function floodFill(g, startY, startX, newColor) {
    let h = g.length, w = g[0].length;
    let stack = [[startY, startX]];
    let visited = new Set();
    while (stack.length > 0) {
        let [y, x] = stack.pop();
        let key = y * w + x;
        if (visited.has(key)) continue;
        if (y < 0 || y >= h || x < 0 || x >= w) continue;
        if (g[y][x] !== 0) continue;
        visited.add(key);
        g[y][x] = newColor;
        stack.push([y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]);
    }
}

// Get all non-zero cells of a color
function getCellsOfColor(g, c) {
    let cells = [];
    for (let y = 0; y < g.length; y++)
        for (let x = 0; x < g[0].length; x++)
            if (g[y][x] === c) cells.push([y, x]);
    return cells;
}

// Dilate a shape (expand by 1 cell in all directions)
function dilate(g, color) {
    let h = g.length, w = g[0].length;
    let newCells = [];
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            if (g[y][x] === color)
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++) {
                        let ny = y + dy, nx = x + dx;
                        if (ny >= 0 && ny < h && nx >= 0 && nx < w && g[ny][nx] === 0) newCells.push([ny, nx]);
                    }
    for (let [y, x] of newCells) S(g, y, x, color);
}

// Create an outline around a filled shape by changing boundary cells to outline color
function makeOutline(g, bodyColor, outlineColor) {
    let h = g.length, w = g[0].length;
    let outline = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (g[y][x] === bodyColor) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dy === 0 && dx === 0) continue;
                        let ny = y + dy, nx = x + dx;
                        if (ny < 0 || ny >= h || nx < 0 || nx >= w || g[ny][nx] === 0) {
                            outline.push([y, x]);
                            dy = 2; break;
                        }
                    }
                }
            }
        }
    }
    for (let [y, x] of outline) g[y][x] = outlineColor;
}

// Add detail patches inside a shape - small regions of different colors
function addDetailPatches(g, bodyColor, detailColor, rng, count) {
    // Collect body cells once
    let bodyCells = [];
    for (let y = 0; y < g.length; y++)
        for (let x = 0; x < g[0].length; x++)
            if (g[y][x] === bodyColor) bodyCells.push([y, x]);

    for (let i = 0; i < count && bodyCells.length > 0; i++) {
        let idx = Math.floor(rng() * bodyCells.length);
        let [cy, cx] = bodyCells[idx];
        let size = 1 + Math.floor(rng() * 2); // smaller patches for speed
        for (let dy = -size; dy <= size; dy++)
            for (let dx = -size; dx <= size; dx++)
                if (dx * dx + dy * dy <= size * size + 1 && g[cy + dy] && g[cy + dy][cx + dx] === bodyColor)
                    g[cy + dy][cx + dx] = detailColor;
    }
}

// Add sparse rare detail pixels
function addRarePixels(g, bodyColor, rareColor, rng, count) {
    // Collect body cells once
    let bodyCells = [];
    for (let y = 0; y < g.length; y++)
        for (let x = 0; x < g[0].length; x++)
            if (g[y][x] === bodyColor) bodyCells.push([y, x]);

    let used = new Set();
    for (let i = 0; i < count && bodyCells.length > 0; i++) {
        let idx = Math.floor(rng() * bodyCells.length);
        let [cy, cx] = bodyCells[idx];
        let key = cy * 1000 + cx;
        if (used.has(key)) { i--; continue; }
        used.add(key);
        S(g, cy, cx, rareColor);
    }
}

// ============================================================
// Template system: define shapes as string patterns
// ============================================================
// Characters: '.' = empty, letters = colors mapped by the generator
// Each template has: pattern string, width, color mapping, and theme info

function parseTemplate(str, w) {
    let rows = str.trim().split('\n').map(r => r.trim());
    let grid = [];
    for (let row of rows) {
        let r = [];
        for (let ch of row) {
            if (ch === '.' || ch === '0') r.push(0);
            else r.push(ch.charCodeAt(0) - 96); // a=1, b=2, c=3, ...
        }
        grid.push(r);
    }
    // Pad to target height if needed
    while (grid.length < rows.length) {
        grid.push(new Array(w).fill(0));
    }
    return grid;
}

// ============================================================
// Template definitions for all 200 levels
// Each template uses letters a-z for colors (a=1, b=2, etc.)
// and '.' for empty space.
// ============================================================

const TEMPLATES = {};

// --- Wave 1: 8x8 area, 2-3 colors, simple shapes ---
TEMPLATES[1] = `  // 爱心 - two touching blobs
..aaaa.bbbb.
.aaaaa.bbbb.
.aaaaa.bbbb.
..aaaa.bbbb.
...aaa.bbb..
...aaa.bbb..
....aa.bb...
`;

TEMPLATES[2] = `  // 五角星 - star-like pattern
.....aa.....
....aaaaa...
..aaaaaaaaa.
.aaaaaaaaaa.
.aaa.bbb.aaa
..aaa.bbb.aa
...aaa.bbb..
..aaaa.bbbb.
..aaa...aaa.
`;

TEMPLATES[3] = `  // 弯月 - crescent moon
....aaaaaa..
...aaaaaaaa.
..aaaaaaaab.
.aaaaaaaaabb
.aaaaaaaaabb
..aaaaaaaab.
...aaaaaaa..
....aaaaa...
`;

TEMPLATES[4] = `  // 云朵 - cloud cluster
..aaaaaaa...
.aaaaaaaaaa.
.aaaa.bbbbb.
aaaaaaaaaaaa
.aaaa.bbbbb.
..aaaaaa....
...ccccc....
`;

// --- Wave 2: 10x10 area, 3-4 colors ---
TEMPLATES[5] = `  // 小福字 - character-like pattern
...aaaaaaa..
..aabbbbbba.
..abcccccba.
..abcccccba.
..abcccccba.
..abcccccba.
..abcccccba.
..abcccccba.
..aabbbbbba.
...aaaaaaa..
`;

TEMPLATES[6] = `  // 小灯笼 - lantern
....aaaa....
...aabbaa...
..abcccbaa..
..abcccbaa..
..abcccbaa..
...aabbaa...
....aaaa....
....a..a....
...aa..aa...
`;

TEMPLATES[7] = `  // 小花 - flower with petals
....aaaa....
..aabbbbaa..
.abcccccbaa.
abcccbcccba.
abcccbcccba.
.abcccccbaa.
..aabbbbaa..
....aaaa....
...aaaaaa...
..aa....aa..
`;

TEMPLATES[8] = `  // 平安扣 - concentric rings
...aaaaaa...
..abbbbbbaa.
.abcccccbba.
abcdcdddcba.
abcdcdddcba.
.abcccccbba.
..abbbbbbaa.
...aaaaaa...
`;

TEMPLATES[9] = `  // 中国结 - Chinese knot pattern
..aaaaaaa...
.abbbbbbaa..
.abcccccba..
abcdcdddcba.
abcdcdddcba.
.abcccccba..
.abbbbbbaa..
..aaaaaaa...
...aaaaa....
..aa...aa...
`;

TEMPLATES[10] = `  // 金元宝 - gold ingot
...aaaaaa...
..abbbbbba..
.abcccccbaa.
abcccddccba.
abcccddccba.
.abcccccbaa.
..abbbbbba..
...aaaaaa...
..aaaaa...aa
.aaa......aa
`;

// --- Wave 3: 12x12 area, 4-5 colors ---
TEMPLATES[11] = `  // 小锦鲤 - koi fish
....aaaaaa..
...aaaaaaaa.
..aa.bbbbbba.
..abcccccbba.
.abccddcccbba
abcccdcccccba
abccccccccba.
.abcccccbbba.
..abbbbbbbba.
...aaaaaaaa..
....aaaaa....
...........
`;

TEMPLATES[12] = `  // 折扇 - folding fan
..........aa..
.........aaa..
........aaaa..
.......aaaaa..
......aaaaaa..
.....aaaaaaaa.
....aaaaaaaaa.
...abbbbbbbbba.
..abcccccccbba.
.abccddcccbbba.
abccddcccbbbba.
abccddcccbbbba.
`;

TEMPLATES[13] = `  // 茶壶 - teapot
....aaaaaa....
...abbbbbbaa..
..abcccccbbaa.
.abcccddccbbba
abcccddcccbbba
abcccccbbbbaaa
.abccccbbbaaa.
..abbbbbbbaa..
...aaaaaaa....
...a.....a....
..aa.....aa...
.aaa.....aaa..
`;

TEMPLATES[14] = `  // 梅花 - plum blossom
....aaaa......
...aaaaaaaa...
..aabbbbaaaa..
.abcccccbbbaa.
abccddcccbbaa.
abccddcccbbba.
.abcccccbbbaa.
..aabbbbaaaa..
...aaaaaaaa...
....aaaa......
.....aa.......
....a..a......
`;

TEMPLATES[15] = `  // 熊猫头像 - panda face (BOSS)
..aaaaaa.aaaaa.
.abbbbbbabbbbb.
abcccccbbcccccba
abccddcbccddccba
abcccddccddcccba
abcccccccccccbba
.abccbccbcccbba.
.abcccccccccbba.
..abcccccccbba..
...abbbbbbbba...
....aaaaaaaa....
......aaaa......
`;

TEMPLATES[16] = `  // 玉如意 - jade ruyi
....aaaa......
...abbbbaa....
..abccccbaa...
.abcccddccba..
abcccddcccbaa.
abcccccbbbbaaa
.abcccccbbbaa.
..abbbbbbbba..
...aaaaaaa....
..aaaaaaa.....
.aaaaaaaa.....
aaaaaaaa......
`;

TEMPLATES[17] = `  // 祥云纹 - auspicious cloud pattern
..aaaaaa.......aaaaaaa
.abbbbbbaa..aabbbbbbaa
abcccccbbaaabbcccccbba
abcdcddcddccdcddcdcbba
abcccccbbaaabbcccccbba
.abbbbbbaa..aabbbbbbaa
..aaaaaa.......aaaaaaa
`;

TEMPLATES[18] = `  // 山纹 - mountain pattern
.......aaaaaaa.......
......abbbbbbaa......
.....abccccccbba.....
....abcccddcccbba....
...abcccdcdcccbbaa...
..abcccdcdcddccbba...
.abcccdcdcddcdccbbaa.
abcccdcdcddcdcdcbbba.
`;

TEMPLATES[19] = `  // 水波纹 - water wave pattern
.aaaaaa.........aaaaa
abbbbbbbaaaaaaaaabbbb
abcccccbcccccccbccccc
abcdcddcdcdcddcdcddcd
abcccccbbccccbbbccccb
.abbbbbbbabbbbbbbbbb.
..aaaaaaa.aaaaaaaaa..
`;

TEMPLATES[20] = `  // 古风窗纹 - ancient window lattice
.aaaaaaaaaaaaaaaa.
.abbbabbabbabbabbba.
abbccbbccbbccbbccbba
abbcdbbcddbbcddbbcba
abbccbbccbbccbbccbba
.abbbabbabbabbabbba.
.aaaaaaaaaaaaaaaa.
.abbbabbabbabbabbba.
abbccbbccbbccbbccbba
abbcdbbcddbbcddbbcba
abbccbbccbbccbbccbba
.abbbabbabbabbabbba.
.aaaaaaaaaaaaaaaa.
`;

// --- Wave 4: 14x14 area, 5-6 colors ---
TEMPLATES[21] = `  // 兔子 - rabbit
...aaaa.........aaaa...
..abbbbaa.....aabbbbaa.
.abcccccbba..abcccccbba
abccddcccbbaabccddcccba
abccccccccccabcccccccba
abccccccccccabcccccccba
.abccccccccabccccccbba.
..abccccccccaabcccccba.
...abbbbbbbb..abbbbba..
....aaaaaa....aaaaaa...
.......aaaaaa..........
`;

TEMPLATES[22] = `  // 小猫 - kitten
.aaa........aaa.
abbbbaaa..aaaabbbba
abccccccccccccccbba
abccddccddccddccba
abcccdcccdcccdccba
abcccccccccccccbba
.abccccccccccccba.
..abccccccccccba..
...abbbbbbbbba....
....aaaaaaaa.....
.....aaaaa.......
.....aa.aa.......
`;

TEMPLATES[23] = `  // 柿子 - persimmon
...aaaaaaaaaaa...
..abbbbbbbbbbbba.
.abcccccccccccbba
abcdcddccddcdccba
abcdcdcddcdcdccba
abcdcdcddcdcdccba
abcccccbbcccccbbba
.abbbbbbbabbbbbba.
..aaaaaaaaaaaaaa.
...aaaaaaaaaaa...
....aaaaaaaaa....
`;

TEMPLATES[24] = `  // 橘子 - tangerine
...aaaaaaaaaa...
..abbbbbbbbbbbba.
.abcccccccccccbba
abcdcddccddcdccba
abcdcdcddcdcdccba
abcdcdcddcdcdccba
abcdcdcddcdcdccba
abcccccccccccccba
.abbbbbbbbbbbbbba.
..aaaaaaaaaaaaaaa.
...aaaaaaaaaaaa...
....aaaaaaaaa....
`;

TEMPLATES[25] = `  // 古风花瓶 - ancient vase (BOSS)
......aaaaaa......
.....abbbbbbaa....
....abcccccbbaa...
...abcccddccbaaa..
..abcccdcdccbbbaaa.
.abcccdcdcdbbbbaaa.
abcccdcdcddcccbbbaa
abcccddccddcccbbbba
abccccccccccccbbbaa
abcccbbccbbcccbbbba
.abbbbbbbaabbbbbbba
..aaaaaaaa..aaaaaa.
...aaaaaa...aaaaaa.
...aaaa.....aaaa...
`;

TEMPLATES[26] = `  // 荷叶 - lotus leaf
....aaaaaaaaaaaa...
...abbbbbbbbbbbbaa.
..abcccccccccccbba.
.abcccddccddcccbaa.
abcccdcdcddcdcccba.
abcccccccccccccbba.
.abcccccbbcccccbaa.
..abbbbbbbabbbbbba.
...aaaaaaaaaaaaaa..
....aaaaaaaaaaaa...
.....aaaaaaaaaa....
`;

TEMPLATES[27] = `  // 莲蓬 - lotus seed pod
....aaaaaaaaaa....
...abbbbbbbbbbba..
..abccccccccccbaa.
.abcccdcdccdcdbbaa
abcdcdcddcdcddcbaa
abcdcdcdcddcdcdbbaa
abcccccccccccccbbaa
.abbbbbbbbbbbbbbaa.
..aaaaaaaaaaaaaaa..
...aaaaaaaaaaaa...
....aaaaaaaaaa....
`;

TEMPLATES[28] = `  // 竹子 - bamboo
..aaaa..aaaa..aaaa..
.abbbba.abbbba.abbbba.
abccccbaabccccbaabcccba
abccddbaabccddbaabccddba
abccddbaabccddbaabccddba
abccccbaabccccbaabcccba
.abbbba.abbbba.abbbba.
..aaaa..aaaa..aaaa..
..aaaa..aaaa..aaaa..
.abbbba.abbbba.abbbba.
abccccbaabccccbaabcccba
`;

TEMPLATES[29] = `  // 兰花 - orchid
......aaaa........
.....abbbba.......
....abccccba......
...abcccddcba.....
..abcccdcdcba.....
.abcccdcdcccba....
abcccdcddccccba...
abcccccccccccba...
.abcccccbbccccba..
..abbbbbbabbbbba..
...aaaaaaaaaaaa...
....aaaaaaaa......
.....aaaa.........
`;

TEMPLATES[30] = `  // 玉佩套装 - jade pendant set (BOSS)
......aaaaaaa......
.....abbbbbbaa....
....abcccccbbaa...
...abccddccbaaa..
..abccddcccbaaa..
.abccccccccbaaa.
abccccccccccbaaa.
abcccbcccccbbbaa.
.abbbbbbabcbbbaa.
..aaaaaa.aacbaa.
..........abbaa.
.........abccba.
........abcccba.
.......abccccba.
......abcccccba.
`;

// --- Wave 5: 16x16 area, 6-8 colors ---
TEMPLATES[31] = `  // 小亭子 - pavilion
.......aaaaaaaa.......
......abbbbbbbba......
.....abccccccccba.....
....abcccddcccbaa.....
...abcccdcdcccbaa.....
..abcccccccccccbba.....
.abbbbbbbabbbbbbbba...
.aaaaaaaa.aaaaaaaa...
.....a.......a........
.....a.......a........
.....a.......a........
.....a.......a........
.....a.......a........
....aa.......aa.......
...aaa.......aaa......
..aaaa.......aaaa.....
`;

TEMPLATES[32] = `  // 小桥 - small bridge
................
....aaaaaa......
...abbbbbbaa....
..abcccccbbaaa..
.abcccdcccbbaaaaa
abcccccbbbaaaaaaa
abcccccbbbaaaaaaa
.abbbbbbbaaaaaaa.
..aaaaaaaaaaaaaa.
...aaaaaaaaaaaa.
...aaaa..aaaaaa.
...aaa....aaaaa.
...aaa.....aaaa.
...aa......aaa..
...aa......aaa..
...a........aa..
`;

TEMPLATES[33] = `  // 牡丹简形 - peony
.....aaaaaaaaaaa..
....abbbbbbbbbbaa.
...abcccccccccbba.
..abcccddcccddcba.
.abcccdcdcdcdccba.
abcccdcdcddcdcdba
abcccccccccccccbba
abcccccbbcccccbbba
.abbbbbbbabbbbbbaa
..aaaaaaaaaaaaaaa.
...aaaaaaaaaaaaa..
....aaaaaaaaaaaa..
.....aaaaaaaaaaa..
`;

TEMPLATES[34] = `  // 菊花 - chrysanthemum
......aaaaaa......
.....abbbbbaa....
....abcccccbba...
...abcccddccba...
..abcccdcdcccba..
.abcccdcdcccccba.
abcccdcddccccccba
abccccccccccccba.
.abcccccbbccccba.
..abbbbbbbabbbba.
...aaaaaaaaaaaa.
....aaaaaaaaaa..
.....aaaaaaaa...
`;

TEMPLATES[35] = `  // 完整锦鲤 - full koi (BOSS)
.......aaaaaaaaa......
......abbbbbbbbbba....
.....abcccccccccbba...
....abcccddcccddcbba..
...abcccdcdcdcdccbaa.
..abcccdcdcddcdcbbba.
.abcccdcdcdcddccbbba.
abcccccccccccccccbaa.
abcccccbccccbccccbaa.
.abccccbbcccbcccbbaa.
..abbbbbaabbcbabbbaa.
...aaaaaaa.aaaaaa...
.......aaa..........
`;

TEMPLATES[36] = `  // 仙鹤简形 - crane
........aaaa........
.......abbbba.......
......abccccba......
.....abcccddcba.....
....abcccdcdccba....
...abccccccccba.....
..abccccccccbaa.....
.abcccccbbccbaaa....
abbbbbbbabbbbbaaa...
aaaaaaaaaaaaaaaaaa..
.....a........aa....
.....a.........a....
.....aa........a....
......aa......aa....
.......aaaaaaaa.....
`;

TEMPLATES[37] = `  // 鹿纹 - deer
.....aaa.........
....abbbbaa......
...abccccbaa.....
..abccddccbaaa...
.abccddcccbaaaaa.
abccccccccbaaaaa.
abccccccccbaaaaa.
.abcccccbbbaaaa..
..abbbbbbbbbaaa..
...aaaaaaaaaaaa..
......aaaaaa.....
.....aaaaaaa.....
....aaaaaaaaa....
...aaaaaaaaaa....
..aaaaaaaaaaaa...
.aaaaaaaaaaaaaa..
`;

TEMPLATES[38] = `  // 福袋 - lucky pouch
....aaaaaaaaaa....
...abbbbbbbbbbba..
..abccccccccccbaa.
.abcccddcccddcbba.
abcccdcdccddcccba.
abcccccbbccccccba.
.abbbbbbabbbbbbbba.
..aaaaaaaaaaaaaaa.
...aaaaaaaaaaaaa..
....aaaaaaaaaaa...
.....aaaaaaaaa....
......aaaaaaaa....
`;

TEMPLATES[39] = `  // 铜钱纹 - coin pattern
......aaaaaa......
.....abbbbbbaa....
....abcccccbbaa...
...abcdcdddcbaaa..
..abcdcdcddcbaaaa.
.abcdcdcdcddcbaaa.
.abcccccbbccccbaa.
..abbbbbbbabbbbba.
...aaaaaaaaaaaaa..
....aaaaaaaaaa....
.....aaaaaaaa.....
`;

TEMPLATES[40] = `  // 古风面具 - ancient mask (BOSS)
..aaaaaa.aaaaaa..
.abbbbaa.aaaabbbba.
abccccccccccccccbba
abccddccddccddccba
abcccdcccdcccdccba
abcccccccccccccbba
abcccbcccccbbbccba
.abccbccbccbbccba.
.abcccccccccccbba.
..abbbbbbbbbbbba..
...aaaaaaaaaaaa...
....aaaaaaaaaa....
.....aaaaaaaa.....
......aaaaaa......
`;

TEMPLATES[41] = `  // 简山水 - simple landscape
.....aaaaaaa......
....abbbbbbaaa....
...abcccccbbaaa...
..abcccddccbaaa...
.abcccdcdcccbaaa.
abcccdcdcddcbbaa.
abcccdcdcddcbbbaa.
abccccccccccbbbaa.
.abccccbbcccbbba.
..abbbbbaabbcbba.
...aaaaaa.aaaaaa.
`;

TEMPLATES[42] = `  // 仕女头像 - noble lady portrait
...aaaaaaaaaaa....
..abbbbbbbbbbbba..
.abcccccccccccbba.
abcccddccddcccba.
abcccdcccdcccccba.
abcccccccccccccbba
abcccccbbcccccbbba
.abccccccccccccba.
..abccccccccccba..
...abbbbbbbbbba...
....aaaaaaaaaaa...
.....aaaaaaaaa....
......aaaaaa......
`;

TEMPLATES[43] = `  // 书生头像 - scholar portrait
....aaaaaaaaaa....
...abbbbbbbbbbba..
..abccccccccccbaa.
.abcccddcccddcbaa.
abcccdcccdcccccba.
abcccccccccccccbba
abcccccccccccccbba
.abccccccccccccba.
..abbbbbbbbbbbbba.
...aaaaaaaaaaaaa..
....aaaaaaaaaaaa..
.....aaaaaaaaaa...
`;

TEMPLATES[44] = `  // 小龙纹 - small dragon (BOSS)
..aaaa...........
.abbbbaa.........
abccccbaaaaaaaaa
abccddcbabbbbbbbba
abcccddcabcccccbba
abccccccabcccccbba
.abccccc.abbbbbbaa.
..abbbbb..aaaaaa..
...aaaa...........
....aaaaaa........
..abbbbbbaaa......
.abcccccbba.......
`;

TEMPLATES[45] = `  // 小凤纹 - small phoenix (BOSS)
....aaaaaaa......
...abbbbbbaa.....
..abcccccbbaa....
.abcccddccbaaa...
abcccdcdcccbaaa.
abccccccccccbaaa.
.abcccccbbccbaaa.
..abbbbbbbbbaaa..
...aaaaaaaaaa....
...aaaa..aaa.....
..aaa....aaa.....
.aaa......aaa....
aaaa.......aaaa..
`;

TEMPLATES[46] = `  // 古琴 - guqin
..aaaaaaaaaaaaaaa.
.abbbbbbbbbbbbbbba
.abcccccccccccccba
.abcccddcccddccba
.abcccddcccddccba
.abcccccbbccccba
.abbbbbbabbbbbba
.aaaaaaaaaaaaaaa.
.......aaaa.....
......aaaaa.....
.....aaaaaa.....
....aaaaaaa.....
`;

TEMPLATES[47] = `  // 围棋 - go board
.aaaaaaaaaaaaaaaa.
ababababababababba
abccabccabccabccba
abccabccabccabccba
ababababababababba
abccabccabccabccba
abccabccabccabccba
ababababababababba
abccabccabccabccba
abccabccabccabccba
ababababababababba
abccabccabccabccba
abccabccabccabccba
ababababababababba
.aaaaaaaaaaaaaaaa.
`;

TEMPLATES[48] = `  // 书籍 - book scroll
..aaaaaaaaaaaaaaa.
.abbbbbbbbbbbbbba.
abccccccccccccccba
abcccddcccddcccba
abcccdcdcddcdccba
abcccccccccccccbba
abcccccccccccccbba
abcccbbccbbcccbbba
.abbbbbbabbbbbbbba
.aaaaaaaaaaaaaaaa.
..aaaaaaaaaaaaaa..
...aaaaaaaaaaaa...
....aaaaaaaaaa....
`;

TEMPLATES[49] = `  // 画卷 - painting scroll
..aaaaaaaaaaaaaaa.
.abbbbbbbbbbbbbba.
abccccccccccccccba
abcccddcccddcccba
abcccdcdcddcdccba
abcccccccccccccbba
abcccccccccccccbba
abcccccbbcccccbbba
.abbbbbbabbbbbbbba
.aaaaaaaaaaaaaaaa.
..aaaaaaaaaaaaaa..
...aaaaaaaaaaaa...
....aaaaaaaaaa....
`;

TEMPLATES[50] = `  // 古风建筑小全景 (BOSS)
.......aaaaaaaa........
......abbbbbbbba.......
.....abccccccccba......
....abcccddcccbaa......
...abcccdcdcccbaa......
..abcccccccccccbba.....
.abbbbbbbabbbbbbbba...
.aaaaaaaa.aaaaaaaa...
.....a.......a........
.....a.......a........
.....a.......a........
.....a.......a........
..aaaaaaaaaaaaaaaaa..
.abcccccccccccccccbba.
.abcccbbccbbcccbbbba.
.abbbbbbabbbbbbbbba.
.aaaaaaaaaaaaaaaaa.
`;

// --- For levels 51-200, we'll use procedural generation with the improved approach ---
// Instead of templates (too many to write by hand), we use smart procedural patterns

// ============================================================
// Procedural pattern generators with proper design
// ============================================================

function generateProceduralPattern(levelId, width, height, colorCount, theme, difficulty, isBoss) {
    const g = Array.from({ length: height }, () => Array(width).fill(0));
    const rng = mulberry32(levelId * 7919 + 104729);

    // Determine effective color count (cap at 8 for visual clarity)
    const effColors = Math.min(colorCount, isBoss ? 8 : 6);

    // Color roles based on power law distribution:
    // OUTLINE = 2 (always color 2 as outline)
    // BODY = 1 (main fill)
    // DETAIL = 3, 4, 5 (medium accents)
    // RARE = 6+ (jewel pixels)
    const OUTLINE = 2;
    const BODY = 1;
    const DETAIL_COLORS = [3, 4, 5, 6, 7, 8, 9, 10];

    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    const pad = 2; // padding from edges

    // --- Shape generation based on theme hash ---
    const themeHash = (() => { let h = 0; for (let ch of theme) h = ((h << 5) - h + ch.charCodeAt(0)) | 0; return Math.abs(h); })();
    const shapeRng = mulberry32(themeHash + levelId);

    // Shape type determines the overall form
    const shapeType = themeHash % 10;

    // Generate shape silhouette
    function fillShape() {
        switch (shapeType) {
            case 0: // Face/creature
                fillFaceShape(g, cx, cy, width, height, pad, rng);
                break;
            case 1: // Organic blob
                fillBlobShape(g, cx, cy, width, height, pad, rng);
                break;
            case 2: // Geometric
                fillGeometricShape(g, cx, cy, width, height, pad, rng);
                break;
            case 3: // Plant/nature
                fillPlantShape(g, cx, cy, width, height, pad, rng);
                break;
            case 4: // Building/structure
                fillBuildingShape(g, cx, cy, width, height, pad, rng);
                break;
            case 5: // Animal
                fillAnimalShape(g, cx, cy, width, height, pad, rng);
                break;
            case 6: // Concentric
                fillConcentricShape(g, cx, cy, width, height, pad, rng);
                break;
            case 7: // Winding/serpentine
                fillWindingShape(g, cx, cy, width, height, pad, rng);
                break;
            case 8: // Scene/multiple objects
                fillSceneShape(g, cx, cy, width, height, pad, rng);
                break;
            case 9: // Ornament/symbol
                fillOrnamentShape(g, cx, cy, width, height, pad, rng);
                break;
        }
    }

    fillShape();

    // Make outline
    makeOutline(g, BODY, OUTLINE);

    // Add detail patches with secondary colors
    const detailCount = Math.floor(effColors * 1.5);
    for (let i = 0; i < detailCount && i + 2 <= effColors; i++) {
        addDetailPatches(g, BODY, DETAIL_COLORS[i % DETAIL_COLORS.length], rng, 3 + Math.floor(rng() * 5));
    }

    // Add rare pixel accents
    if (effColors > 5) {
        for (let i = 5; i < effColors; i++) {
            addRarePixels(g, BODY, DETAIL_COLORS[i % DETAIL_COLORS.length], rng, 3 + Math.floor(rng() * 4));
        }
    }

    // Add bottom anchor line
    addBottomAnchor(g);

    // Fill any remaining empty cells in the shape's bounding box with body color
    // to ensure good fill density

    return g;
}

function fillFaceShape(g, cx, cy, w, h, pad, rng) {
    // Face/creature: oval head with features
    const hw = Math.floor(w * 0.35);
    const hh = Math.floor(h * 0.4);
    drawEllipse(g, cx, cy, hw, hh, 1);

    // Eyes
    const eyeY = cy - Math.floor(hh * 0.3);
    const eyeSpacing = Math.floor(hw * 0.4);
    drawEllipse(g, cx - eyeSpacing, eyeY, Math.floor(hw * 0.12), Math.floor(hh * 0.1), 1);
    drawEllipse(g, cx + eyeSpacing, eyeY, Math.floor(hw * 0.12), Math.floor(hh * 0.1), 1);

    // Mouth
    drawEllipse(g, cx, cy + Math.floor(hh * 0.4), Math.floor(hw * 0.3), Math.floor(hh * 0.1), 1);
}

function fillBlobShape(g, cx, cy, w, h, pad, rng) {
    // Organic irregular blob - larger and fuller
    const points = [];
    const numPoints = 8 + Math.floor(rng() * 4);
    const baseRx = w * 0.38;
    const baseRy = h * 0.42;
    for (let i = 0; i < numPoints; i++) {
        let angle = (i / numPoints) * Math.PI * 2;
        let rx = baseRx * (0.8 + rng() * 0.4);
        let ry = baseRy * (0.8 + rng() * 0.4);
        points.push([Math.round(cx + Math.cos(angle) * rx), Math.round(cy + Math.sin(angle) * ry)]);
    }
    drawPoly(g, points, 1);
}

function fillGeometricShape(g, cx, cy, w, h, pad, rng) {
    // Diamond, circle, square - larger sizes
    const type = Math.floor(rng() * 4);
    const r = Math.min(w, h) * 0.38;
    if (type === 0) {
        const pts = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
        drawPoly(g, pts, 1);
    } else if (type === 1) {
        drawEllipse(g, cx, cy, r * 0.9, r, 1);
    } else if (type === 2) {
        drawRect(g, cx - Math.floor(r * 0.8), cy - Math.floor(r * 0.9),
                 cx + Math.floor(r * 0.8), cy + Math.floor(r * 0.9), 1);
    } else {
        // Cross - thicker arms
        drawRect(g, cx - Math.floor(r * 0.2), cy - Math.floor(r), cx + Math.floor(r * 0.2), cy + Math.floor(r), 1);
        drawRect(g, cx - Math.floor(r * 0.9), cy - Math.floor(r * 0.2), cx + Math.floor(r * 0.9), cy + Math.floor(r * 0.2), 1);
    }
}

function fillPlantShape(g, cx, cy, w, h, pad, rng) {
    // Plant: vertical trunk with spreading top - larger
    const trunkW = Math.max(3, Math.floor(w * 0.1));
    const trunkH = Math.floor(h * 0.5);
    drawRect(g, cx - trunkW, cy, cx + trunkW, cy + trunkH, 1);
    // Canopy - larger
    drawEllipse(g, cx, cy - Math.floor(h * 0.15), Math.floor(w * 0.38), Math.floor(h * 0.3), 1);
    // Branches
    for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
        let bx = cx + (rng() - 0.5) * w * 0.5;
        let by = cy + Math.floor(rng() * h * 0.2);
        drawEllipse(g, bx, by, Math.floor(w * 0.12), Math.floor(h * 0.12), 1);
    }
}

function fillBuildingShape(g, cx, cy, w, h, pad, rng) {
    // Building: rectangular body with roof - larger
    const bw = Math.floor(w * 0.4);
    const bh = Math.floor(h * 0.4);
    drawRect(g, cx - bw, cy, cx + bw, cy + bh, 1);
    // Roof
    const roofH = Math.floor(h * 0.25);
    const pts = [[cx, cy - roofH], [cx + bw + Math.floor(w * 0.15), cy], [cx - bw - Math.floor(w * 0.15), cy]];
    drawPoly(g, pts, 1);
    // Door/details
    if (bw > 5) {
        drawRect(g, cx - Math.floor(bw * 0.25), cy + Math.floor(bh * 0.2), cx + Math.floor(bw * 0.25), cy + bh, 1);
    }
}

function fillAnimalShape(g, cx, cy, w, h, pad, rng) {
    // Animal: body + head + tail - larger proportions
    drawEllipse(g, cx, cy, Math.floor(w * 0.3), Math.floor(h * 0.18), 1);
    // Head
    const headX = cx + Math.floor(w * 0.25);
    const headY = cy - Math.floor(h * 0.18);
    drawEllipse(g, headX, headY, Math.floor(w * 0.15), Math.floor(h * 0.12), 1);
    // Tail
    const tailX = cx - Math.floor(w * 0.3);
    drawEllipse(g, tailX, cy, Math.floor(w * 0.12), Math.floor(h * 0.1), 1);
    // Legs - thicker
    for (let dx of [-1, 1]) {
        drawRect(g, cx + dx * Math.floor(w * 0.18) - 2, cy + Math.floor(h * 0.15),
                 cx + dx * Math.floor(w * 0.18) + 2, cy + Math.floor(h * 0.3), 1);
    }
}

function fillConcentricShape(g, cx, cy, w, h, pad, rng) {
    // Concentric rings - fill the whole thing, not just outlines
    const maxR = Math.min(w, h) * 0.4;
    // Draw filled circles from largest to smallest with different patterns
    drawEllipse(g, cx, cy, maxR * 0.9, maxR, 1);
    // Inner ring pattern: create a contrasting inner shape
    const innerR = maxR * 0.5;
    drawEllipse(g, cx, cy, innerR * 0.8, innerR, 1);
    // Add some radial detail lines
    const segments = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < segments; i++) {
        let angle = (i / segments) * Math.PI * 2;
        let x1 = cx + Math.round(Math.cos(angle) * innerR * 0.3);
        let y1 = cy + Math.round(Math.sin(angle) * innerR * 0.3);
        let x2 = cx + Math.round(Math.cos(angle) * maxR * 0.8);
        let y2 = cy + Math.round(Math.sin(angle) * maxR * 0.8);
        drawLine(g, x1, y1, x2, y2, 1, 1);
    }
}

function fillWindingShape(g, cx, cy, w, h, pad, rng) {
    // Simple filled shape with winding detail - use filled ellipse instead of lines
    drawEllipse(g, cx, cy, Math.floor(w * 0.35), Math.floor(h * 0.4), 1);
    // Add a few thick lines for winding effect
    const segments = 3;
    for (let i = 0; i < segments; i++) {
        let y1 = pad + i * (h - 2 * pad) / segments;
        let y2 = pad + (i + 1) * (h - 2 * pad) / segments;
        let x1 = cx + (i % 2 === 0 ? -1 : 1) * Math.floor(w * 0.2);
        let x2 = cx + (i % 2 === 0 ? 1 : -1) * Math.floor(w * 0.2);
        // Only draw if within bounds
        if (y1 >= pad && y1 < h - pad && y2 >= pad && y2 < h - pad) {
            drawLine(g, Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), 1, 2);
        }
    }
}

function fillSceneShape(g, cx, cy, w, h, pad, rng) {
    // Scene: fewer but larger objects
    const numObjects = 2 + Math.floor(rng() * 2);
    const baseSize = Math.floor(Math.min(w, h) * 0.2);
    for (let i = 0; i < numObjects; i++) {
        let ox = pad + Math.floor(rng() * (w - 2 * pad));
        let oy = pad + Math.floor(rng() * (h - 2 * pad));
        let size = baseSize + Math.floor(rng() * baseSize * 0.5);
        let type = Math.floor(rng() * 3);
        if (type === 0) drawEllipse(g, ox, oy, size, Math.floor(size * 0.8), 1);
        else if (type === 1) {
            // Large diamond
            let pts = [[ox, oy - size], [ox + size, oy], [ox, oy + size], [ox - size, oy]];
            drawPoly(g, pts, 1);
        }
        else drawRect(g, ox - size, oy - size, ox + size, oy + size, 1);
    }
}

function fillOrnamentShape(g, cx, cy, w, h, pad, rng) {
    // Ornamental pattern - use larger filled shapes
    const type = Math.floor(rng() * 3);
    const r = Math.min(w, h) * 0.4;
    if (type === 0) {
        // Star-like: large filled diamond
        let pts = [
            [cx, cy - r],
            [cx + Math.floor(r * 0.7), cy],
            [cx, cy + r],
            [cx - Math.floor(r * 0.7), cy]
        ];
        drawPoly(g, pts, 1);
        // Inner smaller diamond
        let inner = r * 0.5;
        let pts2 = [
            [cx, cy - inner],
            [cx + Math.floor(inner * 0.7), cy],
            [cx, cy + inner],
            [cx - Math.floor(inner * 0.7), cy]
        ];
        drawPoly(g, pts2, 1);
    } else if (type === 1) {
        // Concentric filled circles
        drawEllipse(g, cx, cy, r * 0.9, r, 1);
        drawEllipse(g, cx, cy, r * 0.5, r * 0.6, 1);
        drawEllipse(g, cx, cy, r * 0.2, r * 0.25, 1);
    } else {
        // Mandala: large central circle with radial petals
        drawEllipse(g, cx, cy, r * 0.9, r, 1);
    }
}

function addBottomAnchor(g) {
    const h = g.length;
    const w = g[0].length;
    // Find the bottommost row that has content
    let bottomRow = h - 1;
    for (let y = h - 1; y >= 0; y--) {
        for (let x = 0; x < w; x++) {
            if (g[y][x] > 0) { bottomRow = y; break; }
        }
    }
    // Fill empty cells in the last 1-2 rows of content
    if (bottomRow < h - 1) {
        // Add a thin anchor line at the bottom of the shape
        let minX = w, maxX = 0;
        for (let x = 0; x < w; x++) {
            if (g[bottomRow][x] > 0) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
            }
        }
        for (let x = minX; x <= maxX; x++) {
            if (g[bottomRow + 1] && g[bottomRow + 1][x] === 0) {
                g[bottomRow + 1][x] = 2;
            }
        }
    }
}

// ============================================================
// Shuffle: redistribute non-zero cells preserving color counts
// ============================================================
function shufflePattern(correct, difficulty, levelId) {
    const h = correct.length, w = correct[0].length;
    const init = Array.from({ length: h }, () => Array(w).fill(0));

    const nonZero = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        if (correct[r][c] > 0) nonZero.push(correct[r][c]);
    }

    const positions = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        if (correct[r][c] > 0) positions.push([r, c]);
    }

    // Shuffle
    const rng = mulberry32(levelId * 7 + 1);
    for (let i = nonZero.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [nonZero[i], nonZero[j]] = [nonZero[j], nonZero[i]];
    }
    for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    for (let i = 0; i < nonZero.length; i++) {
        init[positions[i][0]][positions[i][1]] = nonZero[i];
    }

    return init;
}

// ============================================================
// Template-based generation for levels 1-50
// ============================================================
function parseAndGenerateFromTemplate(levelId, templateStr, width, height) {
    const lines = templateStr.trim().split('\n');
    const rows = [];
    for (let line of lines) {
        if (line.trim().startsWith('//')) continue;
        let r = [];
        for (let ch of line) {
            if (ch === '.' || ch === ' ') r.push(0);
            else if (ch >= 'a' && ch <= 'z') r.push(ch.charCodeAt(0) - 96);
            else r.push(0);
        }
        // Pad row to width
        while (r.length < width) r.push(0);
        rows.push(r);
    }

    // Pad to height
    while (rows.length < height) {
        rows.push(new Array(width).fill(0));
    }

    return rows;
}

// ============================================================
// Level specifications with ACTUAL dimensions matching existing levels
// ============================================================
const LEVEL_SPECS = [
    // id, width, height, colorCount, theme, timeLimit, difficulty, isBoss
    [1, 8, 7, 2, "爱心", 60, 1, false],
    [2, 9, 8, 2, "五角星", 60, 1, false],
    [3, 9, 8, 3, "弯月", 60, 1, false],
    [4, 10, 8, 3, "云朵", 60, 1, false],
    [5, 10, 10, 3, "小福字", 70, 2, false],
    [6, 10, 10, 3, "小灯笼", 70, 1, false],
    [7, 10, 10, 4, "小花", 80, 1, false],
    [8, 10, 10, 4, "平安扣", 80, 1, false],
    [9, 10, 10, 4, "中国结", 80, 2, false],
    [10, 10, 10, 4, "金元宝", 80, 2, false],
    [11, 12, 11, 4, "小锦鲤", 90, 2, false],
    [12, 12, 12, 4, "折扇", 90, 2, false],
    [13, 12, 12, 4, "茶壶", 90, 2, false],
    [14, 12, 12, 4, "梅花", 90, 2, false],
    [15, 14, 12, 5, "熊猫头像", 100, 3, true],
    [16, 14, 12, 5, "玉如意", 100, 2, false],
    [17, 16, 10, 5, "祥云纹", 100, 2, false],
    [18, 16, 10, 5, "山纹", 100, 2, false],
    [19, 14, 10, 5, "水波纹", 110, 3, false],
    [20, 12, 14, 5, "古风窗纹", 120, 3, false],
    [21, 14, 12, 5, "兔子", 90, 2, false],
    [22, 12, 12, 5, "小猫", 90, 2, false],
    [23, 12, 12, 6, "柿子", 100, 3, false],
    [24, 13, 12, 6, "橘子", 100, 3, false],
    [25, 14, 14, 6, "古风花瓶", 120, 4, true],
    [26, 13, 12, 6, "荷叶", 100, 3, false],
    [27, 12, 12, 6, "莲蓬", 110, 3, false],
    [28, 14, 12, 6, "竹子", 110, 3, false],
    [29, 12, 13, 6, "兰花", 110, 3, false],
    [30, 12, 16, 6, "玉佩套装", 120, 4, true],
    [31, 16, 16, 6, "小亭子", 120, 3, false],
    [32, 16, 16, 6, "小桥", 120, 3, false],
    [33, 14, 13, 7, "牡丹简形", 130, 3, false],
    [34, 14, 13, 7, "菊花", 130, 3, false],
    [35, 16, 13, 7, "完整锦鲤", 140, 4, true],
    [36, 14, 16, 7, "仙鹤简形", 120, 3, false],
    [37, 14, 16, 7, "鹿纹", 130, 3, false],
    [38, 12, 12, 7, "福袋", 130, 3, false],
    [39, 12, 12, 7, "铜钱纹", 130, 3, false],
    [40, 16, 14, 7, "古风面具", 140, 4, true],
    [41, 12, 12, 7, "简山水", 120, 3, false],
    [42, 14, 13, 8, "仕女头像", 140, 3, false],
    [43, 14, 12, 8, "书生头像", 140, 3, false],
    [44, 12, 12, 8, "小龙纹", 150, 4, true],
    [45, 14, 14, 8, "小凤纹", 150, 4, true],
    [46, 16, 12, 8, "古琴", 120, 3, false],
    [47, 16, 14, 8, "围棋", 130, 3, false],
    [48, 16, 13, 8, "书籍", 130, 3, false],
    [49, 16, 13, 8, "画卷", 130, 3, false],
    [50, 16, 17, 8, "古风建筑小全景", 150, 5, true],
];

// Generate specs for 51-200
function generateSpecs() {
    const specs = [];

    // Levels 51-100: 18x18 to 20x20 area
    const themes51_100 = [
        [51,"完整牡丹",18,18,8,120,4,false],[52,"荷塘",18,18,9,130,4,false],
        [53,"松鹤图",18,18,9,130,4,false],[54,"年年有余",18,18,9,140,4,false],
        [55,"麒麟简形",20,20,9,150,5,true],[56,"古风团扇",18,18,9,120,4,false],
        [57,"香囊",18,18,9,130,4,false],[58,"发簪",18,18,9,130,4,false],
        [59,"流苏玉佩",18,18,9,140,4,false],[60,"山水小全景",20,20,9,150,5,true],
        [61,"龙纹半身",20,20,9,150,4,false],[62,"凤纹半身",20,20,10,160,4,false],
        [63,"古城门",20,20,10,160,4,false],[64,"宝塔",20,20,10,160,4,false],
        [65,"神兽纹",20,20,10,180,5,true],[66,"竹林",20,20,10,150,4,false],
        [67,"梅花枝",20,20,10,160,4,false],[68,"菊花丛",20,20,10,160,4,false],
        [69,"兰草丛",20,20,10,160,4,false],[70,"完整山水",20,20,10,180,5,true],
        [71,"小花轿",20,20,10,150,4,false],[72,"龙凤呈祥",22,22,11,180,5,true],
        [73,"富贵花开",22,22,11,180,5,true],[74,"百福图简版",22,22,11,180,5,true],
        [75,"完整麒麟",22,22,11,180,5,true],[76,"仙鹤齐飞",22,22,11,150,4,false],
        [77,"锦鲤群",22,22,11,180,5,true],[78,"古风庭院",22,22,11,180,5,true],
        [79,"琴棋书画套装",22,22,11,180,5,true],[80,"宫殿局部",22,22,11,180,5,true],
        [81,"龙身",20,20,11,160,5,false],[82,"凤身",20,20,12,180,5,true],
        [83,"古画局部",20,20,12,180,5,true],[84,"江山图局部",20,20,12,180,5,true],
        [85,"神兽组合",20,20,12,180,5,true],[86,"古风婚礼小景",20,20,12,160,5,false],
        [87,"百鸟朝凤简版",22,22,12,180,5,true],[88,"山水长卷",24,22,12,180,5,true],
        [89,"福瑞满堂",24,22,12,180,5,true],[90,"国风全景大图",24,22,12,180,6,true],
        [91,"满屏龙纹",22,22,12,160,5,false],[92,"满屏凤纹",22,22,12,180,5,true],
        [93,"宫殿局部全景",24,22,12,180,5,true],[94,"大幅山水",24,22,12,180,5,true],
        [95,"龙凤合体",22,22,12,180,5,true],[96,"满屏百福",22,22,12,180,5,true],
        [97,"神兽全家福",24,22,12,180,5,true],[98,"盛世小景",24,22,12,180,5,true],
        [99,"终极对称神兽",24,22,12,180,5,true],[100,"国风盛世全景",24,22,12,180,6,true],
    ];
    for (const [,theme,w,h,c,time,diff,boss] of themes51_100) {
        specs.push([100, w, h, c, theme, time, diff, boss]); // Fix ID below
    }

    // Actually let me build this properly
    specs.length = 0; // Clear

    const allThemes = [
        [51,"完整牡丹",18,18,8,120,4,false],[52,"荷塘",18,18,9,130,4,false],
        [53,"松鹤图",18,18,9,130,4,false],[54,"年年有余",18,18,9,140,4,false],
        [55,"麒麟简形",20,20,9,150,5,true],[56,"古风团扇",18,18,9,120,4,false],
        [57,"香囊",18,18,9,130,4,false],[58,"发簪",18,18,9,130,4,false],
        [59,"流苏玉佩",18,18,9,140,4,false],[60,"山水小全景",20,20,9,150,5,true],
        [61,"龙纹半身",20,20,9,150,4,false],[62,"凤纹半身",20,20,10,160,4,false],
        [63,"古城门",20,20,10,160,4,false],[64,"宝塔",20,20,10,160,4,false],
        [65,"神兽纹",20,20,10,180,5,true],[66,"竹林",20,20,10,150,4,false],
        [67,"梅花枝",20,20,10,160,4,false],[68,"菊花丛",20,20,10,160,4,false],
        [69,"兰草丛",20,20,10,160,4,false],[70,"完整山水",20,20,10,180,5,true],
        [71,"小花轿",20,20,10,150,4,false],[72,"龙凤呈祥",22,22,11,180,5,true],
        [73,"富贵花开",22,22,11,180,5,true],[74,"百福图简版",22,22,11,180,5,true],
        [75,"完整麒麟",22,22,11,180,5,true],[76,"仙鹤齐飞",22,22,11,150,4,false],
        [77,"锦鲤群",22,22,11,180,5,true],[78,"古风庭院",22,22,11,180,5,true],
        [79,"琴棋书画套装",22,22,11,180,5,true],[80,"宫殿局部",22,22,11,180,5,true],
        [81,"龙身",20,20,11,160,5,false],[82,"凤身",20,20,12,180,5,true],
        [83,"古画局部",20,20,12,180,5,true],[84,"江山图局部",20,20,12,180,5,true],
        [85,"神兽组合",20,20,12,180,5,true],[86,"古风婚礼小景",20,20,12,160,5,false],
        [87,"百鸟朝凤简版",22,22,12,180,5,true],[88,"山水长卷",24,22,12,180,5,true],
        [89,"福瑞满堂",24,22,12,180,5,true],[90,"国风全景大图",24,22,12,180,6,true],
        [91,"满屏龙纹",22,22,12,160,5,false],[92,"满屏凤纹",22,22,12,180,5,true],
        [93,"宫殿局部全景",24,22,12,180,5,true],[94,"大幅山水",24,22,12,180,5,true],
        [95,"龙凤合体",22,22,12,180,5,true],[96,"满屏百福",22,22,12,180,5,true],
        [97,"神兽全家福",24,22,12,180,5,true],[98,"盛世小景",24,22,12,180,5,true],
        [99,"终极对称神兽",24,22,12,180,5,true],[100,"国风盛世全景",24,22,12,180,6,true],
        [101,"剪纸福字",20,20,8,150,4,false],[102,"剪纸窗花",20,20,8,150,4,false],
        [103,"皮影小人",20,20,9,160,4,false],[104,"京剧脸谱简形",20,20,9,160,4,false],
        [105,"大红灯笼串",20,20,9,180,5,true],[106,"鞭炮串",20,20,9,150,4,false],
        [107,"风筝",20,20,9,160,4,false],[108,"龙舟船头",20,20,10,170,4,false],
        [109,"粽子组合",20,20,10,170,4,false],[110,"月饼礼盒",20,20,10,180,5,true],
        [111,"舞狮头",22,22,10,170,4,false],[112,"龙头局部",22,22,10,170,4,false],
        [113,"古风花轿局部",22,22,10,170,4,false],[114,"玉璧纹",22,22,10,170,4,false],
        [115,"饕餮纹简版",22,22,10,190,5,true],[116,"编钟",22,22,10,170,4,false],
        [117,"鼎纹",22,22,10,170,4,false],[118,"铜镜纹",22,22,10,180,4,false],
        [119,"古钱币串",22,22,10,180,4,false],[120,"长命锁",22,22,10,190,5,true],
        [121,"玉兔",22,22,10,170,4,false],[122,"嫦娥简形",22,22,10,180,4,false],
        [123,"桂花枝",22,22,10,180,4,false],[124,"广寒宫剪影",22,22,10,180,4,false],
        [125,"神话仙鹿",22,22,10,200,5,true],[126,"神龟",22,22,10,170,4,false],
        [127,"金蟾",22,22,10,180,4,false],[128,"蝙蝠献福",22,22,10,180,4,false],
        [129,"貔貅半身",22,22,10,190,4,false],[130,"四象简纹合集",22,22,10,200,5,true],
        [131,"远山层叠",22,22,10,180,4,false],[132,"流水瀑布",22,22,10,180,4,false],
        [133,"云海",22,22,10,180,4,false],[134,"孤舟",22,22,10,190,4,false],
        [135,"山水渔隐图",22,22,10,200,5,true],[136,"松针满屏",22,22,10,180,4,false],
        [137,"竹影",22,22,10,180,4,false],[138,"枫叶",22,22,10,190,4,false],
        [139,"银杏叶",22,22,10,190,4,false],[140,"四季花木合集",22,22,10,200,5,true],
        [141,"古风书架",22,22,10,180,4,false],[142,"文房四宝",22,22,10,190,4,false],
        [143,"笔筒",22,22,10,190,4,false],[144,"镇纸",22,22,10,190,4,false],
        [145,"文人雅集剪影",22,22,10,200,5,true],[146,"香炉青烟",22,22,10,180,4,false],
        [147,"茶盏",22,22,10,190,4,false],[148,"书卷展开",22,22,10,190,4,false],
        [149,"笔架",22,22,10,190,4,false],[150,"全套文房雅物",22,22,10,210,5,true],
        [151,"城门楼",22,22,10,180,4,false],[152,"飞檐翘角",22,22,10,190,4,false],
        [153,"瓦当纹",22,22,10,190,4,false],[154,"斗拱结构简形",22,22,10,200,4,false],
        [155,"古风宫殿一角",22,22,11,210,5,true],[156,"牌坊",22,22,11,190,4,false],
        [157,"回廊",22,22,11,190,4,false],[158,"假山",22,22,11,200,4,false],
        [159,"曲桥",22,22,11,200,4,false],[160,"完整庭院全景",22,22,11,210,5,true],
        [161,"朱雀纹",22,22,11,200,4,false],[162,"玄武纹",22,22,11,200,4,false],
        [163,"青龙纹",22,22,11,200,4,false],[164,"白虎纹",22,22,11,200,4,false],
        [165,"四象神兽合集",22,22,11,220,5,true],[166,"凤凰展翅",22,22,11,200,4,false],
        [167,"龙游九天",22,22,11,200,4,false],[168,"麒麟踏云",22,22,11,210,4,false],
        [169,"貔貅招财",22,22,11,210,4,false],[170,"上古瑞兽大全",22,22,12,220,5,true],
        [171,"荷塘月色",22,22,12,200,4,false],[172,"梅雪争春",22,22,12,210,4,false],
        [173,"兰香幽谷",22,22,12,210,4,false],[174,"竹影清风",22,22,12,210,4,false],
        [175,"梅兰竹菊合集",22,22,12,220,5,true],[176,"富贵牡丹图",22,22,12,200,4,false],
        [177,"出水芙蓉",22,22,12,210,4,false],[178,"山茶花开",22,22,12,210,4,false],
        [179,"水仙",22,22,12,210,4,false],[180,"百花图卷",22,22,12,220,5,true],
        [181,"古风街市一角",22,22,12,210,4,false],[182,"酒肆旗子",22,22,12,210,4,false],
        [183,"灯笼街景",22,22,12,210,4,false],[184,"车马剪影",22,22,12,220,4,false],
        [185,"盛世长安局部",22,22,12,230,5,true],[186,"烟花剪影",22,22,12,210,4,false],
        [187,"灯会人群",22,22,12,210,4,false],[188,"戏台剪影",22,22,12,220,4,false],
        [189,"庙会小景",22,22,12,220,4,false],[190,"国风民俗全景",22,22,12,230,5,true],
        [191,"对称龙纹",22,22,12,220,4,false],[192,"对称凤纹",22,22,12,220,4,false],
        [193,"对称山水",22,22,12,220,4,false],[194,"对称花鸟",22,22,12,220,4,false],
        [195,"终极对称国风图腾",22,22,12,240,5,true],[196,"福满乾坤",22,22,12,220,4,false],
        [197,"禄寿双全",22,22,12,220,4,false],[198,"喜结连理",22,22,12,220,4,false],
        [199,"财运势起",22,22,12,220,4,false],[200,"五福圆满终极关",22,22,12,240,6,true],
    ];

    for (const [id, theme, w, h, c, time, diff, boss] of allThemes) {
        specs.push([id, w, h, c, theme, time, diff, boss]);
    }

    return specs;
}

// ============================================================
// Main generation loop
// ============================================================
function generate() {
    const outDir = path.join(__dirname, '..', 'guanka');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    // Generate levels 1-50 from templates
    for (let i = 1; i <= 50; i++) {
        const spec = LEVEL_SPECS[i - 1];
        if (!spec) continue;
        const [id, w, h, c, theme, time, diff, boss] = spec;
        const template = TEMPLATES[id];

        let correct;
        if (template) {
            correct = parseAndGenerateFromTemplate(id, template, w, h);
        } else {
            correct = generateProceduralPattern(id, w, h, c, theme, diff, boss);
        }

        const init = shufflePattern(correct, diff, id);
        const slotTotal = countNonZero(correct);

        const levelData = {
            levelId: id,
            boardWidth: w,
            boardHeight: h,
            timeLimit: time,
            slotTotalCount: slotTotal,
            correctColorArr: correct,
            initRandomColorArr: init,
        };

        fs.writeFileSync(path.join(outDir, `level_${id}.json`), JSON.stringify(levelData));

        if (id % 10 === 0 || id <= 5) {
            console.log(`Generated level ${id}: ${theme} (${w}x${h}, ${c}色, ${diff}难度${boss ? ', BOSS' : ''})`);
        }
    }

    // Generate levels 51-200 procedurally
    const extraSpecs = generateSpecs();
    for (const [id, w, h, c, theme, time, diff, boss] of extraSpecs) {
        const correct = generateProceduralPattern(id, w, h, c, theme, diff, boss);
        const init = shufflePattern(correct, diff, id);
        const slotTotal = countNonZero(correct);

        const levelData = {
            levelId: id,
            boardWidth: w,
            boardHeight: h,
            timeLimit: time,
            slotTotalCount: slotTotal,
            correctColorArr: correct,
            initRandomColorArr: init,
        };

        fs.writeFileSync(path.join(outDir, `level_${id}.json`), JSON.stringify(levelData));

        if (id % 25 === 0) {
            console.log(`Generated level ${id}: ${theme} (${w}x${h}, ${c}色, ${diff}难度${boss ? ', BOSS' : ''})`);
        }
    }

    console.log(`\nDone! Generated ${50 + extraSpecs.length} levels in ${outDir}`);
}

function countNonZero(grid) {
    let count = 0;
    for (const row of grid) for (const v of row) if (v > 0) count++;
    return count;
}

generate();
