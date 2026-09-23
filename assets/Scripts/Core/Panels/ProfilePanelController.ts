import { BlockInputEvents, Button, instantiate, Label, Mask, Node, Prefab, RichText, ScrollView, Sprite, UIOpacity, UITransform, Vec3, tween, Tween } from 'cc';
import { PROFILE_ITEMS, ProfileItem } from '../ProfileCustomizationConfig';
import { ProfileCustomizationMgr } from '../ProfileCustomizationMgr';
import { ProfileResourceService } from '../ProfileResourceService';
import { renderProfileAvatar } from '../ProfileAvatarView';
import { UserMgr } from '../UserMgr';
import { SETTINGS_PANEL_TEXTURE_NAMES } from '../GameCtrlShared';
import { isMiniGameRuntime } from '../MiniGamePlatform';
import { reportProfileFailure } from '../ProfileDiagnostics';
import { ProfilePanelView } from './ProfilePanelView';

const controllers = new WeakMap<object, ProfilePanelController>();
export function openProfilePanel(runtime: any): void {
    let controller = controllers.get(runtime);
    if (!controller) { controller = new ProfilePanelController(runtime); controllers.set(runtime, controller); }
    void controller.open();
}
export function disposeProfilePanel(runtime: any): void { controllers.get(runtime)?.dispose(); controllers.delete(runtime); }

