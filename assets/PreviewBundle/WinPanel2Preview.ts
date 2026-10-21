import { assetManager, BlockInputEvents, Button, instantiate, JsonAsset, Node, ParticleSystem2D, Prefab, UIOpacity, UITransform } from 'cc';
import { renderCompletedPatternPreview } from '../Scripts/Core/CompletedPatternPreview';
import { ECONOMY_NUMERIC_TABLE } from '../Scripts/Core/EconomyConfig';
import { GAME_ASSETS_BUNDLE_NAME, LOCAL_BOOTSTRAP_BUNDLE_NAME } from '../Scripts/Core/PackageNames';
import { WinPanel2Presentation } from '../Scripts/Core/WinPanel2Presentation';

type Presentation = { play(): void; stop(): void };

function child(parent: Node, name: string): Node {
    const node = parent.getChildByName(name);
    if (!node) throw Error(`胜利界面2预制体缺少 ${parent.name}/${name}`);
    return node;
}

function loadBundle(name: string): Promise<any> {
    return new Promise((resolve, reject) => assetManager.loadBundle(name, (error, bundle) => {
        if (error || !bundle) reject(error || Error(`预览资源包缺失：${name}`));
        else resolve(bundle);
    }));
}

/** Owned only by UIPreview: no settlement, receipt, navigation or ad actions are dispatched. */
export class WinPanel2Preview {
    private token = 0;
    private panel: Node | null = null;
    private presentation: Presentation | null = null;

    constructor(private runtime: any, private onClose: () => void) {}

    dispose(): void {
        this.token++;
        this.presentation?.stop();
        this.presentation = null;
        if (this.panel?.isValid) {
            this.panel.active = false;
            this.panel.removeFromParent();
            this.panel.destroy();
        }
        this.panel = null;
    }

    async open(): Promise<void> {
        this.dispose();
        const token = this.token;
        const current = () => this.runtime.isValid && token === this.token;
        try {
            if (typeof ParticleSystem2D !== 'function') throw Error('请在项目功能裁剪中启用 2D 粒子系统并刷新预览');
            const [artBundle, levelBundle] = await Promise.all([
                loadBundle(GAME_ASSETS_BUNDLE_NAME), loadBundle(LOCAL_BOOTSTRAP_BUNDLE_NAME),
            ]);
            if (!current()) return;
            const [prefab, levelAsset] = await Promise.all([
                new Promise<Prefab>((resolve, reject) => artBundle.load('UI/Prefabs/Panels/WinPanel2', Prefab,
                    (error: Error | null, asset: Prefab) => error || !asset ? reject(error || Error('胜利界面2预制体缺失')) : resolve(asset))),
                new Promise<JsonAsset>((resolve, reject) => levelBundle.load('LevelData/level_1', JsonAsset,
                    (error: Error | null, asset: JsonAsset) => error || !asset ? reject(error || Error('真实首关图案数据缺失')) : resolve(asset))),
            ]);
            if (!current()) return;
            const level = levelAsset.json as any;
            const grid = level?.correctColorArr;
            if (level?.levelId !== 1 || !Array.isArray(grid) || grid.length !== level.boardHeight
                || !grid.every((row: unknown) => Array.isArray(row) && row.length === level.boardWidth
                    && row.every(value => Number.isSafeInteger(value) && value >= 0))
                || !grid.some((row: number[]) => row.some(value => value > 0))) {
                throw Error('真实首关图案数据无效，预览已停止');
            }
            const panel = instantiate(prefab);
            this.panel = panel;
            panel.name = 'WinPanel2Preview';
            panel.active = false;
            this.runtime.requireCanvasUiRoot('PopupRoot').addChild(panel);
            panel.setSiblingIndex(999);
            if (!panel.getComponent(BlockInputEvents)) panel.addComponent(BlockInputEvents);
            const opacity = panel.getComponent(UIOpacity) || panel.addComponent(UIOpacity);
            opacity.opacity = 0;
            const presentation = panel.getComponent(WinPanel2Presentation);
            if (!presentation || typeof presentation.play !== 'function' || typeof presentation.stop !== 'function') {
                throw Error('胜利界面2入场组件缺失');
            }
            this.presentation = presentation;
            const display = Object.create(this.runtime);
            Object.assign(display, {
                panelWin: panel, levelData: level, _isThemeLevel: false,
                _pendingWinGoldReward: ECONOMY_NUMERIC_TABLE.reward.winGoldMin,
                _pendingWinAdBonusReward: ECONOMY_NUMERIC_TABLE.reward.winShareGold,
                _winAdRewardClaimed: false, _settlementNextTransitioning: false, _settlementRevealToken: token,
                getActiveLogicalLevelId: () => level.levelId,
                // getGold normally repairs old receipts; preview reads must never apply that repair.
                recoverWechatGiftJournal: () => {},
            });
            for (const button of panel.getComponentsInChildren(Button)) button.clickEvents = [];
            display.updateWinRewardLabel(display._pendingWinGoldReward);
            display.ensureWinSettlementTopWidgets();
            const bottom = child(child(panel, 'Box'), 'BottomGroup');
            const hud = child(panel, 'SettlementTopHud');
            const bind = (node: Node, action: () => void) => {
                const button = node.getComponent(Button);
                if (!button) throw Error(`预览按钮缺少 Button：${node.name}`);
                button.clickEvents = [];
                node.off(Button.EventType.CLICK);
                node.on(Button.EventType.CLICK, () => { if (current()) action(); });
            };
            const home = child(hud, 'WinHomeBtn');
            home.active = true;
            bind(home, () => { this.dispose(); this.onClose(); });
            bind(child(bottom, 'ShareBonusBtn'), () => this.runtime.showToast('预览模式：分享奖励沿用现有规则，此处不分享、不发奖', 2));
            bind(child(bottom, 'PrimaryBtn'), () => {
                this.runtime.showToast('预览模式：重播入场，不切关、不消耗体力', 1.8);
                presentation.play();
            });
            const previewNode = child(child(child(panel, 'Box'), 'MiddleGroup'), 'PreviewFrame');
            const pattern = child(previewNode, 'PatternPreview');
            const size = pattern.getComponent(UITransform);
            if (!size || size.width <= 0 || size.height <= 0) throw Error('胜利界面2图案区域尺寸无效');
            panel.active = true;
            const streak = new URLSearchParams(window.location.search).get('streak');
            presentation.setWinStreak(streak === null ? 1 : Number(streak));
            renderCompletedPatternPreview(pattern, grid, {
                name: 'PixelPosterPreview', maxW: size.width, maxH: size.height,
                mode: 'win', cropToContent: true, padding: 6,
            }, this.runtime, success => {
                if (!current() || !panel.isValid) return;
                if (!success) { this.fail(Error('通关图案生成失败，胜利界面2预览已停止')); return; }
                try {
                    opacity.opacity = 255;
                    presentation.play();
                } catch (error) { this.fail(error); }
            });
        } catch (error) {
            if (current()) this.fail(error);
        }
    }

    private fail(error: unknown): void {
        console.error('[win-panel-2-preview]', error);
        this.dispose();
        this.runtime.showToast(`胜利界面2预览失败：${error instanceof Error ? error.message : String(error)}`, 4);
    }
}
