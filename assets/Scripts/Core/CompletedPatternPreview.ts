import { _decorator, Camera, Canvas, Color, Component, director, Director, Label, Node, RenderTexture, Sprite, SpriteFrame, UITransform } from 'cc';
import type { PixelPosterPreviewOptions } from './PixelPosterPreviewRenderer';
import { getBoardBeanSize, getBoardCellSize } from './GameplayBoardVisualMetrics';
import { BOARD_SLOT_BATCH_MAX_CELLS, BoardSlotBatchRenderer } from './BoardSlotBatchRenderer';
import type { BoardSlotBatchCell } from './BoardSlotBatchRenderer';

const PREVIEW_LAYER = 1 << 20;
// Referenced images stay alive; reclaim least-recently-used idle images at either threshold.
const CACHE_LIMIT = 32;
const CACHE_BYTES = 8 * 1024 * 1024;
type Runtime = {
    getEquippedBeanSkinId(): number;
    _ensureBeanSkinAtlasLoaded(id: number, done: (ok: boolean, error?: Error | null) => void): void;
    getPinddColorKey(color: number): string | null;
    _bootstrapAtlasFrameCache: Map<string, SpriteFrame>;
    _activeBeanSkinAtlasOwner?: { skinId: number; frames: Map<string, SpriteFrame> };
};
type Entry = { frame: SpriteFrame; texture: RenderTexture; refs: number; used: number; bytes: number };
const entries = new Map<string, Entry>();
const pending = new Map<string, { task: Promise<Entry>; consumers: Set<() => boolean> }>();
let queue: Promise<unknown> = Promise.resolve();

function prune(): void {
    let bytes = Array.from(entries.values()).reduce((sum, entry) => sum + entry.bytes, 0);
    const unused = Array.from(entries.entries()).filter(([, entry]) => entry.refs === 0)
        .sort((a, b) => a[1].used - b[1].used);
    for (const [key, entry] of unused) {
        if (entries.size <= CACHE_LIMIT && bytes <= CACHE_BYTES) break;
        entries.delete(key);
        bytes -= entry.bytes;
        entry.frame.destroy();
        entry.texture.destroy();
    }
}

