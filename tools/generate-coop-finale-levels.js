'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const { palette, LEVEL_DIR, MANIFEST } = require('./generate-coop-levels');
const { render } = require('./generate-coop-variety-levels');
const shuffle = require('./shuffle-comparison');
const { controllerReplay } = require('../tests/pvp-human-replay-fixture');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'generated_levels/coop-finale-9');
const CONCEPT = path.join(OUT, 'concept.png');
const W = 64, H = 56;
const specs = [
    { name: '心贝小水獭', english: 'Otter Heart Shell', colors: [20, 6, 5, 14, 1, 16, 19], split: 'paired-characters', reveal: '两只水獭各捧半扇贝壳，合起来才出现发光爱心', score: 42 },
    { name: '月钓星愿', english: 'Moon Fishing Wish', colors: [20, 6, 3, 4, 16, 7, 15], split: 'moon-and-starlight', reveal: '小熊猫与星星分别完成月亮和星尘弧线', score: 46 },
    { name: '草莓蛋糕接力', english: 'Strawberry Cake Relay', colors: [20, 6, 14, 1, 10, 11, 16, 19], split: 'cake-and-bakers', reveal: '两只柯基抬起蛋糕，双方完成后才看见完整草莓卷', score: 50 },
    { name: '龙蛋藏星河', english: 'Dragon Egg Galaxy', colors: [20, 6, 3, 9, 11, 12, 7, 18], split: 'guardian-and-secret', reveal: '一方守护幼龙与蛋壳，另一方揭开蛋中的迷你银河', score: 55 },
    { name: '莲心双生鱼', english: 'Lotus Axolotl Ring', colors: [20, 2, 13, 14, 1, 7, 18, 9, 11], split: 'yin-yang-swirl', reveal: '两只六角恐龙首尾相接，合成莲花太极环', score: 60 },
    { name: '彩虹森林乐团', english: 'Rainbow Forest Orchestra', colors: [20, 6, 3, 4, 1, 8, 13, 9, 16], split: 'melody-and-orchestra', reveal: '一方拼出彩虹旋律，另一方让动物乐团奏响', score: 65 },
    { name: '星际拼装队', english: 'Cosmic Assembly Team', colors: [20, 6, 3, 4, 10, 9, 13, 7, 18, 19], split: 'rocket-assembly', reveal: '太空猫和外星兔各装一半火箭，中央星河最后接通', score: 71 },
    { name: '双鲸穿镜海', english: 'Mirror Sea Whales', colors: [20, 6, 2, 13, 7, 18, 14, 1, 9, 12], split: 'mirror-worlds', reveal: '天空鲸与深海鲸隔镜相遇，完成时上下世界连成一体', score: 78 },
    { name: '友谊升空大合照', english: 'Friendship Balloon Finale', colors: [20, 6, 3, 4, 1, 10, 9, 11, 13, 7, 16], split: 'balloon-and-friends', reveal: '一方升起百衲热气球，另一方集合动物朋友，最终成为大合照', score: 86 },
];
const colors = palette();
const rgb = id => colors[id].slice(1).match(/../g).map(value => parseInt(value, 16));
const distance = (a, b) => a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);

function pixel(png, x, y) {
    return Array.from(png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3));
}

function extract(png, index, allowed) {
    const column = index % 3, row = Math.floor(index / 3);
    const x0 = Math.round(column * png.width / 3) + 4;
    const x1 = Math.round((column + 1) * png.width / 3) - 4;
    const y0 = Math.round(row * png.height / 3) + 4;
    const y1 = Math.round((row + 1) * png.height / 3) - 4;
    const corners = [pixel(png, x0, y0), pixel(png, x1 - 1, y0), pixel(png, x0, y1 - 1), pixel(png, x1 - 1, y1 - 1)];
    const background = [0, 1, 2].map(channel => corners.reduce((sum, color) => sum + color[channel], 0) / corners.length);
    const pal = allowed.map(id => [id, rgb(id)]);
    const grid = Array.from({ length: H }, () => Array(W).fill(0));
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const samples = [];
        for (const dy of [.2, .5, .8]) for (const dx of [.2, .5, .8]) {
            samples.push(pixel(png, Math.min(x1 - 1, Math.floor(x0 + (c + dx) / W * (x1 - x0))),
                Math.min(y1 - 1, Math.floor(y0 + (r + dy) / H * (y1 - y0)))));
        }
        const average = [0, 1, 2].map(channel => samples.reduce((sum, color) => sum + color[channel], 0) / samples.length);
        const contrast = Math.sqrt(distance(average, background));
        const saturation = Math.max(...average) - Math.min(...average);
        if (contrast < 24 && saturation < 32) continue;
        grid[r][c] = pal.reduce((best, item) => distance(average, item[1]) < distance(average, best[1]) ? item : best)[0];
    }
    return grid;
}

function owner(index, x, y) {
    switch (index) {
    case 0: return x < .5 ? 1 : 2;
    case 1: return x < .48 + .08 * Math.sin(y * 8) ? 1 : 2;
    case 2: return y < .47 || (y < .67 && x > .25 && x < .75) ? 1 : 2;
    case 3: return ((x - .5) / .38) ** 2 + ((y - .56) / .45) ** 2 < 1 ? 2 : 1;
    case 4: return x < .5 + .14 * Math.sin((y - .1) * Math.PI * 2) ? 1 : 2;
    case 5: return y < .39 ? 1 : 2;
    case 6: return x < .5 + .06 * Math.sin(y * 11) ? 1 : 2;
    case 7: return y < .5 + .04 * Math.sin(x * Math.PI * 3) ? 1 : 2;
    case 8: return y < .57 ? 1 : 2;
    default: throw new Error('unknown cooperation partition');
    }
}

