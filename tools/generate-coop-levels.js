'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const shuffle = require('./shuffle-comparison');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'generated_levels', 'coop-original-10');
const LEVEL_DIR = path.join(ROOT, 'assets', 'LevelData');
const MANIFEST = path.join(ROOT, 'assets', 'GameAssetsBundle', 'coop-manifest.json');
const W = 64, H = 56;
const specs = [
    ['月光双猫', 'Moonlight cats', 'cat', 4, 20, 14, 13],
    ['草莓双兔', 'Strawberry rabbits', 'rabbit', 20, 5, 14, 1],
    ['蜂蜜伙伴', 'Honey bears', 'bear', 16, 4, 6, 3],
    ['森林双狐', 'Forest foxes', 'fox', 4, 5, 20, 12],
    ['极地相伴', 'Polar penguins', 'penguin', 18, 7, 20, 2],
    ['花园小鸡', 'Garden chicks', 'chick', 3, 6, 20, 14],
    ['双鲸之歌', 'Whale duet', 'whale', 13, 7, 2, 20],
    ['星夜猫头鹰', 'Starlight owls', 'owl', 16, 8, 6, 15],
    ['围巾小狗', 'Scarf puppies', 'puppy', 5, 6, 20, 10],
    ['温泉水豚', 'Onsen capybaras', 'capybara', 16, 5, 6, 13],
];

