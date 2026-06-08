#!/usr/bin/env node
// Generates 200 levels of warm-toned Chinese-style pixel bead puzzles
// Output: guanka/level_N.json

const fs = require('fs');
const path = require('path');

// ============================================================
// Warm Chinese palette (color index -> hex)
// ============================================================
const WARM_HEX = {
    1: '#D73D2B', // 红 - red/vermilion
    2: '#EF9137', // 橙 - orange/amber
    3: '#F5D76E', // 黄 - gold
    4: '#E8C87A', // 浅金 - light gold
    5: '#F4A460', // 暖棕 - sandy brown
    6: '#C4575A', // 暖红 - warm red
    7: '#FAEBD0', // 米白 - antique white
    8: '#8B4513', // 深棕 - saddle brown
    9: '#F0E0D0', // 暖米 - warm beige
    10:'#CD853F', // 暖铜 - peru/copper
    11:'#E07070', // 粉暖 - warm pink
    12:'#B22222', // 深红 - firebrick
};

// ============================================================
// CSV level specifications
// ============================================================
const LEVEL_DATA = [
    [1,"8x8",2,"爱心",60,1,false],[2,"8x8",2,"五角星",60,1,false],
    [3,"8x8",3,"弯月",60,1,false],[4,"8x8",3,"云朵",60,1,false],
    [5,"10x10",3,"小福字",70,2,false],[6,"10x10",3,"小灯笼",70,1,false],
    [7,"10x10",4,"小花",80,1,false],[8,"10x10",4,"平安扣",80,1,false],
    [9,"10x10",4,"中国结",80,2,false],[10,"10x10",4,"金元宝",80,2,false],
    [11,"12x12",4,"小锦鲤",90,2,false],[12,"12x12",4,"折扇",90,2,false],
    [13,"12x12",4,"茶壶",90,2,false],[14,"12x12",4,"梅花",90,2,false],
    [15,"12x12",5,"熊猫头像",100,3,true],[16,"12x12",5,"玉如意",100,2,false],
    [17,"12x12",5,"祥云纹",100,2,false],[18,"12x12",5,"山纹",100,2,false],
    [19,"12x12",5,"水波纹",110,3,false],[20,"12x12",5,"古风窗纹",120,3,false],
    [21,"14x14",5,"兔子",90,2,false],[22,"14x14",5,"小猫",90,2,false],
    [23,"14x14",6,"柿子",100,3,false],[24,"14x14",6,"橘子",100,3,false],
    [25,"14x14",6,"古风花瓶",120,4,true],[26,"14x14",6,"荷叶",100,3,false],
    [27,"14x14",6,"莲蓬",110,3,false],[28,"14x14",6,"竹子",110,3,false],
    [29,"14x14",6,"兰花",110,3,false],[30,"14x14",6,"玉佩套装",120,4,true],
    [31,"16x16",6,"小亭子",120,3,false],[32,"16x16",6,"小桥",120,3,false],
    [33,"16x16",7,"牡丹简形",130,3,false],[34,"16x16",7,"菊花",130,3,false],
    [35,"16x16",7,"完整锦鲤",140,4,true],[36,"16x16",7,"仙鹤简形",120,3,false],
    [37,"16x16",7,"鹿纹",130,3,false],[38,"16x16",7,"福袋",130,3,false],
    [39,"16x16",7,"铜钱纹",130,3,false],[40,"16x16",7,"古风面具",140,4,true],
    [41,"16x16",7,"简山水",120,3,false],[42,"16x16",8,"仕女头像",140,3,false],
    [43,"16x16",8,"书生头像",140,3,false],[44,"16x16",8,"小龙纹",150,4,true],
    [45,"16x16",8,"小凤纹",150,4,true],[46,"16x16",8,"古琴",120,3,false],
    [47,"16x16",8,"围棋",130,3,false],[48,"16x16",8,"书籍",130,3,false],
    [49,"16x16",8,"画卷",130,3,false],[50,"16x16",8,"古风建筑小全景",150,5,true],
    [51,"18x18",8,"完整牡丹",120,4,false],[52,"18x18",9,"荷塘",130,4,false],
    [53,"18x18",9,"松鹤图",130,4,false],[54,"18x18",9,"年年有余",140,4,false],
    [55,"18x18",9,"麒麟简形",150,5,true],[56,"18x18",9,"古风团扇",120,4,false],
    [57,"18x18",9,"香囊",130,4,false],[58,"18x18",9,"发簪",130,4,false],
    [59,"18x18",9,"流苏玉佩",140,4,false],[60,"18x18",9,"山水小全景",150,5,true],
    [61,"20x20",9,"龙纹半身",150,4,false],[62,"20x20",10,"凤纹半身",160,4,false],
    [63,"20x20",10,"古城门",160,4,false],[64,"20x20",10,"宝塔",160,4,false],
    [65,"20x20",10,"神兽纹",180,5,true],[66,"20x20",10,"竹林",150,4,false],
    [67,"20x20",10,"梅花枝",160,4,false],[68,"20x20",10,"菊花丛",160,4,false],
    [69,"20x20",10,"兰草丛",160,4,false],[70,"20x20",10,"完整山水",180,5,true],
    [71,"20x20",10,"小花轿",150,4,false],[72,"20x20",11,"龙凤呈祥",180,5,true],
    [73,"20x20",11,"富贵花开",180,5,true],[74,"20x20",11,"百福图简版",180,5,true],
    [75,"20x20",11,"完整麒麟",180,5,true],[76,"20x20",11,"仙鹤齐飞",150,4,false],
    [77,"20x20",11,"锦鲤群",180,5,true],[78,"20x20",11,"古风庭院",180,5,true],
    [79,"20x20",11,"琴棋书画套装",180,5,true],[80,"20x20",11,"宫殿局部",180,5,true],
    [81,"20x20",11,"龙身",160,5,false],[82,"20x20",12,"凤身",180,5,true],
    [83,"20x20",12,"古画局部",180,5,true],[84,"20x20",12,"江山图局部",180,5,true],
    [85,"20x20",12,"神兽组合",180,5,true],[86,"20x20",12,"古风婚礼小景",160,5,false],
    [87,"20x20",12,"百鸟朝凤简版",180,5,true],[88,"20x20",12,"山水长卷",180,5,true],
    [89,"20x20",12,"福瑞满堂",180,5,true],[90,"20x20",12,"国风全景大图",180,6,true],
    [91,"20x20",12,"满屏龙纹",160,5,false],[92,"20x20",12,"满屏凤纹",180,5,true],
    [93,"20x20",12,"宫殿局部全景",180,5,true],[94,"20x20",12,"大幅山水",180,5,true],
    [95,"20x20",12,"龙凤合体",180,5,true],[96,"20x20",12,"满屏百福",180,5,true],
    [97,"20x20",12,"神兽全家福",180,5,true],[98,"20x20",12,"盛世小景",180,5,true],
    [99,"20x20",12,"终极对称神兽",180,5,true],[100,"20x20",12,"国风盛世全景",180,6,true],
    [101,"20x20",8,"剪纸福字",150,4,false],[102,"20x20",8,"剪纸窗花",150,4,false],
    [103,"20x20",9,"皮影小人",160,4,false],[104,"20x20",9,"京剧脸谱简形",160,4,false],
    [105,"20x20",9,"大红灯笼串",180,5,true],[106,"20x20",9,"鞭炮串",150,4,false],
    [107,"20x20",9,"风筝",160,4,false],[108,"20x20",10,"龙舟船头",170,4,false],
    [109,"20x20",10,"粽子组合",170,4,false],[110,"20x20",10,"月饼礼盒",180,5,true],
    [111,"22x22",10,"舞狮头",170,4,false],[112,"22x22",10,"龙头局部",170,4,false],
    [113,"22x22",10,"古风花轿局部",170,4,false],[114,"22x22",10,"玉璧纹",170,4,false],
    [115,"22x22",10,"饕餮纹简版",190,5,true],[116,"22x22",10,"编钟",170,4,false],
    [117,"22x22",10,"鼎纹",170,4,false],[118,"22x22",10,"铜镜纹",180,4,false],
    [119,"22x22",10,"古钱币串",180,4,false],[120,"22x22",10,"长命锁",190,5,true],
    [121,"22x22",10,"玉兔",170,4,false],[122,"22x22",10,"嫦娥简形",180,4,false],
    [123,"22x22",10,"桂花枝",180,4,false],[124,"22x22",10,"广寒宫剪影",180,4,false],
    [125,"22x22",10,"神话仙鹿",200,5,true],[126,"22x22",10,"神龟",170,4,false],
    [127,"22x22",10,"金蟾",180,4,false],[128,"22x22",10,"蝙蝠献福",180,4,false],
    [129,"22x22",10,"貔貅半身",190,4,false],[130,"22x22",10,"四象简纹合集",200,5,true],
    [131,"22x22",10,"远山层叠",180,4,false],[132,"22x22",10,"流水瀑布",180,4,false],
    [133,"22x22",10,"云海",180,4,false],[134,"22x22",10,"孤舟",190,4,false],
    [135,"22x22",10,"山水渔隐图",200,5,true],[136,"22x22",10,"松针满屏",180,4,false],
    [137,"22x22",10,"竹影",180,4,false],[138,"22x22",10,"枫叶",190,4,false],
    [139,"22x22",10,"银杏叶",190,4,false],[140,"22x22",10,"四季花木合集",200,5,true],
    [141,"22x22",10,"古风书架",180,4,false],[142,"22x22",10,"文房四宝",190,4,false],
    [143,"22x22",10,"笔筒",190,4,false],[144,"22x22",10,"镇纸",190,4,false],
    [145,"22x22",10,"文人雅集剪影",200,5,true],[146,"22x22",10,"香炉青烟",180,4,false],
    [147,"22x22",10,"茶盏",190,4,false],[148,"22x22",10,"书卷展开",190,4,false],
    [149,"22x22",10,"笔架",190,4,false],[150,"22x22",10,"全套文房雅物",210,5,true],
    [151,"22x22",10,"城门楼",180,4,false],[152,"22x22",10,"飞檐翘角",190,4,false],
    [153,"22x22",10,"瓦当纹",190,4,false],[154,"22x22",10,"斗拱结构简形",200,4,false],
    [155,"22x22",11,"古风宫殿一角",210,5,true],[156,"22x22",11,"牌坊",190,4,false],
    [157,"22x22",11,"回廊",190,4,false],[158,"22x22",11,"假山",200,4,false],
    [159,"22x22",11,"曲桥",200,4,false],[160,"22x22",11,"完整庭院全景",210,5,true],
    [161,"22x22",11,"朱雀纹",200,4,false],[162,"22x22",11,"玄武纹",200,4,false],
    [163,"22x22",11,"青龙纹",200,4,false],[164,"22x22",11,"白虎纹",200,4,false],
    [165,"22x22",11,"四象神兽合集",220,5,true],[166,"22x22",11,"凤凰展翅",200,4,false],
    [167,"22x22",11,"龙游九天",200,4,false],[168,"22x22",11,"麒麟踏云",210,4,false],
    [169,"22x22",11,"貔貅招财",210,4,false],[170,"22x22",12,"上古瑞兽大全",220,5,true],
    [171,"22x22",12,"荷塘月色",200,4,false],[172,"22x22",12,"梅雪争春",210,4,false],
    [173,"22x22",12,"兰香幽谷",210,4,false],[174,"22x22",12,"竹影清风",210,4,false],
    [175,"22x22",12,"梅兰竹菊合集",220,5,true],[176,"22x22",12,"富贵牡丹图",200,4,false],
    [177,"22x22",12,"出水芙蓉",210,4,false],[178,"22x22",12,"山茶花开",210,4,false],
    [179,"22x22",12,"水仙",210,4,false],[180,"22x22",12,"百花图卷",220,5,true],
    [181,"22x22",12,"古风街市一角",210,4,false],[182,"22x22",12,"酒肆旗子",210,4,false],
    [183,"22x22",12,"灯笼街景",210,4,false],[184,"22x22",12,"车马剪影",220,4,false],
    [185,"22x22",12,"盛世长安局部",230,5,true],[186,"22x22",12,"烟花剪影",210,4,false],
    [187,"22x22",12,"灯会人群",210,4,false],[188,"22x22",12,"戏台剪影",220,4,false],
    [189,"22x22",12,"庙会小景",220,4,false],[190,"22x22",12,"国风民俗全景",230,5,true],
    [191,"22x22",12,"对称龙纹",220,4,false],[192,"22x22",12,"对称凤纹",220,4,false],
    [193,"22x22",12,"对称山水",220,4,false],[194,"22x22",12,"对称花鸟",220,4,false],
    [195,"22x22",12,"终极对称国风图腾",240,5,true],[196,"22x22",12,"福满乾坤",220,4,false],
    [197,"22x22",12,"禄寿双全",220,4,false],[198,"22x22",12,"喜结连理",220,4,false],
    [199,"22x22",12,"财运势起",220,4,false],[200,"22x22",12,"五福圆满终极关",240,6,true],
].map(d => ({
    levelId: d[0], size: d[1], colorCount: d[2], theme: d[3],
    timeLimit: d[4], difficulty: d[5], isBoss: d[6]
}));

