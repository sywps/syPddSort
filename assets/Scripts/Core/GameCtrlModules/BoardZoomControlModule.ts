import {
    AudioMgr,
    Color,
    EventTouch,
    Graphics,
    Node,
    Sprite,
    Tween,
    UITransform,
    UIOpacity,
    Vec3,
    tween,
} from '../GameCtrlShared';

type BoardZoomControlUi = {
    root: Node;
    track: Node;
    fill: Node;
    thumb: Node;
    locate: Node;
    trackUi: UITransform;
    fillUi: UITransform;
    trackGraphics: Graphics;
    fillGraphics: Graphics;
    plusGraphics: Graphics | null;
    minusGraphics: Graphics | null;
    opacity: UIOpacity;
    dragging: boolean;
};

const TRACK_VISUAL_WIDTH = 18;
const TRACK_INNER_WIDTH = 10;
const TRACK_TRAVEL_PADDING = 20;
const CONTROL_IDLE_OPACITY = 82;
const CONTROL_ACTIVE_OPACITY = 190;
const CONTROL_ACTIVE_FADE_SECONDS = 0.08;
const CONTROL_IDLE_DELAY_SECONDS = 0.65;
const CONTROL_IDLE_FADE_SECONDS = 0.28;
const BOARD_ZOOM_CONTROL_VISIBLE = false;

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

function requireGraphics(node: Node, path: string): Graphics {
    const graphics = node.getComponent(Graphics);
    if (!graphics) {
        throw new Error(`[board-zoom-control] Game.scene is missing Graphics on ${path}`);
    }
    return graphics;
}

function requireSpriteFrame(node: Node, path: string): void {
    const sprite = node.getComponent(Sprite);
    if (!sprite?.spriteFrame) {
        throw new Error(`[board-zoom-control] Game.scene is missing SpriteFrame on ${path}`);
    }
}

function ensureOpacity(node: Node): UIOpacity {
    return node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
}

function drawRoundedRect(graphics: Graphics, x: number, y: number, width: number, height: number, radius: number): void {
    const g = graphics as any;
    if (typeof g.roundRect === 'function') {
        g.roundRect(x, y, width, height, radius);
    } else {
        graphics.rect(x, y, width, height);
    }
}

