/**
 * 豆豆/凹槽精灵图生成器 — 用 Canvas2D 生成等效 pindd brick/ 精灵图
 */

import { ImageAsset, Texture2D, SpriteFrame, Rect } from 'cc';
import { COLOR_HEX } from './LevelConfig';

const BEAN_SIZE = 84;
const SLOT_SIZE = 64;

function createRenderCanvas(width: number, height: number): HTMLCanvasElement | any {
    try {
        const doc = typeof document !== 'undefined' ? (document as any) : null;
        if (doc?.createElement) {
            const canvas = doc.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            return canvas;
        }
    } catch (_) {
        // fall through to minigame canvas APIs
    }

    const globalAny = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
    const windowAny = typeof window !== 'undefined' ? (window as any) : null;
    const wx = globalAny?.wx || globalAny?.__rawWx || windowAny?.wx || null;
    const globalAdapter = windowAny?.__globalAdapter || globalAny?.__globalAdapter || null;

    try {
        const canvas = typeof wx?.createOffscreenCanvas === 'function'
            ? wx.createOffscreenCanvas({ type: '2d', width, height })
            : null;
        if (canvas) {
            canvas.width = width;
            canvas.height = height;
            return canvas;
        }
    } catch (_) {
        // fall through to adapter canvas
    }

    if (typeof globalAdapter?.createCanvas === 'function') {
        const canvas = globalAdapter.createCanvas();
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    throw new Error('No canvas implementation available for bean sprite generation');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m
        ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
        : { r: 200, g: 200, b: 200 };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

/**
 * 生成豆豆精灵图（正常/锁定）
 * @param colorId 颜色 ID
 * @param locked 是否为锁定状态（偏暗 + ✓ 标记）
 * @param size 图片尺寸（默认 84）
 */
export function createBeanSpriteFrame(colorId: number, locked: boolean, size: number = BEAN_SIZE): SpriteFrame {
    const canvas = createRenderCanvas(size, size);
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);

    const hex = COLOR_HEX[colorId] || '#CCCCCC';
    const { r, g, b } = hexToRgb(hex);

    const s = size;
    const pad = Math.max(2, Math.floor(s * 0.03));       // 外边距
    const r1 = Math.max(4, Math.floor(s * 0.14));        // 圆角半径
    const inset = Math.max(3, Math.floor(s * 0.06));     // 内边距
    const r2 = Math.max(2, r1 - 1);

    const mul = locked ? 0.85 : 1.0;
    const br = Math.floor(r * mul), bg = Math.floor(g * mul), bb = Math.floor(b * mul);

    // 1. 深色边框/阴影
    const dr = Math.max(0, Math.floor(br * 0.5));
    const dg = Math.max(0, Math.floor(bg * 0.5));
    const db = Math.max(0, Math.floor(bb * 0.5));
    ctx.fillStyle = `rgba(${dr},${dg},${db},1)`;
    roundRect(ctx, pad, pad, s - pad * 2, s - pad * 2, r1);
    ctx.fill();

    // 2. 主体颜色（稍亮，模拟内层面板）
    const mr = Math.min(255, Math.floor(br * 0.85 + 60 * 0.15));
    const mg = Math.min(255, Math.floor(bg * 0.85 + 60 * 0.15));
    const mb = Math.min(255, Math.floor(bb * 0.85 + 60 * 0.15));
    ctx.fillStyle = `rgb(${mr},${mg},${mb})`;
    roundRect(ctx, pad + inset, pad + inset, s - (pad + inset) * 2, s - (pad + inset) * 2, r2);
    ctx.fill();

    // 3. 内层高光（顶部亮边）
    const hr = Math.min(255, Math.floor(br * 0.92 + 80 * 0.08));
    const hg = Math.min(255, Math.floor(bg * 0.92 + 80 * 0.08));
    const hb = Math.min(255, Math.floor(bb * 0.92 + 80 * 0.08));
    ctx.fillStyle = `rgba(${hr},${hg},${hb},0.8)`;
    const innerPad = inset + Math.max(1, Math.floor(s * 0.02));
    const innerH = Math.floor((s - (pad + innerPad) * 2) * 0.35);
    if (innerH > 2) {
        ctx.save();
        roundRect(ctx, pad + innerPad, pad + innerPad, s - (pad + innerPad) * 2, s - (pad + innerPad) * 2, Math.max(1, r2 - 1));
        ctx.clip();
        ctx.fillRect(pad + innerPad, pad + innerPad, s - (pad + innerPad) * 2, innerH);
        ctx.restore();
    }

    // 4. X 切面高光（左下三角）
    const cx = s / 2, cy = s / 2;
    const m = s / 2 - pad - inset - 2;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(cx - m, cy + m);
    ctx.lineTo(cx + m, cy + m);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(cx - m, cy + m);
    ctx.lineTo(cx - m, cy - m);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();

    // 5. X 切面阴影（右上三角）
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.moveTo(cx + m, cy - m);
    ctx.lineTo(cx - m, cy - m);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.beginPath();
    ctx.moveTo(cx + m, cy + m);
    ctx.lineTo(cx + m, cy - m);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();

    // 6. X 对角线
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, Math.floor(s * 0.02));
    ctx.beginPath();
    ctx.moveTo(cx - m, cy + m); ctx.lineTo(cx + m, cy - m);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + m, cy + m); ctx.lineTo(cx - m, cy - m);
    ctx.stroke();

    // 7. 锁定状态 ✓ 标记
    if (locked) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = Math.max(2, Math.floor(s * 0.05));
        const ck = Math.floor(s * 0.22);
        ctx.beginPath();
        ctx.moveTo(cx - ck, cy + ck * 0.2);
        ctx.lineTo(cx - ck * 0.2, cy + ck * 0.7);
        ctx.lineTo(cx + ck * 0.7, cy - ck * 0.6);
        ctx.stroke();
    }

    const img = new ImageAsset(canvas);
    const tex = new Texture2D();
    tex.image = img;
    const sf = new SpriteFrame();
    sf.texture = tex;
    return sf;
}

