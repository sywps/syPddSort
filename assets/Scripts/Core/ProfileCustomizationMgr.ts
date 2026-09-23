import { sys } from 'cc';
import { PlatformCloudMgr } from './PlatformCloudMgr';
import { PVP_ECONOMY_REVISION_KEY } from './UserStateSyncMgr';
import { PROFILE_ITEMS, RETIRED_PROFILE_ITEMS, profileItem, mainlineClearedCount } from './ProfileCustomizationConfig';
import { profileAssetUrl } from './ProfileResourceService';
import { STARTUP_LS_LEVEL } from './StartupLocalProgress';
import { getBrowserLevelPreview } from './BrowserLevelPreview';
import { isWorkbenchPreviewRequested } from './WorkbenchPreviewService';
import { isMiniGameRuntime } from './MiniGamePlatform';
import { eligibleChapterRewards, ChapterReward } from './ChapterRewardPolicy';
import { PreviewRewardSave } from './PreviewRewardSave';

export type CustomizationState = {
    version: 1; revision: number; ownedAvatarIds: number[]; ownedFrameIds: number[];
    equippedAvatarId: number; equippedFrameId: number; avatarSource: 'wechat' | 'catalog';
    customNickname: string; adWatchCounts: Record<string, number>; seenItemIds: number[];
};
const KEY = getBrowserLevelPreview().active ? 'pdd.preview.profile.customization.v1' : 'pdd.profile.customization.v1';
const PENDING = 'pdd.profile.customization.pending.v1';
const AD_PENDING = 'pdd.profile.customization.ad-pending.v1';
const SELECTION = 'pdd.profile.customization.selection.v1';
const OWNER = 'pdd.profile.customization.owner.v1';
const fresh = (): CustomizationState => ({ version: 1, revision: 0, ownedAvatarIds: [1001], ownedFrameIds: [2001], equippedAvatarId: 1001, equippedFrameId: 2001, avatarSource: 'wechat', customNickname: '', adWatchCounts: {}, seenItemIds: [1001, 2001] });
export class ProfileCustomizationMgr {
    static readonly inst = new ProfileCustomizationMgr();
    private state: CustomizationState = fresh();
    private listeners = new Set<() => void>();
    private busy = false;
    private recovery: Promise<void> | null = null;
    private browserAdRequests = new Map<string, number>();
    private browserSimulation(): boolean {
        // Creator's level preview uses the same local rewarded-ad simulation as browser play.
        if (!isMiniGameRuntime()) return true;
        if (getBrowserLevelPreview().active || isWorkbenchPreviewRequested()) throw Error('预览模式不能修改个人资料');
        return false;
    }
    private constructor() {
        const raw = sys.localStorage.getItem(KEY);
        if (raw) { try { const saved = JSON.parse(raw); this.validate(saved); this.state = saved; this.useActiveEquipment(); } catch (e) { console.error('[Profile] invalid local customization', e); } }
    }
    private refreshPreviewAvatars(): void {
        if (!getBrowserLevelPreview().active) return;
        for (const id of PreviewRewardSave.avatars()) if (!this.state.ownedAvatarIds.includes(id)) this.state.ownedAvatarIds.push(id);
        for (const id of PreviewRewardSave.frames()) if (!this.state.ownedFrameIds.includes(id)) this.state.ownedFrameIds.push(id);
    }
    get snapshot(): CustomizationState { this.refreshPreviewAvatars(); return JSON.parse(JSON.stringify(this.state)); }
    getMainlineClearedCount(): number { return mainlineClearedCount(Number(sys.localStorage.getItem(STARTUP_LS_LEVEL))); }
    subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    notifyIdentityChanged(): void { this.emit(); }
    private emit(): void { for (const fn of this.listeners) { try { fn(); } catch (e) { console.error('[Profile] view refresh failed', e); } } }
    private persist(): void { sys.localStorage.setItem(KEY, JSON.stringify(this.state)); this.emit(); }
    private validate(value: any): void {
        if (value?.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.ownedAvatarIds) || !Array.isArray(value.ownedFrameIds) || !Array.isArray(value.seenItemIds) || !value.adWatchCounts) throw Error('装扮存档格式不正确');
        const known = [...PROFILE_ITEMS, ...RETIRED_PROFILE_ITEMS];
        for (const id of value.ownedAvatarIds) if (known.find(row => row.id === id)?.kind !== 'avatar') throw Error('头像编号错误');
        for (const id of value.ownedFrameIds) if (known.find(row => row.id === id)?.kind !== 'frame') throw Error('头像框编号错误');
        if (!value.ownedAvatarIds.includes(value.equippedAvatarId) || !value.ownedFrameIds.includes(value.equippedFrameId)) throw Error('装备未拥有的装扮');
        if (!['wechat', 'catalog'].includes(value.avatarSource) || typeof value.customNickname !== 'string' || value.customNickname.length > 24) throw Error('资料格式不正确');
        for (const [id, count] of Object.entries(value.adWatchCounts)) {
            const row = known.find(item => item.id === Number(id));
            if (!row || row.unlock !== 'ad' || !Number.isSafeInteger(count) || Number(count) < 0) throw Error('广告进度格式不正确');
        }
    }
    private useActiveEquipment(): void {
        // Preserve retired ownership for later restoration, but never request its old art.
        if (!PROFILE_ITEMS.some(row => row.id === this.state.equippedAvatarId)) this.state.equippedAvatarId = 1001;
        if (!PROFILE_ITEMS.some(row => row.id === this.state.equippedFrameId)) this.state.equippedFrameId = 2001;
        if (!this.state.ownedAvatarIds.includes(1001)) this.state.ownedAvatarIds.push(1001);
        if (!this.state.ownedFrameIds.includes(2001)) this.state.ownedFrameIds.push(2001);
    }
    applyCloud(value: unknown): void {
        if (getBrowserLevelPreview().active || isWorkbenchPreviewRequested()) return;
        if (!value) return; // Old server/schema: opening or mutation still requires an explicit version handshake.
        // Legacy cloud documents omit empty ad counters; match the server's normalization.
        if (typeof value === 'object' && !Object.prototype.hasOwnProperty.call(value, 'adWatchCounts')) {
            value = { ...value, adWatchCounts: {} };
        }
        this.validate(value);
        const next = value as CustomizationState;
        if (next.revision < this.state.revision) return;
        const seen = new Set([...this.state.seenItemIds, ...next.seenItemIds]);
        this.state = JSON.parse(JSON.stringify(next)); this.state.seenItemIds = Array.from(seen);
        this.useActiveEquipment();
        this.refreshProgressUnlocks(); this.persist();
    }
    refreshProgressUnlocks(): void {
        if (getBrowserLevelPreview().active || isWorkbenchPreviewRequested()) return;
        // In mini games, unlocks are granted by the server using saved progress and the packaged catalog.
        if (isMiniGameRuntime()) return;
        const cleared = this.getMainlineClearedCount(); let changed = false;
        for (const row of PROFILE_ITEMS) {
            const owned = row.kind === 'avatar' ? this.state.ownedAvatarIds : this.state.ownedFrameIds;
            if ((row.unlock === 'default' || (row.unlock === 'mainline' && cleared >= row.value)) && !owned.includes(row.id)) { owned.push(row.id); changed = true; }
        }
        if (changed) this.persist();
    }
    owned(id: number): boolean { this.refreshPreviewAvatars(); return (profileItem(id).kind === 'avatar' ? this.state.ownedAvatarIds : this.state.ownedFrameIds).includes(id); }
    isNew(id: number): boolean { return this.owned(id) && !this.state.seenItemIds.includes(id); }
    get hasNewItems(): boolean { return PROFILE_ITEMS.some(row => this.isNew(row.id)); }
    markViewed(id: number): void { if (this.isNew(id)) { this.state.seenItemIds.push(id); this.persist(); } }
    display<T extends { displayName: string; avatarUrl: string }>(identity: T): T & { avatarId: number; frameId: number; frameUrl: string; avatarSource: string } {
        const useCatalog = this.state.avatarSource === 'catalog' || !identity.avatarUrl;
        return { ...identity, displayName: identity.displayName,
            avatarUrl: useCatalog ? profileAssetUrl(this.state.equippedAvatarId) : identity.avatarUrl,
            avatarId: useCatalog ? this.state.equippedAvatarId : 0, frameId: this.state.equippedFrameId,
            frameUrl: profileAssetUrl(this.state.equippedFrameId), avatarSource: useCatalog ? 'catalog' : 'wechat' };
    }
    private requestId(): string { return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`; }
    private async call(runtime: any, action: string, data: any = {}): Promise<any> {
        if (getBrowserLevelPreview().active || isWorkbenchPreviewRequested()) throw Error('预览模式不能修改个人资料');
        const initStarted = Date.now();
        if (!await PlatformCloudMgr.inst.init()) throw Error('资料云服务不可用，请稍后重试');
        const initMs = Date.now() - initStarted;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let result: any;
        const requestStarted = Date.now();
        try {
            result = await Promise.race([
                PlatformCloudMgr.inst.callFunction<any>('updateUserProfileAssets', { action, ...data }),
                new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(Error('资料请求超时，请重试确认结果')), 15000); }),
            ]);
        } finally {
            if (timeout) clearTimeout(timeout);
            console.info('[ProfilePerf]', action, 'initMs', initMs, 'requestMs', Date.now() - requestStarted);
        }
        if (!result?.ok) throw Error(result?.errorMessage || '装扮操作失败');
        if (result.customizationSchemaVersion !== 1 || !result.customization) throw Error('装扮云服务尚未更新');
        if (typeof result.ownerKey !== 'string' || !/^[a-f0-9]{64}$/.test(result.ownerKey)) throw Error('装扮云服务账号校验失败');
        const owner = sys.localStorage.getItem(OWNER);
        if (owner && owner !== result.ownerKey) {
            this.state = fresh();
            sys.localStorage.removeItem(PENDING); sys.localStorage.removeItem(AD_PENDING); sys.localStorage.removeItem(SELECTION);
        }
        sys.localStorage.setItem(OWNER, result.ownerKey);
        this.applyCloud(result.customization);
        if (action === 'profileBuy' && result.inventory) runtime.applyPvpEconomySnapshot(result.inventory);
        return result;
    }
    async refresh(runtime: any): Promise<void> {
        this.refreshProgressUnlocks();
        await this.call(runtime, 'profileGet', { seenItemIds: this.state.seenItemIds });
        await this.recover(runtime, false);
        const pending = sys.localStorage.getItem(SELECTION);
        if (pending) await this.recoverSelection(runtime);
    }
    async claimChapterRewards(runtime: any): Promise<{ granted: ChapterReward[]; claimed: string[] }> {
        if (getBrowserLevelPreview().active || isWorkbenchPreviewRequested()) throw Error('关卡预览不发放章节奖励');
        if (this.browserSimulation()) {
            const key = 'pdd.chapter.rewards.browser.v1';
            const saved = JSON.parse(sys.localStorage.getItem(key) || '{"claimed":[],"totals":null}');
            // A durable receipt is written before applying the existing recoverable grant journal.
            if (saved.totals) runtime.applyWechatGiftState({ wechatGiftProtocol: 1, wechatGiftTotals: saved.totals });
            for (const id of saved.beanSkins || []) runtime.grantBeanSkin(id);
            for (const id of saved.backgrounds || []) runtime.grantBackgroundSkin(id);
            const granted = eligibleChapterRewards(this.getMainlineClearedCount(), saved.claimed);
            const totals = { ...runtime.readWechatGiftTotals() };
            for (const reward of granted) for (const field of ['gold', 'brushCount', 'magnetCount'] as const) totals[field] = (totals[field] || 0) + reward[field];
            const claimed = [...saved.claimed, ...granted.map(row => row.key)];
            const beanSkins = [...new Set([...(saved.beanSkins || []), ...granted.map(r => r.beanSkinId).filter(Boolean)])];
            const backgrounds = [...new Set([...(saved.backgrounds || []), ...granted.map(r => r.backgroundSkinId).filter(Boolean)])];
            sys.localStorage.setItem(key, JSON.stringify({ claimed, totals, beanSkins, backgrounds }));
            runtime.applyWechatGiftState({ wechatGiftProtocol: 1, wechatGiftTotals: totals });
            for (const id of beanSkins) runtime.grantBeanSkin(id);
            for (const id of backgrounds) runtime.grantBackgroundSkin(id);
            this.refreshProgressUnlocks();
            return { granted, claimed };
        }
        const result = await this.call(runtime, 'profileChapterClaim', { requestId: this.requestId() });
        if (result.chapterRewards?.version !== 2 || !Array.isArray(result.chapterRewards.claimed)) throw Error('章节奖励云服务尚未更新');
        runtime.applyWechatGiftState(result.inventory);
        for (const id of result.inventory.ownedBeanSkinIds || []) runtime.grantBeanSkin(id);
        for (const id of result.inventory.ownedBackgroundSkinIds || []) runtime.grantBackgroundSkin(id);
        return result.chapterRewards;
    }
    private async recoverSelection(runtime: any): Promise<void> {
        const pending = sys.localStorage.getItem(SELECTION);
        if (!pending) return;
        if (JSON.parse(pending).customNickname !== undefined) { sys.localStorage.removeItem(SELECTION); return; }
        try { await this.call(runtime, 'profileSelect', JSON.parse(pending)); sys.localStorage.removeItem(SELECTION); }
        catch (e: any) { if (/资料已更新|未解锁|不可用|昵称长度|已停用/.test(e.message)) sys.localStorage.removeItem(SELECTION); throw e; }
    }
    async select(runtime: any, data: { itemId?: number; avatarSource?: string; customNickname?: string }): Promise<void> {
        if (this.browserSimulation()) {
            const row = profileItem(data.itemId!);
            if (!this.owned(row.id)) throw Error('未解锁的装扮');
            if (row.kind === 'avatar') { this.state.equippedAvatarId = row.id; this.state.avatarSource = 'catalog'; }
            else this.state.equippedFrameId = row.id;
            this.persist(); return;
        }
        if (this.busy) throw Error('资料正在更新');
        this.busy = true;
        try {
            await this.recoverSelection(runtime);
            const request = { ...data, seenItemIds: this.state.seenItemIds, revision: this.state.revision, requestId: this.requestId() };
            sys.localStorage.setItem(SELECTION, JSON.stringify(request));
            try {
                try { await this.call(runtime, 'profileSelect', request); }
                catch (e: any) {
                    // Only a confirmed revision conflict is safe to refresh and retry.
                    if (e.message !== '资料已更新，请刷新后重试') throw e;
                    sys.localStorage.removeItem(SELECTION);
                    await this.call(runtime, 'profileGet', { seenItemIds: this.state.seenItemIds });
                    request.revision = this.state.revision;
                    request.seenItemIds = this.state.seenItemIds;
                    sys.localStorage.setItem(SELECTION, JSON.stringify(request));
                    await this.call(runtime, 'profileSelect', request);
                }
                sys.localStorage.removeItem(SELECTION);
            } catch (e: any) { if (/资料已更新|未解锁|不可用|昵称长度|已停用/.test(e.message)) sys.localStorage.removeItem(SELECTION); throw e; }
        } finally { this.busy = false; }
    }
    async buy(runtime: any, itemId: number): Promise<void> {
        if (this.browserSimulation()) {
            const row = profileItem(itemId);
            if (this.owned(itemId)) return;
            if (row.unlock !== 'gold') throw Error('不能使用金币解锁');
            if (!runtime.spendGold(row.value)) throw Error('金币不足');
            const owned = row.kind === 'avatar' ? this.state.ownedAvatarIds : this.state.ownedFrameIds;
            owned.push(itemId);
            this.persist(); return;
        }
        if (this.busy) throw Error('请等待上一笔操作完成');
        this.busy = true;
        try {
            if (!await runtime.ensureCloudGameStateSyncReady()) throw Error('资产同步失败，未扣金币');
            await this.call(runtime, 'profileGet', { seenItemIds: this.state.seenItemIds });
            await this.recover(runtime, true);
            if (this.owned(itemId)) return;
            const request = { action: 'profileBuy', itemId, requestId: this.requestId(), pvpEconomyRevision: Number(sys.localStorage.getItem(PVP_ECONOMY_REVISION_KEY)) || 0 };
            sys.localStorage.setItem(PENDING, JSON.stringify(request));
            await this.recover(runtime, true);
        } finally { this.busy = false; }
    }
    async beginAd(runtime: any, itemId: number): Promise<string> {
        if (this.busy) throw Error('资料正在更新');
        if (this.browserSimulation()) {
            const row = profileItem(itemId);
            if (row.unlock !== 'ad' || this.owned(itemId)) throw Error('装扮无需广告解锁');
            const requestId = this.requestId();
            this.browserAdRequests.clear();
            this.browserAdRequests.set(requestId, itemId);
            return requestId;
        }
        await this.call(runtime, 'profileGet', { seenItemIds: this.state.seenItemIds });
        await this.recover(runtime, false);
        const requestId = this.requestId();
        await this.call(runtime, 'profileAdBegin', { itemId, requestId });
        return requestId;
    }
    async claimAd(runtime: any, itemId: number, requestId: string): Promise<void> {
        if (this.browserSimulation()) {
            if (this.browserAdRequests.get(requestId) !== itemId) return;
            this.browserAdRequests.delete(requestId);
            const row = profileItem(itemId);
            const count = Math.min(row.value, (this.state.adWatchCounts[itemId] || 0) + 1);
            this.state.adWatchCounts[itemId] = count;
            const owned = row.kind === 'avatar' ? this.state.ownedAvatarIds : this.state.ownedFrameIds;
            if (count >= row.value && !owned.includes(itemId)) owned.push(itemId);
            this.persist(); return;
        }
        // Persist only AFTER the SDK's successful reward callback; a cancelled ad is never recovered as a reward.
        sys.localStorage.setItem(AD_PENDING, JSON.stringify({ action: 'profileAdClaim', itemId, requestId }));
        await this.recover(runtime, false);
    }
    private async recover(runtime: any, includePurchase: boolean): Promise<void> {
        if (this.recovery) await this.recovery;
        this.recovery = this.recoverPending(runtime, includePurchase);
        try { await this.recovery; } finally { this.recovery = null; }
    }
    private async recoverPending(runtime: any, includePurchase: boolean): Promise<void> {
        // Migrate completed ad callbacks from the former shared operation slot.
        const legacy = sys.localStorage.getItem(PENDING);
        if (legacy && JSON.parse(legacy).action === 'profileAdClaim') {
            if (!sys.localStorage.getItem(AD_PENDING)) sys.localStorage.setItem(AD_PENDING, legacy);
            sys.localStorage.removeItem(PENDING);
        }
        await this.recoverRequest(runtime, AD_PENDING);
        if (includePurchase) await this.recoverRequest(runtime, PENDING);
    }
    private async recoverRequest(runtime: any, key: string): Promise<void> {
        const raw = sys.localStorage.getItem(key);
        if (!raw) return;
        const pending = JSON.parse(raw);
        try { await this.call(runtime, pending.action, pending); if (sys.localStorage.getItem(key) === raw) sys.localStorage.removeItem(key); }
        catch (e: any) {
            if (/金币数量不足|资产已更新|已过期|不能使用金币|已停用/.test(e.message)) sys.localStorage.removeItem(key);
            throw e;
        }
    }
}