// ============================================================
// Seeded PRNG (mulberry32) - deterministic patterns
// ============================================================
function mulberry32(a) {
    return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Safe grid setter - handles float indices and bounds
function S(g, y, x, c, H, W) {
    const ri = Math.floor(y);
    if (ri >= 0 && ri < H && x >= 0 && x < W) g[ri][x] = c;
}

// ============================================================
// Pattern generators - each creates a 2D array of color indices
// ============================================================
function drawHeart(g, w, h, c, rng) {
    // Heart shape centered
    const cx = Math.floor(w/2), cy = Math.floor(h/2);
    const s = Math.min(w, h) * 0.3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let nx = (x - cx) / s, ny = -(y - cy) / s;
        if ((nx*nx + ny*ny - 1)**3 - nx*nx*ny*ny*ny <= 0.15) g[Math.floor(y)][x] = c;
    }
}

function drawStar(g, w, h, c, rng) {
    const cx = w/2, cy = h/2, R = Math.min(w,h)*0.35, r = R*0.4;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let dx = x - cx, dy = -(y - cy), angle = Math.atan2(dy, dx);
        let dist = Math.sqrt(dx*dx + dy*dy);
        let a5 = (angle + Math.PI/2) % (Math.PI*2/5);
        if (a5 < 0) a5 += Math.PI*2/5;
        let boundary = r + (R-r) * Math.cos(a5 * 5/2 - Math.PI/2);
        // Simplified: use 5-point star
        let starAngle = Math.atan2(dy, dx);
        let idx = Math.round((starAngle + Math.PI) / (Math.PI*2) * 10) % 10;
        let rr = (idx % 2 === 0) ? R : r;
        if (dist < rr + 0.5 && dist > rr*0.3) g[Math.floor(y)][x] = c;
    }
}

function drawMoon(g, w, h, c, rng) {
    const cx = w/2+1, cy = h/2, R = Math.min(w,h)*0.32;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let dx = x-cx, dy = y-cy;
        let d1 = Math.sqrt(dx*dx+dy*dy);
        let d2 = Math.sqrt((dx+R*0.5)**2+dy*dy);
        if (d1 < R && d2 > R*0.7) g[Math.floor(y)][x] = c;
    }
}

function drawCloud(g, w, h, c, rng) {
    const cx = w/2, cy = h/2, R = Math.min(w,h)*0.15;
    const bumps = [[-R*0.8,0],[R*0.8,0],[0,-R*0.5],[-R*0.4,R*0.3],[R*0.4,R*0.3]];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        for (let [bx,by] of bumps) {
            if ((x-cx-bx)**2+(y-cy-by)**2 < R*R*0.8) { g[Math.floor(y)][x]=c; break; }
        }
    }
}

function drawCircle(g, w, h, c, fill) {
    const cx = w/2, cy = h/2, R = Math.min(w,h)*0.35;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let d = Math.sqrt((x-cx)**2+(y-cy)**2);
        if (fill ? d < R : Math.abs(d-R) < 1.5) g[Math.floor(y)][x] = c;
    }
}

function drawDiamond(g, w, h, c) {
    const cx = w/2, cy = h/2, rx = w*0.3, ry = h*0.3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (Math.abs(x-cx)/rx + Math.abs(y-cy)/ry <= 1) g[Math.floor(y)][x] = c;
    }
}

function drawRectangle(g, w, h, c) {
    const m = Math.max(2, Math.floor(Math.min(w,h)*0.15));
    for (let y = m; y < h-m; y++) for (let x = m; x < w-m; x++) g[Math.floor(y)][x] = c;
}

function drawCross(g, w, h, c) {
    const cx = w/2, cy = h/2, t = Math.min(w,h)*0.1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (Math.abs(x-cx) < t || Math.abs(y-cy) < t) g[Math.floor(y)][x] = c;
    }
}