/**
 * 生成凹槽精灵图（目标颜色凹陷指示）
 * @param colorId 目标颜色 ID，0 = 空凹槽
 */
export function createSlotSpriteFrame(colorId: number): SpriteFrame {
    const canvas = createRenderCanvas(SLOT_SIZE, SLOT_SIZE);
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, SLOT_SIZE, SLOT_SIZE);

    const s = SLOT_SIZE;
    const pad = 4;
    const r = Math.max(6, Math.floor(s * 0.15));

    if (colorId > 0) {
        const hex = COLOR_HEX[colorId] || '#CCCCCC';
        const { r: cr, g: cg, b: cb } = hexToRgb(hex);

        // 1. 先填一层纯色底（不透明，确保可见）
        ctx.fillStyle = `rgb(${Math.floor(cr * 0.5 + 40)},${Math.floor(cg * 0.5 + 40)},${Math.floor(cb * 0.5 + 40)})`;
        roundRect(ctx, pad, pad, s - pad * 2, s - pad * 2, r);
        ctx.fill();

        // 2. 内层凹陷（比底色暗）
        const m1 = pad + 3;
        const r1 = Math.max(3, Math.floor(s * 0.10));
        ctx.fillStyle = `rgb(${Math.floor(cr * 0.2 + 15)},${Math.floor(cg * 0.2 + 15)},${Math.floor(cb * 0.2 + 15)})`;
        roundRect(ctx, m1, m1, s - m1 * 2, s - m1 * 2, r1);
        ctx.fill();

        // 3. 更深的内层凹底
        const m2 = m1 + 2;
        const r2 = Math.max(2, r1 - 1);
        ctx.fillStyle = `rgb(${Math.floor(cr * 0.25 + 20)},${Math.floor(cg * 0.25 + 20)},${Math.floor(cb * 0.25 + 20)})`;
        roundRect(ctx, m2, m2, s - m2 * 2, s - m2 * 2, r2);
        ctx.fill();

        // 4. 顶部暗影（模拟凹陷）
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        const topH = Math.floor((s - m2 * 2) * 0.45);
        roundRect(ctx, m2 + 1, m2, s - m2 * 2 - 2, topH, r2);
        ctx.fill();

        // 5. 底部微光（凹陷底部反光）
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        roundRect(ctx, m2 + 2, s - m2 - 8, s - m2 * 2 - 4, 5, 2);
        ctx.fill();

    } else {
        // 空凹槽（灰色凹陷）— 不透明底色确保可见
        ctx.fillStyle = 'rgb(170,162,152)';
        roundRect(ctx, pad, pad, s - pad * 2, s - pad * 2, r);
        ctx.fill();

        // 内层凹陷
        const m1 = pad + 3;
        const r1 = Math.max(3, Math.floor(s * 0.10));
        ctx.fillStyle = 'rgb(140,132,122)';
        roundRect(ctx, m1, m1, s - m1 * 2, s - m1 * 2, r1);
        ctx.fill();

        // 顶部暗影
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        const topH = Math.floor((s - m1 * 2) * 0.45);
        roundRect(ctx, m1 + 1, m1, s - m1 * 2 - 2, topH, r1);
        ctx.fill();

        // 底部微光
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        roundRect(ctx, m1 + 2, s - m1 - 8, s - m1 * 2 - 4, 5, 2);
        ctx.fill();
    }

    const img = new ImageAsset(canvas);
    const tex = new Texture2D();
    tex.image = img;
    const sf = new SpriteFrame();
    sf.texture = tex;
    sf.rect = new Rect(0, 0, SLOT_SIZE, SLOT_SIZE);
    sf.originalSize = { width: SLOT_SIZE, height: SLOT_SIZE };
    return sf;
}

/** 预生成所有颜色的精灵图缓存 */
type SpriteCache = {
    beans: Map<string, SpriteFrame>;    // key: "bean_{colorId}_{locked}"
    slots: Map<string, SpriteFrame>;    // key: "slot_{colorId}"
};

export class BeanSpriteFactory {
    private static cache: SpriteCache = { beans: new Map(), slots: new Map() };

    static getBeanSpriteFrame(colorId: number, locked: boolean): SpriteFrame {
        const key = `bean_${colorId}_${locked ? 1 : 0}`;
        if (!this.cache.beans.has(key)) {
            this.cache.beans.set(key, createBeanSpriteFrame(colorId, locked));
        }
        return this.cache.beans.get(key)!;
    }

    static getSlotSpriteFrame(colorId: number): SpriteFrame {
        const key = `slot_${colorId}`;
        if (!this.cache.slots.has(key)) {
            this.cache.slots.set(key, createSlotSpriteFrame(colorId));
        }
        return this.cache.slots.get(key)!;
    }

    /** 清空缓存（关卡切换时调用，防止颜色缓存残留） */
    static clearCache() {
        this.cache.beans.clear();
        this.cache.slots.clear();
    }
}
