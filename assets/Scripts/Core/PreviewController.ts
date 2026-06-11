import { _decorator, assetManager, Button, Label, Node, ResolutionPolicy, SceneAsset, director, view } from 'cc';
import { GameRuntimeHost } from './GameRuntimeHost';

const { ccclass } = _decorator;

type PreviewAction = {
    label: string;
    onClick: () => void;
};

type PreviewSceneConfig = {
    title: string;
    subtitle: string;
    footnote: string;
    actions: PreviewAction[];
};

@ccclass('PreviewController')
export class PreviewController extends GameRuntimeHost {
    private panelPreviewPage = 0;
    private fxPreviewPage = 0;

    start() {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);
        this.preparePreviewRuntime();

        const screenRoot = (this as any).requireCanvasUiRoot('ScreenRoot') as Node;
        const sceneName = this.getRuntimeSceneName('UIPreview');
        if (sceneName === 'PanelPreview') {
            this.renderPanelPreview(screenRoot);
            return;
        }
        if (sceneName === 'FxPreview') {
            this.renderFxPreview(screenRoot);
            return;
        }
        this.renderUiPreview(screenRoot);
    }

    async requestHomeSceneTransition() {
        await director.loadScene('UIPreview');
    }

    showMainMenu() {
        const currentScene = this.getRuntimeSceneName('UIPreview');
        void director.loadScene(currentScene === 'PanelPreview' ? 'PanelPreview' : 'UIPreview');
    }

    showTrackedRewardedAd(_tag: string, onDone: (success: boolean) => void) {
        (this as any).showToast?.('Preview 模式下不会拉起广告', 1.6);
        onDone(false);
    }

    private preparePreviewRuntime() {
        const runtime = this as any;
        const bootRoot = runtime.requireCanvasUiRoot('BootRoot') as Node;
        const startupLoadingUi = runtime.requireUiChild(bootRoot, 'StartupLoadingUI', 'BootRoot/StartupLoadingUI') as Node;
        const overlayRoot = runtime.requireCanvasUiRoot('OverlayRoot') as Node;
        const overlayTemplates = overlayRoot.getChildByName('OverlayTemplates');
        startupLoadingUi.active = false;
        if (overlayTemplates) {
            this.hidePreviewOverlayTemplate(overlayTemplates, 'LevelDataLoadFatalError');
        }
        runtime._loadingOverlay = null;
        runtime._loadingClosing = false;
    }

    private hidePreviewOverlayTemplate(root: Node, name: string) {
        const node = root.getChildByName(name);
        if (node) node.active = false;
    }

    private renderUiPreview(root: Node) {
        this.renderPreviewShell(root, {
            title: 'UI Preview',
            subtitle: '把预览入口从真流程里拆出来，后续调 panel / 动效都从这里进。',
            footnote: 'UIPreview 现在承担统一入口；Panel/Fx 预览不再必须从首页或真打一局进入。',
            actions: [
                { label: '打开 Panel Preview', onClick: () => { void director.loadScene('PanelPreview'); } },
                { label: '打开 Fx Preview', onClick: () => { void director.loadScene('FxPreview'); } },
                { label: '进入 Home.scene', onClick: () => { this.loadHomePreviewScene(); } },
                { label: '进入 Game.scene', onClick: () => { void director.loadScene('Game'); } },
            ],
        });
    }

    private renderPanelPreview(root: Node) {
        const pages: PreviewAction[][] = [
            [
                { label: '设置面板', onClick: () => this.openPanelPreview(() => { (this as any).openSettingsPanel(); }) },
                { label: '排行榜', onClick: () => this.openPanelPreview(() => { void (this as any).openLeaderboard(); }) },
                { label: '签到面板', onClick: () => this.openPanelPreview(() => { (this as any).openDailySignInPanel(); }) },
                { label: '金币商店', onClick: () => this.openPanelPreview(() => { (this as any).openGoldShop(); }) },
                { label: '图鉴面板', onClick: () => this.openPanelPreview(() => { (this as any).openCollection(); }) },
            ],
            [
                { label: '主题挑战', onClick: () => this.openPanelPreview(() => { (this as any).openThemePanel(); }) },
                { label: '恢复体力', onClick: () => this.openPanelPreview(() => { (this as any).openRecoverVigorPrefabModal(() => {}); }) },
                { label: '胜利结算', onClick: () => this.openResultPanelPreview('win') },
                { label: '失败结算', onClick: () => this.openResultPanelPreview('lose') },
                { label: '复活结算', onClick: () => this.openResultPanelPreview('revive') },
            ],
            [
                { label: '资源获取', onClick: () => this.openAcquireResourcePreview() },
                { label: '技能解锁', onClick: () => this.openSkillUnlockPreview() },
                { label: '返回 UIPreview', onClick: () => { void director.loadScene('UIPreview'); } },
            ],
        ];
        const page = this.clampPreviewPage(this.panelPreviewPage, pages.length);
        this.panelPreviewPage = page;
        this.renderPreviewShell(root, {
            title: 'Panel Preview',
            subtitle: `第 ${page + 1}/${pages.length} 页：直接拉起 prefab 面板，验证节点绑定和关闭路径。`,
            footnote: 'PanelPreview 使用真实 prefab 与真实关闭逻辑；广告入口在 preview 模式下会被跳过。',
            actions: this.withPreviewPager(root, pages, page, 'panel'),
        });
    }

    private loadHomePreviewScene() {
        assetManager.loadBundle('homeAssets', (bundleErr, bundle) => {
            if (bundleErr || !bundle) {
                console.error('[Preview] load homeAssets failed:', bundleErr?.message || 'missing bundle');
                return;
            }
            bundle.loadScene('Home', (sceneErr: Error | null, sceneAsset: SceneAsset) => {
                if (sceneErr || !sceneAsset) {
                    console.error('[Preview] load Home.scene failed:', sceneErr?.message || 'missing scene asset');
                    return;
                }
                director.runScene(sceneAsset);
            });
        });
    }

    private renderFxPreview(root: Node) {
        const pages: PreviewAction[][] = [
            [
                { label: '播放 Loading', onClick: () => this.playLoadingPreview() },
                { label: '隐藏 Loading', onClick: () => { (this as any).hideLoadingOverlay?.(); } },
                { label: '显示 Toast', onClick: () => { (this as any).showToast?.('Preview Toast 正常触发', 1.5); } },
                { label: '计时器 Toast', onClick: () => { (this as any).showToastBelowTimer?.('计时器下方 Toast 预览', 1.5); } },
                { label: '返回 UIPreview', onClick: () => { void director.loadScene('UIPreview'); } },
            ],
            [
                { label: '进入 Game.scene', onClick: () => { void director.loadScene('Game'); } },
                { label: '返回 UIPreview', onClick: () => { void director.loadScene('UIPreview'); } },
            ],
        ];
        const page = this.clampPreviewPage(this.fxPreviewPage, pages.length);
        this.fxPreviewPage = page;
        this.renderPreviewShell(root, {
            title: 'Fx Preview',
            subtitle: `第 ${page + 1}/${pages.length} 页：覆盖 Loading / Toast，玩法引导先从 Game.scene 入口验。`,
            footnote: 'FxPreview 用于本地 Browser smoke；微信或真机验证放在之后。',
            actions: this.withPreviewPager(root, pages, page, 'fx'),
        });
    }

    private clampPreviewPage(page: number, total: number): number {
        return Math.max(0, Math.min(Math.max(0, total - 1), page));
    }

    private withPreviewPager(root: Node, pages: PreviewAction[][], page: number, kind: 'panel' | 'fx'): PreviewAction[] {
        const actions = pages[page].slice(0, 5);
        const hasMore = pages.length > 1;
        if (!hasMore) return actions;
        const nextPage = (page + 1) % pages.length;
        actions.push({
            label: page + 1 >= pages.length ? '回到第1页' : '下一页',
            onClick: () => {
                if (kind === 'panel') {
                    this.panelPreviewPage = nextPage;
                    this.renderPanelPreview(root);
                } else {
                    this.fxPreviewPage = nextPage;
                    this.renderFxPreview(root);
                }
            },
        });
        return actions;
    }

    private clearPreviewPopups() {
        const runtime = this as any;
        const popupRoot = runtime.requireCanvasUiRoot('PopupRoot') as Node;
        for (const child of popupRoot.children.slice()) {
            child.destroy();
        }
        runtime.panelWin = null;
        runtime.panelLose = null;
        runtime.panelTimeoutContinue = null;
    }

    private openPanelPreview(open: () => void) {
        this.clearPreviewPopups();
        open();
    }

    private openResultPanelPreview(kind: 'win' | 'lose' | 'revive') {
        const runtime = this as any;
        runtime._ensureGameplayResultPanelPrefabsReady?.(() => {
            this.clearPreviewPopups();
            this.prepareResultPreviewBoardModel(runtime);
            runtime._isThemeLevel = false;
            runtime._pendingWinGoldReward = 80;
            runtime._pendingWinAdBonusReward = 320;
            runtime._winAdRewardClaimed = false;
            if (kind === 'win') {
                runtime.panelWin = runtime.createWinSettlementPanel();
                runtime.updateWinRewardLabel?.(80);
                runtime.refreshWinAdBonusUI?.();
                this.drawPreviewWinPattern(runtime.panelWin);
                runtime.panelWin.active = true;
                return;
            }
            if (kind === 'lose') {
                runtime.panelLose = runtime.createLoseSettlementPanel();
                runtime.updateLoseProgressLabel?.();
                runtime.panelLose.active = true;
                return;
            }
            runtime.panelTimeoutContinue = runtime.createReviveSettlementPanel();
            runtime.updateLoseProgressLabel?.();
            runtime.panelTimeoutContinue.active = true;
        });
    }

    private prepareResultPreviewBoardModel(runtime: any) {
        if (runtime.boardModel) return;
        const correctColors = [
            [1, 1, 1, 1],
            [1, 2, 2, 1],
            [1, 2, 2, 1],
            [1, 1, 1, 1],
        ];
        const locked = [
            [true, true, true, true],
            [true, true, true, false],
            [true, true, false, false],
            [true, false, false, false],
        ];
        runtime.boardModel = {
            width: 4,
            height: 4,
            correctColors,
            locked,
        };
    }

    private drawPreviewWinPattern(panel: Node) {
        const runtime = this as any;
        const previewNode = panel
            .getChildByName('Box')
            ?.getChildByName('PreviewFrame')
            ?.getChildByName('PatternPreview');
        if (!previewNode) {
            throw new Error('[panel-preview] WinPanel is missing Box/PreviewFrame/PatternPreview');
        }
        if (typeof runtime.drawCollectionPixelPreviewOnCard !== 'function') {
            throw new Error('[panel-preview] missing drawCollectionPixelPreviewOnCard');
        }
        previewNode.removeAllChildren();
        runtime.drawCollectionPixelPreviewOnCard(previewNode, 1, 0, 0, 280, 230);
    }

    private openAcquireResourcePreview() {
        const runtime = this as any;
        this.clearPreviewPopups();
        runtime.showAcquireResourceModal?.({
            title: '补充道具',
            description: '预览资源获取弹窗的标题、说明、购买和广告按钮。',
            buyLabel: '120 金币',
            buyCost: 120,
            adLabel: '看广告领取',
            onBought: () => runtime.showToast?.('Preview: 已购买'),
            onWatchAd: () => runtime.showToast?.('Preview: 广告入口'),
            onCancel: () => {},
        });
    }

    private openSkillUnlockPreview() {
        const runtime = this as any;
        this.clearPreviewPopups();
        runtime.showSkillUnlockGuide?.('魔法棒', () => {});
    }

    private playLoadingPreview() {
        const runtime = this as any;
        runtime.hideLoadingOverlay?.();
        runtime.showLoadingOverlay?.();
        runtime._setLoadingProgress?.(0, 0);
        const steps = [0.16, 0.42, 0.73, 1];
        steps.forEach((progress, index) => {
            this.scheduleOnce(() => {
                runtime._setLoadingProgress?.(progress, progress >= 1 ? 0.16 : 0.22);
                if (progress >= 1) {
                    this.scheduleOnce(() => {
                        runtime.hideLoadingOverlay?.();
                    }, 0.28);
                }
            }, 0.38 * index);
        });
    }

    private renderPreviewShell(root: Node, config: PreviewSceneConfig) {
        this.setPreviewLabel(root, 'PreviewTitle', config.title);
        this.setPreviewLabel(root, 'PreviewSubtitle', config.subtitle);
        this.setPreviewLabel(root, 'PreviewFootnote', config.footnote);
        this.bindPreviewActions(root, config.actions);
    }

    private bindPreviewActions(root: Node, actions: PreviewAction[]) {
        const runtime = this as any;
        for (let index = 0; index < 6; index++) {
            const node = runtime.requireUiChild(root, `PreviewAction${index}`, `ScreenRoot/PreviewAction${index}`) as Node;
            const labelNode = runtime.requireUiChild(node, `PreviewAction${index}Label`, `PreviewAction${index}/PreviewAction${index}Label`) as Node;
            const action = actions[index];
            node.active = !!action;
            if (!action) continue;

            this.setPreviewLabel(node, `PreviewAction${index}Label`, action.label);
            const button = node.getComponent(Button);
            if (!button) {
                throw new Error(`[SceneUI] PreviewAction${index} is missing Button`);
            }
            button.interactable = true;
            node.targetOff(this);
            node.on(Button.EventType.CLICK, () => {
                action.onClick();
            }, this);
            labelNode.active = true;
        }
    }

    private setPreviewLabel(parent: Node, name: string, text: string) {
        const node = (this as any).requireUiChild(parent, name, `${parent.name}/${name}`) as Node;
        const label = node.getComponent(Label);
        if (!label) {
            throw new Error(`[SceneUI] ${parent.name}/${name} is missing Label`);
        }
        node.active = true;
        label.string = text;
    }
}