function drawTriangle(g, w, h, c) {
    const base = h*0.8, topY = h*0.1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let ratio = (y - topY) / (h - topY);
        let halfW = base/2 * ratio;
        if (y >= topY && y < h && Math.abs(x - w/2) < halfW) g[Math.floor(y)][x] = c;
    }
}

function drawLeaf(g, w, h, c) {
    const cx = w/2, cy = h/2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let nx = (x-cx)/(w*0.35), ny = (y-cy)/(h*0.45);
        let r = Math.sqrt(nx*nx + ny*ny);
        if (r < 1 && Math.abs(ny) < 0.5*(1-nx*nx)*1.5) g[Math.floor(y)][x] = c;
    }
}

function drawFlower(g, w, h, c, petals, rng) {
    const cx = w/2, cy = h/2, R = Math.min(w,h)*0.32;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let dx = x-cx, dy = y-cy;
        let dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < R) {
            let angle = Math.atan2(dy, dx);
            let wave = Math.cos(angle * petals);
            if (dist < R * (0.3 + 0.7 * (wave + 1)/2)) g[Math.floor(y)][x] = c;
        }
    }
}

function drawKnot(g, w, h, c, rng) {
    // Chinese knot: square with cross pattern
    const cx = w/2, cy = h/2, R = Math.min(w,h)*0.35;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let dx = Math.abs(x-cx), dy = Math.abs(y-cy);
        let maxd = Math.max(dx, dy);
        if (maxd < R) {
            // Diamond cutout in center
            if (dx + dy > R*0.3 && dx + dy < R*1.2) g[Math.floor(y)][x] = c;
        }
    }
}

function drawBell(g, w, h, c) {
    // Bell/lantern shape
    const cx = w/2, cy = h/2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let ny = (y-cy*0.5)/(h*0.4);
        let nx = (x-cx)/(w*(0.25+ny*0.15));
        if (ny > -1 && ny < 1 && nx*nx+ny*ny < 1) g[Math.floor(y)][x] = c;
    }
}

function drawVase(g, w, h, c) {
    const cx = w/2;
    for (let y = 0; y < h; y++) {
        let t = y / h;
        let halfW = w * (0.15 + 0.2 * Math.sin(t * Math.PI) * (1 + 0.3*Math.sin(t*Math.PI*2)));
        for (let x = Math.max(0,Math.floor(cx-halfW)); x < Math.min(w,Math.ceil(cx+halfW)); x++) {
            g[Math.floor(y)][x] = c;
        }
    }
}

function drawMountain(g, w, h, c, rng) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let ny = (h - y) / h;
        let peak1 = Math.sin(x / w * Math.PI * 2.5) * 0.3 + 0.3;
        let peak2 = Math.sin((x+3) / w * Math.PI * 3.7) * 0.15 + 0.2;
        if (ny < peak1 + peak2) g[Math.floor(y)][x] = c;
    }
}

function drawWave(g, w, h, c, rng) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let waveY = h*0.3 + Math.sin(x/w * Math.PI*4) * h*0.1;
        if (y > waveY - 2 && y < waveY + h*0.3) g[Math.floor(y)][x] = c;
    }
}

function drawBamboo(g, w, h, c, rng) {
    const stalks = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < stalks; i++) {
        let sx = Math.floor(w * 0.2 + rng() * w * 0.6);
        for (let y = 0; y < h; y++) {
            let sway = Math.sin(y / h * Math.PI * 2 + i) * 1.5;
            let px = Math.floor(sx + sway);
            if (px >= 0 && px < w) g[Math.floor(y)][px] = c;
            if (px-1 >= 0) g[Math.floor(y)][px-1] = c;
        }
    }
}

function drawPanda(g, w, h, c1, c2, rng) {
    // Head circle + ears + eyes
    const cx = w/2, cy = h/2, R = Math.min(w,h)*0.35;
    // Body color
    drawCircle(g, w, h, c1, true);
    // Ears (dark)
    const er = R * 0.3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if ((x-cx+R*0.6)**2+(y-cy-R*0.7)**2 < er*er) g[Math.floor(y)][x] = c2;
        if ((x-cx-R*0.6)**2+(y-cy-R*0.7)**2 < er*er) g[Math.floor(y)][x] = c2;
    }
    // Eyes (dark patches)
    const eyeR = R * 0.2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if ((x-cx+R*0.35)**2+(y-cy-R*0.1)**2 < eyeR*eyeR*1.5) g[Math.floor(y)][x] = c2;
        if ((x-cx-R*0.35)**2+(y-cy-R*0.1)**2 < eyeR*eyeR*1.5) g[Math.floor(y)][x] = c2;
    }
}

function drawCat(g, w, h, c1, c2, rng) {
    const cx = w/2, cy = h*0.55, R = Math.min(w,h)*0.3;
    drawCircle(g, w, h, c1, true);
    // Ears (triangles)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if ((x-cx)**2 + (y-cy+R*0.8)**2 < (R*0.3)**2 && y < cy - R*0.3) {
            g[Math.floor(y)][x] = c2;
        }
        // Eyes
        if (Math.abs(y-cy-R*0.1) < 2 && Math.abs(x-cx+R*0.35) < 3) g[Math.floor(y)][x] = c2;
        if (Math.abs(y-cy-R*0.1) < 2 && Math.abs(x-cx-R*0.35) < 3) g[Math.floor(y)][x] = c2;
    }
}

function drawFish(g, w, h, c, rng) {
    const cx = w*0.45, cy = h/2, rx = w*0.3, ry = h*0.2;
    // Body ellipse
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if ((x-cx)**2/rx**2 + (y-cy)**2/ry**2 < 1) g[Math.floor(y)][x] = c;
    }
    // Tail triangle
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (x > cx+rx*0.6) {
            let tailW = ry * 0.8 * (1 - (x-cx-rx*0.6)/(rx*0.5));
            if (Math.abs(y-cy) < tailW && tailW > 0) g[Math.floor(y)][x] = c;
        }
    }
}

function drawFan(g, w, h, c, rng) {
    const cx = w/2, cy = h*0.85;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let angle = Math.atan2(cy-y, x-cx);
        let dist = Math.sqrt((x-cx)**2+(cy-y)**2);
        if (angle > -Math.PI*0.4 && angle < Math.PI*0.4 && dist < h*0.7 && dist > 3) g[Math.floor(y)][x] = c;
    }
}

function drawTeapot(g, w, h, c, rng) {
    const cx = w/2, cy = h*0.55, R = Math.min(w,h)*0.25;
    // Body
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if ((x-cx)**2/(R*1.2)**2 + (y-cy)**2/R**2 < 1) g[Math.floor(y)][x] = c;
    }
    // Lid
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (y < cy-R*0.5 && (x-cx)**2/(R*0.6)**2 + (y-(cy-R*0.7))**2/(R*0.3)**2 < 1) g[Math.floor(y)][x] = c;
    }
}

function drawDragonSimple(g, w, h, c, rng) {
    // S-curve dragon body
    const cx = w/2, cy = h/2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let midX = cx + Math.sin(y/h * Math.PI * 3) * w * 0.2;
        let dist = Math.abs(x - midX);
        if (dist < w*0.08 && y > h*0.1 && y < h*0.9) g[Math.floor(y)][x] = c;
    }
    // Head
    const hx = cx + Math.sin(0.1 * Math.PI * 3), hy = h*0.1;
    drawCircle(g, w, h*0.2, c, true);
}

function drawPhoenix(g, w, h, c, rng) {
    const cx = w/2, cy = h*0.4;
    // Body
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if ((x-cx)**2/(w*0.15)**2 + (y-cy)**2/(h*0.25)**2 < 1) g[Math.floor(y)][x] = c;
    }
    // Wings
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let wingSpread = Math.sin((y-cy+h*0.1)/(h*0.5)*Math.PI)*w*0.3;
        if (y > cy-h*0.2 && y < cy+h*0.3 && Math.abs(x-cx) > w*0.1 && Math.abs(x-cx) < wingSpread) g[Math.floor(y)][x] = c;
    }
}

function drawTemple(g, w, h, c, rng) {
    const cx = w/2;
    // Base
    for (let y = h*0.4; y < h*0.85; y++) for (let x = 0; x < w; x++) {
        let halfW = w * (0.2 + 0.1 * Math.sin((y-h*0.4)/(h*0.45)*Math.PI));
        if (Math.abs(x-cx) < halfW) g[Math.floor(y)][x] = c;
    }
    // Roof
    for (let y = h*0.2; y < h*0.45; y++) for (let x = 0; x < w; x++) {
        let t = (y-h*0.2)/(h*0.25);
        let halfW = w * (0.35 - t * 0.15);
        if (Math.abs(x-cx) < halfW) g[Math.floor(y)][x] = c;
    }
}

