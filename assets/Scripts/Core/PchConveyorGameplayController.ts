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
    SySDKMgr,
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
import { getFirstLevelContent } from './FirstLevelContent';
import { collectActiveBlockInputEvents } from './DebugPerfTrace';
import { CsdInteractionMonitor } from './CsdInteractionMonitor';
import { selectOriginalBeans } from './OriginalBeanSelection';
import { getBeanSelectionPreview } from './BeanSelectionPreview';
import {
    AnalyticsMgr,
    PCH_GAMEPLAY_MODE,
    PCH_GAMEPLAY_SCHEMA_VERSION,
    type PchGameplayAnalyticsSnapshot,
} from './AnalyticsMgr';
import type { PchSpeedMultiplier } from './AppSession';
import { EffectAsset, Material, Vec4, sp } from 'cc';
import {
    createRoundedConveyorPath,
    conveyorEntranceCarrier,
    conveyorExitProgress,
    sampleRoundedConveyorPath,
    type RainbowConveyorPathGeometry,
    type RainbowConveyorTableType,
} from './PchConveyorGeometry';

const BELT_STEP_SECONDS = 0.30;
const PCH_TRANSFER_SECONDS = 0.16;
const PCH_ENTRY_STAGGER_SECONDS = 0.012;
const PCH_RETURN_TRANSFER_SECONDS = 0.2;
const PCH_RETURN_STAGGER_SECONDS = 0.11;
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
const PCH_LEVEL_THREE_MAX_CAPACITY = 150;
const PCH_SCENE_CARRIER_COUNT = 20;
const OPENING_GUIDE_WRONG_TAP_TOAST_COOLDOWN_MS = 1500;
const PCH_CAPACITY_BLOCKED_TOAST_COOLDOWN_MS = 1500;
const OPENING_GUIDE_DIM_MASK_OPACITY = 168;
const OPENING_GUIDE_TARGET_FOCUS_PADDING = 12;
const OPENING_GUIDE_CONVEYOR_FOCUS_PADDING = 8;
const OPENING_GUIDE_PROMPT_WIDTH = 520;
const OPENING_GUIDE_PROMPT_HEIGHT = 140;
const OPENING_GUIDE_PROMPT_CONVEYOR_GAP = 96;
const PCH_CAPACITY_FULL_WARNING_CLIP = 'PchCapacityFullWarning';
const PCH_RED_WARNING_REMAINING_THRESHOLD = 10;
const PCH_RED_WARNING_PULSE_SECONDS = 0.6;
const PCH_RED_WARNING_MAX_OPACITY = 255;
const PCH_RED_WARNING_TEXT_COLOR = new Color(255, 180, 180, 255);
const PCH_CAPACITY_TEXT_COLOR = new Color(43, 43, 43, 255);
const PCH_CAPACITY_OUTLINE_COLOR = new Color(255, 221, 35, 255);
const PCH_CAPACITY_PROGRESS_INSET = 3;
const PCH_CAPACITY_SLICED_RENDER_SCALE = 0.25;
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
const PCH_DIRECTION_SCALE = 0.86;
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
const SPHERE_FLY_TRAIL_HEAD_ANCHOR_X = 1;
const SPHERE_FLY_TRAIL_FOLLOW_SECONDS = 0.09;
const SPHERE_FLY_TRAIL_MAX_LENGTH_RATIO = 4;
const SPHERE_FLY_TRAIL_SEGMENT_COUNT = 1;
const SPHERE_FLY_MAX_STARS_PER_EFFECT = 60;
const MAX_POOLED_SPHERE_FLY_EFFECTS = 24;
const MAX_POOLED_SPHERE_FLY_STARS = 240;
const SPHERE_FLY_TRAIL_COLOR = new Color(255, 238, 161, 255);

type PchBoardTapOutcome = 'inactive' | 'invalid' | 'capacity_blocked' | 'partial' | 'stored';

type PchOpeningGuideAnalyticsMeta = {
    guideId: string;
    stepId: number;
    stepName: string;
};

const PCH_CONVEYOR_LAYOUT = 'NormalLayoutV2';

interface OpeningPatternVisual {
    move: OpeningPatternMove;
    node: Node;
    homePosition: Vec3;
    targetPosition: Vec3;
}

interface PchReturnColorEffectBatch {
    colorId: number;
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
    previousEmitterPosition: Vec3;
    currentEmitterPosition: Vec3;
    trailTailPosition: Vec3;
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
    capacityProgress: ProgressBar | null;
    capacityTrack: Node | null;
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
    private carrierLayer: Node | null = null;
    private carrierTemplate: Node | null = null;
    private inputRoot: Node | null = null;
    private statusLabel: Label | null = null;
    private countLabel: Label | null = null;
    private capacityTextColor = PCH_CAPACITY_TEXT_COLOR.clone();
    private capacityOutlineColor = PCH_CAPACITY_OUTLINE_COLOR.clone();
    private capacityOutlineEnabled = false;
    private capacityBadge: Node | null = null;
    private capacityProgress: ProgressBar | null = null;
    private capacityTrack: Node | null = null;
    private capacityWarningAnimation: Animation | null = null;
    private warningOverlay: Node | null = null;
    private warningOverlayOpacity: UIOpacity | null = null;
    private warningPulseGeneration = 0;
    private warningOverlayRunning = false;
    private warningOverlayShown = false;
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
    private capacityAdBlockedUntil = 0;
    private capacityAdFreshTouchRequired = false;
    private capacityAdTouchId: number | null = null;
    private speedButton: Node | null = null;
    private speedInactiveState: Node | null = null;
    private speedActiveState: Node | null = null;
    private speedBadgeLabel: Label | null = null;
    private openingGuide: Node | null = null;
    private openingGuideTarget: Node | null = null;
    private openingGuideRingData: sp.SkeletonData | null = null;
    private openingGuideRingNodes: Node[] = [];
    private openingGuideRingLoadVersion = 0;
    private capacityGuideMaterial: Material | null = null;
    private openingGuideLevelOneCells: Array<{ row: number; col: number }> = [];
    private openingGuideLevelOneStep = -1;
    private capacityGuideArmed = false;
    private capacityGuideEligibleSent = false;
    private capacityHint: Node | null = null;
    private capacityHintWasShown = false;
    private capacityRewardGrantedAt = 0;
    private capacityRewardTransactionId = '';
    private openingGuideWrongTapToastLastShownAt = 0;
    private capacityBlockedToastLastShownAt = 0;
    private openingGuideTutorialStarted = false;
    private openingGuideTutorialFinished = false;
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
    private activePchColorCompleteEffects = 0;
    private returnBatchInProgress = false;
    private readonly presentationCompletions = new Map<() => void, number>();
    private pchColorCompleteSequenceGeneration = 0;
    private readonly lastEntranceAudioVisitByCarrier = new Map<number, number>();
    private beltPath: RainbowConveyorPathGeometry | null = null;
    private exitPathProgress = 0;
    private beltTravel = 0;
    private pendingBufferDeadlockStartTravel: number | null = null;
    private manualSpeedMultiplier: PchSpeedMultiplier = 1;
    private beforeWinSpeedActive = false;
    private finishCommitted = false;
    private settlementPaused = false;
    private settingsPaused = false;
    private inputLocked = false;
    private externalInputBlocked = false;
    private skillMovementPaused = false;
    private skillTimerPauseToken = '';
    private activeSkillFinish: (() => void) | null = null;
    private openingPatternVisuals: OpeningPatternVisual[] = [];
    private openingPatternState: 'idle' | 'ready' | 'running' | 'done' = 'idle';
    private openingPatternGeneration = 0;
    private coopOpening: {
        elapsed: number;
        from: { scale: number; offset: Vec2 };
        to: { scale: number; offset: Vec2 };
    } | null = null;
    private analyticsStats: PchGameplayAnalyticsSnapshot | null = null;
    private levelThreeGuideDoneAt = 0;
    private levelThreeRoundId = '';
    private capacityOfferRound = '';
    private csdElapsed = 0;
    private csdReady = false;
    private csdStartupMs = 0;
    private csdRoundId = '';
    private csdMonitor: CsdInteractionMonitor | null = null;
    private csdBoardResults: Record<string, number> = {};

    private updateCsdInteraction(deltaTime: number): void {
        this.csdElapsed += deltaTime;
        if (this.csdElapsed < 0.5) return;
        this.csdElapsed = 0;
        if (!AnalyticsMgr.inst.isCollectionEnabled() || !this.isLevelThreeMeasurementActive()) return;
        const foreground = this.runtime._gameForeground !== false;
        if (!this.csdReady && foreground) this.csdStartupMs += 500;
        const terminal = this.runtime.isGameEnd || this.finishCommitted || this.settlementPaused;
        const expected = terminal ? 'settlement' : this.settingsPaused ? 'settings'
            : this.runtime._adShowing || this.runtime._rewardedGrantTransaction ? 'ad'
            : this.runtime._skillActive || this.skillMovementPaused ? 'skill'
            : Number(this.runtime._modalFocusRefs) > 0 ? 'modal' : '';
        const blockers = foreground && !expected ? collectActiveBlockInputEvents().map(x => String(x.path || ''))
            .filter(path => !this.isExpectedGuideBlocker(path)) : [];
        const startupPending = this.openingPatternState !== 'done';
        const logicalReady = this.isStartupInteractionReady() && !this.externalInputBlocked;
        if (!this.csdReady && foreground && !expected && logicalReady && blockers.length === 0) {
            this.csdReady = true;
            this.trackPchFunnelEvent('csd_startup_observation', { source: 'ready', success: true,
                extra: { foregroundSampledMs: this.csdStartupMs, phase: this.openingPatternState, interactionMode: this.isOpeningGuideActive() ? 'guided' : 'free' } });
            this.runtime._csdInteractionReady = true;
            const ready = this.runtime._csdOnInteractionReady;
            this.runtime._csdOnInteractionReady = null;
            ready?.();
        }
        this.csdMonitor ||= new CsdInteractionMonitor(extra => this.trackPchFunnelEvent('csd_input_block_summary', {
            source: 'passive_observer', success: extra.outcome === 'recovered', extra }));
        if (!logicalReady && !startupPending && !expected) blockers.push('gameplay_input_lock');
        this.csdMonitor.observe({ foreground, expected: expected || (!this.csdReady ? 'startup' : startupPending ? 'opening_animation' : ''),
            blockers, validActions: this.analyticsStats?.validActionCount || 0 }, Date.now());
    }

    private flushCsdObservations(reason: string): void {
        if (!this.csdReady && this.csdStartupMs > 0 && reason !== 'background' && reason !== 'settings') {
            this.trackPchFunnelEvent('csd_startup_observation', { source: reason, success: false,
                extra: { foregroundSampledMs: this.csdStartupMs, phase: this.openingPatternState, outcome: 'readiness_not_observed' } });
            this.csdStartupMs = 0;
        }
        this.csdMonitor?.finish(reason, this.analyticsStats?.validActionCount || 0, Date.now());
        if (Object.keys(this.csdBoardResults).length) this.trackPchFunnelEvent('csd_board_action_summary', {
            source: reason, success: true, extra: { ...this.csdBoardResults } });
        this.csdBoardResults = {};
    }

    private recordCsdBoardResult(result: string): void {
        this.csdBoardResults[result] = (this.csdBoardResults[result] || 0) + 1;
    }
    private capacityOfferModes = new Set<string>();

    private getCapacityOfferMode(triggerSource: string): 'free' | 'ad' | 'unavailable' {
        if (!this.rules || this.runtime.isRankedPvpMode?.()) return 'unavailable';
        if (this.isLevelThreeFreeCapacity()) {
            return this.rules.bufferCapacity >= PCH_LEVEL_THREE_MAX_CAPACITY ? 'unavailable' : 'free';
        }
        const level = this.runtime.getActiveLogicalLevelId?.();
        return triggerSource === 'capacity_soft_hint' && this.runtime._activeGameplayEntryMode === 'main'
            && (level === 4 || level === 5) ? 'free' : 'ad';
    }
    private levelThreeFirstActionSent = false;
    private levelThreeProgressSent = new Set<number>();
    private levelThreeLeaveSent = new Set<string>();
    private firstStoreEventSent = false;
    private levelTwoSoftHand: Node | null = null;
    private levelTwoSoftHandTarget: { row: number; col: number } | null = null;
    private firstReturnEventSent = false;

    constructor(private readonly runtime: any) {}

