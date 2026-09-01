import {
    AnalyticsMgr,
    AudioMgr,
    BlockInputEvents,
    Button,
    Bundle,
    Color,
    Graphics,
    Label,
    Node,
    PerformanceMgr,
    Prefab,
    ProgressBar,
    Sprite,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    assetManager,
    GAME_ASSETS_BUNDLE_NAME,
    LOCAL_BOOTSTRAP_BUNDLE_NAME,
    instantiate,
    sys,
    tween,
} from './GameCtrlShared';
import { AppRoot } from './AppRoot';
import { isMiniGameRuntime } from './MiniGamePlatform';
import { ensurePchConveyorGameplayController } from './PchConveyorGameplayController';

const RESULT_PANEL_PREFAB_PATHS = {
    win: 'UI/Prefabs/Panels/WinPanel',
    revive: 'UI/Prefabs/Panels/RevivePanel',
    bufferFullRevive: 'UI/Prefabs/Panels/BufferFullRevivePanel',
    lose: 'UI/Prefabs/Panels/LosePanel',
} as const;

type ResultPanelKind = keyof typeof RESULT_PANEL_PREFAB_PATHS;
const RESULT_PANEL_KINDS: ResultPanelKind[] = ['win', 'revive', 'bufferFullRevive', 'lose'];
const WIN_BANNER_LEGACY_PART_PREFIX = 'WinBannerAnimatedPart';
const WIN_BANNER_FX_PREFIX = 'WinBannerStableFx';
const WIN_BANNER_ENTRANCE_Y = 34;
const WIN_BANNER_ENTRANCE_SCALE = 0.86;
const WIN_BANNER_ENTRANCE_OVERSHOOT = 1.055;
const WIN_BANNER_IDLE_JELLY_INITIAL_DELAY = 0.5;
const WIN_BANNER_IDLE_JELLY_REPEAT_DELAY = 1.5;
const WIN_BANNER_LIGHT_NODE_NAME = '\u6a2a\u5e45\u5149\u6548';
const WIN_BANNER_LIGHT_ROTATION_SECONDS = 12;
const REVIVE_SHARE_STATE_KEY = 'pdd.revive.shareState.v1';
const REVIVE_SHARE_DAILY_LIMIT = 1;
const REVIVE_SHARE_MIN_LOGICAL_LEVEL = 4;

type ReviveShareState = {
    dateKey: string;
    count: number;
};

type ReviveSharePanelKind = 'timeout' | 'buffer-full';

type ReviveFailureContext = {
    kind: ReviveSharePanelKind;
    logicalLevelId: number;
};

type ReviveFailureSession = ReviveFailureContext & {
    token: number;
    active: boolean;
};

type ReviveShareStorage = {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
};

type WinBannerSparkleSpec = {
    xRatio: number;
    yRatio: number;
    size: number;
    delay: number;
};

const WIN_BANNER_SPARKLES: WinBannerSparkleSpec[] = [
    { xRatio: -0.44, yRatio: 0.16, size: 10, delay: 0.12 },
    { xRatio: -0.36, yRatio: 0.29, size: 14, delay: 0.42 },
    { xRatio: 0.34, yRatio: 0.28, size: 14, delay: 0.74 },
    { xRatio: 0.43, yRatio: 0.14, size: 10, delay: 1.02 },
    { xRatio: -0.08, yRatio: 0.43, size: 11, delay: 1.28 },
    { xRatio: 0.08, yRatio: 0.41, size: 9, delay: 1.56 },
    { xRatio: -0.22, yRatio: 0.08, size: 8, delay: 1.86 },
    { xRatio: 0.22, yRatio: 0.08, size: 8, delay: 2.16 },
    { xRatio: -0.48, yRatio: -0.02, size: 7, delay: 2.46 },
    { xRatio: 0.48, yRatio: -0.02, size: 7, delay: 2.76 },
    { xRatio: -0.02, yRatio: 0.18, size: 7, delay: 3.06 },
    { xRatio: 0.16, yRatio: 0.2, size: 7, delay: 3.36 },
];

export class GameplayResultPanelController {

    private reviveFailureSessionSeq = 0;
    private activeReviveFailureSession: ReviveFailureSession | null = null;
    private finalFailureReviveContext: ReviveFailureContext | null = null;

    constructor(private readonly runtime: any) {}

    captureReviveFailure(kind: ReviveSharePanelKind): void {
        if (this.activeReviveFailureSession) {
            this.activeReviveFailureSession.active = false;
        }
        this.activeReviveFailureSession = null;
        this.finalFailureReviveContext = {
            kind,
            logicalLevelId: this.getReviveShareLogicalLevelId(),
        };
    }

    private beginReviveFailureSession(kind: ReviveSharePanelKind): ReviveFailureSession {
        const logicalLevelId = this.getReviveShareLogicalLevelId();
        const active = this.activeReviveFailureSession;
        if (active?.active && active.kind === kind && active.logicalLevelId === logicalLevelId) {
            return active;
        }
        if (active) active.active = false;
        const session: ReviveFailureSession = {
            token: (this.reviveFailureSessionSeq += 1),
            kind,
            logicalLevelId,
            active: true,
        };
        this.activeReviveFailureSession = session;
        this.finalFailureReviveContext = {
            kind,
            logicalLevelId,
        };
        return session;
    }

