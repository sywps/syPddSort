import { _decorator, Button, Component, assetManager, instantiate, Prefab, BlockInputEvents, Label, Node, Sprite, SpriteFrame, Tween, UITransform, tween } from 'cc';
import { chapterReward, ChapterReward, mergeChapterRewardDisplay } from './ChapterRewardPolicy';
import { Mask, ScrollView } from 'cc';
import { ProfileCustomizationMgr } from './ProfileCustomizationMgr';
import { ProfileResourceService } from './ProfileResourceService';
import { UserStateSyncMgr } from './UserStateSyncMgr';
import { isMiniGameRuntime, isDouyinMiniGameRuntime } from './MiniGamePlatform';
import { getBrowserLevelPreview } from './BrowserLevelPreview';
import { isWorkbenchPreviewRequested } from './WorkbenchPreviewService';
import { PreviewRewardSave } from './PreviewRewardSave';
import { AudioMgr } from './AudioMgr';

type Settlement = { level: number; token: number; claimed: string[]; pending: boolean; error: string; rewards: ChapterReward[]; showing: boolean };
type RewardDisplay = Pick<ChapterReward, 'gold' | 'brushCount' | 'magnetCount' | 'avatarId' | 'frameId' | 'beanSkinId' | 'backgroundSkinId'>;
const sessions = new WeakMap<object, Settlement>();
const child = (node: Node, name: string): Node => { const value = node.getChildByName(name); if (!value) throw Error(`章节奖励预制体缺少 ${name}`); return value; };
const label = (node: Node, name: string, text: string) => { const component = child(node, name).getComponent(Label); if (!component) throw Error('章节奖励文字组件缺失'); component.string = text; };
const preview = () => getBrowserLevelPreview().active || isWorkbenchPreviewRequested();

@_decorator.ccclass('ChapterRewardGlowRotation')
class ChapterRewardGlowRotation extends Component {
    update(deltaTime: number): void {
        // Component updates stop automatically when the reward/panel is hidden.
        this.node.angle = (this.node.angle - deltaTime * 40) % 360;
    }
}

export function beginChapterRewards(runtime: any, level: number): void {
    const mount = runtime.panelWin?.getChildByName('ChapterRewardMount');
    for (const name of ['ChapterRewardPanel', 'WinShareRewardPanel']) {
        const previousOverlay = mount?.getChildByName(name);
        if (previousOverlay) previousOverlay.active = false;
    }
    if (runtime._isThemeLevel) { sessions.delete(runtime); return; }
    const session: Settlement = { level, token: runtime._settlementRevealToken, claimed: [], pending: true, error: '', rewards: [], showing: false };
    sessions.set(runtime, session);
    if (preview()) {
        try {
            const result = PreviewRewardSave.claim(level);
            session.claimed = result.claimed; session.rewards = result.granted;
            runtime.syncWinSettlementGoldBox?.();
        } catch (error) {
            session.error = error instanceof Error ? error.message : '本地测试奖励保存失败';
            console.error('[chapter-reward] preview save failed', error);
        }
        session.pending = false;
        return;
    }
    // Start on settlement, independent of opening the panel or completing its animations.
    void (async () => {
        try {
            if (isMiniGameRuntime() && !isDouyinMiniGameRuntime()) {
                if (!runtime.queueCloudGameStateSync()) throw Error('通关进度暂时无法同步，章节奖励待确认');
                if (!await UserStateSyncMgr.inst.flushPendingSave()) throw Error('通关进度未同步，章节奖励待确认');
            }
            const result = await ProfileCustomizationMgr.inst.claimChapterRewards(runtime);
            session.claimed = result.claimed; session.rewards = result.granted;
            runtime.syncWinSettlementGoldBox?.();
        } catch (error) {
            session.error = error instanceof Error ? error.message : '章节奖励确认失败';
            console.error('[chapter-reward] settlement failed', error);
        } finally {
            session.pending = false;
            if (runtime.isValid && sessions.get(runtime) === session && runtime.panelWin?.active) renderChapterRewards(runtime);
        }
    })();
}