function drawPagoda(g, w, h, c, rng) {
    const cx = w/2, floors = 5;
    for (let f = 0; f < floors; f++) {
        let fy = h * (0.15 + f * 0.14);
        let fh = h * 0.1;
        let fw = w * (0.4 - f * 0.04);
        for (let y = fy; y < fy+fh && y < h; y++) for (let x = 0; x < w; x++) {
            if (Math.abs(x-cx) < fw) g[Math.floor(y)][x] = c;
        }
        // Roof lip
        let roofY = fy;
        for (let x = 0; x < w; x++) {
            if (Math.abs(x-cx) < fw + 2) g[Math.max(0,Math.floor(roofY))][x] = c;
        }
    }
}

function drawGate(g, w, h, c, rng) {
    const cx = w/2;
    // Pillars
    for (let y = h*0.2; y < h*0.9; y++) {
        for (let x = 0; x < w; x++) {
            if (Math.abs(x - (cx - w*0.25)) < 2 || Math.abs(x - (cx + w*0.25)) < 2) g[Math.floor(y)][x] = c;
        }
    }
    // Top beam
    for (let y = h*0.2; y < h*0.3; y++) for (let x = 0; x < w; x++) {
        if (Math.abs(x-cx) < w*0.35) g[Math.floor(y)][x] = c;
    }
    // Roof
    for (let y = h*0.1; y < h*0.25; y++) for (let x = 0; x < w; x++) {
        let t = (y-h*0.1)/(h*0.15);
        if (Math.abs(x-cx) < w*(0.4-t*0.1)) g[Math.floor(y)][x] = c;
    }
}

function drawWindow(g, w, h, c, rng) {
    const cx = w/2, cy = h/2, R = Math.min(w,h)*0.35;
    // Frame
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let d = Math.sqrt((x-cx)**2+(y-cy)**2);
        if (Math.abs(d-R) < 2) g[Math.floor(y)][x] = c;
    }
    // Grid lines
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let d = Math.sqrt((x-cx)**2+(y-cy)**2);
        if (d < R) {
            if (Math.abs(x-cx) < 1.5 || Math.abs(y-cy) < 1.5) g[Math.floor(y)][x] = c;
        }
    }
}

function drawScroll(g, w, h, c, rng) {
    const cx = w/2;
    // Body rectangle
    for (let y = h*0.1; y < h*0.9; y++) for (let x = 0; x < w; x++) {
        if (Math.abs(x-cx) < w*0.25) g[Math.floor(y)][x] = c;
    }
    // Roller ends
    for (let y = h*0.05; y < h*0.15; y++) for (let x = 0; x < w; x++) {
        if (Math.abs(x-cx) < w*0.3) g[Math.floor(y)][x] = c;
    }
    for (let y = h*0.85; y < h*0.95; y++) for (let x = 0; x < w; x++) {
        if (Math.abs(x-cx) < w*0.3) g[Math.floor(y)][x] = c;
    }
}

function drawCoin(g, w, h, c, rng) {
    const cx = w/2, cy = h/2, R = Math.min(w,h)*0.35;
    // Outer circle
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let d = Math.sqrt((x-cx)**2+(y-cy)**2);
        if (Math.abs(d-R) < 2.5 || (d < R && d > R*0.55)) g[Math.floor(y)][x] = c;
    }
}

function drawBridge(g, w, h, c, rng) {
    const cx = w/2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let archY = h*0.4 + Math.sin((x)/w * Math.PI) * h*0.2;
        if (Math.abs(y - archY) < 3 && x > 1 && x < w-1) g[Math.floor(y)][x] = c;
    }
    // Railings
    for (let x = 0; x < w; x++) {
        let archY = h*0.4 + Math.sin((x)/w * Math.PI) * h*0.2;
        for (let dy = -3; dy <= 0; dy++) {
            let ry = Math.floor(archY+dy);
            if (ry >= 0 && ry < h) g[ry][x] = c;
        }
    }
}

function drawPavilion(g, w, h, c, rng) {
    const cx = w/2;
    // Pillars
    const pillars = [cx-w*0.3, cx-w*0.1, cx+w*0.1, cx+w*0.3];
    for (let y = h*0.35; y < h*0.8; y++) for (let px of pillars) {
        let pi = Math.floor(px);
        if (pi >= 0 && pi < w) g[Math.floor(y)][pi] = c;
    }
    // Roof
    for (let y = h*0.15; y < h*0.38; y++) for (let x = 0; x < w; x++) {
        let t = (y-h*0.15)/(h*0.23);
        if (Math.abs(x-cx) < w*(0.45-t*0.15)) g[Math.floor(y)][x] = c;
    }
}

function drawGourd(g, w, h, c, rng) {
    const cx = w/2;
    // Bottom bulb
    for (let y = h*0.4; y < h*0.85; y++) for (let x = 0; x < w; x++) {
        let t = (y-h*0.4)/(h*0.45);
        let hw = w*0.2*Math.sin(t*Math.PI);
        if (Math.abs(x-cx) < hw) g[Math.floor(y)][x] = c;
    }
    // Top bulb
    for (let y = h*0.15; y < h*0.45; y++) for (let x = 0; x < w; x++) {
        let t = (y-h*0.15)/(h*0.3);
        let hw = w*0.15*Math.sin(t*Math.PI);
        if (Math.abs(x-cx) < hw) g[Math.floor(y)][x] = c;
    }
}

function drawRuyi(g, w, h, c, rng) {
    const cx = w/2;
    // Curved S shape
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let midX = cx + Math.sin(y/h * Math.PI * 1.5) * w * 0.2;
        if (Math.abs(x-midX) < w*0.08 && y > h*0.1 && y < h*0.9) g[Math.floor(y)][x] = c;
    }
    // Cloud head at top
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let headY = h*0.15;
        if ((x-cx-w*0.15)**2+(y-headY)**2 < (w*0.12)**2) g[Math.floor(y)][x] = c;
        if ((x-cx+w*0.15)**2+(y-headY)**2 < (w*0.12)**2) g[Math.floor(y)][x] = c;
    }
}

function drawLotus(g, w, h, c, rng) {
    const cx = w/2, cy = h*0.6;
    // Petals radiating
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let dx = x-cx, dy = y-cy;
        let dist = Math.sqrt(dx*dx+dy*dy);
        let angle = Math.atan2(dy, dx);
        if (dist < h*0.35 && dist > 3) {
            let petal = Math.cos(angle * 8);
            if (petal > 0.2) g[Math.floor(y)][x] = c;
        }
    }
}

function drawIngot(g, w, h, c, rng) {
    const cx = w/2, cy = h*0.6;
    // Boat-shaped ingot
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let ny = (y-cy)/(h*0.2);
        let nx = (x-cx)/(w*0.35);
        if (ny*ny + nx*nx*0.6 < 1 && ny > -0.5) g[Math.floor(y)][x] = c;
    }
    // Top bumps
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if ((x-cx+w*0.2)**2+(y-cy+h*0.2)**2 < (w*0.1)**2) g[Math.floor(y)][x] = c;
        if ((x-cx-w*0.2)**2+(y-cy+h*0.2)**2 < (w*0.1)**2) g[Math.floor(y)][x] = c;
    }
}

function drawJade(g, w, h, c, rng) {
    // Jade pendant - oval with hole
    const cx = w/2, cy = h/2, R = Math.min(w,h)*0.35;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let d = Math.sqrt((x-cx)**2+(y-cy)**2);
        if (d < R && d > R*0.3) g[Math.floor(y)][x] = c;
    }
    // Tassel
    for (let y = cy+R; y < cy+R+h*0.15; y++) for (let x = 0; x < w; x++) {
        if (Math.abs(x-cx) < 2 && y < h) g[Math.floor(y)][x] = c;
    }
}

function drawDeer(g, w, h, c, rng) {
    const cx = w/2, cy = h*0.5;
    // Body
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if ((x-cx)**2/(w*0.2)**2 + (y-cy)**2/(h*0.15)**2 < 1) g[Math.floor(y)][x] = c;
    }
    // Antlers
    for (let side of [-1, 1]) {
        for (let y = 0; y < h*0.4; y++) for (let x = 0; x < w; x++) {
            let ax = cx + side * w * 0.15;
            if (Math.abs(x-ax) < 2 && Math.abs(y-cy+h*0.2) < h*0.15) g[Math.floor(y)][x] = c;
        }
    }
    // Neck
    for (let y = h*0.3; y < h*0.55; y++) for (let x = 0; x < w; x++) {
        if (Math.abs(x-(cx+w*0.15)) < w*0.05) g[Math.floor(y)][x] = c;
    }
}