    private isReviveFailureSessionActive(session: ReviveFailureSession): boolean {
        if (!session.active || this.activeReviveFailureSession?.token !== session.token) return false;
        if (session.logicalLevelId !== this.getReviveShareLogicalLevelId()) return false;
        return this.runtime?.isGameEnd !== false;
    }

    private completeReviveFailureSession(session: ReviveFailureSession): void {
        if (this.activeReviveFailureSession?.token !== session.token) return;
        session.active = false;
        this.activeReviveFailureSession = null;
        this.finalFailureReviveContext = null;
    }

    private closeReviveFailureSession(kind: ReviveSharePanelKind, overlay: Node): void {
        const session = this.beginReviveFailureSession(kind);
        session.active = false;
        if (this.activeReviveFailureSession === session) {
            this.activeReviveFailureSession = null;
        }
        this.finalFailureReviveContext = {
            kind,
            logicalLevelId: session.logicalLevelId,
        };
        this.runtime.cancelRewardedGrantInteraction?.('revive-panel-close');
        this.runtime.cancelPendingShareReturn?.('revive-panel-close');
        overlay.active = false;
        this.runtime.showLosePanel();
    }

    private resolveFinalFailureReviveKind(): ReviveSharePanelKind {
        const context = this.finalFailureReviveContext;
        if (context?.logicalLevelId === this.getReviveShareLogicalLevelId()) {
            return context.kind;
        }
        return this.runtime._activeLoseReason === 'buffer-full' ? 'buffer-full' : 'timeout';
    }

    private getPrefabCache(source: string): Map<string, Prefab> {
        const cache = this.runtime?._gameplayResultPanelPrefabCache;
        if (!(cache instanceof Map)) {
            throw new Error(`[result-panel] prefab cache invalid at ${source}: ${cache === null ? 'null' : typeof cache}`);
        }
        return cache;
    }

    private isCurrentPrefabLoad(loadSeq: number): boolean {
        const runtime = this.runtime;
        return !!runtime?.isValid && runtime._gameplayResultPanelPrefabLoadSeq === loadSeq;
    }

    private withBootstrapBundle(callback: (bundle: Bundle | null) => void): void {
        const runtime = this.runtime;
        if (typeof runtime._withBootstrapBundle === 'function') {
            runtime._withBootstrapBundle(callback);
            return;
        }
        assetManager.loadBundle(LOCAL_BOOTSTRAP_BUNDLE_NAME, (err, bundle) => {
            callback(err || !bundle ? null : bundle);
        });
    }

