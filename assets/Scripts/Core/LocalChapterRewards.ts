import { sys } from 'cc';
import { ChapterReward, eligibleChapterRewards } from './ChapterRewardPolicy';

const KEY = 'pdd.chapter.rewards.local.v1';
const fields = ['gold', 'brushCount', 'magnetCount'] as const;
const recovering = new WeakSet<object>();
type Ledger = { version: 1; receipts: ChapterReward[]; pendingTotals?: Record<string, number>; pendingFromCloud?: boolean };

export function validateChapterReceipts(value: unknown): ChapterReward[] {
    if (!Array.isArray(value)) throw Error('章节奖励记录格式错误');
    const seen = new Set<string>();
    for (const row of value) {
        if (!row || !Number.isSafeInteger(row.chapter) || row.chapter < 1 || row.chapter > 111112 ||
            ![4, 9].includes(row.milestone) || row.key !== `v1:${row.chapter}:${row.milestone}` || seen.has(row.key)) throw Error('章节奖励记录编号错误');
        for (const field of [...fields, 'avatarId', 'frameId', 'beanSkinId', 'backgroundSkinId']) {
            if (!Number.isSafeInteger(row[field]) || row[field] < 0) throw Error('章节奖励记录数值错误');
        }
        seen.add(row.key);
    }
    return JSON.parse(JSON.stringify(value));
}
function read(): Ledger {
    const raw = sys.localStorage.getItem(KEY);
    if (!raw) return { version: 1, receipts: [] };
    const saved = JSON.parse(raw);
    if (saved.version !== 1) throw Error('章节奖励存档版本错误');
    validateChapterReceipts(saved.receipts);
    if (saved.pendingTotals !== undefined && (!saved.pendingTotals || Array.isArray(saved.pendingTotals) || typeof saved.pendingTotals !== 'object' || Object.values(saved.pendingTotals).some(v => !Number.isSafeInteger(v) || Number(v) < 0))) throw Error('章节奖励恢复记录错误');
    return saved;
}
const write = (saved: Ledger) => sys.localStorage.setItem(KEY, JSON.stringify(saved));

// Add local, not-yet-acknowledged receipts to a returned snapshot before applying it.
// The same key on two devices is one grant, regardless of upload/reply ordering.
export function rebaseChapterSnapshot(state: any, local: ChapterReward[]): any {
    if (!state || state.chapterRewardProtocol !== 1) throw Error('章节奖励同步服务版本不匹配');
    const remote = validateChapterReceipts(state.chapterRewardReceipts);
    const known = new Map(remote.map(row => [row.key, row]));
    const next = { ...state, wechatGiftTotals: { ...state.wechatGiftTotals }, chapterRewardReceipts: remote };
    for (const receipt of local) {
        const previous = known.get(receipt.key);
        if (previous) {
            if (Object.keys(receipt).some(key => receipt[key] !== previous[key])) throw Error('章节奖励记录冲突');
            continue;
        }
        for (const field of fields) {
            if (next[field] !== undefined) next[field] += receipt[field];
            next.wechatGiftTotals[field] = (next.wechatGiftTotals[field] || 0) + receipt[field];
        }
        next.chapterRewardReceipts.push(receipt);
    }
    return next;
}

export const LocalChapterRewards = {
    receipts: (): ChapterReward[] => read().receipts,
    recover(runtime: any): void {
        if (recovering.has(runtime)) return;
        recovering.add(runtime);
        try {
            const saved = read();
            if (saved.pendingTotals) {
                runtime.applyWechatGiftState({ wechatGiftProtocol: 1, wechatGiftTotals: saved.pendingTotals }, false, !saved.pendingFromCloud);
                if (!saved.pendingFromCloud) runtime.setLocalUserStateUpdatedAt?.(Date.now());
            }
            for (const row of saved.receipts) {
                if (row.beanSkinId && runtime.grantBeanSkin(row.beanSkinId, false) === false) throw Error('章节豆豆皮肤写入失败');
                if (row.backgroundSkinId && runtime.grantBackgroundSkin(row.backgroundSkinId, false) === false) throw Error('章节背景皮肤写入失败');
            }
            if (saved.pendingTotals) { delete saved.pendingTotals; delete saved.pendingFromCloud; write(saved); }
        } finally { recovering.delete(runtime); }
    },
    claim(runtime: any, cleared: number): { granted: ChapterReward[]; claimed: string[] } {
        this.recover(runtime);
        const saved = read();
        const granted = eligibleChapterRewards(cleared, saved.receipts.map(row => row.key));
        if (granted.length) {
            const totals = { ...runtime.readWechatGiftTotals() };
            for (const row of granted) for (const field of fields) totals[field] = (totals[field] || 0) + row[field];
            saved.receipts.push(...granted); saved.pendingTotals = totals;
            write(saved); // Receipt and pending grant commit together, before any asset write.
            this.recover(runtime);
        }
        return { granted, claimed: saved.receipts.map(row => row.key) };
    },
    mergeCloud(runtime: any, state: any): any {
        this.recover(runtime);
        const saved = read();
        const next = rebaseChapterSnapshot(state, saved.receipts);
        // Store remote receipts only after their grants are recoverable locally.
        const totals = { ...runtime.readWechatGiftTotals() };
        for (const field of ['gold', 'brushCount', 'magnetCount', 'freezeCount']) {
            const count = Number(next.wechatGiftTotals[field] || 0);
            totals[field] = Math.max(totals[field] || 0, count);
            if (next[field] !== undefined) next[field] += totals[field] - count;
        }
        next.wechatGiftTotals = totals;
        write({ version: 1, receipts: next.chapterRewardReceipts, pendingTotals: totals, pendingFromCloud: true });
        this.recover(runtime);
        return next;
    },
};