function drawLantern(g, w, h, c, rng) {
    const cx = w/2, cy = h*0.5;
    // Main body (ellipse)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if ((x-cx)**2/(w*0.2)**2 + (y-cy)**2/(h*0.3)**2 < 1) g[Math.floor(y)][x] = c;
    }
    // Top/bottom caps
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (Math.abs(y-cy+h*0.28) < 3 && Math.abs(x-cx) < w*0.15) g[Math.floor(y)][x] = c;
        if (Math.abs(y-cy-h*0.28) < 3 && Math.abs(x-cx) < w*0.15) g[Math.floor(y)][x] = c;
    }
    // Tassel
    for (let y = cy+h*0.32; y < h; y++) {
        if (y < h) g[Math.floor(y)][cx] = c;
    }
}

function drawBlessingChar(g, w, h, c, rng) {
    // Simplified 福 character
    const cx = Math.floor(w*0.5);
    // Left radical (礻)
    for (let y = Math.floor(h*0.15); y < Math.floor(h*0.85); y++) {
        let px = Math.floor(cx - w*0.18);
        if (px >= 0 && px < w) g[Math.floor(y)][px] = c;
    }
    for (let y = Math.floor(h*0.25); y < Math.floor(h*0.35); y++) for (let x = 0; x < w; x++) {
        if (Math.abs(x-(cx-w*0.18)) < w*0.08) g[Math.floor(y)][x] = c;
    }
    // Right part (畐)
    for (let y = Math.floor(h*0.15); y < Math.floor(h*0.85); y++) for (let x = 0; x < w; x++) {
        if ((Math.abs(x-(cx+w*0.12)) < 1.5 || Math.abs(x-(cx+w*0.02)) < 1.5) && y >= Math.floor(h*0.2)) g[Math.floor(y)][x] = c;
    }
    for (let ry of [Math.floor(h*0.2), Math.floor(h*0.5), Math.floor(h*0.8)]) for (let x = 0; x < w; x++) {
        if (ry >= 0 && ry < h && Math.abs(x-(cx-w*0.07)) < w*0.12) g[ry][x] = c;
    }
}

function drawKoi(g, w, h, c, rng) {
    drawFish(g, w, h, c, rng);
    // Add pattern dots on body
    const cx = w*0.45, cy = h/2;
    const rng2 = mulberry32(w*100+h);
    for (let i = 0; i < 5; i++) {
        let px = Math.floor(cx - w*0.15 + rng2() * w*0.3);
        let py = Math.floor(cy - h*0.1 + rng2() * h*0.2);
        if (py >= 0 && py < h && px >= 0 && px < w) g[py][px] = c;
    }
}

function drawRabbit(g, w, h, c, rng) {
    const cx = w/2, cy = h*0.55, R = Math.min(w,h)*0.25;
    drawCircle(g, w, h, c, true);
    // Ears
    for (let side of [-1, 1]) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let ex = cx + side * w * 0.15;
            if (y < cy - R*0.5) {
                if (Math.abs(x-ex) < 2 && Math.abs(y-(cy-R*1.2)) < R*0.6) g[Math.floor(y)][x] = c;
            }
        }
    }
}

function drawTurtle(g, w, h, c, rng) {
    const cx = w/2, cy = h/2;
    // Shell (ellipse)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if ((x-cx)**2/(w*0.3)**2 + (y-cy)**2/(h*0.25)**2 < 1) g[Math.floor(y)][x] = c;
    }
    // Head
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if ((x-cx-w*0.3)**2 + (y-cy)**2 < (w*0.08)**2) g[Math.floor(y)][x] = c;
    }
    // Legs
    for (let [dx,dy] of [[-0.2,-0.2],[0.2,-0.2],[-0.2,0.2],[0.2,0.2]]) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if ((x-cx-dx*w)**2 + (y-cy-dy*h)**2 < (w*0.06)**2) g[Math.floor(y)][x] = c;
        }
    }
}

function drawCrane(g, w, h, c, rng) {
    const cx = w/2;
    // Body
    for (let y = h*0.3; y < h*0.6; y++) for (let x = 0; x < w; x++) {
        if ((x-cx)**2/(w*0.15)**2 + (y-h*0.45)**2/(h*0.12)**2 < 1) g[Math.floor(y)][x] = c;
    }
    // Neck
    for (let y = h*0.1; y < h*0.4; y++) for (let x = 0; x < w; x++) {
        if (Math.abs(x-(cx-w*0.05)) < 2) g[Math.floor(y)][x] = c;
    }
    // Wings
    for (let y = h*0.2; y < h*0.5; y++) for (let x = 0; x < w; x++) {
        let spread = w*0.35 * Math.sin((y-h*0.2)/(h*0.3)*Math.PI);
        if (Math.abs(x-cx) > w*0.1 && Math.abs(x-cx) < spread) g[Math.floor(y)][x] = c;
    }
    // Legs
    for (let y = h*0.6; y < h*0.85; y++) {
        for (let side of [-1,1]) {
            let lx = Math.floor(cx + side * w*0.05);
            if (lx >= 0 && lx < w) g[Math.floor(y)][lx] = c;
        }
    }
}

function drawBelt(g, w, h, c, rng) {
    const cx = w/2, cy = h/2;
    // Rectangular with ornate edges
    for (let y = h*0.2; y < h*0.8; y++) for (let x = 0; x < w; x++) {
        if (Math.abs(x-cx) < w*0.3) g[Math.floor(y)][x] = c;
    }
    // Decorative center
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let d = Math.sqrt((x-cx)**2+(y-cy)**2);
        if (d < w*0.15 && Math.abs(d-w*0.1) < 2) g[Math.floor(y)][x] = c;
    }
}

function drawCloudPattern(g, w, h, c, rng) {
    // Auspicious cloud pattern (祥云纹)
    const rng2 = mulberry32(w*200+h);
    for (let i = 0; i < 4; i++) {
        let bx = rng2() * w * 0.6 + w*0.2;
        let by = rng2() * h * 0.6 + h*0.2;
        let r = w * 0.1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if ((x-bx)**2 + (y-by)**2 < r*r) g[Math.floor(y)][x] = c;
        }
        // Cloud tail
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (Math.abs(y-by) < r*0.4 && x > bx && x < bx+r*1.5) g[Math.floor(y)][x] = c;
        }
    }
}

function drawMountainPattern(g, w, h, c, rng) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let ny = (h-y)/h;
        let m = Math.sin(x/w*Math.PI*3)*0.2 + Math.sin(x/w*Math.PI*5+1)*0.1 + 0.3;
        if (ny < m) g[Math.floor(y)][x] = c;
    }
}

function drawWaterPattern(g, w, h, c, rng) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let base = h*0.3;
        let wave = Math.sin(x/w*Math.PI*6)*h*0.08 + Math.sin(x/w*Math.PI*3)*h*0.12;
        if (y > base+wave && y < base+wave+h*0.2) g[Math.floor(y)][x] = c;
    }
}

function drawWindowPattern(g, w, h, c, rng) {
    // Ancient window lattice
    const cx = w/2, cy = h/2;
    const spacing = Math.floor(Math.min(w,h)/6);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let d = Math.sqrt((x-cx)**2+(y-cy)**2);
        if (d < Math.min(w,h)*0.4) {
            if (x % spacing < 2 || y % spacing < 2) g[Math.floor(y)][x] = c;
        }
    }
}

