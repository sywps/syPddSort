import { ImageAsset, Sprite, SpriteFrame, Texture2D } from 'cc';
import { isMiniGameRuntime } from './MiniGamePlatform';
import type { LevelData } from './LevelConfig';

type PreviewConfig = {
    schemaVersion: number;
    source: string;
    sessionId: string;
    configHash: string;
    expires: number;
    experimentId: string;
    variant: 'A' | 'B';
    level: LevelData;
    background: { id: string; width: number; height: number } | null;
};

export function isWorkbenchPreviewRequested(): boolean {
    return typeof window !== 'undefined' && /(?:^#|&)pddWorkbench(?:Origin|Token)=/.test(window.location.hash || '');
}

export class WorkbenchPreviewService {
    static readonly inst = new WorkbenchPreviewService();
    private config: PreviewConfig | null = null;
    private frame: SpriteFrame | null = null;
    private framePromise: Promise<SpriteFrame> | null = null;
    private eventQueue: Promise<void> = Promise.resolve();
    private failureReported = false;

    private settings(): { origin: string; token: string } {
        if (!isWorkbenchPreviewRequested() || isMiniGameRuntime() || ['localhost', '127.0.0.1', '[::1]'].indexOf(window.location.hostname) < 0) {
            throw new Error('[试玩] 仅支持本机浏览器中的授权试玩入口');
        }
        const params = new URLSearchParams(window.location.hash.slice(1));
        const origin = params.get('pddWorkbenchOrigin') || '', token = params.get('pddWorkbenchToken') || '';
        const url = new URL(origin);
        if (url.origin !== origin || url.username || url.password || !/^[a-f0-9]{64}$/.test(token)
            || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].indexOf(url.hostname) >= 0))) {
            throw new Error('[试玩] 入口格式无效，请从工作台重新生成');
        }
        return { origin, token };
    }

    private async request(path: string, body: Record<string, unknown>): Promise<any> {
        const { origin, token } = this.settings();
        const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(`${origin}/preview/${path}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body), credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(`[试玩] ${payload.error || '服务请求失败'}`);
            return payload;
        } catch (error) {
            if (controller.signal.aborted) throw new Error('[试玩] 工作台响应超时，停止加载');
            throw error;
        } finally { clearTimeout(timeout); }
    }

    async loadLevel(levelId: number, prefix: string): Promise<LevelData> {
        if (prefix !== 'level_') throw new Error('[试玩] 此入口仅允许目标主线关卡');
        const config = await this.request('config', {}) as PreviewConfig;
        if (config.schemaVersion !== 1 || config.source !== 'client-preview' || ['A', 'B'].indexOf(config.variant) < 0
            || !/^[a-f0-9]{64}$/.test(config.configHash) || !config.sessionId || config.level?.levelId !== levelId
            || !Array.isArray(config.level.correctColorArr) || !Array.isArray(config.level.initRandomColorArr)
            || config.expires <= Date.now()) throw new Error('[试玩] 配置、目标关卡或有效期不匹配');
        if (this.config && (this.config.sessionId !== config.sessionId || this.config.configHash !== config.configHash)) {
            throw new Error('[试玩] 本会话不允许切换版本或分组，请打开新的试玩入口');
        }
        this.config = config;
        await this.event('loaded');
        return JSON.parse(JSON.stringify(config.level)) as LevelData;
    }

    async prepare(runtime: any, levelId: number): Promise<void> {
        this.assertTarget(levelId);
        if (!this.config!.background) return;
        if (runtime.getEquippedBackgroundSkinId() !== 1000) throw new Error('[试玩] 当前已选择个人背景。请使用默认背景后重新试玩，实验不会覆盖个人装备');
        if (!this.framePromise) this.framePromise = this.loadBackground();
        this.frame = await this.framePromise;
    }

    private async loadBackground(): Promise<SpriteFrame> {
        const expected = this.config!.background!;
        const payload = await this.request('image', {});
        if (payload.id !== expected.id || typeof payload.base64 !== 'string') throw new Error('[试玩] 背景版本不匹配');
        const bytes = Uint8Array.from(atob(payload.base64), c => c.charCodeAt(0));
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => ('0' + b.toString(16)).slice(-2)).join('');
        if (hash !== expected.id || bytes[0] !== 137 || bytes[1] !== 80) throw new Error('[试玩] 背景内容校验失败');
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        try {
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                const timer = setTimeout(() => { img.onload = null; img.onerror = null; reject(new Error('[试玩] 背景解码超时')); }, 8000);
                img.onload = () => { clearTimeout(timer); resolve(img); };
                img.onerror = () => { clearTimeout(timer); reject(new Error('[试玩] 背景解码失败')); };
                img.src = blobUrl;
            });
            if (image.naturalWidth !== expected.width || image.naturalHeight !== expected.height) throw new Error('[试玩] 背景尺寸不匹配');
            const texture = new Texture2D(); texture.image = new ImageAsset(image);
            const frame = new SpriteFrame(); frame.texture = texture; frame.name = `workbench-preview-${expected.id}`;
            return frame;
        } finally { URL.revokeObjectURL(blobUrl); }
    }

    getBackgroundFrame(): SpriteFrame | null { return this.frame; }
    hasBackground(): boolean { return !!this.config?.background; }
    private assertTarget(levelId: number): void {
        if (!this.config || this.config.level.levelId !== levelId || this.config.expires <= Date.now()) throw new Error('[试玩] 未取得此关卡的有效配置');
    }

    async ready(runtime: any, levelId: number): Promise<void> {
        this.assertTarget(levelId);
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (!runtime.isValid || runtime.isGameEnd || runtime.getActivePhysicalLevelId() !== levelId) throw new Error('[试玩] 游戏已退出目标关卡，未记录曝光');
        if (this.hasBackground()) {
            const node = runtime.requireGameplayBackgroundShell();
            if (node.getComponent(Sprite)?.spriteFrame !== this.frame) throw new Error('[试玩] 候选背景未实际应用，不能记录曝光');
        }
        await this.event('exposure');
    }

    async complete(levelId: number): Promise<void> { this.assertTarget(levelId); await this.event('complete'); }

    private event(type: string, reason: string = ''): Promise<void> {
        if (!this.config) return Promise.reject(new Error('[试玩] 配置未加载，无法归因事件'));
        const config = this.config;
        const next = this.eventQueue.then(async () => {
            await this.request('event', { type, reason, configHash: config.configHash, eventId: `${config.sessionId}:${type}` });
        });
        this.eventQueue = next;
        return next;
    }

    fail(runtime: any, error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        runtime.isGameEnd = true;
        runtime.unschedule?.(runtime.tickTimer);
        runtime._stopGameplayEntryWithFatalError?.('workbench-preview', 'workbench_preview_failed', message);
        console.error('[试玩] 已停止：', message);
        this.reportFailure(message);
    }

    reportFailure(message: string): void {
        if (this.config && !this.failureReported) {
            this.failureReported = true;
            void this.request('event', { type: 'failure', reason: message.slice(0, 500), configHash: this.config.configHash,
                eventId: `${this.config.sessionId}:failure` }).catch(error => console.error('[试玩] 失败事件未送达：', error));
        }
    }
}
