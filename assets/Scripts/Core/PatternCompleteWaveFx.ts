import { _decorator, Animation, AnimationState, Component, instantiate, Node, Prefab, Sprite, UITransform } from 'cc';

const { ccclass } = _decorator;
export const PATTERN_WAVE_DIAGONAL_DELAY = 0.03;
export const PATTERN_WAVE_CLIP_DURATION = 0.4;
const RETURN_DELAY = 1;

export type PatternWaveCell = { row: number; col: number; x: number; y: number; size: number };
type WaveNode = { node: Node; state: AnimationState; sprite: Sprite; start: number; frame: number };

export function getPatternWaveDuration(cells: PatternWaveCell[]): number {
    return cells.reduce((last, cell) => Math.max(last, (cell.row + cell.col) * PATTERN_WAVE_DIAGONAL_DELAY), 0)
        + PATTERN_WAVE_CLIP_DURATION;
}

/** One clock for the whole wave. The prefab's editable AnimationClip remains the source of frames. */
@ccclass('PatternCompleteWaveFx')
export class PatternCompleteWaveFx extends Component {
    private prefab: Prefab | null = null;
    private pending: PatternWaveCell[] = [];
    private next = 0;
    private elapsed = 0;
    private duration = 0;
    private activeFx: WaveNode[] = [];
    private pool: WaveNode[] = [];
    private finished: (() => void) | null = null;
    private running = false;

    play(prefab: Prefab, cells: PatternWaveCell[], onDone?: () => void): void {
        this.stop();
        if (!cells.length) throw new Error('[pattern-wave-fx] no completed pattern cells');
        this.prefab = prefab;
        this.pending = [...cells].sort((a, b) => (a.row + a.col) - (b.row + b.col));
        this.duration = getPatternWaveDuration(cells);
        this.finished = onDone || null;
        this.running = true;
        this.update(0);
    }

    stop(): void {
        this.running = false;
        this.finished = null;
        this.pending = [];
        this.next = 0;
        this.elapsed = 0;
        for (const item of this.activeFx) {
            item.node.active = false;
            this.pool.push(item);
        }
        this.activeFx.length = 0;
    }

    protected onDisable(): void { this.stop(); }

    private acquire(cell: PatternWaveCell): WaveNode {
        let item = this.pool.pop();
        if (!item) {
            const node = instantiate(this.prefab!);
            this.node.addChild(node);
            const animation = node.getComponent(Animation);
            const clip = animation?.defaultClip;
            const sprite = node.getComponent(Sprite);
            if (!clip || !animation || !sprite || Math.abs(clip.duration - PATTERN_WAVE_CLIP_DURATION) > 0.0001) {
                node.destroy();
                throw new Error('[pattern-wave-fx] invalid PatternCompleteBean prefab/clip');
            }
            const state = animation.getState(clip.name) || animation.createState(clip);
            state.initialize(node);
            item = { node, state, sprite, start: 0, frame: -1 };
        }
        item.node.active = true;
        item.node.layer = this.node.layer;
        item.node.setPosition(cell.x, cell.y, 0);
        item.node.setScale(1, 1, 1);
        item.node.getComponent(UITransform)!.setContentSize(cell.size, cell.size);
        item.node.setSiblingIndex(this.node.children.length - 1);
        item.start = (cell.row + cell.col) * PATTERN_WAVE_DIAGONAL_DELAY;
        item.frame = -1;
        item.sprite.spriteFrame = null;
        return item;
    }

    protected update(dt: number): void {
        if (!this.running) return;
        this.elapsed += dt;
        let kept = 0;
        for (const item of this.activeFx) {
            if (this.elapsed - item.start >= RETURN_DELAY) {
                item.node.active = false;
                this.pool.push(item);
            } else {
                this.activeFx[kept++] = item;
            }
        }
        this.activeFx.length = kept;
        while (this.next < this.pending.length) {
            const cell = this.pending[this.next];
            if ((cell.row + cell.col) * PATTERN_WAVE_DIAGONAL_DELAY > this.elapsed + 1e-8) break;
            this.next++;
            // A suspended tab may skip an entire finished effect; never replay old waves on resume.
            if (this.elapsed - (cell.row + cell.col) * PATTERN_WAVE_DIAGONAL_DELAY >= RETURN_DELAY) continue;
            this.activeFx.push(this.acquire(cell));
        }
        for (const item of this.activeFx) {
            const age = Math.max(0, this.elapsed - item.start);
            const frame = Math.min(24, Math.floor(age * 60 + 1e-7));
            if (frame !== item.frame) {
                item.frame = frame;
                item.state.time = Math.min(PATTERN_WAVE_CLIP_DURATION, frame / 60);
                item.state.sample();
            }
            // The clip ends at .4s; keep its node pooled only after the reference's 1s lifetime.
            if (age >= PATTERN_WAVE_CLIP_DURATION) item.node.active = false;
        }
        if (this.elapsed + 1e-8 >= this.duration && this.finished) {
            const done = this.finished;
            this.finished = null;
            done();
        }
        if (this.next >= this.pending.length && !this.activeFx.length) this.running = false;
    }
}