export function renderChapterRewards(runtime: any): void {
    const panel = runtime.panelWin as Node;
    if (!panel?.isValid || (panel as any).__basicSettlement) return;
    const group = child(child(panel, 'Box'), 'BottomGroup').getChildByName('ChapterRewards');
    if (!group) throw Error('胜利界面缺少章节奖励进度');
    group.active = !runtime._isThemeLevel;
    if (!group.active) return;
    const session = sessions.get(runtime);
    if (!session) return;
    if (session.token !== runtime._settlementRevealToken || runtime._settlementNextTransitioning) return;
    const chapter = Math.floor((session.level - 1) / 9) + 1;
    const cleared = preview() ? session.level : runtime.getSavedLevel() - 1;
    const completed = Math.max(0, Math.min(9, cleared - (chapter - 1) * 9));
    const fill = child(group, 'Fill').getComponent(UITransform)!;
    Tween.stopAllByTarget(fill);
    tween(fill).to(0.5, { width: 500 * completed / 9 }).start();
    const nearest = ([4, 9] as const).find(milestone => !session.claimed.includes(chapterReward(chapter, milestone).key));
    for (const milestone of [4, 9] as const) {
        const gift = child(group, `Milestone${milestone}`);
        const claimed = session.claimed.includes(chapterReward(chapter, milestone).key);
        child(gift, 'Opened').active = claimed;
        label(group, `Reward${milestone}Label`, claimed ? '已领取'
            : completed >= milestone ? '待确认'
            : milestone === nearest ? `再过${milestone - completed}关` : `完成${milestone}关`);
        const bubble = child(gift, 'Preview');
        bubble.active = !child(gift, 'Opened').active;
        if (bubble.active) renderRewardPreview(bubble, chapterReward(chapter, milestone));
    }
    label(group, 'Status', '');
    const status = child(group, 'Status');
    status.active = false;
    if (!session.pending && !session.error && session.rewards.length && !session.showing) {
        session.showing = true;
        void showNextReward(runtime, session).catch(error => {
            console.error('[chapter-reward] popup failed', error);
            session.showing = false;
        });
    }
}

function renderRewardPreview(bubble: Node, reward: ChapterReward): void {
    const avatar = child(bubble, 'Avatar');
    const decoration = reward.avatarId || reward.frameId || reward.beanSkinId || reward.backgroundSkinId;
    avatar.active = !!decoration;
    const resources = [['Gold', reward.gold], ['Brush', reward.brushCount], ['Magnet', reward.magnetCount]] as const;
    const visibleCount = resources.filter(([, count]) => count > 0).length + (decoration ? 1 : 0);
    bubble.getComponent(UITransform)!.width = visibleCount === 3 ? 196 : visibleCount === 2 ? 160 : 120;
    const slotX = (index: number) => (index - (visibleCount - 1) / 2) * (visibleCount === 3 ? 56 : 72);
    let visibleIndex = 0;
    if (decoration) avatar.setPosition(slotX(visibleIndex++), avatar.position.y);
    for (const [name, count] of resources) {
        const slot = child(bubble, name);
        slot.active = count > 0;
        if (slot.active) {
            // Decoration and resource icons share one centered row.
            const index = visibleIndex++;
            slot.setPosition(slotX(index), 0);
        }
        child(slot, 'Count').active = false;
    }
    const artKey = `${reward.avatarId}/${reward.frameId}/${reward.beanSkinId}/${reward.backgroundSkinId}`;
    if (!decoration || (bubble as any).__avatarId === artKey) return;
    (bubble as any).__avatarId = artKey;
    const icon = child(avatar, 'Icon').getComponent(Sprite)!;
    icon.spriteFrame = null;
    child(bubble, 'Error').active = false;
    void loadRewardArt(reward).then(frame => {
        if (bubble.isValid && (bubble as any).__avatarId === artKey) icon.spriteFrame = frame;
    }).catch(error => {
        console.error('[chapter-reward] preview art failed', error);
        if (bubble.isValid && (bubble as any).__avatarId === artKey) {
            child(bubble, 'Error').active = false;
            (bubble as any).__avatarId = 0;
        }
    });
}

function loadRewardArt(reward: RewardDisplay): Promise<SpriteFrame> {
    if (reward.avatarId || reward.frameId) return ProfileResourceService.load(reward.avatarId || reward.frameId);
    const path = reward.beanSkinId
        ? `BeanSkins/icons/bean_skin_${String(reward.beanSkinId - 1999).padStart(2, '0')}/spriteFrame`
        : `Skins/Icons/bg_${String(reward.backgroundSkinId - 1000).padStart(3, '0')}/spriteFrame`;
    return new Promise((resolve, reject) => {
        const bundle = assetManager.getBundle('gameAssets');
        if (!bundle) { reject(Error('奖励资源包未加载')); return; }
        bundle.load(path, SpriteFrame, (error, frame) => error || !frame ? reject(error || Error('奖励图标缺失')) : resolve(frame));
    });
}

