import {
    AnalyticsMgr,
    AudioMgr,
    BlockInputEvents,
    Button,
    Bundle,
    Component,
    Color,
    EventTouch,
    Graphics,
    Label,
    Node,
    PerformanceMgr,
    Prefab,
    ProgressBar,
    Rect,
    Size,
    Sprite,
    SpriteFrame,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    assetManager,
    ccclass,
    GAME_ASSETS_BUNDLE_NAME,
    LOCAL_BOOTSTRAP_BUNDLE_NAME,
    instantiate,
    sys,
    tween,
} from './GameCtrlShared';
import { isMiniGameRuntime } from './MiniGamePlatform';
import { ensurePchConveyorGameplayController } from './PchConveyorGameplayController';

const RESULT_PANEL_PREFAB_PATHS = {
    win: 'UI/Prefabs/Panels/WinPanel',
    revive: 'UI/Prefabs/Panels/RevivePanel',
    bufferFullRevive: 'UI/Prefabs/Panels/BufferFullRevivePanel',
    lose: 'UI/Prefabs/Panels/LosePanel',
} as const;

export type ResultPanelKind = keyof typeof RESULT_PANEL_PREFAB_PATHS;
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
const WIN_CONFETTI_FX_NAME = 'WinConfettiFx';
const WIN_CONFETTI_ATLAS_PATH = 'UI/Images/win_confetti_atlas';
const WIN_CONFETTI_PIECE_COUNT = 48;
const WIN_CONFETTI_BURST_COUNT = 32;
const WIN_CONFETTI_EMISSION_SECONDS = 0.35;
const WIN_CONFETTI_RAIN_START_SECONDS = 1.05;
const WIN_CONFETTI_RAIN_INTERVAL_MIN = 0.22;
const WIN_CONFETTI_RAIN_INTERVAL_RANGE = 0.12;
const WIN_CONFETTI_HORIZONTAL_COVERAGE = 0.9;
const WIN_CONFETTI_LANE_COUNT = 12;
const WIN_CONFETTI_COLORS = ['#FF5B68', '#FFD34E', '#43C6F1', '#66D36E', '#A878F5', '#FF8E45'];
const WIN_CONFETTI_SHAPES = [
    { x: 0, y: 0, width: 42, height: 128, minWidth: 22, widthRange: 8, minHeight: 32, heightRange: 10 },
    { x: 42, y: 0, width: 42, height: 128, minWidth: 19, widthRange: 7, minHeight: 54, heightRange: 18 },
    { x: 84, y: 0, width: 44, height: 128, minWidth: 30, widthRange: 8, minHeight: 78, heightRange: 20 },
] as const;
const REVIVE_SHARE_STATE_KEY = 'pdd.revive.shareState.v1';
const REVIVE_SHARE_DAILY_LIMIT = 1;
const REVIVE_SHARE_MIN_LOGICAL_LEVEL = 4;
const REVIVE_HOLD_TO_PEEK_HINT_NAME = 'HoldToPeekHint';
const REVIVE_HOLD_TO_PEEK_DURATION_SECONDS = 0.18;
const REVIVE_HOLD_TO_PEEK_INTERACTIVE_NODE_NAMES = new Set(['ContinueBtn', 'ShareBtn', 'CloseBtn', 'GiveUpBtn']);

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

type ReviveHoldPeekBox = Node & {
    __reviveHoldToPeekReset?: () => void;
};

type WinBannerSparkleSpec = {
    xRatio: number;
    yRatio: number;
    size: number;
    delay: number;
};

