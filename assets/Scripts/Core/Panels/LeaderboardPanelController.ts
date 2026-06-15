import {
    AudioMgr,
    BlockInputEvents,
    Bundle,
    EventTouch,
    Label,
    LEADERBOARD_RELEASE_TEXTURE_NAMES,
    LEADERBOARD_TEXTURE_NAMES,
    LeaderboardMgr,
    Node,
    Prefab,
    UITransform,
    Vec3,
    instantiate,
} from '../GameCtrlShared';

function syncPrefabPopupTitle(box: Node, title: string): void {
    const badge = box.getChildByName('PopupTitleBadge');
    const titleNode = badge?.getChildByName('PopupTitleLabel');
    const label = titleNode?.getComponent(Label);
    if (!badge || !titleNode || !label) {
        throw new Error('[leaderboard-prefab] missing prefab title nodes');
    }
    badge.active = true;
    titleNode.active = true;
    label.string = title;
}

export class LeaderboardPanelController {
    constructor(private readonly runtime: any) {}

    async open() {
        const runtime = this.runtime;
        const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
        if (LEADERBOARD_TEXTURE_NAMES.some((name: string) => !runtime.getSF(name))) {
            runtime._openPanelAfterTextures('leaderboard', LEADERBOARD_TEXTURE_NAMES, () => !!popupRoot.getChildByName('LeaderboardOverlay'), () => { void this.open(); });
            return;
        }
        if (popupRoot.getChildByName('LeaderboardOverlay')) return;

        LeaderboardMgr.inst.enableCloudInit();
        const prefabPath = 'UI/Prefabs/Panels/LeaderboardPanel';
        const failOpen = (message: string, overlay?: Node | null) => {
            runtime.deactivateWeChatFriendRank('leaderboard-open-failed');
            if (overlay?.isValid) {
                runtime._clearSpriteFramesBeforeDestroy(overlay);
                overlay.destroy();
            }
            runtime._releasePanelTexturesNextFrame(LEADERBOARD_RELEASE_TEXTURE_NAMES, 'leaderboard-open-failed');
            console.error(message);
        };

        runtime._withGameAssetsBundle((bundle: Bundle | null) => {
            if (!bundle) {
                failOpen('[leaderboard-prefab] gameAssets bundle unavailable');
                return;
            }
            bundle.load(prefabPath, Prefab, async (err: Error | null, prefab: Prefab | null) => {
                if (err || !prefab) {
                    failOpen(`[leaderboard-prefab] load failed: ${err?.message || 'prefab missing'}`);
                    return;
                }
                let overlay: Node | null = null;
                try {
                    overlay = instantiate(prefab);
                    overlay.name = 'LeaderboardOverlay';
                    popupRoot.addChild(overlay);
                    overlay.setSiblingIndex(998);
                    if (!overlay.getComponent(BlockInputEvents)) overlay.addComponent(BlockInputEvents);

                    const closeOverlay = () => {
                        if (!overlay?.isValid) return;
                        AudioMgr.inst.play('uiPanel');
                        runtime.deactivateWeChatFriendRank('overlay-close');
                        runtime._destroyPanelAndReleaseTextures(overlay, LEADERBOARD_RELEASE_TEXTURE_NAMES, 'leaderboard');
                    };

                    const box = runtime.requirePanelChild(overlay, 'Box');
                    syncPrefabPopupTitle(box, '排行榜');
                    if (!box.getComponent(BlockInputEvents)) box.addComponent(BlockInputEvents);
                    overlay.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
                        const boxUT = box.getComponent(UITransform);
                        if (!boxUT) return;
                        const uiPos = e.getUILocation();
                        const local = boxUT.convertToNodeSpaceAR(new Vec3(uiPos.x, uiPos.y, 0));
                        const size = boxUT.contentSize;
                        if (Math.abs(local.x) <= size.width / 2 && Math.abs(local.y) <= size.height / 2) return;
                        closeOverlay();
                    }, runtime);

                    runtime.bindPanelButton(runtime.requirePanelChild(box, 'XBtn'), closeOverlay);
                    const hintAnchor = runtime.requirePanelChild(box, 'HintAnchor');
                    const hintLabel = hintAnchor.getComponent(Label);
                    if (!hintLabel) {
                        throw new Error('[leaderboard-prefab] missing label on HintAnchor');
                    }
                    hintLabel.string = '';
                    runtime.resetLeaderboardHintState?.(hintAnchor);

                    const tabWrap = runtime.requirePanelChild(box, 'LeaderboardTabs');
                    const listNode = runtime.requirePanelChild(box, 'LeaderboardList');
                    const selfBox = runtime.requirePanelChild(box, 'LeaderboardSelfBox');
                    const leftHotspot = runtime.requirePanelChild(tabWrap, 'LeaderboardTabGlobalHit');
                    const rightHotspot = runtime.requirePanelChild(tabWrap, 'LeaderboardTabFriendHit');
                    const globalBg = runtime.requirePanelChild(tabWrap, 'PopupTabGlobalBg');
                    const friendBg = runtime.requirePanelChild(tabWrap, 'PopupTabFriendBg');
                    const globalInactiveBg = runtime.requirePanelChild(tabWrap, 'PopupTabGlobalInactiveBg');
                    const friendActiveBg = runtime.requirePanelChild(tabWrap, 'PopupTabFriendActiveBg');
                    let activeTab: 'global' | 'friend' = 'global';

                    const updateTabStyle = () => {
                        globalBg.active = activeTab === 'global';
                        friendBg.active = activeTab === 'global';
                        globalInactiveBg.active = activeTab === 'friend';
                        friendActiveBg.active = activeTab === 'friend';
                        leftHotspot.setSiblingIndex(tabWrap.children.length - 1);
                        rightHotspot.setSiblingIndex(tabWrap.children.length - 1);
                        runtime.bindPanelButton(leftHotspot, () => {
                            AudioMgr.inst.play('uiPanel');
                            if (activeTab === 'global') return;
                            activeTab = 'global';
                            updateTabStyle();
                            void runtime.switchLeaderboardTab(box, hintAnchor, activeTab);
                        });
                        runtime.bindPanelButton(rightHotspot, () => {
                            AudioMgr.inst.play('uiPanel');
                            if (activeTab === 'friend') return;
                            activeTab = 'friend';
                            updateTabStyle();
                            void runtime.switchLeaderboardTab(box, hintAnchor, activeTab);
                        });
                    };

                    updateTabStyle();
                    tabWrap.setSiblingIndex(box.children.length - 1);
                    const initialRequestToken = runtime.beginLeaderboardTabRequest?.('global');
                    await runtime.loadGlobalLeaderboard(box, listNode, selfBox, hintAnchor, initialRequestToken);
                    runtime.playPopupOpenAnim?.(overlay, box);
                } catch (error) {
                    failOpen(error instanceof Error ? error.message : '[leaderboard-prefab] build failed', overlay);
                }
            });
        });
    }
}

export function ensureLeaderboardPanelController(runtime: any): LeaderboardPanelController {
    if (!runtime._leaderboardPanelController) {
        runtime._leaderboardPanelController = new LeaderboardPanelController(runtime);
    }
    return runtime._leaderboardPanelController as LeaderboardPanelController;
}