async function rewardOverlay(panel: Node, name: string, standalone = false): Promise<Node> {
    const mount = standalone ? panel : child(panel, 'ChapterRewardMount');
    const existing = mount.getChildByName(name);
    if (existing) return existing;
    const bundle = assetManager.getBundle('gameAssets');
    if (!bundle) throw Error('章节奖励资源包未加载');
    const prefab = await new Promise<Prefab>((resolve, reject) => bundle.load('UI/Prefabs/Panels/ChapterRewardPanel', Prefab, (error, asset) => {
        if (error || !asset) reject(error || Error('章节奖励预制体缺失')); else resolve(asset);
    }));
    if (!mount.isValid) throw Error('胜利界面已关闭');
    const overlay = instantiate(prefab);
    overlay.name = name;
    mount.addChild(overlay);
    if (standalone) overlay.setSiblingIndex(panel.children.length - 1);
    else mount.setSiblingIndex(panel.children.length - 1);
    return overlay;
}

async function showNextReward(runtime: any, session: Settlement): Promise<void> {
    await showRewardPopup(runtime, mergeChapterRewardDisplay(session.rewards),
        () => sessions.get(runtime) === session && session.token === runtime._settlementRevealToken,
        () => { session.rewards.length = 0; session.showing = false; }, 'ChapterRewardPanel');
}

// Display only: the share grant owns the balance update and duplicate-claim guard.
export async function showWinShareReward(runtime: any, gold: number, revealToken: number): Promise<void> {
    if (!Number.isSafeInteger(gold) || gold <= 0) throw Error('分享奖励展示金额无效');
    await showRewardPopup(runtime,
        [{ gold, brushCount: 0, magnetCount: 0, avatarId: 0, frameId: 0, beanSkinId: 0, backgroundSkinId: 0 }],
        () => runtime._settlementRevealToken === revealToken,
        () => {}, 'WinShareRewardPanel');
}

// Desktop owns eligibility and inventory. Prepare the existing popup before committing its grant.
export async function showDouyinDesktopReward(runtime: any, host: Node, kind: 'freeze' | 'brush' | 'magnet', isCurrent: () => boolean, grant: () => void): Promise<void> {
    let frame: SpriteFrame | undefined;
    if (kind === 'freeze') {
        const bundle = assetManager.getBundle('bootstrap');
        if (!bundle) throw Error('冻结道具资源包未加载');
        frame = await new Promise<SpriteFrame>((resolve, reject) => bundle.load(
            'GameUI/Atlases/GameSceneSmall/popup_tool_freeze_icon/spriteFrame', SpriteFrame,
            (error, asset) => error || !asset ? reject(error || Error('冻结道具图标缺失')) : resolve(asset)));
    }
    await showRewardPopup(runtime,
        [{ gold: 0, brushCount: kind === 'brush' ? 1 : 0, magnetCount: kind === 'magnet' ? 1 : 0, avatarId: 0, frameId: 0, beanSkinId: 0, backgroundSkinId: 0 }],
        isCurrent, () => {}, 'DouyinDesktopRewardPanel', { host, frame, grant });
}