function halfArt(kind, body, light, accent) {
    const g = Array.from({ length: H }, () => Array(32).fill(0));
    const put = (x, y, c) => { if (x >= 0 && x < 32 && y >= 0 && y < H) g[y][x] = c; };
    const rect = (x, y, w, h, c) => {
        for (let r = y; r < y + h; r++) for (let q = x; q < x + w; q++) put(q, r, c);
    };
    const ellipse = (x, y, rx, ry, c) => {
        for (let r = Math.floor(y - ry); r <= y + ry; r++) for (let q = Math.floor(x - rx); q <= x + rx; q++) {
            if (((q - x) / rx) ** 2 + ((r - y) / ry) ** 2 <= 1) put(q, r, c);
        }
    };
    const poly = (points, c) => {
        for (let y = 0; y < H; y++) for (let x = 0; x < 32; x++) {
            let inside = false;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const [xi, yi] = points[i], [xj, yj] = points[j];
                if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < (xj - xi) * (y + 0.5 - yi) / (yj - yi) + xi) inside = !inside;
            }
            if (inside) put(x, y, c);
        }
    };
    const eye = (x, y) => { rect(x, y, 3, 4, 19); put(x, y, 20); };
    const face = (y) => {
        eye(10, y); eye(21, y); rect(16, y + 5, 3, 2, 19);
        rect(7, y + 5, 4, 2, 14); rect(23, y + 5, 4, 2, 14);
    };
    const star = (x, y, c) => { rect(x - 1, y - 3, 3, 7, c); rect(x - 3, y - 1, 7, 3, c); };
    const heart = (x, y, c) => {
        poly([[x - 5,y],[x - 3,y - 3],[x,y - 1],[x + 3,y - 3],[x + 5,y],[x + 5,y + 3],[x,y + 8],[x - 5,y + 3]], c);
    };
    if (kind === 'whale') {
        ellipse(16, 48, 15, 5, 2); rect(4, 48, 25, 2, 13);
        poly([[1,23],[8,28],[10,21],[13,31],[8,38],[2,35]], body);
        ellipse(19, 33, 12, 13, body); ellipse(20, 39, 10, 6, light);
        poly([[16,38],[12,46],[24,42]], body); eye(24, 29); rect(25, 36, 4, 2, 14);
        rect(17, 12, 3, 10, 2); ellipse(13, 12, 5, 3, 2); ellipse(23, 10, 5, 3, 2);
        star(6, 8, 3); ellipse(5, 19, 2, 2, light); ellipse(28, 17, 2, 2, accent);
    } else if (kind === 'penguin') {
        ellipse(16, 50, 15, 4, 2); ellipse(16, 49, 12, 2, 20);
        ellipse(11, 47, 6, 3, 4); ellipse(23, 47, 6, 3, 4);
        ellipse(17, 32, 12, 17, body); ellipse(17, 35, 8, 12, light);
        ellipse(6, 33, 4, 10, body); ellipse(28, 33, 3, 10, body);
        ellipse(13, 24, 6, 7, light); ellipse(22, 24, 6, 7, light); eye(11, 23); eye(22, 23);
        poly([[15,29],[22,29],[18,33]], 4); rect(8, 33, 20, 4, accent); rect(22, 36, 4, 8, accent);
        star(6, 9, 2); star(26, 7, 20); rect(12, 12, 12, 4, accent); rect(15, 8, 7, 5, accent);
    } else {
        ellipse(16, 51, 15, 3, kind === 'capybara' ? 13 : 12);
        if (kind === 'rabbit') {
            ellipse(10, 13, 5, 12, body); ellipse(24, 13, 5, 12, body);
            ellipse(10, 12, 2, 8, 14); ellipse(24, 12, 2, 8, 14);
        } else if (kind === 'cat' || kind === 'fox' || kind === 'owl') {
            poly([[4,20],[5,4],[16,14],[28,4],[30,22]], body);
            poly([[7,16],[8,8],[13,14]], accent); poly([[21,14],[26,8],[27,17]], accent);
        } else if (kind !== 'chick') {
            ellipse(7, 16, 6, 7, body); ellipse(26, 16, 5, 7, body);
            ellipse(7, 16, 3, 4, accent); ellipse(26, 16, 2, 4, accent);
        }
        ellipse(17, 39, 12, 12, body); ellipse(17, 41, 8, 9, light);
        ellipse(9, 49, 6, 3, body); ellipse(25, 49, 6, 3, body);
        ellipse(17, 24, 13, 12, body);
        if (kind === 'fox') {
            poly([[5,23],[17,31],[29,23],[25,33],[17,36],[9,33]], light); face(21);
            poly([[2,35],[7,40],[5,48],[1,45]], body);
        } else if (kind === 'owl') {
            ellipse(11, 24, 7, 8, light); ellipse(24, 24, 6, 8, light); eye(10, 22); eye(23, 22);
            poly([[14,29],[21,29],[17,33]], 4);
            for (let y = 37; y < 47; y += 4) for (let x = 12; x < 25; x += 5) rect(x, y, 2, 2, body);
        } else if (kind === 'capybara') {
            ellipse(20, 29, 10, 7, light); rect(9, 23, 4, 2, 19); rect(23, 23, 4, 2, 19);
            rect(20, 29, 3, 2, 19); ellipse(17, 9, 4, 4, 4); rect(18, 4, 3, 2, 11);
        } else {
            if (kind === 'bear' || kind === 'puppy') ellipse(17, 29, 7, 5, light);
            if (kind === 'puppy') { ellipse(6, 26, 4, 10, body); ellipse(28, 26, 3, 10, body); }
            face(22);
            if (kind === 'cat') { rect(14, 13, 2, 5, light); rect(19, 13, 2, 5, light); }
            if (kind === 'chick') { poly([[14,28],[22,28],[18,33]], 4); rect(15, 10, 3, 4, 4); rect(18, 8, 3, 6, 4); }
        }
        ellipse(7, 39, 4, 7, body); ellipse(27, 39, 4, 7, body);
        if (kind === 'cat') {
            heart(18, 40, accent); ellipse(5, 7, 4, 4, 3); ellipse(7, 5, 3, 3, 0); star(27, 5, 3);
        } else if (kind === 'rabbit') {
            heart(18, 39, 10); rect(15, 35, 7, 2, 11); put(15, 41, 6); put(21, 41, 6); put(18, 44, 6);
        } else if (kind === 'bear') {
            rect(11, 38, 14, 10, 3); rect(12, 36, 12, 3, 16); rect(13, 42, 10, 3, 6); star(6, 5, 3);
        } else if (kind === 'fox') {
            rect(9, 34, 18, 4, accent); poly([[17,38],[23,38],[22,46],[18,43]], accent); star(4, 8, 3);
        } else if (kind === 'chick') {
            rect(17, 39, 2, 10, 12); ellipse(13, 45, 4, 2, 11);
            poly([[12,36],[12,31],[16,34],[18,30],[20,34],[24,31],[24,36],[21,40],[15,40]], accent); star(5, 9, 3);
        } else if (kind === 'owl') {
            rect(3, 50, 28, 3, 16); star(4, 6, 3); star(27, 7, 3);
        } else if (kind === 'puppy') {
            rect(8, 34, 21, 5, accent); rect(21, 38, 5, 9, accent); rect(21, 43, 5, 2, 20); heart(4, 6, 14);
        } else if (kind === 'capybara') {
            ellipse(16, 47, 15, 6, 13); rect(4, 45, 24, 2, 2); rect(8, 50, 15, 1, 2);
            rect(3, 5, 2, 6, 15); rect(5, 1, 2, 5, 15); rect(27, 3, 2, 6, 15);
        }
    }
    const shade = { 3: 4, 4: 10, 5: 14, 6: 3, 7: 18, 8: 7, 13: 18, 16: 17, 18: 7, 20: 15 }[body];
    assert(shade, `missing character shade for ${body}`);
    for (let y = 0; y < H; y++) for (let x = 0; x < 32; x++) {
        if (g[y][x] === body && x < 14) g[y][x] = shade;
    }
    return g;
}

