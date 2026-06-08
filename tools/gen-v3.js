#!/usr/bin/env node
// Minimal fast generator - uses only ellipses and rects
const fs = require('fs');
const path = require('path');

function mulberry32(a) {
    return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const S = (g, y, x, c) => { if (y >= 0 && y < g.length && g[y] && x >= 0 && x < g[y].length) g[y][x] = c; };

function drawEllipse(g, cx, cy, rx, ry, c) {
    for (let y = 0; y < g.length; y++) {
        for (let x = 0; x < g[0].length; x++) {
            if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) S(g, y, x, c);
        }
    }
}

function drawRect(g, x1, y1, x2, y2, c) {
    for (let y = Math.max(0, y1); y <= Math.min(g.length - 1, y2); y++)
        for (let x = Math.max(0, x1); x <= Math.min(g[0].length - 1, x2); x++)
            S(g, y, x, c);
}

function makeOutline(g, bodyColor, outlineColor) {
    let h = g.length, w = g[0].length, outline = [];
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            if (g[y][x] === bodyColor)
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dy === 0 && dx === 0) continue;
                        let ny = y + dy, nx = x + dx;
                        if (ny < 0 || ny >= h || nx < 0 || nx >= w || g[ny][nx] === 0) {
                            outline.push([y, x]); dy = 2; break;
                        }
                    }
    for (let [y, x] of outline) g[y][x] = outlineColor;
}

function addDetails(g, bodyColor, detailColors, rng, effColors) {
    // Simple: pick a few random body cells and change to detail colors
    let cells = [];
    for (let y = 0; y < g.length; y++)
        for (let x = 0; x < g[0].length; x++)
            if (g[y][x] === bodyColor) cells.push([y, x]);
    
    const count = Math.min(effColors, 5);
    for (let i = 0; i < count && cells.length > 0; i++) {
        let idx = Math.floor(rng() * cells.length);
        let [cy, cx] = cells[idx];
        // Small 3x3 patch
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
                if (g[cy + dy] && g[cy + dy][cx + dx] === bodyColor)
                    g[cy + dy][cx + dx] = detailColors[i % detailColors.length];
    }
    
    // Rare pixels
    if (effColors > 5) {
        cells = [];
        for (let y = 0; y < g.length; y++)
            for (let x = 0; x < g[0].length; x++)
                if (g[y][x] === bodyColor) cells.push([y, x]);
        for (let i = 5; i < effColors && cells.length > 0; i++) {
            let idx = Math.floor(rng() * cells.length);
            let [cy, cx] = cells[idx];
            S(g, cy, cx, detailColors[i % detailColors.length]);
        }
    }
}

