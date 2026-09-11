import { JsonAsset, sys } from 'cc';
import { PlatformCloudMgr } from './PlatformCloudMgr';
import { getWeChatMiniGameRuntime, isMiniGameRuntime } from './MiniGamePlatform';
import { isLocalBrowserPreview } from './RemoteDataCdnClient';
import { applyLocalWeChatShareImage } from '../Platform/WeChatShareReturnService';
import { UserMgr } from './UserMgr';
import { PvpHumanReplay, type PvpRuleEvent } from './PvpHumanReplay';
import { pixelLevelHash } from './PvpBotReplay';
import { COOP_MAX_ELAPSED_MS, COOP_RULES_VERSION, coopHalfLevel,
    type CoopPost, type CoopRun, type CoopLevelEntry, type CoopOverview, type CoopPendingSave } from './CoopModeConfig';
import type { LevelData } from './LevelConfig';

export type CoopActive = { post: CoopPost; run: CoopRun; full: LevelData; half: LevelData;
    replay: PvpHumanReplay; events: PvpRuleEvent[]; pending: CoopPendingSave | null;
    elapsedMs: number; error: string; saving: Promise<void> | null; completed: boolean };

export class CoopServiceMgr {
    static readonly inst = new CoopServiceMgr();
    active: CoopActive | null = null;
    returnToLobby = false;
    localPlayer = 'A';
    isLocalSimulation(): boolean { return !isMiniGameRuntime() && isLocalBrowserPreview(); }
    switchLocalPlayer(): void {
        if (!this.isLocalSimulation() || this.active) throw new Error('请先退出当前拼图再切换模拟玩家');
        this.localPlayer = this.localPlayer === 'A' ? 'B' : this.localPlayer === 'B' ? 'C' : 'A';
    }
    localInvitation(): string { return this.isLocalSimulation() ? sys.localStorage.getItem('coop-local-invitation') || '' : ''; }
    private catalogCache: CoopLevelEntry[] | null = null;
    private readonly levels = new Map<number, LevelData>();