// ============================================================
// Theme → generator mapping
// ============================================================
function generatePattern(level, rng) {
    const { levelId, size, colorCount, theme } = level;
    const [w, h] = size.split('x').map(Number);
    const g = Array.from({length: h}, () => Array(w).fill(0));

    const colors = [];
    for (let i = 0; i < colorCount; i++) colors.push(i + 1);

    // Primary pattern (always color 1)
    const C1 = colors[0];
    const C2 = colorCount > 1 ? colors[1] : C1;
    const C3 = colorCount > 2 ? colors[2] : C2;
    const C4 = colorCount > 3 ? colors[3] : C3;
    const C5 = colorCount > 4 ? colors[4] : C4;

    const t = theme;

    // === Single-shape themes ===
    if (t === '爱心') { drawHeart(g, w, h, C1, rng); }
    else if (t === '五角星') { drawStar(g, w, h, C1, rng); }
    else if (t === '弯月') { drawMoon(g, w, h, C1, rng); }
    else if (t === '云朵') { drawCloud(g, w, h, C1, rng); }
    else if (t === '小福字') { drawBlessingChar(g, w, h, C1, rng); }
    else if (t === '小灯笼' || t === '大红灯笼串') { drawLantern(g, w, h, C1, rng); }
    else if (t === '小花') { drawFlower(g, w, h, C1, 5, rng); }
    else if (t === '平安扣') { drawCircle(g, w, h, C1, false); drawCircle(g, w, h, C2, true); }
    else if (t === '中国结') { drawKnot(g, w, h, C1, rng); }
    else if (t === '金元宝') { drawIngot(g, w, h, C1, rng); }
    else if (t === '小锦鲤' || t === '完整锦鲤') { drawKoi(g, w, h, C1, rng); }
    else if (t === '折扇') { drawFan(g, w, h, C1, rng); }
    else if (t === '茶壶') { drawTeapot(g, w, h, C1, rng); }
    else if (t === '梅花') { drawFlower(g, w, h, C1, 5, rng); }
    else if (t === '熊猫头像') { drawPanda(g, w, h, C1, C2, rng); }
    else if (t === '玉如意') { drawRuyi(g, w, h, C1, rng); }
    else if (t === '祥云纹') { drawCloudPattern(g, w, h, C1, rng); }
    else if (t === '山纹' || t === '简山水' || t === '远山层叠') { drawMountainPattern(g, w, h, C1, rng); }
    else if (t === '水波纹' || t === '流水瀑布') { drawWaterPattern(g, w, h, C1, rng); }
    else if (t === '古风窗纹') { drawWindowPattern(g, w, h, C1, rng); }
    else if (t === '兔子') { drawRabbit(g, w, h, C1, rng); }
    else if (t === '小猫') { drawCat(g, w, h, C1, C2, rng); }
    else if (t === '柿子' || t === '橘子') { drawCircle(g, w, h, C1, true); }
    else if (t === '古风花瓶') { drawVase(g, w, h, C1, rng); }
    else if (t === '荷叶') { drawLeaf(g, w, h, C1, rng); }
    else if (t === '莲蓬' || t === '莲花') { drawLotus(g, w, h, C1, rng); }
    else if (t === '竹子' || t === '竹林' || t === '竹影' || t === '竹影清风') { drawBamboo(g, w, h, C1, rng); }
    else if (t === '兰花' || t === '兰草丛' || t === '兰香幽谷') { drawLeaf(g, w, h, C1, rng); }
    else if (t === '玉佩套装' || t === '流苏玉佩') { drawJade(g, w, h, C1, rng); }
    else if (t === '小亭子') { drawPavilion(g, w, h, C1, rng); }
    else if (t === '小桥') { drawBridge(g, w, h, C1, rng); }
    else if (t === '牡丹简形' || t === '完整牡丹' || t === '富贵牡丹图') { drawFlower(g, w, h, C1, 8, rng); }
    else if (t === '菊花' || t === '菊花丛') { drawFlower(g, w, h, C1, 12, rng); }
    else if (t === '仙鹤简形' || t === '仙鹤齐飞') { drawCrane(g, w, h, C1, rng); }
    else if (t === '鹿纹' || t === '神话仙鹿') { drawDeer(g, w, h, C1, rng); }
    else if (t === '福袋') { drawGourd(g, w, h, C1, rng); }
    else if (t === '铜钱纹') { drawCoin(g, w, h, C1, rng); }
    else if (t === '古风面具') { drawCircle(g, w, h, C1, true); }
    else if (t === '古琴') { drawScroll(g, w, h, C1, rng); }
    else if (t === '围棋') { drawRectangle(g, w, h, C1); }
    else if (t === '书籍' || t === '书卷展开') { drawScroll(g, w, h, C1, rng); }
    else if (t === '画卷') { drawScroll(g, w, h, C1, rng); }
    else if (t === '龙纹半身' || t === '龙身' || t === '龙游九天') { drawDragonSimple(g, w, h, C1, rng); }
    else if (t === '凤纹半身' || t === '凤身' || t === '凤凰展翅' || t === '小凤纹') { drawPhoenix(g, w, h, C1, rng); }
    else if (t === '古城门' || t === '城门楼') { drawGate(g, w, h, C1, rng); }
    else if (t === '宝塔') { drawPagoda(g, w, h, C1, rng); }
    else if (t === '神兽纹' || t === '麒麟简形' || t === '完整麒麟' || t === '麒麟踏云') { drawDeer(g, w, h, C1, rng); }
    else if (t === '小花轿' || t === '古风花轿局部') { drawTemple(g, w, h, C1, rng); }
    else if (t === '神龟') { drawTurtle(g, w, h, C1, rng); }
    else if (t === '风筝') { drawDiamond(g, w, h, C1); }
    else if (t === '鞭炮串') { drawBell(g, w, h, C1, rng); }
    else if (t === '粽子组合') { drawTriangle(g, w, h, C1); }
    else if (t === '月饼礼盒') { drawCircle(g, w, h, C1, true); }
    else if (t === '香囊') { drawGourd(g, w, h, C1, rng); }
    else if (t === '发簪') {
        const cx = w/2;
        for (let y = h*0.1; y < h*0.85; y++) for (let x = 0; x < w; x++) {
            if (Math.abs(x-cx) < 2) g[Math.floor(y)][x] = C1;
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (y < h*0.15 && Math.abs(x-cx) < w*0.1) g[Math.floor(y)][x] = C1;
        }
    }
    else if (t === '香炉青烟') {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let cx2 = w/2 + Math.sin(y/h * Math.PI * 4) * w*0.15;
            if (Math.abs(x-cx2) < 2 && y > h*0.2 && y < h*0.8) g[Math.floor(y)][x] = C1;
        }
    }
    else if (t === '孤舟') {
        for (let y = h*0.4; y < h*0.55; y++) for (let x = 0; x < w; x++) {
            if (Math.abs(x-w/2) < w*0.3) g[Math.floor(y)][x] = C1;
        }
    }
    else if (t === '云海') { drawCloud(g, w, h, C1, rng); drawCloud(g, w, h, C2, rng); }
    else if (t === '松针满屏' || t === '松鹤图') {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let wave = Math.sin(x/8)*2;
            if (y > h*0.2 && y < h*0.8 && Math.abs(y - (h*0.3 + wave + (x%5))) < 1.5) g[Math.floor(y)][x] = C1;
        }
    }
    else if (t === '枫叶' || t === '银杏叶') {
        drawLeaf(g, w, h, C1, rng);
    }
    else if (t === '舞狮头') {
        drawCircle(g, w, h, C1, true);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (Math.abs(y-h*0.4) < 3 && Math.abs(x-w/2) < w*0.2) g[Math.floor(y)][x] = C2;
        }
    }
    else if (t === '龙头局部') {
        drawCircle(g, w, h, C1, true);
    }
    else if (t === '玉璧纹') {
        drawCircle(g, w, h, C1, false);
        drawCircle(g, w, h, C2, true);
    }
    else if (t === '鼎纹' || t === '编钟' || t === '铜镜纹') {
        drawCircle(g, w, h, C1, false);
    }
    else if (t === '古钱币串') {
        drawCoin(g, w, h, C1, rng);
    }
    else if (t === '长命锁') {
        const cx = w/2, cy = h/2;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let d = Math.sqrt((x-cx)**2+(y-cy)**2);
            if (d < Math.min(w,h)*0.35 && Math.abs(d-Math.min(w,h)*0.25) < 3) g[Math.floor(y)][x] = C1;
        }
    }
    else if (t === '皮影小人') {
        const cx = w/2;
        // Head
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if ((x-cx)**2+(y-h*0.2)**2 < (w*0.1)**2) g[Math.floor(y)][x] = C1;
        }
        // Body
        for (let y = h*0.3; y < h*0.7; y++) for (let x = 0; x < w; x++) {
            if (Math.abs(x-cx) < 2) g[Math.floor(y)][x] = C1;
        }
        // Arms
        for (let y = h*0.35; y < h*0.55; y++) for (let x = 0; x < w; x++) {
            if (Math.abs(y-h*0.45) < 2 && Math.abs(x-cx) < w*0.25) g[Math.floor(y)][x] = C1;
        }
    }
    else if (t === '京剧脸谱简形') {
        drawCircle(g, w, h, C1, true);
        // Face details
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (Math.abs(y-h*0.45) < 2 && Math.abs(x-w/2) < w*0.15) g[Math.floor(y)][x] = C2;
            if (Math.abs(y-h*0.55) < 3 && Math.abs(x-w/2) < w*0.08) g[Math.floor(y)][x] = C2;
        }
    }
    else if (t === '龙舟船头') {
        drawFish(g, w, h, C1, rng);
    }
    else if (t === '金蟾' || t === '蝙蝠献福' || t === '貔貅半身' || t === '貔貅招财') {
        drawCat(g, w, h, C1, C2, rng);
    }
    else if (t === '嫦娥简形') {
        drawCircle(g, w, h, C1, true);
    }
    else if (t === '桂花枝') {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (Math.abs(x-w*0.3) < 2 && y > h*0.2) g[Math.floor(y)][x] = C1;
        }
        for (let i = 0; i < 8; i++) {
            let bx = w*0.3 + (i%4)*w*0.1;
            let by = h*0.3 + Math.floor(i/4)*h*0.3;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if ((x-bx)**2+(y-by)**2 < (w*0.05)**2) g[Math.floor(y)][x] = C2;
            }
        }
    }
    else if (t === '广寒宫剪影') {
        drawTemple(g, w, h, C1, rng);
    }
    else if (t === '饕餮纹简版') {
        drawCircle(g, w, h, C1, true);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (Math.abs(y-h*0.5) < 3 && Math.abs(x-w/2) < w*0.2) g[Math.floor(y)][x] = C2;
        }
    }
    else if (t === '文房四宝' || t === '笔筒' || t === '镇纸' || t === '笔架' || t === '茶盏') {
        drawVase(g, w, h, C1, rng);
    }
    else if (t === '古风书架') {
        for (let shelf = 0; shelf < 4; shelf++) {
            let sy = h * (0.15 + shelf * 0.2);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if (Math.abs(y-sy) < 2) g[Math.floor(y)][x] = C1;
            }
        }
    }
    else if (t === '假山') {
        drawMountainPattern(g, w, h, C1, rng);
    }
    else if (t === '曲桥') {
        drawBridge(g, w, h, C1, rng);
    }
    else if (t === '回廊') {
        for (let y = h*0.3; y < h*0.7; y++) for (let x = 0; x < w; x++) {
            if (y % 4 < 2 && Math.abs(x-w/2) < w*0.4) g[Math.floor(y)][x] = C1;
        }
    }
    else if (t === '牌坊') {
        drawGate(g, w, h, C1, rng);
    }
    else if (t === '飞檐翘角' || t === '瓦当纹' || t === '斗拱结构简形') {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (y > h*0.3 && y < h*0.7 && Math.abs(x-w/2) < w*0.35) g[Math.floor(y)][x] = C1;
        }
    }
    else if (t.startsWith('对称')) {
        // Mirror-symmetric patterns
        const half = Math.floor(w/2);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < half; x++) {
                let cx = half/2;
                let d = Math.sqrt((x-cx)**2 + (y-h/2)**2);
                if (d < half*0.7) {
                    let color = (Math.floor(d/3) % (colorCount)) + 1;
                    g[Math.floor(y)][x] = color;
                    g[Math.floor(y)][w-1-x] = color;
                }
            }
        }
    }
    else if (t === '四象神兽合集' || t === '四象简纹合集') {
        const rng2 = mulberry32(levelId);
        const quadrants = [
            {cx: w*0.25, cy: h*0.25}, {cx: w*0.75, cy: h*0.25},
            {cx: w*0.25, cy: h*0.75}, {cx: w*0.75, cy: h*0.75},
        ];
        for (let qi = 0; qi < 4; qi++) {
            let c = colors[qi % colorCount];
            let q = quadrants[qi];
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if ((x-q.cx)**2/(w*0.18)**2 + (y-q.cy)**2/(h*0.18)**2 < 1) g[Math.floor(y)][x] = c;
            }
        }
    }
    else if (t === '梅兰竹菊合集' || t === '四季花木合集' || t === '百花图卷') {
        const rng2 = mulberry32(levelId);
        for (let i = 0; i < 6; i++) {
            let fx = w*0.15 + (i%3)*w*0.3;
            let fy = h*0.25 + Math.floor(i/3)*h*0.4;
            let c = colors[i % colorCount];
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if ((x-fx)**2 + (y-fy)**2 < (w*0.1)**2) g[Math.floor(y)][x] = c;
            }
        }
    }
    else if (t === '梅雪争春') {
        drawFlower(g, w, h, C1, 5, rng);
        // Snow dots
        for (let i = 0; i < 20; i++) {
            let sx = Math.floor(rng() * w);
            let sy = Math.floor(rng() * h);
            if (g[sy][sx] === 0) g[sy][sx] = C2;
        }
    }
    else if (t === '荷塘月色' || t === '荷塘' || t === '出水芙蓉') {
        drawLotus(g, w, h, C1, rng);
        drawLeaf(g, w, h, C2, rng);
    }
    else if (t === '富贵花开') {
        drawFlower(g, w, h, C1, 8, rng);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (g[Math.floor(y)][x] === 0 && rng() < 0.15) g[Math.floor(y)][x] = C2;
        }
    }
    else if (t === '龙凤呈祥' || t === '龙凤合体') {
        drawDragonSimple(g, w, h, C1, rng);
        drawPhoenix(g, w, h, C2, rng);
    }
    else if (t === '年年有余') {
        drawFish(g, w, h, C1, rng);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (g[Math.floor(y)][x] === 0 && rng() < 0.1) g[Math.floor(y)][x] = C2;
        }
    }
    else if (t === '古风庭院' || t === '完整庭院全景') {
        drawPavilion(g, w, h, C1, rng);
        for (let y = h*0.7; y < h; y++) for (let x = 0; x < w; x++) {
            if (g[Math.floor(y)][x] === 0 && rng() < 0.3) g[Math.floor(y)][x] = C2;
        }
    }
    else if (t === '古风宫殿一角') {
        drawTemple(g, w, h, C1, rng);
        for (let y = h*0.7; y < h; y++) for (let x = 0; x < w; x++) {
            if (g[Math.floor(y)][x] === 0 && rng() < 0.2) g[Math.floor(y)][x] = C2;
        }
    }
    else if (t === '灯笼街景') {
        for (let i = 0; i < 5; i++) {
            let lx = w * 0.15 + i * w * 0.18;
            for (let y = h*0.1; y < h*0.6; y++) for (let x = 0; x < w; x++) {
                if (Math.abs(x-lx) < 2) g[Math.floor(y)][x] = C2;
            }
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if ((x-lx)**2 + (y-h*0.35)**2 < (w*0.08)**2) g[Math.floor(y)][x] = C1;
            }
        }
    }
    else if (t === '古风街市一角' || t === '古风建筑小全景' || t === '盛世长安局部' || t === '宫殿局部' || t === '宫殿局部全景') {
        drawTemple(g, w, h, C1, rng);
        for (let y = h*0.7; y < h; y++) for (let x = 0; x < w; x++) {
            if (g[Math.floor(y)][x] === 0 && rng() < 0.2) g[Math.floor(y)][x] = C2;
        }
    }
    else if (t === '酒肆旗子') {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (Math.abs(x-w*0.3) < 2) g[Math.floor(y)][x] = C1;
        }
        for (let y = h*0.1; y < h*0.5; y++) for (let x = 0; x < w; x++) {
            if (x > w*0.3 && x < w*0.65 && y > h*0.1 && y < h*0.5) g[Math.floor(y)][x] = C2;
        }
    }
    else if (t === '车马剪影' || t === '盛世小景' || t === '国风全景大图' || t === '国风民俗全景' || t === '山水长卷' || t === '古风婚礼小景' || t === '琴棋书画套装' || t === '百鸟朝凤简版') {
        // Scene: mountain + water + small elements
        drawMountainPattern(g, w, h, C1, rng);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (y > h*0.6 && g[Math.floor(y)][x] === 0 && rng() < 0.3) g[Math.floor(y)][x] = C2;
        }
    }
    else if (t === '古画局部' || t === '江山图局部' || t === '大幅山水' || t === '山水小全景' || t === '完整山水' || t === '山水渔隐图') {
        drawMountainPattern(g, w, h, C1, rng);
        drawWaterPattern(g, w, h, C2, rng);
    }
    else if (t === '烟花剪影') {
        const cx = w/2, cy = h*0.4;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let d = Math.sqrt((x-cx)**2+(y-cy)**2);
            if (d < w*0.3 && d > w*0.2 && Math.sin(d*0.5) > 0.3) g[Math.floor(y)][x] = C1;
        }
    }
    else if (t === '灯会人群' || t === '戏台剪影' || t === '庙会小景') {
        drawTemple(g, w, h, C1, rng);
        // Crowd dots
        for (let y = h*0.7; y < h; y++) for (let x = 0; x < w; x++) {
            if (g[Math.floor(y)][x] === 0 && rng() < 0.2) g[Math.floor(y)][x] = C2;
        }
    }
    else if (t === '福满乾坤' || t === '百福图简版' || t === '满屏百福' || t === '禄寿双全' || t === '喜结连理' || t === '财运势起' || t === '福瑞满堂') {
        drawBlessingChar(g, w, h, C1, rng);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (g[Math.floor(y)][x] === 0 && rng() < 0.15) g[Math.floor(y)][x] = C2;
        }
    }
    else if (t === '满屏龙纹' || t === '满屏凤纹') {
        for (let i = 0; i < 3; i++) {
            let ox = i * w * 0.3;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                let midX = ox + Math.sin(y/h * Math.PI * 3) * w * 0.1;
                if (Math.abs(x-midX) < w*0.06 && y > h*0.1 && y < h*0.9) g[Math.floor(y)][x] = C1;
            }
        }
    }
    else if (t === '神兽组合' || t === '神兽全家福' || t === '上古瑞兽大全') {
        const rng2 = mulberry32(levelId);
        for (let i = 0; i < 4; i++) {
            let sx = w * 0.25 + (i%2) * w * 0.45;
            let sy = h * 0.3 + Math.floor(i/2) * h * 0.35;
            let c = colors[i % colorCount];
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if ((x-sx)**2/(w*0.12)**2 + (y-sy)**2/(h*0.12)**2 < 1) g[Math.floor(y)][x] = c;
            }
        }
    }
    else if (t === '锦鲤群') {
        for (let i = 0; i < 3; i++) {
            let ox = i * w * 0.3 + w * 0.1;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                let fx = ox;
                let fy2 = h * 0.3 + i * h * 0.2;
                if ((x-fx)**2/(w*0.12)**2 + (y-fy2)**2/(h*0.08)**2 < 1) g[Math.floor(y)][x] = C1;
            }
        }
    }
    else if (t === '终极对称国风图腾' || t === '终极对称神兽') {
        const half = Math.floor(w/2);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < half; x++) {
                let cx2 = half/2;
                let d = Math.sqrt((x-cx2)**2 + (y-h/2)**2);
                let angle = Math.atan2(y-h/2, x-cx2);
                let pattern = Math.sin(angle*6 + d*0.5);
                if (pattern > 0.2 && d < half*0.8) {
                    let color = (Math.floor(d/4) % colorCount) + 1;
                    g[Math.floor(y)][x] = color;
                    g[Math.floor(y)][w-1-x] = color;
                }
            }
        }
    }
    else if (t === '五福圆满终极关' || t === '国风盛世全景') {
        // Grand finale: layered pattern
        drawMountainPattern(g, w, h, C1, rng);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (g[Math.floor(y)][x] === 0 && rng() < 0.2) g[Math.floor(y)][x] = C2;
        }
        drawCircle(g, w, h, C3, false);
    }
    else {
        // Default: geometric pattern based on theme hash
        let hash = 0;
        for (let ch of theme) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
        const rng2 = mulberry32(Math.abs(hash));

        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let nx = (x - w/2) / (w*0.4);
            let ny = (y - h/2) / (h*0.4);
            let dist = Math.sqrt(nx*nx + ny*ny);

            let patternVal = 0;
            let patternType = Math.floor(rng2() * 5);
            switch (patternType) {
                case 0: patternVal = Math.sin(nx*5) * Math.cos(ny*5); break;
                case 1: patternVal = Math.sin(dist * 8); break;
                case 2: patternVal = Math.cos(nx*4 + ny*4); break;
                case 3: patternVal = 1 - Math.abs(nx) - Math.abs(ny); break;
                case 4: patternVal = Math.sin(nx*3) * Math.sin(ny*3); break;
            }

            if (patternVal > 0.2 && dist < 1) {
                let colorIdx = Math.floor((patternVal - 0.2) / 0.8 * colorCount);
                colorIdx = Math.min(colorCount - 1, Math.max(0, colorIdx));
                g[Math.floor(y)][x] = colorIdx + 1;
            }
        }
    }

    // If pattern is completely empty, fill with a simple circle
    let hasContent = false;
    for (let y = 0; y < h && !hasContent; y++)
        for (let x = 0; x < w && !hasContent; x++)
            if (g[Math.floor(y)][x] > 0) hasContent = true;

    if (!hasContent) {
        drawCircle(g, w, h, C1, true);
    }

    // Ensure we have exactly colorCount colors used
    const usedColors = new Set();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (g[Math.floor(y)][x] > 0) usedColors.add(g[Math.floor(y)][x]);
    }

    // If fewer colors than requested, add accent areas
    let colorIdx = 1;
    while (usedColors.size < colorCount && colorIdx <= colorCount) {
        if (!usedColors.has(colorIdx)) {
            // Find empty cells and place accent blob on them
            const empties = [];
            for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
                if (g[r][c] === 0) empties.push([r, c]);
            }
            let placed = false;
            if (empties.length > 0) {
                const rng2 = mulberry32(levelId * 100 + colorIdx);
                const radius = Math.max(2, Math.floor(Math.min(w,h) * 0.1));
                // Try multiple random positions from empty cells
                for (let attempt = 0; attempt < 20 && !placed; attempt++) {
                    const [sr, sc] = empties[Math.floor(rng2() * empties.length)];
                    let count = 0;
                    for (let dy = -radius; dy <= radius; dy++) {
                        for (let dx = -radius; dx <= radius; dx++) {
                            const ny = sr + dy, nx = sc + dx;
                            if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
                                if (dx*dx + dy*dy < radius*radius && g[ny][nx] === 0) {
                                    g[ny][nx] = colorIdx;
                                    count++;
                                }
                            }
                        }
                    }
                    if (count > 0) placed = true;
                }
            }
            if (placed) usedColors.add(colorIdx);
        }
        colorIdx++;
    }

    return g;
}