function generateLevel(levelId, width, height, colorCount, theme, isBoss) {
    const g = Array.from({ length: height }, () => Array(width).fill(0));
    const rng = mulberry32(levelId * 7919 + 104729);
    const effColors = Math.min(colorCount, isBoss ? 8 : 6);
    const BODY = 1, OUTLINE = 2;
    const DETAIL_COLORS = [3, 4, 5, 6, 7, 8, 9, 10];
    const cx = Math.floor(width / 2), cy = Math.floor(height / 2);
    
    // Theme hash for shape variation
    let themeHash = 0;
    for (let ch of theme) themeHash = ((themeHash << 5) - themeHash + ch.charCodeAt(0)) | 0;
    themeHash = Math.abs(themeHash);
    const shapeType = themeHash % 6;
    
    // Draw main shape using simple primitives
    const r = Math.min(width, height) * 0.48;
    
    switch (shapeType) {
        case 0: // Single large ellipse
            drawEllipse(g, cx, cy, Math.floor(r * 1.1), Math.floor(r * 1.2), BODY);
            break;
        case 1: // Two overlapping ellipses
            drawEllipse(g, cx - Math.floor(r * 0.3), cy, Math.floor(r * 0.8), Math.floor(r * 0.9), BODY);
            drawEllipse(g, cx + Math.floor(r * 0.3), cy, Math.floor(r * 0.8), Math.floor(r * 0.9), BODY);
            break;
        case 2: // Rectangle with rounded top (ellipse)
            drawRect(g, cx - Math.floor(r * 0.7), cy, cx + Math.floor(r * 0.7), cy + Math.floor(r * 1.2), BODY);
            drawEllipse(g, cx, cy, Math.floor(r * 0.8), Math.floor(r * 0.5), BODY);
            break;
        case 3: // Vertical stack of ellipses
            drawEllipse(g, cx, cy - Math.floor(r * 0.5), Math.floor(r * 0.7), Math.floor(r * 0.6), BODY);
            drawEllipse(g, cx, cy + Math.floor(r * 0.5), Math.floor(r * 0.7), Math.floor(r * 0.6), BODY);
            break;
        case 4: // Large diamond (rect rotated)
            drawRect(g, cx - Math.floor(r * 0.3), cy - Math.floor(r * 1.2), cx + Math.floor(r * 0.3), cy + Math.floor(r * 1.2), BODY);
            drawRect(g, cx - Math.floor(r * 1.0), cy - Math.floor(r * 0.3), cx + Math.floor(r * 1.0), cy + Math.floor(r * 0.3), BODY);
            break;
        case 5: // Cluster of small ellipses
            for (let i = 0; i < 5; i++) {
                let ox = cx + Math.floor((rng() - 0.5) * width * 0.4);
                let oy = cy + Math.floor((rng() - 0.5) * height * 0.4);
                drawEllipse(g, ox, oy, Math.floor(r * 0.35), Math.floor(r * 0.3), BODY);
            }
            break;
    }

    // Fill gaps within bounding box for high fill rate
    let minY = g.length, maxY = 0, minX = g[0].length, maxX = 0;
    for (let y = 0; y < g.length; y++)
        for (let x = 0; x < g[0].length; x++)
            if (g[y][x] > 0) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++)
            if (g[y][x] === 0) g[y][x] = BODY;

    // Outline
    makeOutline(g, BODY, OUTLINE);
    
    // Details
    addDetails(g, BODY, DETAIL_COLORS, rng, effColors);
    
    return g;
}