type WinConfettiParticle = {
    node: Node;
    sprite: Sprite;
    color: Color;
    red: number;
    green: number;
    blue: number;
    delay: number;
    age: number;
    life: number;
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    decay: number;
    gravity: number;
    launchGravity: number;
    apexY: number;
    maxFallSpeed: number;
    drift: number;
    sway: number;
    wobble: number;
    wobbleSpeed: number;
    tilt: number;
    tiltSpeed: number;
    spin: number;
    phase: 'launch' | 'fall';
    emitted: boolean;
    complete: boolean;
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

@ccclass('WinConfettiFx')
class WinConfettiFx extends Component {
    private particles: WinConfettiParticle[] = [];
    private elapsed = 0;
    private viewportWidth = 0;
    private viewportHeight = 0;
    private rainSequence = 0;
    private nextRainAt = WIN_CONFETTI_RAIN_START_SECONDS;

    private sample(index: number, channel: number): number {
        const raw = Math.sin((index + 1) * 12.9898 + channel * 78.233) * 43758.5453;
        return raw - Math.floor(raw);
    }

    private getStratifiedX(sequence: number, channel: number): number {
        const span = this.viewportWidth * WIN_CONFETTI_HORIZONTAL_COVERAGE;
        const laneWidth = span / WIN_CONFETTI_LANE_COUNT;
        const lane = (sequence * 5) % WIN_CONFETTI_LANE_COUNT;
        const jitter = (this.sample(sequence, channel) - 0.5) * laneWidth * 0.55;
        return -span * 0.5 + (lane + 0.5) * laneWidth + jitter;
    }

    private configureRainParticle(particle: WinConfettiParticle, sequence: number): void {
        const sample = (channel: number) => this.sample(sequence, channel);
        particle.delay = 0;
        particle.age = 0;
        particle.life = 6.2 + sample(30) * 1.2;
        particle.x = this.getStratifiedX(sequence, 31);
        particle.y = this.viewportHeight * (0.515 + sample(32) * 0.035);
        particle.velocityX = (sample(33) - 0.5) * 26;
        particle.velocityY = -(70 + sample(34) * 50);
        particle.decay = 0.988 + sample(35) * 0.008;
        particle.gravity = 38 + sample(36) * 32;
        particle.launchGravity = 0;
        particle.apexY = particle.y;
        particle.maxFallSpeed = 205 + sample(37) * 40;
        particle.drift = (sample(38) - 0.5) * 24;
        particle.sway = 24 + sample(39) * 26;
        particle.wobble = sample(40) * Math.PI * 2;
        particle.wobbleSpeed = 2.8 + sample(41) * 2.4;
        particle.tilt = sample(42) * Math.PI * 2;
        particle.tiltSpeed = (sample(43) < 0.5 ? -1 : 1) * (4.2 + sample(44) * 3.2);
        particle.spin = (sample(45) - 0.5) * 150;
        particle.phase = 'fall';
        particle.emitted = true;
        particle.complete = false;
        particle.node.setPosition(particle.x, particle.y, 0);
        particle.node.angle = sample(46) * 180;
        particle.node.active = true;
    }

    play(frames: SpriteFrame[], width: number, height: number): void {
        this.elapsed = 0;
        this.viewportWidth = width;
        this.viewportHeight = height;
        this.rainSequence = 0;
        this.nextRainAt = WIN_CONFETTI_RAIN_START_SECONDS;
        this.particles = [];
        for (let index = 0; index < WIN_CONFETTI_PIECE_COUNT; index += 1) {
            const sample = (channel: number) => this.sample(index, channel);
            const shapeSlot = index % 6;
            const shapeIndex = shapeSlot < 3 ? 0 : shapeSlot < 5 ? 1 : 2;
            const shape = WIN_CONFETTI_SHAPES[shapeIndex];
            const side = index % 2 === 0 ? -1 : 1;
            const piece = new Node(`${WIN_CONFETTI_FX_NAME}-Piece-${index}`);
            piece.layer = this.node.layer;
            this.node.addChild(piece);
            piece.addComponent(UITransform).setContentSize(
                shape.minWidth + sample(1) * shape.widthRange,
                shape.minHeight + sample(2) * shape.heightRange,
            );
            const sprite = piece.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frames[shapeIndex];
            const baseColor = new Color(WIN_CONFETTI_COLORS[index % WIN_CONFETTI_COLORS.length]);
            const x = side * (width * 0.43 + sample(5) * 20);
            const y = -height * (0.31 - sample(6) * 0.07);
            const apexY = height * (0.40 + sample(20) * 0.07);
            const launchGravity = 2100 + sample(21) * 260;
            const apexTime = Math.sqrt(2 * (apexY - y) / launchGravity);
            const targetX = this.getStratifiedX(index, 22);
            piece.setPosition(x, y, 0);
            piece.angle = sample(7) * 180;
            piece.active = false;
            this.particles.push({
                node: piece,
                sprite,
                color: new Color(baseColor),
                red: baseColor.r,
                green: baseColor.g,
                blue: baseColor.b,
                delay: sample(8) * WIN_CONFETTI_EMISSION_SECONDS,
                age: 0,
                life: 5 + sample(9) * 0.45,
                x,
                y,
                velocityX: (targetX - x) / apexTime * (0.95 + sample(4) * 0.1),
                velocityY: Math.sqrt(2 * launchGravity * (apexY - y)),
                decay: 0.965 + sample(10) * 0.012,
                gravity: 560 + sample(11) * 140,
                launchGravity,
                apexY,
                maxFallSpeed: 285 + sample(23) * 75,
                drift: (sample(12) - 0.5) * 42,
                sway: 38 + sample(13) * 52,
                wobble: sample(14) * Math.PI * 2,
                wobbleSpeed: 3.4 + sample(15) * 3.2,
                tilt: sample(16) * Math.PI * 2,
                tiltSpeed: (sample(17) < 0.5 ? -1 : 1) * (5.2 + sample(18) * 4.2),
                spin: (sample(19) - 0.5) * 220,
                phase: 'launch',
                emitted: false,
                complete: index >= WIN_CONFETTI_BURST_COUNT,
            });
        }
    }

    update(deltaTime: number): void {
        if (this.particles.length === 0) return;
        const dt = Math.max(0, Math.min(0.05, deltaTime));
        this.elapsed += dt;
        if (this.elapsed >= this.nextRainAt) {
            const available = this.particles.find((particle) => particle.complete);
            if (available) {
                this.configureRainParticle(available, this.rainSequence);
                this.rainSequence += 1;
                this.nextRainAt = this.elapsed
                    + WIN_CONFETTI_RAIN_INTERVAL_MIN
                    + this.sample(this.rainSequence, 47) * WIN_CONFETTI_RAIN_INTERVAL_RANGE;
            } else {
                this.nextRainAt = this.elapsed + 0.08;
            }
        }
        for (const particle of this.particles) {
            if (particle.complete) continue;
            if (this.elapsed < particle.delay) continue;
            if (!particle.emitted) {
                particle.emitted = true;
                particle.node.active = true;
            }
            particle.age += dt;
            if (particle.age >= particle.life || particle.y < -this.viewportHeight * 0.56) {
                particle.complete = true;
                particle.node.active = false;
                continue;
            }

            particle.wobble += particle.wobbleSpeed * dt;
            particle.tilt += particle.tiltSpeed * dt;
            const launching = particle.phase === 'launch';
            if (launching) {
                particle.velocityY -= particle.launchGravity * dt;
                if (particle.velocityY <= 0) {
                    particle.phase = 'fall';
                    particle.y = particle.apexY;
                    particle.velocityY = -20;
                }
            } else {
                particle.velocityX *= Math.pow(particle.decay, dt * 60);
                particle.velocityY = Math.max(
                    particle.velocityY - particle.gravity * dt,
                    -particle.maxFallSpeed,
                );
            }
            const driftWeight = launching ? 0.2 : 1;
            const swayWeight = launching ? 0.25 : 1;
            particle.x += (
                particle.velocityX
                + particle.drift * driftWeight
                + Math.sin(particle.wobble) * particle.sway * swayWeight
            ) * dt;
            particle.y += particle.velocityY * dt;
            particle.node.setPosition(particle.x, particle.y, 0);
            particle.node.angle += particle.spin * dt;

            const flip = Math.abs(Math.cos(particle.tilt));
            particle.node.setScale(0.16 + flip * 0.84, 1, 1);
            const brightness = 0.72 + flip * 0.28;
            const fadeIn = Math.min(1, particle.age / 0.08);
            const fadeOut = Math.min(1, Math.max(0, (particle.life - particle.age) / 0.55));
            particle.color.set(
                Math.round(particle.red * brightness),
                Math.round(particle.green * brightness),
                Math.round(particle.blue * brightness),
                Math.round(255 * fadeIn * fadeOut),
            );
            particle.sprite.color = particle.color;
        }
    }
}

export class GameplayResultPanelController {

    private prefabLoads = new Map<ResultPanelKind, { loadSeq: number; callbacks: Array<(error?: Error) => void> }>();

    private winConfettiFrames: SpriteFrame[] | null = null;
    private winConfettiFrameCallbacks: Array<(frames: SpriteFrame[] | null) => void> = [];
    private winConfettiFrameLoading = false;
    private winConfettiPlaySeq = 0;

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

    private leaveFailureToHome(overlay: Node): void {
        const runtime = this.runtime;
        if (this.activeReviveFailureSession) {
            this.activeReviveFailureSession.active = false;
        }
        this.activeReviveFailureSession = null;
        this.finalFailureReviveContext = null;
        runtime.cancelRewardedGrantInteraction?.('lose-panel-home');
        runtime.cancelPendingShareReturn?.('lose-panel-home');
        AnalyticsMgr.inst.finalizePendingFailedLevel({
            gameplayStats: runtime._pchConveyorGameplayController?.getAnalyticsSnapshot?.() || null,
        });
        overlay.active = false;
        runtime.showMainMenu();
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
        kinds: readonly ResultPanelKind[],
        isCurrent: () => boolean,
        onDone: () => void,
        onError: (error: Error) => void,
    ): void {
        if (!isCurrent()) {
            return;
        }
        const activeCache = this.getPrefabCache(`loadPrefabs:${sourceLabel}`);
        const missingKinds = kinds.filter((kind) => !activeCache.get(kind));
        let failed = false;
        if (missingKinds.length === 0) {
            onDone();
            return;
        }
        const loadNext = (index: number): void => {
            if (failed || !isCurrent()) return;
            const kind = missingKinds[index];
            if (!kind) {
                onDone();
                return;
            }
            bundle.load(RESULT_PANEL_PREFAB_PATHS[kind], Prefab, (err: Error | null, prefab: Prefab | null) => {
                if (failed || !isCurrent()) return;
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
        kinds: readonly ResultPanelKind[],
        isCurrent: () => boolean,
        onDone: () => void,
        onError: (error: Error) => void,
    ): void {
        if (isMiniGameRuntime()) {
            onError(new Error('[result-panel] bootstrap result prefabs are required in minigame runtime'));
            return;
        }
        this.withGameAssetsBundle((bundle: Bundle | null) => {
            if (!isCurrent()) {
                return;
            }
            if (!bundle) {
                onError(new Error(`[result-panel] failed to load ${GAME_ASSETS_BUNDLE_NAME} bundle for browser preview source prefabs`));
                return;
            }
            this.loadPrefabsFromBundle(bundle, `${GAME_ASSETS_BUNDLE_NAME}-preview-source`, kinds, isCurrent, onDone, onError);
        });
    }

    hasPrefabsReady(kinds: readonly ResultPanelKind[] = RESULT_PANEL_KINDS) {
        const cache = this.getPrefabCache('hasPrefabsReady');
        return kinds.every((kind) => !!cache.get(kind));
    }

    ensurePrefabsReady(
        onDone: () => void,
        onError: (error: Error) => void = (error) => console.error('[result-panel] preload failed:', error),
        kinds: readonly ResultPanelKind[] = RESULT_PANEL_KINDS,
    ) {
        const runtime = this.runtime;
        if (!runtime?.isValid) {
            throw new Error('[result-panel] runtime is invalid before prefab load');
        }
        this.getPrefabCache('ensurePrefabsReady');
        const loadSeq = runtime._gameplayResultPanelPrefabLoadSeq;
        const loadNext = (index: number): void => {
            if (!this.isCurrentPrefabLoad(loadSeq)) return;
            const kind = kinds[index];
            if (!kind) { onDone(); return; }
            this.ensurePrefabReady(kind, () => loadNext(index + 1), onError);
        };
        loadNext(0);
    }

    private ensurePrefabReady(kind: ResultPanelKind, onDone: () => void, onError: (error: Error) => void): void {
        if (this.hasPrefabsReady([kind])) { onDone(); return; }
        const loadSeq = this.runtime._gameplayResultPanelPrefabLoadSeq;
        const callback = (error?: Error) => error ? onError(error) : onDone();
        const pending = this.prefabLoads.get(kind);
        if (pending && pending.loadSeq === loadSeq) {
            pending.callbacks.push(callback);
            return;
        }
        const request = { loadSeq, callbacks: [callback] };
        this.prefabLoads.set(kind, request);
        const isRequestCurrent = () => this.isCurrentPrefabLoad(loadSeq) && this.prefabLoads.get(kind) === request;
        let attempts = 0;
        const startAttempt = () => {
            attempts += 1;
            let settled = false;
            const isCurrent = () => !settled && isRequestCurrent();
            let timeout: ReturnType<typeof setTimeout>;
            const complete = (error?: Error) => {
                if (!isCurrent()) return;
                settled = true;
                clearTimeout(timeout);
                if (error && attempts < 2) {
                    startAttempt();
                    return;
                }
                this.prefabLoads.delete(kind);
                for (const notify of request.callbacks) {
                    if (!this.isCurrentPrefabLoad(loadSeq)) break;
                    try { notify(error); } catch (callbackError) {
                        console.error('[result-panel] completion callback failed:', callbackError);
                    }
                }
            };
            timeout = setTimeout(() => {
                if (!isRequestCurrent()) {
                    if (this.prefabLoads.get(kind) === request) this.prefabLoads.delete(kind);
                    return;
                }
                complete(new Error(`[result-panel] prefab load timed out: ${kind}`));
            }, 5000);
            const fail = (error: Error) => complete(error);
            const flushCallbacks = () => complete();
            const failBootstrapOrLoadPreviewSource = (error: Error) => {
                if (!isCurrent()) return;
                if (isMiniGameRuntime()) fail(error);
                else this.loadBrowserPreviewSourcePrefabs([kind], isCurrent, flushCallbacks, fail);
            };
            try {
                this.withBootstrapBundle((bundle: Bundle | null) => {
                    if (!isCurrent()) return;
                    if (!bundle) {
                        failBootstrapOrLoadPreviewSource(new Error(`[result-panel] failed to load ${LOCAL_BOOTSTRAP_BUNDLE_NAME} bundle`));
                        return;
                    }
                    this.loadPrefabsFromBundle(bundle, LOCAL_BOOTSTRAP_BUNDLE_NAME, [kind], isCurrent, flushCallbacks, failBootstrapOrLoadPreviewSource);
                });
            } catch (error) {
                fail(error instanceof Error ? error : new Error(String(error)));
            }
        };
        startAttempt();
    }

    showBasicSettlement(kind: 'win' | 'timeout' | 'buffer-full' | 'lose'): Node {
        const runtime = this.runtime;
        const popupRoot = runtime.requireCanvasUiRoot('PopupRoot');
        const field = kind === 'win' ? 'panelWin' : kind === 'lose' ? 'panelLose'
            : kind === 'timeout' ? 'panelTimeoutContinue' : 'panelBufferFullContinue';
        const makeNode = (name: string, parent: Node, width: number, height: number, y = 0) => {
            const node = new Node(name);
            parent.addChild(node);
            node.layer = parent.layer;
            node.addComponent(UITransform).setContentSize(width, height);
            node.setPosition(0, y, 0);
            return node;
        };
        const size = popupRoot.getComponent(UITransform)!.contentSize;
        const overlay = makeNode(`BasicSettlement-${kind}`, popupRoot, size.width, size.height);
        overlay.setSiblingIndex(999);
        (overlay as any).__basicSettlement = true;
        overlay.addComponent(BlockInputEvents);
        const mask = overlay.addComponent(Graphics);
        mask.fillColor = new Color(25, 20, 40, 180);
        mask.rect(-size.width / 2, -size.height / 2, size.width, size.height);
        mask.fill();
        const box = makeNode('Box', overlay, 540, 660);
        const background = box.addComponent(Graphics);
        background.fillColor = new Color('#FFF4DC');
        background.roundRect(-270, -330, 540, 660, 28);
        background.fill();
        const label = (parent: Node, name: string, text: string, y: number) => {
            const node = makeNode(name, parent, 470, 64, y);
            const component = node.addComponent(Label);
            component.string = text;
            component.fontSize = 30;
            component.color = new Color('#392D57');
            component.horizontalAlign = Label.HorizontalAlign.CENTER;
            component.verticalAlign = Label.VerticalAlign.CENTER;
            return node;
        };
        label(box, 'Title', kind === 'win' ? '挑战成功' : kind === 'buffer-full' ? '暂存槽已满' : kind === 'timeout' ? '时间到' : '再试一次', 250);
        const summary = label(box, 'Label', '', 185);
        label(summary, 'Label', '', 0);
        const initSeq = runtime._gameplayInitSeq;
        const button = (name: string, text: string, y: number, handler: () => void, labelName = 'Label') => {
            const node = makeNode(name, box, 430, 70, y);
            const graphics = node.addComponent(Graphics);
            graphics.fillColor = new Color('#F6C871');
            graphics.roundRect(-215, -35, 430, 70, 18);
            graphics.fill();
            label(node, labelName, text, 0);
            node.addComponent(Button);
            this.bindPanelButton(node, () => {
                if (!overlay.isValid || !overlay.activeInHierarchy || !runtime.isGameEnd || initSeq !== runtime._gameplayInitSeq) return;
                handler();
            });
            return node;
        };
        if (kind === 'win') {
            label(box, 'RewardGoldLbl', '', 125);
            button('PrimaryBtn', '继续', 20, () => runtime.handleWinSettlementPrimaryAction());
            button('AdBonusBtn', '看广告加领奖励', -80, () => runtime.claimWinAdBonusReward(), 'AdBonusBtnLbl');
            label(box.getChildByName('AdBonusBtn')!, 'AdBonusClaimedLbl', '已领取', 0).active = false;
            button('CollectionBtn', '收藏', -180, () => runtime.openCollection());
        } else {
            const reviveKind = kind === 'lose' ? this.resolveFinalFailureReviveKind() : kind;
            button('ContinueBtn', '看广告复活', 60, () => reviveKind === 'buffer-full'
                ? this.runBufferFullReviveAction(overlay) : this.runLevelReviveAction(overlay, runtime.constructor.REWARDED_CONTINUE_SECONDS));
            const share = button('ShareBtn', '分享复活', -30, () => this.runReviveShareAction(reviveKind, overlay, runtime.constructor.REWARDED_CONTINUE_SECONDS));
            share.active = kind !== 'lose' && this.canUseReviveShare();
            if (kind === 'lose') {
                button('ReplayBtn', '重新挑战', -130, () => runtime.restart());
                button('HomeBtn', '返回主页', -230, () => this.leaveFailureToHome(overlay));
            } else {
                button('GiveUpBtn', '暂不复活', -150, () => this.closeReviveFailureSession(kind, overlay));
            }
        }
        const previous = runtime[field] as Node | null;
        if (previous?.isValid) { previous.removeFromParent(); previous.destroy(); }
        runtime[field] = overlay;
        for (const panel of [runtime.panelWin, runtime.panelLose, runtime.panelTimeoutContinue, runtime.panelBufferFullContinue]) {
            if (panel?.isValid && panel !== overlay) panel.active = false;
        }
        if (kind === 'win') runtime.updateWinRewardLabel(
            runtime._pendingWinGoldReward + (runtime._winAdRewardClaimed ? runtime._pendingWinAdBonusReward : 0),
        );
        else {
            const stats = runtime.getBoardCompletionStats();
            runtime.syncSettlementProgressWidget(overlay, {
                completePercent: Math.min(98, Math.max(0, Math.floor(Number(stats.completePercent) || 0))),
            });
            if (kind !== 'lose') this.syncReviveSharePanel(overlay);
        }
        return overlay;
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

    private syncResultProgressWidget(panel: Node, ratio: number = 0, allowStaticSummary: boolean = false): void {
        const runtime = this.runtime;
        const box = runtime.requirePanelChild(panel, 'Box');
        const progressRoot = box.getChildByName('\u8fdb\u5ea6\u6761');
        const completionSummary = box.getChildByName('CompletionSummary') ?? box.getChildByName('Label');
        const hasTextCompletionSummary = allowStaticSummary && !!(
            completionSummary?.getComponent(Label)
            || completionSummary?.getChildByName('CompletionPercent')?.getComponent(Label)
        );
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
        return this.runtime.requirePanelChild(box, 'TopGroup').children.find((child) => {
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
        const light = this.runtime.requirePanelChild(box, 'TopGroup').getChildByName(WIN_BANNER_LIGHT_NODE_NAME);
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

    private clearWinConfettiFx(panel: Node): void {
        const layer = panel.getChildByName(WIN_CONFETTI_FX_NAME);
        if (!layer?.isValid) return;
        layer.active = false;
        layer.removeFromParent();
        layer.destroy();
    }

    private createWinConfettiFrames(atlasFrame: SpriteFrame): SpriteFrame[] {
        return WIN_CONFETTI_SHAPES.map((shape, index) => {
            const frame = new SpriteFrame();
            frame.name = `win_confetti_shape_${index}`;
            frame.texture = atlasFrame.texture;
            frame.rect = new Rect(shape.x, shape.y, shape.width, shape.height);
            frame.originalSize = new Size(shape.width, shape.height);
            return frame;
        });
    }

    private finishWinConfettiFrameLoad(frames: SpriteFrame[] | null): void {
        this.winConfettiFrameLoading = false;
        this.winConfettiFrames = frames;
        const callbacks = this.winConfettiFrameCallbacks;
        this.winConfettiFrameCallbacks = [];
        for (const callback of callbacks) callback(frames);
    }

    private loadWinConfettiFrames(callback: (frames: SpriteFrame[] | null) => void): void {
        if (this.winConfettiFrames?.every((frame) => frame.isValid)) {
            callback(this.winConfettiFrames);
            return;
        }
        this.winConfettiFrameCallbacks.push(callback);
        if (this.winConfettiFrameLoading) return;
        this.winConfettiFrameLoading = true;
        this.withGameAssetsBundle((bundle: Bundle | null) => {
            if (!bundle) {
                console.error('[WinConfettiFx] gameAssets bundle unavailable');
                this.finishWinConfettiFrameLoad(null);
                return;
            }
            const candidates = [`${WIN_CONFETTI_ATLAS_PATH}/spriteFrame`, WIN_CONFETTI_ATLAS_PATH];
            const tryCandidate = (index: number) => {
                if (index >= candidates.length) {
                    console.error(`[WinConfettiFx] missing SpriteFrame: ${WIN_CONFETTI_ATLAS_PATH}`);
                    this.finishWinConfettiFrameLoad(null);
                    return;
                }
                bundle.load(candidates[index], SpriteFrame, (error: Error | null, atlasFrame: SpriteFrame | null) => {
                    if (!error && atlasFrame) {
                        this.finishWinConfettiFrameLoad(this.createWinConfettiFrames(atlasFrame));
                        return;
                    }
                    tryCandidate(index + 1);
                });
            };
            tryCandidate(0);
        });
    }

    private playWinConfettiFx(panel: Node): void {
        const playSeq = (this.winConfettiPlaySeq += 1);
        this.clearWinConfettiFx(panel);
        this.loadWinConfettiFrames((frames) => {
            if (!frames || playSeq !== this.winConfettiPlaySeq || !panel.isValid || !panel.activeInHierarchy) return;
            const panelTransform = panel.getComponent(UITransform);
            if (!panelTransform || panelTransform.width <= 0 || panelTransform.height <= 0) return;
            const layer = this.createWinBannerFxNode(
                panel,
                WIN_CONFETTI_FX_NAME,
                panelTransform.width,
                panelTransform.height,
            );
            layer.setPosition(0, 0, 0);
            const topHud = panel.getChildByName('SettlementTopHud');
            if (topHud) layer.setSiblingIndex(topHud.getSiblingIndex());
            layer.addComponent(WinConfettiFx).play(frames, panelTransform.width, panelTransform.height);
        });
    }

    playWinSettlementBannerFx(panel?: Node | null): void {
        PerformanceMgr.inst.markUserActivity(8000);
        const targetPanel = panel ?? this.runtime?.panelWin ?? null;
        const box = targetPanel?.getChildByName('Box') ?? null;
        if (!box) return;
        this.playWinConfettiFx(targetPanel!);
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
        const middleGroup = runtime.requirePanelChild(box, 'MiddleGroup');
        const bottomGroup = runtime.requirePanelChild(box, 'BottomGroup');
        const previewFrame = runtime.requirePanelChild(middleGroup, 'PreviewFrame');
        runtime.requirePanelChild(previewFrame, 'PatternPreview');
        const adBonusBtn = runtime.requirePanelChild(bottomGroup, 'AdBonusBtn');
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
        const primaryBtn = runtime.requirePanelChild(bottomGroup, 'PrimaryBtn');
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

    private bindReviveHoldToPeek(overlay: Node, box: Node): void {
        const state = box as ReviveHoldPeekBox;
        if (state.__reviveHoldToPeekReset) {
            state.__reviveHoldToPeekReset();
            return;
        }
        if (!box.getChildByName(REVIVE_HOLD_TO_PEEK_HINT_NAME)?.getComponent(Label)) {
            throw new Error(`[result-panel] revive prefab is missing ${REVIVE_HOLD_TO_PEEK_HINT_NAME}`);
        }
        const shade = overlay.getChildByName('Shade');
        if (!shade) {
            throw new Error('[result-panel] revive prefab is missing Shade');
        }
        const boxOpacity = box.getComponent(UIOpacity) || box.addComponent(UIOpacity);
        const shadeOpacity = shade.getComponent(UIOpacity) || shade.addComponent(UIOpacity);
        let peeking = false;

        const setOpacity = (opacity: number, immediate: boolean): void => {
            Tween.stopAllByTarget(boxOpacity);
            Tween.stopAllByTarget(shadeOpacity);
            if (immediate) {
                boxOpacity.opacity = opacity;
                shadeOpacity.opacity = opacity;
                return;
            }
            tween(boxOpacity).to(REVIVE_HOLD_TO_PEEK_DURATION_SECONDS, { opacity }).start();
            tween(shadeOpacity).to(REVIVE_HOLD_TO_PEEK_DURATION_SECONDS, { opacity }).start();
        };
        const restore = (immediate: boolean = false): void => {
            peeking = false;
            setOpacity(255, immediate);
        };
        const isInteractiveTarget = (target: Node | null): boolean => {
            for (let current = target; current && current !== box; current = current.parent) {
                if (REVIVE_HOLD_TO_PEEK_INTERACTIVE_NODE_NAMES.has(current.name)) return true;
            }
            return false;
        };
        const onTouchStart = (event: EventTouch): void => {
            if (!overlay.activeInHierarchy || isInteractiveTarget(event.target as Node | null)) return;
            event.propagationStopped = true;
            if (peeking) return;
            peeking = true;
            setOpacity(0, false);
        };
        const onTouchEndOrCancel = (event: EventTouch): void => {
            if (!peeking) return;
            event.propagationStopped = true;
            restore();
        };

        state.__reviveHoldToPeekReset = () => restore(true);
        state.__reviveHoldToPeekReset();
        overlay.on(Node.EventType.TOUCH_START, onTouchStart, this, true);
        overlay.on(Node.EventType.TOUCH_END, onTouchEndOrCancel, this, true);
        overlay.on(Node.EventType.TOUCH_CANCEL, onTouchEndOrCancel, this, true);
    }

    resetReviveHoldToPeek(overlay: Node | null | undefined): void {
        const box = overlay?.getChildByName('Box') as ReviveHoldPeekBox | null | undefined;
        box?.__reviveHoldToPeekReset?.();
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
        this.syncResultProgressWidget(overlay, 0, true);
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
        this.bindReviveHoldToPeek(overlay, box);
        return overlay;
    }

    createBufferFullSettlementPanel(): Node {
        const runtime = this.runtime;
        const overlay = this.instantiateGameplayOverlay('bufferFullRevive', 'BufferFullSettlementOverlay');
        const box = runtime.requirePanelChild(overlay, 'Box');
        if (!box.getComponent(BlockInputEvents)) {
            box.addComponent(BlockInputEvents);
        }
        this.syncResultProgressWidget(overlay, 0, true);

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
        this.bindReviveHoldToPeek(overlay, box);
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
        this.syncResultProgressWidget(overlay, 0, true);
        const reviveBtn = runtime.requirePanelChild(box, '\u590d\u6d3b\u7a97\u7ec4\u4ef63');
        const homeBtn = runtime.requirePanelChild(box, 'HomeBtn');
        const replayBtn = runtime.requirePanelChild(box, '\u7eff\u8272\u6309\u952e\u5e95\u6846-001');
        this.bindLoseReviveContinueAction(reviveBtn, overlay);
        this.bindPanelButton(homeBtn, () => {
            AudioMgr.inst.play('button');
            this.leaveFailureToHome(overlay);
        });
        this.bindPanelButton(replayBtn, () => {
            AudioMgr.inst.play('button');
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