// ============================================================
// Shuffle: redistribute non-zero cells while preserving counts
// ============================================================
function shufflePattern(correct, difficulty, levelId) {
    const h = correct.length, w = correct[0].length;
    const init = Array.from({length: h}, () => Array(w).fill(0));

    // Collect non-zero cells with their colors
    const nonZero = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        if (correct[r][c] > 0) nonZero.push(correct[r][c]);
    }

    // Shuffle with difficulty-based displacement rate
    const dispRate = 0.3 + difficulty * 0.15; // diff 1 = 45%, diff 5 = 75%, diff 6 = 90%

    // Simple approach: shuffle the array, then ensure displacement rate
    for (let i = nonZero.length - 1; i > 0; i--) {
        const j = Math.floor(mulberry32(levelId * 7 + i)() * (i + 1));
        [nonZero[i], nonZero[j]] = [nonZero[j], nonZero[i]];
    }

    // Collect empty positions
    const emptyPositions = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        if (correct[r][c] === 0) emptyPositions.push([r, c]);
    }

    // Place shuffled values
    const positions = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        if (correct[r][c] > 0) positions.push([r, c]);
    }

    // Shuffle positions too
    for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(mulberry32(levelId * 13 + i)() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    // Place shuffled colors in shuffled positions
    for (let i = 0; i < nonZero.length; i++) {
        const [r, c] = positions[i];
        init[r][c] = nonZero[i];
    }

    // If some positions weren't filled (shouldn't happen, but safety)
    // The arrays should be same length since we collect all non-zero positions

    return init;
}

