import { getDouyinMiniGameRuntime, getMiniGameBuildMode } from '../../Core/MiniGamePlatform';

// Official native UI and score APIs:
// https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/open-capacity/game-rank/getImRankList
const REQUEST_TIMEOUT_MS = 10000;

export class DouyinLeaderboardService {
    static readonly inst = new DouyinLeaderboardService();
    private tail: Promise<void> = Promise.resolve();
    private opening: Promise<void> | null = null;
    private submitted: Record<string, number> = {};

    private call(tt: any, method: 'login' | 'setImRankData' | 'getImRankList', options: Record<string, unknown> = {}): Promise<void> {
        return new Promise((resolve, reject) => {
            if (typeof tt?.[method] !== 'function') {
                reject(new Error(`[DouyinRank] ${method} unavailable`));
                return;
            }
            let settled = false;
            const finish = (error?: Error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (error) reject(error); else resolve();
            };
            const timer = setTimeout(() => finish(new Error(`[DouyinRank] ${method} timed out`)), REQUEST_TIMEOUT_MS);
            try {
                tt[method]({
                    ...options,
                    success: () => finish(),
                    fail: (error: any) => finish(new Error(`[DouyinRank] ${method}: ${error?.errMsg || 'failed'}`)),
                });
            } catch (error) {
                finish(new Error(`[DouyinRank] ${method}: ${String(error)}`));
            }
        });
    }

    private enqueue(task: () => Promise<void>): Promise<void> {
        const result = this.tail.then(task);
        // Keep subsequent requests usable; the original result still rejects to its caller.
        this.tail = result.catch(() => {});
        return result;
    }

    private clearedCount(progressLevel: number): number {
        if (!Number.isInteger(progressLevel) || progressLevel < 1 || progressLevel > 2147483647) {
            throw new Error('[DouyinRank] invalid mainline progress');
        }
        return progressLevel - 1;
    }

    private zoneId(): string {
        return getMiniGameBuildMode() === 'release' ? 'default' : 'test';
    }

    private async submit(tt: any, count: number, zoneId: string): Promise<void> {
        // Starter saves must not overwrite an existing platform record; equal/older
        // local callbacks must not lower a score or change the platform tie-break time.
        if (count === 0 || count <= (this.submitted[zoneId] || 0)) return;
        await this.call(tt, 'setImRankData', { dataType: 0, value: String(count), zoneId });
        this.submitted[zoneId] = count;
    }

    submitProgress(progressLevel: number): Promise<void> {
        return this.enqueue(async () => {
            const count = this.clearedCount(progressLevel);
            if (count === 0) return;
            const tt = getDouyinMiniGameRuntime();
            const zoneId = this.zoneId();
            if (count <= (this.submitted[zoneId] || 0)) return;
            await this.call(tt, 'login');
            await this.submit(tt, count, zoneId);
        });
    }

    open(progressLevel: number): Promise<void> {
        if (this.opening) return this.opening;
        this.opening = this.enqueue(async () => {
            const count = this.clearedCount(progressLevel);
            const tt = getDouyinMiniGameRuntime();
            if (typeof tt?.getImRankList !== 'function') throw new Error('[DouyinRank] getImRankList unavailable');
            const zoneId = this.zoneId();
            // Native ranking requires tt.login, independently of the vendor/cloud login.
            await this.call(tt, 'login');
            await this.submit(tt, count, zoneId);
            await this.call(tt, 'getImRankList', {
                dataType: 0, rankType: 'all', relationType: 'default',
                rankTitle: '主线通关榜', suffix: '关', zoneId,
            });
        }).then(
            () => { this.opening = null; },
            error => { this.opening = null; throw error; },
        );
        return this.opening;
    }
}
