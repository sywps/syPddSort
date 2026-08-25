import {
    AudioMgr,
    EventTouch,
    Node,
    ProgressBar,
    Slider,
    Sprite,
    Tween,
    UITransform,
    UIOpacity,
    tween,
} from '../GameCtrlShared';

type BoardZoomControlUi = {
    root: Node;
    track: Node;
    fill: Node;
    fillBar: Node;
    thumb: Node;
    locate: Node;
    trackBg: Node;
    thumbDim: Node | null;
    plusGlyph: Node | null;
    minusGlyph: Node | null;
    trackUi: UITransform;
    fillUi: UITransform;
    fillBarUi: UITransform;
    fillSprite: Sprite;
    trackBgSprite: Sprite;
    thumbSprite: Sprite;
    slider: Slider;
    progressBar: ProgressBar;
    rootOpacity: UIOpacity;
    trackBgOpacity: UIOpacity;
    fillOpacity: UIOpacity;
    thumbOpacity: UIOpacity;
    thumbDimOpacity: UIOpacity | null;
    locateOpacity: UIOpacity;
    plusOpacity: UIOpacity | null;
    minusOpacity: UIOpacity | null;
};

const PROGRESS_SYNC_VISUAL_OFFSET = 0.06;
const CONTROL_IDLE_OPACITY = 102;
const CONTROL_ACTIVE_OPACITY = 255;
const FILL_IDLE_OPACITY = 150;
const FILL_ACTIVE_OPACITY = 255;
const BUTTON_OPACITY = 255;
const THUMB_DIM_IDLE_OPACITY = 230;
const THUMB_DIM_ACTIVE_OPACITY = 0;
const CONTROL_IDLE_DELAY_SECONDS = 3;
const CONTROL_IDLE_FADE_SECONDS = 0.5;
// Keep zoom gesture-only so the board remains unobstructed during play.
const BOARD_ZOOM_CONTROL_VISIBLE = false;
const BOARD_ZOOM_STEP_PROGRESS = 1 / 5;

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function stopZoomEvent(event?: EventTouch): void {
    if (!event) return;
    (event as any).propagationStopped = true;
}

function requireChild(parent: Node, name: string, path: string): Node {
    const child = parent.getChildByName(name);
    if (!child?.isValid) {
        throw new Error(`[board-zoom-control] Game.scene is missing ${path}`);
    }
    return child;
}

function requireUi(node: Node, path: string): UITransform {
    const ui = node.getComponent(UITransform);
    if (!ui) {
        throw new Error(`[board-zoom-control] Game.scene is missing UITransform on ${path}`);
    }
    return ui;
}

function requireSprite(node: Node, path: string): Sprite {
    const sprite = node.getComponent(Sprite);
    if (!sprite?.spriteFrame) {
        throw new Error(`[board-zoom-control] Game.scene is missing SpriteFrame on ${path}`);
    }
    return sprite;
}

function ensureOpacity(node: Node): UIOpacity {
    return node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
}

function ensureSlider(node: Node): Slider {
    return node.getComponent(Slider) || node.addComponent(Slider);
}

function ensureProgressBar(node: Node): ProgressBar {
    return node.getComponent(ProgressBar) || node.addComponent(ProgressBar);
}

function getSceneOwnedProgressLength(ui: BoardZoomControlUi): number {
    const configuredLength = Number(ui.progressBar.totalLength);
    if (Number.isFinite(configuredLength) && configuredLength > 0) {
        return configuredLength;
    }
    const fillHeight = ui.fillUi.contentSize.height;
    if (Number.isFinite(fillHeight) && fillHeight > 0) {
        return fillHeight;
    }
    return Math.max(1, ui.trackUi.contentSize.height);
}

function configureBoardZoomComponents(ui: BoardZoomControlUi): void {
    const progressLength = getSceneOwnedProgressLength(ui);

    ui.slider.enabled = false;
    ui.slider.direction = Slider.Direction.Vertical;
    ui.slider.handle = ui.thumbSprite;

    ui.progressBar.enabled = false;
    ui.progressBar.mode = ProgressBar.Mode.VERTICAL;
    ui.progressBar.barSprite = ui.fillSprite;
    ui.progressBar.totalLength = progressLength;
    ui.progressBar.enabled = true;

    ui.slider.enabled = true;
}