function palette() {
    const source = fs.readFileSync(path.join(ROOT, 'assets/Scripts/Core/LevelConfig.ts'), 'utf8');
    const body = source.match(/export const COLOR_HEX: Record<number, string> = \{([\s\S]*?)\};/);
    assert(body, 'official palette missing');
    const colors = Object.fromEntries([...body[1].matchAll(/(\d+): '(#[A-Fa-f0-9]{6})'/g)].map(m => [m[1], m[2]]));
    assert.equal(Object.keys(colors).length, 20);
    return colors;
}

function render(grid, colors, scale = 6) {
    const png = new PNG({ width: W * scale, height: H * scale });
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
        const color = colors[grid[Math.floor(y / scale)][Math.floor(x / scale)]] || '#DCE3E3';
        const rgb = color.slice(1).match(/../g).map(v => parseInt(v, 16));
        const index = (y * png.width + x) * 4;
        png.data.set([...rgb, 255], index);
    }
    return png;
}

function writeJson(file, value) {
    const destination = file === 'manifest.json' ? MANIFEST : path.join(LEVEL_DIR, file);
    const text = JSON.stringify(value, null, 2).replace(/\[\n(?:\s+\d+,?\n)+\s+\]/g, row => JSON.stringify(JSON.parse(row))) + '\n';
    const lines = text.match(/[^\n]*\n/g);
    fs.writeFileSync(destination, lines.slice(0, 300).join(''));
    for (let i = 300; i < lines.length; i += 300) fs.appendFileSync(destination, lines.slice(i, i + 300).join(''));
}

function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const colors = palette();
    const refs = Array.from({ length: 182 }, (_, i) => JSON.parse(fs.readFileSync(path.join(__dirname, 'dbt', `level_${i + 1}.json`), 'utf8')));
    const profile = shuffle.learnProfile(refs);
    const entries = [];
    for (let i = 0; i < specs.length; i++) {
        const [name, english, kind, a, b, light, accent] = specs[i];
        const left = halfArt(kind, a, light, accent);
        const right = halfArt(kind, b, light, accent).map(row => row.slice().reverse());
        assert.deepEqual(left.map(row => row.map(Boolean)), right.map(row => row.slice().reverse().map(Boolean)), 'half outlines must match');
        const correctColorArr = left.map((row, r) => row.concat(right[r]));
        const halfCount = left.flat().filter(v => v > 0).length;
        assert(halfCount * 2 > 1000, `${name}: only ${halfCount * 2} beans`);
        const seeds = [2026091000 + i * 2, 2026091001 + i * 2];
        const initial = [left, right].map((grid, n) => shuffle.generate(grid, { profile, seed: seeds[n], strictMismatch: true, outlineGrid: grid }));
        const level = { levelId: i + 1, Hard: 0, boardWidth: W, boardHeight: H,
            timeLimit: 600, slotTotalCount: 12, conveyorCapacity: 60,
            correctColorArr, initRandomColorArr: initial[0].map((row, r) => row.concat(initial[1][r])) };
        const file = `coop_level_${i + 1}.json`;
        writeJson(file, level);
        fs.writeFileSync(path.join(OUT, `coop_level_${i + 1}.png`), PNG.sync.write(render(correctColorArr, colors)));
        const entry = { levelId: i + 1, name, english, file, beanCount: halfCount * 2,
            creatorBeanCount: halfCount, collaboratorBeanCount: halfCount,
            split: { axis: 'column', boundary: 32, creatorColumns: [0, 31], collaboratorColumns: [32, 63] },
            seeds, collectionId: `coop_original_${String(i + 1).padStart(2, '0')}`,
            sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(LEVEL_DIR, file))).digest('hex') };
        entries.push(entry);
        console.log(`${i + 1}. ${name}: ${halfCount * 2} (${halfCount} + ${halfCount})`);
    }
    writeJson('manifest.json', { schemaVersion: 1, status: 'offline-candidate', originalArtwork: true,
        mode: 'creator-half-independent-collaborator-half', boardWidth: W, boardHeight: H,
        timeLimitNote: '600 seconds is an offline solver/preview parameter; cooperative timer policy is not implemented.',
        shuffle: { tool: 'tools/shuffle-comparison.js', referenceCount: 182, strictMismatch: true }, levels: entries });
    const sheet = new PNG({ width: W * 5 * 5, height: H * 5 * 2 });
    for (let i = 0; i < entries.length; i++) {
        const level = JSON.parse(fs.readFileSync(path.join(LEVEL_DIR, entries[i].file), 'utf8'));
        const png = render(level.correctColorArr, colors, 5);
        PNG.bitblt(png, sheet, 0, 0, png.width, png.height, i % 5 * png.width, Math.floor(i / 5) * png.height);
    }
    fs.writeFileSync(path.join(OUT, 'contact-sheet.png'), PNG.sync.write(sheet));
    const data = entries.map(entry => ({ ...entry, ...JSON.parse(fs.readFileSync(path.join(LEVEL_DIR, entry.file), 'utf8')) }));
    fs.writeFileSync(path.join(OUT, 'preview.html'), previewHtml(data, colors));
}