async function showRewardPopup(runtime: any, rewards: RewardDisplay[], isCurrent: () => boolean, onDismiss: () => void, name: string,
    desktop?: { host: Node; frame?: SpriteFrame; grant: () => void }): Promise<void> {
    const panel = desktop?.host || runtime.panelWin as Node;
    const current = () => panel?.isValid && panel.active && isCurrent()
        && (!!desktop || (runtime.panelWin === panel && !runtime._settlementNextTransitioning));
    if (!current()) return;
    const overlay = await rewardOverlay(panel, name, !!desktop);
    if (!current()) { overlay.active = false; return; }
    if (!rewards.length) { overlay.active = false; onDismiss(); return; }
    overlay.active = !desktop;
    if (!overlay.getComponent(BlockInputEvents)) overlay.addComponent(BlockInputEvents);
    const shade = child(overlay, 'Shade');
    if (!shade.getComponent(BlockInputEvents)) shade.addComponent(BlockInputEvents);
    const confirm = child(overlay, 'Confirm');
    shade.off(Node.EventType.TOUCH_END);
    confirm.off(Button.EventType.CLICK);
    const slots = [0, 1, 2].map(i => child(overlay, `Reward${i}`));
    // Preserve editor-authored spacing before centering a smaller reward set.
    const positions = (overlay as any).__chapterPositions || slots.map(slot => slot.position.clone());
    (overlay as any).__chapterPositions = positions;
    const icons = slots.map(slot => child(slot, 'Icon').getComponent(Sprite)!);
    const frames: SpriteFrame[] = (overlay as any).__chapterFrames || icons.map(icon => icon.spriteFrame!);
    (overlay as any).__chapterFrames = frames;
    const items: { frame: SpriteFrame; text: string }[] = [];
    if (desktop?.frame) items.push({ frame: desktop.frame, text: '冻结道具 ×1' });
    child(overlay, 'Detail').active = false;
    // Reward artwork and title are content, not the blank dismissal area.
    for (const content of [child(overlay, 'Title'), ...slots.flatMap(slot => [slot, ...slot.children])]) {
        if (!content.getComponent(BlockInputEvents)) content.addComponent(BlockInputEvents);
    }
    for (const slot of slots) slot.active = false;
    const previousScroll = overlay.getChildByName('RewardScroll');
    if (previousScroll) { previousScroll.active = false; previousScroll.destroy(); }
    try {
        for (const reward of rewards) {
        if (reward.avatarId || reward.frameId || reward.beanSkinId || reward.backgroundSkinId) items.push({
            frame: await loadRewardArt(reward),
            text: reward.avatarId ? '头像' : reward.frameId ? '头像框' : reward.beanSkinId ? '豆豆皮肤' : '背景皮肤',
        });
        if (reward.gold) items.push({ frame: frames[0], text: `金币 ×${reward.gold}` });
        if (reward.brushCount) items.push({ frame: frames[1], text: `画笔 ×${reward.brushCount}` });
        if (reward.magnetCount) items.push({ frame: frames[2], text: `磁铁 ×${reward.magnetCount}` });
        }
        if (!overlay.isValid || !current()) return;
        let content: Node | null = null;
        if (items.length > 3) {
            const viewport = new Node('RewardScroll'); viewport.layer = overlay.layer; overlay.addChild(viewport);
            viewport.setPosition(0, -10);
            viewport.addComponent(UITransform).setContentSize(660, 480);
            viewport.addComponent(Mask);
            viewport.addComponent(BlockInputEvents);
            content = new Node('Content'); content.layer = overlay.layer; viewport.addChild(content);
            const transform = content.addComponent(UITransform); transform.setAnchorPoint(0.5, 1);
            transform.setContentSize(660, Math.ceil(items.length / 3) * 240);
            content.setPosition(0, 240);
            const scroll = viewport.addComponent(ScrollView); scroll.content = content;
            scroll.horizontal = false; scroll.vertical = true;
        }
        const center = items.length <= 3 ? (positions[0].x + positions[items.length - 1].x) / 2 : 0;
        items.forEach((item, i) => {
            const slot = content ? instantiate(slots[0]) : slots[i];
            if (content) {
                content.addChild(slot);
                const rowCount = Math.min(3, items.length - Math.floor(i / 3) * 3);
                slot.setPosition((i % 3 - (rowCount - 1) / 2) * 205, -120 - Math.floor(i / 3) * 240);
            } else slot.setPosition(positions[i].x - center, positions[i].y, positions[i].z);
            slot.active = true;
            child(slot, 'Icon').getComponent(Sprite)!.spriteFrame = item.frame;
            label(slot, 'Count', item.text);
            const glow = child(slot, 'Glow');
            if (!glow.getComponent(ChapterRewardGlowRotation)) glow.addComponent(ChapterRewardGlowRotation);
        });
    } catch (error) {
        overlay.active = false;
        throw error;
    }
    if (!overlay.isValid || !current()) return;
    if (desktop) {
        desktop.grant();
        overlay.active = true;
    }
    let dismissed = false;
    const dismiss = () => {
        if (dismissed || !current()) return;
        dismissed = true;
        AudioMgr.inst.play('button');
        onDismiss();
        overlay.active = false;
    };
    confirm.on(Button.EventType.CLICK, dismiss);
    shade.on(Node.EventType.TOUCH_END, dismiss);
}
