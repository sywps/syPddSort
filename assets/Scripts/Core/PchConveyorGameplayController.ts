import {
    Animation,
    AudioMgr,
    Button,
    Color,
    Graphics,
    Label,
    Layers,
    Mask,
    Node,
    NodePool,
    ProgressBar,
    Sprite,
    Tween,
    UITransform,
    UIOpacity,
    Vec2,
    Vec3,
    Widget,
    instantiate,
    tween,
} from './GameCtrlShared';
import {
    buildOpeningPatternMoves,
    getOpeningPatternStaggerDelay,
    type OpeningPatternMove,
} from './OpeningPatternTransition';
import {
    PchConveyorRules,
    type PchSkillBeanSource,
    type PchSkillResult,
} from './PchConveyorRules';
import { AppRoot } from './AppRoot';
import {
    AnalyticsMgr,
    PCH_GAMEPLAY_MODE,
    PCH_GAMEPLAY_SCHEMA_VERSION,
    type PchGameplayAnalyticsSnapshot,
} from './AnalyticsMgr';
import type { PchSpeedMultiplier } from './AppSession';

const BELT_STEP_SECONDS = 0.25;
const PCH_TRANSFER_SECONDS = 0.16;
const PCH_ENTRY_STAGGER_SECONDS = 0.012;
const PCH_RETURN_TRANSFER_SECONDS = 0.3;
const PCH_RETURN_STAGGER_SECONDS = 0.05;
const PCH_RETURN_COMPLETE_DELAY_SECONDS = 0.01;
const PCH_RETURN_SETTLE_FX_DURATION_SECONDS = 0.7;
const PCH_RETURN_COLOR_COMPLETE_DELAY_SECONDS = Math.max(
    0,
    PCH_RETURN_SETTLE_FX_DURATION_SECONDS - PCH_RETURN_COMPLETE_DELAY_SECONDS,
);
const PCH_SKILL_STAGGER_SECONDS = 0.028;
const PCH_SKILL_TRANSFER_SECONDS = 0.2;
const PCH_SETTLED_PIXEL_BLOCK_EXPERIMENT = true;
const PCH_EXPAND_CAPACITY = 12;
const OPENING_GUIDE_WRONG_TAP_TOAST_COOLDOWN_MS = 1500;
const PCH_CAPACITY_FULL_WARNING_CLIP = 'PchCapacityFullWarning';
const PCH_RED_WARNING_EMPTY_SLOT_THRESHOLD = 3;
const PCH_RED_WARNING_PULSE_SECONDS = 0.5;
const PCH_RED_WARNING_MAX_OPACITY = 102;
const PCH_CAPACITY_TEXT_COLOR = new Color(43, 43, 43, 255);
const PCH_CAPACITY_OUTLINE_COLOR = new Color(255, 221, 35, 255);
const PCH_ENTRANCE_SNAP_PROGRESS = 0.032;
const PCH_ENTRY_PICKUP_LEAD_STEP_RATIO = 0.2;
const PCH_ENTRY_DOOR_OPEN_WIDTH = 0;
const PCH_ENTRY_DOOR_CLOSED_WIDTH = 35;
const PCH_ENTRY_DOOR_HEIGHT = 68;
const PCH_ENTRY_DOOR_TWEEN_SECONDS = 0.3;
const PCH_EXIT_ARROW_CYCLE_SECONDS = 68 / 60;
const PCH_EXIT_ARROW_PHASE_OFFSET_SECONDS = 34 / 60;
const PCH_EXIT_ARROW_FADE_IN_SECONDS = 16 / 60;
const PCH_EXIT_ARROW_FADE_OUT_START_SECONDS = 34 / 60;
const PCH_EXIT_ARROW_MOVE_SECONDS = 1;
const PCH_EXIT_ARROW_START_Y = -11.8;
const PCH_EXIT_ARROW_END_Y = 38;
const PCH_STACK_BEAN_SIZE = 33;
const PCH_STACK_LAYER_OFFSET = 8;
const PCH_STACK_LOWER_ALPHA = 184;
const RAINBOW_CONVEYOR_SOURCE_SCALE = 0.6;
const OPENING_PATTERN_HOLD_SECONDS = 0.26;
const OPENING_PATTERN_MOVE_SECONDS = 0.54;
const ORIGINAL_SPHERE_VISUAL_WIDTH = 0.55 * 0.22619998455047607;
const SPHERE_FLY_STAR_MIN_SIZE_RATIO = 0.1 / ORIGINAL_SPHERE_VISUAL_WIDTH;
const SPHERE_FLY_STAR_MAX_SIZE_RATIO = 0.2 / ORIGINAL_SPHERE_VISUAL_WIDTH;
const SPHERE_FLY_STAR_RING_RADIUS_RATIO = 0.15 / ORIGINAL_SPHERE_VISUAL_WIDTH;
const SPHERE_FLY_STAR_EMISSION_SPACING_RATIO = 0.25 / ORIGINAL_SPHERE_VISUAL_WIDTH;
const SPHERE_FLY_TRAIL_WIDTH_RATIO = 0.3 / ORIGINAL_SPHERE_VISUAL_WIDTH;
const SPHERE_FLY_TRAIL_WIDTH_OVER_TRAIL = 0.8;
const SPHERE_FLY_STAR_MIN_LIFETIME_SECONDS = 0.1;
const SPHERE_FLY_STAR_MAX_LIFETIME_SECONDS = 0.3;
const SPHERE_FLY_STAR_SIZE_PEAK_TIME = 0.17615890502929688;
const SPHERE_FLY_TRAIL_LIFETIME_SECONDS = 1;
const SPHERE_FLY_TRAIL_HEAD_ANCHOR_X = 0.25;
const SPHERE_FLY_TRAIL_ALPHA_MID_TIME = 26719 / 65535;
const SPHERE_FLY_TRAIL_ALPHA_MID_VALUE = 0.37266355752944946;
const SPHERE_FLY_TRAIL_SEGMENT_COUNT = 4;
const SPHERE_FLY_MAX_STARS_PER_EFFECT = 60;
const MAX_POOLED_SPHERE_FLY_EFFECTS = 24;
const MAX_POOLED_SPHERE_FLY_STARS = 240;
const SPHERE_FLY_TRAIL_COLOR = new Color(255, 238, 161, 255);

type RainbowConveyorTableType = 2 | 3;
type PchBoardTapOutcome = 'inactive' | 'invalid' | 'capacity_blocked' | 'partial' | 'stored';

type PchOpeningGuideAnalyticsMeta = {
    guideId: string;
    stepId: number;
    stepName: string;
};

const RAINBOW_CONVEYOR_PATHS: Record<
    RainbowConveyorTableType,
    ReadonlyArray<readonly [number, number]>
> = {
    2: [
        [-219, -99], [390, -96], [390, 104.2], [152, 104.2], [-396, 104.2], [-390, -92],
    ],
    3: [
        [-327, -159], [447, -162], [447, 161], [263, 161], [264, 50],
        [163, 50], [-279, 47], [-279, 166.3], [-452, 166.3], [-452, -159],
    ],
};
const RAINBOW_CONVEYOR_EXIT_POINT_INDEX: Record<RainbowConveyorTableType, number> = { 2: 3, 3: 5 };
const RAINBOW_CONVEYOR_TRACK_PARTS: Record<'NormalLayout' | 'CompactLayout', readonly string[]> = {
    NormalLayout: [
        'BottomStraight', 'BottomLeftCorner', 'TopLeftCorner', 'LeftSide',
        'BottomRightCorner', 'TopRightCorner', 'RightSide', 'TopStraight',
    ],
    CompactLayout: [
        'BottomStraight', 'BottomLeftCorner', 'LeftSide', 'TopLeftOuterCorner',
        'TopLeftStraight', 'TopLeftInnerCorner', 'MiddleLeftInnerCorner', 'MiddleStraight',
        'MiddleRightInnerCorner', 'TopRightInnerCorner', 'TopRightStraight',
        'TopRightOuterCorner', 'RightSide', 'BottomRightCorner',
    ],
};

interface OpeningPatternVisual {
    move: OpeningPatternMove;
    node: Node;
    homePosition: Vec3;
    targetPosition: Vec3;
}

interface PchReturnColorEffectBatch {
    colorId: number;
    targets: Array<{ row: number; col: number }>;
    pendingSettleFxCount: number;
}

interface SphereFlyStarParticle {
    node: Node;
    ageSeconds: number;
    lifetimeSeconds: number;
}

interface SphereFlyTrailSegment {
    node: Node;
    transform: UITransform;
    opacity: UIOpacity;
}

interface SphereFlyEffectInstance {
    node: Node;
    bean: Node;
    trail: Node;
    trailSegments: SphereFlyTrailSegment[];
    beanSize: number;
    delayRemainingSeconds: number;
    activeAgeSeconds: number;
    previousEmitterPosition: Vec3;
    currentEmitterPosition: Vec3;
    trailOrigin: Vec3;
    distanceSinceLastStar: number;
    emittedStarCount: number;
    stars: SphereFlyStarParticle[];
}

interface ConveyorExitArrowGroupBindings {
    position: Node;
    authoredPosition: Vec3;
    phaseOffsetSeconds: number;
    opacities: UIOpacity[];
}

interface ConveyorLayoutBindings {
    node: Node;
    carrierLayer: Node;
    carrierTemplate: Node;
    authoredCarrierNodes: Node[];
    entryFlyAnchor: Node;
    entryQueueLayer: Node;
    entryBeanTemplate: Node;
    entrancePulseNode: Node;
    exitNode: Node;
    exitArrowGroups: ConveyorExitArrowGroupBindings[];
    capacityBadge: Node;
    capacityProgress: ProgressBar;
    countLabel: Label;
    capacityWarningAnimation: Animation;
    entryDoors: ConveyorEntryDoorBindings;
    adButton: Node;
}

interface ConveyorEntryDoorBindings {
    left: UITransform;
    right: UITransform;
}

export class PchConveyorGameplayController {
    private root: Node | null = null;
    private belt: Node | null = null;
    private normalLayout: Node | null = null;
    private compactLayout: Node | null = null;
    private carrierLayer: Node | null = null;
    private carrierTemplate: Node | null = null;
    private inputRoot: Node | null = null;
    private statusLabel: Label | null = null;
    private countLabel: Label | null = null;
    private capacityBadge: Node | null = null;
    private capacityProgress: ProgressBar | null = null;
    private capacityWarningAnimation: Animation | null = null;
    private capacityWarningActive = false;
    private warningOverlay: Node | null = null;
    private warningOverlayOpacity: UIOpacity | null = null;
    private warningPulseGeneration = 0;
    private normalEntryDoors: ConveyorEntryDoorBindings | null = null;
    private activeEntryDoors: ConveyorEntryDoorBindings | null = null;
    private entryDoorState: 'none' | 'open' | 'closed' = 'none';
    private entryDoorTween: Tween<{ width: number }> | null = null;
    private entryFlyAnchor: Node | null = null;
    private entryQueueLayer: Node | null = null;
    private entryBeanTemplate: Node | null = null;
    private entrancePulseNode: Node | null = null;
    private exitNode: Node | null = null;
    private exitArrowGroups: ConveyorExitArrowGroupBindings[] = [];
    private exitArrowElapsedSeconds = 0;
    private adButton: Node | null = null;
    private speedButton: Node | null = null;
    private speedInactiveState: Node | null = null;
    private speedActiveState: Node | null = null;
    private speedBadgeLabel: Label | null = null;
    private openingGuide: Node | null = null;
    private openingGuideTarget: Node | null = null;
    private openingGuideLevelOneCells: Array<{ row: number; col: number }> = [];
    private openingGuideLevelOneStep = -1;
    private openingGuideWrongTapToastLastShownAt = 0;
    private rules: PchConveyorRules | null = null;
    private carrierNodes: Node[] = [];
    private carrierDirectionNodes: Node[] = [];
    private readonly beltSamplePosition = new Vec3();
    private activeFlyBeans = new Set<Node>();
    private readonly sphereFlyEffectPool = new NodePool();
    private readonly sphereFlyStarPool = new NodePool();
    private readonly activeSphereFlyEffects = new Map<Node, SphereFlyEffectInstance>();
    private activePulseNodes = new Set<Node>();
    private activeReturnAnimations = 0;
    private readonly activeReturnBeans = new Set<Node>();
    private readonly pendingReturnCompletions = new Map<Node, () => void>();
    private readonly pendingPchReturnColorSettles = new Set<() => void>();
    private readonly queuedPchColorCompleteBatches: PchReturnColorEffectBatch[] = [];
    private pchColorCompleteEffectActive = false;
    private pchColorCompleteSequenceGeneration = 0;
    private readonly lastEntranceAudioVisitByCarrier = new Map<number, number>();
    private beltPath: Vec3[] = [];
    private beltPathDistances: number[] = [];
    private beltPathLength = 0;
    private exitPathProgress = 0;
    private beltTravel = 0;
    private manualSpeedMultiplier: PchSpeedMultiplier = 1;
    private beforeWinSpeedActive = false;
    private finishCommitted = false;
    private settlementPaused = false;
    private inputLocked = false;
    private skillMovementPaused = false;
    private skillTimerPauseToken = '';
    private openingPatternVisuals: OpeningPatternVisual[] = [];
    private openingPatternState: 'idle' | 'ready' | 'running' | 'done' = 'idle';
    private openingPatternGeneration = 0;
    private analyticsStats: PchGameplayAnalyticsSnapshot | null = null;
    private firstStoreEventSent = false;
    private firstReturnEventSent = false;

    constructor(private readonly runtime: any) {}

    private resetAnalyticsStats(): void {
        if (!this.rules) {
            this.analyticsStats = null;
            return;
        }
        this.analyticsStats = {
            magnetUses: 0,
            brushUses: 0,
            freezeUses: 0,
        };
        this.firstStoreEventSent = false;
        this.firstReturnEventSent = false;
    }

    private trackPchFunnelEvent(
        eventName: string,
        options: {
            stepId?: number;
            stepName?: string;
            source?: string;
            success?: boolean;
            errorCode?: string;
            extra?: Record<string, unknown>;
        } = {},
    ): void {
        const logicalLevelId = Math.max(0, Math.floor(Number(this.runtime.getActiveLogicalLevelId?.()) || 0));
        if (logicalLevelId < 1 || logicalLevelId > 3) return;
        AnalyticsMgr.inst.trackFunnelEvent({
            eventName,
            levelId: this.runtime.getAnalyticsLevelId?.() || this.runtime.getActiveLogicalLevelId?.() || 0,
            logicalLevelId,
            physicalLevelId: this.runtime.getActivePhysicalLevelId?.() || 0,
            page: this.runtime.getAnalyticsPage?.() || 'game',
            stepId: options.stepId,
            stepName: options.stepName,
            source: options.source || 'pch_conveyor',
            success: options.success === true,
            errorCode: options.errorCode || '',
            gameplayMode: PCH_GAMEPLAY_MODE,
            gameplaySchemaVersion: PCH_GAMEPLAY_SCHEMA_VERSION,
            extra: options.extra,
        });
    }

    private getOpeningGuideAnalyticsMeta(guideName: string = this.openingGuide?.name || ''): PchOpeningGuideAnalyticsMeta | null {
        if (guideName.startsWith('PchLevelOneGuideStep')) {
            const stepId = Math.max(1, this.openingGuideLevelOneStep + 1);
            return {
                guideId: 'pch_level_1_store_v1',
                stepId,
                stepName: `store_color_${stepId}`,
            };
        }
        if (guideName === 'PchLevelTwoSpeedGuide') {
            return { guideId: 'pch_level_2_speed_v1', stepId: 1, stepName: 'enable_2x' };
        }
        if (guideName === 'PchLevelThreeCapacityGuide') {
            return { guideId: 'pch_level_3_capacity_v1', stepId: 1, stepName: 'expand_capacity_free' };
        }
        return null;
    }

    private trackOpeningGuideEvent(
        eventName: 'pch_guide_step_shown' | 'pch_guide_tap_result' | 'pch_guide_step_done',
        success: boolean,
        result: string,
        guideName?: string,
    ): void {
        const meta = this.getOpeningGuideAnalyticsMeta(guideName);
        if (!meta) return;
        this.trackPchFunnelEvent(eventName, {
            stepId: meta.stepId,
            stepName: meta.stepName,
            source: 'pch_opening_guide',
            success,
            errorCode: success ? '' : result,
            extra: {
                guideId: meta.guideId,
                result,
            },
        });
    }