    async call<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
        if (this.isLocalSimulation()) {
            let response: Response;
            try {
                response = await fetch('http://127.0.0.1:7559/coop', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ player: this.localPlayer, event: { ...data, action, rulesVersion: COOP_RULES_VERSION } }) });
            } catch (_) { throw new Error('本地合作服务未连接，请先运行 npm run coop:local'); }
            const result = await response.json();
            if (!response.ok || !result?.ok) throw new Error(result?.errorMessage || '本地合作服务返回异常');
            return result as T;
        }
        if (PlatformCloudMgr.inst.getPlatform() !== 'wechat') throw new Error('合作模式需要微信云服务，请在微信中体验');
        if (!await PlatformCloudMgr.inst.init()) throw new Error('合作云服务不可用，请重试');
        const result = await PlatformCloudMgr.inst.callFunction<any>('coopService', {
            ...data, action, rulesVersion: COOP_RULES_VERSION, displayName: UserMgr.inst.getProfile().displayName || '像素玩家',
        });
        if (!result?.ok) throw new Error(result?.errorMessage || '合作服务返回异常');
        return result as T;
    }

    private loadAsset<T>(runtime: any, name: string): Promise<T> {
        return new Promise((resolve, reject) => runtime._withGameAssetsBundle((bundle: any) => {
            if (!bundle) { reject(new Error('合作图案资源包不可用')); return; }
            bundle.load(name, JsonAsset, (error: Error | null, asset: JsonAsset | null) => {
                if (error || !asset) reject(error || new Error('合作图案缺失'));
                else resolve(asset.json as T);
            });
        }));
    }

    async catalog(runtime: any): Promise<CoopLevelEntry[]> {
        if (!this.catalogCache) {
            const manifest = await this.loadAsset<{ levels: CoopLevelEntry[] }>(runtime, 'coop-manifest');
            if (!Array.isArray(manifest.levels) || manifest.levels.length !== 10) throw new Error('合作图案目录不完整');
            this.catalogCache = manifest.levels;
        }
        return this.catalogCache;
    }

    async fullLevel(runtime: any, id: number): Promise<LevelData> {
        if (!this.levels.has(id)) {
            const entry = (await this.catalog(runtime)).find(item => item.levelId === id);
            if (!entry) throw new Error('合作图案不存在');
            const level = await new Promise<LevelData>((resolve, reject) => {
                runtime._loadLevelDataFromConfiguredSource(id, 'coop_level_', (data: LevelData | null, _source: string, error?: Error) => {
                    if (error || !data) reject(error || new Error('合作关卡加载失败'));
                    else resolve(data);
                });
            });
            coopHalfLevel(level, 'creator');
            this.levels.set(id, level);
        }
        return this.levels.get(id)!;
    }

    async prepare(runtime: any, post: CoopPost, run: CoopRun): Promise<void> {
        if (run.status !== 'playing') throw new Error('你的部分已经完成');
        const full = await this.fullLevel(runtime, post.levelId);
        if (pixelLevelHash(full) !== post.levelHash) throw new Error('合作图案版本不一致，请更新资源');
        const half = coopHalfLevel(full, run.role);
        this.discardPending(run.id);
        const replay = new PvpHumanReplay(half, COOP_MAX_ELAPSED_MS, true);
        const events: PvpRuleEvent[] = [[0, 0, 1]];
        replay.apply(events[0]);
        this.active = { post, run, full, half, replay, events, pending: null, elapsedMs: 0,
            error: '', saving: null, completed: false };
    }

    discardPending(runId: string): void { sys.localStorage.removeItem(`coop-pending:${runId}`); }

    record(kind: number, args: number[]): void {
        const a = this.active;
        if (!a || a.completed || a.run.status === 'complete') return;
        a.events.push([Math.round(a.elapsedMs), kind, ...args]);
    }

    async flush(): Promise<void> {
        const a = this.active;
        if (!a || a.run.status === 'complete') return;
        if (!a.completed) throw new Error('只有完成后才能保存结果');
        if (a.saving) return a.saving;
        if (!a.events.length) return;
        a.pending ||= { requestId: `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`,
            version: a.run.version, events: a.events.slice() };
        a.saving = this.call<{ run: CoopRun; post: CoopPost }>('complete', { postId: a.post.id, ...a.pending }).then(result => {
            if (result.run.status !== 'complete') throw new Error('服务端未确认完成');
            a.events.splice(0, a.pending!.events.length);
            a.run = result.run; a.post = result.post; a.pending = null; a.error = '';
            if (a.run.status === 'complete') {
                if (a.events.some(event => event[1] !== 1 && event[1] !== 8)) throw new Error('完成后的操作记录异常');
                a.events = [];
            }
        }).catch(error => { a.error = error instanceof Error ? error.message : String(error); throw error; })
            .finally(() => { a.saving = null; });
        return a.saving;
    }

    async flushAll(): Promise<void> {
        await this.flush();
    }

    launchPostId(): string {
        const wx = getWeChatMiniGameRuntime();
        const id = String((wx?.getEnterOptionsSync?.() || wx?.getLaunchOptionsSync?.() || {}).query?.coopPost || '');
        return /^[a-f0-9]{24}$/.test(id) ? id : '';
    }

    share(post: CoopPost): void {
        if (!post.creatorDone) throw new Error('先拼完自己的半区再邀请');
        if (this.isLocalSimulation()) {
            sys.localStorage.setItem('coop-local-invitation', post.id);
            return;
        }
        const wx = getWeChatMiniGameRuntime();
        if (!wx?.shareAppMessage) throw new Error('当前环境不支持微信分享');
        wx.shareAppMessage(applyLocalWeChatShareImage({ title: '我拼好了一半，另一半交给你！', query: `coopPost=${post.id}` }));
    }

    overview(): Promise<{ overview: CoopOverview }> { return this.call('overview'); }
}