// ============================================================
// Count non-zero cells (for slotTotalCount)
// ============================================================
function countNonZero(grid) {
    let count = 0;
    for (const row of grid) for (const v of row) if (v > 0) count++;
    return count;
}

// ============================================================
// Generate all 200 levels
// ============================================================
function generate() {
    const outDir = path.join(__dirname, 'guanka');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    for (const level of LEVEL_DATA) {
        const [w, h] = level.size.split('x').map(Number);
        const rng = mulberry32(level.levelId * 31337);

        const correct = generatePattern(level, rng);
        const init = shufflePattern(correct, level.difficulty, level.levelId);
        const slotTotal = countNonZero(correct);

        const levelData = {
            levelId: level.levelId,
            boardWidth: w,
            boardHeight: h,
            timeLimit: level.timeLimit,
            slotTotalCount: slotTotal,
            correctColorArr: correct,
            initRandomColorArr: init,
        };

        const filePath = path.join(outDir, `level_${level.levelId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(levelData, null, 2));

        if (level.levelId % 25 === 0 || level.levelId <= 5) {
            console.log(`Generated level ${level.levelId}: ${level.theme} (${level.size}, ${level.colorCount}色, ${level.difficulty}难度${level.isBoss ? ', BOSS' : ''})`);
        }
    }

    console.log(`\nDone! Generated ${LEVEL_DATA.length} levels in ${outDir}`);
}

generate();