    start(): void {
        this.stop();
        this.manualSpeedMultiplier = AppRoot.tryGet()?.session.pchSpeedMultiplier ?? 1;
        if (!this.runtime.boardModel
            || typeof this.runtime.renderBoard !== 'function'
            || typeof this.runtime.renderBoardCells !== 'function') {
            throw new Error('[pch-core] original board renderer is unavailable');
        }
        if (typeof this.runtime.getBeanSpriteFrame !== 'function'
            || typeof this.runtime.requireRenderReadySpriteFrame !== 'function'
            || typeof this.runtime.requireSphereFlyStarSpriteFrame !== 'function'
            || typeof this.runtime.requireSphereFlyTrailSpriteFrame !== 'function'
            || typeof this.runtime.requireWarningMaskSpriteFrame !== 'function'
            || typeof this.runtime.renderBoardCell !== 'function'
            || typeof this.runtime.getBoardCellWorldPosition !== 'function'
            || typeof this.runtime.acquireFlyBeanNode !== 'function'
            || typeof this.runtime.recycleFlyBeanNode !== 'function'
            || typeof this.runtime.markColorCompleteIfNeeded !== 'function'
            || typeof this.runtime.playColorCompleteEffect !== 'function'
            || typeof this.runtime.gameLose !== 'function') {
            throw new Error('[pch-core] original bean sprite or sphere flight effect is unavailable');
        }
        this.runtime.requireSphereFlyStarSpriteFrame();
        this.runtime.requireSphereFlyTrailSpriteFrame();
        this.runtime.requireWarningMaskSpriteFrame();
        this.rules = new PchConveyorRules(
            this.runtime.boardModel,
            this.runtime.levelData?.conveyorCapacity,
            this.runtime.levelData?.singleSelectionLimit,
        );
        this.resetAnalyticsStats();
        this.beltTravel = 0;
        this.inputLocked = true;
        this.activeReturnAnimations = 0;
        this.activeReturnBeans.clear();
        this.pendingReturnCompletions.clear();
        this.clearPchColorCompleteSequence();
        this.beforeWinSpeedActive = false;
        this.finishCommitted = false;
        this.settlementPaused = false;
        this.runtime.detachGameplayInputHandlers?.();

        const fixedRoot = this.runtime.getGameplayFixedRoot();
        this.root = this.requireConveyorNode(fixedRoot, 'PchConveyorRoot', 'GameplayFixedRoot/PchConveyorRoot');
        this.bindWarningOverlay();
        const normalLayout = this.bindConveyorLayout(this.root, 'NormalLayout');
        const compactLayout = {
            node: this.requireConveyorNode(this.root, 'CompactLayout', 'GameplayFixedRoot/PchConveyorRoot/CompactLayout'),
        };
        this.clearConveyorLayoutRuntime(normalLayout.node);
        this.clearConveyorLayoutRuntime(compactLayout.node);
        normalLayout.node.active = true;
        compactLayout.node.active = false;
        const activeLayout = normalLayout;
        this.prepareBeltPath(2);
        this.normalLayout = normalLayout.node;
        this.compactLayout = compactLayout.node;
        this.normalEntryDoors = normalLayout.entryDoors;
        this.activeEntryDoors = activeLayout.entryDoors;
        this.resetTableEntryDoorAnimation();
        this.belt = activeLayout.node;
        this.carrierLayer = activeLayout.carrierLayer;
        this.carrierTemplate = activeLayout.carrierTemplate;
        this.entryFlyAnchor = activeLayout.entryFlyAnchor;
        this.entryQueueLayer = activeLayout.entryQueueLayer;
        this.entryBeanTemplate = activeLayout.entryBeanTemplate;
        this.entrancePulseNode = activeLayout.entrancePulseNode;
        this.exitNode = activeLayout.exitNode;
        this.exitArrowGroups = activeLayout.exitArrowGroups;
        this.capacityBadge = activeLayout.capacityBadge;
        this.capacityProgress = activeLayout.capacityProgress;
        this.countLabel = activeLayout.countLabel;
        this.capacityWarningAnimation = activeLayout.capacityWarningAnimation;
        const hideFirstLevelControls = this.runtime._activeGameplayEntryMode === 'main'
            && Math.floor(Number(this.runtime.levelData?.levelId) || 0) === 1;
        this.adButton = activeLayout.adButton;
        this.adButton.active = !hideFirstLevelControls;
        this.adButton.off(Node.EventType.TOUCH_END, this.onCapacityAdTap, this);
        this.adButton.on(Node.EventType.TOUCH_END, this.onCapacityAdTap, this);
        this.startExitArrowAnimation();
        this.root.active = true;
        this.inputRoot = this.runtime._sceneInputRoot?.isValid ? this.runtime._sceneInputRoot : fixedRoot;
        this.inputRoot.on(Node.EventType.TOUCH_START, this.onRootTouchStart, this);
        this.inputRoot.on(Node.EventType.TOUCH_MOVE, this.onRootTouchMove, this);
        this.inputRoot.on(Node.EventType.TOUCH_END, this.onRootTouchEnd, this, true);
        this.inputRoot.on(Node.EventType.TOUCH_CANCEL, this.onRootTouchCancel, this);
        this.inputRoot.on(Node.EventType.MOUSE_WHEEL, this.onRootMouseWheel, this);
        this.renderGame();
        this.runtime.refitBoardViewportToSafeRect?.();

        const topBar = this.runtime.getGameplayFixedGroup('TopBarGroup');
        const settingsButton = topBar.getChildByName('Settings');
        if (!settingsButton?.isValid) {
            throw new Error('[pch-core] Game.scene is missing TopBarGroup/Settings');
        }
        settingsButton.active = !hideFirstLevelControls;
        this.bindSpeedButton(topBar, !hideFirstLevelControls);
        this.prepareOpeningPatternShuffle();
    }

    playOpeningPatternShuffle(): void {
        if (this.openingPatternState !== 'ready') {
            throw new Error(`[pch-opening] transition is not ready: ${this.openingPatternState}`);
        }
        if (!this.root?.isValid || !this.rules) {
            throw new Error('[pch-opening] gameplay root is unavailable');
        }
        const visuals = this.openingPatternVisuals;
        if (visuals.length === 0) throw new Error('[pch-opening] transition has no visual beans');
        const generation = this.openingPatternGeneration;
        const stagger = getOpeningPatternStaggerDelay(visuals.length);
        const firstDuration = OPENING_PATTERN_MOVE_SECONDS * 0.46;
        const secondDuration = OPENING_PATTERN_MOVE_SECONDS - firstDuration;
        let remaining = visuals.length;
        this.openingPatternState = 'running';

        visuals.forEach((visual, index) => {
            const midpoint = this.getOpeningPatternArcMidpoint(visual, index);
            tween(visual.node)
                .delay(OPENING_PATTERN_HOLD_SECONDS + index * stagger)
                .to(firstDuration, {
                    position: midpoint,
                    scale: new Vec3(0.84, 1.06, 1),
                }, { easing: 'quadIn' })
                .to(secondDuration, {
                    position: visual.targetPosition,
                    scale: new Vec3(1, 1, 1),
                }, { easing: 'quadOut' })
                .call(() => {
                    if (generation !== this.openingPatternGeneration || this.openingPatternState !== 'running') return;
                    remaining -= 1;
                    if (remaining <= 0) this.completeOpeningPatternShuffle(generation);
                })
                .start();
        });
    }

    private prepareOpeningPatternShuffle(): void {
        const board = this.runtime.boardModel;
        const moves = buildOpeningPatternMoves(board.correctColors, board.currentColors);
        const visuals = moves.map((move): OpeningPatternVisual => {
            const node = this.runtime.cellNodes?.[move.source.row]?.[move.source.col] || null;
            const targetNode = this.runtime.cellNodes?.[move.target.row]?.[move.target.col] || null;
            const sprite = node?.getComponent(Sprite) || null;
            if (!node?.isValid || !targetNode?.isValid || !sprite) {
                throw new Error(
                    `[pch-opening] missing cell visual ${move.source.row},${move.source.col}`
                    + ` -> ${move.target.row},${move.target.col}`,
                );
            }
            return {
                move,
                node,
                homePosition: node.position.clone(),
                targetPosition: targetNode.position.clone(),
            };
        });

        this.openingPatternGeneration += 1;
        this.openingPatternVisuals = visuals;
        this.openingPatternState = 'ready';
        this.inputLocked = true;
        for (const visual of visuals) {
            const sprite = visual.node.getComponent(Sprite)!;
            Tween.stopAllByTarget(visual.node);
            visual.node.active = true;
            visual.node.setPosition(visual.homePosition);
            visual.node.setScale(1, 1, 1);
            visual.node.angle = 0;
            sprite.enabled = true;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.runtime.requireRenderReadySpriteFrame(
                this.runtime.getBeanSpriteFrame(visual.move.colorId, false),
                `pch-opening:${visual.move.source.row},${visual.move.source.col}:color:${visual.move.colorId}`,
            );
        }
    }

    private completeOpeningPatternShuffle(generation: number): void {
        if (generation !== this.openingPatternGeneration || this.openingPatternState !== 'running') return;
        this.openingPatternState = 'done';
        this.restoreOpeningPatternVisuals(false, true);
        this.inputLocked = false;
        this.showOpeningFeatureGuide(this.runtime.getGameplayFixedRoot());
        this.runtime.syncSkillButtonRuntimeStates?.();
    }

    private cancelOpeningPatternShuffle(restoreBoard: boolean): void {
        const hadVisuals = this.openingPatternVisuals.length > 0;
        this.openingPatternGeneration += 1;
        this.openingPatternState = 'idle';
        this.restoreOpeningPatternVisuals(true, restoreBoard && hadVisuals);
    }

    private restoreOpeningPatternVisuals(stopTweens: boolean, renderBoard: boolean): void {
        for (const visual of this.openingPatternVisuals) {
            if (!visual.node?.isValid) continue;
            if (stopTweens) Tween.stopAllByTarget(visual.node);
            visual.node.setPosition(visual.homePosition);
            visual.node.setScale(1, 1, 1);
            visual.node.angle = 0;
        }
        this.openingPatternVisuals = [];
        if (renderBoard && this.runtime.boardModel) this.runtime.renderBoard();
    }

