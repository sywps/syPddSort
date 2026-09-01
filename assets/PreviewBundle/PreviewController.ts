import { _decorator, assetManager, Button, Label, Node, ResolutionPolicy, SceneAsset, director, view } from 'cc';
import { GameRuntimeHost } from '../Scripts/Core/GameRuntimeHost';
import { ECONOMY_NUMERIC_TABLE } from '../Scripts/Core/EconomyConfig';
import { HOME_ASSETS_BUNDLE_NAME, LOCAL_BOOTSTRAP_BUNDLE_NAME } from '../Scripts/Core/PackageNames';

const { ccclass } = _decorator;

type PreviewAction = {
    label: string;
    onClick: () => void;
};

type PreviewMode = 'ui' | 'panel' | 'fx';

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
    private previewMode: PreviewMode = 'ui';

    start() {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);
        this.preparePreviewRuntime();
        this.installPreviewNavigationOverrides();

        const screenRoot = (this as any).requireCanvasUiRoot('ScreenRoot') as Node;
        this.previewMode = 'ui';
        this.renderCurrentPreviewMode(screenRoot);
    }

    async requestHomeRoute() {
        await director.loadScene('UIPreview');
    }

    showMainMenu() {
        this.switchPreviewMode('ui');
    }

    private installPreviewNavigationOverrides() {
        const runtime = this as any;
        runtime.requestHomeRoute = async () => {
            this.switchPreviewMode('ui');
        };
        runtime.showMainMenu = () => {
            this.switchPreviewMode('ui');
        };
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
            this.hidePreviewOverlayTemplate(overlayTemplates, 'RemoteLoadFatalError');
        }
        runtime._loadingOverlay = null;
        runtime._loadingClosing = false;
    }

    private hidePreviewOverlayTemplate(root: Node, name: string) {
        const node = root.getChildByName(name);
        if (node) node.active = false;
    }

    private renderCurrentPreviewMode(root: Node) {
        if (this.previewMode === 'panel') {
            this.renderPanelPreview(root);
            return;
        }
        if (this.previewMode === 'fx') {
            this.renderFxPreview(root);
            return;
        }
        this.renderUiPreview(root);
    }

    private switchPreviewMode(mode: PreviewMode) {
        const root = (this as any).requireCanvasUiRoot('ScreenRoot') as Node;
        this.previewMode = mode;
        this.clearPreviewTransientState();
        this.renderCurrentPreviewMode(root);
    }

    private clearPreviewTransientState() {
        const runtime = this as any;
        this.unscheduleAllCallbacks();
        runtime.hideLoadingOverlay?.();
        this.clearPreviewPopups();
    }

    private renderUiPreview(root: Node) {
        this.previewMode = 'ui';
        this.renderPreviewShell(root, {
            title: 'UI Preview',
            subtitle: '把预览入口从真流程里拆出来，后续调 panel / 动效都从这里进。',
            footnote: 'UIPreview 现在承担统一入口；Panel/Fx 预览不再必须从首页或真打一局进入。',
            actions: [
                { label: '打开 Panel Preview', onClick: () => this.switchPreviewMode('panel') },
                { label: '打开 Fx Preview', onClick: () => this.switchPreviewMode('fx') },
                { label: '进入 Home.scene', onClick: () => { this.loadHomePreviewScene(); } },
                { label: '进入 Game.scene', onClick: () => { this.loadGamePreviewScene(); } },
            ],
        });
    }

    private renderPanelPreview(root: Node) {
        this.previewMode = 'panel';
        const pages: PreviewAction[][] = [
            [
                { label: '设置面板', onClick: () => this.openPanelPreview(() => { (this as any).openSettingsPanel(); }) },
                { label: '排行榜', onClick: () => this.openPanelPreview(() => { void (this as any).openLeaderboard(); }) },
                { label: '获取金币', onClick: () => this.openPanelPreview(() => { (this as any).openGoldAcquirePanel(); }) },
                { label: '图鉴面板', onClick: () => this.openPanelPreview(() => { (this as any).openCollection(); }) },
            ],
            [
                { label: '\u9053\u5177-\u51bb\u7ed3', onClick: () => this.openPanelPreview(() => { (this as any).openToolAcquirePanel('freeze'); }) },
                { label: '道具-清空槽位', onClick: () => this.openPanelPreview(() => { (this as any).openToolAcquirePanel('brush'); }) },
                { label: '道具-消色', onClick: () => this.openPanelPreview(() => { (this as any).openToolAcquirePanel('magnet'); }) },
                { label: '获取金币', onClick: () => this.openPanelPreview(() => { (this as any).openGoldAcquirePanel(); }) },
                { label: '恢复体力', onClick: () => this.openPanelPreview(() => { (this as any).openRecoverVigorPrefabModal(() => {}); }) },
            ],
            [
                { label: '主题挑战', onClick: () => this.openPanelPreview(() => { (this as any).openThemePanel(); }) },
                { label: '恢复体力', onClick: () => this.openPanelPreview(() => { (this as any).openRecoverVigorPrefabModal(() => {}); }) },
                { label: '胜利结算', onClick: () => this.openResultPanelPreview('win') },
                { label: '失败结算', onClick: () => this.openResultPanelPreview('lose') },
                { label: '复活结算', onClick: () => this.openResultPanelPreview('revive') },
            ],
            [
                { label: '返回 UIPreview', onClick: () => this.switchPreviewMode('ui') },
            ],
        ];
        const page = this.clampPreviewPage(this.panelPreviewPage, pages.length);
        this.panelPreviewPage = page;
        this.renderPreviewShell(root, {
            title: 'Panel Preview',
            subtitle: `第 ${page + 1}/${pages.length} 页：直接拉起 prefab 面板，验证节点绑定和关闭路径。`,
            footnote: 'Panel Preview 模式使用真实 prefab 与真实关闭逻辑；广告入口在 preview 模式下会被跳过。',
            actions: this.withPreviewPager(root, pages, page, 'panel'),
        });
    }

    private loadHomePreviewScene() {
        this.loadPreviewSceneFromBundle(HOME_ASSETS_BUNDLE_NAME, 'Home');
    }

    private loadGamePreviewScene() {
        this.loadPreviewSceneFromBundle(LOCAL_BOOTSTRAP_BUNDLE_NAME, 'Game');
    }

    private loadPreviewSceneFromBundle(bundleName: string, sceneName: string) {
        assetManager.loadBundle(bundleName, (bundleErr, bundle) => {
            if (bundleErr || !bundle) {
                console.error(`[Preview] load ${bundleName} failed:`, bundleErr?.message || 'missing bundle');
                return;
            }
            bundle.loadScene(sceneName, (sceneErr: Error | null, sceneAsset: SceneAsset) => {
                if (sceneErr || !sceneAsset) {
                    console.error(`[Preview] load ${sceneName}.scene failed:`, sceneErr?.message || 'missing scene asset');
                    return;
                }
                director.runScene(sceneAsset);
            });
        });
    }

    private renderFxPreview(root: Node) {
        this.previewMode = 'fx';
        const pages: PreviewAction[][] = [
            [
                { label: '播放 Loading', onClick: () => this.playLoadingPreview() },
                { label: '隐藏 Loading', onClick: () => { (this as any).hideLoadingOverlay?.(); } },
                { label: '显示 Toast', onClick: () => { (this as any).showToast?.('Preview Toast 正常触发', 1.5); } },
                { label: '计时器 Toast', onClick: () => { (this as any).showToastBelowTimer?.('计时器下方 Toast 预览', 1.5); } },
                { label: '返回 UIPreview', onClick: () => this.switchPreviewMode('ui') },
            ],
            [
                { label: '进入 Game.scene', onClick: () => { this.loadGamePreviewScene(); } },
                { label: '返回 UIPreview', onClick: () => this.switchPreviewMode('ui') },
            ],
        ];
        const page = this.clampPreviewPage(this.fxPreviewPage, pages.length);
        this.fxPreviewPage = page;
        this.renderPreviewShell(root, {
            title: 'Fx Preview',
            subtitle: `第 ${page + 1}/${pages.length} 页：覆盖 Loading / Toast，玩法引导先从 Game.scene 入口验。`,
            footnote: 'Fx Preview 模式用于本地 Browser smoke；微信或真机验证放在之后。',
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
            const baseGoldReward = 80;
            runtime._pendingWinGoldReward = baseGoldReward;
            runtime._pendingWinAdBonusReward = baseGoldReward * (ECONOMY_NUMERIC_TABLE.adReward.winTotalMultiplier - 1);
            runtime._winAdRewardClaimed = false;
            if (kind === 'win') {
                const showWinPanel = () => {
                    runtime.panelWin = runtime.createWinSettlementPanel();
                    runtime.updateWinRewardLabel?.(baseGoldReward);
                    runtime.refreshWinAdBonusUI?.();
                    if (typeof runtime.drawWinPatternPreview !== 'function') {
                        throw new Error('[panel-preview] missing drawWinPatternPreview');
                    }
                    runtime.drawWinPatternPreview();
                    runtime.panelWin.active = true;
                    runtime.playWinSettlementBannerFx?.();
                };
                if (typeof runtime._ensureBootstrapBeanAtlasLoaded === 'function') {
                    runtime._ensureBootstrapBeanAtlasLoaded(showWinPanel);
                    return;
                }
                showWinPanel();
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