class ProfilePanelController {
    private overlay: Node | null = null;
    private opening = false;
    private busy = false;
    private disposed = false;
    private focus = '';
    private retained = false;
    private unsubscribe: (() => void) | null = null;
    private kind: 'avatar' | 'frame' = 'avatar';
    private selected = 1001;
    private cells: { node: Node; row: ProfileItem }[] = [];
    private view!: ProfilePanelView;
    private pool: Node[] = [];
    private floatingStart = new Vec3();
    private imageVersions = new WeakMap<Node, number>();
    private failedImages = new Set<Node>();
    private loadingImages = new Set<Node>();
    private badgeTweens = new Map<Node, Tween<Node>>();
    private badge(node: Node, visible: boolean): void {
        node.active = visible;
        if (!visible) { this.badgeTweens.get(node)?.stop(); this.badgeTweens.delete(node); node.angle = 0; return; }
        if (this.badgeTweens.has(node)) return;
        const a = this.view.badgeAngle, s = this.view.badgeSpeed;
        const motion = tween(node).to(0.10 * s, { angle: -a }).to(0.18 * s, { angle: a })
            .to(0.15 * s, { angle: -a * 2 / 3 }).to(0.12 * s, { angle: a * 5 / 12 }).to(0.10 * s, { angle: 0 })
            .delay(this.view.badgePause).union().repeatForever().start();
        this.badgeTweens.set(node, motion);
    }
    private stopBadges(): void {
        for (const [node, motion] of this.badgeTweens) { motion.stop(); if (node.isValid) node.angle = 0; }
        this.badgeTweens.clear();
    }
    private syncRetry: ReturnType<typeof setTimeout> | null = null;
    private statusTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly mgr = ProfileCustomizationMgr.inst;
    constructor(private readonly runtime: any) {}
    private child(parent: Node, name: string): Node { const n = parent.getChildByName(name); if (!n) throw Error(`Profile prefab missing ${name}`); return n; }
    private label(parent: Node, name: string): Label { return this.child(parent, name).getComponent(Label)!; }
    private button(parent: Node, name: string, fn: () => void): void { this.child(parent, name).on(Button.EventType.CLICK, fn, this); }
    private async prefab(name: string): Promise<Prefab> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error('资料窗口加载超时')), 8000);
            this.runtime._withGameAssetsBundle((bundle: any) => {
                if (!bundle) { clearTimeout(timer); reject(Error('资料窗口资源不可用')); return; }
                bundle.load(`UI/Prefabs/Panels/${name}`, Prefab, (error: Error, asset: Prefab) => {
                    clearTimeout(timer); error || !asset ? reject(error || Error('资料窗口缺失')) : resolve(asset);
                });
            });
        });
    }
    private status(message: string): void {
        if (this.statusTimer) { clearTimeout(this.statusTimer); this.statusTimer = null; }
        if (this.overlay?.isValid) {
            const box = this.child(this.overlay, 'Box');
            const label = this.label(box, 'FloatingStatus');
            const node = label.node, opacity = node.getComponent(UIOpacity)!;
            Tween.stopAllByTarget(node); Tween.stopAllByTarget(opacity);
            opacity.opacity = 255; node.setPosition(this.floatingStart); node.active = false;
            this.label(box, 'Status').string = message;
            if (message === '金币不足') {
                this.label(box, 'Status').string = '';
                label.string = message; node.active = true;
                tween(node).to(this.view.floatHold + this.view.floatFade, { position: this.child(box, 'FloatingEnd').position.clone() }).start();
                tween(opacity).delay(this.view.floatHold).to(this.view.floatFade, { opacity: 0 }).start();
            }
        }
        if (message && message !== '处理中…') this.statusTimer = setTimeout(() => this.status(''), this.view.statusSeconds * 1000);
    }
    private async perform(fn: () => Promise<void>): Promise<void> {
        if (this.busy) return;
        this.busy = true; this.status(''); this.refresh();
        try { await fn(); this.status(''); }
        catch (e: any) { reportProfileFailure('action', e); this.status(/金币不足|金币数量不足/.test(e.message) ? '金币不足' : ''); }
        finally { this.busy = false; this.refresh(); }
    }
    async open(): Promise<void> {
        if (this.disposed || this.opening || this.overlay?.isValid) return;
        this.opening = true;
        try {
            this.runtime._retainPanelTextureOwner('profile', SETTINGS_PANEL_TEXTURE_NAMES); this.retained = true;
            const prefab = await this.prefab('ProfilePanel');
            if (this.disposed || !this.runtime.node?.isValid) return;
            const overlay = instantiate(prefab); this.overlay = overlay;
            this.runtime.requireCanvasUiRoot('PopupRoot').addChild(overlay); overlay.addComponent(BlockInputEvents);
            this.focus = this.runtime.beginModalFocus('profile');
            const box = this.child(overlay, 'Box');
            this.view = box.getComponent(ProfilePanelView)!;
            if (!this.view) throw Error('Profile prefab missing ProfilePanelView');
            this.floatingStart.set(this.child(box, 'FloatingStatus').position);
            this.status('');
            this.button(box, 'XBtn', () => this.close());
            this.button(box, 'AvatarTab', () => this.tab('avatar'));
            this.button(box, 'FrameTab', () => this.tab('frame'));
            this.button(box, 'Action', () => { void this.perform(() => this.action()); });
            const viewport = this.child(box, 'Viewport'), content = this.child(viewport, 'Content');
            if (!viewport.getComponent(Mask)) throw Error('Profile prefab missing scroll mask');
            const scroll = viewport.getComponent(ScrollView)!;
            if (!scroll) throw Error('Profile prefab missing ScrollView');
            scroll.content = content; scroll.horizontal = false; scroll.vertical = true;
            this.pool = content.children.filter(n => n.name.startsWith('PreviewItem'));
            this.unsubscribe = this.mgr.subscribe(() => this.refresh());
            this.mgr.refreshProgressUnlocks(); this.tab('avatar');
            if (isMiniGameRuntime()) void this.syncInBackground(overlay);
        } catch (error) {
            console.error('[Profile] open failed', error); this.close();
            if (!this.disposed) this.runtime.showToast('个人信息加载失败，请重试', 2);
        } finally { this.opening = false; }
    }
    private async syncInBackground(overlay: Node, retry = false): Promise<void> {
        try { await this.mgr.refresh(this.runtime); }
        catch (error) {
            reportProfileFailure('sync', error, 0, retry ? 2 : 1);
            if (!retry && this.overlay === overlay && overlay.isValid) this.syncRetry = setTimeout(() => {
                this.syncRetry = null;
                if (this.overlay === overlay && overlay.isValid) void this.syncInBackground(overlay, true);
            }, 4000);
        }
    }
    private tab(kind: 'avatar' | 'frame'): void {
        if (!this.overlay?.isValid) return;
        if (!this.busy) this.status('');
        this.kind = kind;
        const snapshot = this.mgr.snapshot;
        this.selected = kind === 'avatar' ? snapshot.equippedAvatarId : snapshot.equippedFrameId;
        const box = this.child(this.overlay, 'Box'), viewport = this.child(box, 'Viewport'), content = this.child(viewport, 'Content');
        this.stopBadges();
        for (const cell of this.pool) { cell.off(Button.EventType.CLICK); cell.active = false; this.imageVersions.set(cell, (this.imageVersions.get(cell) || 0) + 1); }
        this.cells = []; this.failedImages.clear(); this.loadingImages.clear();
        const template = this.child(content, 'ItemTemplate');
        const rows = PROFILE_ITEMS.filter(row => row.kind === kind)
            .sort((a,b) => Number(this.mgr.owned(b.id)) - Number(this.mgr.owned(a.id)) || a.id-b.id);
        rows.forEach((row, index) => {
            let cell = this.pool[index];
            if (!cell) { cell = instantiate(template); content.addChild(cell); this.pool.push(cell); }
            cell.active = true;
            this.child(cell, 'Icon').getComponent(Sprite)!.spriteFrame = null;
            this.child(cell, 'Placeholder').active = true;
            this.cells.push({ node: cell, row });
            cell.on(Button.EventType.CLICK, () => { if (!this.busy) this.status(''); this.selected = row.id; this.mgr.markViewed(row.id); if (this.failedImages.has(cell)) this.loadImage(cell,row); this.refresh(); }, this);
            this.loadImage(cell,row);
        });
        this.view.layout(this.cells.map(x => x.node));
        viewport.getComponent(ScrollView)!.scrollToTop(0);
        this.refresh();
    }
    private loadImage(cell: Node, row: ProfileItem): void {
        if (this.loadingImages.has(cell)) return;
        this.failedImages.delete(cell); this.loadingImages.add(cell);
        const version = (this.imageVersions.get(cell) || 0) + 1; this.imageVersions.set(cell, version);
        const valid = () => cell.isValid && this.imageVersions.get(cell) === version;
        void ProfileResourceService.load(row.id).then(frame => {
            if (!valid()) return;
            const icon = this.child(cell, 'Icon'); icon.getComponent(Sprite)!.spriteFrame = frame;
            this.child(cell, 'Placeholder').active = false;
            const width = row.kind === 'frame' ? this.view.frameSize : this.view.avatarSize;
            icon.getComponent(UITransform)!.setContentSize(width, width * frame.originalSize.height / frame.originalSize.width);
        }).catch(error => {
            if (valid()) this.failedImages.add(cell);
        }).finally(() => { if (valid()) { this.loadingImages.delete(cell); this.refresh(); } });
    }
    private refresh(): void {
        if (!this.overlay?.isValid) return;
        const box = this.child(this.overlay, 'Box'), state = this.mgr.snapshot, identity = UserMgr.inst.getDisplayProfile();
        this.label(box, 'Nickname').string = identity.displayName;
        this.child(box, 'Cleared').getComponent(RichText)!.string = this.view.clearedFormat.replace('{count}', String(this.mgr.getMainlineClearedCount()));
        this.badge(this.child(box, 'AvatarDot'), PROFILE_ITEMS.some(x => x.kind === 'avatar' && this.mgr.isNew(x.id)));
        this.badge(this.child(box, 'FrameDot'), PROFILE_ITEMS.some(x => x.kind === 'frame' && this.mgr.isNew(x.id)));
        this.child(this.child(box, 'AvatarTab'), 'Active').active = this.kind === 'avatar';
        this.child(this.child(box, 'FrameTab'), 'Active').active = this.kind === 'frame';
        void renderProfileAvatar(this.child(box, 'Avatar'), this.child(box, 'Frame'), identity).catch(e => reportProfileFailure('equipped_image', e));
        for (const { node, row } of this.cells) {
            const equipped = row.kind === 'avatar' ? identity.avatarId === row.id : state.equippedFrameId === row.id;
            const locked = this.child(node, 'Locked'), ad = row.unlock === 'ad';
            locked.active = !this.mgr.owned(row.id);
            this.child(locked, 'Lock').active = !ad;
            this.child(locked, 'Video').active = ad;
            this.child(locked, 'AdProgress').active = ad;
            this.label(locked, 'AdProgress').string = this.view.adProgressFormat.replace('{count}', String(state.adWatchCounts[row.id] || 0)).replace('{total}', String(row.value));
            this.badge(this.child(node, 'New'), this.mgr.isNew(row.id));
            this.child(node, 'Selected').active = row.id === this.selected;
            this.child(node, 'Equipped').active = equipped;
        }
        const row = PROFILE_ITEMS.find(x => x.id === this.selected)!;
        const owned = this.mgr.owned(row.id), count = state.adWatchCounts[row.id] || 0;
        const equipped = row.kind === 'avatar' ? identity.avatarId === row.id : state.equippedFrameId === row.id;
        const showCondition = !owned && (row.unlock === 'mainline' || row.unlock === 'activity');
        this.child(box, 'Condition').active = showCondition;
        this.child(box, 'ConditionBackground').active = showCondition;
        this.child(box, 'Condition').getComponent(RichText)!.string = row.unlock === 'mainline' ? this.view.conditionFormat.replace('{count}', String(row.value)) : this.view.activityText;
        const action = this.child(box, 'Action');
        action.active = !equipped && (owned || row.unlock === 'ad' || row.unlock === 'gold');
        const gold = !owned && row.unlock === 'gold';
        this.child(action, 'GoldBackground').active = gold;
        this.child(action, 'Coin').active = gold;
        this.child(action, 'Caption').active = !gold;
        this.child(action, 'GoldCaption').active = gold;
        this.label(action, gold ? 'GoldCaption' : 'Caption').string = owned ? this.view.equipText : (row.unlock === 'ad' ? this.view.adActionFormat : this.view.goldActionFormat).replace('{count}', String(count)).replace('{total}', String(row.value));
        action.getComponent(Button)!.interactable = !this.busy && (owned || row.unlock === 'ad' || row.unlock === 'gold');
    }
    private async action(): Promise<void> {
        const row = PROFILE_ITEMS.find(x => x.id === this.selected)!;
        if (this.mgr.owned(row.id)) { this.mgr.markViewed(row.id); await this.mgr.select(this.runtime, { itemId: row.id }); return; }
        if (row.unlock === 'gold') { await this.mgr.buy(this.runtime, row.id); return; }
        if (row.unlock !== 'ad') return;
        const requestId = await this.mgr.beginAd(this.runtime, row.id);
        await new Promise<void>((resolve, reject) => {
        const started = this.runtime.runRewardedGrant(`profile_${row.kind}_unlock`, async () => {
            await this.mgr.claimAd(this.runtime, row.id, requestId); return true;
        }, { claimKey: `profile:${row.id}`, busyFlag: '_profileAdUnlocking', onFinally: resolve });
        if (!started) reject(Error('广告正在处理中，请稍后重试'));
        });
    }
    private close(): void {
        this.status('');
        this.stopBadges();
        if (this.syncRetry) { clearTimeout(this.syncRetry); this.syncRetry = null; }
        this.unsubscribe?.(); this.unsubscribe = null;
        const overlay = this.overlay; this.overlay = null; this.cells = []; this.pool = []; this.failedImages.clear(); this.loadingImages.clear();
        if (this.focus) { this.runtime.endModalFocus(this.focus); this.focus = ''; }
        if (overlay?.isValid) { overlay.active = false; this.runtime._closePanelWithTextureOwner(overlay, 'profile', 'profile-close'); this.retained = false; }
        if (this.retained) { this.runtime._releasePanelTextureOwner('profile', 'profile-close'); this.retained = false; }
    }
    dispose(): void { this.disposed = true; this.close(); }
}
