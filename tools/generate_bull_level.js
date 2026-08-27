'use strict';

const fs = require('node:fs');
const path = require('node:path');
const shuffle = require('./shuffle-comparison.js');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'tools', 'generated-levels', 'bull-movie-style-500');
const width = 35;
const height = 31;
const levelId = 500001;
const grid = Array.from({ length: height }, () => Array(width).fill(0));
const insideEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const paint = (predicate, color) => {
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        if (predicate(x, y)) grid[y][x] = color;
    }
};

// Original cinematic bull-head silhouette: sweeping horns, broad forehead, muzzle and nose ring.
paint((x, y) => insideEllipse(x, y, 17, 16, 11.5, 11.5), 1);
paint((x, y) => insideEllipse(x, y, 17, 16, 9.8, 10.2), 2);
paint((x, y) => y >= 2 && y <= 11 && ((x >= 1 && x <= 10 && x + y >= 10 && x - y <= 2)
    || (x >= 24 && x <= 33 && x + y <= 40 && x - y >= 22)), 4);
paint((x, y) => y >= 7 && y <= 12 && ((x >= 5 && x <= 11) || (x >= 23 && x <= 29)), 1);
paint((x, y) => insideEllipse(x, y, 17, 12, 6.2, 7.5), 3);
paint((x, y) => insideEllipse(x, y, 17, 21, 8.5, 5.5), 5);
paint((x, y) => insideEllipse(x, y, 12.5, 15.5, 2.2, 1.8)
    || insideEllipse(x, y, 21.5, 15.5, 2.2, 1.8), 7);
paint((x, y) => insideEllipse(x, y, 12.5, 15.5, 0.8, 0.8)
    || insideEllipse(x, y, 21.5, 15.5, 0.8, 0.8), 8);
paint((x, y) => insideEllipse(x, y, 14, 21, 1.1, 0.9)
    || insideEllipse(x, y, 20, 21, 1.1, 0.9), 1);
paint((x, y) => y >= 23 && y <= 29 && Math.abs(x - 17) >= 3 && Math.abs(x - 17) <= 5
    && insideEllipse(x, y, 17, 25, 5.5, 5.5), 6);
paint((x, y) => y >= 23 && y <= 27 && Math.abs(x - 17) <= 2, 0);
paint((x, y) => y >= 8 && y <= 11 && Math.abs(x - 17) <= 1, 6);

const filled = grid.flat().filter(value => value > 0).length;
if (filled < 470 || filled > 530) throw new Error(`expected about 500 beans, got ${filled}`);
const references = Array.from({ length: 182 }, (_value, index) =>
    JSON.parse(fs.readFileSync(path.join(root, 'tools', 'dbt', `level_${index + 1}.json`), 'utf8')));
const initRandomColorArr = shuffle.generate(grid, {
    levelId,
    profile: shuffle.learnProfile(references),
    outlineGrid: grid,
});
const level = {
    levelId,
    boardWidth: width,
    boardHeight: height,
    timeLimit: 180,
    slotTotalCount: filled,
    conveyorCapacity: 60,
    correctColorArr: grid,
    initRandomColorArr,
};

const palette = ['#10141f', '#5b2c1f', '#a95f35', '#d99a55', '#f0dfb3', '#c98768', '#e6b84c', '#f5f0df', '#10141f'];
const cell = 16;
const rects = [];
for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const color = grid[y][x];
    if (color <= 0) continue;
    rects.push(`<rect x="${x * cell + 1}" y="${y * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="${palette[color]}"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * cell}" height="${height * cell}" viewBox="0 0 ${width * cell} ${height * cell}"><rect width="100%" height="100%" fill="#f3eee4"/>${rects.join('')}</svg>\n`;
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'level.json'), `${JSON.stringify(level, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'preview.svg'), svg);
console.log(JSON.stringify({ outputDir, filled, colors: new Set(grid.flat().filter(value => value > 0)).size, width, height }));