    private getOpeningPatternArcMidpoint(visual: OpeningPatternVisual, index: number): Vec3 {
        const dx = visual.targetPosition.x - visual.homePosition.x;
        const dy = visual.targetPosition.y - visual.homePosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 0.001) return visual.homePosition.clone();
        const arc = Math.min(Math.max(4, Number(this.runtime.cellSize) * 0.72 || 4), distance * 0.18);
        const sign = ((index + visual.move.colorId) & 1) === 0 ? 1 : -1;
        return new Vec3(
            visual.homePosition.x + dx * 0.5 - dy / distance * arc * sign,
            visual.homePosition.y + dy * 0.5 + dx / distance * arc * sign,
            visual.homePosition.z,
        );
    }

    stop(): void {
        this.cancelOpeningPatternShuffle(true);
        this.releaseActiveSkillPause();
        this.resetTableEntryDoorAnimation();
        this.resetExitArrowAnimation();
        this.resetCapacityWarning();
        for (const callback of this.pendingReturnCompletions.values()) {
            this.runtime.unschedule?.(callback);
        }
        this.pendingReturnCompletions.clear();
        this.clearPchColorCompleteSequence();
        this.lastEntranceAudioVisitByCarrier.clear();
        if (this.inputRoot?.isValid) {
            this.inputRoot.off(Node.EventType.TOUCH_START, this.onRootTouchStart, this);
            this.inputRoot.off(Node.EventType.TOUCH_MOVE, this.onRootTouchMove, this);
            this.inputRoot.off(Node.EventType.TOUCH_END, this.onRootTouchEnd, this, true);
            this.inputRoot.off(Node.EventType.TOUCH_CANCEL, this.onRootTouchCancel, this);
            this.inputRoot.off(Node.EventType.MOUSE_WHEEL, this.onRootMouseWheel, this);
        }
        for (const bean of Array.from(this.activeFlyBeans)) this.destroyFlyBean(bean);
        this.recycleAllSphereFlyEffects();
        this.sphereFlyEffectPool.clear();
        this.sphereFlyStarPool.clear();
        for (const node of this.activePulseNodes) {
            if (!node?.isValid) continue;
            Tween.stopAllByTarget(node);
            node.setScale(1, 1, 1);
        }
        if (this.root?.isValid) {
            Tween.stopAllByTarget(this.root);
            for (const layout of [this.normalLayout, this.compactLayout]) {
                if (layout?.isValid) this.clearConveyorLayoutRuntime(layout);
            }
            if (this.normalLayout?.isValid) this.normalLayout.active = true;
            if (this.compactLayout?.isValid) this.compactLayout.active = false;
            this.root.active = false;
        }
        if (this.adButton?.isValid) {
            this.adButton.off(Node.EventType.TOUCH_END, this.onCapacityAdTap, this);
        }
        if (this.speedButton?.isValid) {
            this.speedButton.off(Node.EventType.TOUCH_END, this.onSpeedButtonTap, this);
            this.speedButton.active = false;
        }
        this.clearOpeningGuideNodes();
        this.root = null;
        this.belt = null;
        this.normalLayout = null;
        this.compactLayout = null;
        this.carrierLayer = null;
        this.carrierTemplate = null;
        this.inputRoot = null;
        this.statusLabel = null;
        this.countLabel = null;
        this.capacityBadge = null;
        this.capacityProgress = null;
        this.capacityWarningAnimation = null;
        this.warningOverlay = null;
        this.warningOverlayOpacity = null;
        this.normalEntryDoors = null;
        this.activeEntryDoors = null;
        this.entryFlyAnchor = null;
        this.entryQueueLayer = null;
        this.entryBeanTemplate = null;
        this.entrancePulseNode = null;
        this.exitNode = null;
        this.adButton = null;
        this.speedButton = null;
        this.speedInactiveState = null;
        this.speedActiveState = null;
        this.speedBadgeLabel = null;
        this.openingGuideLevelOneCells = [];
        this.openingGuideLevelOneStep = -1;
        this.openingGuideWrongTapToastLastShownAt = 0;
        this.rules = null;
        this.carrierNodes = [];
        this.carrierDirectionNodes = [];
        this.activeFlyBeans.clear();
        this.activeSphereFlyEffects.clear();
        this.activePulseNodes.clear();
        this.activeReturnAnimations = 0;
        this.activeReturnBeans.clear();
        this.beforeWinSpeedActive = false;
        this.finishCommitted = false;
        this.settlementPaused = false;
        this.inputLocked = false;
        this.skillMovementPaused = false;
        this.skillTimerPauseToken = '';
        this.capacityWarningActive = false;
        this.warningPulseGeneration = 0;
    }

    update(deltaTime: number): void {
        this.updateSphereFlyEffects(deltaTime);
        this.updateExitArrowAnimation(deltaTime);
        if (!this.rules || this.runtime.isGameEnd) return;
        if (this.skillMovementPaused || this.runtime._adShowing || this.runtime._rewardedGrantTransaction) return;
        const previousTravel = this.beltTravel;
        const speedMultiplier = this.getEffectiveBeltSpeedMultiplier();
        this.beltTravel += (Math.max(0, deltaTime) * speedMultiplier) / BELT_STEP_SECONDS;
        const entrancePickupProgress = 1 - PCH_ENTRY_PICKUP_LEAD_STEP_RATIO / this.rules.carrierCount;
        for (let carrierIndex = 0; carrierIndex < this.rules.carrierCount; carrierIndex += 1) {
            if (this.didCarrierCrossProgress(
                carrierIndex,
                previousTravel,
                this.beltTravel,
                entrancePickupProgress,
            ) || this.didCarrierCrossProgress(carrierIndex, previousTravel, this.beltTravel, 0)) {
                this.handleCarrierAtEntrance(carrierIndex);
            }
            if (this.didCarrierCrossProgress(carrierIndex, previousTravel, this.beltTravel, this.exitPathProgress)) {
                this.handleCarrierAtExit(carrierIndex);
            }
        }
        if (this.checkBufferDeadlock()) return;
        this.updateBeltPositions();
    }

    getAvoidTopY(): number | null {
        if (!this.belt?.isValid) return null;
        const transform = this.belt.getComponent(UITransform);
        if (!transform) return null;
        return this.belt.position.y + transform.contentSize.height * Math.abs(this.belt.scale.y || 1) / 2;
    }

    getBufferCapacity(): number {
        return this.rules?.bufferCapacity || 0;
    }

    getAnalyticsSnapshot(): PchGameplayAnalyticsSnapshot | null {
        if (!this.analyticsStats) return null;
        return { ...this.analyticsStats };
    }

    recordFreezeUse(): void {
        if (!this.analyticsStats) return;
        this.analyticsStats.freezeUses += 1;
    }

    isActive(): boolean {
        return !!this.rules && !!this.root?.isValid;
    }

    shouldRenderSettledPixelBlock(row: number, col: number): boolean {
        return PCH_SETTLED_PIXEL_BLOCK_EXPERIMENT
            && this.runtime._activeGameplayEntryMode === 'theme'
            && this.isActive()
            && this.rules?.board.locked?.[row]?.[col] === true;
    }

    isFinishCommitted(): boolean {
        return this.finishCommitted;
    }

    pauseForSettlement(): void {
        if (!this.isActive() || this.settlementPaused) return;
        this.settlementPaused = true;
        this.dismissOpeningGuide();
        this.resetCapacityWarning();
        for (const bean of this.activeReturnBeans) {
            if (bean?.isValid) Tween.pauseAllByTarget(bean);
        }
        for (const callback of this.pendingReturnCompletions.values()) {
            this.runtime.unschedule?.(callback);
        }
    }

    resumeAfterSettlement(): void {
        if (!this.settlementPaused) return;
        this.settlementPaused = false;
        for (const bean of this.activeReturnBeans) {
            if (!bean?.isValid) continue;
            const completion = this.pendingReturnCompletions.get(bean);
            if (completion) {
                this.runtime.scheduleOnce(completion, PCH_RETURN_COMPLETE_DELAY_SECONDS);
            } else {
                Tween.resumeAllByTarget(bean);
            }
        }
    }

    private getEffectiveBeltSpeedMultiplier(): PchSpeedMultiplier | 5 {
        if (!this.beforeWinSpeedActive && this.rules?.conveyorSpeedMultiplier === 5) {
            this.beforeWinSpeedActive = true;
        }
        return this.beforeWinSpeedActive ? 5 : this.manualSpeedMultiplier;
    }

    hasStoredBeans(): boolean {
        return (this.rules?.bufferCount || 0) > 0;
    }

    isSkillBusy(): boolean {
        return this.activeFlyBeans.size > 0
            || this.activeReturnAnimations > 0
            || this.inputLocked
            || this.runtime._skillActive === true;
    }

    beginSkillUsePause(owner: 'magnet' | 'brush' | 'freeze'): void {
        if (this.skillMovementPaused) return;
        this.skillMovementPaused = true;
        this.skillTimerPauseToken = this.runtime.pauseTimerForProp?.(`pch-skill-${owner}`) || '';
    }

    releaseActiveSkillPause(): void {
        const timerToken = this.skillTimerPauseToken;
        this.skillTimerPauseToken = '';
        this.skillMovementPaused = false;
        if (timerToken) this.runtime.resumeTimerForProp?.(timerToken);
    }

    useClearColorSkill(timerAlreadyPaused: boolean = false): boolean {
        return this.runConveyorSkill('magnet', timerAlreadyPaused, () => this.rules!.forceCompleteRandomColor());
    }

    useClearBufferSkill(timerAlreadyPaused: boolean = false): boolean {
        if (!this.hasStoredBeans()) return false;
        return this.runConveyorSkill('brush', timerAlreadyPaused, () => this.rules!.clearBufferToBoard());
    }

    continueAfterBufferFull(): boolean {
        if (!this.rules || !this.runtime.isGameEnd) return false;
        if (!this.expandCapacity()) return false;
        this.inputLocked = false;
        this.runtime.continueAfterLose(0, true);
        return true;
    }

    grantReviveCapacity(): boolean {
        return this.expandCapacity();
    }

    private checkBufferDeadlock(): boolean {
        if (!this.rules?.isBufferDeadlocked()) return false;
        this.inputLocked = true;
        if (this.statusLabel) this.statusLabel.string = '暂存槽已满，且没有豆豆可以归位';
        this.runtime.gameLose('buffer-full');
        return true;
    }

    private onRootTouchStart(event: any): void {
        if (this.inputLocked) {
            event.propagationStopped = true;
            return;
        }
        this.runtime.onTouchStart?.(event);
    }

    private onRootTouchMove(event: any): void {
        if (this.inputLocked) {
            event.propagationStopped = true;
            return;
        }
        this.runtime.onTouchMove?.(event);
    }

    private onRootTouchCancel(event: any): void {
        if (this.inputLocked) {
            event.propagationStopped = true;
            return;
        }
        this.runtime.onTouchCancel?.(event);
    }

    private onRootMouseWheel(event: any): void {
        if (this.inputLocked) {
            event.propagationStopped = true;
            return;
        }
        this.runtime.onMouseWheel?.(event);
    }

    private onRootTouchEnd(event: any): void {
        if (!this.rules || this.runtime.isGameEnd) return;
        if (this.inputLocked) {
            if (this.isOpeningGuideTargetEvent(event)) return;
            event.propagationStopped = true;
            this.handleOpeningGuideRootTap(event);
            return;
        }
        const wasViewportGesture = this.runtime.gestureMode === 'pinching'
            || this.runtime.gestureMode === 'panning'
            || !!this.runtime.suppressTap;
        if (wasViewportGesture) {
            this.runtime.onTouchEnd?.(event);
            event.propagationStopped = true;
            return;
        }
        this.runtime.onTouchCancel?.(event);
        if (this.hasDirectButtonTarget(event)) return;
        const rawPos = event?.getUILocation?.();
        if (!rawPos) return;
        let cell: { row: number; col: number } | null = null;
        if (typeof this.runtime.resolveBoardTapBlock === 'function') {
            const resolution = this.runtime.resolveBoardTapBlock(new Vec3(rawPos.x, rawPos.y, 0), false);
            const candidate = resolution?.candidate || null;
            if (candidate) {
                cell = this.rules.cells.find((item) => item.row === candidate.row && item.col === candidate.col) || null;
            }
        }
        if (!cell) {
            cell = this.rules.cells.find((item) => {
                const node = this.runtime.cellNodes?.[item.row]?.[item.col] || null;
                const transform = node?.getComponent(UITransform);
                const bounds = transform?.getBoundingBoxToWorld();
                return !!bounds && bounds.contains(rawPos);
            }) || null;
        }
        if (!cell) return;
        event.propagationStopped = true;
        this.handleBoardTap(cell.row, cell.col);
    }

    private handleOpeningGuideRootTap(event: any): boolean {
        if (this.handleLevelOneOpeningGuideRootTap(event)) return true;
        const rawPos = event?.getUILocation?.();
        if (!rawPos) return false;
        const guideName = this.openingGuide?.name || '';
        if (guideName.startsWith('PchLevelOneGuideStep')) {
            this.trackOpeningGuideEvent('pch_guide_tap_result', false, 'miss_target', guideName);
            this.maybeShowOpeningGuideWrongTapToast();
            return false;
        }
        const target = guideName === 'PchLevelTwoSpeedGuide'
            ? this.speedButton
            : (guideName === 'PchLevelThreeCapacityGuide' ? this.adButton : null);
        const bounds = target?.getComponent(UITransform)?.getBoundingBoxToWorld();
        if (!bounds || !bounds.contains(rawPos)) {
            this.trackOpeningGuideEvent('pch_guide_tap_result', false, 'miss_target', guideName);
            this.maybeShowOpeningGuideWrongTapToast();
            return false;
        }
        event.propagationStopped = true;
        if (guideName === 'PchLevelTwoSpeedGuide') {
            this.onOpeningGuideDoubleSpeed(event);
        } else {
            this.onOpeningGuideFreeCapacity(event);
        }
        return true;
    }

    private maybeShowOpeningGuideWrongTapToast(): void {
        const guideName = this.openingGuide?.name || '';
        const isStarterGuide = guideName.startsWith('PchLevelOneGuideStep')
            || guideName === 'PchLevelTwoSpeedGuide'
            || guideName === 'PchLevelThreeCapacityGuide';
        if (!isStarterGuide) return;
        const now = Date.now();
        const lastShownAt = Math.max(0, Number(this.openingGuideWrongTapToastLastShownAt) || 0);
        if (lastShownAt > 0 && now >= lastShownAt && now - lastShownAt < OPENING_GUIDE_WRONG_TAP_TOAST_COOLDOWN_MS) {
            return;
        }
        if (typeof this.runtime.showToast !== 'function') {
            throw new Error('[pch-core] opening guide wrong-tap Toast is unavailable');
        }
        this.openingGuideWrongTapToastLastShownAt = now;
        this.runtime.showToast('请跟随指示完成引导');
    }

    private handleLevelOneOpeningGuideRootTap(event: any): boolean {
        if (!this.rules || this.openingGuideLevelOneStep < 0) return false;
        const guideCell = this.openingGuideLevelOneCells[this.openingGuideLevelOneStep];
        const targetColor = guideCell ? this.rules.board.currentColors[guideCell.row]?.[guideCell.col] || 0 : 0;
        const rawPos = event?.getUILocation?.();
        if (targetColor <= 0 || !rawPos) return false;
        const hitTargetColor = this.rules.cells.some((cell) => {
            if (cell.locked || cell.current !== targetColor) return false;
            const node = this.runtime.cellNodes?.[cell.row]?.[cell.col] || null;
            const bounds = node?.getComponent(UITransform)?.getBoundingBoxToWorld();
            return !!bounds && bounds.contains(rawPos);
        });
        if (!hitTargetColor) return false;
        event.propagationStopped = true;
        this.onOpeningGuideLevelOneTap(event);
        return true;
    }

    private isOpeningGuideTargetEvent(event: any): boolean {
        const guideTarget = this.openingGuideTarget;
        if (!guideTarget?.isValid) return false;
        let node = event?.target as Node | null;
        while (node?.isValid && node !== this.inputRoot) {
            if (node === guideTarget) return true;
            node = node.parent;
        }
        return false;
    }

    private hasDirectButtonTarget(event: any): boolean {
        let node = event?.target as Node | null;
        while (node?.isValid && node !== this.inputRoot) {
            if (node.getComponent(Button)) return true;
            node = node.parent;
        }
        return false;
    }

    private handleBoardTap(row: number, col: number): PchBoardTapOutcome {
        if (!this.rules) return 'inactive';
        const block = this.rules.selectBoard(row, col);
        if (!block) {
            if (this.statusLabel) this.statusLabel.string = '请选择棋盘上未归位的相连同色豆豆';
            return 'invalid';
        }
        const sourceWorldPositions = block.cells.map((cell) => this.getBoardCellWorldPosition(cell.row, cell.col));
        const result = this.rules.storeBlock(block, this.getEntranceCarrierIndex());
        if (result.moved <= 0) {
            if (this.statusLabel) this.statusLabel.string = '传送带已满，请等待出口归位';
            return 'capacity_blocked';
        }
        if (!this.firstStoreEventSent) {
            this.firstStoreEventSent = true;
            this.trackPchFunnelEvent('pch_first_store_success', {
                source: 'board_selection',
                success: true,
            });
        }
        this.runtime.ensureTimerStarted?.();
        AudioMgr.inst.play('select');
        this.runtime.renderBoardCells(result.boardCells);
        this.runtime.refreshEndgameHints?.('pch-store');
        this.renderEntranceQueue();
        this.refreshStatus();
        result.boardCells.forEach((_cell, index) => {
            const sourceWorld = sourceWorldPositions[index];
            if (!sourceWorld) throw new Error(`[pch-core] board bean ${index} has no fly source`);
            this.animateBeanIntoConveyor(
                block.colorId,
                sourceWorld,
                index,
                index === result.boardCells.length - 1,
            );
        });
        if (result.moved < block.cells.length) {
            if (this.statusLabel) this.statusLabel.string = '空间不足，剩余豆豆保留在棋盘';
            return 'partial';
        }
        return 'stored';
    }

    private handleCarrierAtEntrance(carrierIndex: number): boolean {
        if (!this.rules || this.rules.readyEntryCount <= 0) return false;
        const result = this.rules.transferReadyBeansToCarrier(carrierIndex);
        if (result.moved <= 0) return false;
        const visitOrdinal = this.getEntranceVisitOrdinal(carrierIndex);
        const shouldPlayVisitFeedback = this.lastEntranceAudioVisitByCarrier.get(carrierIndex) !== visitOrdinal;
        if (shouldPlayVisitFeedback) {
            this.lastEntranceAudioVisitByCarrier.set(carrierIndex, visitOrdinal);
            AudioMgr.inst.play('settle');
            AudioMgr.inst.vibratePlace();
        }
        this.renderConveyorCarrier(carrierIndex);
        this.renderEntranceQueue();
        this.refreshStatus();
        if (shouldPlayVisitFeedback) this.playEntranceTransferPulse(result.carrierIndex);
        return true;
    }

    private tryTransferAtCurrentEntrance(): boolean {
        if (!this.rules) return false;
        const carrierIndex = this.getEntranceCarrierIndex();
        const progress = this.wrap01((carrierIndex + this.beltTravel) / this.rules.carrierCount);
        const distance = Math.min(progress, 1 - progress);
        if (distance > PCH_ENTRANCE_SNAP_PROGRESS) return false;
        return this.handleCarrierAtEntrance(carrierIndex);
    }

    private getEntranceVisitOrdinal(carrierIndex: number): number {
        if (!this.rules) return 0;
        return Math.round((carrierIndex + this.beltTravel) / this.rules.carrierCount);
    }

    private playEntranceTransferPulse(carrierIndex: number): void {
        const nodes = [this.entrancePulseNode, this.carrierNodes[carrierIndex]]
            .filter((node): node is Node => !!node?.isValid);
        for (const node of nodes) {
            Tween.stopAllByTarget(node);
            node.setScale(1, 1, 1);
            this.activePulseNodes.add(node);
            tween(node)
                .to(0.06, { scale: new Vec3(1.12, 1.12, 1) })
                .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .call(() => this.activePulseNodes.delete(node))
                .start();
        }
    }

    private handleCarrierAtExit(carrierIndex: number): boolean {
        if (!this.rules) return false;
        if (this.rules.topColor(carrierIndex) <= 0) return false;
        const carrierNode = this.carrierNodes[carrierIndex];
        if (!carrierNode?.isValid) {
            throw new Error(`[pch-core] carrier ${carrierIndex} has no visual source`);
        }
        const sourceLayers = this.rules.carriers[carrierIndex].map((_colorId, layerIndex) => {
            const beanNode = carrierNode.getChildByName(`PchStackBean-${carrierIndex}-${layerIndex}`);
            const beanTransform = beanNode?.getComponent(UITransform);
            if (!beanNode?.isValid || !beanTransform) {
                throw new Error(`[pch-core] carrier ${carrierIndex} layer ${layerIndex} has no visual source`);
            }
            return {
                world: beanTransform.convertToWorldSpaceAR(new Vec3()),
                size: Math.max(1, 31 * (this.runtime.getNodeScaleInLayer?.(beanNode, this.root) || 1)),
            };
        });
        const result = this.rules.autoPlaceAvailableLayers(carrierIndex);
        if (result.moved <= 0) return false;
        if (!this.firstReturnEventSent) {
            this.firstReturnEventSent = true;
            this.trackPchFunnelEvent('pch_first_return_success', {
                source: 'conveyor_exit',
                success: true,
            });
        }
        this.renderConveyorCarrier(carrierIndex);
        this.refreshStatus();
        const returnColorBatches = new Map<number, PchReturnColorEffectBatch>();
        result.boardCells.forEach((target, index) => {
            const source = sourceLayers[result.sourceLayerIndices[index]];
            const colorId = result.colorIds[index];
            if (!source || colorId <= 0) {
                throw new Error(`[pch-core] return batch ${carrierIndex}:${index} has no source bean`);
            }
            let colorBatch = returnColorBatches.get(colorId);
            if (!colorBatch) {
                colorBatch = { colorId, targets: [], pendingSettleFxCount: 0 };
                returnColorBatches.set(colorId, colorBatch);
            }
            colorBatch.targets.push(target);
            colorBatch.pendingSettleFxCount += 1;
            this.animateBeanReturn(colorId, source.world, source.size, target, index, colorBatch);
        });
        this.playExitPulse();
        if (this.rules.board.isAllLocked()) this.inputLocked = true;
        return true;
    }

    private playExitPulse(): void {
        if (!this.exitNode?.isValid) return;
        Tween.stopAllByTarget(this.exitNode);
        this.exitNode.setScale(1, 1, 1);
        this.activePulseNodes.add(this.exitNode);
        tween(this.exitNode)
            .to(0.08, { scale: new Vec3(1.14, 1.14, 1) })
            .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .call(() => {
                if (this.exitNode) this.activePulseNodes.delete(this.exitNode);
            })
            .start();
    }

    private startExitArrowAnimation(): void {
        this.exitArrowElapsedSeconds = 0;
        this.updateExitArrowAnimation(0);
    }

    private updateExitArrowAnimation(deltaTime: number): void {
        if (this.exitArrowGroups.length === 0) return;
        this.exitArrowElapsedSeconds = (
            this.exitArrowElapsedSeconds + Math.max(0, deltaTime)
        ) % PCH_EXIT_ARROW_CYCLE_SECONDS;
        for (const group of this.exitArrowGroups) {
            if (!group.position?.isValid) continue;
            const phase = (
                this.exitArrowElapsedSeconds + group.phaseOffsetSeconds
            ) % PCH_EXIT_ARROW_CYCLE_SECONDS;
            const y = phase <= PCH_EXIT_ARROW_MOVE_SECONDS
                ? PCH_EXIT_ARROW_START_Y
                    + (PCH_EXIT_ARROW_END_Y - PCH_EXIT_ARROW_START_Y) * phase / PCH_EXIT_ARROW_MOVE_SECONDS
                : PCH_EXIT_ARROW_END_Y
                    + (PCH_EXIT_ARROW_START_Y - PCH_EXIT_ARROW_END_Y)
                    * (phase - PCH_EXIT_ARROW_MOVE_SECONDS)
                    / (PCH_EXIT_ARROW_CYCLE_SECONDS - PCH_EXIT_ARROW_MOVE_SECONDS);
            group.position.setPosition(group.authoredPosition.x, y, group.authoredPosition.z);

            let alpha = 0;
            if (phase <= PCH_EXIT_ARROW_FADE_IN_SECONDS) {
                const progress = phase / PCH_EXIT_ARROW_FADE_IN_SECONDS;
                alpha = progress * progress * (3 - 2 * progress);
            } else if (phase <= PCH_EXIT_ARROW_FADE_OUT_START_SECONDS) {
                alpha = 1;
            } else if (phase < PCH_EXIT_ARROW_MOVE_SECONDS) {
                const progress = (phase - PCH_EXIT_ARROW_FADE_OUT_START_SECONDS)
                    / (PCH_EXIT_ARROW_MOVE_SECONDS - PCH_EXIT_ARROW_FADE_OUT_START_SECONDS);
                alpha = 1 - progress * progress * (3 - 2 * progress);
            }
            const opacity = Math.round(alpha * 255);
            for (const arrowOpacity of group.opacities) {
                if (arrowOpacity.node?.isValid) arrowOpacity.opacity = opacity;
            }
        }
    }

    private resetExitArrowAnimation(): void {
        for (const group of this.exitArrowGroups) {
            if (group.position?.isValid) group.position.setPosition(group.authoredPosition);
            for (const arrowOpacity of group.opacities) {
                if (arrowOpacity.node?.isValid) arrowOpacity.opacity = 255;
            }
        }
        this.exitArrowGroups = [];
        this.exitArrowElapsedSeconds = 0;
    }

    private didCarrierCrossProgress(
        carrierIndex: number,
        previousTravel: number,
        currentTravel: number,
        pathProgress: number,
    ): boolean {
        if (!this.rules) return false;
        const count = this.rules.carrierCount;
        const before = Math.floor((carrierIndex + previousTravel) / count - pathProgress);
        const after = Math.floor((carrierIndex + currentTravel) / count - pathProgress);
        return after > before;
    }

    private animateBeanIntoConveyor(
        colorId: number,
        sourceWorld: Vec3,
        staggerIndex: number,
        playBatchAudio: boolean,
    ): void {
        if (!this.root || !this.entryFlyAnchor) throw new Error('[pch-core] conveyor entry visual anchor is unavailable');
        const sourceBeanSize = Math.max(1, this.runtime.getBoardFlyBeanSizeInLayer?.(this.root) || 31);
        const bean = this.createFlyBean(`PchInboundBean-${staggerIndex}`, colorId, sourceBeanSize, sourceWorld);
        const rootTransform = this.root.getComponent(UITransform)!;
        const entranceWorld = this.entryFlyAnchor.getWorldPosition(new Vec3());
        const targetLocal = rootTransform.convertToNodeSpaceAR(entranceWorld);
        const targetScale = 31 / sourceBeanSize;
        const flightDelay = staggerIndex * PCH_ENTRY_STAGGER_SECONDS;
        this.attachSphereFlyEffect(bean, sourceBeanSize, flightDelay);
        tween(bean)
            .delay(flightDelay)
            .to(PCH_TRANSFER_SECONDS, {
                position: targetLocal,
                scale: new Vec3(targetScale, targetScale, 1),
            }, { easing: 'quadIn' })
            .call(() => {
                this.destroyFlyBean(bean);
                if (playBatchAudio) {
                    AudioMgr.inst.play('settle');
                    AudioMgr.inst.vibratePlace();
                }
                this.rules?.markQueuedBeansReady(1);
                this.renderEntranceQueue();
                this.refreshStatus();
                this.tryTransferAtCurrentEntrance();
            })
            .start();
    }

    private animateBeanReturn(
        colorId: number,
        sourceWorld: Vec3,
        sourceBeanSize: number,
        target: { row: number; col: number },
        staggerIndex: number,
        colorBatch: PchReturnColorEffectBatch,
    ): void {
        if (!this.root) throw new Error('[pch-core] conveyor return visual root is unavailable');
        const targetWorld = this.getBoardCellWorldPosition(target.row, target.col);
        const rootTransform = this.root.getComponent(UITransform)!;
        const targetLocal = rootTransform.convertToNodeSpaceAR(targetWorld);
        const targetBeanSize = Math.max(1, this.runtime.getBoardFlyBeanSizeInLayer?.(this.root) || sourceBeanSize);
        const bean = this.createFlyBean(`PchReturnBean-${target.row}-${target.col}`, colorId, sourceBeanSize, sourceWorld);
        const targetScale = targetBeanSize / sourceBeanSize;
        const flightDelay = staggerIndex * PCH_RETURN_STAGGER_SECONDS;
        this.attachSphereFlyEffect(bean, sourceBeanSize, flightDelay);
        this.activeReturnAnimations += 1;
        this.activeReturnBeans.add(bean);
        const completeReturn = () => {
            if (!this.activeReturnBeans.delete(bean)) return;
            this.pendingReturnCompletions.delete(bean);
            this.destroyFlyBean(bean);
            this.finishReturnAnimation(target, colorBatch);
        };
        tween(bean)
            .delay(flightDelay)
            .to(PCH_RETURN_TRANSFER_SECONDS, {
                position: targetLocal,
                scale: new Vec3(targetScale, targetScale, 1),
            }, { easing: 'quadOut' })
            .call(() => {
                bean.active = false;
                AudioMgr.inst.play('settle');
                AudioMgr.inst.vibratePlace();
                this.runtime.renderBoardCell(target.row, target.col);
                this.runtime.playBeanSettleMatchFxOnCell?.(target.row, target.col);
                this.pendingReturnCompletions.set(bean, completeReturn);
                if (!this.settlementPaused) {
                    this.runtime.scheduleOnce(completeReturn, PCH_RETURN_COMPLETE_DELAY_SECONDS);
                }
            })
            .start();
    }

    private finishReturnAnimation(target: { row: number; col: number }, colorBatch: PchReturnColorEffectBatch): void {
        this.activeReturnAnimations = Math.max(0, this.activeReturnAnimations - 1);
        this.runtime.syncSkillButtonRuntimeStates?.();
        this.schedulePchReturnColorSettle(colorBatch);
        const boardComplete = this.rules?.board.isAllLocked() === true;
        this.runtime.checkGuideStepComplete?.();
        if (boardComplete) {
            this.tryCommitFinishAfterPchColorCompleteEffects();
        } else {
            this.runtime.refreshEndgameHints?.(`pch-return-${target.row}-${target.col}`);
        }
    }

    private schedulePchReturnColorSettle(colorBatch: PchReturnColorEffectBatch): void {
        const generation = this.pchColorCompleteSequenceGeneration;
        const completeColorSettle = () => {
            this.pendingPchReturnColorSettles.delete(completeColorSettle);
            if (generation !== this.pchColorCompleteSequenceGeneration || this.runtime.isGameEnd) return;
            colorBatch.pendingSettleFxCount = Math.max(0, colorBatch.pendingSettleFxCount - 1);
            if (colorBatch.pendingSettleFxCount > 0) return;
            if (this.runtime.markColorCompleteIfNeeded(colorBatch.colorId) !== true) {
                this.tryCommitFinishAfterPchColorCompleteEffects();
                return;
            }
            this.queuedPchColorCompleteBatches.push(colorBatch);
            this.playNextPchColorCompleteEffect();
        };
        this.pendingPchReturnColorSettles.add(completeColorSettle);
        this.runtime.scheduleOnce(completeColorSettle, PCH_RETURN_COLOR_COMPLETE_DELAY_SECONDS);
    }

    private playNextPchColorCompleteEffect(): void {
        if (this.pchColorCompleteEffectActive) return;
        const colorBatch = this.queuedPchColorCompleteBatches.shift();
        if (!colorBatch) {
            this.tryCommitFinishAfterPchColorCompleteEffects();
            return;
        }
        const generation = this.pchColorCompleteSequenceGeneration;
        this.pchColorCompleteEffectActive = true;
        this.runtime.playColorCompleteEffect(colorBatch.colorId, true, () => {
            if (generation !== this.pchColorCompleteSequenceGeneration) return;
            this.pchColorCompleteEffectActive = false;
            this.playNextPchColorCompleteEffect();
        });
    }

    private tryCommitFinishAfterPchColorCompleteEffects(): void {
        if (this.rules?.board.isAllLocked() !== true
            || this.activeReturnAnimations > 0
            || this.pendingPchReturnColorSettles.size > 0
            || this.queuedPchColorCompleteBatches.length > 0
            || this.pchColorCompleteEffectActive) {
            return;
        }
        this.commitFinish();
    }

    private clearPchColorCompleteSequence(): void {
        this.pchColorCompleteSequenceGeneration += 1;
        for (const callback of this.pendingPchReturnColorSettles) {
            this.runtime.unschedule?.(callback);
        }
        this.pendingPchReturnColorSettles.clear();
        this.queuedPchColorCompleteBatches.length = 0;
        this.pchColorCompleteEffectActive = false;
    }

    private commitFinish(): void {
        if (this.finishCommitted || this.runtime.isGameEnd) return;
        this.finishCommitted = true;
        this.resetCapacityWarning();
        this.runtime.clearEndgameHints?.(false);
        this.runtime.playPatternCompleteThenWin?.();
    }

    private createFlyBean(name: string, colorId: number, size: number, worldPosition: Vec3): Node {
        if (!this.root) throw new Error('[pch-core] fly bean root is unavailable');
        const rootTransform = this.root.getComponent(UITransform)!;
        const localPosition = rootTransform.convertToNodeSpaceAR(worldPosition);
        const spriteFrame = this.runtime.requireRenderReadySpriteFrame(
            this.runtime.getBeanSpriteFrame(colorId, false),
            `${name}:color:${colorId}`,
        );
        const bean = this.runtime.acquireFlyBeanNode(name, size, spriteFrame) as Node;
        if (!bean?.isValid) throw new Error('[pch-core] pooled fly bean is unavailable');
        const brightOverlay = bean.getChildByName('BrightOverlay');
        if (!brightOverlay?.isValid) throw new Error('[pch-core] pooled fly bean is missing BrightOverlay');
        brightOverlay.active = false;
        this.root.addChild(bean);
        bean.setPosition(localPosition.x, localPosition.y, 0);
        bean.setScale(1, 1, 1);
        this.activeFlyBeans.add(bean);
        return bean;
    }

    private attachSphereFlyEffect(bean: Node, beanSize: number, flightDelaySeconds: number): void {
        if (!this.root) throw new Error('[pch-sphere-fly] effect root is unavailable');
        if (this.activeSphereFlyEffects.has(bean)) return;

        const effectNode = this.sphereFlyEffectPool.get() ?? this.createSphereFlyEffectNode();
        effectNode.name = `SphereFlyEft-${bean.name}`;
        effectNode.layer = Layers.Enum.UI_2D;
        effectNode.active = true;
        effectNode.setPosition(0, 0, 0);
        effectNode.setScale(1, 1, 1);
        effectNode.angle = 0;
        this.root.addChild(effectNode);
        effectNode.setSiblingIndex(Math.max(0, bean.getSiblingIndex()));

        const trail = effectNode.getChildByName('SphereFlyEft-02-Trail');
        if (!trail?.isValid || trail.children.length !== SPHERE_FLY_TRAIL_SEGMENT_COUNT) {
            throw new Error('[pch-sphere-fly] pooled effect is missing its Trail layer');
        }
        const trailSpriteFrame = this.runtime.requireSphereFlyTrailSpriteFrame();
        const trailSegments = this.getSphereFlyTrailSegments(effectNode, trail);
        for (let index = 0; index < SPHERE_FLY_TRAIL_SEGMENT_COUNT; index += 1) {
            const { node: segment, transform, opacity } = trailSegments[index];
            const sprite = segment.getComponent(Sprite)!;
            transform.setAnchorPoint(SPHERE_FLY_TRAIL_HEAD_ANCHOR_X, 0.5);
            transform.setContentSize(1, beanSize * SPHERE_FLY_TRAIL_WIDTH_RATIO);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = trailSpriteFrame;
            sprite.type = Sprite.Type.FILLED;
            sprite.fillType = Sprite.FillType.HORIZONTAL;
            sprite.fillStart = index / SPHERE_FLY_TRAIL_SEGMENT_COUNT;
            sprite.fillRange = 1 / SPHERE_FLY_TRAIL_SEGMENT_COUNT;
            sprite.color = SPHERE_FLY_TRAIL_COLOR;
            opacity.opacity = Math.round(255 * this.getSphereFlyTrailAlpha(
                (index + 0.5) / SPHERE_FLY_TRAIL_SEGMENT_COUNT,
            ));
            segment.setPosition(0, 0, 0);
            segment.setScale(1, 1, 1);
            segment.angle = 0;
            segment.active = true;
        }
        trail.setPosition(bean.position);
        trail.setScale(1, 1, 1);
        trail.angle = 0;
        trail.active = false;

        const emitterPosition = bean.getPosition(new Vec3());
        this.activeSphereFlyEffects.set(bean, {
            node: effectNode,
            bean,
            trail,
            trailSegments,
            beanSize,
            delayRemainingSeconds: Math.max(0, flightDelaySeconds),
            activeAgeSeconds: 0,
            previousEmitterPosition: new Vec3(emitterPosition.x, emitterPosition.y, emitterPosition.z),
            currentEmitterPosition: new Vec3(emitterPosition.x, emitterPosition.y, emitterPosition.z),
            trailOrigin: new Vec3(emitterPosition.x, emitterPosition.y, emitterPosition.z),
            distanceSinceLastStar: 0,
            emittedStarCount: 0,
            stars: [],
        });
    }

    private createSphereFlyEffectNode(): Node {
        const effect = new Node('SphereFlyEft');
        effect.layer = Layers.Enum.UI_2D;
        effect.addComponent(UITransform).setContentSize(0, 0);

        const trail = new Node('SphereFlyEft-02-Trail');
        trail.layer = Layers.Enum.UI_2D;
        trail.addComponent(UITransform).setContentSize(0, 0);
        for (let index = 0; index < SPHERE_FLY_TRAIL_SEGMENT_COUNT; index += 1) {
            const segment = new Node(`SphereFlyEft-02-TrailSegment-${index}`);
            segment.layer = Layers.Enum.UI_2D;
            segment.addComponent(UITransform).setAnchorPoint(SPHERE_FLY_TRAIL_HEAD_ANCHOR_X, 0.5);
            const sprite = segment.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            segment.addComponent(UIOpacity);
            trail.addChild(segment);
        }
        effect.addChild(trail);
        return effect;
    }

    private getSphereFlyTrailSegments(effectNode: Node, trail: Node): SphereFlyTrailSegment[] {
        const cached = (effectNode as any).__pddSphereFlyTrailSegments as SphereFlyTrailSegment[] | undefined;
        if (cached?.length === SPHERE_FLY_TRAIL_SEGMENT_COUNT
            && cached.every((segment) => segment.node?.isValid && segment.transform?.isValid && segment.opacity?.isValid)) {
            return cached;
        }
        const segments: SphereFlyTrailSegment[] = [];
        for (let index = 0; index < SPHERE_FLY_TRAIL_SEGMENT_COUNT; index += 1) {
            const node = trail.children[index];
            const transform = node?.getComponent(UITransform) || null;
            const opacity = node?.getComponent(UIOpacity) || null;
            const sprite = node?.getComponent(Sprite) || null;
            if (!node || !transform || !sprite || !opacity) {
                throw new Error(`[pch-sphere-fly] Trail segment ${index} is incomplete`);
            }
            segments.push({ node, transform, opacity });
        }
        (effectNode as any).__pddSphereFlyTrailSegments = segments;
        return segments;
    }

    private getSphereFlyTrailAlpha(normalizedDistance: number): number {
        const t = Math.max(0, Math.min(1, normalizedDistance));
        if (t <= SPHERE_FLY_TRAIL_ALPHA_MID_TIME) {
            return 1 + (SPHERE_FLY_TRAIL_ALPHA_MID_VALUE - 1)
                * (t / SPHERE_FLY_TRAIL_ALPHA_MID_TIME);
        }
        return SPHERE_FLY_TRAIL_ALPHA_MID_VALUE
            * (1 - (t - SPHERE_FLY_TRAIL_ALPHA_MID_TIME) / (1 - SPHERE_FLY_TRAIL_ALPHA_MID_TIME));
    }

    private updateSphereFlyEffects(deltaTime: number): void {
        const frameSeconds = Math.max(0, Number(deltaTime) || 0);
        for (const state of this.activeSphereFlyEffects.values()) {
            if (this.settlementPaused && this.activeReturnBeans.has(state.bean)) continue;
            if (!state.bean?.isValid || !state.node?.isValid) {
                this.recycleSphereFlyEffect(state.bean);
                continue;
            }
            const currentEmitterPosition = state.bean.getPosition(state.currentEmitterPosition);
            let activeDelta = frameSeconds;
            if (state.delayRemainingSeconds > 0) {
                const delayBeforeFrame = state.delayRemainingSeconds;
                state.delayRemainingSeconds = Math.max(0, delayBeforeFrame - frameSeconds);
                state.previousEmitterPosition.set(currentEmitterPosition);
                if (state.delayRemainingSeconds > 0) continue;
                activeDelta = Math.max(0, frameSeconds - delayBeforeFrame);
            }

            state.activeAgeSeconds += activeDelta;
            this.updateSphereFlyStarParticles(state, activeDelta);
            this.emitSphereFlyStarsAlongSegment(state, state.previousEmitterPosition, currentEmitterPosition);
            this.updateSphereFlyTrail(state, currentEmitterPosition);
            state.previousEmitterPosition.set(currentEmitterPosition);
        }
    }

    private updateSphereFlyTrail(state: SphereFlyEffectInstance, emitterPosition: Vec3): void {
        const backwardX = state.trailOrigin.x - emitterPosition.x;
        const backwardY = state.trailOrigin.y - emitterPosition.y;
        const trailDistance = Math.sqrt(backwardX * backwardX + backwardY * backwardY);
        const normalizedAge = Math.max(0, Math.min(
            1,
            state.activeAgeSeconds / SPHERE_FLY_TRAIL_LIFETIME_SECONDS,
        ));
        const particleSizeScale = 1 - 3 * normalizedAge * normalizedAge
            + 2 * normalizedAge * normalizedAge * normalizedAge;
        if (trailDistance < 0.5 || particleSizeScale <= 0) {
            state.trail.active = false;
            return;
        }
        const beanScale = Math.max(0.001, Math.abs(state.bean.scale.x));
        const trailWidth = state.beanSize * beanScale * SPHERE_FLY_TRAIL_WIDTH_RATIO
            * SPHERE_FLY_TRAIL_WIDTH_OVER_TRAIL * particleSizeScale;
        const textureLength = trailDistance / (1 - SPHERE_FLY_TRAIL_HEAD_ANCHOR_X);
        for (const segment of state.trailSegments) {
            segment.transform.setContentSize(Math.max(1, textureLength), Math.max(1, trailWidth));
        }
        state.trail.setPosition(emitterPosition);
        state.trail.angle = Math.atan2(backwardY, backwardX) * 180 / Math.PI;
        state.trail.active = true;
    }

    private emitSphereFlyStarsAlongSegment(
        state: SphereFlyEffectInstance,
        from: Vec3,
        to: Vec3,
    ): void {
        if (state.emittedStarCount >= SPHERE_FLY_MAX_STARS_PER_EFFECT) return;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const segmentDistance = Math.sqrt(dx * dx + dy * dy);
        if (segmentDistance < 0.001) return;

        const spacing = Math.max(1, state.beanSize * SPHERE_FLY_STAR_EMISSION_SPACING_RATIO);
        let nextDistance = spacing - state.distanceSinceLastStar;
        while (nextDistance <= segmentDistance
            && state.emittedStarCount < SPHERE_FLY_MAX_STARS_PER_EFFECT) {
            const t = nextDistance / segmentDistance;
            this.spawnSphereFlyStar(state, from.x + dx * t, from.y + dy * t);
            nextDistance += spacing;
        }
        state.distanceSinceLastStar = (state.distanceSinceLastStar + segmentDistance) % spacing;
    }

    private spawnSphereFlyStar(state: SphereFlyEffectInstance, emitterX: number, emitterY: number): void {
        const star = this.sphereFlyStarPool.get() ?? this.createSphereFlyStarNode();
        const transform = star.getComponent(UITransform);
        const sprite = star.getComponent(Sprite);
        const opacity = star.getComponent(UIOpacity);
        if (!transform || !sprite || !opacity) {
            throw new Error('[pch-sphere-fly] pooled Star particle is incomplete');
        }

        const beanScale = Math.max(0.001, Math.abs(state.bean.scale.x));
        const displayBeanSize = state.beanSize * beanScale;
        const shapeAngle = Math.random() * Math.PI * 2;
        const shapeRadius = displayBeanSize * SPHERE_FLY_STAR_RING_RADIUS_RATIO;
        const sizeRatio = SPHERE_FLY_STAR_MIN_SIZE_RATIO
            + Math.random() * (SPHERE_FLY_STAR_MAX_SIZE_RATIO - SPHERE_FLY_STAR_MIN_SIZE_RATIO);
        const starSize = displayBeanSize * sizeRatio;
        const lifetimeSeconds = SPHERE_FLY_STAR_MIN_LIFETIME_SECONDS
            + Math.random() * (SPHERE_FLY_STAR_MAX_LIFETIME_SECONDS - SPHERE_FLY_STAR_MIN_LIFETIME_SECONDS);

        state.node.addChild(star);
        star.name = `SphereFlyEft-01-Star-${state.emittedStarCount}`;
        star.layer = Layers.Enum.UI_2D;
        star.active = true;
        star.setPosition(
            emitterX + Math.cos(shapeAngle) * shapeRadius,
            emitterY + Math.sin(shapeAngle) * shapeRadius,
            0,
        );
        star.setScale(0, 0, 1);
        star.angle = 0;
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(starSize, starSize);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.runtime.requireSphereFlyStarSpriteFrame();
        sprite.color = Color.WHITE;
        opacity.opacity = 255;
        state.stars.push({ node: star, ageSeconds: 0, lifetimeSeconds });
        state.emittedStarCount += 1;
    }

    private createSphereFlyStarNode(): Node {
        const star = new Node('SphereFlyEft-01-Star');
        star.layer = Layers.Enum.UI_2D;
        star.addComponent(UITransform);
        const sprite = star.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        star.addComponent(UIOpacity);
        return star;
    }

    private updateSphereFlyStarParticles(state: SphereFlyEffectInstance, deltaTime: number): void {
        for (let index = state.stars.length - 1; index >= 0; index -= 1) {
            const particle = state.stars[index];
            particle.ageSeconds += deltaTime;
            if (!particle.node?.isValid || particle.ageSeconds >= particle.lifetimeSeconds) {
                state.stars.splice(index, 1);
                this.recycleSphereFlyStar(particle.node);
                continue;
            }
            const normalizedAge = particle.ageSeconds / particle.lifetimeSeconds;
            const sizeScale = normalizedAge <= SPHERE_FLY_STAR_SIZE_PEAK_TIME
                ? normalizedAge / SPHERE_FLY_STAR_SIZE_PEAK_TIME
                : (1 - normalizedAge) / (1 - SPHERE_FLY_STAR_SIZE_PEAK_TIME);
            particle.node.setScale(Math.max(0, sizeScale), Math.max(0, sizeScale), 1);
        }
    }

    private recycleSphereFlyEffect(bean: Node): void {
        const state = this.activeSphereFlyEffects.get(bean);
        if (!state) return;
        this.activeSphereFlyEffects.delete(bean);
        for (const particle of state.stars) this.recycleSphereFlyStar(particle.node);
        state.stars.length = 0;
        if (!state.node?.isValid) return;
        state.trail.active = false;
        state.trail.setPosition(0, 0, 0);
        state.trail.setScale(1, 1, 1);
        state.trail.angle = 0;
        state.node.active = false;
        if (this.getSphereFlyPoolSize(this.sphereFlyEffectPool) >= MAX_POOLED_SPHERE_FLY_EFFECTS) {
            state.node.destroy();
            return;
        }
        this.sphereFlyEffectPool.put(state.node);
    }

    private recycleAllSphereFlyEffects(): void {
        for (const bean of Array.from(this.activeSphereFlyEffects.keys())) {
            this.recycleSphereFlyEffect(bean);
        }
    }

    private recycleSphereFlyStar(star: Node): void {
        if (!star?.isValid) return;
        star.active = false;
        star.setPosition(0, 0, 0);
        star.setScale(1, 1, 1);
        star.angle = 0;
        if (this.getSphereFlyPoolSize(this.sphereFlyStarPool) >= MAX_POOLED_SPHERE_FLY_STARS) {
            star.destroy();
            return;
        }
        this.sphereFlyStarPool.put(star);
    }

    private getSphereFlyPoolSize(pool: NodePool): number {
        const size = (pool as any).size;
        return typeof size === 'function' ? Math.max(0, Number(size.call(pool)) || 0) : 0;
    }

    private stopNodeTreeTweens(node: Node): void {
        for (const child of [...node.children]) this.stopNodeTreeTweens(child);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) Tween.stopAllByTarget(opacity);
        Tween.stopAllByTarget(node);
    }

    private destroyFlyBean(bean: Node): void {
        this.recycleSphereFlyEffect(bean);
        this.activeFlyBeans.delete(bean);
        if (!bean?.isValid) return;
        this.stopNodeTreeTweens(bean);
        this.runtime.recycleFlyBeanNode(bean);
    }

    private getBoardCellWorldPosition(row: number, col: number): Vec3 {
        const world = this.runtime.getBoardCellWorldPosition?.(row, col) || null;
        if (!world) throw new Error(`[pch-core] board cell ${row},${col} has no world position`);
        return world;
    }

    private renderGame(): void {
        this.runtime.renderBoard();
        this.renderConveyor();
        this.renderEntranceQueue();
        this.refreshStatus();
    }

    private refreshStatus(): void {
        if (!this.rules) return;
        const isFull = this.rules.bufferCount >= this.rules.bufferCapacity;
        if (this.statusLabel) {
            this.statusLabel.string = this.rules.entryCount > 0
                ? `入口等待 ${this.rules.entryCount} 颗 · 格位到达后自动装载`
                : `${this.rules.carrierCount} 个循环位置 · 每位最多叠 3 颗`;
            this.statusLabel.color = isFull ? new Color(202, 56, 82) : new Color(79, 65, 126);
        }
        if (this.countLabel) {
            this.countLabel.string = `${this.rules.bufferCount}/${this.rules.bufferCapacity}`;
        }
        if (this.capacityProgress) {
            const capacityRatio = this.rules.bufferCapacity > 0
                ? this.rules.bufferCount / this.rules.bufferCapacity
                : 0;
            this.capacityProgress.progress = Math.min(1, Math.max(0, capacityRatio));
        }
        this.syncCapacityWarning(this.rules.shouldShowRedWarning(PCH_RED_WARNING_EMPTY_SLOT_THRESHOLD));
        this.runtime.refreshCompletionProgressLabel?.();
        this.runtime.syncSkillButtonRuntimeStates?.();
    }

    private syncCapacityWarning(shouldWarn: boolean): void {
        if (!shouldWarn) {
            this.resetCapacityWarning();
            return;
        }
        if (this.capacityWarningActive) return;
        this.capacityWarningActive = true;
        this.capacityWarningAnimation?.play(PCH_CAPACITY_FULL_WARNING_CLIP);
        this.startWarningOverlayPulse();
    }

    private resetCapacityWarning(): void {
        this.capacityWarningAnimation?.stop();
        this.warningPulseGeneration += 1;
        if (this.warningOverlayOpacity?.isValid) {
            Tween.stopAllByTarget(this.warningOverlayOpacity);
            this.warningOverlayOpacity.opacity = 0;
        }
        if (this.warningOverlay?.isValid) this.warningOverlay.active = false;
        if (this.countLabel?.isValid) {
            this.countLabel.color = PCH_CAPACITY_TEXT_COLOR;
            this.countLabel.outlineColor = PCH_CAPACITY_OUTLINE_COLOR;
        }
        this.capacityWarningActive = false;
    }

    private bindWarningOverlay(): void {
        const effectRoot = this.runtime.requireCanvasUiRoot?.('FxRoot') || null;
        if (!effectRoot?.isValid) throw new Error('[pch-core] warning effect root is unavailable');
        const effectTransform = effectRoot.getComponent(UITransform);
        if (!effectTransform) throw new Error('[pch-core] warning effect root is missing UITransform');
        let overlay = effectRoot.getChildByName('PchRedCapacityWarning');
        if (!overlay?.isValid) {
            overlay = new Node('PchRedCapacityWarning');
            effectRoot.addChild(overlay);
        }
        overlay.layer = Layers.Enum.UI_2D;
        overlay.setSiblingIndex(effectRoot.children.length - 1);
        const transform = overlay.getComponent(UITransform) || overlay.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(effectTransform.contentSize);
        const widget = overlay.getComponent(Widget) || overlay.addComponent(Widget);
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.left = 0;
        widget.right = 0;
        widget.top = 0;
        widget.bottom = 0;
        const sprite = overlay.getComponent(Sprite) || overlay.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.runtime.requireWarningMaskSpriteFrame();
        sprite.color = new Color(255, 0, 0, 255);
        const opacity = overlay.getComponent(UIOpacity) || overlay.addComponent(UIOpacity);
        opacity.opacity = 0;
        overlay.active = false;
        this.warningOverlay = overlay;
        this.warningOverlayOpacity = opacity;
    }

    private startWarningOverlayPulse(): void {
        const overlay = this.warningOverlay;
        const opacity = this.warningOverlayOpacity;
        if (!overlay?.isValid || !opacity?.isValid) {
            throw new Error('[pch-core] warning overlay is unavailable');
        }
        const generation = ++this.warningPulseGeneration;
        Tween.stopAllByTarget(opacity);
        overlay.active = true;
        opacity.opacity = 0;
        const pulse = () => {
            if (!this.capacityWarningActive || generation !== this.warningPulseGeneration || !opacity.isValid) return;
            tween(opacity)
                .to(PCH_RED_WARNING_PULSE_SECONDS, { opacity: PCH_RED_WARNING_MAX_OPACITY })
                .to(PCH_RED_WARNING_PULSE_SECONDS, { opacity: 0 })
                .call(pulse)
                .start();
        };
        pulse();
    }

    private runConveyorSkill(
        kind: 'magnet' | 'brush',
        _timerAlreadyPaused: boolean,
        execute: () => PchSkillResult,
    ): boolean {
        if (!this.rules || !this.root?.isValid || this.runtime.isGameEnd || this.isSkillBusy()) return false;
        this.beginSkillUsePause(kind);
        this.runtime._skillActive = true;
        const skillGeneration = this.runtime.armSkillUsageWatchdog?.(`pch-${kind}`)
            || Math.max(0, Number(this.runtime._activeSkillUsageGeneration) || 0);
        this.inputLocked = true;
        let result: PchSkillResult;
        try {
            result = execute();
        } catch (error) {
            this.inputLocked = false;
            this.runtime.finishSkillUsage?.(skillGeneration);
            throw error;
        }
        if (result.moved > 0 && this.analyticsStats) {
            if (kind === 'magnet') {
                this.analyticsStats.magnetUses += 1;
            } else {
                this.analyticsStats.brushUses += 1;
            }
        }

        const visualMoves = result.moves.map((move) => ({
            move,
            source: this.resolveSkillSourceVisual(move.source),
        }));
        for (const move of result.moves) {
            this.runtime._flyingTargets?.add?.(`${move.target.row},${move.target.col}`);
        }
        this.runtime.renderBoardCells?.(result.boardCells);
        this.renderConveyor();
        this.renderEntranceQueue();
        this.refreshStatus();
        AudioMgr.inst.vibratePlace();

        const finish = () => {
            this.inputLocked = false;
            for (const move of result.moves) {
                this.runtime._flyingTargets?.delete?.(`${move.target.row},${move.target.col}`);
            }
            this.runtime.renderBoardCells?.(result.boardCells);
            this.renderConveyor();
            this.renderEntranceQueue();
            this.refreshStatus();
            this.runtime.checkColorCompletion?.();
            const boardComplete = this.rules?.board.isAllLocked() === true;
            this.runtime.checkGuideStepComplete?.();
            this.runtime.finishSkillUsage?.(skillGeneration);
            if (boardComplete) {
                this.commitFinish();
            } else {
                try {
                    this.runtime.flushPendingColorCompleteEffects?.();
                } catch (error) {
                    console.warn('[pch-skill] optional color-complete effect unavailable:', error);
                }
                this.runtime.refreshEndgameHints?.(`pch-${kind}`);
            }
        };
        if (visualMoves.length === 0) {
            this.runtime.scheduleOnce(finish, 0.05);
            return result.boardCells.length > 0;
        }

        let remaining = visualMoves.length;
        visualMoves.forEach(({ move, source }, index) => {
            const bean = this.createFlyBean(
                `PchSkill-${kind}-${index}`,
                move.source.colorId,
                source.size,
                source.world,
            );
            const targetWorld = this.getBoardCellWorldPosition(move.target.row, move.target.col);
            const targetLocal = this.root!.getComponent(UITransform)!.convertToNodeSpaceAR(targetWorld);
            const targetSize = Math.max(1, this.runtime.getBoardFlyBeanSizeInLayer?.(this.root) || source.size);
            tween(bean)
                .delay(index * PCH_SKILL_STAGGER_SECONDS)
                .to(PCH_SKILL_TRANSFER_SECONDS, {
                    position: targetLocal,
                    scale: new Vec3(targetSize / source.size, targetSize / source.size, 1),
                }, { easing: 'sineOut' })
                .call(() => {
                    this.destroyFlyBean(bean);
                    this.runtime._flyingTargets?.delete?.(`${move.target.row},${move.target.col}`);
                    this.runtime.renderBoardCell?.(move.target.row, move.target.col);
                    AudioMgr.inst.play('settle');
                    this.playSkillTargetPulse(move.target, () => {});
                    remaining -= 1;
                    if (remaining <= 0) finish();
                })
                .start();
        });
        return true;
    }

    private resolveSkillSourceVisual(source: PchSkillBeanSource): { world: Vec3; size: number } {
        if (source.kind === 'board') {
            return {
                world: this.getBoardCellWorldPosition(source.row, source.col),
                size: Math.max(1, this.runtime.getBoardFlyBeanSizeInLayer?.(this.root) || 31),
            };
        }
        if (source.kind === 'carrier') {
            const beanNode = this.carrierNodes[source.carrierIndex]
                ?.getChildByName(`PchStackBean-${source.carrierIndex}-${source.layerIndex}`);
            const transform = beanNode?.getComponent(UITransform);
            if (!beanNode?.isValid || !transform) {
                throw new Error(`[pch-skill] missing carrier source ${source.carrierIndex}:${source.layerIndex}`);
            }
            return {
                world: transform.convertToWorldSpaceAR(new Vec3()),
                size: Math.max(1, 31 * (this.runtime.getNodeScaleInLayer?.(beanNode, this.root) || 1)),
            };
        }
        const beanNode = this.entryQueueLayer?.getChildByName(`PchEntryBean-${source.index}`);
        const transform = beanNode?.getComponent(UITransform);
        if (!beanNode?.isValid || !transform) {
            throw new Error(`[pch-skill] missing entry source ${source.index}`);
        }
        return {
            world: transform.convertToWorldSpaceAR(new Vec3()),
            size: Math.max(
                1,
                PCH_STACK_BEAN_SIZE * (this.runtime.getNodeScaleInLayer?.(beanNode, this.root) || 1),
            ),
        };
    }

    private playSkillTargetPulse(target: { row: number; col: number }, onDone: () => void): void {
        const node = this.runtime.cellNodes?.[target.row]?.[target.col] || null;
        if (!node?.isValid) {
            onDone();
            return;
        }
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
        this.activePulseNodes.add(node);
        tween(node)
            .to(0.07, { scale: new Vec3(1.26, 1.26, 1) })
            .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .call(() => {
                this.activePulseNodes.delete(node);
                onDone();
            })
            .start();
    }

    private renderConveyor(): void {
        if (!this.rules || !this.belt || !this.carrierLayer || !this.carrierTemplate) return;
        const availableCarriers = this.getOrderedConveyorCarriers(this.carrierLayer);
        availableCarriers.forEach((carrier) => {
            this.resetConveyorCarrier(carrier);
            carrier.active = false;
        });
        this.carrierNodes = [];
        this.carrierDirectionNodes = [];
        this.rules.carriers.forEach((stack, carrierIndex) => {
            let carrier = availableCarriers[carrierIndex];
            if (!carrier) {
                carrier = instantiate(this.carrierTemplate!);
                carrier.name = `PchCarrier-${carrierIndex}`;
                this.carrierLayer!.addChild(carrier);
                availableCarriers[carrierIndex] = carrier;
            }
            this.carrierNodes[carrierIndex] = carrier;
            this.renderConveyorCarrierVisual(carrier, stack, carrierIndex);
        });
        this.updateBeltPositions();
    }

    private renderConveyorCarrier(carrierIndex: number): void {
        if (!this.rules) return;
        const carrier = this.carrierNodes[carrierIndex];
        const stack = this.rules.carriers[carrierIndex];
        if (!carrier?.isValid || !stack) {
            throw new Error(`[pch-core] carrier ${carrierIndex} is unavailable for incremental render`);
        }
        this.resetConveyorCarrier(carrier);
        this.renderConveyorCarrierVisual(carrier, stack, carrierIndex);
    }

    private renderConveyorCarrierVisual(carrier: Node, stack: number[], carrierIndex: number): void {
        carrier.active = true;
        const direction = carrier.getChildByName('Direction');
        if (!direction?.isValid || !direction.getComponent(Sprite)?.spriteFrame) {
            throw new Error(`[pch-core] carrier ${carrierIndex} is missing its scene-authored Direction`);
        }
        direction.active = stack.length === 0;
        for (let layer = 0; layer < stack.length; layer += 1) {
            const colorId = stack[layer];
            const beanName = `PchStackBean-${carrierIndex}-${layer}`;
            let bean = carrier.getChildByName(beanName);
            if (!bean) {
                bean = this.makeNode(
                    beanName,
                    carrier,
                    PCH_STACK_BEAN_SIZE,
                    PCH_STACK_BEAN_SIZE,
                    0,
                    layer * PCH_STACK_LAYER_OFFSET,
                );
                bean.addComponent(Sprite);
            }
            this.configureStackBean(
                bean,
                beanName,
                colorId,
                layer,
                stack.length,
                `pch-carrier:${carrierIndex}:layer:${layer}:color:${colorId}`,
            );
            bean.setSiblingIndex(layer + 1);
        }
        this.carrierDirectionNodes[carrierIndex] = direction;
    }

    private configureStackBean(
        bean: Node,
        name: string,
        colorId: number,
        layer: number,
        stackLength: number,
        assetContext: string,
    ): void {
        const transform = bean.getComponent(UITransform);
        const sprite = bean.getComponent(Sprite);
        if (!transform || !sprite) throw new Error(`[pch-core] ${name} is missing its stack bean components`);
        bean.name = name;
        bean.active = true;
        bean.setPosition(0, layer * PCH_STACK_LAYER_OFFSET, 0);
        bean.setScale(1, 1, 1);
        transform.setContentSize(PCH_STACK_BEAN_SIZE, PCH_STACK_BEAN_SIZE);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.runtime.requireRenderReadySpriteFrame(
            this.runtime.getBeanSpriteFrame(colorId, false),
            assetContext,
        );
        sprite.color = new Color(
            255,
            255,
            255,
            layer === stackLength - 1 ? 255 : PCH_STACK_LOWER_ALPHA,
        );
    }

    private renderEntranceQueue(): void {
        if (!this.rules) return;
        if (!this.entryQueueLayer?.isValid || !this.entryBeanTemplate?.isValid) {
            throw new Error('[pch-core] conveyor entry queue hierarchy is unavailable');
        }
        const existingBeans = this.entryQueueLayer.children
            .filter((node) => /^PchEntryBean-\d+$/.test(node.name))
            .sort((left, right) => Number(left.name.slice('PchEntryBean-'.length))
                - Number(right.name.slice('PchEntryBean-'.length)));
        const visibleColors = this.rules.entryColors.slice(0, this.rules.readyEntryCount);
        visibleColors.forEach((colorId, layer) => {
            let bean = existingBeans[layer];
            if (!bean) {
                bean = instantiate(this.entryBeanTemplate!);
                this.entryQueueLayer!.addChild(bean);
            }
            this.configureStackBean(
                bean,
                `PchEntryBean-${layer}`,
                colorId,
                layer,
                visibleColors.length,
                `pch-entry:${layer}:color:${colorId}`,
            );
            bean.setSiblingIndex(layer + 1);
        });
        existingBeans.slice(visibleColors.length).forEach((bean) => {
            bean.active = false;
        });
        this.syncTableEntryDoors(this.rules.entryCount > 0);
    }

    private syncTableEntryDoors(open: boolean): void {
        const doors = this.activeEntryDoors;
        if (!doors) return;
        const nextState = open ? 'open' : 'closed';
        if (this.entryDoorState === nextState) return;
        this.entryDoorState = nextState;
        if (this.entryDoorTween) {
            this.entryDoorTween.stop();
            this.entryDoorTween = null;
        }
        const targetWidth = open ? PCH_ENTRY_DOOR_OPEN_WIDTH : PCH_ENTRY_DOOR_CLOSED_WIDTH;
        const currentWidth = doors.left.contentSize.width;
        if (Math.abs(currentWidth - targetWidth) < 0.000001) {
            this.setTableEntryDoorWidth(doors, targetWidth);
            return;
        }
        const state = { width: currentWidth };
        this.entryDoorTween = tween(state)
            .to(PCH_ENTRY_DOOR_TWEEN_SECONDS, { width: targetWidth }, {
                easing: 'quadOut',
                onUpdate: (target: { width: number }) => {
                    this.setTableEntryDoorWidth(doors, target.width);
                },
            })
            .call(() => {
                this.setTableEntryDoorWidth(doors, targetWidth);
                this.entryDoorTween = null;
            })
            .start();
    }

    private resetTableEntryDoorAnimation(): void {
        if (this.entryDoorTween) {
            this.entryDoorTween.stop();
            this.entryDoorTween = null;
        }
        this.entryDoorState = 'none';
        if (this.normalEntryDoors) {
            this.setTableEntryDoorWidth(this.normalEntryDoors, PCH_ENTRY_DOOR_CLOSED_WIDTH);
        }
    }

    private setTableEntryDoorWidth(doors: ConveyorEntryDoorBindings, width: number): void {
        if (!doors.left.node?.isValid || !doors.right.node?.isValid) return;
        doors.left.setContentSize(width, PCH_ENTRY_DOOR_HEIGHT);
        doors.right.setContentSize(width, PCH_ENTRY_DOOR_HEIGHT);
    }

    private prepareBeltPath(tableType: RainbowConveyorTableType): void {
        this.beltPath = RAINBOW_CONVEYOR_PATHS[tableType]
            .map(([x, y]) => new Vec3(x * RAINBOW_CONVEYOR_SOURCE_SCALE, y * RAINBOW_CONVEYOR_SOURCE_SCALE));
        this.beltPathDistances = [0];
        this.beltPathLength = 0;
        for (let i = 0; i < this.beltPath.length; i += 1) {
            const next = this.beltPath[(i + 1) % this.beltPath.length];
            this.beltPathLength += Vec3.distance(this.beltPath[i], next);
            if (i < this.beltPath.length - 1) this.beltPathDistances.push(this.beltPathLength);
        }
        const exitIndex = RAINBOW_CONVEYOR_EXIT_POINT_INDEX[tableType];
        if (exitIndex <= 0 || exitIndex >= this.beltPathDistances.length || this.beltPathLength <= 0) {
            throw new Error(`[pch-core] invalid original-package conveyor path for table type ${tableType}`);
        }
        this.exitPathProgress = this.beltPathDistances[exitIndex] / this.beltPathLength;
    }

    private requireConveyorNode(parent: Node, name: string, path: string): Node {
        const node = parent.getChildByName(name);
        if (!node?.isValid || !node.getComponent(UITransform)) {
            throw new Error(`[pch-core] Game.scene must provide UITransform on ${path}`);
        }
        return node;
    }

    private requireConveyorSprite(parent: Node, name: string, path: string): Node {
        const node = this.requireConveyorNode(parent, name, path);
        const sprite = node.getComponent(Sprite);
        if (!sprite?.spriteFrame) {
            throw new Error(`[pch-core] Game.scene must provide SpriteFrame on ${path}`);
        }
        return node;
    }

    private requireConveyorLabel(parent: Node, name: string, path: string): Label {
        const node = this.requireConveyorNode(parent, name, path);
        const label = node.getComponent(Label);
        if (!label) throw new Error(`[pch-core] Game.scene must provide Label on ${path}`);
        return label;
    }

    private bindConveyorLayout(root: Node, name: 'NormalLayout' | 'CompactLayout'): ConveyorLayoutBindings {
        const basePath = `GameplayFixedRoot/PchConveyorRoot/${name}`;
        const node = this.requireConveyorNode(root, name, basePath);
        const track = this.requireConveyorNode(node, 'PchMovingTrack', `${basePath}/PchMovingTrack`);
        const trackPartNames = RAINBOW_CONVEYOR_TRACK_PARTS[name];
        if (track.children.length !== trackPartNames.length
            || track.children.some((part, index) => part.name !== trackPartNames[index])) {
            throw new Error(`[pch-core] Game.scene has an invalid original-package track hierarchy on ${basePath}`);
        }
        for (const partName of trackPartNames) {
            this.requireConveyorSprite(track, partName, `${basePath}/PchMovingTrack/${partName}`);
        }
        const carrierLayer = this.requireConveyorNode(node, 'CarrierLayer', `${basePath}/CarrierLayer`);
        const carrierTemplate = this.requireConveyorNode(
            carrierLayer,
            'PchCarrierTemplate',
            `${basePath}/CarrierLayer/PchCarrierTemplate`,
        );
        if (carrierTemplate.active) {
            throw new Error(`[pch-core] Game.scene carrier template must be inactive on ${basePath}`);
        }
        this.requireConveyorSprite(
            carrierTemplate,
            'Direction',
            `${basePath}/CarrierLayer/PchCarrierTemplate/Direction`,
        );
        const authoredCarrierNodes = this.getOrderedConveyorCarriers(carrierLayer);
        if (!this.rules || authoredCarrierNodes.length < this.rules.initialCarrierCount) {
            throw new Error(
                `[pch-core] Game.scene must provide ${this.rules?.initialCarrierCount || 0} authored carriers on ${basePath}`,
            );
        }
        authoredCarrierNodes.forEach((carrier, carrierIndex) => {
            this.requireConveyorSprite(
                carrier,
                'Direction',
                `${basePath}/CarrierLayer/PchCarrier-${carrierIndex}/Direction`,
            );
        });
        const tableEntry = this.requireConveyorNode(node, 'TableEntryItem', `${basePath}/TableEntryItem`);
        const tableEntryVisual = this.requireConveyorNode(tableEntry, 'Node', `${basePath}/TableEntryItem/Node`);
        for (const shellName of ['1', '2']) {
            const shell = this.requireConveyorSprite(
                tableEntryVisual,
                shellName,
                `${basePath}/TableEntryItem/Node/${shellName}`,
            );
            this.requireConveyorNode(shell, 'Point', `${basePath}/TableEntryItem/Node/${shellName}/Point`);
        }
        const pieces = this.requireConveyorNode(tableEntry, 'Pieces', `${basePath}/TableEntryItem/Pieces`);
        const leftDoor = this.requireConveyorSprite(
            pieces,
            'L',
            `${basePath}/TableEntryItem/Pieces/L`,
        ).getComponent(UITransform)!;
        const rightDoor = this.requireConveyorSprite(
            pieces,
            'R',
            `${basePath}/TableEntryItem/Pieces/R`,
        ).getComponent(UITransform)!;
        const tableEntryImage = this.requireConveyorSprite(
            pieces,
            'Img',
            `${basePath}/TableEntryItem/Pieces/Img`,
        );
        const entryFlyAnchor = tableEntryImage.getChildByName('EntranceFlyAnchor');
        if (!entryFlyAnchor?.isValid) {
            throw new Error(
                `[pch-core] Game.scene must provide Node on ${basePath}/TableEntryItem/Pieces/Img/EntranceFlyAnchor`,
            );
        }
        const entryQueueLayer = this.requireConveyorNode(
            tableEntryImage,
            'EntranceQueueLayer',
            `${basePath}/TableEntryItem/Pieces/Img/EntranceQueueLayer`,
        );
        const entryBeanTemplate = this.requireConveyorNode(
            entryQueueLayer,
            'PchEntryBeanTemplate',
            `${basePath}/TableEntryItem/Pieces/Img/EntranceQueueLayer/PchEntryBeanTemplate`,
        );
        if (entryBeanTemplate.active || !entryBeanTemplate.getComponent(Sprite)) {
            throw new Error(
                `[pch-core] Game.scene must provide an inactive Sprite template on ${basePath}/TableEntryItem/Pieces/Img/EntranceQueueLayer/PchEntryBeanTemplate`,
            );
        }
        const exitNode = this.requireConveyorNode(node, 'PchExit', `${basePath}/PchExit`);
        this.requireConveyorSprite(exitNode, 'Visual', `${basePath}/PchExit/Visual`);
        const arrow = this.requireConveyorNode(exitNode, 'Arrow', `${basePath}/PchExit/Arrow`);
        const exitArrowGroups: ConveyorExitArrowGroupBindings[] = [];
        for (const [positionName, arrowNames, phaseOffsetSeconds] of [
            ['Pos01', ['Jt_02', 'Jt_04'], PCH_EXIT_ARROW_PHASE_OFFSET_SECONDS],
            ['Pos02', ['Jt_01', 'Jt_03'], 0],
        ] as const) {
            const position = this.requireConveyorNode(arrow, positionName, `${basePath}/PchExit/Arrow/${positionName}`);
            const opacities: UIOpacity[] = [];
            for (const arrowName of arrowNames) {
                const arrowNode = this.requireConveyorSprite(
                    position,
                    arrowName,
                    `${basePath}/PchExit/Arrow/${positionName}/${arrowName}`,
                );
                opacities.push(arrowNode.getComponent(UIOpacity) || arrowNode.addComponent(UIOpacity));
            }
            exitArrowGroups.push({
                position,
                authoredPosition: position.position.clone(),
                phaseOffsetSeconds,
                opacities,
            });
        }
        const capacityBadge = this.requireConveyorNode(node, 'PchCapacityBadge', `${basePath}/PchCapacityBadge`);
        const progressTrack = this.requireConveyorSprite(
            capacityBadge,
            'ProgressTrack',
            `${basePath}/PchCapacityBadge/ProgressTrack`,
        );
        this.requireConveyorSprite(
            progressTrack,
            'Background',
            `${basePath}/PchCapacityBadge/ProgressTrack/Background`,
        );
        const progressBarNode = this.requireConveyorSprite(
            progressTrack,
            'Bar',
            `${basePath}/PchCapacityBadge/ProgressTrack/Bar`,
        );
        const capacityMask = progressTrack.getComponent(Mask);
        if (!capacityMask || capacityMask.type !== Mask.Type.SPRITE_STENCIL) {
            throw new Error(`[pch-core] Game.scene must provide SpriteStencil Mask on ${basePath}/PchCapacityBadge/ProgressTrack`);
        }
        const capacityProgress = progressTrack.getComponent(ProgressBar);
        if (!capacityProgress
            || capacityProgress.mode !== ProgressBar.Mode.HORIZONTAL
            || capacityProgress.barSprite !== progressBarNode.getComponent(Sprite)) {
            throw new Error(`[pch-core] Game.scene must provide horizontal ProgressBar on ${basePath}/PchCapacityBadge/ProgressTrack`);
        }
        const countLabel = this.requireConveyorLabel(
            capacityBadge,
            'CapacityCount',
            `${basePath}/PchCapacityBadge/CapacityCount`,
        );
        const capacityWarningAnimation = countLabel.node.getComponent(Animation);
        if (!capacityWarningAnimation
            || capacityWarningAnimation.playOnLoad
            || capacityWarningAnimation.clips.length !== 1
            || capacityWarningAnimation.defaultClip?.name !== PCH_CAPACITY_FULL_WARNING_CLIP
            || capacityWarningAnimation.clips[0]?.name !== PCH_CAPACITY_FULL_WARNING_CLIP) {
            throw new Error(
                `[pch-core] Game.scene must provide one stopped ${PCH_CAPACITY_FULL_WARNING_CLIP} Animation on ${basePath}/PchCapacityBadge/CapacityCount`,
            );
        }
        const adButton = this.requireConveyorNode(node, 'PchCapacityAdButton', `${basePath}/PchCapacityAdButton`);
        if (!adButton.getComponent(Button)) {
            throw new Error(`[pch-core] Game.scene must provide Button on ${basePath}/PchCapacityAdButton`);
        }
        this.requireConveyorSprite(adButton, 'Visual', `${basePath}/PchCapacityAdButton/Visual`);
        this.requireConveyorSprite(adButton, 'ExpandIcon', `${basePath}/PchCapacityAdButton/ExpandIcon`);
        return {
            node,
            carrierLayer,
            carrierTemplate,
            authoredCarrierNodes,
            entryFlyAnchor,
            entryQueueLayer,
            entryBeanTemplate,
            entrancePulseNode: tableEntryImage,
            exitNode,
            exitArrowGroups,
            capacityBadge,
            capacityProgress,
            countLabel,
            capacityWarningAnimation,
            entryDoors: { left: leftDoor, right: rightDoor },
            adButton,
        };
    }

    private getOrderedConveyorCarriers(carrierLayer: Node): Node[] {
        const carriers = carrierLayer.children
            .filter((node) => /^PchCarrier-\d+$/.test(node.name))
            .sort((left, right) => Number(left.name.slice('PchCarrier-'.length))
                - Number(right.name.slice('PchCarrier-'.length)));
        carriers.forEach((carrier, index) => {
            if (carrier.name !== `PchCarrier-${index}`) {
                throw new Error(`[pch-core] carrier hierarchy must be consecutive at ${carrierLayer.name}/PchCarrier-${index}`);
            }
        });
        return carriers;
    }

    private resetConveyorCarrier(carrier: Node): void {
        Tween.stopAllByTarget(carrier);
        carrier.setScale(1, 1, 1);
        carrier.children
            .filter((node) => node.name !== 'Direction')
            .forEach((node) => {
                if (/^PchStackBean-\d+-\d+$/.test(node.name)) {
                    this.stopNodeTreeTweens(node);
                    node.active = false;
                    node.setScale(1, 1, 1);
                    return;
                }
                node.destroy();
            });
        const direction = carrier.getChildByName('Direction');
        if (!direction?.isValid || !direction.getComponent(Sprite)?.spriteFrame) {
            throw new Error(`[pch-core] ${carrier.name} lost its hierarchy-owned Direction`);
        }
        direction.active = true;
    }

    private clearConveyorLayoutRuntime(layout: Node): void {
        const carrierLayer = layout.getChildByName('CarrierLayer');
        if (carrierLayer) {
            this.getOrderedConveyorCarriers(carrierLayer).forEach((carrier) => {
                this.resetConveyorCarrier(carrier);
                carrier.active = false;
            });
        }
        const queueLayer = layout.getChildByName('TableEntryItem')
            ?.getChildByName('Pieces')
            ?.getChildByName('Img')
            ?.getChildByName('EntranceQueueLayer');
        queueLayer?.children
            .filter((node) => /^PchEntryBean-\d+$/.test(node.name))
            .forEach((node) => node.destroy());
        layout.children
            .filter((node) => node.name.startsWith('PchLabel-+'))
            .forEach((node) => node.destroy());
    }

    private showOpeningFeatureGuide(parent: Node): void {
        const logicalLevelId = Math.max(1, Math.floor(Number(this.runtime.getActiveLogicalLevelId?.()) || 1));
        if (this.runtime._activeGameplayEntryMode !== 'main') return;
        const shouldShowGuide = logicalLevelId === 1
            || (logicalLevelId === 2 && !!this.speedButton?.isValid)
            || (logicalLevelId === 3 && !!this.adButton?.isValid);
        if (!shouldShowGuide) return;
        if (!this.runtime.getSF?.('guide_bubble_frame')) {
            if (typeof this.runtime._ensureSpriteFramesByName !== 'function') {
                throw new Error('[pch-core] opening guide bubble frame loader is unavailable');
            }
            this.inputLocked = true;
            this.runtime._ensureSpriteFramesByName(['guide_bubble_frame'], (error?: Error) => {
                if (error) throw error;
                if (!parent.isValid || !this.rules || this.runtime.isGameEnd) return;
                this.showOpeningFeatureGuide(parent);
            });
            return;
        }
        if (logicalLevelId === 1) {
            this.showLevelOneBoardGuide(parent);
        } else if (logicalLevelId === 2 && this.speedButton?.isValid) {
            this.showOpeningTargetGuide(parent, this.speedButton, 'PchLevelTwoSpeedGuide', '点击开启两倍速', this.onOpeningGuideDoubleSpeed);
        } else if (logicalLevelId === 3 && this.adButton?.isValid) {
            this.showOpeningTargetGuide(parent, this.adButton, 'PchLevelThreeCapacityGuide', '点击扩容按钮\n增加12个位置', this.onOpeningGuideFreeCapacity);
        }
    }

    private showLevelOneBoardGuide(parent: Node): void {
        if (!this.rules) return;
        const colors = new Set<number>();
        this.openingGuideLevelOneCells = [];
        for (const cell of this.rules.cells) {
            if (cell.locked || cell.current <= 0 || colors.has(cell.current)) continue;
            colors.add(cell.current);
            this.openingGuideLevelOneCells.push({ row: cell.row, col: cell.col });
            if (this.openingGuideLevelOneCells.length >= 2) break;
        }
        if (this.openingGuideLevelOneCells.length < 2) {
            throw new Error('[pch-core] level 1 requires two playable guide colors');
        }
        this.openingGuideLevelOneStep = 0;
        this.showLevelOneBoardGuideStep(parent);
    }

    private showLevelOneBoardGuideStep(parent: Node): void {
        const cell = this.openingGuideLevelOneCells[this.openingGuideLevelOneStep];
        if (!cell) throw new Error('[pch-core] level 1 guide cell is unavailable');
        const parentTransform = parent.getComponent(UITransform);
        if (!parentTransform) throw new Error('[pch-core] opening guide parent transform is unavailable');
        const targetColor = this.rules?.board.currentColors[cell.row]?.[cell.col] || 0;
        const targetCells = this.rules?.cells.filter((item) => !item.locked && item.current === targetColor) || [];
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const targetCell of targetCells) {
            const node = this.runtime.cellNodes?.[targetCell.row]?.[targetCell.col] || null;
            const bounds = node?.getComponent(UITransform)?.getBoundingBoxToWorld();
            if (!bounds) throw new Error('[pch-core] level 1 guide bean bounds are unavailable');
            minX = Math.min(minX, bounds.xMin);
            maxX = Math.max(maxX, bounds.xMax);
            minY = Math.min(minY, bounds.yMin);
            maxY = Math.max(maxY, bounds.yMax);
        }
        if (targetColor <= 0 || targetCells.length === 0 || !Number.isFinite(minX + maxX + minY + maxY)) {
            throw new Error('[pch-core] level 1 guide color bounds are unavailable');
        }
        const bottomLeft = parentTransform.convertToNodeSpaceAR(new Vec3(minX, minY, 0));
        const topRight = parentTransform.convertToNodeSpaceAR(new Vec3(maxX, maxY, 0));
        const targetLocal = new Vec3((bottomLeft.x + topRight.x) / 2, (bottomLeft.y + topRight.y) / 2, 0);
        const copy = this.openingGuideLevelOneStep === 0
            ? '点击白色豆豆'
            : '再点击蓝色豆豆';
        this.showOpeningTargetGuideAt(
            parent,
            targetLocal,
            Math.abs(topRight.x - bottomLeft.x),
            Math.abs(topRight.y - bottomLeft.y),
            `PchLevelOneGuideStep${this.openingGuideLevelOneStep + 1}`,
            copy,
            this.onOpeningGuideLevelOneTap,
            true,
        );
    }

    private showOpeningTargetGuide(
        parent: Node,
        target: Node,
        guideName: string,
        copy: string,
        onTargetTap: (event: any) => void,
        promptYOverride?: number,
    ): void {
        const parentTransform = parent.getComponent(UITransform);
        const targetTransform = target.getComponent(UITransform);
        if (!parentTransform || !targetTransform) {
            throw new Error('[pch-core] opening guide target transform is unavailable');
        }
        const targetBounds = targetTransform.getBoundingBoxToWorld();
        const bottomLeft = parentTransform.convertToNodeSpaceAR(new Vec3(targetBounds.xMin, targetBounds.yMin, 0));
        const topRight = parentTransform.convertToNodeSpaceAR(new Vec3(targetBounds.xMax, targetBounds.yMax, 0));
        const targetLocal = new Vec3((bottomLeft.x + topRight.x) / 2, (bottomLeft.y + topRight.y) / 2, 0);
        const targetWidth = Math.abs(topRight.x - bottomLeft.x);
        const targetHeight = Math.abs(topRight.y - bottomLeft.y);
        this.showOpeningTargetGuideAt(parent, targetLocal, targetWidth, targetHeight, guideName, copy, onTargetTap, true, promptYOverride);
    }

    private showOpeningTargetGuideAt(
        parent: Node,
        targetLocal: Vec3,
        targetWidth: number,
        targetHeight: number,
        guideName: string,
        copy: string,
        onTargetTap: (event: any) => void,
        useGuideBubbleFrame = false,
        promptYOverride?: number,
    ): void {
        this.inputLocked = true;
        this.openingGuide = this.makeNode(guideName, parent, 720, 1280, 0, 0);
        this.openingGuide.setSiblingIndex(Math.max(0, parent.children.length - 1));
        const isLevelOneBoardGuide = guideName.startsWith('PchLevelOneGuideStep');
        const isLevelOneFirstStep = guideName === 'PchLevelOneGuideStep1';
        const isLevelTwoSpeedGuide = guideName === 'PchLevelTwoSpeedGuide';
        const isLevelThreeCapacityGuide = guideName === 'PchLevelThreeCapacityGuide';
        const isStarterOpeningGuide = isLevelOneBoardGuide || isLevelTwoSpeedGuide || isLevelThreeCapacityGuide;
        this.openingGuideTarget = this.makeNode('OpeningGuideTapTarget', parent, targetWidth + 24, targetHeight + 24, targetLocal.x, targetLocal.y);
        this.openingGuideTarget.setSiblingIndex(Math.max(0, parent.children.length - 1));
        const button = this.openingGuideTarget.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.92;
        this.openingGuideTarget.on(Node.EventType.TOUCH_END, onTargetTap, this);

        const promptWidth = isLevelOneBoardGuide ? 340 : (isLevelTwoSpeedGuide ? 300 : (isLevelThreeCapacityGuide ? 330 : (useGuideBubbleFrame ? 560 : 500)));
        const promptHeight = isLevelOneBoardGuide ? 216 : (isLevelTwoSpeedGuide ? 156 : (isLevelThreeCapacityGuide ? 184 : (useGuideBubbleFrame ? 128 : 64)));
        const sharedPromptY = promptYOverride ?? Math.max(-520, targetLocal.y - targetHeight / 2 - promptHeight / 2 - 40);
        const promptY = isLevelOneBoardGuide
            ? Math.min(isLevelOneFirstStep ? 520 : 500, targetLocal.y + targetHeight / 2 + promptHeight / 2 + (isLevelOneFirstStep ? 76 : 44))
            : (isLevelTwoSpeedGuide
                ? Math.max(-520, targetLocal.y - targetHeight / 2 - promptHeight / 2 - 24)
                : (isLevelThreeCapacityGuide
                    ? targetLocal.y + targetHeight / 2 + promptHeight / 2 + 24
                    : sharedPromptY));
        const promptXLimit = isLevelThreeCapacityGuide ? 130 : (useGuideBubbleFrame ? 80 : 100);
        const promptX = isLevelTwoSpeedGuide
            ? targetLocal.x
            : Math.max(-promptXLimit, Math.min(promptXLimit, targetLocal.x));
        const prompt = this.makeNode('OpeningGuidePrompt', this.openingGuide, promptWidth, promptHeight, promptX, promptY);
        if (useGuideBubbleFrame) {
            const guideBubbleFrame = this.runtime.getSF?.('guide_bubble_frame') || null;
            if (!guideBubbleFrame) {
                throw new Error('[pch-core] missing opening guide bubble frame');
            }
            if (typeof this.runtime._applySpriteFrame !== 'function') {
                throw new Error('[pch-core] guide bubble sprite applicator is unavailable');
            }
            const bubbleBackground = this.makeNode('OpeningGuideBubbleBackground', prompt, promptWidth, promptHeight, 0, 0);
            this.runtime._applySpriteFrame(bubbleBackground, guideBubbleFrame, promptWidth, promptHeight, Sprite.Type.SLICED);
            const bubbleScaleY = isStarterOpeningGuide ? 0.78 : 1;
            bubbleBackground.setScale(1, isLevelTwoSpeedGuide ? -bubbleScaleY : bubbleScaleY, 1);
            if (isLevelOneBoardGuide) {
                const promptLabel = this.makeLabel(prompt, copy, 38, new Color('#3C285D'), 0, 28, promptWidth - 48);
                (promptLabel as Label & { isBold?: boolean }).isBold = true;
            } else if (isLevelTwoSpeedGuide) {
                const promptLabel = this.makeLabel(prompt, copy, 32, new Color('#3C285D'), 0, -16, promptWidth - 48);
                (promptLabel as Label & { isBold?: boolean }).isBold = true;
            } else if (isLevelThreeCapacityGuide) {
                const [title, detail] = copy.split('\n', 2);
                const titleLabel = this.makeLabel(prompt, title, 32, new Color('#3C285D'), 0, 48, promptWidth - 48);
                const detailLabel = this.makeLabel(prompt, detail || title, 28, new Color('#3C285D'), 0, 4, promptWidth - 56);
                (titleLabel as Label & { isBold?: boolean }).isBold = true;
                (detailLabel as Label & { isBold?: boolean }).isBold = true;
            } else {
                const promptLabel = this.makeLabel(prompt, copy, 28, new Color('#7162A2'), 0, 22, promptWidth - 48);
                (promptLabel as Label & { isBold?: boolean }).isBold = true;
            }
        } else {
            const promptGraphics = prompt.addComponent(Graphics);
            promptGraphics.fillColor = new Color(53, 43, 117, 245);
            promptGraphics.roundRect(-250, -32, 500, 64, 20);
            promptGraphics.fill();
            this.makeLabel(prompt, copy, 25, Color.WHITE, 0, 0, 470);
        }

        const overlayRoot = this.runtime.requireCanvasUiRoot?.('OverlayRoot') || null;
        const sourceHand = overlayRoot?.getChildByName('TutorialGuideHands')?.getChildByName('GuideHandSingle') || null;
        if (!sourceHand?.getComponent(Sprite)) {
            throw new Error('[pch-core] original GuideHandSingle is unavailable');
        }
        const hand = instantiate(sourceHand);
        hand.name = 'OpeningGuideHand';
        this.openingGuide.addChild(hand);
        hand.active = true;
        const handRestOffsetY = isLevelTwoSpeedGuide ? -52 : -76;
        const handPressOffsetY = isLevelTwoSpeedGuide ? -36 : -60;
        hand.setPosition(targetLocal.x + 42, targetLocal.y + handRestOffsetY, 0);
        hand.setScale(0.92, 0.92, 1);
        tween(hand)
            .repeatForever(
                tween()
                    .to(0.42, { position: new Vec3(targetLocal.x + 42, targetLocal.y + handPressOffsetY, 0), scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
                    .to(0.42, { position: new Vec3(targetLocal.x + 42, targetLocal.y + handRestOffsetY, 0), scale: new Vec3(0.92, 0.92, 1) }, { easing: 'sineInOut' }),
            )
            .start();
        this.trackOpeningGuideEvent('pch_guide_step_shown', true, 'shown', guideName);
    }

    private onOpeningGuideLevelOneTap(event: any): void {
        event.propagationStopped = true;
        const cell = this.openingGuideLevelOneCells[this.openingGuideLevelOneStep];
        if (!cell || !this.rules || this.runtime.isGameEnd) return;
        const outcome = this.handleBoardTap(cell.row, cell.col);
        const success = outcome === 'stored' || outcome === 'partial';
        this.trackOpeningGuideEvent('pch_guide_tap_result', success, outcome);
        if (!success) return;
        this.trackOpeningGuideEvent('pch_guide_step_done', true, 'completed');
        if (this.openingGuideLevelOneStep >= 1) {
            this.dismissOpeningGuide();
            return;
        }
        this.clearOpeningGuideNodes();
        this.openingGuideLevelOneStep += 1;
        this.showLevelOneBoardGuideStep(this.runtime.getGameplayFixedRoot());
    }

    private onOpeningGuideDoubleSpeed(event: any): void {
        event.propagationStopped = true;
        if (!this.rules || this.runtime.isGameEnd) return;
        this.setManualSpeedMultiplier(2);
        this.trackOpeningGuideEvent('pch_guide_tap_result', true, 'enabled_2x');
        this.trackOpeningGuideEvent('pch_guide_step_done', true, 'completed');
        this.refreshSpeedButtonState();
        if (this.statusLabel) this.statusLabel.string = '2 倍速度已开启';
        this.dismissOpeningGuide();
        AudioMgr.inst.play('button');
    }

    private onOpeningGuideFreeCapacity(event: any): void {
        event.propagationStopped = true;
        if (!this.rules || this.runtime.isGameEnd) return;
        AudioMgr.inst.play('button');
        const expanded = this.expandCapacity();
        this.trackOpeningGuideEvent(
            'pch_guide_tap_result',
            expanded,
            expanded ? 'capacity_expanded' : 'capacity_expand_failed',
        );
        if (!expanded) return;
        this.trackOpeningGuideEvent('pch_guide_step_done', true, 'completed');
        this.runtime.markDynamicCountdownAssisted?.();
        this.dismissOpeningGuide();
        this.runtime.showToast('传送带已扩容 +12');
    }

    private dismissOpeningGuide(): void {
        this.clearOpeningGuideNodes();
        this.openingGuideLevelOneCells = [];
        this.openingGuideLevelOneStep = -1;
        this.inputLocked = false;
        this.runtime.syncSkillButtonRuntimeStates?.();
    }

    private clearOpeningGuideNodes(): void {
        if (this.openingGuide?.isValid) this.openingGuide.destroy();
        if (this.openingGuideTarget?.isValid) this.openingGuideTarget.destroy();
        this.openingGuide = null;
        this.openingGuideTarget = null;
    }

    private bindSpeedButton(parent: Node, visible: boolean): void {
        const speedButton = parent.getChildByName('PchSpeedButton');
        if (!speedButton?.isValid) {
            throw new Error('[pch-core] Game.scene is missing TopBarGroup/PchSpeedButton');
        }
        if (!speedButton.getComponent(UITransform)) {
            throw new Error('[pch-core] Game.scene is missing UITransform on TopBarGroup/PchSpeedButton');
        }
        if (!speedButton.getComponent(Widget)) {
            throw new Error('[pch-core] Game.scene is missing Widget on TopBarGroup/PchSpeedButton');
        }
        if (!speedButton.getComponent(Button)) {
            throw new Error('[pch-core] Game.scene is missing Button on TopBarGroup/PchSpeedButton');
        }
        const inactiveState = speedButton.getChildByName('InactiveState');
        const activeState = speedButton.getChildByName('ActiveState');
        const badgeNode = speedButton.getChildByName('PchSpeedBadge');
        const inactiveSprite = inactiveState?.getComponent(Sprite);
        const activeSprite = activeState?.getComponent(Sprite);
        const badgeLabel = badgeNode?.getComponent(Label);
        if (!inactiveState?.isValid || !inactiveState.getComponent(UITransform) || !inactiveSprite?.spriteFrame) {
            throw new Error('[pch-core] Game.scene must provide UITransform and SpriteFrame on TopBarGroup/PchSpeedButton/InactiveState');
        }
        if (!activeState?.isValid || !activeState.getComponent(UITransform) || !activeSprite?.spriteFrame) {
            throw new Error('[pch-core] Game.scene must provide UITransform and SpriteFrame on TopBarGroup/PchSpeedButton/ActiveState');
        }
        if (!badgeNode?.isValid || !badgeNode.getComponent(UITransform) || !badgeLabel) {
            throw new Error('[pch-core] Game.scene must provide UITransform and Label on TopBarGroup/PchSpeedButton/PchSpeedBadge');
        }
        speedButton.off(Node.EventType.TOUCH_END, this.onSpeedButtonTap, this);
        speedButton.on(Node.EventType.TOUCH_END, this.onSpeedButtonTap, this);
        this.speedButton = speedButton;
        this.speedInactiveState = inactiveState;
        this.speedActiveState = activeState;
        this.speedBadgeLabel = badgeLabel;
        speedButton.active = visible;
        this.refreshSpeedButtonState();
    }

    private onSpeedButtonTap(event: any): void {
        event.propagationStopped = true;
        if (!this.rules || this.inputLocked || this.runtime.isGameEnd) return;
        const nextMultiplier: PchSpeedMultiplier = this.manualSpeedMultiplier === 1
            ? 2
            : this.manualSpeedMultiplier === 2 ? 3 : 1;
        this.setManualSpeedMultiplier(nextMultiplier);
        AudioMgr.inst.play('button');
        this.refreshSpeedButtonState();
        if (this.statusLabel) {
            this.statusLabel.string = this.manualSpeedMultiplier === 1
                ? '已恢复正常速度'
                : `${this.manualSpeedMultiplier} 倍速度已开启`;
        }
    }

    private refreshSpeedButtonState(): void {
        if (!this.speedButton?.isValid
            || !this.speedInactiveState?.isValid
            || !this.speedActiveState?.isValid
            || !this.speedBadgeLabel?.isValid) return;
        const active = this.manualSpeedMultiplier > 1;
        this.speedInactiveState.active = !active;
        this.speedActiveState.active = active;
        this.speedBadgeLabel.string = `X${this.manualSpeedMultiplier}`;
    }

    private setManualSpeedMultiplier(multiplier: PchSpeedMultiplier): void {
        this.manualSpeedMultiplier = multiplier;
        AppRoot.tryGet()?.session.setPchSpeedMultiplier(multiplier);
    }

    private updateBeltPositions(): void {
        if (!this.rules) return;
        for (let carrierIndex = 0; carrierIndex < this.carrierNodes.length; carrierIndex += 1) {
            const node = this.carrierNodes[carrierIndex];
            const progress = this.wrap01((carrierIndex + this.beltTravel) / this.rules!.carrierCount);
            const angle = this.sampleBeltPath(progress, this.beltSamplePosition);
            node.setPosition(this.beltSamplePosition);
            const direction = this.carrierDirectionNodes[carrierIndex];
            if (!direction?.isValid) {
                throw new Error(`[pch-core] carrier ${carrierIndex} lost its scene-authored Direction`);
            }
            direction.angle = angle;
        }
    }

    private sampleBeltPath(progress: number, outPosition: Vec3): number {
        const distance = this.wrap01(progress) * this.beltPathLength;
        for (let i = 0; i < this.beltPath.length; i += 1) {
            const startDistance = this.beltPathDistances[i];
            const endDistance = i === this.beltPath.length - 1 ? this.beltPathLength : this.beltPathDistances[i + 1];
            if (distance > endDistance) continue;
            const start = this.beltPath[i];
            const end = this.beltPath[(i + 1) % this.beltPath.length];
            const ratio = endDistance === startDistance ? 0 : (distance - startDistance) / (endDistance - startDistance);
            outPosition.set(start.x + (end.x - start.x) * ratio, start.y + (end.y - start.y) * ratio, 0);
            return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
        }
        throw new Error('[pch-core] failed to sample the original-package conveyor path');
    }

    private getEntranceCarrierIndex(): number {
        if (!this.rules) return 0;
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < this.rules.carrierCount; index += 1) {
            const progress = this.wrap01((index + this.beltTravel) / this.rules.carrierCount);
            const distance = Math.min(progress, 1 - progress);
            if (distance >= nearestDistance) continue;
            nearestDistance = distance;
            nearestIndex = index;
        }
        return nearestIndex;
    }

    private onCapacityAdTap(event: any): void {
        event.propagationStopped = true;
        if (!this.rules || this.inputLocked || this.runtime.isGameEnd || this.runtime._adShowing) return;
        if (typeof this.runtime.runRewardedGrant !== 'function') {
            throw new Error('[pch-core] rewarded capacity grant is unavailable');
        }
        AudioMgr.inst.play('button');
        let timerToken = '';
        this.runtime.runRewardedGrant('pch_conveyor_expand', () => {
            const expanded = this.expandCapacity();
            if (expanded) this.runtime.markDynamicCountdownAssisted?.();
            return expanded;
        }, {
            claimKey: `pch_conveyor_expand:${this.runtime.getActiveLogicalLevelId?.() || 0}:${this.rules.bufferCapacity}`,
            busyFlag: '_adShowing',
            onInteractionStarted: () => {
                timerToken = this.runtime.pauseTimerForProp?.('pch-conveyor-expand') || '';
            },
            onInteractionReleased: () => {
                this.runtime.resumeTimerForProp?.(timerToken || 'pch-conveyor-expand');
                timerToken = '';
            },
            grantFailToast: '传送带扩容失败，请重试',
            successToast: '传送带已扩容 +12',
        });
    }

    private expandCapacity(): boolean {
        if (!this.rules) return false;
        const previousCarrierCount = this.rules.carrierCount;
        const phase = this.wrap01(this.beltTravel / previousCarrierCount);
        const added = this.rules.addBufferSlots(PCH_EXPAND_CAPACITY);
        this.beltTravel = phase * this.rules.carrierCount;
        this.lastEntranceAudioVisitByCarrier.clear();
        this.renderConveyor();
        this.renderEntranceQueue();
        this.refreshStatus();
        AudioMgr.inst.play('win');
        this.showCapacityBurst(added);
        return added > 0;
    }

    private showCapacityBurst(added: number): void {
        if (!this.belt || !this.adButton) return;
        const burst = this.makeLabel(
            this.belt,
            `+${added}`,
            32,
            new Color(255, 246, 80),
            this.adButton.position.x + 44,
            this.adButton.position.y + 18,
            110,
        );
        burst.node.setScale(0.72, 0.72, 1);
        tween(burst.node)
            .to(0.36, {
                position: new Vec3(this.adButton.position.x + 44, this.adButton.position.y + 92, 0),
                scale: new Vec3(1.22, 1.22, 1),
            }, { easing: 'backOut' })
            .to(0.18, { scale: new Vec3(0.1, 0.1, 1) })
            .call(() => burst.node.destroy())
            .start();
    }

    private wrap01(value: number): number {
        return ((value % 1) + 1) % 1;
    }

    private makeNode(name: string, parent: Node, width: number, height: number, x: number, y: number): Node {
        const node = new Node(name);
        parent.addChild(node);
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(x, y, 0);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(width, height);
        return node;
    }

    private makeLabel(parent: Node, text: string, size: number, color: Color, x: number, y: number, width: number): Label {
        const node = this.makeNode(`PchLabel-${text}`, parent, width, size + 12, x, y);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = size + 5;
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return label;
    }

}

export function ensurePchConveyorGameplayController(runtime: any): PchConveyorGameplayController {
    if (!runtime._pchConveyorGameplayController) {
        runtime._pchConveyorGameplayController = new PchConveyorGameplayController(runtime);
    }
    return runtime._pchConveyorGameplayController as PchConveyorGameplayController;
}