async function generate(grid: number[][], side: number, skin: number, runtime: Runtime, wanted: () => boolean): Promise<Entry> {
    if (!wanted()) throw new Error('缩略图请求已取消');
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('豆子素材加载超时')), 15000);
        runtime._ensureBeanSkinAtlasLoaded(skin, (ok, error) => {
            clearTimeout(timer);
            if (ok) resolve(); else reject(error || new Error('豆子素材加载失败'));
        });
    });
    if (!wanted()) throw new Error('缩略图请求已取消');
    if (runtime.getEquippedBeanSkinId() !== skin) throw new Error('生成期间豆子皮肤已变化');
    const canvas = director.getScene()?.getComponentsInChildren(Canvas).find(item => item.enabledInHierarchy);
    if (!canvas) throw new Error('缩略图缺少可用 Canvas');
    const frames = new Map<number, SpriteFrame>();
    const slotFrames = new Map<number, SpriteFrame>();
    let minRow = grid.length, minCol = Infinity, maxRow = -1, maxCol = -1;
    grid.forEach((row, r) => row.forEach((color, c) => {
        if (!color) return;
        minRow = Math.min(minRow, r); maxRow = Math.max(maxRow, r);
        minCol = Math.min(minCol, c); maxCol = Math.max(maxCol, c);
        if (!frames.has(color)) {
            // Read the requested atlas directly: gameplay's applied skin can lag behind equipment changes.
            const atlas = skin === 2000 ? runtime._bootstrapAtlasFrameCache
                : runtime._activeBeanSkinAtlasOwner?.skinId === skin ? runtime._activeBeanSkinAtlasOwner.frames : null;
            if (!atlas) throw new Error(`豆子皮肤素材已失效：${skin}`);
            const frame = atlas.get(`${runtime.getPinddColorKey(color)}_1`);
            if (!frame?.isValid || !frame.texture?.isValid) throw new Error(`缺少完成状态豆子素材：${color}`);
            const slotFrame = atlas.get(`${runtime.getPinddColorKey(color)}_4`);
            if (!slotFrame?.isValid || !slotFrame.texture?.isValid) throw new Error(`缺少目标格素材：${color}`);
            frames.set(color, frame);
            slotFrames.set(color, slotFrame);
        }
    }));
    if (maxRow < 0) throw new Error('关卡没有可展示的图案');
    const rig = new Node('CompletedPatternCapture');
    let camera: Camera | null = null;
    let texture: RenderTexture | null = null;
    let resultFrame: SpriteFrame | null = null;
    const screenCameras: Camera[] = [];
    const retainedFrames: SpriteFrame[] = [];
    const retainedTextures: SpriteFrame['texture'][] = [];
    let success = false;
    const captureFrames: SpriteFrame[] = [];
    try {
        rig.layer = PREVIEW_LAYER;
        canvas.node.addChild(rig);
        rig.addComponent(UITransform).setContentSize(side, side);
        const cameraNode = new Node('CaptureCamera');
        rig.addChild(cameraNode);
        cameraNode.setPosition(0, 0, 1000);
        camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.orthoHeight = side / 2;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new Color(0, 0, 0, 0);
        camera.visibility = PREVIEW_LAYER;
        const affectedCameras = director.getScene()!.getComponentsInChildren(Camera)
            .filter(item => item !== camera && (item.visibility & PREVIEW_LAYER) !== 0);
        affectedCameras.forEach(item => { screenCameras.push(item); item.visibility &= ~PREVIEW_LAYER; });
        texture = new RenderTexture();
        // Cocos loose spread compilation does not expand Map iterators.
        const sources = Array.from(frames.values()).concat(Array.from(slotFrames.values()));
        const sourceTextures = new Set(sources.map(frame => frame.texture));
        sources.forEach(frame => { frame.addRef(); retainedFrames.push(frame); });
        sourceTextures.forEach(texture => { texture.addRef(); retainedTextures.push(texture); });
        // The live board may pack its bean frames later in this same draw. Freeze both texture and UV rect.
        for (const map of [frames, slotFrames]) {
            for (const [color, source] of map) {
                const snapshot = new SpriteFrame();
                captureFrames.push(snapshot);
                snapshot.reset({ texture: source.texture, rect: source.rect, isRotate: source.rotated, isFlipUv: source.flipUVY,
                    originalSize: source.originalSize, offset: source.offset });
                snapshot.packable = false;
                map.set(color, snapshot);
            }
        }
        texture.reset({ width: side, height: side });
        camera.targetTexture = texture;
        const columns = maxCol - minCol + 1, rows = maxRow - minRow + 1;
        const cell = getBoardCellSize(Math.max(...grid.map(row => row.length)), grid.length);
        const board = new Node('CompletedBoard');
        rig.addChild(board);
        // Keep gameplay cell sizing and preview framing, without the gameplay outline layers.
        const scale = side * 0.94 / ((Math.max(columns, rows) + 0.5) * cell);
        board.setScale(scale, scale, 1);
        const makeLayer = (name: string) => {
            const node = new Node(name); board.addChild(node);
            node.addComponent(UITransform).setContentSize(columns * cell, rows * cell);
            return node;
        };
        const slots = makeLayer('BoardSlots');
        const beans = makeLayer('CompletedBeans');
        const slotCells: BoardSlotBatchCell[] = [], beanCells: BoardSlotBatchCell[] = [];
        const makeCell = (r: number, c: number, size: number, spriteFrame: SpriteFrame): BoardSlotBatchCell => ({
            row: r, col: c, size, spriteFrame,
            x: (c - minCol - (columns - 1) / 2) * cell,
            y: ((rows - 1) / 2 - r + minRow) * cell,
        });
        const renderCells = (parent: Node, cells: BoardSlotBatchCell[]) => {
            // Ordinary Sprites can repack shared SpriteFrames, invalidating the live board's cached UVs.
            // Reuse the board assembler: no dynamic-atlas mutation and bounded batches, even for large levels.
            const groups = new Map<unknown, BoardSlotBatchCell[]>();
            for (const item of cells) {
                const key = item.spriteFrame.texture;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(item);
            }
            for (const group of groups.values()) {
                for (let offset = 0; offset < group.length; offset += BOARD_SLOT_BATCH_MAX_CELLS) {
                    const node = new Node('Cells'); parent.addChild(node);
                    node.addComponent(UITransform).setContentSize(columns * cell, rows * cell);
                    const batch = node.addComponent(BoardSlotBatchRenderer);
                    batch.configure(group.slice(offset, offset + BOARD_SLOT_BATCH_MAX_CELLS));
                    if (parent === slots) {
                        // Preview only: fill each slot with its outer background color, without the recessed shadow.
                        // Keep sampling inside the frame to avoid atlas-edge bleed; leave bean UVs and live frames intact.
                        for (const cell of batch.getPreparedCells()) {
                            const u = cell.uv[0] * 0.98 + cell.uv[6] * 0.02;
                            const v = cell.uv[1] * 0.98 + cell.uv[7] * 0.02;
                            cell.uv = [u, v, u, v, u, v, u, v];
                        }
                        batch.markForUpdateRenderData();
                    }
                }
            }
        };
        grid.forEach((row, r) => row.forEach((color, c) => {
            if (!color) return;
            slotCells.push(makeCell(r, c, cell, slotFrames.get(color)!));
            beanCells.push(makeCell(r, c, getBoardBeanSize(cell), frames.get(color)!));
        }));
        renderCells(slots, slotCells);
        renderCells(beans, beanCells);
        const setCaptureLayer = (node: Node) => {
            node.layer = PREVIEW_LAYER;
            node.children.forEach(setCaptureLayer);
        };
        setCaptureLayer(board);
        await new Promise<void>((resolve, reject) => {
            const done = () => { clearTimeout(timer); resolve(); };
            const timer = setTimeout(() => {
                director.off(Director.EVENT_AFTER_DRAW, done);
                reject(new Error('缩略图渲染超时'));
            }, 5000);
            director.once(Director.EVENT_AFTER_DRAW, done);
        });
        if (!rig.isValid || !texture.isValid) throw new Error('生成期间场景已关闭');
        const frame = new SpriteFrame();
        resultFrame = frame;
        frame.texture = texture;
        frame.packable = false;
        frame.flipUVY = false;
        success = true;
        return { frame, texture, refs: 0, used: Date.now(), bytes: side * side * 4 };
    } finally {
        if (camera?.isValid) { camera.enabled = false; camera.targetTexture = null; }
        if (rig.isValid) { rig.active = false; rig.destroy(); }
        screenCameras.forEach(item => { if (item.isValid) item.visibility |= PREVIEW_LAYER; });
        retainedFrames.forEach(frame => frame.decRef());
        captureFrames.forEach(frame => { if (frame.isValid) frame.destroy(); });
        retainedTextures.forEach(texture => texture.decRef());
        if (!success) {
            if (resultFrame?.isValid) resultFrame.destroy();
            if (texture?.isValid) texture.destroy();
        }
    }
}