function drawGlyph(graphics: Graphics | null, isPlus: boolean): void {
    if (!graphics) return;
    graphics.clear();
    graphics.lineWidth = 3;
    graphics.strokeColor = new Color(255, 255, 255, 205);
    graphics.moveTo(-6, 0);
    graphics.lineTo(6, 0);
    if (isPlus) {
        graphics.moveTo(0, -6);
        graphics.lineTo(0, 6);
    }
    graphics.stroke();
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
            const thumb = requireChild(track, 'Thumb', 'BoardZoomControl/ZoomTrack/Thumb');
            const plus = track.getChildByName('PlusGlyph') || null;
            const minus = track.getChildByName('MinusGlyph') || null;

            requireUi(root, 'GameplayFixedRoot/BoardZoomControl');
            requireUi(locate, 'BoardZoomControl/LocateBtn');
            const trackUi = requireUi(track, 'BoardZoomControl/ZoomTrack');
            const fillUi = requireUi(fill, 'BoardZoomControl/ZoomTrack/ZoomFill');
            requireUi(thumb, 'BoardZoomControl/ZoomTrack/Thumb');
            requireSpriteFrame(locate, 'BoardZoomControl/LocateBtn');
            requireSpriteFrame(thumb, 'BoardZoomControl/ZoomTrack/Thumb');

            const ui: BoardZoomControlUi = {
                root,
                track,
                fill,
                thumb,
                locate,
                trackUi,
                fillUi,
                trackGraphics: requireGraphics(track, 'BoardZoomControl/ZoomTrack'),
                fillGraphics: requireGraphics(fill, 'BoardZoomControl/ZoomTrack/ZoomFill'),
                plusGraphics: plus?.isValid ? plus.getComponent(Graphics) : null,
                minusGraphics: minus?.isValid ? minus.getComponent(Graphics) : null,
                opacity: ensureOpacity(root),
                dragging: false,
            };
            this._boardZoomControlUi = ui;

            root.active = true;
            track.active = true;
            fill.active = true;
            thumb.active = true;
            locate.active = true;
            thumb.setSiblingIndex(track.children.length - 1);

            this.drawBoardZoomControlStatic();
            this.setBoardZoomControlActive(false, true);
            this.bindBoardZoomControlEvents();
            this.refreshBoardZoomControl();
        },

        bindBoardZoomControlEvents(): void {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.root?.isValid) return;

            ui.track.targetOff(this);
            ui.thumb.targetOff(this);
            ui.locate.targetOff(this);

            ui.track.on(Node.EventType.TOUCH_START, this.onBoardZoomControlTouchStart, this);
            ui.track.on(Node.EventType.TOUCH_MOVE, this.onBoardZoomControlTouchMove, this);
            ui.track.on(Node.EventType.TOUCH_END, this.onBoardZoomControlTouchEnd, this);
            ui.track.on(Node.EventType.TOUCH_CANCEL, this.onBoardZoomControlTouchCancel, this);

            ui.thumb.on(Node.EventType.TOUCH_START, this.onBoardZoomControlTouchStart, this);
            ui.thumb.on(Node.EventType.TOUCH_MOVE, this.onBoardZoomControlTouchMove, this);
            ui.thumb.on(Node.EventType.TOUCH_END, this.onBoardZoomControlTouchEnd, this);
            ui.thumb.on(Node.EventType.TOUCH_CANCEL, this.onBoardZoomControlTouchCancel, this);

            ui.locate.on(Node.EventType.TOUCH_START, this.onBoardZoomLocateTouchStart, this);
            ui.locate.on(Node.EventType.TOUCH_END, this.onBoardZoomLocateTouchEnd, this);
            ui.locate.on(Node.EventType.TOUCH_CANCEL, this.onBoardZoomLocateTouchCancel, this);
        },

        drawBoardZoomControlStatic(): void {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.root?.isValid) return;

            const trackH = Math.max(1, ui.trackUi.contentSize.height);
            ui.trackGraphics.clear();
            ui.trackGraphics.fillColor = new Color(139, 131, 118, 175);
            drawRoundedRect(
                ui.trackGraphics,
                -TRACK_VISUAL_WIDTH / 2,
                -trackH / 2,
                TRACK_VISUAL_WIDTH,
                trackH,
                TRACK_VISUAL_WIDTH / 2,
            );
            ui.trackGraphics.fill();

            drawGlyph(ui.plusGraphics, true);
            drawGlyph(ui.minusGraphics, false);
        },

        drawBoardZoomControlFill(): void {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.fill?.isValid) return;
            const fillH = Math.max(1, ui.fillUi.contentSize.height);
            ui.fillGraphics.clear();
            ui.fillGraphics.fillColor = new Color(252, 252, 248, 215);
            drawRoundedRect(
                ui.fillGraphics,
                -TRACK_INNER_WIDTH / 2,
                0,
                TRACK_INNER_WIDTH,
                fillH,
                TRACK_INNER_WIDTH / 2,
            );
            ui.fillGraphics.fill();
        },

        setBoardZoomControlActive(active: boolean, immediate: boolean = false): void {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.opacity) return;
            const targetOpacity = active ? CONTROL_ACTIVE_OPACITY : CONTROL_IDLE_OPACITY;
            Tween.stopAllByTarget(ui.opacity);
            if (immediate) {
                ui.opacity.opacity = targetOpacity;
                return;
            }
            if (active) {
                tween(ui.opacity)
                    .to(CONTROL_ACTIVE_FADE_SECONDS, { opacity: targetOpacity }, { easing: 'sineOut' })
                    .start();
                return;
            }
            tween(ui.opacity)
                .delay(CONTROL_IDLE_DELAY_SECONDS)
                .to(CONTROL_IDLE_FADE_SECONDS, { opacity: targetOpacity }, { easing: 'sineOut' })
                .start();
        },

        getBoardZoomTrackRange(): { bottom: number; top: number } {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            const trackH = Math.max(1, ui?.trackUi?.contentSize.height || 1);
            const half = trackH / 2;
            return {
                bottom: -half + TRACK_TRAVEL_PADDING,
                top: half - TRACK_TRAVEL_PADDING,
            };
        },

        getBoardZoomControlProgressFromTouch(event: EventTouch): number {
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.track?.isValid) return 0;
            const touch = event.getUILocation();
            const local = ui.trackUi.convertToNodeSpaceAR(new Vec3(touch.x, touch.y, 0));
            const range = this.getBoardZoomTrackRange();
            return clamp01((local.y - range.bottom) / Math.max(1, range.top - range.bottom));
        },

        applyBoardZoomControlTouch(event: EventTouch): void {
            const progress = this.getBoardZoomControlProgressFromTouch(event);
            if (typeof this.setBoardViewportScaleNormalized === 'function') {
                this.setBoardViewportScaleNormalized(progress);
            } else if (this.boardViewport?.setScaleNormalized) {
                this.boardViewport.setScaleNormalized(progress);
                this.boardViewScale = this.boardViewport.scale;
            }
            this.refreshBoardZoomControl();
        },

        onBoardZoomControlTouchStart(event: EventTouch): void {
            stopZoomEvent(event);
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.root?.isValid) return;
            if ((Number(this._modalFocusRefs) || 0) > 0 || this._guideInputSuspended) return;
            if (typeof this.resetTouchState === 'function') {
                this.resetTouchState();
            }
            ui.dragging = true;
            this.setBoardZoomControlActive(true);
            this.applyBoardZoomControlTouch(event);
        },

        onBoardZoomControlTouchMove(event: EventTouch): void {
            stopZoomEvent(event);
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.dragging) return;
            this.applyBoardZoomControlTouch(event);
        },

        onBoardZoomControlTouchEnd(event: EventTouch): void {
            stopZoomEvent(event);
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (!ui?.dragging) {
                this.setBoardZoomControlActive(false);
                return;
            }
            ui.dragging = false;
            this.applyBoardZoomControlTouch(event);
            this.setBoardZoomControlActive(false);
        },

        onBoardZoomControlTouchCancel(event: EventTouch): void {
            stopZoomEvent(event);
            const ui = this._boardZoomControlUi as BoardZoomControlUi | null;
            if (ui) ui.dragging = false;
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
            if (!ui?.root?.isValid || !ui.thumb?.isValid || !ui.fill?.isValid) return;
            const progress = clamp01(
                typeof this.getBoardViewportScaleNormalized === 'function'
                    ? this.getBoardViewportScaleNormalized()
                    : this.boardViewport?.getScaleNormalized?.() ?? 0,
            );
            const range = this.getBoardZoomTrackRange();
            const y = range.bottom + (range.top - range.bottom) * progress;
            ui.thumb.setPosition(0, y, 0);
            ui.fill.setPosition(0, range.bottom, 0);
            ui.fillUi.setContentSize(TRACK_INNER_WIDTH, Math.max(1, y - range.bottom));
            this.drawBoardZoomControlFill();
        },
    });
}