function stopBoardZoomControlOpacityTweens(ui: BoardZoomControlUi): void {
    Tween.stopAllByTarget(ui.rootOpacity);
    Tween.stopAllByTarget(ui.trackBgOpacity);
    Tween.stopAllByTarget(ui.fillOpacity);
    Tween.stopAllByTarget(ui.thumbOpacity);
    if (ui.thumbDimOpacity) Tween.stopAllByTarget(ui.thumbDimOpacity);
    Tween.stopAllByTarget(ui.locateOpacity);
    if (ui.plusOpacity) Tween.stopAllByTarget(ui.plusOpacity);
    if (ui.minusOpacity) Tween.stopAllByTarget(ui.minusOpacity);
}

function setBoardZoomControlVisualState(ui: BoardZoomControlUi, opacity: number, fillOpacity: number, thumbDimOpacity: number): void {
    ui.rootOpacity.opacity = 255;
    ui.thumbOpacity.opacity = BUTTON_OPACITY;
    if (ui.thumbDimOpacity) ui.thumbDimOpacity.opacity = thumbDimOpacity;
    ui.locateOpacity.opacity = opacity;
    ui.trackBgOpacity.opacity = opacity;
    ui.fillOpacity.opacity = fillOpacity;
    if (ui.plusOpacity) ui.plusOpacity.opacity = opacity;
    if (ui.minusOpacity) ui.minusOpacity.opacity = opacity;
}