function components(grid, predicate) {
    const seen = new Set(), result = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const key = r * W + c;
        if (seen.has(key) || !predicate(r, c)) continue;
        const cells = [[r, c]]; seen.add(key);
        for (let i = 0; i < cells.length; i++) {
            const [y, x] = cells[i];
            for (const [yy, xx] of [[y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]]) {
                const next = yy * W + xx;
                if (yy >= 0 && yy < H && xx >= 0 && xx < W && !seen.has(next) && predicate(yy, xx)) {
                    seen.add(next); cells.push([yy, xx]);
                }
            }
        }
        result.push(cells);
    }
    return result;
}

function write(file, value) {
    const text = JSON.stringify(value, null, 2).replace(/\[\n(?:\s+\d+,?\n)+\s+\]/g, row => JSON.stringify(JSON.parse(row))) + '\n';
    const lines = text.match(/[^\n]*\n/g);
    fs.writeFileSync(file, lines.slice(0, 300).join(''));
    for (let i = 300; i < lines.length; i += 300) fs.appendFileSync(file, lines.slice(i, i + 300).join(''));
}

function main() {
    const concept = PNG.sync.read(fs.readFileSync(CONCEPT));
    const refs = Array.from({ length: 182 }, (_, i) => JSON.parse(fs.readFileSync(path.join(__dirname, 'dbt', `level_${i + 1}.json`))));
    const profile = shuffle.learnProfile(refs);
    const manifest = JSON.parse(fs.readFileSync(MANIFEST));
    assert.deepEqual(manifest.levels.map(entry => entry.levelId), Array.from({ length: 11 }, (_, i) => i + 1), 'Generate only after the 1-11 migration');
    const entries = [];
    for (let index = 0; index < specs.length; index++) {
        const spec = specs[index], levelId = 12 + index, grid = extract(concept, index, spec.colors);
        for (const cells of components(grid, (r, c) => grid[r][c] > 0)) if (cells.length < 4) for (const [r, c] of cells) grid[r][c] = 0;
        const regions = grid.map((row, r) => row.map((value, c) => value ? owner(index, (c + .5) / W, (r + .5) / H) : 0));
        for (const role of [1, 2]) for (const cells of components(grid, (r, c) => regions[r][c] === role)) {
            if (cells.length < 8) for (const [r, c] of cells) regions[r][c] = 3 - role;
        }
        const parts = [1, 2].map(role => grid.map((row, r) => row.map((value, c) => regions[r][c] === role ? value : 0)));
        const counts = parts.map(part => part.flat().filter(Boolean).length);
        assert(counts[0] + counts[1] > 1000, `${spec.name}: too few beans`);
        assert(Math.min(...counts) >= 350, `${spec.name}: cooperation part too small ${counts}`);
        assert(Math.min(...counts) / Math.max(...counts) >= .52, `${spec.name}: cooperation imbalance ${counts}`);
        const seeds = [202609141200 + index * 20, 202609141201 + index * 20];
        const initial = parts.map((part, role) => {
            for (let attempt = 0; attempt < 30; attempt++) {
                const seed = seeds[role] + attempt;
                const candidate = shuffle.generate(part, { profile, seed, strictMismatch: true, outlineGrid: part });
                const run = controllerReplay({ levelId, Hard: 0, boardWidth: W, boardHeight: H, timeLimit: 600,
                    slotTotalCount: counts[role], conveyorCapacity: 60, correctColorArr: part, initRandomColorArr: candidate });
                if (run.terminalType === 'PASS') { seeds[role] = seed; return candidate; }
            }
            throw new Error(`${spec.name}: no solvable shuffle for role ${role}`);
        });
        const level = { levelId, Hard: spec.score >= 70 ? 1 : 0, boardWidth: W, boardHeight: H, timeLimit: 600,
            slotTotalCount: counts[0] + counts[1], conveyorCapacity: 60, correctColorArr: grid,
            initRandomColorArr: initial[0].map((row, r) => row.map((value, c) => value || initial[1][r][c])), coopRegions: regions };
        const file = `coop_level_${levelId}.json`, target = path.join(LEVEL_DIR, file);
        write(target, level);
        for (const [suffix, image] of [['full', grid], ['creator', parts[0]], ['collaborator', parts[1]]]) {
            fs.writeFileSync(path.join(OUT, `${levelId}-${suffix}.png`), render(image, 7));
        }
        entries.push({ levelId, name: spec.name, english: spec.english, file, beanCount: counts[0] + counts[1],
            creatorBeanCount: counts[0], collaboratorBeanCount: counts[1], split: { type: spec.split, field: 'coopRegions' },
            cooperationReveal: spec.reveal, difficultyTier: index < 3 ? '轻松默契' : index < 6 ? '趣味协作' : index < 8 ? '高阶揭晓' : '压轴庆典',
            difficultyScore: spec.score, seeds, collectionId: `coop_wonder_${String(index + 1).padStart(2, '0')}`,
            conceptSource: 'tools/generated_levels/coop-finale-9/concept.png',
            sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') });
        console.log(`${levelId}. ${spec.name}: ${counts.join(' + ')}, ${spec.colors.length} colors, score ${spec.score}`);
    }
    manifest.levels = [...manifest.levels, ...entries];
    write(MANIFEST, manifest);
    write(path.join(OUT, 'manifest.json'), { levels: entries });
}

if (require.main === module) main();
module.exports = { OUT, CONCEPT, specs, extract, owner };