    private resetAnalyticsStats(): void {
        this.levelThreeGuideDoneAt = 0;
        this.levelThreeRoundId = '';
        this.levelThreeFirstActionSent = false;
        this.levelThreeProgressSent.clear();
        this.levelThreeLeaveSent.clear();
        if (!this.rules) {
            this.analyticsStats = null;
            return;
        }
        this.analyticsStats = {
            magnetUses: 0,
            brushUses: 0,
            freezeUses: 0,
            peakBufferCount: 0,
            peakBufferRatio: 0,
            capacityExpandCount: 0,
            validActionCount: 0,
            finalBufferCount: 0,
            finalLockedCount: 0,
            totalBeanCount: Array.isArray(this.rules.cells) ? this.rules.cells.length : 0,
            finalProgressRatio: 0,
            capacitySoftHintEligibleCount: 0,
            capacitySoftHintShownCount: 0,
            capacitySoftHintClickCount: 0,
        };
        this.firstStoreEventSent = false;
        this.firstReturnEventSent = false;
        this.capacityGuideEligibleSent = false;
        this.capacityHintWasShown = false;
        this.capacityRewardGrantedAt = 0;
        this.capacityRewardTransactionId = '';
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
        const isCapacityMeasurementEvent = eventName.startsWith('pch_capacity_');
        if (logicalLevelId < 1 || logicalLevelId > 10) return;
        AnalyticsMgr.inst.trackFunnelEvent({
            eventName,
            roundId: eventName.startsWith('csd_') ? this.csdRoundId : undefined,
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
            return { guideId: 'pch_level_2_speed_v1', stepId: 1, stepName: 'enable_3x' };
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
        diagnostic: Record<string, unknown> = {},
    ): void {
        const meta = this.getOpeningGuideAnalyticsMeta(guideName);
        if (!meta) return;
        if (meta.guideId === 'pch_level_3_capacity_v1') {
            this.levelThreeRoundId = AnalyticsMgr.inst.getCurrentRoundId();
        }
        if (meta.guideId === 'pch_level_3_capacity_v1' && eventName === 'pch_guide_step_done'
            && success && !this.levelThreeGuideDoneAt) this.levelThreeGuideDoneAt = Date.now();
        this.trackPchFunnelEvent(eventName, {
            stepId: meta.stepId,
            stepName: meta.stepName,
            source: 'pch_opening_guide',
            success,
            errorCode: success ? '' : result,
            extra: {
                guideId: meta.guideId,
                result,
                ...diagnostic,
            },
        });
    }

    private reportOpeningGuideTutorialStart(): void {
        if (this.openingGuideTutorialStarted) return;
        this.openingGuideTutorialStarted = true;
        SySDKMgr.inst.reportTutorialStart();
    }

    private reportOpeningGuideTutorialFinish(): void {
        if (!this.openingGuideTutorialStarted || this.openingGuideTutorialFinished) return;
        this.openingGuideTutorialFinished = true;
        this.trackPchFunnelEvent('guide_complete', { success: true,
            extra: { guideId: this.getOpeningGuideAnalyticsMeta()?.guideId || '' } });
        SySDKMgr.inst.reportTutorialFinish();
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
        this.rules = (this.runtime._coopReplayResumeState || this.runtime._pvpReplayResumeState)?.rules || new PchConveyorRules(
            this.runtime.boardModel,
            this.runtime.levelData?.conveyorCapacity,
            this.runtime.levelData?.singleSelectionLimit,
            PCH_SCENE_CARRIER_COUNT,
            this.runtime.levelData?.autoConveyorFinishSpeed,
        );
        this.resetAnalyticsStats();
        this.csdRoundId = AnalyticsMgr.inst.getCurrentRoundId();
        this.beltTravel = (this.runtime._coopReplayResumeState || this.runtime._pvpReplayResumeState)?.travel || 0;
        this.pendingBufferDeadlockStartTravel = null;
        if (this.runtime._coopReplayResumeState || this.runtime._pvpReplayResumeState) this.manualSpeedMultiplier = (this.runtime._coopReplayResumeState || this.runtime._pvpReplayResumeState).speed;
        else this.runtime.recordPvpRuleEvent?.(0, this.manualSpeedMultiplier);
        this.inputLocked = true;
        this.activeReturnAnimations = 0;
        this.activeReturnBeans.clear();
        this.pendingReturnCompletions.clear();
        this.clearPchColorCompleteSequence();
        this.beforeWinSpeedActive = false;
        this.finishCommitted = false;
        this.settlementPaused = false;
        this.settingsPaused = false;
        this.runtime.detachGameplayInputHandlers?.();

        const fixedRoot = this.runtime.getGameplayFixedRoot();
        this.root = this.requireConveyorNode(fixedRoot, 'PchConveyorRoot', 'GameplayFixedRoot/PchConveyorRoot');
        this.bindWarningOverlay();
        const normalLayout = this.bindConveyorLayout(this.root, PCH_CONVEYOR_LAYOUT);
        this.clearConveyorLayoutRuntime(normalLayout.node);
        normalLayout.node.active = true;
        const activeLayout = normalLayout;
        this.prepareBeltPath(2);
        this.normalLayout = normalLayout.node;
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
        this.capacityTrack = activeLayout.capacityTrack;
        this.countLabel = activeLayout.countLabel;
        this.capacityTextColor = this.countLabel.color.clone();
        this.capacityOutlineColor = this.countLabel.outlineColor.clone();
        this.capacityOutlineEnabled = this.countLabel.enableOutline;
        this.capacityWarningAnimation = activeLayout.capacityWarningAnimation;
        const hideFirstLevelControls = this.runtime._activeGameplayEntryMode === 'main'
            && Math.floor(Number(this.runtime.levelData?.levelId) || 0) === 1;
        const rankedPvp = this.runtime.isRankedPvpMode?.() === true;
        const hideSecondLevelCapacity = this.runtime._activeGameplayEntryMode === 'main'
            && Number(this.runtime.getActiveLogicalLevelId()) === 2;
        this.adButton = activeLayout.adButton;
        const capacityButtonLabel = this.adButton.getChildByName('Node')?.getComponent(Label);
        if (capacityButtonLabel) capacityButtonLabel.string = `+${this.getCapacityButtonIncrement()}`;
        this.adButton.active = !hideFirstLevelControls && !rankedPvp
            && !hideSecondLevelCapacity
            && !(this.isLevelThreeFreeCapacity() && this.rules!.bufferCapacity >= PCH_LEVEL_THREE_MAX_CAPACITY);
        this.adButton.off(Node.EventType.TOUCH_END, this.onCapacityAdTap, this);
        this.adButton.off(Node.EventType.TOUCH_START, this.onCapacityAdTouchStart, this);
        this.adButton.off(Node.EventType.TOUCH_CANCEL, this.resetCapacityAdGesture, this);
        if (!rankedPvp) {
            this.adButton.on(Node.EventType.TOUCH_START, this.onCapacityAdTouchStart, this);
            this.adButton.on(Node.EventType.TOUCH_CANCEL, this.resetCapacityAdGesture, this);
        }
        if (!rankedPvp) this.adButton.on(Node.EventType.TOUCH_END, this.onCapacityAdTap, this);
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
        if (this.runtime._coopReplayResumeState || this.runtime._pvpReplayResumeState) {
            this.openingPatternState = 'ready';
            this.externalInputBlocked = true;
        } else {
            this.prepareOpeningPatternShuffle();
        }
        if (this.runtime._activeGameplayEntryMode === 'main'
            && this.runtime.getActiveLogicalLevelId?.() <= 5
            && !this.runtime.getSF?.('guide_bubble_frame')) {
            try {
                this.runtime._ensureSpriteFramesByName?.(['guide_bubble_frame'], (error?: Error) => {
                    if (error) console.error('[pch-guide] guide bubble preload failed:', error);
                });
            } catch (error) {
                console.error('[pch-guide] guide bubble preload failed:', error);
            }
        }
    }

    playOpeningPatternShuffle(): void {
        const resumed = this.runtime._coopReplayResumeState || this.runtime._pvpReplayResumeState;
        if (this.runtime.isCoopMode?.() && this.openingPatternState === 'ready') {
            if (!resumed || !this.runtime.boardViewport || !this.runtime.boardGroup?.isValid) {
                throw new Error('[coop-opening] board viewport or replay is unavailable');
            }
            const viewport = this.runtime.boardViewport;
            const from = viewport.getHomeTransform();
            this.runtime._coopFocusOwnBoard = true;
            this.runtime.refitBoardViewportToSafeRect();
            const to = viewport.getHomeTransform();
            viewport.setViewTransformClamped(from.scale, from.offset);
            this.runtime.boardViewScale = viewport.scale;
            this.coopOpening = { elapsed: 0, from, to };
            this.openingPatternState = 'running';
            this.inputLocked = true;
            this.externalInputBlocked = true;
            return;
        }
        if (this.coopOpening) return;
        if (resumed) {
            this.openingPatternState = 'done';
            this.inputLocked = false;
            this.externalInputBlocked = false;
            for (const due of resumed.pendingReady) {
                const arrive = () => {
                    if (this.runtime.isGameEnd || this.rules !== resumed.rules) return;
                    if (this.runtime.isCoopMode?.() && (this.isPresentationPaused() || this.externalInputBlocked
                        || this.runtime.getCoopElapsedMs() < due)) {
                        this.runtime.scheduleOnce(arrive, 0.05); return;
                    }
                    this.runtime.recordPvpRuleEvent?.(3);
                    this.rules?.markQueuedBeansReady(1);
                    this.renderEntranceQueue();
                    this.tryTransferAtCurrentEntrance();
                };
                this.runtime.scheduleOnce(arrive, Math.max(0.02, (due - resumed.lastTime) / 1000));
            }
            this.runtime.scheduleOnce(() => {
                if (this.rules?.board.isAllLocked()) this.commitFinish();
                else if (!this.checkBufferDeadlock() && resumed.firstTap >= 0) {
                    this.runtime.timeRemain = Math.max(0, this.runtime.levelData.timeLimit - (resumed.lastTime - resumed.firstTap) / 1000);
                    this.runtime.ensureTimerStarted?.();
                }
            }, 0.02);
            return;
        }
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
        this.coopOpening = null;
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
        this.flushCsdObservations('level_leave');
        if (this.csdRoundId) this.runtime.resetFirstLevelReleaseDiagnostics?.();
        this.csdMonitor = null;
        this.csdReady = false;
        this.csdElapsed = 0;
        this.csdStartupMs = 0;
        this.runtime._csdInteractionReady = false;
        this.csdRoundId = '';
        this.runtime._csdOnInteractionReady = null;
        this.reportLevelThreeLeave('leave');
        this.capacityAdBlockedUntil = 0;
        this.capacityAdFreshTouchRequired = false;
        this.resetCapacityAdGesture();
        this.activeSkillFinish = null;
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
            if (this.normalLayout?.isValid) this.clearConveyorLayoutRuntime(this.normalLayout);
            if (this.normalLayout?.isValid) this.normalLayout.active = true;
            this.root.active = false;
        }
        if (this.adButton?.isValid) {
            this.adButton.off(Node.EventType.TOUCH_END, this.onCapacityAdTap, this);
            this.adButton.off(Node.EventType.TOUCH_START, this.onCapacityAdTouchStart, this);
            this.adButton.off(Node.EventType.TOUCH_CANCEL, this.resetCapacityAdGesture, this);
        }
        if (this.speedButton?.isValid) {
            this.speedButton.off(Node.EventType.TOUCH_END, this.onSpeedButtonTap, this);
            this.speedButton.active = false;
        }
        this.clearOpeningGuideNodes();
        this.root = null;
        this.belt = null;
        this.normalLayout = null;
        this.carrierLayer = null;
        this.carrierTemplate = null;
        this.inputRoot = null;
        this.statusLabel = null;
        this.countLabel = null;
        this.capacityBadge = null;
        this.capacityProgress = null;
        this.capacityTrack = null;
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
        this.capacityGuideArmed = false;
        this.openingGuideWrongTapToastLastShownAt = 0;
        this.capacityBlockedToastLastShownAt = 0;
        this.openingGuideTutorialStarted = false;
        this.openingGuideTutorialFinished = false;
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
        this.settingsPaused = false;
        this.inputLocked = false;
        this.pendingBufferDeadlockStartTravel = null;
        this.externalInputBlocked = false;
        this.skillMovementPaused = false;
        this.skillTimerPauseToken = '';
        this.warningPulseGeneration = 0;
    }

    update(deltaTime: number): void {
        this.updateCsdInteraction(deltaTime);
        const measurementRound = AnalyticsMgr.inst.getCurrentRoundId();
        if (this.capacityOfferRound !== measurementRound) {
            this.capacityOfferRound = measurementRound;
            this.capacityOfferModes.clear();
        }
        const offerSource = this.capacityHintWasShown ? 'capacity_soft_hint' : 'manual_button';
        const offerMode = this.getCapacityOfferMode(offerSource);
        if (measurementRound && offerMode !== 'unavailable' && !this.capacityOfferModes.has(offerMode)
            && this.adButton?.activeInHierarchy && !this.inputLocked && !this.openingGuide?.isValid
            && !this.runtime.isGameEnd && this.runtime._gameForeground !== false
            && !this.externalInputBlocked && !this.settingsPaused && !this.settlementPaused
            && !this.runtime._adShowing && !this.runtime._rewardedGrantTransaction
            && !(Number(this.runtime._modalFocusRefs) > 0)) {
            this.capacityOfferModes.add(offerMode);
            this.trackPchFunnelEvent(offerMode === 'ad' ? 'ad_entry_exposure' : 'csd_free_capacity_entry_exposure', { source: 'pch_conveyor_expand', success: true,
                extra: { placement: 'pch_conveyor_expand', mode: offerMode, triggerSource: offerSource, freeGuideCompleted: this.levelThreeGuideDoneAt > 0,
                    bufferCapacity: this.rules?.bufferCapacity || 0 } });
        }
        this.updateCapacityHint();
        this.updateLevelTwoSoftHand();
        if (this.runtime.isCoopMode?.() && this.runtime._gameForeground === false) return;
        if (this.settingsPaused) return;
        if (this.coopOpening) {
            if (!this.runtime.isGameEnd && !this.settlementPaused
                && !this.runtime._adShowing && !this.runtime._rewardedGrantTransaction) {
                this.updateCoopOpening(deltaTime);
            }
            return;
        }
        if (!this.settlementPaused && this.runtime._gameForeground !== false
            && !this.runtime._adShowing && !this.runtime._rewardedGrantTransaction) {
            for (const [complete, remaining] of Array.from(this.presentationCompletions)) {
                if (!this.presentationCompletions.has(complete)) continue;
                const next = remaining - Math.max(0, deltaTime);
                if (next > 0) this.presentationCompletions.set(complete, next);
                else {
                    this.presentationCompletions.delete(complete);
                    console.warn('[pch-return] presentation deadline reached; retaining committed board');
                    complete();
                }
            }
        }
        this.updateSphereFlyEffects(deltaTime);
        this.updateExitArrowAnimation(deltaTime);
        if (!this.rules || this.runtime.isGameEnd || this.externalInputBlocked) return;
        if (this.skillMovementPaused || this.runtime._adShowing || this.runtime._rewardedGrantTransaction) return;
        const previousTravel = this.beltTravel;
        const speedMultiplier = this.getEffectiveBeltSpeedMultiplier();
        this.beltTravel += (Math.max(0, deltaTime) * speedMultiplier) / BELT_STEP_SECONDS;
        this.runtime.recordPvpRuleEvent?.(1, this.beltTravel);
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
        this.maybeShowCapacityPressureGuide();
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

    private isLevelThreeMeasurementActive(): boolean {
        const roundId = AnalyticsMgr.inst.getCurrentRoundId();
        if (!this.levelThreeRoundId && roundId) this.levelThreeRoundId = roundId;
        return this.runtime._activeGameplayEntryMode === 'main'
            && this.runtime.getActiveLogicalLevelId?.() >= 1
            && this.runtime.getActiveLogicalLevelId?.() <= 10
            && !!this.rules && !!roundId && roundId === this.levelThreeRoundId;
    }

    resumeAnalyticsMeasurement(): void {
        this.levelThreeLeaveSent.delete('background');
    }

    private levelThreeSnapshot(): Record<string, unknown> {
        const locked = this.rules!.cells.filter(cell => cell.locked).length;
        return {
            progressRatio: this.rules!.cells.length ? locked / this.rules!.cells.length : 0,
            lockedCount: locked,
            totalBeanCount: this.rules!.cells.length,
            bufferCount: this.rules!.bufferCount,
            bufferCapacity: this.rules!.bufferCapacity,
            validActionCount: this.analyticsStats?.validActionCount || 0,
            capacityExpandCount: this.analyticsStats?.capacityExpandCount || 0,
            guideCompleted: this.levelThreeGuideDoneAt > 0,
        };
    }

    reportLevelThreeLeave(reason: 'background' | 'leave'): void {
        if (reason === 'background') this.flushCsdObservations('background');
        if (!this.isLevelThreeMeasurementActive() || this.runtime.isGameEnd
            || this.runtime._adShowing || this.runtime._rewardedGrantTransaction
            || this.levelThreeLeaveSent.has(reason)) return;
        this.levelThreeLeaveSent.add(reason);
        this.trackPchFunnelEvent('level_pause_snapshot', {
            source: reason, success: true, extra: this.levelThreeSnapshot(),
        });
        if (reason === 'leave') AnalyticsMgr.inst.flushFunnelEvents();
    }

    private reportLevelThreeProgress(): void {
        if (!this.isLevelThreeMeasurementActive() || !this.firstStoreEventSent) return;
        const progress = Number(this.levelThreeSnapshot().progressRatio);
        for (const percent of [25, 50, 75]) {
            if (progress < percent / 100 || this.levelThreeProgressSent.has(percent)) continue;
            this.levelThreeProgressSent.add(percent);
            this.trackPchFunnelEvent('level_progress', {
                source: 'progress', success: true, extra: { ...this.levelThreeSnapshot(), progressPercent: percent },
            });
        }
    }

    recordFreezeUse(): void {
        if (!this.analyticsStats) return;
        this.analyticsStats.freezeUses += 1;
    }

    isActive(): boolean {
        return !!this.rules && !!this.root?.isValid;
    }

    isStartupInteractionReady(): boolean {
        return this.openingPatternState === 'done'
            && !!this.root?.activeInHierarchy
            && !!this.rules
            && !this.runtime.isGameEnd
            && !this.settingsPaused
            && (!this.inputLocked || (!!this.openingGuideTarget?.activeInHierarchy
                && this.openingGuideTarget.getComponent(Button)?.interactable === true));
    }

    isOpeningGuideActive(): boolean { return !!this.openingGuide?.activeInHierarchy; }
    isSettlementPaused(): boolean { return this.settlementPaused; }

    isExpectedGuideBlocker(path: string): boolean {
        const parts = path.split('/');
        return [this.openingGuide, this.openingGuideTarget].some(node => node?.activeInHierarchy && parts.includes(node.name));
    }

    isCoopOpening(): boolean {
        return this.runtime.isCoopMode?.() === true && this.openingPatternState !== 'done';
    }

    private updateCoopOpening(deltaTime: number): void {
        const opening = this.coopOpening!;
        opening.elapsed += Math.max(0, deltaTime);
        const progress = Math.max(0, Math.min(1, (opening.elapsed - 0.5) / 0.5));
        const eased = progress * progress * (3 - 2 * progress);
        const viewport = this.runtime.boardViewport;
        viewport.setViewTransformClamped(
            opening.from.scale + (opening.to.scale - opening.from.scale) * eased,
            new Vec2(
                opening.from.offset.x + (opening.to.offset.x - opening.from.offset.x) * eased,
                opening.from.offset.y + (opening.to.offset.y - opening.from.offset.y) * eased,
            ),
        );
        this.runtime.boardViewScale = viewport.scale;
        if (progress < 1) return;
        this.runtime.restrictCoopBoardViewport();
        this.coopOpening = null;
        this.playOpeningPatternShuffle();
        this.runtime.syncSkillButtonRuntimeStates?.();
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

    isFinishPending(): boolean {
        return this.rules?.board.isAllLocked() === true && !this.finishCommitted;
    }

    pauseForSettlement(): void {
        if (!this.isActive() || this.settlementPaused) return;
        this.flushCsdObservations('settlement');
        this.settlementPaused = true;
        this.dismissOpeningGuide();
        this.resetCapacityWarning();
        for (const bean of this.activeReturnBeans) {
            if (bean?.isValid) Tween.pauseAllByTarget(bean);
        }
        for (const callback of this.pendingReturnCompletions.values()) {
            this.runtime.unschedule?.(callback);
        }
        for (const callback of this.pendingPchReturnColorSettles) {
            this.runtime.unschedule?.(callback);
        }
    }

    setExternalInputBlocked(blocked: boolean): void {
        this.externalInputBlocked = blocked === true;
        if (this.externalInputBlocked) this.resetCapacityAdGesture();
    }

    resumeAfterSettlement(): void {
        if (!this.settlementPaused) return;
        this.settlementPaused = false;
        if (this.settingsPaused) return;
        for (const bean of new Set([...this.activeReturnBeans, ...(this.activeFlyBeans || [])])) {
            if (!bean?.isValid) continue;
            const completion = this.pendingReturnCompletions.get(bean);
            if (completion) {
                this.runtime.scheduleOnce(completion, PCH_RETURN_COMPLETE_DELAY_SECONDS);
            } else {
                Tween.resumeAllByTarget(bean);
            }
        }
        for (const callback of this.pendingPchReturnColorSettles) {
            this.runtime.scheduleOnce(callback, PCH_RETURN_COLOR_COMPLETE_DELAY_SECONDS);
        }
        this.tryCommitFinishAfterPchColorCompleteEffects();
    }

    pauseForSettings(): void {
        if (!this.isActive() || this.settingsPaused) return;
        this.flushCsdObservations('settings');
        this.settingsPaused = true;
        for (const bean of new Set([...this.activeReturnBeans, ...this.activeFlyBeans])) {
            if (bean?.isValid) Tween.pauseAllByTarget(bean);
        }
        for (const callback of this.pendingReturnCompletions.values()) {
            this.runtime.unschedule?.(callback);
        }
        for (const callback of this.pendingPchReturnColorSettles) {
            this.runtime.unschedule?.(callback);
        }
    }

    resumeAfterSettings(): void {
        if (!this.settingsPaused) return;
        this.settingsPaused = false;
        if (this.settlementPaused) return;
        for (const bean of new Set([...this.activeReturnBeans, ...this.activeFlyBeans])) {
            if (!bean?.isValid) continue;
            const completion = this.pendingReturnCompletions.get(bean);
            if (completion) {
                this.runtime.scheduleOnce(completion, PCH_RETURN_COMPLETE_DELAY_SECONDS);
            } else {
                Tween.resumeAllByTarget(bean);
            }
        }
        for (const callback of this.pendingPchReturnColorSettles) {
            this.runtime.scheduleOnce(callback, PCH_RETURN_COLOR_COMPLETE_DELAY_SECONDS);
        }
        this.tryCommitFinishAfterPchColorCompleteEffects();
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

    recoverActiveSkillVisuals(): boolean {
        const finish = this.activeSkillFinish;
        if (!finish) return false;
        finish();
        return true;
    }

    isPresentationPaused(): boolean {
        return this.settingsPaused || this.runtime._gameForeground === false;
    }

    isSettingsPaused(): boolean { return this.settingsPaused; }

    useClearColorSkill(timerAlreadyPaused: boolean = false): boolean {
        const random = Math.floor(Math.random() * 1000000);
        return this.runConveyorSkill('magnet', timerAlreadyPaused, () => {
            const result = this.rules!.forceCompleteRandomColor(() => random / 1000000);
            if (result.moved && this.runtime.isCoopMode?.()) this.runtime.recordCoopRuleEvent(5, random);
            return result;
        });
    }

    useClearBufferSkill(timerAlreadyPaused: boolean = false): boolean {
        if (!this.hasStoredBeans()) return false;
        return this.runConveyorSkill('brush', timerAlreadyPaused, () => {
            const result = this.rules!.clearBufferToBoard();
            if (result.moved && this.runtime.isCoopMode?.()) this.runtime.recordCoopRuleEvent(6);
            return result;
        });
    }

    continueAfterBufferFull(): boolean {
        if (!this.rules || !this.runtime.isGameEnd || !this.hasStoredBeans()) return false;
        return this.runConveyorSkill('revive', false, () => {
            const result = this.rules!.clearBufferToBoard();
            if (result.moved && this.runtime.isCoopMode?.()) this.runtime.recordCoopRuleEvent(6);
            return result;
        });
    }

    grantReviveCapacity(): boolean {
        const earlyProgress = this.runtime.boardModel?.getInitiallyUnsettledCompletionRatio() <= 0.5;
        return this.expandCapacity(PCH_EXPAND_CAPACITY, earlyProgress);
    }

    private checkBufferDeadlock(): boolean {
        if (!this.rules?.isBufferDeadlocked()) {
            this.pendingBufferDeadlockStartTravel = null;
            return false;
        }
        const pendingStartTravel = this.pendingBufferDeadlockStartTravel;
        if (pendingStartTravel === null) {
            this.pendingBufferDeadlockStartTravel = this.beltTravel;
            return false;
        }
        if (this.beltTravel < pendingStartTravel + this.rules.carrierCount) return false;
        this.pendingBufferDeadlockStartTravel = null;
        this.inputLocked = true;
        if (this.statusLabel) this.statusLabel.string = '暂存槽已满，且没有豆豆可以归位';
        this.runtime.gameLose('buffer-full');
        return true;
    }

    private onRootTouchStart(event: any): void {
        if (this.inputLocked || this.externalInputBlocked) {
            event.propagationStopped = true;
            return;
        }
        this.runtime.onTouchStart?.(event);
    }

    private onRootTouchMove(event: any): void {
        if (this.inputLocked || this.externalInputBlocked) {
            event.propagationStopped = true;
            return;
        }
        this.runtime.onTouchMove?.(event);
    }

    private onRootTouchCancel(event: any): void {
        if (this.inputLocked || this.externalInputBlocked) {
            event.propagationStopped = true;
            return;
        }
        this.runtime.onTouchCancel?.(event);
    }

    private onRootMouseWheel(event: any): void {
        if (this.inputLocked || this.externalInputBlocked) {
            event.propagationStopped = true;
            return;
        }
        this.runtime.onMouseWheel?.(event);
    }

    private onRootTouchEnd(event: any): void {
        if (!this.rules || this.runtime.isGameEnd) return;
        if (this.externalInputBlocked) {
            event.propagationStopped = true;
            return;
        }
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
        if (!cell) { this.recordCsdBoardResult('no_pattern_hit'); return; }
        event.propagationStopped = true;
        const result = this.handleBoardTap(cell.row, cell.col);
        this.recordCsdBoardResult(result);
    }

    private handleOpeningGuideRootTap(event: any): boolean {
        if (this.handleLevelOneOpeningGuideRootTap(event)) return true;
        const rawPos = event?.getUILocation?.();
        if (!rawPos) return false;
        const guideName = this.openingGuide?.name || '';
        if (guideName.startsWith('PchLevelOneGuideStep')) {
            this.trackOpeningGuideEvent('pch_guide_tap_result', false, 'miss_target', guideName,
                { missReason: 'board_target_not_accepted', inputLocked: this.inputLocked,
                    openingPatternState: this.openingPatternState, viewScale: this.runtime.boardViewScale || 1 });
            this.maybeShowOpeningGuideWrongTapToast();
            return false;
        }
        const target = guideName === 'PchLevelTwoSpeedGuide'
            ? this.speedButton
            : (guideName === 'PchLevelThreeCapacityGuide' ? this.adButton : null);
        const bounds = target?.getComponent(UITransform)?.getBoundingBoxToWorld();
        if (!bounds || !bounds.contains(rawPos)) {
            this.trackOpeningGuideEvent('pch_guide_tap_result', false, 'miss_target', guideName,
                { missReason: !bounds ? 'target_missing' : !target?.activeInHierarchy ? 'target_hidden' : 'outside_target',
                    targetVisible: !!target?.activeInHierarchy, inputLocked: this.inputLocked,
                    targetBounds: bounds ? [bounds.x, bounds.y, bounds.width, bounds.height].map(Math.round).join('|') : '',
                    relativeTap: bounds && bounds.width && bounds.height
                        ? `${((rawPos.x - bounds.x) / bounds.width).toFixed(3)}|${((rawPos.y - bounds.y) / bounds.height).toFixed(3)}` : '' });
            this.maybeShowOpeningGuideWrongTapToast();
            return false;
        }
        event.propagationStopped = true;
        if (guideName === 'PchLevelTwoSpeedGuide') {
            this.onOpeningGuideTripleSpeed(event);
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

    private maybeShowCapacityBlockedToast(): void {
        const now = Date.now();
        const lastShownAt = Math.max(0, Number(this.capacityBlockedToastLastShownAt) || 0);
        if (lastShownAt > 0 && now >= lastShownAt && now - lastShownAt < PCH_CAPACITY_BLOCKED_TOAST_COOLDOWN_MS) {
            return;
        }
        if (typeof this.runtime.showToast !== 'function') {
            throw new Error('[pch-core] conveyor-full Toast is unavailable');
        }
        this.capacityBlockedToastLastShownAt = now;
        this.runtime.showToast('传送带已满');
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

    getBeanSelectionBucket(): 'A' | 'B' {
        if (this.runtime.isRankedPvpMode?.() || this.runtime.isCoopMode?.()) return 'A';
        return getBeanSelectionPreview(this.runtime._activeGameplayEntryMode,
            this.runtime.getActiveLogicalLevelId?.() || 0);
    }

    private handleBoardTap(row: number, col: number): PchBoardTapOutcome {
        if (!this.rules) return 'inactive';
        const originalSelection = this.getBeanSelectionBucket() === 'B';
        const block = originalSelection
            ? selectOriginalBeans(this.rules.board, row, col, this.rules.moveLimit)
            : this.rules.selectBoard(row, col);
        if (!block) {
            if (this.statusLabel) this.statusLabel.string = '请选择棋盘上未归位的相连同色豆豆';
            return 'invalid';
        }
        const sourceWorldPositions = block.cells.map((cell) => this.getBoardCellWorldPosition(cell.row, cell.col));
        const result = this.rules.storeBlock(block, this.getEntranceCarrierIndex());
        if (result.moved <= 0) {
            if (this.statusLabel) this.statusLabel.string = '传送带已满，请等待出口归位';
            this.maybeShowCapacityBlockedToast();
            return 'capacity_blocked';
        }
        this.clearLevelTwoSoftHand();
        if (this.analyticsStats) this.analyticsStats.validActionCount += 1;
        if (this.isLevelThreeMeasurementActive() && !this.levelThreeFirstActionSent) {
            this.levelThreeFirstActionSent = true;
            this.trackPchFunnelEvent('pch_level3_first_action_after_guide', {
                source: 'board_selection', success: true,
                extra: {
                    ...this.levelThreeSnapshot(),
                    ...(this.levelThreeGuideDoneAt > 0
                        ? { elapsedMsAfterGuide: Math.max(0, Date.now() - this.levelThreeGuideDoneAt) } : {}),
                },
            });
        }
        if (this.capacityRewardGrantedAt > 0) {
            this.trackPchFunnelEvent('pch_capacity_reward_followup_action', {
                source: 'board_selection',
                success: true,
                extra: {
                    adTransactionId: this.capacityRewardTransactionId,
                    elapsedMsAfterReward: Math.max(0, Date.now() - this.capacityRewardGrantedAt),
                    movedBeans: result.moved,
                    bufferCount: this.rules.bufferCount,
                    bufferCapacity: this.rules.bufferCapacity,
                },
            });
            this.capacityRewardGrantedAt = 0;
            this.capacityRewardTransactionId = '';
        }
        if (!this.firstStoreEventSent) {
            this.firstStoreEventSent = true;
            this.trackPchFunnelEvent('pch_first_store_success', {
                source: 'board_selection',
                success: true,
            });
        }
        this.runtime.ensureTimerStarted?.();
        this.runtime.recordPvpAction?.(row, col, block.colorId, result.moved);
        this.runtime.recordPvpRuleEvent?.(2, row, col, block.colorId, result.moved);
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
        const sourceLayers = this.rules.carriers[carrierIndex].map((_colorId, layerIndex) => {
            try {
                const beanNode = carrierNode?.getChildByName(`PchStackBean-${carrierIndex}-${layerIndex}`);
                const beanTransform = beanNode?.getComponent(UITransform);
                if (!beanNode?.isValid || !beanTransform) {
                    throw new Error(`[pch-core] carrier ${carrierIndex} layer ${layerIndex} has no visual source`);
                }
                return {
                    world: beanTransform.convertToWorldSpaceAR(new Vec3()),
                    size: Math.max(1, 31 * (this.runtime.getNodeScaleInLayer?.(beanNode, this.root) || 1)),
                };
            } catch (error) {
                console.error('[pch-return] source visual unavailable:', error);
                return null;
            }
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
        try {
            this.renderConveyorCarrier(carrierIndex);
            this.refreshStatus();
        } catch (error) {
            console.error('[pch-return] conveyor visual sync failed:', error);
        }
        const returnColorBatches = new Map<number, PchReturnColorEffectBatch>();
        this.returnBatchInProgress = true;
        try {
            result.boardCells.forEach((target, index) => {
                const source = sourceLayers[result.sourceLayerIndices[index]];
                const colorId = result.colorIds[index];
                let colorBatch = returnColorBatches.get(colorId);
                if (!colorBatch) {
                    colorBatch = { colorId, pendingSettleFxCount: 0 };
                    returnColorBatches.set(colorId, colorBatch);
                }
                colorBatch.pendingSettleFxCount += 1;
                if (source) {
                    this.animateBeanReturn(colorId, source.world, source.size, target, index, colorBatch);
                } else {
                    this.activeReturnAnimations += 1;
                    try { this.runtime.renderBoardCell(target.row, target.col); }
                    catch (error) { console.error('[pch-return] board visual sync failed:', error); }
                    this.finishReturnAnimation(target, colorBatch);
                }
            });
        } finally {
            this.returnBatchInProgress = false;
        }
        try { this.playExitPulse(); }
        catch (error) { console.error('[pch-return] exit pulse unavailable:', error); }
        if (this.rules.board.isAllLocked()) this.inputLocked = true;
        this.tryCommitFinishAfterPchColorCompleteEffects();
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
                this.runtime.recordPvpRuleEvent?.(3);
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
        const generation = this.pchColorCompleteSequenceGeneration;
        let bean: Node | null = null;
        let completed = false;
        this.activeReturnAnimations += 1;
        const completeReturn = () => {
            if (completed || generation !== this.pchColorCompleteSequenceGeneration) return;
            completed = true;
            this.presentationCompletions.delete(completeReturn);
            this.runtime.unschedule?.(completeReturn);
            try {
                if (bean) {
                    this.activeReturnBeans.delete(bean);
                    this.pendingReturnCompletions.delete(bean);
                    this.destroyFlyBean(bean);
                }
                this.runtime.renderBoardCell(target.row, target.col);
            } catch (error) {
                console.error('[pch-return] visual cleanup failed:', error);
            } finally {
                this.finishReturnAnimation(target, colorBatch);
            }
        };
        const flightDelay = staggerIndex * PCH_RETURN_STAGGER_SECONDS;
        this.presentationCompletions.set(completeReturn, flightDelay + PCH_RETURN_TRANSFER_SECONDS + 1);
        try {
            if (!this.root) throw new Error('[pch-core] conveyor return visual root is unavailable');
            const rootTransform = this.root.getComponent(UITransform)!;
            bean = this.createFlyBean(`PchReturnBean-${target.row}-${target.col}`, colorId, sourceBeanSize, sourceWorld);
            const startLocal = bean.position.clone();
            this.activeReturnBeans.add(bean);
            this.attachSphereFlyEffect(bean, sourceBeanSize, flightDelay);
            tween(bean)
                .delay(flightDelay)
                .call(() => {
                    if (completed || generation !== this.pchColorCompleteSequenceGeneration) return;
                    AudioMgr.inst.play('settle');
                    AudioMgr.inst.vibratePlace();
                })
                .to(PCH_RETURN_TRANSFER_SECONDS, {}, {
                    // Keep the tween on the bean so existing pause/cleanup still applies.
                    onUpdate: (_node: Node, ratio: number) => {
                        if (completed || generation !== this.pchColorCompleteSequenceGeneration || !bean?.isValid) return;
                        const targetWorld = this.getBoardCellWorldPosition(target.row, target.col);
                        const targetLocal = rootTransform.convertToNodeSpaceAR(targetWorld);
                        const targetBeanSize = Math.max(1, this.runtime.getBoardFlyBeanSizeInLayer?.(this.root) || sourceBeanSize);
                        // onUpdate receives linear time; preserve the original quadOut motion.
                        const progress = 1 - (1 - ratio) * (1 - ratio);
                        bean.setPosition(
                            startLocal.x + (targetLocal.x - startLocal.x) * progress,
                            startLocal.y + (targetLocal.y - startLocal.y) * progress,
                            startLocal.z + (targetLocal.z - startLocal.z) * progress,
                        );
                        const scale = 1 + (targetBeanSize / sourceBeanSize - 1) * progress;
                        bean.setScale(scale, scale, 1);
                    },
                })
                .call(() => {
                    if (completed || generation !== this.pchColorCompleteSequenceGeneration) return;
                    try {
                        bean.active = false;
                        this.runtime.renderBoardCell(target.row, target.col);
                        this.runtime.playBeanSettleMatchFxOnCell?.(target.row, target.col);
                        this.pendingReturnCompletions.set(bean, completeReturn);
                        if (!this.settlementPaused && !this.settingsPaused) {
                            this.runtime.scheduleOnce(completeReturn, PCH_RETURN_COMPLETE_DELAY_SECONDS);
                        }
                    } catch (error) {
                        console.error('[pch-return] completing settled bean without effect:', error);
                        completeReturn();
                    }
                })
                .start();
        } catch (error) {
            console.error('[pch-return] completing committed return without animation:', error);
            completeReturn();
        }
    }

    private finishReturnAnimation(target: { row: number; col: number }, colorBatch: PchReturnColorEffectBatch): void {
        this.activeReturnAnimations = Math.max(0, this.activeReturnAnimations - 1);
        this.schedulePchReturnColorSettle(colorBatch);
        const boardComplete = this.rules?.board.isAllLocked() === true;
        try {
            this.runtime.syncSkillButtonRuntimeStates?.();
            this.runtime.checkGuideStepComplete?.();
            if (!boardComplete) this.runtime.refreshEndgameHints?.(`pch-return-${target.row}-${target.col}`);
        } catch (error) {
            console.error('[pch-return] post-return UI sync failed:', error);
        } finally {
            if (boardComplete) this.tryCommitFinishAfterPchColorCompleteEffects();
        }
    }

    private schedulePchReturnColorSettle(colorBatch: PchReturnColorEffectBatch): void {
        const generation = this.pchColorCompleteSequenceGeneration;
        const completeColorSettle = () => {
            this.presentationCompletions.delete(completeColorSettle);
            if (!this.pendingPchReturnColorSettles.has(completeColorSettle)) return;
            this.pendingPchReturnColorSettles.delete(completeColorSettle);
            if (generation !== this.pchColorCompleteSequenceGeneration || this.runtime.isGameEnd) return;
            colorBatch.pendingSettleFxCount = Math.max(0, colorBatch.pendingSettleFxCount - 1);
            if (colorBatch.pendingSettleFxCount > 0) return;
            if (this.runtime.markColorCompleteIfNeeded(colorBatch.colorId) !== true) {
                this.tryCommitFinishAfterPchColorCompleteEffects();
                return;
            }
            this.playPchColorCompleteEffect(colorBatch);
        };
        this.pendingPchReturnColorSettles.add(completeColorSettle);
        this.presentationCompletions.set(completeColorSettle, PCH_RETURN_COLOR_COMPLETE_DELAY_SECONDS + 1);
        if (!this.settlementPaused && !this.settingsPaused) {
            this.runtime.scheduleOnce(completeColorSettle, PCH_RETURN_COLOR_COMPLETE_DELAY_SECONDS);
        }
    }

    private playPchColorCompleteEffect(colorBatch: PchReturnColorEffectBatch): void {
        const generation = this.pchColorCompleteSequenceGeneration;
        this.activePchColorCompleteEffects += 1;
        let completed = false;
        const complete = () => {
            if (completed || generation !== this.pchColorCompleteSequenceGeneration) return;
            completed = true;
            this.presentationCompletions.delete(complete);
            this.activePchColorCompleteEffects = Math.max(0, this.activePchColorCompleteEffects - 1);
            this.tryCommitFinishAfterPchColorCompleteEffects();
        };
        this.presentationCompletions.set(complete, 3);
        try {
            this.runtime.playColorCompleteEffect(colorBatch.colorId, true, complete);
        } catch (error) {
            console.error('[pch-return] completing color without effect:', error);
            complete();
        }
    }

    isPostPlayableWarmupIdle(): boolean {
        return this.isStartupInteractionReady()
            && !this.externalInputBlocked
            && !this.skillMovementPaused
            && this.activeFlyBeans.size === 0
            && this.activeReturnAnimations === 0
            && this.pendingPchReturnColorSettles.size === 0
            && this.activePchColorCompleteEffects === 0;
    }

    private tryCommitFinishAfterPchColorCompleteEffects(): void {
        if (this.rules?.board?.isAllLocked() !== true
            || this.runtime._skillActive === true
            || this.returnBatchInProgress
            || this.activeReturnAnimations > 0
            || this.pendingPchReturnColorSettles.size > 0
            || this.activePchColorCompleteEffects > 0) {
            return;
        }
        this.commitFinish();
    }

    private clearPchColorCompleteSequence(): void {
        this.presentationCompletions.clear();
        this.pchColorCompleteSequenceGeneration += 1;
        for (const callback of this.pendingPchReturnColorSettles) {
            this.runtime.unschedule?.(callback);
        }
        this.pendingPchReturnColorSettles.clear();
        this.activePchColorCompleteEffects = 0;
    }

    private commitFinish(): void {
        if (this.finishCommitted || this.runtime.isGameEnd) return;
        this.flushCsdObservations('settlement');
        this.runtime.resetFirstLevelReleaseDiagnostics?.();
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
            sprite.type = Sprite.Type.SIMPLE;
            sprite.color = SPHERE_FLY_TRAIL_COLOR;
            opacity.opacity = 255;
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
            previousEmitterPosition: new Vec3(emitterPosition.x, emitterPosition.y, emitterPosition.z),
            currentEmitterPosition: new Vec3(emitterPosition.x, emitterPosition.y, emitterPosition.z),
            trailTailPosition: new Vec3(emitterPosition.x, emitterPosition.y, emitterPosition.z),
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

            this.updateSphereFlyStarParticles(state, activeDelta);
            this.emitSphereFlyStarsAlongSegment(state, state.previousEmitterPosition, currentEmitterPosition);
            this.updateSphereFlyTrail(state, currentEmitterPosition, activeDelta);
            state.previousEmitterPosition.set(currentEmitterPosition);
        }
    }

    private updateSphereFlyTrail(
        state: SphereFlyEffectInstance,
        emitterPosition: Vec3,
        deltaTime: number,
    ): void {
        const tailFollow = 1 - Math.exp(-Math.max(0, deltaTime) / SPHERE_FLY_TRAIL_FOLLOW_SECONDS);
        state.trailTailPosition.x += (emitterPosition.x - state.trailTailPosition.x) * tailFollow;
        state.trailTailPosition.y += (emitterPosition.y - state.trailTailPosition.y) * tailFollow;

        let backwardX = state.trailTailPosition.x - emitterPosition.x;
        let backwardY = state.trailTailPosition.y - emitterPosition.y;
        let trailDistance = Math.sqrt(backwardX * backwardX + backwardY * backwardY);
        const beanScale = Math.max(0.001, Math.abs(state.bean.scale.x));
        const maxTrailLength = state.beanSize * beanScale * SPHERE_FLY_TRAIL_MAX_LENGTH_RATIO;
        if (trailDistance > maxTrailLength) {
            const limitScale = maxTrailLength / trailDistance;
            backwardX *= limitScale;
            backwardY *= limitScale;
            trailDistance = maxTrailLength;
            state.trailTailPosition.set(
                emitterPosition.x + backwardX,
                emitterPosition.y + backwardY,
                emitterPosition.z,
            );
        }
        if (trailDistance < 0.5) {
            state.trail.active = false;
            return;
        }
        const trailWidth = state.beanSize * beanScale * SPHERE_FLY_TRAIL_WIDTH_RATIO
            * SPHERE_FLY_TRAIL_WIDTH_OVER_TRAIL;
        const textureLength = trailDistance;
        for (const segment of state.trailSegments) {
            segment.transform.setContentSize(Math.max(1, textureLength), Math.max(1, trailWidth));
        }
        state.trail.setPosition(emitterPosition);
        state.trail.angle = Math.atan2(-backwardY, -backwardX) * 180 / Math.PI;
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
        if (this.analyticsStats) {
            const bufferCount = Math.max(0, this.rules.bufferCount);
            const bufferCapacity = Math.max(0, this.rules.bufferCapacity);
            const lockedCount = this.rules.cells.reduce((count, cell) => count + (cell.locked ? 1 : 0), 0);
            this.analyticsStats.peakBufferCount = Math.max(this.analyticsStats.peakBufferCount, bufferCount);
            this.analyticsStats.peakBufferRatio = Math.max(
                this.analyticsStats.peakBufferRatio,
                bufferCapacity > 0 ? bufferCount / bufferCapacity : 0,
            );
            this.analyticsStats.finalBufferCount = bufferCount;
            this.analyticsStats.finalLockedCount = lockedCount;
            this.analyticsStats.finalProgressRatio = this.analyticsStats.totalBeanCount > 0
                ? lockedCount / this.analyticsStats.totalBeanCount
                : 0;
        }
        const isFull = this.rules.bufferCount >= this.rules.bufferCapacity;
        this.reportLevelThreeProgress();
        if (this.statusLabel) {
            this.statusLabel.string = this.rules.entryCount > 0
                ? `入口等待 ${this.rules.entryCount} 颗 · 格位到达后自动装载`
                : `${this.rules.carrierCount} 个循环位置 · 当前容量 ${this.rules.bufferCapacity}`;
            this.statusLabel.color = isFull ? new Color(202, 56, 82) : new Color(79, 65, 126);
        }
        if (this.countLabel) {
            this.countLabel.string = `${this.rules.bufferCount}/${this.rules.bufferCapacity}`;
        }
        const capacityRatio = this.rules.bufferCapacity > 0
            ? this.rules.bufferCount / this.rules.bufferCapacity
            : 0;
        const clampedCapacityRatio = Math.min(1, Math.max(0, capacityRatio));
        if (this.capacityProgress) {
            this.capacityProgress.progress = clampedCapacityRatio;
        }
        this.renderNormalCapacityTrack(this.capacityTrack, clampedCapacityRatio);
        this.syncWarningOverlay(Math.max(0, this.rules.bufferCapacity - this.rules.bufferCount));
        this.runtime.refreshCompletionProgressLabel?.();
        this.runtime.syncSkillButtonRuntimeStates?.();
    }

    private renderNormalCapacityTrack(capacityTrack: Node | null | undefined, ratio: number): void {
        if (!capacityTrack?.isValid) return;
        const transform = capacityTrack.getComponent(UITransform);
        const fillSpriteNode = capacityTrack.getChildByName('FillSprite');
        const fillTransform = fillSpriteNode?.getComponent(UITransform);
        const fillSprite = fillSpriteNode?.getComponent(Sprite);
        if (!transform || !fillSpriteNode || !fillTransform || !fillSprite) {
            throw new Error('[pch-core] PchCapacityTrack must provide FillSprite, Sprite, and UITransform components');
        }
        const { width, height } = transform.contentSize;
        if (width <= 0 || height <= 0) {
            fillSpriteNode.active = false;
            return;
        }

        const safeRatio = Math.min(1, Math.max(0, Number(ratio) || 0));
        const isV2 = capacityTrack.parent?.parent?.name === 'NormalLayoutV2';
        const inset = isV2 ? 0 : PCH_CAPACITY_PROGRESS_INSET;
        // Overlap the left inner rim slightly without moving the progress endpoint.
        const leftOverlap = isV2 ? 2 : 0;
        const fillLeft = -width / 2 + inset - leftOverlap;
        const fillWidth = safeRatio > 0
            ? Math.max(0, width - inset * 2) * safeRatio + leftOverlap
            : 0;
        const fillHeight = Math.max(0, height - inset * 2);
        const highResolutionScale = isV2
            ? fillHeight / fillSprite.spriteFrame!.originalSize.height
            : PCH_CAPACITY_SLICED_RENDER_SCALE;

        if (isV2) {
            const mask = capacityTrack.getComponent(Mask) || capacityTrack.addComponent(Mask);
            mask.type = Mask.Type.GRAPHICS_STENCIL;
            const graphics = capacityTrack.getComponent(Graphics);
            if (!graphics) throw new Error('[pch-core] V2 capacity mask must provide Graphics');
            graphics.clear();
            if (fillWidth > 0 && fillHeight > 0) {
                graphics.roundRect(
                    fillLeft,
                    -fillHeight / 2,
                    fillWidth,
                    fillHeight,
                    Math.min(fillWidth, fillHeight) / 2,
                );
                graphics.fill();
            }
        }

        if (fillWidth <= 0 || fillHeight <= 0) {
            fillSpriteNode.active = false;
            return;
        }
        fillSpriteNode.active = true;
        // Keep V2's colour field fixed; only the rounded stencil reveals progress.
        const imageWidth = isV2 ? width - inset * 2 + leftOverlap : fillWidth;
        fillTransform.setContentSize(imageWidth / highResolutionScale, fillHeight / highResolutionScale);
        fillSpriteNode.setPosition(
            fillLeft + imageWidth / 2,
            0,
            0,
        );
        fillSpriteNode.setScale(highResolutionScale, highResolutionScale, 1);
    }

    private resetCapacityWarning(): void {
        this.resetWarningOverlay();
    }

    private resetWarningOverlay(): void {
        this.warningPulseGeneration += 1;
        this.warningOverlayRunning = false;
        this.warningOverlayShown = false;
        this.resetCapacityNumberWarning();
        if (this.warningOverlayOpacity?.isValid) {
            Tween.stopAllByTarget(this.warningOverlayOpacity);
            this.warningOverlayOpacity.opacity = 0;
        }
        if (this.warningOverlay?.isValid) {
            Tween.stopAllByTarget(this.warningOverlay);
            this.warningOverlay.setScale(1, 1, 1);
            this.warningOverlay.active = false;
        }
    }

    private resetCapacityNumberWarning(): void {
        this.capacityWarningAnimation?.stop();
        if (this.countLabel?.isValid) {
            this.countLabel.color = this.capacityTextColor;
            this.countLabel.outlineColor = this.capacityOutlineColor;
            this.countLabel.enableOutline = this.capacityOutlineEnabled;
        }
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
        sprite.color = new Color(255, 255, 255, 255);
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
        this.capacityWarningAnimation?.stop();
        this.warningOverlayRunning = true;
        this.warningOverlayShown = true;
        overlay.active = true;
        overlay.setScale(1, 1, 1);
        opacity.opacity = 0;
        if (this.countLabel?.isValid) {
            this.countLabel.enableOutline = true;
            this.countLabel.outlineColor = Color.WHITE;
            this.countLabel.color = PCH_RED_WARNING_TEXT_COLOR;
        }
        const textColor = new Color();
        const updateTextColor = () => {
            if (!this.warningOverlayRunning || generation !== this.warningPulseGeneration || !this.countLabel?.isValid) return;
            const ratio = Math.max(0, Math.min(1, opacity.opacity / PCH_RED_WARNING_MAX_OPACITY));
            Color.lerp(textColor, PCH_RED_WARNING_TEXT_COLOR, Color.RED, ratio);
            this.countLabel.color = textColor;
        };
        let completedPulses = 0;
        const pulse = () => {
            if (!this.warningOverlayRunning || generation !== this.warningPulseGeneration || !overlay.isValid || !opacity.isValid) return;
            if (completedPulses >= 3) {
                this.warningOverlayRunning = false;
                overlay.active = false;
                opacity.opacity = 0;
                this.resetCapacityNumberWarning();
                return;
            }
            tween(opacity)
                .to(PCH_RED_WARNING_PULSE_SECONDS, { opacity: PCH_RED_WARNING_MAX_OPACITY }, {
                    easing: 'sineInOut', onUpdate: updateTextColor,
                })
                .to(PCH_RED_WARNING_PULSE_SECONDS, { opacity: 0 }, {
                    easing: 'sineInOut', onUpdate: updateTextColor,
                })
                .call(() => {
                    completedPulses += 1;
                    pulse();
                })
                .start();
        };
        pulse();
    }

    private syncWarningOverlay(remaining: number): void {
        if (this.settlementPaused || this.finishCommitted || this.runtime.isGameEnd || remaining > PCH_RED_WARNING_REMAINING_THRESHOLD || this.rules.hasReturnableCarrierMatch()) {
            this.resetWarningOverlay();
            return;
        }
        if (!this.warningOverlayShown) this.startWarningOverlayPulse();
    }

    private runConveyorSkill(
        kind: 'magnet' | 'brush' | 'revive',
        _timerAlreadyPaused: boolean,
        execute: () => PchSkillResult,
    ): boolean {
        const isRevive = kind === 'revive';
        if (!this.rules || !this.root?.isValid) return false;
        if (isRevive) {
            if (!this.runtime.isGameEnd || this.activeFlyBeans.size > 0
                || this.activeReturnAnimations > 0 || this.runtime._skillActive === true) return false;
        } else if (this.runtime.isGameEnd || this.isSkillBusy()) return false;
        // Commit the rule transaction before granting revival; failure leaves settlement intact.
        let result: PchSkillResult;
        try {
            result = this.rules.executeSkillAtomically(execute);
        } catch (error) {
            if (!isRevive) this.releaseActiveSkillPause();
            console.error('[pch-skill] rule transaction rolled back:', error);
            return false;
        }
        this.runtime._skillActive = true;
        if (isRevive) this.runtime.continueAfterLose(0, true);
        // continueAfterLose resets timer pause references, so acquire our pause afterwards.
        this.beginSkillUsePause(isRevive ? 'brush' : kind);
        const skillGeneration = this.runtime.armSkillUsageWatchdog?.(`pch-${kind}`)
            || Math.max(0, Number(this.runtime._activeSkillUsageGeneration) || 0);
        this.inputLocked = true;
        if (!isRevive && result.moved > 0 && this.analyticsStats) {
            if (kind === 'magnet') {
                this.analyticsStats.magnetUses += 1;
            } else {
                this.analyticsStats.brushUses += 1;
            }
        }

        const rules = this.rules;
        const skillBeans = new Set<Node>();
        const recover = (label: string, callback: () => void) => {
            try { callback(); } catch (error) {
                console.error(`[pch-skill] ${label}:`, error);
            }
        };
        const finish = () => {
            if (this.activeSkillFinish !== finish || this.rules !== rules) return;
            this.activeSkillFinish = null;
            this.runtime.unschedule?.(finish);
            for (const bean of skillBeans) {
                recover('release visual', () => this.destroyFlyBean(bean));
            }
            skillBeans.clear();
            this.inputLocked = false;
            for (const move of result.moves) {
                this.runtime._flyingTargets?.delete?.(`${move.target.row},${move.target.col}`);
            }
            recover('board sync', () => this.runtime.renderBoardCells?.(result.boardCells));
            recover('conveyor sync', () => this.renderConveyor());
            recover('queue sync', () => this.renderEntranceQueue());
            recover('status sync', () => this.refreshStatus());
            recover('color completion', () => this.runtime.checkColorCompletion?.());
            const boardComplete = this.rules?.board.isAllLocked() === true;
            recover('guide completion', () => this.runtime.checkGuideStepComplete?.());
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
        this.activeSkillFinish = finish;
        try {
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
                skillBeans.add(bean);
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
                        if (this.activeSkillFinish !== finish || this.rules !== rules || !skillBeans.has(bean)) return;
                        try {
                            this.destroyFlyBean(bean);
                            skillBeans.delete(bean);
                            this.runtime._flyingTargets?.delete?.(`${move.target.row},${move.target.col}`);
                            this.runtime.renderBoardCell?.(move.target.row, move.target.col);
                            AudioMgr.inst.play('settle');
                            this.playSkillTargetPulse(move.target, () => {});
                            remaining -= 1;
                            if (remaining <= 0) finish();
                        } catch (error) {
                            console.error('[pch-skill] finishing committed move without animation:', error);
                            finish();
                        }
                    })
                    .start();
            });
        } catch (error) {
            console.error('[pch-skill] finishing committed result without animation:', error);
            finish();
        }
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
        direction.setScale(PCH_DIRECTION_SCALE, PCH_DIRECTION_SCALE, 1);
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
        this.beltPath = createRoundedConveyorPath(tableType, RAINBOW_CONVEYOR_SOURCE_SCALE);
        this.exitPathProgress = conveyorExitProgress(tableType);
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

    private bindConveyorLayout(root: Node, name: 'NormalLayoutV2'): ConveyorLayoutBindings {
        const basePath = `GameplayFixedRoot/PchConveyorRoot/${name}`;
        const node = this.requireConveyorNode(root, name, basePath);
        // Empty bounds node is retained for opening-guide positioning, not legacy art.
        this.requireConveyorNode(node, 'PchMovingTrack', `${basePath}/PchMovingTrack`);
        this.requireConveyorSprite(node, 'TrackSkinV2', `${basePath}/TrackSkinV2`);
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
        let capacityProgress: ProgressBar | null = null;
        let capacityTrack: Node | null = null;
        capacityTrack = this.requireConveyorNode(capacityBadge, 'PchCapacityTrack', `${basePath}/PchCapacityBadge/PchCapacityTrack`);
        const fillSpriteNode = this.requireConveyorSprite(capacityTrack, 'FillSprite', `${basePath}/PchCapacityBadge/PchCapacityTrack/FillSprite`);
        if (!capacityTrack.getComponent(UITransform) || !fillSpriteNode.getComponent(UITransform)
            || fillSpriteNode.getComponent(Sprite)?.type !== Sprite.Type.SLICED) {
            throw new Error('[pch-core] Capacity track must provide a sliced FillSprite and UITransform');
        }
        this.renderNormalCapacityTrack(capacityTrack, 0);
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
            capacityTrack,
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
        if (this.runtime.isRankedPvpMode?.() === true) return;
        this.capacityGuideArmed = logicalLevelId === 4 || logicalLevelId === 5;
        if (logicalLevelId === 4) {
            this.runtime.startPinchGuide({
                title: '双指拖动可放大缩小图案',
                autoCloseSeconds: 0,
            });
            return;
        }
        const shouldShowGuide = logicalLevelId === 1
            || (logicalLevelId === 2 && !!this.speedButton?.isValid)
            || (logicalLevelId === 3 && !!this.adButton?.isValid);
        if (!shouldShowGuide) return;
        try {
            if (logicalLevelId === 1) {
                this.showLevelOneBoardGuide(parent);
            } else if (logicalLevelId === 2 && this.speedButton?.isValid) {
                this.showOpeningTargetGuide(parent, this.speedButton, 'PchLevelTwoSpeedGuide', '你可以调整传送带的速度', this.onOpeningGuideTripleSpeed);
            } else if (logicalLevelId === 3 && this.adButton?.isValid) {
                this.trackPchFunnelEvent('capacity_eligibility', { source: 'opening_guide', success: true,
                    extra: { mode: 'free', eligible: true, basis: 'per_round_guide', capacity: this.rules?.bufferCapacity || 0 } });
                this.showLevelThreeCapacityGuide(parent);
            }
        } catch (error) {
            if (logicalLevelId === 1 && this.runtime.levelData?.tutorialGuide?.openingColors !== undefined) {
                this.runtime._stopGameplayEntryWithFatalError(
                    this.runtime.getLevelDataPath(1), 'opening_guide_invalid', String(error),
                );
                return;
            }
            console.error('[pch-guide] releasing incomplete guide:', error);
            this.dismissOpeningGuide();
        }
    }

    private maybeShowCapacityPressureGuide(): void {
        if (!this.capacityGuideArmed || !this.rules || !this.firstStoreEventSent
            || this.runtime._activeGameplayEntryMode !== 'main' || this.runtime.isRankedPvpMode?.()
            || this.runtime.isGameEnd || this.runtime._gameForeground === false
            || this.settingsPaused || this.settlementPaused || this.skillMovementPaused
            || this.externalInputBlocked || this.inputLocked || this.openingGuide?.isValid
            || this.runtime._adShowing || this.runtime._rewardedGrantTransaction
            || !this.adButton?.activeInHierarchy) return;
        if (this.rules.bufferCapacity - this.rules.bufferCount > 12) return;
        if (!this.rules.cells.some(cell => !cell.locked && cell.current > 0)) return;
        if (!this.capacityGuideEligibleSent) {
            this.capacityGuideEligibleSent = true;
            if (this.analyticsStats) this.analyticsStats.capacitySoftHintEligibleCount += 1;
            this.trackPchFunnelEvent?.('pch_capacity_soft_hint_eligible', {
                source: 'capacity_pressure',
                success: true,
                extra: {
                    bufferCount: this.rules.bufferCount,
                    bufferCapacity: this.rules.bufferCapacity,
                    bufferRatio: this.rules.bufferCapacity > 0
                        ? this.rules.bufferCount / this.rules.bufferCapacity
                        : 0,
                    remainingCapacity: Math.max(0, this.rules.bufferCapacity - this.rules.bufferCount),
                },
            });
        }
        const guideBubbleFrame = this.runtime.getSF?.('guide_bubble_frame');
        if (!guideBubbleFrame) return;
        if (typeof this.runtime._applySpriteFrame !== 'function') {
            this.capacityGuideArmed = false;
            console.error('[pch-guide] capacity hint sprite applicator is unavailable');
            return;
        }
        const sourceHand = this.runtime.requireCanvasUiRoot?.('OverlayRoot')
            ?.getChildByName('TutorialGuideHands')?.getChildByName('GuideHandSingle') || null;
        if (!sourceHand?.getComponent(Sprite)) {
            this.capacityGuideArmed = false;
            console.error('[pch-guide] capacity hint guide hand is unavailable');
            return;
        }
        this.capacityGuideArmed = false;
        const parent = this.runtime.getGameplayFixedRoot() as Node;
        const parentTransform = parent.getComponent(UITransform)!;
        const bounds = this.adButton!.getComponent(UITransform)!.getBoundingBoxToWorld();
        const anchor = parentTransform.convertToNodeSpaceAR(new Vec3(bounds.center.x, bounds.yMax, 0));
        const width = OPENING_GUIDE_PROMPT_WIDTH;
        const height = OPENING_GUIDE_PROMPT_HEIGHT;
        const x = 0;
        const y = this.getOpeningGuidePromptCenterYAboveConveyor(parent, height) - 36;
        this.capacityHint = this.makeNode('PchCapacitySoftHint', parent, width, height, x, y);
        const background = this.makeNode('OpeningGuideBubbleBackground', this.capacityHint, width, height, 0, 0);
        this.runtime._applySpriteFrame(background, guideBubbleFrame, width, height, Sprite.Type.SLICED);
        const title = this.makeLabel(this.capacityHint, '传送带快满了', 32, Color.WHITE, 0, 26, width - 64);
        const detail = this.makeLabel(this.capacityHint, `本次扩容免费，点击增加${this.getCapacityButtonIncrement()}格`, 28, Color.WHITE, 0, -22, width - 64);
        this.applyOpeningGuidePromptLabelStyle(title);
        this.applyOpeningGuidePromptLabelStyle(detail);
        const hand = instantiate(sourceHand);
        hand.name = 'CapacityHintHand';
        this.capacityHint.addChild(hand);
        hand.active = true;
        const handX = anchor.x - x + 42;
        const handRestY = anchor.y - y - 52;
        const handPressY = anchor.y - y - 36;
        hand.setPosition(handX, handRestY, 0);
        hand.setScale(0.92, 0.92, 1);
        tween(hand)
            .repeatForever(
                tween()
                    .to(0.42, { position: new Vec3(handX, handPressY, 0), scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
                    .to(0.42, { position: new Vec3(handX, handRestY, 0), scale: new Vec3(0.92, 0.92, 1) }, { easing: 'sineInOut' }),
            )
            .start();
        this.capacityHintWasShown = true;
        if (this.analyticsStats) this.analyticsStats.capacitySoftHintShownCount += 1;
        this.trackPchFunnelEvent?.('pch_capacity_soft_hint_shown', {
            source: 'capacity_pressure',
            success: true,
            extra: {
                bufferCount: this.rules.bufferCount,
                bufferCapacity: this.rules.bufferCapacity,
                bufferRatio: this.rules.bufferCapacity > 0
                    ? this.rules.bufferCount / this.rules.bufferCapacity
                    : 0,
                remainingCapacity: Math.max(0, this.rules.bufferCapacity - this.rules.bufferCount),
            },
        });
    }

    private updateCapacityHint(): void {
        if (!this.capacityHint) return;
        if (this.runtime.isGameEnd) {
            this.clearCapacityHint();
            return;
        }
        this.capacityHint.active = !(this.settingsPaused || this.settlementPaused
            || this.externalInputBlocked || this.skillMovementPaused || this.runtime._gameForeground === false
            || this.runtime._adShowing || this.runtime._rewardedGrantTransaction);
    }

    private clearCapacityHint(): void {
        if (this.capacityHint?.isValid) this.capacityHint.destroy();
        this.capacityHint = null;
    }

    private showLevelOneBoardGuide(parent: Node): void {
        if (!this.rules) return;
        const colors = new Set<number>();
        this.openingGuideLevelOneCells = [];
        const configured = this.runtime.levelData?.tutorialGuide;
        if (configured?.openingColors !== undefined) {
            if (!Array.isArray(configured.openingColors) || configured.openingColors.length !== 2
                || new Set(configured.openingColors).size !== 2
                || !Array.isArray(configured.guideCopies) || configured.guideCopies.length !== 2
                || configured.guideCopies.some((copy: unknown) => typeof copy !== 'string' || !copy.trim())) {
                throw new Error('[pch-core] first-level guide requires two colors and two non-empty copies');
            }
            for (const color of configured.openingColors) {
                const cell = this.rules.cells.find(item => !item.locked && item.current === color && color > 0);
                if (!cell) throw new Error(`[pch-core] first-level guide color is not playable: ${color}`);
                this.openingGuideLevelOneCells.push({ row: cell.row, col: cell.col });
            }
            this.openingGuideLevelOneStep = 0;
            this.loadOpeningGuideBeanRing(parent, () => this.showLevelOneBoardGuideStep(parent));
            return;
        }
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
        this.loadOpeningGuideBeanRing(parent, () => this.showLevelOneBoardGuideStep(parent));
    }

    private loadOpeningGuideBeanRing(parent: Node, onReady: () => void): void {
        if (this.openingGuideRingData) {
            onReady();
            return;
        }
        this.inputLocked = true;
        const version = ++this.openingGuideRingLoadVersion;
        const rules = this.rules;
        const isCurrent = () => version === this.openingGuideRingLoadVersion
            && this.rules === rules && !!rules && parent.isValid && !this.runtime.isGameEnd;
        const fail = (message: string) => {
            if (!isCurrent()) return;
            this.runtime._stopGameplayEntryWithFatalError(
                'Effects/GuideBeanRing/guang_quan', 'opening_guide_ring_missing', message,
            );
        };
        this.runtime._withBootstrapBundle((bundle: any, error?: Error) => {
            if (!isCurrent()) return;
            if (error || !bundle) {
                fail(error?.message || 'BootstrapBundle unavailable');
                return;
            }
            bundle.load('Effects/GuideBeanRing/guang_quan', sp.SkeletonData, (err: Error | null, data: sp.SkeletonData | null) => {
                if (!isCurrent()) return;
                if (err || !data) {
                    fail(err?.message || 'guide ring SkeletonData unavailable');
                    return;
                }
                this.openingGuideRingData = data;
                try {
                    onReady();
                } catch (error) {
                    fail(error instanceof Error ? error.message : String(error));
                    this.clearOpeningGuideNodes();
                }
            });
        });
    }

    private showOpeningGuideBeanRings(cells: Array<{ row: number; col: number }>): void {
        const data = this.openingGuideRingData;
        if (!data) throw new Error('[pch-guide] guide ring is not loaded');
        for (const cell of cells) {
            const bean = this.runtime.cellNodes?.[cell.row]?.[cell.col] as Node | null;
            const transform = bean?.getComponent(UITransform);
            if (!bean?.isValid || !transform) throw new Error('[pch-guide] guide bean is unavailable');
            const ring = this.makeNode('OpeningGuideBeanRing', bean, 242.59, 242.59, 0, 0);
            this.openingGuideRingNodes.push(ring);
            const scale = Math.max(transform.contentSize.width, transform.contentSize.height) * 1.35 / 242.59;
            ring.setScale(scale, scale, 1);
            const skeleton = ring.addComponent(sp.Skeleton);
            skeleton.setAnimationCacheMode(sp.Skeleton.AnimationCacheMode.SHARED_CACHE);
            skeleton.skeletonData = data;
            skeleton.premultipliedAlpha = false;
            if (!skeleton.findAnimation('animation')) throw new Error('[pch-guide] guide ring animation is unavailable');
            skeleton.setAnimation(0, 'animation', true);
        }
    }

    private showLevelOneBoardGuideStep(parent: Node): void {
        const promptY = this.prepareLevelOnePromptLayout(parent);
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
        const targetWorldX = (minX + maxX) / 2;
        const targetWorldY = (minY + maxY) / 2;
        const pointedCell = targetCells.reduce((nearest, candidate) => {
            const distance = (item: { row: number; col: number }) => {
                const bounds = this.runtime.cellNodes[item.row][item.col].getComponent(UITransform).getBoundingBoxToWorld();
                return (bounds.center.x - targetWorldX) ** 2 + (bounds.center.y - targetWorldY) ** 2;
            };
            return distance(candidate) < distance(nearest) ? candidate : nearest;
        });
        const pointedBounds = this.runtime.cellNodes[pointedCell.row][pointedCell.col].getComponent(UITransform).getBoundingBoxToWorld();
        const handTargetLocal = parentTransform.convertToNodeSpaceAR(new Vec3(pointedBounds.center.x, pointedBounds.center.y, 0));
        this.openingGuideLevelOneCells[this.openingGuideLevelOneStep] = { row: pointedCell.row, col: pointedCell.col };
        const defaultCopy = this.openingGuideLevelOneStep === 0
            ? '点击白色豆豆\n放入传送带'
            : '蓝色格子空出来了\n需要蓝色豆豆';
        const guideConfig = this.runtime.levelData?.tutorialGuide;
        const copy = guideConfig?.openingColors
            ? guideConfig.guideCopies[this.openingGuideLevelOneStep]
            : defaultCopy;
        this.showOpeningTargetGuideAt(
            parent,
            targetLocal,
            Math.abs(topRight.x - bottomLeft.x),
            Math.abs(topRight.y - bottomLeft.y),
            `PchLevelOneGuideStep${this.openingGuideLevelOneStep + 1}`,
            copy,
            this.onOpeningGuideLevelOneTap,
            true,
            promptY,
            handTargetLocal,
        );
        this.showOpeningGuideBeanRings(targetCells);
        if (getFirstLevelContent() === 'A' && !guideConfig?.openingColors) {
            AudioMgr.inst.playGuideVoice(this.openingGuideLevelOneStep === 0 ? 'guideA1' : 'guideA2');
        }
    }

    private createOpeningGuideFocusMask(
        parent: Node,
        targetLocal: Vec3,
        targetWidth: number,
        targetHeight: number,
    ): void {
        const openingGuide = this.openingGuide;
        const parentTransform = parent.getComponent(UITransform);
        if (!openingGuide?.isValid || !parentTransform) {
            throw new Error('[pch-core] level 1 guide mask parent is unavailable');
        }
        const conveyorTrack = this.belt?.getChildByName('PchMovingTrack') || null;
        const conveyorTransform = conveyorTrack?.getComponent(UITransform) || null;
        if (!conveyorTrack?.isValid || !conveyorTransform) {
            throw new Error('[pch-core] level 1 guide conveyor focus is unavailable');
        }

        const mask = this.makeNode(
            'PchOpeningGuideDimMask',
            openingGuide,
            parentTransform.contentSize.width,
            parentTransform.contentSize.height,
            0,
            0,
        );
        mask.setSiblingIndex(0);
        const maskMinX = -parentTransform.contentSize.width * parentTransform.anchorPoint.x;
        const maskMaxX = parentTransform.contentSize.width * (1 - parentTransform.anchorPoint.x);
        const maskMinY = -parentTransform.contentSize.height * parentTransform.anchorPoint.y;
        const maskMaxY = parentTransform.contentSize.height * (1 - parentTransform.anchorPoint.y);
        if (!Number.isFinite(maskMinX + maskMaxX + maskMinY + maskMaxY)
            || maskMaxX - maskMinX < 1
            || maskMaxY - maskMinY < 1) {
            throw new Error('[pch-core] level 1 guide dim mask bounds are unavailable');
        }
        const targetBottomLeft = new Vec3(
            targetLocal.x - targetWidth / 2,
            targetLocal.y - targetHeight / 2,
            0,
        );
        const targetTopRight = new Vec3(
            targetLocal.x + targetWidth / 2,
            targetLocal.y + targetHeight / 2,
            0,
        );
        const conveyorBounds = conveyorTransform.getBoundingBoxToWorld();
        const conveyorBottomLeft = parentTransform.convertToNodeSpaceAR(new Vec3(conveyorBounds.xMin, conveyorBounds.yMin, 0));
        const conveyorTopRight = parentTransform.convertToNodeSpaceAR(new Vec3(conveyorBounds.xMax, conveyorBounds.yMax, 0));
        if (!Number.isFinite(
            targetBottomLeft.x + targetBottomLeft.y + targetTopRight.x + targetTopRight.y
            + conveyorBottomLeft.x + conveyorBottomLeft.y + conveyorTopRight.x + conveyorTopRight.y,
        )) {
            throw new Error('[pch-core] level 1 guide focus bounds are unavailable');
        }
        const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
        const createFocusRect = (bottomLeft: Vec3, topRight: Vec3, padding: number) => {
            const left = clamp(Math.min(bottomLeft.x, topRight.x) - padding, maskMinX, maskMaxX);
            const right = clamp(Math.max(bottomLeft.x, topRight.x) + padding, maskMinX, maskMaxX);
            const bottom = clamp(Math.min(bottomLeft.y, topRight.y) - padding, maskMinY, maskMaxY);
            const top = clamp(Math.max(bottomLeft.y, topRight.y) + padding, maskMinY, maskMaxY);
            if (right - left < 1 || top - bottom < 1) {
                throw new Error('[pch-core] level 1 guide focus rect is invalid');
            }
            return { left, right, bottom, top };
        };
        const targetFocus = createFocusRect(targetBottomLeft, targetTopRight, OPENING_GUIDE_TARGET_FOCUS_PADDING);
        const conveyorFocus = createFocusRect(
            conveyorBottomLeft,
            conveyorTopRight,
            OPENING_GUIDE_CONVEYOR_FOCUS_PADDING,
        );
        if (targetFocus.bottom <= conveyorFocus.top) {
            throw new Error('[pch-core] level 1 guide focus regions must remain separate');
        }

        const createPanel = (name: string, x: number, y: number, width: number, height: number): void => {
            const panel = this.makeNode(name, mask, Math.max(1, width), Math.max(1, height), x, y);
            panel.active = width > 0.5 && height > 0.5;
            if (!panel.active) return;
            const graphics = panel.addComponent(Graphics);
            graphics.fillColor = new Color(27, 23, 48, OPENING_GUIDE_DIM_MASK_OPACITY);
            graphics.rect(-width / 2, -height / 2, width, height);
            graphics.fill();
        };
        const fullWidth = maskMaxX - maskMinX;
        const targetFocusHeight = targetFocus.top - targetFocus.bottom;
        const conveyorFocusHeight = conveyorFocus.top - conveyorFocus.bottom;
        const targetLeftWidth = targetFocus.left - maskMinX;
        const targetRightWidth = maskMaxX - targetFocus.right;
        const conveyorLeftWidth = conveyorFocus.left - maskMinX;
        const conveyorRightWidth = maskMaxX - conveyorFocus.right;
        createPanel('GuideDimTop', (maskMinX + maskMaxX) / 2, targetFocus.top + (maskMaxY - targetFocus.top) / 2, fullWidth, maskMaxY - targetFocus.top);
        createPanel('GuideDimLeft', maskMinX + targetLeftWidth / 2, (targetFocus.top + targetFocus.bottom) / 2, targetLeftWidth, targetFocusHeight);
        createPanel('GuideDimRight', targetFocus.right + targetRightWidth / 2, (targetFocus.top + targetFocus.bottom) / 2, targetRightWidth, targetFocusHeight);
        createPanel('GuideDimBetweenFocus', (maskMinX + maskMaxX) / 2, (targetFocus.bottom + conveyorFocus.top) / 2, fullWidth, targetFocus.bottom - conveyorFocus.top);
        createPanel('GuideDimConveyorLeft', maskMinX + conveyorLeftWidth / 2, (conveyorFocus.top + conveyorFocus.bottom) / 2, conveyorLeftWidth, conveyorFocusHeight);
        createPanel('GuideDimConveyorRight', conveyorFocus.right + conveyorRightWidth / 2, (conveyorFocus.top + conveyorFocus.bottom) / 2, conveyorRightWidth, conveyorFocusHeight);
        createPanel('GuideDimBottom', (maskMinX + maskMaxX) / 2, maskMinY + (conveyorFocus.bottom - maskMinY) / 2, fullWidth, conveyorFocus.bottom - maskMinY);
    }

    private createOpeningGuideSpeedFocusMask(
        parent: Node,
        targetLocal: Vec3,
        targetWidth: number,
        targetHeight: number,
    ): void {
        const openingGuide = this.openingGuide;
        const parentTransform = parent.getComponent(UITransform);
        if (!openingGuide?.isValid || !parentTransform) {
            throw new Error('[pch-core] level 2 guide mask parent is unavailable');
        }

        const mask = this.makeNode(
            'PchOpeningGuideSpeedDimMask',
            openingGuide,
            parentTransform.contentSize.width,
            parentTransform.contentSize.height,
            0,
            0,
        );
        mask.setSiblingIndex(0);
        const maskMinX = -parentTransform.contentSize.width * parentTransform.anchorPoint.x;
        const maskMaxX = parentTransform.contentSize.width * (1 - parentTransform.anchorPoint.x);
        const maskMinY = -parentTransform.contentSize.height * parentTransform.anchorPoint.y;
        const maskMaxY = parentTransform.contentSize.height * (1 - parentTransform.anchorPoint.y);
        if (!Number.isFinite(maskMinX + maskMaxX + maskMinY + maskMaxY)
            || maskMaxX - maskMinX < 1
            || maskMaxY - maskMinY < 1) {
            throw new Error('[pch-core] level 2 guide dim mask bounds are unavailable');
        }
        const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
        const targetLeft = clamp(targetLocal.x - targetWidth / 2 - OPENING_GUIDE_TARGET_FOCUS_PADDING, maskMinX, maskMaxX);
        const targetRight = clamp(targetLocal.x + targetWidth / 2 + OPENING_GUIDE_TARGET_FOCUS_PADDING, maskMinX, maskMaxX);
        const targetBottom = clamp(targetLocal.y - targetHeight / 2 - OPENING_GUIDE_TARGET_FOCUS_PADDING, maskMinY, maskMaxY);
        const targetTop = clamp(targetLocal.y + targetHeight / 2 + OPENING_GUIDE_TARGET_FOCUS_PADDING, maskMinY, maskMaxY);
        if (targetRight - targetLeft < 1 || targetTop - targetBottom < 1) {
            throw new Error('[pch-core] level 2 guide speed focus is invalid');
        }
        const createPanel = (name: string, x: number, y: number, width: number, height: number): void => {
            const panel = this.makeNode(name, mask, Math.max(1, width), Math.max(1, height), x, y);
            panel.active = width > 0.5 && height > 0.5;
            if (!panel.active) return;
            const graphics = panel.addComponent(Graphics);
            graphics.fillColor = new Color(0, 0, 0, OPENING_GUIDE_DIM_MASK_OPACITY);
            graphics.rect(-width / 2, -height / 2, width, height);
            graphics.fill();
        };
        const fullWidth = maskMaxX - maskMinX;
        const targetHeightWithPadding = targetTop - targetBottom;
        createPanel(
            'GuideSpeedDimTop',
            (maskMinX + maskMaxX) / 2,
            targetTop + (maskMaxY - targetTop) / 2,
            fullWidth,
            maskMaxY - targetTop,
        );
        createPanel(
            'GuideSpeedDimLeft',
            maskMinX + (targetLeft - maskMinX) / 2,
            (targetTop + targetBottom) / 2,
            targetLeft - maskMinX,
            targetHeightWithPadding,
        );
        createPanel(
            'GuideSpeedDimRight',
            targetRight + (maskMaxX - targetRight) / 2,
            (targetTop + targetBottom) / 2,
            maskMaxX - targetRight,
            targetHeightWithPadding,
        );
        createPanel(
            'GuideSpeedDimBottom',
            (maskMinX + maskMaxX) / 2,
            maskMinY + (targetBottom - maskMinY) / 2,
            fullWidth,
            targetBottom - maskMinY,
        );
    }

    private showLevelThreeCapacityGuide(parent: Node): void {
        this.inputLocked = true;
        const version = ++this.openingGuideRingLoadVersion;
        const rules = this.rules;
        const isCurrent = () => version === this.openingGuideRingLoadVersion
            && this.rules === rules && !!rules && parent.isValid && !this.runtime.isGameEnd;
        const fail = (message: string) => {
            this.clearOpeningGuideNodes();
            this.runtime._stopGameplayEntryWithFatalError(
                'Effects/GuideRoundedMask', 'opening_guide_material_missing', message,
            );
        };
        this.runtime._withBootstrapBundle((bundle: any, error?: Error) => {
            if (!isCurrent()) return;
            if (error || !bundle) {
                fail(error?.message || 'BootstrapBundle unavailable');
                return;
            }
            bundle.load('Effects/GuideRoundedMask', EffectAsset, (error: Error | null, effect: EffectAsset | null) => {
                if (!isCurrent()) return;
                if (error || !effect) {
                    fail(error?.message || 'GuideRoundedMask effect unavailable');
                    return;
                }
                try {
                    const material = new Material();
                    this.capacityGuideMaterial = material;
                    material.initialize({ effectAsset: effect });
                    this.showOpeningTargetGuide(parent, this.adButton!, 'PchLevelThreeCapacityGuide', '点击扩容可以增加传送带容量\n传送带满了就会失败哦', this.onOpeningGuideFreeCapacity);
                } catch (error) {
                    fail(error instanceof Error ? error.message : String(error));
                }
            });
        });
    }

    private createOpeningGuideCapacityFocusMask(
        parent: Node,
        targetLocal: Vec3,
        targetWidth: number,
        targetHeight: number,
    ): void {
        const openingGuide = this.openingGuide;
        const parentTransform = parent.getComponent(UITransform);
        if (!openingGuide?.isValid || !parentTransform) {
            throw new Error('[pch-core] level 3 guide mask parent is unavailable');
        }
        const conveyorTrack = this.capacityTrack || this.capacityProgress?.node || null;
        const conveyorTransform = conveyorTrack?.getComponent(UITransform) || null;
        if (!conveyorTrack?.isValid || !conveyorTransform) {
            throw new Error('[pch-core] level 3 guide capacity progress focus is unavailable');
        }

        const mask = this.makeNode(
            'PchOpeningGuideCapacityDimMask',
            openingGuide,
            parentTransform.contentSize.width,
            parentTransform.contentSize.height,
            0,
            0,
        );
        mask.setSiblingIndex(0);
        const maskMinX = -parentTransform.contentSize.width * parentTransform.anchorPoint.x;
        const maskMaxX = parentTransform.contentSize.width * (1 - parentTransform.anchorPoint.x);
        const maskMinY = -parentTransform.contentSize.height * parentTransform.anchorPoint.y;
        const maskMaxY = parentTransform.contentSize.height * (1 - parentTransform.anchorPoint.y);
        if (!Number.isFinite(maskMinX + maskMaxX + maskMinY + maskMaxY)
            || maskMaxX - maskMinX < 1
            || maskMaxY - maskMinY < 1) {
            throw new Error('[pch-core] level 3 guide dim mask bounds are unavailable');
        }
        const conveyorBounds = conveyorTransform.getBoundingBoxToWorld();
        const conveyorBottomLeft = parentTransform.convertToNodeSpaceAR(
            new Vec3(conveyorBounds.xMin, conveyorBounds.yMin, 0),
        );
        const conveyorTopRight = parentTransform.convertToNodeSpaceAR(
            new Vec3(conveyorBounds.xMax, conveyorBounds.yMax, 0),
        );
        if (!Number.isFinite(
            targetLocal.x + targetLocal.y + targetWidth + targetHeight
            + conveyorBottomLeft.x + conveyorBottomLeft.y + conveyorTopRight.x + conveyorTopRight.y,
        )) {
            throw new Error('[pch-core] level 3 guide focus bounds are unavailable');
        }
        const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
        const focusLeft = clamp(
            Math.min(
                targetLocal.x - targetWidth / 2 - OPENING_GUIDE_TARGET_FOCUS_PADDING,
                conveyorBottomLeft.x - OPENING_GUIDE_CONVEYOR_FOCUS_PADDING,
            ),
            maskMinX,
            maskMaxX,
        );
        const focusRight = clamp(
            Math.max(
                targetLocal.x + targetWidth / 2 + OPENING_GUIDE_TARGET_FOCUS_PADDING,
                conveyorTopRight.x + OPENING_GUIDE_CONVEYOR_FOCUS_PADDING,
            ) - 4,
            maskMinX,
            maskMaxX,
        );
        const focusBottom = clamp(
            Math.min(
                targetLocal.y - targetHeight / 2 - OPENING_GUIDE_TARGET_FOCUS_PADDING,
                conveyorBottomLeft.y - OPENING_GUIDE_CONVEYOR_FOCUS_PADDING,
            ) + 8,
            maskMinY,
            maskMaxY,
        );
        const focusTop = clamp(
            Math.max(
                targetLocal.y + targetHeight / 2 + OPENING_GUIDE_TARGET_FOCUS_PADDING,
                conveyorTopRight.y + OPENING_GUIDE_CONVEYOR_FOCUS_PADDING,
            ) - 8,
            maskMinY,
            maskMaxY,
        );
        if (focusRight - focusLeft < 1 || focusTop - focusBottom < 1) {
            throw new Error('[pch-core] level 3 guide capacity focus is invalid');
        }
        const material = this.capacityGuideMaterial;
        if (!material) throw new Error('[pch-core] capacity guide material is unavailable');
        material.setProperty('holeRect', new Vec4(
            (focusLeft + focusRight) / 2, (focusBottom + focusTop) / 2,
            (focusRight - focusLeft) / 2, (focusTop - focusBottom) / 2,
        ));
        material.setProperty('holeStyle', new Vec4(16, 1.5, 0, 0));
        const graphics = mask.addComponent(Graphics);
        graphics.customMaterial = material;
        graphics.fillColor = new Color(0, 0, 0, OPENING_GUIDE_DIM_MASK_OPACITY);
        graphics.rect(maskMinX, maskMinY, maskMaxX - maskMinX, maskMaxY - maskMinY);
        graphics.fill();
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

    private chooseLevelOnePromptLayout(boardBottom: number, boardTop: number,
        safeBottom: number, safeTop: number, height: number): { y: number; scale: number; boardY: number } {
        const gap = 24;
        const boardY = (boardBottom + boardTop) / 2;
        if (boardTop + gap + height <= safeTop) {
            return { y: boardTop + gap + height / 2, scale: 1, boardY };
        }
        if (boardBottom - gap - height >= safeBottom) {
            return { y: boardBottom - gap - height / 2, scale: 1, boardY };
        }
        const room = safeTop - safeBottom - height - gap;
        if (room <= 0 || boardTop <= boardBottom) {
            throw new Error('[pch-guide] insufficient viewport space for level 1 prompt');
        }
        const scale = Math.min(1, room / (boardTop - boardBottom));
        const boardHeight = (boardTop - boardBottom) * scale;
        return { y: safeTop - height / 2, scale, boardY: safeBottom + boardHeight / 2 };
    }

    private prepareLevelOnePromptLayout(parent: Node): number {
        const parentUi = parent.getComponent(UITransform)!;
        const bounds = this.runtime.getGameplayNodeBoundsInFixedRoot(this.runtime.boardNode);
        const beltBounds = this.runtime.getGameplayNodeBoundsInFixedRoot(this.belt);
        if (!bounds || !beltBounds) throw new Error('[pch-guide] level 1 layout bounds unavailable');
        const topBarBottom = this.runtime.getTopBarAvoidBottomY();
        const parentTop = parentUi.height * (1 - parentUi.anchorY) - 24;
        const safeTop = topBarBottom === null ? parentTop : Math.min(parentTop, topBarBottom - 24);
        const safeBottom = Math.max(-parentUi.height * parentUi.anchorY + 24, beltBounds.top + 24);
        const layout = this.chooseLevelOnePromptLayout(bounds.bottom, bounds.top,
            safeBottom, safeTop, OPENING_GUIDE_PROMPT_HEIGHT);
        if (layout.scale < 1 || Math.abs(layout.boardY - (bounds.bottom + bounds.top) / 2) > 0.1) {
            const group = this.runtime.boardGroup as Node;
            const groupParent = group.parent!.getComponent(UITransform)!;
            const centerWorld = parentUi.convertToWorldSpaceAR(new Vec3((bounds.left + bounds.right) / 2, layout.boardY, 0));
            const centerLocal = groupParent.convertToNodeSpaceAR(centerWorld);
            const scale = this.runtime.boardViewport.scale * layout.scale;
            const board = this.runtime.boardNode as Node;
            this.runtime.boardViewport.setViewTransformClamped(scale,
                new Vec2(centerLocal.x - board.position.x * scale, centerLocal.y - board.position.y * scale), false);
            this.runtime.boardViewScale = this.runtime.boardViewport.scale;
        }
        return layout.y;
    }

    private getOpeningGuidePromptCenterYAboveConveyor(parent: Node, promptHeight: number): number {
        const parentTransform = parent.getComponent(UITransform);
        const conveyorTrack = this.belt?.getChildByName('PchMovingTrack') || null;
        const conveyorTransform = conveyorTrack?.getComponent(UITransform) || null;
        if (!parentTransform || !conveyorTrack?.isValid || !conveyorTransform) {
            throw new Error('[pch-core] opening guide conveyor prompt anchor is unavailable');
        }
        const conveyorBounds = conveyorTransform.getBoundingBoxToWorld();
        const conveyorTopRight = parentTransform.convertToNodeSpaceAR(
            new Vec3(conveyorBounds.xMax, conveyorBounds.yMax, 0),
        );
        if (!Number.isFinite(conveyorTopRight.y)) {
            throw new Error('[pch-core] opening guide conveyor prompt bounds are unavailable');
        }
        const parentMinY = -parentTransform.contentSize.height * parentTransform.anchorPoint.y;
        const parentMaxY = parentTransform.contentSize.height * (1 - parentTransform.anchorPoint.y);
        const safeMinY = parentMinY + promptHeight / 2 + 24;
        const safeMaxY = parentMaxY - promptHeight / 2 - 24;
        const desiredY = conveyorTopRight.y + promptHeight / 2 + OPENING_GUIDE_PROMPT_CONVEYOR_GAP;
        return Math.max(safeMinY, Math.min(safeMaxY, desiredY));
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
        handTargetLocal?: Vec3,
    ): void {
        this.inputLocked = true;
        const isLevelOneBoardGuide = guideName.startsWith('PchLevelOneGuideStep');
        const isLevelTwoSpeedGuide = guideName === 'PchLevelTwoSpeedGuide';
        const isLevelThreeCapacityGuide = guideName === 'PchLevelThreeCapacityGuide';
        const isStarterOpeningGuide = isLevelOneBoardGuide || isLevelTwoSpeedGuide || isLevelThreeCapacityGuide;
        this.openingGuide = this.makeNode(guideName, parent, 720, 1280, 0, 0);
        this.openingGuide.setSiblingIndex(Math.max(0, parent.children.length - 1));
        if (isLevelTwoSpeedGuide) {
            this.createOpeningGuideSpeedFocusMask(parent, targetLocal, targetWidth, targetHeight);
        } else if (isLevelThreeCapacityGuide) {
            this.createOpeningGuideCapacityFocusMask(parent, targetLocal, targetWidth, targetHeight);
        }
        this.openingGuideTarget = this.makeNode('OpeningGuideTapTarget', parent, targetWidth + 24, targetHeight + 24, targetLocal.x, targetLocal.y);
        this.openingGuideTarget.setSiblingIndex(Math.max(0, parent.children.length - 1));
        const button = this.openingGuideTarget.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.92;
        this.openingGuideTarget.on(Node.EventType.TOUCH_END, isLevelOneBoardGuide ? this.handleOpeningGuideRootTap : onTargetTap, this);

        const guideBubbleFrame = useGuideBubbleFrame ? this.runtime.getSF?.('guide_bubble_frame') || null : null;
        const usesVideoGuideBubbleLayout = isStarterOpeningGuide && !!guideBubbleFrame;
        const promptWidth = isLevelOneBoardGuide && usesVideoGuideBubbleLayout ? 660 : usesVideoGuideBubbleLayout
            ? OPENING_GUIDE_PROMPT_WIDTH
            : (useGuideBubbleFrame ? 560 : 500);
        const promptHeight = usesVideoGuideBubbleLayout
            ? OPENING_GUIDE_PROMPT_HEIGHT
            : (useGuideBubbleFrame ? 128 : 64);
        const sharedPromptY = promptYOverride ?? Math.max(-520, targetLocal.y - targetHeight / 2 - promptHeight / 2 - 40);
        const promptY = isLevelOneBoardGuide && promptYOverride !== undefined ? promptYOverride : usesVideoGuideBubbleLayout
            ? this.getOpeningGuidePromptCenterYAboveConveyor(parent, promptHeight)
            : sharedPromptY;
        const promptXLimit = useGuideBubbleFrame ? 80 : 100;
        const promptX = usesVideoGuideBubbleLayout
            ? 0
            : Math.max(-promptXLimit, Math.min(promptXLimit, targetLocal.x));
        if (targetWidth < 1 || targetHeight < 1) {
            throw new Error('[pch-core] opening guide visual target dimensions are unavailable');
        }
        const prompt = this.makeNode('OpeningGuidePrompt', this.openingGuide, promptWidth, promptHeight, promptX, promptY);
        if (guideBubbleFrame) {
            if (typeof this.runtime._applySpriteFrame !== 'function') {
                throw new Error('[pch-core] guide bubble sprite applicator is unavailable');
            }
            const bubbleBackground = this.makeNode('OpeningGuideBubbleBackground', prompt, promptWidth, promptHeight, 0, 0);
            this.runtime._applySpriteFrame(bubbleBackground, guideBubbleFrame, promptWidth, promptHeight, Sprite.Type.SLICED);
            bubbleBackground.setScale(1, 1, 1);
            if (isLevelOneBoardGuide) {
                const [title, detail] = copy.split('\n', 2);
                const titleLabel = this.makeLabel(prompt, title, 36, Color.WHITE, 0, 26, promptWidth - 64);
                const detailLabel = this.makeLabel(prompt, detail || title, 36, Color.WHITE, 0, -26, promptWidth - 64);
                this.applyOpeningGuidePromptLabelStyle(titleLabel);
                this.applyOpeningGuidePromptLabelStyle(detailLabel);
            } else if (isLevelTwoSpeedGuide) {
                const promptLabel = this.makeLabel(prompt, copy, 38, Color.WHITE, 0, 0, promptWidth - 64);
                this.applyOpeningGuidePromptLabelStyle(promptLabel);
            } else if (isLevelThreeCapacityGuide) {
                const [title, detail] = copy.split('\n', 2);
                const titleLabel = this.makeLabel(prompt, title, 32, Color.WHITE, 0, 26, promptWidth - 64);
                const detailLabel = this.makeLabel(prompt, detail || title, 28, Color.WHITE, 0, -22, promptWidth - 64);
                this.applyOpeningGuidePromptLabelStyle(titleLabel);
                this.applyOpeningGuidePromptLabelStyle(detailLabel);
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

        const sourceHand = this.runtime.requireCanvasUiRoot?.('OverlayRoot')?.getChildByName('TutorialGuideHands')?.getChildByName('GuideHandSingle') || null;
        if (!sourceHand?.getComponent(Sprite)) {
            this.trackOpeningGuideEvent('pch_guide_step_shown', true, 'text_prompt', guideName);
            this.reportOpeningGuideTutorialStart();
            return;
        }
        const hand = instantiate(sourceHand);
        hand.name = 'OpeningGuideHand';
        this.openingGuide.addChild(hand);
        hand.active = true;
        const usesButtonHandPosition = isLevelTwoSpeedGuide || isLevelThreeCapacityGuide;
        const handAnchor = handTargetLocal || targetLocal;
        const handRestOffsetY = isLevelOneBoardGuide ? -36 : (usesButtonHandPosition ? -52 : -76);
        const handPressOffsetY = isLevelOneBoardGuide ? -24 : (usesButtonHandPosition ? -36 : -60);
        const handOffsetX = isLevelOneBoardGuide ? 31 : 42;
        hand.setPosition(handAnchor.x + handOffsetX, handAnchor.y + handRestOffsetY, 0);
        hand.setScale(0.92, 0.92, 1);
        tween(hand)
            .repeatForever(
                tween()
                    .to(0.42, { position: new Vec3(handAnchor.x + handOffsetX, handAnchor.y + handPressOffsetY, 0), scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
                    .call(() => {
                        if (isLevelThreeCapacityGuide && this.openingGuide?.isValid) {
                            this.playCapacityGuideTapRings(this.openingGuide, handAnchor);
                            hand.setSiblingIndex(this.openingGuide.children.length - 1);
                        }
                    })
                    .to(0.42, { position: new Vec3(handAnchor.x + handOffsetX, handAnchor.y + handRestOffsetY, 0), scale: new Vec3(0.92, 0.92, 1) }, { easing: 'sineInOut' }),
            )
            .start();
        this.trackOpeningGuideEvent('pch_guide_step_shown', true, 'shown', guideName);
        this.reportOpeningGuideTutorialStart();
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
            this.reportOpeningGuideTutorialFinish();
            this.dismissOpeningGuide();
            return;
        }
        this.clearOpeningGuideNodes();
        this.openingGuideLevelOneStep += 1;
        try {
            this.showLevelOneBoardGuideStep(this.runtime.getGameplayFixedRoot());
        } catch (error) {
            if (this.runtime.levelData?.tutorialGuide?.openingColors !== undefined) {
                this.runtime._stopGameplayEntryWithFatalError(
                    this.runtime.getLevelDataPath(1), 'opening_guide_invalid', String(error),
                );
                return;
            }
            console.error('[pch-guide] releasing incomplete next step:', error);
            this.dismissOpeningGuide();
        }
    }

    private onOpeningGuideTripleSpeed(event: any): void {
        event.propagationStopped = true;
        if (!this.rules || this.runtime.isGameEnd) return;
        this.setManualSpeedMultiplier(3);
        this.trackOpeningGuideEvent('pch_guide_tap_result', true, 'enabled_3x');
        this.trackOpeningGuideEvent('pch_guide_step_done', true, 'completed');
        this.reportOpeningGuideTutorialFinish();
        this.refreshSpeedButtonState();
        if (this.statusLabel) this.statusLabel.string = '3 倍速度已开启';
        this.dismissOpeningGuide();
        this.showLevelTwoSoftHand();
        AudioMgr.inst.play('button');
    }

    private showLevelTwoSoftHand(): void {
        if (this.runtime._activeGameplayEntryMode !== 'main'
            || this.runtime.getActiveLogicalLevelId?.() !== 2
            || this.runtime.isRankedPvpMode?.() || this.runtime.isCoopMode?.()
            || !this.rules || this.runtime.isGameEnd || this.levelTwoSoftHand) return;
        const source = this.runtime.requireCanvasUiRoot('OverlayRoot')
            .getChildByName('TutorialGuideHands')?.getChildByName('GuideHandSingle');
        const sprite = source?.getComponent(Sprite);
        const transform = source?.getComponent(UITransform);
        if (!sprite?.spriteFrame || !transform) {
            console.error('[pch-guide] level 2 soft hand sprite unavailable');
            return;
        }
        const parent = this.runtime.getGameplayFixedRoot();
        const anchor = this.makeNode('LevelTwoSoftHandAnchor', parent, 1, 1, 0, 0);
        this.levelTwoSoftHand = anchor;
        // Copy only the artwork: no Button, touch listener, or input-blocking component.
        const handWidth = 110;
        const handHeight = handWidth * transform.height / transform.width;
        const hand = this.makeNode('LevelTwoSoftHand', anchor,
            handWidth, handHeight, 42, -52);
        hand.getComponent(UITransform)!.setAnchorPoint(transform.anchorPoint);
        const handSprite = hand.addComponent(Sprite);
        handSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        handSprite.spriteFrame = sprite.spriteFrame;
        hand.setScale(0.92, 0.92, 1);
        tween(hand).repeatForever(tween()
            .to(0.42, { position: new Vec3(42, -36, 0), scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
            .to(0.42, { position: new Vec3(42, -52, 0), scale: new Vec3(0.92, 0.92, 1) }, { easing: 'sineInOut' }))
            .start();
        this.updateLevelTwoSoftHand();
    }

    private updateLevelTwoSoftHand(): void {
        const anchor = this.levelTwoSoftHand;
        if (!anchor?.isValid) return;
        if (!this.rules || this.runtime.isGameEnd) {
            this.clearLevelTwoSoftHand();
            return;
        }
        anchor.active = !(this.settingsPaused || this.settlementPaused || this.skillMovementPaused
            || this.externalInputBlocked || this.inputLocked || this.runtime._gameForeground === false
            || this.runtime._adShowing || this.runtime._rewardedGrantTransaction
            || Number(this.runtime._modalFocusRefs) > 0);
        if (!anchor.active) return;
        const available = (cell: { row: number; col: number }) =>
            this.rules!.board.currentColors[cell.row]?.[cell.col] > 0
            && !this.rules!.board.locked[cell.row]?.[cell.col]
            && this.runtime.cellNodes?.[cell.row]?.[cell.col]?.activeInHierarchy;
        let target = this.levelTwoSoftHandTarget;
        if (!target || !available(target)) {
            const candidates = this.rules.cells.filter(available);
            // Palette 3 is the bright yellow bean (#F8C811).
            target = candidates.find(cell => cell.current === 3) || candidates[0] || null;
            this.levelTwoSoftHandTarget = target;
        }
        if (!target) {
            anchor.active = false;
            return;
        }
        const local = anchor.parent!.getComponent(UITransform)!
            .convertToNodeSpaceAR(this.getBoardCellWorldPosition(target.row, target.col));
        anchor.setPosition(local);
    }

    private clearLevelTwoSoftHand(): void {
        if (this.levelTwoSoftHand?.isValid) {
            for (const child of this.levelTwoSoftHand.children) Tween.stopAllByTarget(child);
            this.levelTwoSoftHand.destroy();
        }
        this.levelTwoSoftHand = null;
        this.levelTwoSoftHandTarget = null;
    }

    private playCapacityGuideTapRings(parent: Node, position: Vec3): void {
        const effect = this.makeNode('CapacityGuideTapRings', parent, 160, 160, position.x, position.y);
        for (const [index, radius] of [32, 52].entries()) {
            const ring = this.makeNode(`TapRing${index}`, effect, 160, 160, 0, 0);
            const graphics = ring.addComponent(Graphics);
            graphics.lineWidth = index === 0 ? 9 : 7;
            graphics.strokeColor = new Color(45, 140, 255, 255);
            graphics.fillColor = new Color(45, 140, 255, index === 0 ? 22 : 14);
            graphics.circle(0, 0, radius);
            graphics.fill();
            graphics.circle(0, 0, radius);
            graphics.stroke();
            graphics.lineWidth = index === 0 ? 3 : 2;
            graphics.strokeColor = new Color(225, 245, 255, 255);
            graphics.circle(0, 0, radius - (index === 0 ? 3 : 2));
            graphics.stroke();
            const opacity = ring.addComponent(UIOpacity);
            opacity.opacity = 0;
            ring.setScale(0.55, 0.55, 1);
            tween(ring).delay(index * 0.08)
                .to(0.57, { scale: new Vec3(1.25, 1.25, 1) }, { easing: 'sineOut' }).start();
            tween(opacity).delay(index * 0.08)
                .set({ opacity: index === 0 ? 255 : 220 })
                .delay(0.12)
                .to(0.45, { opacity: 0 }).start();
        }
        tween(effect).delay(0.65).call(() => effect.destroy()).start();
    }

    private onOpeningGuideFreeCapacity(event: any): void {
        event.propagationStopped = true;
        if (!this.rules || this.runtime.isGameEnd) return;
        if (this.openingGuide?.name !== 'PchLevelThreeCapacityGuide') return;
        AudioMgr.inst.play('button');
        const capacityBefore = this.rules.bufferCapacity;
        const expanded = this.expandCapacity();
        this.trackPchFunnelEvent('capacity_grant', { source: 'guide_free', success: expanded,
            extra: { mode: 'free', capacityBefore, capacityAfter: this.rules.bufferCapacity,
                guideId: 'pch_level_3_capacity_v1' } });
        this.trackOpeningGuideEvent(
            'pch_guide_tap_result',
            expanded,
            expanded ? 'capacity_expanded' : 'capacity_expand_failed',
        );
        if (!expanded) return;
        this.capacityAdBlockedUntil = Date.now() + 800;
        this.capacityAdFreshTouchRequired = true;
        this.resetCapacityAdGesture();
        const feedbackParent = this.runtime.getGameplayFixedRoot();
        const feedbackPosition = feedbackParent.getComponent(UITransform)!.convertToNodeSpaceAR(this.adButton!.worldPosition);
        this.playCapacityGuideTapRings(feedbackParent, feedbackPosition);
        this.trackOpeningGuideEvent('pch_guide_step_done', true, 'completed');
        this.reportOpeningGuideTutorialFinish();
        this.runtime.markDynamicCountdownAssisted?.();
        this.dismissOpeningGuide();
        this.runtime.showToast(`传送带已扩容 +${this.rules.bufferCapacity - capacityBefore}`);
    }

    private dismissOpeningGuide(): void {
        this.clearOpeningGuideNodes();
        this.openingGuideLevelOneCells = [];
        this.openingGuideLevelOneStep = -1;
        this.inputLocked = false;
        this.runtime.syncSkillButtonRuntimeStates?.();
    }

    private clearOpeningGuideNodes(): void {
        AudioMgr.inst.stopGuideVoice();
        this.clearLevelTwoSoftHand();
        this.clearCapacityHint();
        this.openingGuideRingLoadVersion += 1;
        for (const ring of this.openingGuideRingNodes) {
            if (!ring.isValid) continue;
            ring.getComponent(sp.Skeleton)?.clearTracks();
            ring.destroy();
        }
        this.openingGuideRingNodes = [];
        this.capacityGuideMaterial?.destroy();
        this.capacityGuideMaterial = null;
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
        this.runtime.recordPvpRuleEvent?.(4, multiplier);
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
        if (!this.beltPath) throw new Error('[pch-core] conveyor path is not prepared');
        const angle = sampleRoundedConveyorPath(this.beltPath, progress, outPosition);
        outPosition.z = 0;
        return angle;
    }

    private getEntranceCarrierIndex(): number {
        if (!this.rules) return 0;
        return conveyorEntranceCarrier(this.beltTravel, this.rules.carrierCount).index;
    }

    resetCapacityAdGesture(): void {
        this.capacityAdTouchId = null;
    }

    private onCapacityAdTouchStart(event: any): void {
        this.resetCapacityAdGesture();
        if (!this.capacityAdFreshTouchRequired || this.inputLocked || this.externalInputBlocked
            || this.runtime.isGameEnd || Date.now() < this.capacityAdBlockedUntil) return;
        const touchId = event.getID?.();
        if (typeof touchId === 'number') this.capacityAdTouchId = touchId;
    }

    private onCapacityAdTap(event: any): void {
        event.propagationStopped = true;
        if (this.externalInputBlocked) {
            this.resetCapacityAdGesture();
            return;
        }
        if (this.capacityAdFreshTouchRequired) {
            const touchId = this.capacityAdTouchId;
            this.resetCapacityAdGesture();
            if (Date.now() < this.capacityAdBlockedUntil || touchId === null || touchId !== event.getID?.()) return;
        }
        const triggerSource = this.capacityHintWasShown ? 'capacity_soft_hint' : 'manual_button';
        const offerMode = this.getCapacityOfferMode(triggerSource);
        this.clearCapacityHint();
        if (this.runtime.isRankedPvpMode?.() === true) return;
        if (!this.rules || this.inputLocked || this.runtime.isGameEnd || this.runtime._adShowing) return;
        if (offerMode === 'unavailable') return;
        this.trackPchFunnelEvent('csd_capacity_entry_click', { source: triggerSource, success: true,
            extra: { placement: 'pch_conveyor_expand', mode: offerMode } });
        if (this.isLevelThreeFreeCapacity()) {
            this.capacityHintWasShown = false;
            const capacityBefore = this.rules.bufferCapacity;
            if (capacityBefore >= PCH_LEVEL_THREE_MAX_CAPACITY) return;
            AudioMgr.inst.play('button');
            const expanded = this.expandCapacity();
            this.trackPchFunnelEvent('capacity_grant', { source: triggerSource, success: expanded,
                extra: { mode: 'free', capacityBefore, capacityAfter: this.rules.bufferCapacity } });
            if (expanded) {
                this.runtime.markDynamicCountdownAssisted?.();
                this.runtime.showToast(`传送带已扩容 +${this.rules.bufferCapacity - capacityBefore}`);
            }
            return;
        }
        const softHintFree = offerMode === 'free';
        if (!softHintFree && typeof this.runtime.runRewardedGrant !== 'function') {
            throw new Error('[pch-core] rewarded capacity grant is unavailable');
        }
        this.capacityHintWasShown = false;
        AudioMgr.inst.play('button');
        if (triggerSource === 'capacity_soft_hint') {
            if (this.analyticsStats) this.analyticsStats.capacitySoftHintClickCount += 1;
            this.trackPchFunnelEvent('pch_capacity_soft_hint_click', {
                source: triggerSource,
                success: true,
                extra: {
                    bufferCount: this.rules.bufferCount,
                    bufferCapacity: this.rules.bufferCapacity,
                    bufferRatio: this.rules.bufferCapacity > 0
                        ? this.rules.bufferCount / this.rules.bufferCapacity
                        : 0,
                },
            });
        }
        if (softHintFree) {
            const capacityBefore = this.rules.bufferCapacity;
            const expanded = this.expandCapacity();
            this.trackPchFunnelEvent('capacity_grant', { source: triggerSource, success: expanded,
                extra: { mode: 'free', capacityBefore, capacityAfter: this.rules.bufferCapacity } });
            if (!expanded) {
                this.capacityHintWasShown = true;
                return;
            }
            this.capacityAdBlockedUntil = Date.now() + 800;
            this.capacityAdFreshTouchRequired = true;
            this.resetCapacityAdGesture();
            this.capacityRewardGrantedAt = Date.now();
            this.runtime.markDynamicCountdownAssisted?.();
            this.runtime.showToast(`传送带已扩容 +${this.rules.bufferCapacity - capacityBefore}`);
            return;
        }
        let timerToken = '';
        this.runtime.runRewardedGrant('pch_conveyor_expand', () => {
            const capacityBefore = this.rules?.bufferCapacity || 0;
            const expanded = this.expandCapacity();
            this.trackPchFunnelEvent('capacity_grant', { source: triggerSource, success: expanded,
                extra: { mode: 'ad', capacityBefore, capacityAfter: this.rules?.bufferCapacity || 0 } });
            if (expanded) this.runtime.markDynamicCountdownAssisted?.();
            return expanded;
        }, {
            claimKey: `pch_conveyor_expand:${this.runtime.getActiveLogicalLevelId?.() || 0}:${this.rules.bufferCapacity}`,
            analyticsTriggerSource: triggerSource,
            busyFlag: '_adShowing',
            onInteractionStarted: () => {
                timerToken = this.runtime.pauseTimerForProp?.('pch-conveyor-expand') || '';
            },
            onInteractionReleased: () => {
                this.runtime.resumeTimerForProp?.(timerToken || 'pch-conveyor-expand');
                timerToken = '';
            },
            grantFailToast: '传送带扩容失败，请重试',
            successToast: `传送带已扩容 +${this.getCapacityButtonIncrement()}`,
            onRewardGranted: (context: { transactionId: string; attemptId: number }) => {
                if (triggerSource !== 'capacity_soft_hint') return;
                this.capacityRewardGrantedAt = Date.now();
                this.capacityRewardTransactionId = context.transactionId;
            },
        });
    }

    private isLevelThreeFreeCapacity(): boolean {
        return this.runtime._activeGameplayEntryMode === 'main'
            && this.runtime.getActiveLogicalLevelId?.() === 3
            && !this.runtime.isRankedPvpMode?.() && !this.runtime.isCoopMode?.();
    }

    private getCapacityButtonIncrement(): number {
        const levelId = this.runtime.getActiveLogicalLevelId?.() || 0;
        return this.runtime._activeGameplayEntryMode === 'main'
            && !this.runtime.isRankedPvpMode?.() && !this.runtime.isCoopMode?.()
            && levelId >= 1 && levelId <= 20 ? 30 : PCH_EXPAND_CAPACITY;
    }

    private expandCapacity(requestedAmount: number = this.getCapacityButtonIncrement(), isRevive: boolean = false): boolean {
        if (!this.rules) return false;
        const levelThreeFree = this.isLevelThreeFreeCapacity();
        const amount = levelThreeFree && !isRevive
            ? Math.min(requestedAmount, Math.max(0, PCH_LEVEL_THREE_MAX_CAPACITY - this.rules.bufferCapacity))
            : requestedAmount;
        if (amount <= 0) return false;
        const added = this.rules.addBufferSlots(amount);
        if (levelThreeFree && this.adButton) {
            this.adButton.active = this.rules.bufferCapacity < PCH_LEVEL_THREE_MAX_CAPACITY;
        }
        if (added > 0 && this.analyticsStats) this.analyticsStats.capacityExpandCount += 1;
        if (added > 0 && this.runtime.isCoopMode?.()) this.runtime.recordCoopRuleEvent(7, added);
        this.lastEntranceAudioVisitByCarrier.clear();
        this.renderConveyor();
        this.renderEntranceQueue();
        this.refreshStatus();
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

    private applyOpeningGuidePromptLabelStyle(label: Label): void {
        label.color = new Color(32, 32, 32, 255);
        label.cacheMode = Label.CacheMode.NONE;
        label.enableOutline = false;
        label.enableShadow = false;
        (label as Label & { isBold?: boolean }).isBold = true;
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
