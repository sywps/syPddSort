import { _decorator, Component, assetManager, instantiate, Prefab, BlockInputEvents, Label, Node, Sprite, SpriteFrame, Tween, UITransform, tween } from 'cc';
import { chapterReward, ChapterReward } from './ChapterRewardPolicy';
import { ProfileCustomizationMgr } from './ProfileCustomizationMgr';
import { ProfileResourceService } from './ProfileResourceService';
import { UserStateSyncMgr } from './UserStateSyncMgr';
import { isMiniGameRuntime } from './MiniGamePlatform';
import { getBrowserLevelPreview } from './BrowserLevelPreview';
import { isWorkbenchPreviewRequested } from './WorkbenchPreviewService';
import { PreviewRewardSave } from './PreviewRewardSave';

type Settlement = { level: number; token: number; claimed: string[]; pending: boolean; error: string; rewards: ChapterReward[]; showing: boolean };
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
    const previousOverlay = runtime.panelWin?.getChildByName('ChapterRewardMount')?.getChildByName('ChapterRewardPanel');
    if (previousOverlay) previousOverlay.active = false;
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
            if (isMiniGameRuntime()) {
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
    for (const milestone of [4, 9] as const) {
        const gift = child(group, `Milestone${milestone}`);
        child(gift, 'Opened').active = session.claimed.includes(chapterReward(chapter, milestone).key);
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
    for (const [name, count, x] of [['Gold', reward.gold, reward.magnetCount ? -48 : reward.brushCount ? -30 : 0], ['Brush', reward.brushCount, reward.magnetCount ? 0 : 30], ['Magnet', reward.magnetCount, 48]] as const) {
        const slot = child(bubble, name);
        slot.active = count > 0;
        slot.setPosition(x, 0);
        label(slot, 'Count', `×${count}`);
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

function loadRewardArt(reward: ChapterReward): Promise<SpriteFrame> {
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

async function rewardOverlay(panel: Node): Promise<Node> {
    const mount = child(panel, 'ChapterRewardMount');
    const existing = mount.getChildByName('ChapterRewardPanel');
    if (existing) return existing;
    const bundle = assetManager.getBundle('gameAssets');
    if (!bundle) throw Error('章节奖励资源包未加载');
    const prefab = await new Promise<Prefab>((resolve, reject) => bundle.load('UI/Prefabs/Panels/ChapterRewardPanel', Prefab, (error, asset) => {
        if (error || !asset) reject(error || Error('章节奖励预制体缺失')); else resolve(asset);
    }));
    if (!mount.isValid) throw Error('胜利界面已关闭');
    const overlay = instantiate(prefab);
    mount.addChild(overlay);
    mount.setSiblingIndex(panel.children.length - 1);
    return overlay;
}

async function showNextReward(runtime: any, session: Settlement): Promise<void> {
    const panel = runtime.panelWin as Node;
    if (!panel?.isValid || !panel.active || sessions.get(runtime) !== session || runtime._settlementNextTransitioning) return;
    const overlay = await rewardOverlay(panel);
    if (!panel.isValid || !panel.active || sessions.get(runtime) !== session || session.token !== runtime._settlementRevealToken || runtime._settlementNextTransitioning) { overlay.active = false; return; }
    const reward = session.rewards[0];
    if (!reward) { overlay.active = false; session.showing = false; return; }
    overlay.active = true;
    if (!overlay.getComponent(BlockInputEvents)) overlay.addComponent(BlockInputEvents);
    const shade = child(overlay, 'Shade');
    if (!shade.getComponent(BlockInputEvents)) shade.addComponent(BlockInputEvents);
    const confirm = child(overlay, 'Confirm');
    shade.off(Node.EventType.TOUCH_END);
    confirm.off(Node.EventType.TOUCH_END);
    const slots = [0, 1, 2].map(i => child(overlay, `Reward${i}`));
    // Preserve editor-authored spacing before centering a smaller reward set.
    const positions = (overlay as any).__chapterPositions || slots.map(slot => slot.position.clone());
    (overlay as any).__chapterPositions = positions;
    const icons = slots.map(slot => child(slot, 'Icon').getComponent(Sprite)!);
    const frames: SpriteFrame[] = (overlay as any).__chapterFrames || icons.map(icon => icon.spriteFrame!);
    (overlay as any).__chapterFrames = frames;
    const items: { frame: SpriteFrame; count: string }[] = [];
    const hint = child(overlay, 'Detail').getComponent(Label)!;
    if (!(overlay as any).__closeHint) (overlay as any).__closeHint = hint.string;
    hint.string = (overlay as any).__closeHint;
    // Reward artwork and title are content, not the blank dismissal area.
    for (const content of [child(overlay, 'Title'), ...slots.flatMap(slot => [slot, ...slot.children])]) {
        if (!content.getComponent(BlockInputEvents)) content.addComponent(BlockInputEvents);
    }
    for (const slot of slots) slot.active = false;
    try {
        if (reward.avatarId || reward.frameId || reward.beanSkinId || reward.backgroundSkinId) items.push({ frame: await loadRewardArt(reward), count: '' });
        if (reward.gold) items.push({ frame: frames[0], count: `×${reward.gold}` });
        if (reward.brushCount) items.push({ frame: frames[1], count: `×${reward.brushCount}` });
        if (reward.magnetCount) items.push({ frame: frames[2], count: `×${reward.magnetCount}` });
        if (!overlay.isValid || !panel.active || sessions.get(runtime) !== session || session.token !== runtime._settlementRevealToken || runtime._settlementNextTransitioning) return;
        const center = (positions[0].x + positions[items.length - 1].x) / 2;
        items.forEach((item, i) => {
            slots[i].active = true;
            slots[i].setPosition(positions[i].x - center, positions[i].y, positions[i].z);
            icons[i].spriteFrame = item.frame;
            label(slots[i], 'Count', item.count);
            const glow = child(slots[i], 'Glow');
            if (!glow.getComponent(ChapterRewardGlowRotation)) glow.addComponent(ChapterRewardGlowRotation);
        });
    } catch (error) {
        console.error('[chapter-reward] avatar art failed', error);
    }
    if (!overlay.isValid) return;
    let dismissed = false;
    const dismiss = () => {
        if (dismissed || sessions.get(runtime) !== session) return;
        dismissed = true;
        session.rewards.shift();
        void showNextReward(runtime, session);
    };
    confirm.on(Node.EventType.TOUCH_END, dismiss);
    shade.on(Node.EventType.TOUCH_END, dismiss);
}