    private withGameAssetsBundle(callback: (bundle: Bundle | null) => void): void {
        const runtime = this.runtime;
        if (typeof runtime._withGameAssetsBundle === 'function') {
            runtime._withGameAssetsBundle(callback);
            return;
        }
        assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
            callback(err || !bundle ? null : bundle);
        });
    }

    private loadPrefabsFromBundle(
        bundle: Bundle,
        sourceLabel: string,
        loadSeq: number,
        onDone: () => void,
        onError: (error: Error) => void,
    ): void {
        if (!this.isCurrentPrefabLoad(loadSeq)) {
            return;
        }
        const activeCache = this.getPrefabCache(`loadPrefabs:${sourceLabel}`);
        const missingKinds = RESULT_PANEL_KINDS.filter((kind) => !activeCache.get(kind));
        let failed = false;
        if (missingKinds.length === 0) {
            onDone();
            return;
        }
        const loadNext = (index: number): void => {
            if (failed || !this.isCurrentPrefabLoad(loadSeq)) return;
            const kind = missingKinds[index];
            if (!kind) {
                onDone();
                return;
            }
            bundle.load(RESULT_PANEL_PREFAB_PATHS[kind], Prefab, (err: Error | null, prefab: Prefab | null) => {
                if (failed || !this.isCurrentPrefabLoad(loadSeq)) return;
                if (err || !prefab) {
                    failed = true;
                    onError(new Error(`[result-panel] failed to load ${sourceLabel} prefab "${kind}" from ${RESULT_PANEL_PREFAB_PATHS[kind]}: ${err?.message || 'missing prefab'}`));
                    return;
                }
                this.getPrefabCache(`loadPrefab:${sourceLabel}:${kind}`).set(kind, prefab);
                loadNext(index + 1);
            });
        };
        loadNext(0);
    }

    private loadBrowserPreviewSourcePrefabs(
        loadSeq: number,
        onDone: () => void,
        onError: (error: Error) => void,
    ): void {
        if (isMiniGameRuntime()) {
            onError(new Error('[result-panel] bootstrap result prefabs are required in minigame runtime'));
            return;
        }
        this.withGameAssetsBundle((bundle: Bundle | null) => {
            if (!this.isCurrentPrefabLoad(loadSeq)) {
                return;
            }
            if (!bundle) {
                onError(new Error(`[result-panel] failed to load ${GAME_ASSETS_BUNDLE_NAME} bundle for browser preview source prefabs`));
                return;
            }
            this.loadPrefabsFromBundle(bundle, `${GAME_ASSETS_BUNDLE_NAME}-preview-source`, loadSeq, onDone, onError);
        });
    }

    hasPrefabsReady() {
        const cache = this.getPrefabCache('hasPrefabsReady');
        return RESULT_PANEL_KINDS.every((kind) => !!cache.get(kind));
    }

    ensurePrefabsReady(onDone: () => void) {
        const runtime = this.runtime;
        if (!runtime?.isValid) {
            throw new Error('[result-panel] runtime is invalid before prefab load');
        }
        this.getPrefabCache('ensurePrefabsReady');
        if (this.hasPrefabsReady()) {
            onDone();
            return;
        }
        if (Array.isArray(runtime._gameplayResultPanelPrefabLoadCallbacks)) {
            runtime._gameplayResultPanelPrefabLoadCallbacks.push(onDone);
            return;
        }
        const loadSeq = (Number(runtime._gameplayResultPanelPrefabLoadSeq) || 0) + 1;
        runtime._gameplayResultPanelPrefabLoadSeq = loadSeq;
        runtime._gameplayResultPanelPrefabLoadCallbacks = [onDone];
        const fail = (error: Error): void => {
            if (!this.isCurrentPrefabLoad(loadSeq)) {
                return;
            }
            runtime._gameplayResultPanelPrefabLoadCallbacks = null;
            AppRoot.tryGet()?.clearRouteCover('result-panel-preload-error');
            throw error;
        };
        const flushCallbacks = () => {
            if (!this.isCurrentPrefabLoad(loadSeq)) {
                return;
            }
            const callbacks = runtime._gameplayResultPanelPrefabLoadCallbacks || [];
            runtime._gameplayResultPanelPrefabLoadCallbacks = null;
            for (const callback of callbacks) {
                callback();
            }
        };
        const failBootstrapOrLoadPreviewSource = (error: Error): void => {
            if (isMiniGameRuntime()) {
                fail(error);
                return;
            }
            this.loadBrowserPreviewSourcePrefabs(loadSeq, flushCallbacks, fail);
        };
        this.withBootstrapBundle((bundle: Bundle | null) => {
            if (!this.isCurrentPrefabLoad(loadSeq)) {
                return;
            }
            if (!bundle) {
                failBootstrapOrLoadPreviewSource(new Error(`[result-panel] failed to load ${LOCAL_BOOTSTRAP_BUNDLE_NAME} bundle`));
                return;
            }
            this.loadPrefabsFromBundle(bundle, LOCAL_BOOTSTRAP_BUNDLE_NAME, loadSeq, flushCallbacks, failBootstrapOrLoadPreviewSource);
        });
    }

    instantiateGameplayOverlay(kind: ResultPanelKind, name: string): Node {
        const runtime = this.runtime;
        const prefab = this.getPrefabCache(`instantiate:${kind}`).get(kind) as Prefab | null;
        if (!prefab) {
            throw new Error(`[result-panel] prefab "${kind}" is not ready`);
        }
        const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
        const previous = popupRoot.getChildByName(name);
        if (previous?.isValid) {
            previous.removeFromParent();
            previous.destroy();
        }
        const overlay = instantiate(prefab);
        overlay.name = name;
        popupRoot.addChild(overlay);
        overlay.setSiblingIndex(999);
        overlay.active = false;
        if (!overlay.getComponent(BlockInputEvents)) {
            overlay.addComponent(BlockInputEvents);
        }
        return overlay;
    }

    private syncResultProgressWidget(panel: Node, ratio: number = 0): void {
        const runtime = this.runtime;
        const box = runtime.requirePanelChild(panel, 'Box');
        const progressRoot = box.getChildByName('\u8fdb\u5ea6\u6761');
        const completionSummary = box.getChildByName('Label');
        const hasTextCompletionSummary = !!completionSummary?.getComponent(Label)
            && !!completionSummary.getChildByName('Label-001')?.getComponent(Label);
        if (!progressRoot) {
            if (hasTextCompletionSummary) return;
            throw new Error('[result-panel] result panel is missing Box/进度条 or text completion summary');
        }
        const progressArea = runtime.requirePanelChild(progressRoot, 'ProgressBarArea');
        const progressLabel = progressRoot.getChildByName('Label')?.getComponent(Label);
        if (progressLabel) {
            progressLabel.string = '\u5df2\u5b8c\u6210 0%';
        }
        const progressBar = progressArea.getComponent(ProgressBar);
        if (!progressBar) {
            throw new Error('[result-panel] ProgressBarArea is missing cc.ProgressBar');
        }
        if (!progressBar.barSprite) {
            throw new Error('[result-panel] cc.ProgressBar is missing barSprite');
        }
        progressBar.progress = Math.max(0, Math.min(1, Number(ratio) || 0));
    }

    private findActiveWinTitleBanner(box: Node): Node | null {
        return box.children.find((child) => {
            if (child.name !== 'TitleBanner' || !child.active) return false;
            const sprite = child.getComponent(Sprite);
            const transform = child.getComponent(UITransform);
            return !!sprite?.spriteFrame && !!transform && transform.width > 0 && transform.height > 0;
        }) ?? null;
    }

    private stopWinBannerTweenTree(node: Node): void {
        Tween.stopAllByTarget(node);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) {
            Tween.stopAllByTarget(opacity);
        }
        for (const child of node.children) {
            this.stopWinBannerTweenTree(child);
        }
    }

    private clearWinBannerFx(banner: Node): void {
        for (const child of banner.children.slice()) {
            if (!child.name.startsWith(WIN_BANNER_FX_PREFIX) && !child.name.startsWith(WIN_BANNER_LEGACY_PART_PREFIX)) continue;
            this.stopWinBannerTweenTree(child);
            child.destroy();
        }
        const sprite = banner.getComponent(Sprite);
        if (sprite) {
            sprite.enabled = true;
        }
    }

    private getWinBannerBaseState(banner: Node): { position: Vec3; scale: Vec3; angle: number } {
        const state = banner as Node & {
            __winBannerBasePosition?: Vec3;
            __winBannerBaseScale?: Vec3;
            __winBannerBaseAngle?: number;
        };
        if (!state.__winBannerBasePosition) {
            state.__winBannerBasePosition = banner.position.clone();
            state.__winBannerBaseScale = banner.scale.clone();
            state.__winBannerBaseAngle = banner.angle;
        }
        return {
            position: state.__winBannerBasePosition.clone(),
            scale: (state.__winBannerBaseScale ?? banner.scale).clone(),
            angle: state.__winBannerBaseAngle ?? banner.angle,
        };
    }

    private scaleWinBannerVec3(base: Vec3, ratio: number): Vec3 {
        return new Vec3(base.x * ratio, base.y * ratio, base.z);
    }

    private scaleWinBannerVec3XY(base: Vec3, scaleX: number, scaleY: number): Vec3 {
        return new Vec3(base.x * scaleX, base.y * scaleY, base.z);
    }

    private drawWinBannerSparkle(graphics: Graphics, size: number): void {
        graphics.clear();
        graphics.fillColor = new Color(255, 246, 180, 228);
        graphics.moveTo(0, size);
        graphics.lineTo(size * 0.26, size * 0.26);
        graphics.lineTo(size, 0);
        graphics.lineTo(size * 0.26, -size * 0.26);
        graphics.lineTo(0, -size);
        graphics.lineTo(-size * 0.26, -size * 0.26);
        graphics.lineTo(-size, 0);
        graphics.lineTo(-size * 0.26, size * 0.26);
        graphics.close();
        graphics.fill();
        graphics.fillColor = new Color(255, 255, 255, 210);
        graphics.moveTo(0, size * 0.42);
        graphics.lineTo(size * 0.16, 0);
        graphics.lineTo(0, -size * 0.42);
        graphics.lineTo(-size * 0.16, 0);
        graphics.close();
        graphics.fill();
    }

    private createWinBannerFxNode(parent: Node, name: string, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        parent.addChild(node);
        node.addComponent(UITransform).setContentSize(width, height);
        return node;
    }

    private startWinBannerLightRotation(box: Node): void {
        const light = box.getChildByName(WIN_BANNER_LIGHT_NODE_NAME);
        if (!light) return;
        const state = light as Node & { __winBannerLightBaseAngle?: number };
        if (state.__winBannerLightBaseAngle === undefined) {
            state.__winBannerLightBaseAngle = light.angle;
        }
        const baseAngle = state.__winBannerLightBaseAngle;
        Tween.stopAllByTarget(light);
        light.angle = baseAngle;
        tween(light)
            .to(WIN_BANNER_LIGHT_ROTATION_SECONDS, { angle: baseAngle + 360 }, { easing: 'linear' })
            .call(() => {
                light.angle = baseAngle;
            })
            .union()
            .repeatForever()
            .start();
    }

    private prepareWinBannerStableFx(box: Node): Node | null {
        const banner = this.findActiveWinTitleBanner(box);
        if (!banner) return null;
        const transform = banner.getComponent(UITransform);
        const sprite = banner.getComponent(Sprite);
        if (!transform || !sprite?.spriteFrame) return null;
        this.getWinBannerBaseState(banner);
        this.clearWinBannerFx(banner);
        const bannerOpacity = banner.getComponent(UIOpacity) ?? banner.addComponent(UIOpacity);
        bannerOpacity.opacity = 255;

        const root = this.createWinBannerFxNode(banner, `${WIN_BANNER_FX_PREFIX}-Root`, transform.width, transform.height);
        root.setPosition(0, 0, 0);
        root.addComponent(UIOpacity).opacity = 255;

        WIN_BANNER_SPARKLES.forEach((spec, index) => {
            const sparkle = this.createWinBannerFxNode(root, `${WIN_BANNER_FX_PREFIX}-Sparkle-${index}`, spec.size * 2, spec.size * 2);
            sparkle.setPosition(spec.xRatio * transform.width, spec.yRatio * transform.height, 0);
            sparkle.setScale(0.25, 0.25, 1);
            sparkle.addComponent(UIOpacity).opacity = 0;
            this.drawWinBannerSparkle(sparkle.addComponent(Graphics), spec.size);
        });
        return banner;
    }

    private startWinBannerIdleJelly(banner: Node): void {
        const state = this.getWinBannerBaseState(banner);
        const basePosition = state.position.clone();
        const baseScale = state.scale.clone();
        const squashPosition = new Vec3(basePosition.x, basePosition.y - 1, basePosition.z);
        const stretchPosition = new Vec3(basePosition.x, basePosition.y + 2, basePosition.z);
        const settlePosition = new Vec3(basePosition.x, basePosition.y, basePosition.z);
        const squashScale = this.scaleWinBannerVec3XY(baseScale, 1.025, 0.975);
        const stretchScale = this.scaleWinBannerVec3XY(baseScale, 0.986, 1.018);
        const settleScale = this.scaleWinBannerVec3XY(baseScale, 1.008, 0.994);

        banner.angle = state.angle;
        banner.setPosition(basePosition.x, basePosition.y, basePosition.z);
        banner.setScale(baseScale.x, baseScale.y, baseScale.z);
        tween(banner)
            .delay(WIN_BANNER_IDLE_JELLY_INITIAL_DELAY)
            .call(() => {
                tween(banner)
                    .to(0.08, {
                        position: squashPosition,
                        scale: squashScale,
                    }, { easing: 'sineOut' })
                    .to(0.1, {
                        position: stretchPosition,
                        scale: stretchScale,
                    }, { easing: 'sineInOut' })
                    .to(0.12, {
                        position: settlePosition,
                        scale: settleScale,
                    }, { easing: 'sineInOut' })
                    .to(0.1, {
                        position: basePosition,
                        scale: baseScale,
                    }, { easing: 'sineOut' })
                    .to(0.08, {
                        position: squashPosition,
                        scale: squashScale,
                    }, { easing: 'sineOut' })
                    .to(0.1, {
                        position: stretchPosition,
                        scale: stretchScale,
                    }, { easing: 'sineInOut' })
                    .to(0.12, {
                        position: settlePosition,
                        scale: settleScale,
                    }, { easing: 'sineInOut' })
                    .to(0.1, {
                        position: basePosition,
                        scale: baseScale,
                    }, { easing: 'sineOut' })
                    .delay(WIN_BANNER_IDLE_JELLY_REPEAT_DELAY)
                    .union()
                    .repeatForever()
                    .start();
            })
            .start();
    }

    private startWinBannerIdleFx(banner: Node): void {
        const root = banner.getChildByName(`${WIN_BANNER_FX_PREFIX}-Root`);
        this.startWinBannerIdleJelly(banner);
        WIN_BANNER_SPARKLES.forEach((spec, index) => {
            const sparkle = root?.getChildByName(`${WIN_BANNER_FX_PREFIX}-Sparkle-${index}`) ?? null;
            const opacity = sparkle?.getComponent(UIOpacity) ?? null;
            if (!sparkle || !opacity) return;
            Tween.stopAllByTarget(sparkle);
            Tween.stopAllByTarget(opacity);
            sparkle.angle = 0;
            sparkle.setScale(0.25, 0.25, 1);
            opacity.opacity = 0;
            tween(sparkle)
                .delay(spec.delay)
                .to(0.18, { scale: new Vec3(1, 1, 1), angle: 45 }, { easing: 'sineOut' })
                .to(0.34, { scale: new Vec3(0.35, 0.35, 1), angle: 90 }, { easing: 'sineIn' })
                .delay(2.2)
                .union()
                .repeatForever()
                .start();
            tween(opacity)
                .delay(spec.delay)
                .to(0.12, { opacity: 230 }, { easing: 'sineOut' })
                .delay(0.18)
                .to(0.22, { opacity: 0 }, { easing: 'sineIn' })
                .delay(2.2)
                .union()
                .repeatForever()
                .start();
        });
    }

    playWinSettlementBannerFx(panel?: Node | null): void {
        PerformanceMgr.inst.markUserActivity(8000);
        const targetPanel = panel ?? this.runtime?.panelWin ?? null;
        const box = targetPanel?.getChildByName('Box') ?? null;
        if (!box) return;
        this.startWinBannerLightRotation(box);
        const banner = this.prepareWinBannerStableFx(box);
        if (!banner) return;
        const state = this.getWinBannerBaseState(banner);
        this.stopWinBannerTweenTree(banner);
        const opacity = banner.getComponent(UIOpacity) ?? banner.addComponent(UIOpacity);
        const startScale = this.scaleWinBannerVec3(state.scale, WIN_BANNER_ENTRANCE_SCALE);
        const overshootScale = this.scaleWinBannerVec3(state.scale, WIN_BANNER_ENTRANCE_OVERSHOOT);
        const settleScale = this.scaleWinBannerVec3(state.scale, 0.985);
        const startPosition = new Vec3(state.position.x, state.position.y + WIN_BANNER_ENTRANCE_Y, state.position.z);
        const overshootPosition = new Vec3(state.position.x, state.position.y - 6, state.position.z);
        const settlePosition = new Vec3(state.position.x, state.position.y + 2, state.position.z);
        const finalPosition = state.position.clone();
        const finalScale = state.scale.clone();

        banner.angle = state.angle;
        banner.setPosition(startPosition.x, startPosition.y, startPosition.z);
        banner.setScale(startScale.x, startScale.y, startScale.z);
        opacity.opacity = 0;
        tween(opacity)
            .to(0.16, { opacity: 255 }, { easing: 'sineOut' })
            .start();
        tween(banner)
            .to(0.2, { position: overshootPosition, scale: overshootScale }, { easing: 'sineOut' })
            .to(0.16, { position: settlePosition, scale: settleScale }, { easing: 'sineInOut' })
            .to(0.14, { position: finalPosition, scale: finalScale }, { easing: 'sineOut' })
            .call(() => this.startWinBannerIdleFx(banner))
            .start();
    }

    createWinSettlementPanel(): Node {
        const runtime = this.runtime;
        const overlay = this.instantiateGameplayOverlay('win', 'WinSettlementOverlay');
        const box = runtime.requirePanelChild(overlay, 'Box');
        if (!box.getComponent(BlockInputEvents)) {
            box.addComponent(BlockInputEvents);
        }
        this.prepareWinBannerStableFx(box);
        const previewFrame = runtime.requirePanelChild(box, 'PreviewFrame');
        runtime.requirePanelChild(previewFrame, 'PatternPreview');
        const adBonusBtn = runtime.requirePanelChild(box, 'AdBonusBtn');
        adBonusBtn.getComponent(UIOpacity) || adBonusBtn.addComponent(UIOpacity);
        this.bindPanelButton(adBonusBtn, () => {
            AudioMgr.inst.play('button');
            runtime.claimWinAdBonusReward();
        });
        const collectionBtn = runtime.requirePanelChild(box, 'CollectionBtn');
        this.bindPanelButton(collectionBtn, () => {
            AudioMgr.inst.play('button');
            runtime.openCollection();
        });
        const primaryBtn = runtime.requirePanelChild(box, 'PrimaryBtn');
        const runPrimaryAction = () => {
            AudioMgr.inst.play('button');
            runtime.handleWinSettlementPrimaryAction();
        };
        this.bindPanelButton(primaryBtn, runPrimaryAction);
        return overlay;
    }

    private getReviveShareDateKey(nowMs: number = Date.now()): string {
        const date = new Date(nowMs);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${year}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`;
    }

    private getReviveShareStorage(): ReviveShareStorage | null {
        const storage = (sys as any)?.localStorage as ReviveShareStorage | undefined;
        if (!storage
            || typeof storage.getItem !== 'function'
            || typeof storage.setItem !== 'function') {
            return null;
        }
        return storage;
    }

    private readReviveShareState(nowMs: number = Date.now()): ReviveShareState | null {
        const storage = this.getReviveShareStorage();
        if (!storage) return null;
        const fallback: ReviveShareState = {
            dateKey: this.getReviveShareDateKey(nowMs),
            count: 0,
        };
        try {
            const raw = storage.getItem(REVIVE_SHARE_STATE_KEY);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.dateKey !== fallback.dateKey) return fallback;
            return {
                dateKey: fallback.dateKey,
                count: Math.max(0, Math.floor(Number(parsed.count) || 0)),
            };
        } catch (error) {
            console.warn('[revive-share] read daily state failed:', error);
            return null;
        }
    }

    private writeReviveShareState(state: ReviveShareState): boolean {
        const storage = this.getReviveShareStorage();
        if (!storage) return false;
        try {
            storage.setItem(REVIVE_SHARE_STATE_KEY, JSON.stringify(state));
            return true;
        } catch (error) {
            console.warn('[revive-share] write daily state failed:', error);
            return false;
        }
    }

    private getReviveShareLogicalLevelId(): number {
        const runtime = this.runtime;
        const levelId = typeof runtime.getActiveLogicalLevelId === 'function'
            ? runtime.getActiveLogicalLevelId()
            : runtime.levelData?.levelId;
        return Math.max(0, Math.floor(Number(levelId) || 0));
    }

    private hasWeChatShareReturnApi(): boolean {
        try {
            const wx: any = typeof this.runtime.getWeChatRuntime === 'function'
                ? this.runtime.getWeChatRuntime()
                : null;
            return !!wx
                && typeof wx.shareAppMessage === 'function'
                && typeof wx.onShow === 'function'
                && typeof wx.offShow === 'function';
        } catch (error) {
            console.warn('[revive-share] WeChat runtime check failed:', error);
            return false;
        }
    }

    private canUseReviveShare(): boolean {
        const runtime = this.runtime;
        if (runtime._isThemeLevel) return false;
        const entryMode = typeof runtime.getActiveGameplayEntryMode === 'function'
            ? runtime.getActiveGameplayEntryMode()
            : (runtime._activeGameplayEntryMode || 'main');
        if (entryMode !== 'main' || this.getReviveShareLogicalLevelId() < REVIVE_SHARE_MIN_LOGICAL_LEVEL) {
            return false;
        }
        const state = this.readReviveShareState();
        return !!state && state.count < REVIVE_SHARE_DAILY_LIMIT && this.hasWeChatShareReturnApi();
    }

    private reserveReviveShareGrant(): (() => void) | null {
        const state = this.readReviveShareState();
        if (!state || state.count >= REVIVE_SHARE_DAILY_LIMIT) return null;
        const nextState: ReviveShareState = {
            dateKey: state.dateKey,
            count: state.count + 1,
        };
        if (!this.writeReviveShareState(nextState)) return null;
        let rolledBack = false;
        return () => {
            if (rolledBack) return;
            rolledBack = true;
            this.writeReviveShareState(state);
        };
    }

    private bindReviveShareButton(box: Node, onClick: () => void): Node {
        const shareBtn = box.getChildByName('ShareBtn');
        const shareIcon = shareBtn?.getChildByName('ShareIcon');
        const label = shareBtn?.getChildByName('ShareBtnLbl')?.getComponent(Label);
        if (!shareBtn || !shareIcon || !label) {
            throw new Error('[result-panel] revive prefab is missing static ShareBtn/ShareIcon/ShareBtnLbl');
        }
        this.bindPanelButton(shareBtn, onClick);
        return shareBtn;
    }

    private syncReviveSharePanel(overlay: Node | null | undefined): void {
        if (!overlay?.isValid) return;
        const box = overlay.getChildByName('Box');
        const continueBtn = box?.getChildByName('ContinueBtn');
        const shareBtn = box?.getChildByName('ShareBtn');
        if (!continueBtn || !shareBtn) return;
        const shareAvailable = this.canUseReviveShare();
        continueBtn.active = !shareAvailable;
        shareBtn.active = shareAvailable;
    }

    refreshReviveShareButtons(): void {
        this.syncReviveSharePanel(this.runtime.panelTimeoutContinue);
        this.syncReviveSharePanel(this.runtime.panelBufferFullContinue);
    }

    private runReviveShareAction(
        kind: ReviveSharePanelKind,
        overlay: Node,
        continueSeconds: number = 0,
    ): void {
        const runtime = this.runtime;
        if (runtime._adShowing || runtime._shareShowing || !this.canUseReviveShare()) return;
        const session = this.beginReviveFailureSession(kind);
        if (!this.isReviveFailureSessionActive(session)) return;
        const levelId = this.getReviveShareLogicalLevelId();
        const page = kind === 'buffer-full' ? 'pch_buffer_full_revive_share' : 'level_revive_share';
        AudioMgr.inst.play('button');
        runtime.runShareGrant(page, () => {
            if (!this.isReviveFailureSessionActive(session)) return false;
            const rollbackReservation = this.reserveReviveShareGrant();
            if (!rollbackReservation) return false;
            try {
                if (kind === 'buffer-full') {
                    const continued = ensurePchConveyorGameplayController(runtime).continueAfterBufferFull();
                    if (!continued) {
                        rollbackReservation();
                        return false;
                    }
                } else {
                    const expanded = ensurePchConveyorGameplayController(runtime).grantReviveCapacity();
                    if (!expanded) {
                        rollbackReservation();
                        return false;
                    }
                    runtime.continueAfterLose(continueSeconds);
                }
                overlay.active = false;
                this.completeReviveFailureSession(session);
                this.refreshReviveShareButtons();
                return true;
            } catch (error) {
                rollbackReservation();
                throw error;
            }
        }, {
            claimKey: `${page}:${this.getReviveShareDateKey()}:${levelId}`,
            busyFlag: '_shareShowing',
            markLevelRevive: true,
            shareType: page,
            title: () => '我在拼豆豆遇到难关，快来一起挑战！',
            query: () => `level=${levelId}`,
            shareFailToast: kind === 'buffer-full' ? '分享未完成，未增加位置' : '分享未完成，未复活',
            grantFailToast: kind === 'buffer-full' ? '传送带扩容失败，请重试' : '复活失败，请重试',
            successToast: kind === 'buffer-full' ? '已增加12个位置' : '已获得120秒和12个位置',
            onFinally: () => this.refreshReviveShareButtons(),
        });
    }

    createReviveSettlementPanel(): Node {
        const runtime = this.runtime;
        const overlay = this.instantiateGameplayOverlay('revive', 'ReviveSettlementOverlay');
        const box = runtime.requirePanelChild(overlay, 'Box');
        if (!box.getComponent(BlockInputEvents)) {
            box.addComponent(BlockInputEvents);
        }
        this.syncResultProgressWidget(overlay, 0);
        const continueBtn = box.getChildByName('ContinueBtn');
        if (!continueBtn) {
            throw new Error('[result-panel] RevivePanel is missing ContinueBtn');
        }
        const rewardedSeconds = runtime.constructor.REWARDED_CONTINUE_SECONDS;
        const giveUp = () => {
            this.closeReviveFailureSession('timeout', overlay);
        };
        this.bindReviveContinueAction(continueBtn, overlay, rewardedSeconds);
        this.bindReviveShareButton(
            box,
            () => this.runReviveShareAction('timeout', overlay, rewardedSeconds),
        );
        this.syncReviveSharePanel(overlay);
        const giveUpNodes = [box.getChildByName('GiveUpBtn'), box.getChildByName('CloseBtn')].filter((node): node is Node => !!node);
        if (!giveUpNodes.length) {
            throw new Error('[result-panel] RevivePanel is missing any close/give-up action node');
        }
        for (const node of giveUpNodes) {
            this.bindPanelButton(node, () => {
                AudioMgr.inst.play('button');
                giveUp();
            });
        }
        return overlay;
    }

    createBufferFullSettlementPanel(): Node {
        const runtime = this.runtime;
        const overlay = this.instantiateGameplayOverlay('bufferFullRevive', 'BufferFullSettlementOverlay');
        const box = runtime.requirePanelChild(overlay, 'Box');
        if (!box.getComponent(BlockInputEvents)) {
            box.addComponent(BlockInputEvents);
        }
        this.syncResultProgressWidget(overlay, 0);

        const continueBtn = runtime.requirePanelChild(box, 'ContinueBtn');
        this.bindPanelButton(continueBtn, () => this.runBufferFullReviveAction(overlay));
        this.bindReviveShareButton(
            box,
            () => this.runReviveShareAction('buffer-full', overlay),
        );
        this.syncReviveSharePanel(overlay);

        const giveUpNodes = [box.getChildByName('GiveUpBtn'), box.getChildByName('CloseBtn')]
            .filter((node): node is Node => !!node);
        if (!giveUpNodes.length) {
            throw new Error('[result-panel] BufferFullRevivePanel is missing any close/give-up action node');
        }
        for (const node of giveUpNodes) {
            this.bindPanelButton(node, () => {
                AudioMgr.inst.play('button');
                this.closeReviveFailureSession('buffer-full', overlay);
            });
        }
        return overlay;
    }

    bindPanelButton(triggerNode: Node, handler: () => void): void {
        this.runtime.bindPanelButton(triggerNode, handler);
    }

    runBufferFullReviveAction(overlay: Node): void {
        const runtime = this.runtime;
        if (runtime._adShowing || runtime._shareShowing) return;
        const session = this.beginReviveFailureSession('buffer-full');
        if (!this.isReviveFailureSessionActive(session)) return;
        const controller = ensurePchConveyorGameplayController(runtime);
        const capacityBeforeGrant = controller.getBufferCapacity();
        AudioMgr.inst.play('button');
        runtime.runRewardedGrant('pch_buffer_full_revive', () => {
            if (!this.isReviveFailureSessionActive(session)) return false;
            const continued = controller.continueAfterBufferFull();
            if (!continued) return false;
            overlay.active = false;
            this.completeReviveFailureSession(session);
            return true;
        }, {
            claimKey: `pch_buffer_full_revive:${runtime.getActiveLogicalLevelId?.() || 0}:${capacityBeforeGrant}`,
            busyFlag: '_adShowing',
            markLevelRevive: true,
            adFailToast: '广告未完成，未增加位置',
            grantFailToast: '传送带扩容失败，请重试',
            successToast: '已增加12个位置',
        });
    }

    runLevelReviveAction(overlay: Node, continueSeconds: number): void {
        const runtime = this.runtime;
        if (runtime._adShowing || runtime._shareShowing) return;
        const session = this.beginReviveFailureSession('timeout');
        if (!this.isReviveFailureSessionActive(session)) return;
        const controller = ensurePchConveyorGameplayController(runtime);
        AudioMgr.inst.play('button');
        runtime.runRewardedGrant('level_revive', () => {
            if (!this.isReviveFailureSessionActive(session)) return false;
            if (!controller.grantReviveCapacity()) return false;
            runtime.continueAfterLose(continueSeconds);
            overlay.active = false;
            this.completeReviveFailureSession(session);
            return true;
        }, {
            busyFlag: '_adShowing',
            markLevelRevive: true,
            grantFailToast: '复活失败，请重试',
            successToast: '已获得120秒和12个位置',
        });
    }

    bindLoseReviveContinueAction(triggerNode: Node, overlay: Node): void {
        const runtime = this.runtime;
        const continueSeconds = runtime.constructor.REWARDED_CONTINUE_SECONDS;
        this.bindPanelButton(triggerNode, () => {
            if (this.resolveFinalFailureReviveKind() === 'buffer-full') {
                this.runBufferFullReviveAction(overlay);
                return;
            }
            this.runLevelReviveAction(overlay, continueSeconds);
        });
    }

    bindReviveContinueAction(triggerNode: Node, overlay: Node, rewardedSeconds?: number) {
        const runtime = this.runtime;
        const continueSeconds = rewardedSeconds ?? runtime.constructor.REWARDED_CONTINUE_SECONDS;
        this.bindPanelButton(triggerNode, () => this.runLevelReviveAction(overlay, continueSeconds));
    }

    createLoseSettlementPanel(): Node {
        const runtime = this.runtime;
        const overlay = this.instantiateGameplayOverlay('lose', 'LoseSettlementOverlay');
        const box = runtime.requirePanelChild(overlay, 'Box');
        if (!box.getComponent(BlockInputEvents)) {
            box.addComponent(BlockInputEvents);
        }
        this.syncResultProgressWidget(overlay, 0);
        const reviveBtn = runtime.requirePanelChild(box, '\u590d\u6d3b\u7a97\u7ec4\u4ef63');
        const homeBtn = runtime.requirePanelChild(box, '\u7eff\u8272\u6309\u952e\u5e95\u6846');
        const replayBtn = runtime.requirePanelChild(box, '\u7eff\u8272\u6309\u952e\u5e95\u6846-001');
        this.bindLoseReviveContinueAction(reviveBtn, overlay);
        this.bindPanelButton(homeBtn, () => {
            AudioMgr.inst.play('button');
            AnalyticsMgr.inst.finalizePendingFailedLevel({
                gameplayStats: runtime._pchConveyorGameplayController?.getAnalyticsSnapshot?.() || null,
            });
            overlay.active = false;
            runtime.showMainMenu();
        });
        this.bindPanelButton(replayBtn, () => {
            AudioMgr.inst.play('button');
            overlay.active = false;
            runtime.restart();
        });
        return overlay;
    }
}

export function ensureGameplayResultPanelController(runtime: any): GameplayResultPanelController {
    if (!runtime._gameplayResultPanelController) {
        runtime._gameplayResultPanelController = new GameplayResultPanelController(runtime);
    }
    return runtime._gameplayResultPanelController as GameplayResultPanelController;
}
