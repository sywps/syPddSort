import { AdConfig } from '../Platform/AdConfig';
import { AudioMgr } from './AudioMgr';
import { Game, director, game, sys } from 'cc';

const IDLE_FPS = 45;
const ACTIVE_FPS = 60;
const BACKGROUND_FPS = 15;
const ACTIVE_HOLD_MS = 2500;
const RENDER_SCALE = 0.78;

type FrameRateRuntime = {
    setPreferredFramesPerSecond?: (fps: number) => void;
};

export class PerformanceMgr {
    private static _inst: PerformanceMgr | null = null;

    static get inst(): PerformanceMgr {
        if (!PerformanceMgr._inst) {
            PerformanceMgr._inst = new PerformanceMgr();
        }
        return PerformanceMgr._inst;
    }

    private _inited = false;
    private _hidden = false;
    private _renderScaleApplied = false;
    private _currentFps = 0;
    private _activeFpsTimer: ReturnType<typeof setTimeout> | null = null;

    private constructor() {}

    init(): void {
        if (this._inited) {
            this.markUserActivity();
            return;
        }
        if (!this.shouldManageRuntimePerformance()) {
            this._inited = true;
            return;
        }
        this._inited = true;
        this.applyFrameRate(IDLE_FPS);
        this.bindLifecycleEvents();
        this.applyRenderScale();
    }

    markUserActivity(holdMs: number = ACTIVE_HOLD_MS): void {
        if (this._hidden) {
            return;
        }
        this.applyFrameRate(ACTIVE_FPS);
        this.scheduleIdleFrameRate(holdMs);
    }

    applyRenderScale(): void {
        const pipeline = (director.root as any)?.pipeline;
        if (pipeline) {
            pipeline.shadingScale = RENDER_SCALE;
        }
        this._renderScaleApplied = true;
    }

    private bindLifecycleEvents(): void {
        game.on(Game.EVENT_HIDE, this.handleHide, this);
        game.on(Game.EVENT_SHOW, this.handleShow, this);
    }

    private handleHide(): void {
        this._hidden = true;
        this.clearActiveFrameRateTimer();
        AudioMgr.inst.suspendForBackground();
        this.applyFrameRate(BACKGROUND_FPS);
        if (!game.isPaused()) {
            game.pause();
        }
    }

    private handleShow(): void {
        if (game.isPaused()) {
            game.resume();
        }
        this._hidden = false;
        AudioMgr.inst.resumeFromBackground();
        AdConfig.notifyGameResumed();
        if (this._renderScaleApplied) {
            this.applyRenderScale();
        }
        this.applyFrameRate(IDLE_FPS);
    }

    private scheduleIdleFrameRate(holdMs: number): void {
        this.clearActiveFrameRateTimer();
        this._activeFpsTimer = setTimeout(() => {
            this._activeFpsTimer = null;
            if (!this._hidden) {
                this.applyFrameRate(IDLE_FPS);
            }
        }, Math.max(0, holdMs));
    }

    private clearActiveFrameRateTimer(): void {
        if (!this._activeFpsTimer) return;
        clearTimeout(this._activeFpsTimer);
        this._activeFpsTimer = null;
    }

    private shouldManageRuntimePerformance(): boolean {
        if (sys.isNative) {
            return true;
        }
        const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
        const windowScope: any = typeof window !== 'undefined' ? window : null;
        const wxRuntime = globalScope?.__rawWx || windowScope?.wx;
        const ttRuntime = windowScope?.tt || globalScope?.tt;
        return !!wxRuntime?.getSystemInfoSync || !!ttRuntime?.getSystemInfoSync;
    }

    private applyFrameRate(fps: number): void {
        if (this._currentFps === fps) {
            return;
        }
        game.setFrameRate(fps);
        const runtime = this.getFrameRateRuntime();
        if (runtime && typeof runtime.setPreferredFramesPerSecond === 'function') {
            try {
                runtime.setPreferredFramesPerSecond(fps);
            } catch (error) {
                console.warn('[Performance] setPreferredFramesPerSecond failed:', error);
            }
        }
        this._currentFps = fps;
    }

    private getFrameRateRuntime(): FrameRateRuntime | null {
        const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
        const windowScope: any = typeof window !== 'undefined' ? window : null;
        return globalScope?.__rawWx
            || windowScope?.wx
            || windowScope?.tt
            || globalScope?.tt
            || null;
    }
}