function shufflePattern(correct, difficulty, levelId) {
    const h = correct.length, w = correct[0].length;
    const init = Array.from({ length: h }, () => Array(w).fill(0));
    const nonZero = [], positions = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        if (correct[r][c] > 0) { nonZero.push(correct[r][c]); positions.push([r, c]); }
    }
    const rng = mulberry32(levelId * 7 + 1);
    for (let i = nonZero.length - 1; i > 0; i--) {
        let j = Math.floor(rng() * (i + 1));
        [nonZero[i], nonZero[j]] = [nonZero[j], nonZero[i]];
    }
    for (let i = positions.length - 1; i > 0; i--) {
        let j = Math.floor(rng() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    for (let i = 0; i < nonZero.length; i++) {
        init[positions[i][0]][positions[i][1]] = nonZero[i];
    }
    return init;
}

function countNonZero(grid) {
    let count = 0;
    for (const row of grid) for (const v of row) if (v > 0) count++;
    return count;
}

// Templates for levels 1-50
const TEMPLATES = {/* same as before */};

// Level specs
const LEVEL_SPECS_1_50 = [
    [1,8,7,2,"爱心",60,1,false],[2,9,8,2,"五角星",60,1,false],[3,9,8,3,"弯月",60,1,false],[4,10,8,3,"云朵",60,1,false],
    [5,10,10,3,"小福字",70,2,false],[6,10,10,3,"小灯笼",70,1,false],[7,10,10,4,"小花",80,1,false],[8,10,10,4,"平安扣",80,1,false],
    [9,10,10,4,"中国结",80,2,false],[10,10,10,4,"金元宝",80,2,false],[11,12,11,4,"小锦鲤",90,2,false],[12,12,12,4,"折扇",90,2,false],
    [13,12,12,4,"茶壶",90,2,false],[14,12,12,4,"梅花",90,2,false],[15,14,12,5,"熊猫头像",100,3,true],[16,14,12,5,"玉如意",100,2,false],
    [17,16,10,5,"祥云纹",100,2,false],[18,16,10,5,"山纹",100,2,false],[19,14,10,5,"水波纹",110,3,false],[20,12,14,5,"古风窗纹",120,3,false],
    [21,14,12,5,"兔子",90,2,false],[22,12,12,5,"小猫",90,2,false],[23,12,12,6,"柿子",100,3,false],[24,13,12,6,"橘子",100,3,false],
    [25,14,14,6,"古风花瓶",120,4,true],[26,13,12,6,"荷叶",100,3,false],[27,12,12,6,"莲蓬",110,3,false],[28,14,12,6,"竹子",110,3,false],
    [29,12,13,6,"兰花",110,3,false],[30,12,16,6,"玉佩套装",120,4,true],[31,16,16,6,"小亭子",120,3,false],[32,16,16,6,"小桥",120,3,false],
    [33,14,13,7,"牡丹简形",130,3,false],[34,14,13,7,"菊花",130,3,false],[35,16,13,7,"完整锦鲤",140,4,true],[36,14,16,7,"仙鹤简形",120,3,false],
    [37,14,16,7,"鹿纹",130,3,false],[38,12,12,7,"福袋",130,3,false],[39,12,12,7,"铜钱纹",130,3,false],[40,16,14,7,"古风面具",140,4,true],
    [41,12,12,7,"简山水",120,3,false],[42,14,13,8,"仕女头像",140,3,false],[43,14,12,8,"书生头像",140,3,false],[44,12,12,8,"小龙纹",150,4,true],
    [45,14,14,8,"小凤纹",150,4,true],[46,16,12,8,"古琴",120,3,false],[47,16,14,8,"围棋",130,3,false],[48,16,13,8,"书籍",130,3,false],
    [49,16,13,8,"画卷",130,3,false],[50,16,17,8,"古风建筑小全景",150,5,true],
];

const EXTRA_SPECS = [
    [51,"完整牡丹",18,18,8,120,4,false],[52,"荷塘",18,18,9,130,4,false],[53,"松鹤图",18,18,9,130,4,false],[54,"年年有余",18,18,9,140,4,false],
    [55,"麒麟简形",20,20,9,150,5,true],[56,"古风团扇",18,18,9,120,4,false],[57,"香囊",18,18,9,130,4,false],[58,"发簪",18,18,9,130,4,false],
    [59,"流苏玉佩",18,18,9,140,4,false],[60,"山水小全景",20,20,9,150,5,true],[61,"龙纹半身",20,20,9,150,4,false],[62,"凤纹半身",20,20,10,160,4,false],
    [63,"古城门",20,20,10,160,4,false],[64,"宝塔",20,20,10,160,4,false],[65,"神兽纹",20,20,10,180,5,true],[66,"竹林",20,20,10,150,4,false],
    [67,"梅花枝",20,20,10,160,4,false],[68,"菊花丛",20,20,10,160,4,false],[69,"兰草丛",20,20,10,160,4,false],[70,"完整山水",20,20,10,180,5,true],
    [71,"小花轿",20,20,10,150,4,false],[72,"龙凤呈祥",22,22,11,180,5,true],[73,"富贵花开",22,22,11,180,5,true],[74,"百福图简版",22,22,11,180,5,true],
    [75,"完整麒麟",22,22,11,180,5,true],[76,"仙鹤齐飞",22,22,11,150,4,false],[77,"锦鲤群",22,22,11,180,5,true],[78,"古风庭院",22,22,11,180,5,true],
    [79,"琴棋书画套装",22,22,11,180,5,true],[80,"宫殿局部",22,22,11,180,5,true],[81,"龙身",20,20,11,160,5,false],[82,"凤身",20,20,12,180,5,true],
    [83,"古画局部",20,20,12,180,5,true],[84,"江山图局部",20,20,12,180,5,true],[85,"神兽组合",20,20,12,180,5,true],[86,"古风婚礼小景",20,20,12,160,5,false],
    [87,"百鸟朝凤简版",22,22,12,180,5,true],[88,"山水长卷",24,22,12,180,5,true],[89,"福瑞满堂",24,22,12,180,5,true],[90,"国风全景大图",24,22,12,180,6,true],
    [91,"满屏龙纹",22,22,12,160,5,false],[92,"满屏凤纹",22,22,12,180,5,true],[93,"宫殿局部全景",24,22,12,180,5,true],[94,"大幅山水",24,22,12,180,5,true],
    [95,"龙凤合体",22,22,12,180,5,true],[96,"满屏百福",22,22,12,180,5,true],[97,"神兽全家福",24,22,12,180,5,true],[98,"盛世小景",24,22,12,180,5,true],
    [99,"终极对称神兽",24,22,12,180,5,true],[100,"国风盛世全景",24,22,12,180,6,true],
    [101,"剪纸福字",20,20,8,150,4,false],[102,"剪纸窗花",20,20,8,150,4,false],[103,"皮影小人",20,20,9,160,4,false],[104,"京剧脸谱简形",20,20,9,160,4,false],
    [105,"大红灯笼串",20,20,9,180,5,true],[106,"鞭炮串",20,20,9,150,4,false],[107,"风筝",20,20,9,160,4,false],[108,"龙舟船头",20,20,10,170,4,false],
    [109,"粽子组合",20,20,10,170,4,false],[110,"月饼礼盒",20,20,10,180,5,true],[111,"舞狮头",22,22,10,170,4,false],[112,"龙头局部",22,22,10,170,4,false],
    [113,"古风花轿局部",22,22,10,170,4,false],[114,"玉璧纹",22,22,10,170,4,false],[115,"饕餮纹简版",22,22,10,190,5,true],[116,"编钟",22,22,10,170,4,false],
    [117,"鼎纹",22,22,10,170,4,false],[118,"铜镜纹",22,22,10,180,4,false],[119,"古钱币串",22,22,10,180,4,false],[120,"长命锁",22,22,10,190,5,true],
    [121,"玉兔",22,22,10,170,4,false],[122,"嫦娥简形",22,22,10,180,4,false],[123,"桂花枝",22,22,10,180,4,false],[124,"广寒宫剪影",22,22,10,180,4,false],
    [125,"神话仙鹿",22,22,10,200,5,true],[126,"神龟",22,22,10,170,4,false],[127,"金蟾",22,22,10,180,4,false],[128,"蝙蝠献福",22,22,10,180,4,false],
    [129,"貔貅半身",22,22,10,190,4,false],[130,"四象简纹合集",22,22,10,200,5,true],[131,"远山层叠",22,22,10,180,4,false],[132,"流水瀑布",22,22,10,180,4,false],
    [133,"云海",22,22,10,180,4,false],[134,"山水渔隐图",22,22,10,200,5,true],[135,"松针满屏",22,22,10,210,4,false],[136,"竹影",22,22,10,190,4,false],
    [137,"枫叶",22,22,10,190,4,false],[138,"银杏叶",22,22,10,190,4,false],[139,"四季花木合集",22,22,10,200,5,true],[140,"古风书架",22,22,10,180,4,false],
    [141,"文房四宝",22,22,10,190,4,false],[142,"笔筒",22,22,10,190,4,false],[143,"镇纸",22,22,10,190,4,false],[144,"文人雅集剪影",22,22,10,200,5,true],
    [145,"香炉青烟",22,22,10,180,4,false],[146,"茶盏",22,22,10,190,4,false],[147,"书卷展开",22,22,10,190,4,false],[148,"笔架",22,22,10,190,4,false],
    [149,"全套文房雅物",22,22,10,210,5,true],[150,"城门楼",22,22,10,180,4,false],[151,"飞檐翘角",22,22,10,190,4,false],[152,"瓦当纹",22,22,10,190,4,false],
    [153,"斗拱结构简形",22,22,10,200,4,false],[154,"古风宫殿一角",22,22,11,210,5,true],[155,"牌坊",22,22,11,190,4,false],[156,"回廊",22,22,11,190,4,false],
    [157,"假山",22,22,11,200,4,false],[158,"曲桥",22,22,11,200,4,false],[159,"完整庭院全景",22,22,11,210,5,true],[160,"朱雀纹",22,22,11,200,4,false],
    [161,"玄武纹",22,22,11,200,4,false],[162,"青龙纹",22,22,11,200,4,false],[163,"白虎纹",22,22,11,200,4,false],[164,"四象神兽合集",22,22,11,220,5,true],
    [165,"凤凰展翅",22,22,11,200,4,false],[166,"龙游九天",22,22,11,200,4,false],[167,"麒麟踏云",22,22,11,210,4,false],[168,"貔貅招财",22,22,11,210,4,false],
    [169,"上古瑞兽大全",22,22,12,220,5,true],[170,"荷塘月色",22,22,12,200,4,false],[171,"梅雪争春",22,22,12,210,4,false],[172,"兰香幽谷",22,22,12,210,4,false],
    [173,"竹影清风",22,22,12,210,4,false],[174,"梅兰竹菊合集",22,22,12,220,5,true],[175,"富贵牡丹图",22,22,12,200,4,false],[176,"出水芙蓉",22,22,12,210,4,false],
    [177,"山茶花开",22,22,12,210,4,false],[178,"水仙",22,22,12,210,4,false],[179,"百花图卷",22,22,12,220,5,true],[180,"古风街市一角",22,22,12,210,4,false],
    [181,"酒肆旗子",22,22,12,210,4,false],[182,"灯笼街景",22,22,12,210,4,false],[183,"车马剪影",22,22,12,220,4,false],[184,"盛世长安局部",22,22,12,230,5,true],
    [185,"烟花剪影",22,22,12,210,4,false],[186,"灯会人群",22,22,12,210,4,false],[187,"戏台剪影",22,22,12,220,4,false],[188,"庙会小景",22,22,12,220,4,false],
    [189,"国风民俗全景",22,22,12,230,5,true],[190,"对称龙纹",22,22,12,220,4,false],[191,"对称凤纹",22,22,12,220,4,false],[192,"对称山水",22,22,12,220,4,false],
    [193,"对称花鸟",22,22,12,220,4,false],[194,"终极对称国风图腾",22,22,12,240,5,true],[195,"福满乾坤",22,22,12,220,4,false],[196,"禄寿双全",22,22,12,220,4,false],
    [197,"喜结连理",22,22,12,220,4,false],[198,"财运势起",22,22,12,220,4,false],[199,"五福圆满",22,22,12,230,5,true],[200,"五福圆满终极关",22,22,12,240,6,true],
];

// Actually let me fix the ID mapping
const ALL_EXTRA_SPECS = [
    [51,"完整牡丹",18,18,8,120,4,false],[52,"荷塘",18,18,9,130,4,false],[53,"松鹤图",18,18,9,130,4,false],[54,"年年有余",18,18,9,140,4,false],
    [55,"麒麟简形",20,20,9,150,5,true],[56,"古风团扇",18,18,9,120,4,false],[57,"香囊",18,18,9,130,4,false],[58,"发簪",18,18,9,130,4,false],
    [59,"流苏玉佩",18,18,9,140,4,false],[60,"山水小全景",20,20,9,150,5,true],[61,"龙纹半身",20,20,9,150,4,false],[62,"凤纹半身",20,20,10,160,4,false],
    [63,"古城门",20,20,10,160,4,false],[64,"宝塔",20,20,10,160,4,false],[65,"神兽纹",20,20,10,180,5,true],[66,"竹林",20,20,10,150,4,false],
    [67,"梅花枝",20,20,10,160,4,false],[68,"菊花丛",20,20,10,160,4,false],[69,"兰草丛",20,20,10,160,4,false],[70,"完整山水",20,20,10,180,5,true],
    [71,"小花轿",20,20,10,150,4,false],[72,"龙凤呈祥",22,22,11,180,5,true],[73,"富贵花开",22,22,11,180,5,true],[74,"百福图简版",22,22,11,180,5,true],
    [75,"完整麒麟",22,22,11,180,5,true],[76,"仙鹤齐飞",22,22,11,150,4,false],[77,"锦鲤群",22,22,11,180,5,true],[78,"古风庭院",22,22,11,180,5,true],
    [79,"琴棋书画套装",22,22,11,180,5,true],[80,"宫殿局部",22,22,11,180,5,true],[81,"龙身",20,20,11,160,5,false],[82,"凤身",20,20,12,180,5,true],
    [83,"古画局部",20,20,12,180,5,true],[84,"江山图局部",20,20,12,180,5,true],[85,"神兽组合",20,20,12,180,5,true],[86,"古风婚礼小景",20,20,12,160,5,false],
    [87,"百鸟朝凤简版",22,22,12,180,5,true],[88,"山水长卷",24,22,12,180,5,true],[89,"福瑞满堂",24,22,12,180,5,true],[90,"国风全景大图",24,22,12,180,6,true],
    [91,"满屏龙纹",22,22,12,160,5,false],[92,"满屏凤纹",22,22,12,180,5,true],[93,"宫殿局部全景",24,22,12,180,5,true],[94,"大幅山水",24,22,12,180,5,true],
    [95,"龙凤合体",22,22,12,180,5,true],[96,"满屏百福",22,22,12,180,5,true],[97,"神兽全家福",24,22,12,180,5,true],[98,"盛世小景",24,22,12,180,5,true],
    [99,"终极对称神兽",24,22,12,180,5,true],[100,"国风盛世全景",24,22,12,180,6,true],
    [101,"剪纸福字",20,20,8,150,4,false],[102,"剪纸窗花",20,20,8,150,4,false],[103,"皮影小人",20,20,9,160,4,false],[104,"京剧脸谱简形",20,20,9,160,4,false],
    [105,"大红灯笼串",20,20,9,180,5,true],[106,"鞭炮串",20,20,9,150,4,false],[107,"风筝",20,20,9,160,4,false],[108,"龙舟船头",20,20,10,170,4,false],
    [109,"粽子组合",20,20,10,170,4,false],[110,"月饼礼盒",20,20,10,180,5,true],[111,"舞狮头",22,22,10,170,4,false],[112,"龙头局部",22,22,10,170,4,false],
    [113,"古风花轿局部",22,22,10,170,4,false],[114,"玉璧纹",22,22,10,170,4,false],[115,"饕餮纹简版",22,22,10,190,5,true],[116,"编钟",22,22,10,170,4,false],
    [117,"鼎纹",22,22,10,170,4,false],[118,"铜镜纹",22,22,10,180,4,false],[119,"古钱币串",22,22,10,180,4,false],[120,"长命锁",22,22,10,190,5,true],
    [121,"玉兔",22,22,10,170,4,false],[122,"嫦娥简形",22,22,10,180,4,false],[123,"桂花枝",22,22,10,180,4,false],[124,"广寒宫剪影",22,22,10,180,4,false],
    [125,"神话仙鹿",22,22,10,200,5,true],[126,"神龟",22,22,10,170,4,false],[127,"金蟾",22,22,10,180,4,false],[128,"蝙蝠献福",22,22,10,180,4,false],
    [129,"貔貅半身",22,22,10,190,4,false],[130,"四象简纹合集",22,22,10,200,5,true],[131,"远山层叠",22,22,10,180,4,false],[132,"流水瀑布",22,22,10,180,4,false],
    [133,"云海",22,22,10,180,4,false],[134,"山水渔隐图",22,22,10,200,5,true],[135,"松针满屏",22,22,10,210,4,false],[136,"竹影",22,22,10,190,4,false],
    [137,"枫叶",22,22,10,190,4,false],[138,"银杏叶",22,22,10,190,4,false],[139,"四季花木合集",22,22,10,200,5,true],[140,"古风书架",22,22,10,180,4,false],
    [141,"文房四宝",22,22,10,190,4,false],[142,"笔筒",22,22,10,190,4,false],[143,"镇纸",22,22,10,190,4,false],[144,"文人雅集剪影",22,22,10,200,5,true],
    [145,"香炉青烟",22,22,10,180,4,false],[146,"茶盏",22,22,10,190,4,false],[147,"书卷展开",22,22,10,190,4,false],[148,"笔架",22,22,10,190,4,false],
    [149,"全套文房雅物",22,22,10,210,5,true],[150,"城门楼",22,22,10,180,4,false],[151,"飞檐翘角",22,22,10,190,4,false],[152,"瓦当纹",22,22,10,190,4,false],
    [153,"斗拱结构简形",22,22,10,200,4,false],[154,"古风宫殿一角",22,22,11,210,5,true],[155,"牌坊",22,22,11,190,4,false],[156,"回廊",22,22,11,190,4,false],
    [157,"假山",22,22,11,200,4,false],[158,"曲桥",22,22,11,200,4,false],[159,"完整庭院全景",22,22,11,210,5,true],[160,"朱雀纹",22,22,11,200,4,false],
    [161,"玄武纹",22,22,11,200,4,false],[162,"青龙纹",22,22,11,200,4,false],[163,"白虎纹",22,22,11,200,4,false],[164,"四象神兽合集",22,22,11,220,5,true],
    [165,"凤凰展翅",22,22,11,200,4,false],[166,"龙游九天",22,22,11,200,4,false],[167,"麒麟踏云",22,22,11,210,4,false],[168,"貔貅招财",22,22,11,210,4,false],
    [169,"上古瑞兽大全",22,22,12,220,5,true],[170,"荷塘月色",22,22,12,200,4,false],[171,"梅雪争春",22,22,12,210,4,false],[172,"兰香幽谷",22,22,12,210,4,false],
    [173,"竹影清风",22,22,12,210,4,false],[174,"梅兰竹菊合集",22,22,12,220,5,true],[175,"富贵牡丹图",22,22,12,200,4,false],[176,"出水芙蓉",22,22,12,210,4,false],
    [177,"山茶花开",22,22,12,210,4,false],[178,"水仙",22,22,12,210,4,false],[179,"百花图卷",22,22,12,220,5,true],[180,"古风街市一角",22,22,12,210,4,false],
    [181,"酒肆旗子",22,22,12,210,4,false],[182,"灯笼街景",22,22,12,210,4,false],[183,"车马剪影",22,22,12,220,4,false],[184,"盛世长安局部",22,22,12,230,5,true],
    [185,"烟花剪影",22,22,12,210,4,false],[186,"灯会人群",22,22,12,210,4,false],[187,"戏台剪影",22,22,12,220,4,false],[188,"庙会小景",22,22,12,220,4,false],
    [189,"国风民俗全景",22,22,12,230,5,true],[190,"对称龙纹",22,22,12,220,4,false],[191,"对称凤纹",22,22,12,220,4,false],[192,"对称山水",22,22,12,220,4,false],
    [193,"对称花鸟",22,22,12,220,4,false],[194,"终极对称国风图腾",22,22,12,240,5,true],[195,"福满乾坤",22,22,12,220,4,false],[196,"禄寿双全",22,22,12,220,4,false],
    [197,"喜结连理",22,22,12,220,4,false],[198,"财运势起",22,22,12,220,4,false],[199,"五福圆满",22,22,12,230,5,true],[200,"五福圆满终极关",22,22,12,240,6,true],
];

// Hmm, the specs only go to 199 but we need 200. Let me also generate the parseAndGenerateFromTemplate function
// Actually, for the v3 generator, let's use templates for 1-50 and procedural for 51-200.

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
        while (r.length < width) r.push(0);
        rows.push(r);
    }
    while (rows.length < height) rows.push(new Array(width).fill(0));
    return rows;
}