async function acquire(grid: number[][], side: number, skin: number, runtime: Runtime, wanted: () => boolean): Promise<Entry> {
    // The full grid avoids hash collisions and distinguishes alternate content for the same level id.
    const key = `${skin}|${side}|${JSON.stringify(grid)}`;
    let entry = entries.get(key);
    if (!entry) {
        let job = pending.get(key);
        if (!job) {
            const consumers = new Set<() => boolean>();
            const task = queue.then(() => generate(grid, side, skin, runtime, () => Array.from(consumers).some(check => check())));
            job = { task, consumers };
            pending.set(key, job);
            queue = task.then(() => undefined, () => undefined);
            task.then(value => { entries.set(key, value); pending.delete(key); }, () => pending.delete(key));
        }
        job.consumers.add(wanted);
        try { entry = await job.task; } finally { job.consumers.delete(wanted); }
    }
    entry.refs++;
    entry.used = Date.now();
    prune();
    return entry;
}

@_decorator.ccclass('CompletedPatternPreview')
export class CompletedPatternPreview extends Component {
    private entry: Entry | null = null;
    private token = 0;
    private runtime: Runtime | null = null;
    private grid: number[][] = [];
    private options: PixelPosterPreviewOptions | null = null;
    private skin = -1;
    private onReady?: (success: boolean) => void;
    private checkSkin = () => {
        if (this.runtime && this.runtime.getEquippedBeanSkinId() !== this.skin) void this.refresh();
    };