export function installBoardZoomControlModule(target: any): void {
    Object.assign(target, {
        setupBoardZoomControl(): void {
            const fixedRoot = typeof this.getGameplayFixedRoot === 'function'
                ? this.getGameplayFixedRoot()
                : null;
            const root = fixedRoot?.getChildByName('BoardZoomControl') || null;
            if (!root?.isValid) {
                throw new Error('[board-zoom-control] Game.scene is missing GameplayFixedRoot/BoardZoomControl');
            }
            if (!BOARD_ZOOM_CONTROL_VISIBLE) {
                this._boardZoomControlUi = null;
                root.active = false;
                return;
            }

            const locate = requireChild(root, 'LocateBtn', 'GameplayFixedRoot/BoardZoomControl/LocateBtn');
            const track = requireChild(root, 'ZoomTrack', 'GameplayFixedRoot/BoardZoomControl/ZoomTrack');
            const fill = requireChild(track, 'ZoomFill', 'BoardZoomControl/ZoomTrack/ZoomFill');
            const fillBar = requireChild(fill, 'FillBar', 'BoardZoomControl/ZoomTrack/ZoomFill/FillBar');
            const thumb = requireChild(track, 'Thumb', 'BoardZoomControl/ZoomTrack/Thumb');
            const trackBg = requireChild(track, 'TrackBg', 'BoardZoomControl/ZoomTrack/TrackBg');
            const thumbDim = thumb.getChildByName('ThumbDim') || null;
            const plusGlyph = track.getChildByName('PlusGlyph') || null;
            const minusGlyph = track.getChildByName('MinusGlyph') || null;

            requireUi(root, 'GameplayFixedRoot/BoardZoomControl');
            requireUi(locate, 'BoardZoomControl/LocateBtn');
            const trackUi = requireUi(track, 'BoardZoomControl/ZoomTrack');
            const fillUi = requireUi(fill, 'BoardZoomControl/ZoomTrack/ZoomFill');
            const fillBarUi = requireUi(fillBar, 'BoardZoomControl/ZoomTrack/ZoomFill/FillBar');
            requireUi(thumb, 'BoardZoomControl/ZoomTrack/Thumb');
            requireUi(trackBg, 'BoardZoomControl/ZoomTrack/TrackBg');
            requireSprite(locate, 'BoardZoomControl/LocateBtn');
            const fillSprite = requireSprite(fillBar, 'BoardZoomControl/ZoomTrack/ZoomFill/FillBar');
            const thumbSprite = requireSprite(thumb, 'BoardZoomControl/ZoomTrack/Thumb');
            const trackBgSprite = requireSprite(trackBg, 'BoardZoomControl/ZoomTrack/TrackBg');

            const ui: BoardZoomControlUi = {
                root,
                track,
                fill,
                fillBar,
                thumb,
                locate,
                trackBg,
                thumbDim,
                plusGlyph,
                minusGlyph,
                trackUi,
                fillUi,
                fillBarUi,
                fillSprite,
                trackBgSprite,
                thumbSprite,
                slider: ensureSlider(track),
                progressBar: ensureProgressBar(fill),
                rootOpacity: ensureOpacity(root),
                trackBgOpacity: ensureOpacity(trackBg),
                fillOpacity: ensureOpacity(fill),
                thumbOpacity: ensureOpacity(thumb),
                thumbDimOpacity: thumbDim ? ensureOpacity(thumbDim) : null,
                locateOpacity: ensureOpacity(locate),
                plusOpacity: plusGlyph ? ensureOpacity(plusGlyph) : null,
                minusOpacity: minusGlyph ? ensureOpacity(minusGlyph) : null,
            };
            this._boardZoomControlUi = ui;
            configureBoardZoomComponents(ui);

            root.active = true;
            track.active = true;
            fill.active = true;
            fillBar.active = true;
            thumb.active = true;
            if (thumbDim) thumbDim.active = true;
            locate.active = true;
            if (plusGlyph) plusGlyph.active = false;
            if (minusGlyph) minusGlyph.active = false;
            thumb.setSiblingIndex(track.children.length - 1);

            this.bindBoardZoomControlEvents();
            if (!this.syncBoardZoomControlVisibility()) return;
            this.setBoardZoomControlActive(false, true);
            this.refreshBoardZoomControl();
        },

        shouldHideBoardZoomControlForCurrentLevel(): boolean {
            if (this._isThemeLevel) return false;
            const logicalLevelId = typeof this.getActiveLogicalLevelId === 'function'
                ? this.getActiveLogicalLevelId()
                : Math.max(1, Math.floor(Number(this.levelData?.levelId || 1) || 1));
            return Math.max(1, Math.floor(Number(logicalLevelId) || 1)) === 1;
        },

        syncBoardZoomControlVisibility(): boolean {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.root?.isValid) return false;
            const visible = !this.shouldHideBoardZoomControlForCurrentLevel();
            if (ui.root.active !== visible) {
                stopBoardZoomControlOpacityTweens(ui);
                ui.root.active = visible;
            }
            return visible;
        },

        bindBoardZoomControlEvents(): void {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.root?.isValid) return;

            ui.track.targetOff(this);
            ui.thumb.targetOff(this);
            ui.locate.targetOff(this);
            ui.plusGlyph?.targetOff(this);
            ui.minusGlyph?.targetOff(this);

            ui.track.on('slide', this.onBoardZoomSliderChanged, this);
            ui.track.on(Node.EventType.TOUCH_START, this.onBoardZoomSliderTouchStart, this);
            ui.track.on(Node.EventType.TOUCH_END, this.onBoardZoomSliderTouchEnd, this);
            ui.track.on(Node.EventType.TOUCH_CANCEL, this.onBoardZoomSliderTouchCancel, this);

            ui.thumb.on(Node.EventType.TOUCH_START, this.onBoardZoomSliderTouchStart, this);
            ui.thumb.on(Node.EventType.TOUCH_END, this.onBoardZoomSliderTouchEnd, this);
            ui.thumb.on(Node.EventType.TOUCH_CANCEL, this.onBoardZoomSliderTouchCancel, this);

            ui.locate.on(Node.EventType.TOUCH_START, this.onBoardZoomLocateTouchStart, this);
            ui.locate.on(Node.EventType.TOUCH_END, this.onBoardZoomLocateTouchEnd, this);
            ui.locate.on(Node.EventType.TOUCH_CANCEL, this.onBoardZoomLocateTouchCancel, this);

            ui.plusGlyph?.on(Node.EventType.TOUCH_START, this.onBoardZoomStepTouchStart, this);
            ui.plusGlyph?.on(Node.EventType.TOUCH_END, this.onBoardZoomPlusTouchEnd, this);
            ui.plusGlyph?.on(Node.EventType.TOUCH_CANCEL, this.onBoardZoomStepTouchCancel, this);

            ui.minusGlyph?.on(Node.EventType.TOUCH_START, this.onBoardZoomStepTouchStart, this);
            ui.minusGlyph?.on(Node.EventType.TOUCH_END, this.onBoardZoomMinusTouchEnd, this);
            ui.minusGlyph?.on(Node.EventType.TOUCH_CANCEL, this.onBoardZoomStepTouchCancel, this);
        },

        setBoardZoomControlActive(active: boolean, immediate: boolean = false): void {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.root?.isValid) return;
            if (!this.syncBoardZoomControlVisibility()) return;
            stopBoardZoomControlOpacityTweens(ui);
            if (immediate) {
                setBoardZoomControlVisualState(
                    ui,
                    active ? CONTROL_ACTIVE_OPACITY : CONTROL_IDLE_OPACITY,
                    active ? FILL_ACTIVE_OPACITY : FILL_IDLE_OPACITY,
                    active ? THUMB_DIM_ACTIVE_OPACITY : THUMB_DIM_IDLE_OPACITY,
                );
                return;
            }
            if (active) {
                setBoardZoomControlVisualState(ui, CONTROL_ACTIVE_OPACITY, FILL_ACTIVE_OPACITY, THUMB_DIM_ACTIVE_OPACITY);
                return;
            }
            ui.rootOpacity.opacity = 255;
            ui.thumbOpacity.opacity = BUTTON_OPACITY;
            tween(ui.trackBgOpacity)
                .delay(CONTROL_IDLE_DELAY_SECONDS)
                .to(CONTROL_IDLE_FADE_SECONDS, { opacity: CONTROL_IDLE_OPACITY }, { easing: 'sineOut' })
                .start();
            tween(ui.fillOpacity)
                .delay(CONTROL_IDLE_DELAY_SECONDS)
                .to(CONTROL_IDLE_FADE_SECONDS, { opacity: FILL_IDLE_OPACITY }, { easing: 'sineOut' })
                .start();
            if (ui.thumbDimOpacity) {
                tween(ui.thumbDimOpacity)
                    .delay(CONTROL_IDLE_DELAY_SECONDS)
                    .to(CONTROL_IDLE_FADE_SECONDS, { opacity: THUMB_DIM_IDLE_OPACITY }, { easing: 'sineOut' })
                    .start();
            }
            tween(ui.locateOpacity)
                .delay(CONTROL_IDLE_DELAY_SECONDS)
                .to(CONTROL_IDLE_FADE_SECONDS, { opacity: CONTROL_IDLE_OPACITY }, { easing: 'sineOut' })
                .start();
            if (ui.plusOpacity) {
                tween(ui.plusOpacity)
                    .delay(CONTROL_IDLE_DELAY_SECONDS)
                    .to(CONTROL_IDLE_FADE_SECONDS, { opacity: CONTROL_IDLE_OPACITY }, { easing: 'sineOut' })
                    .start();
            }
            if (ui.minusOpacity) {
                tween(ui.minusOpacity)
                    .delay(CONTROL_IDLE_DELAY_SECONDS)
                    .to(CONTROL_IDLE_FADE_SECONDS, { opacity: CONTROL_IDLE_OPACITY }, { easing: 'sineOut' })
                    .start();
            }
        },

        pulseBoardZoomControlActivity(): void {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.root?.isValid) return;
            if (!this.syncBoardZoomControlVisibility()) return;
            this.setBoardZoomControlActive(true);
            this.setBoardZoomControlActive(false);
        },

        getBoardZoomTrackRange(): { bottom: number; top: number } {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            const trackH = Math.max(1, ui?.trackUi?.contentSize.height || 1);
            const half = trackH / 2;
            return {
                bottom: -half,
                top: half,
            };
        },

        applyBoardZoomControlProgress(progress: number, tutorialSource: 'zoom_progress' | 'zoom_button'): void {
            const normalized = clamp01(progress);
            this._boardZoomControlUpdatingFromSlider = true;
            try {
                if (typeof this.setBoardViewportScaleNormalized === 'function') {
                    this.setBoardViewportScaleNormalized(normalized, tutorialSource);
                } else if (this.boardViewport?.setScaleNormalized) {
                    this.boardViewport.setScaleNormalized(normalized);
                    this.boardViewScale = this.boardViewport.scale;
                }
            } finally {
                this._boardZoomControlUpdatingFromSlider = false;
            }
            this.syncBoardZoomControlProgress(normalized, true);
        },

        onBoardZoomSliderChanged(slider?: Slider): void {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.root?.isValid) return;
            if ((Number(this._modalFocusRefs) || 0) > 0 || this._guideInputSuspended) {
                this.refreshBoardZoomControl();
                this.setBoardZoomControlActive(false);
                return;
            }
            this.setBoardZoomControlActive(true);
            this.applyBoardZoomControlProgress(slider?.progress ?? ui.slider.progress, 'zoom_progress');
        },

        onBoardZoomSliderTouchStart(event: EventTouch): void {
            stopZoomEvent(event);
            if ((Number(this._modalFocusRefs) || 0) > 0 || this._guideInputSuspended) return;
            if (typeof this.resetTouchState === 'function') {
                this.resetTouchState();
            }
            this.setBoardZoomControlActive(true);
        },

        onBoardZoomSliderTouchEnd(event: EventTouch): void {
            stopZoomEvent(event);
            this.setBoardZoomControlActive(false);
        },

        onBoardZoomSliderTouchCancel(event: EventTouch): void {
            stopZoomEvent(event);
            this.refreshBoardZoomControl();
            this.setBoardZoomControlActive(false);
        },

        stepBoardZoomControl(direction: -1 | 1): void {
            const currentProgress = clamp01(
                typeof this.getBoardViewportScaleNormalized === 'function'
                    ? this.getBoardViewportScaleNormalized()
                    : this.boardViewport?.getScaleNormalized?.() ?? 0,
            );
            this.applyBoardZoomControlProgress(currentProgress + direction * BOARD_ZOOM_STEP_PROGRESS, 'zoom_button');
        },

        onBoardZoomStepTouchStart(event: EventTouch): void {
            stopZoomEvent(event);
            if ((Number(this._modalFocusRefs) || 0) > 0 || this._guideInputSuspended) return;
            if (typeof this.resetTouchState === 'function') {
                this.resetTouchState();
            }
            this.setBoardZoomControlActive(true);
        },

        onBoardZoomPlusTouchEnd(event: EventTouch): void {
            stopZoomEvent(event);
            if ((Number(this._modalFocusRefs) || 0) > 0 || this._guideInputSuspended) {
                this.setBoardZoomControlActive(false);
                return;
            }
            AudioMgr.inst.play('button');
            this.stepBoardZoomControl(1);
            this.setBoardZoomControlActive(false);
        },

        onBoardZoomMinusTouchEnd(event: EventTouch): void {
            stopZoomEvent(event);
            if ((Number(this._modalFocusRefs) || 0) > 0 || this._guideInputSuspended) {
                this.setBoardZoomControlActive(false);
                return;
            }
            AudioMgr.inst.play('button');
            this.stepBoardZoomControl(-1);
            this.setBoardZoomControlActive(false);
        },

        onBoardZoomStepTouchCancel(event: EventTouch): void {
            stopZoomEvent(event);
            this.refreshBoardZoomControl();
            this.setBoardZoomControlActive(false);
        },

        onBoardZoomLocateTouchStart(event: EventTouch): void {
            stopZoomEvent(event);
            if (typeof this.resetTouchState === 'function') {
                this.resetTouchState();
            }
            this.setBoardZoomControlActive(true);
        },

        onBoardZoomLocateTouchEnd(event: EventTouch): void {
            stopZoomEvent(event);
            if ((Number(this._modalFocusRefs) || 0) > 0 || this._guideInputSuspended) {
                this.setBoardZoomControlActive(false);
                return;
            }
            AudioMgr.inst.play('button');
            if (typeof this.resetBoardViewportToHome === 'function') {
                this.resetBoardViewportToHome();
            } else if (this.boardViewport?.resetToHome) {
                this.boardViewport.resetToHome();
                this.boardViewScale = this.boardViewport.scale;
            }
            this.refreshBoardZoomControl();
            this.setBoardZoomControlActive(false);
        },

        onBoardZoomLocateTouchCancel(event: EventTouch): void {
            stopZoomEvent(event);
            this.setBoardZoomControlActive(false);
        },

        refreshBoardZoomControl(): void {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.root?.isValid || !ui.thumb?.isValid || !ui.fill?.isValid || !ui.fillBar?.isValid) return;
            if (!this.syncBoardZoomControlVisibility()) return;
            const progress = clamp01(
                typeof this.getBoardViewportScaleNormalized === 'function'
                    ? this.getBoardViewportScaleNormalized()
                    : this.boardViewport?.getScaleNormalized?.() ?? 0,
            );
            this.syncBoardZoomControlProgress(progress, Boolean(this._boardZoomControlUpdatingFromSlider));
        },

        syncBoardZoomControlProgress(progress: number, fromSlider: boolean = false): void {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.root?.isValid) return;
            const normalized = clamp01(progress);
            ui.slider.progress = normalized;
            ui.progressBar.progress = clamp01(fromSlider ? normalized : normalized + PROGRESS_SYNC_VISUAL_OFFSET);
        },
    });
}