// Read templates from the existing v2 file
const v2Code = fs.readFileSync('tools/generate-guanka-v2.js', 'utf8');
const templateMatch = v2Code.match(/const TEMPLATES = \{[\s\S]*?\n\};/);
if (templateMatch) {
    eval('TEMPLATES = ' + templateMatch[0].replace('const ', ''));
}

function generate() {
    const outDir = path.join(__dirname, '..', 'guanka');
    
    // Levels 1-50 from templates
    for (let i = 1; i <= 50; i++) {
        const spec = LEVEL_SPECS_1_50[i - 1];
        if (!spec) continue;
        const [id, w, h, c, theme, time, diff, boss] = spec;
        const template = TEMPLATES[id];
        
        let correct;
        if (template) {
            correct = parseAndGenerateFromTemplate(id, template, w, h);
        } else {
            correct = generateLevel(id, w, h, c, theme, boss);
        }
        
        const init = shufflePattern(correct, diff, id);
        const slotTotal = countNonZero(correct);
        
        const levelData = {
            levelId: id, boardWidth: w, boardHeight: h, timeLimit: time,
            slotTotalCount: slotTotal, correctColorArr: correct, initRandomColorArr: init,
        };
        fs.writeFileSync(path.join(outDir, `level_${id}.json`), JSON.stringify(levelData));
        if (id % 10 === 0 || id <= 5) {
            console.log(`Generated level ${id}: ${theme} (${w}x${h}, ${c}色, ${diff}难度${boss ? ', BOSS' : ''})`);
        }
    }
    
    // Levels 51-200 procedural
    for (const [id, theme, w, h, c, time, diff, boss] of ALL_EXTRA_SPECS) {
        const correct = generateLevel(id, w, h, c, theme, boss);
        const init = shufflePattern(correct, diff, id);
        const slotTotal = countNonZero(correct);
        
        const levelData = {
            levelId: id, boardWidth: w, boardHeight: h, timeLimit: time,
            slotTotalCount: slotTotal, correctColorArr: correct, initRandomColorArr: init,
        };
        fs.writeFileSync(path.join(outDir, `level_${id}.json`), JSON.stringify(levelData));
        if (id % 25 === 0) {
            console.log(`Generated level ${id}: ${theme} (${w}x${h}, ${c}色, ${diff}难度${boss ? ', BOSS' : ''})`);
        }
    }
    
    console.log(`\nDone! Generated ${50 + ALL_EXTRA_SPECS.length} levels`);
}

generate();