    bind(grid: number[][], options: PixelPosterPreviewOptions, runtime: Runtime, onReady?: (success: boolean) => void): void {
        this.onReady = onReady;
        this.grid = grid.map(row => row.slice());
        this.options = options;
        this.runtime = runtime;
        if (this.enabledInHierarchy) void this.refresh();
    }
    onEnable(): void {
        this.schedule(this.checkSkin, 0.5);
        if (this.runtime) void this.refresh();
    }
    onDisable(): void { this.unschedule(this.checkSkin); this.release(); }
    onDestroy(): void { this.release(); }
    release(): void {
        this.token++;
        const sprite = this.node.getComponent(Sprite);
        if (sprite) sprite.spriteFrame = null;
        if (this.entry) {
            this.entry.refs--;
            this.entry.used = Date.now();
            this.entry = null;
            prune();
        }
    }
    private async refresh(): Promise<void> {
        this.release();
        const token = this.token, runtime = this.runtime!, options = this.options!;
        this.skin = runtime.getEquippedBeanSkinId();
        let statusNode = this.node.getChildByName('Status');
        if (!statusNode) {
            statusNode = new Node('Status'); statusNode.layer = this.node.layer;
            this.node.addChild(statusNode); statusNode.addComponent(UITransform);
        }
        const status = statusNode.getComponent(Label) || statusNode.addComponent(Label);
        status.fontSize = 24; status.lineHeight = 32;
        status.color = new Color('#6655A7');
        status.isBold = true;
        status.string = '图案加载中…'; status.enabled = true;
        try {
            const side = Math.max(options.maxW, options.maxH) > 256 ? 512 : 256;
            const entry = await acquire(this.grid, side, this.skin, runtime,
                () => this.isValid && this.enabledInHierarchy && token === this.token);
            if (!this.isValid || !this.enabledInHierarchy || token !== this.token) {
                entry.refs--; entry.used = Date.now(); prune(); return;
            }
            this.entry = entry;
            status.enabled = false;
            const sprite = this.node.getComponent(Sprite) || this.node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.grayscale = !!options.grayscale;
            sprite.spriteFrame = entry.frame;
            const size = Math.max(1, Math.min(options.maxW, options.maxH) - 2 * (options.padding ?? 8));
            this.node.getComponent(UITransform)!.setContentSize(size, size);
            const onReady = this.onReady; this.onReady = undefined;
            onReady?.(true);
        } catch (error) {
            if (!this.isValid || token !== this.token) return;
            status.string = '图案加载失败';
            console.error('[completed-pattern-preview]', error);
            const onReady = this.onReady; this.onReady = undefined;
            onReady?.(false);
        }
    }
}

export function renderCompletedPatternPreview(parent: Node, grid: number[][], options: PixelPosterPreviewOptions, runtime: Runtime, onReady?: (success: boolean) => void): Node | null {
    if (!parent.isValid) return null;
    const name = options.name || 'PixelPosterPreview';
    let node = parent.getChildByName(name);
    if (node && !node.getComponent(CompletedPatternPreview)) { node.destroy(); node = null; }
    if (!node) { node = new Node(name); parent.addChild(node); }
    node.layer = parent.layer;
    node.active = true;
    node.setPosition(options.offsetX || 0, options.offsetY || 0);
    (node.getComponent(UITransform) || node.addComponent(UITransform)).setContentSize(options.maxW, options.maxH);
    (node.getComponent(CompletedPatternPreview) || node.addComponent(CompletedPatternPreview)).bind(grid, options, runtime, onReady);
    return node;
}

export function releaseCompletedPatternPreviewTree(root: Node | null): void {
    root?.getComponentsInChildren(CompletedPatternPreview).forEach(view => view.release());
}