function previewHtml(levels, colors) {
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>一人一半 · 合作拼图 10 关</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f3ed;color:#302d35;font:15px system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:44px 24px}header{margin-bottom:30px}h1{font-size:38px;margin:10px 0}p{line-height:1.8;color:#716971}.tag{color:#7d667f;font-size:12px;letter-spacing:3px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}article{background:#fffcf7;border:1px solid #ded7cf;border-radius:16px;overflow:hidden}canvas{width:100%;height:auto;display:block;image-rendering:pixelated}.info{padding:20px;border-top:1px solid #e8e0d7}h2{font-size:20px;margin:0 0 8px}small{color:#7d737a}button{border:1px solid #d0c7cc;border-radius:8px;background:#fffaf4;padding:9px 13px;cursor:pointer;color:#514456;margin:12px 6px 0 0}button[aria-pressed=true]{background:#55425e;color:white}.count{float:right;color:#796183;font-size:14px}a{color:#796183}@media(max-width:650px){.grid{grid-template-columns:1fr}h1{font-size:28px}}</style>
<main><header><span class="tag">CO-OP COLLECTION / ORIGINAL SERIES 01</span><h1>一人一半，一起收藏。</h1><p>10 张合作专属像素图 · 每张超过 1000 颗豆豆 · 左右各 50%<br>发起者完成左半；每位参与者独立完成右半。此页为离线关卡审阅，尚未接入合作玩法。</p></header><section class="grid"></section></main>
<script>const levels=${JSON.stringify(levels)},colors=${JSON.stringify(colors)};
for(const level of levels){const card=document.createElement('article');card.innerHTML='<canvas width="512" height="448"></canvas><div class="info"><span class="count">'+level.beanCount+' 颗</span><h2>'+String(level.levelId).padStart(2,'0')+' / '+level.name+'</h2><small>发起者 '+level.creatorBeanCount+' · 合作者 '+level.collaboratorBeanCount+' · 64 × 56</small><div><button data-mode="target" aria-pressed="true">完整图案</button><button data-mode="split" aria-pressed="false">分享时效果</button><button data-mode="initial" aria-pressed="false">初始乱序</button></div></div>';document.querySelector('.grid').append(card);const ctx=card.querySelector('canvas').getContext('2d');function draw(mode){ctx.fillStyle='#f6f3ed';ctx.fillRect(0,0,512,448);const grid=mode==='initial'?level.initRandomColorArr:level.correctColorArr;for(let y=0;y<56;y++)for(let x=0;x<64;x++){if(!grid[y][x])continue;ctx.globalAlpha=mode==='split'&&x>=32?.18:1;ctx.fillStyle=colors[grid[y][x]];ctx.fillRect(x*8,y*8,8,8)}ctx.globalAlpha=1;if(mode==='split'){ctx.setLineDash([4,6]);ctx.strokeStyle='#8c7488';ctx.beginPath();ctx.moveTo(256,8);ctx.lineTo(256,440);ctx.stroke();ctx.setLineDash([])}}card.querySelectorAll('button').forEach(button=>button.onclick=()=>{card.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));draw(button.dataset.mode)});draw('target')}
</script></html>`;
}

if (require.main === module) main();
module.exports = { OUT, LEVEL_DIR, MANIFEST, specs, halfArt, palette };
