import {
    assetManager,
    AudioMgr,
    Bundle,
    Color,
    instantiate,
    GAME_ASSETS_BUNDLE_NAME,
    Layers,
    Node,
    Prefab,
    Sprite,
    SpriteFrame,
    tween,
    Tween,
    UIOpacity,
    UITransform,
} from '../GameCtrlShared';

const COLOR_COMPLETE_MATCH_FX_PREFAB_PATH = 'UI/Prefabs/Fx/ColorCompleteBeanMatchFx';
const COLOR_COMPLETE_MATCH_FRAME_PREFIX = 'block_match-animation_';
const COLOR_COMPLETE_MATCH_FRAME_COUNT = 19;
const COLOR_COMPLETE_MATCH_SPRITE_ENABLED = false;
const COLOR_COMPLETE_MATCH_FRAME_INTERVAL = 0.035;
const COLOR_COMPLETE_MATCH_SPARKLE_FRAME_START_INDEX = 15;
const COLOR_COMPLETE_FACE_DEFINITIONS = [
    { nodeName: 'FaceTL' },
    { nodeName: 'FaceTR' },
    { nodeName: 'FaceBR' },
    { nodeName: 'FaceBL' },
] as const;
const COLOR_COMPLETE_FACE_NODE_NAMES = COLOR_COMPLETE_FACE_DEFINITIONS.map((def) => def.nodeName);
const COLOR_COMPLETE_FACE_LIGHT_STEP_DELAY = 0.1;
const COLOR_COMPLETE_FACE_RISE_DURATION = 0.08;
const COLOR_COMPLETE_FACE_ALL_LIT_HOLD_DURATION = 0.16;
const COLOR_COMPLETE_FACE_FADE_STEP_DELAY = 0.09;
const COLOR_COMPLETE_FACE_FADE_DURATION = 0.14;
const COLOR_COMPLETE_FACE_PEAK_OPACITY = 220;
const COLOR_COMPLETE_FACE_SIZE_SCALE = 1;
const COLOR_COMPLETE_MATCH_START_DELAY = 0.2;
const COLOR_COMPLETE_MATCH_PEAK_OPACITY = 68;
const COLOR_COMPLETE_MATCH_FADE_DURATION = 0.18;
const COLOR_COMPLETE_MATCH_SIZE_SCALE = 1;
const COLOR_COMPLETE_MATCH_POOL_LIMIT = 64;

function setFxLayerDeep(node: Node, layer: number): void {
    node.layer = layer;
    for (const child of node.children) {
        setFxLayerDeep(child, layer);
    }
}

export function installGameplayColorCompleteFxMethods(target: any): void {
    Object.assign(target, {
        warnColorCompleteMatchFxLoadFailure(message: string): void {
            if (this._colorCompleteMatchFxLoadWarned) return;
            this._colorCompleteMatchFxLoadWarned = true;
            console.error(`[color-complete-fx] load skipped: ${message}`);
        },

        getColorCompleteMatchFrames(): SpriteFrame[] {
            return this.getEffectFrames(COLOR_COMPLETE_MATCH_FRAME_PREFIX, COLOR_COMPLETE_MATCH_FRAME_COUNT);
        },

        ensureColorCompleteMatchFrames(onDone: (frames: SpriteFrame[]) => void): void {
            const cached = this.getColorCompleteMatchFrames();
            if (cached.length >= COLOR_COMPLETE_MATCH_FRAME_COUNT) {
                onDone(cached);
                return;
            }
            if (cached.length > 0) {
                this._effectFrameCache.delete(`${COLOR_COMPLETE_MATCH_FRAME_PREFIX}${COLOR_COMPLETE_MATCH_FRAME_COUNT}`);
            }

            const loadFromBundle = (bundle: Bundle | null) => {
                if (!bundle || typeof this._loadEffectsAtlasFromBundle !== 'function') {
                    this.warnColorCompleteMatchFxLoadFailure('effects atlas loader unavailable');
                    onDone([]);
                    return;
                }
                this._loadEffectsAtlasFromBundle(bundle, () => {
                    const frames = this.getColorCompleteMatchFrames();
                    if (frames.length < COLOR_COMPLETE_MATCH_FRAME_COUNT) {
                        this._effectFrameCache.delete(`${COLOR_COMPLETE_MATCH_FRAME_PREFIX}${COLOR_COMPLETE_MATCH_FRAME_COUNT}`);
                        this.warnColorCompleteMatchFxLoadFailure('block_match-animation frames missing');
                    }
                    onDone(frames);
                });
            };

            if (typeof this._withGameAssetsBundle === 'function') {
                this._withGameAssetsBundle(loadFromBundle);
                return;
            }

            assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
                if (err || !bundle) {
                    this.warnColorCompleteMatchFxLoadFailure(err?.message || 'gameAssets bundle unavailable');
                    onDone([]);
                    return;
                }
                this.gameAssetsBundle = bundle;
                loadFromBundle(bundle);
            });
        },

        ensureColorCompleteMatchFxPrefab(onDone: (prefab: Prefab | null) => void): void {
            const isRuntimeAlive = () => !!(this._isRuntimeAliveForAsyncCallback?.() ?? this.isValid);
            if (this._colorCompleteMatchFxPrefab) {
                onDone(this._colorCompleteMatchFxPrefab);
                return;
            }
            if (this._colorCompleteMatchFxPrefabLoading) {
                this._colorCompleteMatchFxPrefabCallbacks.push(onDone);
                return;
            }

            this._colorCompleteMatchFxPrefabLoading = true;
            this._colorCompleteMatchFxPrefabCallbacks = [onDone];
            const finish = (prefab: Prefab | null) => {
                if (!isRuntimeAlive()) return;
                this._colorCompleteMatchFxPrefabLoading = false;
                if (prefab) this._colorCompleteMatchFxPrefab = prefab;
                const callbacks = this._colorCompleteMatchFxPrefabCallbacks || [];
                this._colorCompleteMatchFxPrefabCallbacks = [];
                for (const cb of callbacks) cb(prefab);
            };
            const loadFromBundle = (bundle: Bundle | null) => {
                if (!bundle) {
                    this.warnColorCompleteMatchFxLoadFailure('gameAssets bundle unavailable');
                    finish(null);
                    return;
                }
                bundle.load(COLOR_COMPLETE_MATCH_FX_PREFAB_PATH, Prefab, (err: Error | null, prefab: Prefab | null) => {
                    if (err || !prefab) {
                        this.warnColorCompleteMatchFxLoadFailure(err?.message || 'prefab missing');
                        finish(null);
                        return;
                    }
                    finish(prefab);
                });
            };

            if (typeof this._withGameAssetsBundle === 'function') {
                this._withGameAssetsBundle(loadFromBundle);
                return;
            }

            assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
                if (!isRuntimeAlive()) return;
                if (err || !bundle) {
                    this.warnColorCompleteMatchFxLoadFailure(err?.message || 'gameAssets bundle unavailable');
                    finish(null);
                    return;
                }
                this.gameAssetsBundle = bundle;
                loadFromBundle(bundle);
            });
        },

        acquireColorCompleteMatchFxNode(prefab: Prefab): Node {
            const pooled = this._colorCompleteMatchFxPool.pop();
            if (pooled && pooled.isValid) {
                return pooled;
            }
            return instantiate(prefab);
        },

        recycleColorCompleteMatchFxNode(node: Node): void {
            Tween.stopAllByTarget(node);
            const opacity = node.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
            for (const faceName of COLOR_COMPLETE_FACE_NODE_NAMES) {
                const faceNode = node.getChildByName(faceName);
                if (!faceNode) continue;
                Tween.stopAllByTarget(faceNode);
                const faceOpacity = faceNode.getComponent(UIOpacity);
                if (faceOpacity) {
                    Tween.stopAllByTarget(faceOpacity);
                    faceOpacity.opacity = 0;
                }
                faceNode.setScale(1, 1, 1);
            }
            const matchSpriteNode = node.getChildByName('MatchSprite');
            if (matchSpriteNode) {
                Tween.stopAllByTarget(matchSpriteNode);
                const matchOpacity = matchSpriteNode.getComponent(UIOpacity);
                if (matchOpacity) {
                    Tween.stopAllByTarget(matchOpacity);
                    matchOpacity.opacity = 0;
                }
                matchSpriteNode.setScale(1, 1, 1);
            }
            const sprite = matchSpriteNode?.getComponent(Sprite) || node.getComponent(Sprite);
            if (sprite) sprite.spriteFrame = null;
            node.removeFromParent();
            node.active = false;
            if (this._colorCompleteMatchFxPool.length >= COLOR_COMPLETE_MATCH_POOL_LIMIT) {
                node.destroy();
                return;
            }
            this._colorCompleteMatchFxPool.push(node);
        },

        prepareColorCompleteFaceNode(fx: Node, faceName: string, size: number): { node: Node; opacity: UIOpacity } | null {
            const faceNode = fx.getChildByName(faceName);
            if (!faceNode) return null;
            Tween.stopAllByTarget(faceNode);
            faceNode.active = true;
            faceNode.setPosition(0, 0, 0);
            faceNode.setScale(1, 1, 1);
            const faceSize = Math.max(24, Math.round(size * COLOR_COMPLETE_FACE_SIZE_SCALE));
            const transform = faceNode.getComponent(UITransform) || faceNode.addComponent(UITransform);
            transform.setContentSize(faceSize, faceSize);
            const sprite = faceNode.getComponent(Sprite);
            if (sprite) {
                sprite.enabled = true;
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.color = new Color(255, 255, 255, 255);
            }
            const opacity = faceNode.getComponent(UIOpacity) || faceNode.addComponent(UIOpacity);
            Tween.stopAllByTarget(opacity);
            opacity.opacity = 0;
            return { node: faceNode, opacity };
        },

        playColorCompleteMatchFxOnBean(beanNode: Node, frames: SpriteFrame[], prefab: Prefab, size: number): void {
            if (!beanNode?.isValid) return;
            const fx = this.acquireColorCompleteMatchFxNode(prefab);
            Tween.stopAllByTarget(fx);
            beanNode.addChild(fx);
            setFxLayerDeep(fx, Layers.Enum.UI_2D);
            fx.name = 'ColorCompleteBeanMatchFx';
            fx.active = true;
            fx.setPosition(0, 0, 0);
            fx.setScale(1, 1, 1);
            fx.angle = 0;

            const rootTransform = fx.getComponent(UITransform) || fx.addComponent(UITransform);
            rootTransform.setContentSize(size, size);
            const opacity = fx.getComponent(UIOpacity) || fx.addComponent(UIOpacity);
            Tween.stopAllByTarget(opacity);
            opacity.opacity = 255;

            for (let i = 0; i < COLOR_COMPLETE_FACE_NODE_NAMES.length; i++) {
                const face = this.prepareColorCompleteFaceNode(fx, COLOR_COMPLETE_FACE_NODE_NAMES[i], size);
                if (!face) continue;
                const lightDelay = i * COLOR_COMPLETE_FACE_LIGHT_STEP_DELAY;
                const allLitAt = (COLOR_COMPLETE_FACE_NODE_NAMES.length - 1) * COLOR_COMPLETE_FACE_LIGHT_STEP_DELAY
                    + COLOR_COMPLETE_FACE_RISE_DURATION;
                const fadeStart = allLitAt
                    + COLOR_COMPLETE_FACE_ALL_LIT_HOLD_DURATION
                    + i * COLOR_COMPLETE_FACE_FADE_STEP_DELAY;
                tween(face.opacity)
                    .delay(lightDelay)
                    .to(COLOR_COMPLETE_FACE_RISE_DURATION, { opacity: COLOR_COMPLETE_FACE_PEAK_OPACITY }, { easing: 'sineOut' })
                    .delay(Math.max(0, fadeStart - lightDelay - COLOR_COMPLETE_FACE_RISE_DURATION))
                    .to(COLOR_COMPLETE_FACE_FADE_DURATION, { opacity: 0 }, { easing: 'quadIn' })
                    .start();
            }

            const matchSpriteNode = fx.getChildByName('MatchSprite') || fx;
            Tween.stopAllByTarget(matchSpriteNode);
            const matchOpacity = matchSpriteNode.getComponent(UIOpacity) || matchSpriteNode.addComponent(UIOpacity);
            Tween.stopAllByTarget(matchOpacity);
            matchOpacity.opacity = 0;

            let matchDuration = 0;
            if (COLOR_COMPLETE_MATCH_SPRITE_ENABLED && frames.length > 0) {
                const sparkleFrames = frames.slice(COLOR_COMPLETE_MATCH_SPARKLE_FRAME_START_INDEX);
                const matchFrames = sparkleFrames.length > 0 ? sparkleFrames : frames;
                matchSpriteNode.active = true;
                matchSpriteNode.setPosition(0, 0, 0);
                matchSpriteNode.setScale(1, 1, 1);
                const spriteTransform = matchSpriteNode.getComponent(UITransform) || matchSpriteNode.addComponent(UITransform);
                const effectSize = Math.max(24, Math.round(size * COLOR_COMPLETE_MATCH_SIZE_SCALE));
                spriteTransform.setContentSize(effectSize, effectSize);
                const sprite = matchSpriteNode.getComponent(Sprite) || matchSpriteNode.addComponent(Sprite);
                sprite.enabled = true;
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.color = new Color(255, 255, 255, 255);
                sprite.spriteFrame = matchFrames[0];

                const visibleDuration = Math.max(0, matchFrames.length * COLOR_COMPLETE_MATCH_FRAME_INTERVAL);
                tween(matchOpacity)
                    .delay(COLOR_COMPLETE_MATCH_START_DELAY)
                    .to(0.04, { opacity: COLOR_COMPLETE_MATCH_PEAK_OPACITY }, { easing: 'sineOut' })
                    .delay(Math.max(0, visibleDuration - 0.04))
                    .to(COLOR_COMPLETE_MATCH_FADE_DURATION, { opacity: 0 }, { easing: 'quadIn' })
                    .start();

                let frameTween = tween(fx).delay(COLOR_COMPLETE_MATCH_START_DELAY);
                for (let i = 0; i < matchFrames.length; i++) {
                    const frame = matchFrames[i];
                    frameTween = frameTween
                        .call(() => {
                            if (fx.isValid && sprite.isValid) {
                                sprite.spriteFrame = frame;
                            }
                        })
                        .delay(COLOR_COMPLETE_MATCH_FRAME_INTERVAL);
                }
                frameTween.start();
                matchDuration = COLOR_COMPLETE_MATCH_START_DELAY + visibleDuration + COLOR_COMPLETE_MATCH_FADE_DURATION;
            } else {
                matchSpriteNode.active = false;
            }

            const faceDuration = (COLOR_COMPLETE_FACE_NODE_NAMES.length - 1) * COLOR_COMPLETE_FACE_LIGHT_STEP_DELAY
                + COLOR_COMPLETE_FACE_RISE_DURATION
                + COLOR_COMPLETE_FACE_ALL_LIT_HOLD_DURATION
                + (COLOR_COMPLETE_FACE_NODE_NAMES.length - 1) * COLOR_COMPLETE_FACE_FADE_STEP_DELAY
                + COLOR_COMPLETE_FACE_FADE_DURATION;
            tween(fx)
                .delay(Math.max(faceDuration, matchDuration) + 0.03)
                .call(() => {
                    if (fx.isValid) this.recycleColorCompleteMatchFxNode(fx);
                })
                .start();
        },

        playColorCompleteMatchFxForColor(colorId: number): void {
            const bm = this.boardModel;
            const bw = this.levelData.boardWidth;
            const bh = this.levelData.boardHeight;
            const beanNodes: Node[] = [];
            for (let r = 0; r < bh; r++) {
                for (let c = 0; c < bw; c++) {
                    if (bm.correctColors[r][c] !== colorId) continue;
                    const beanNode = this.cellNodes[r]?.[c];
                    if (beanNode?.isValid) beanNodes.push(beanNode);
                }
            }
            if (beanNodes.length === 0) return;

            const playWithFrames = (frames: SpriteFrame[]) => this.ensureColorCompleteMatchFxPrefab((prefab: Prefab | null) => {
                if (!prefab) return;
                const size = Math.max(24, Math.round(this.getBoardBeanVisualSize()));
                for (const beanNode of beanNodes) {
                    this.playColorCompleteMatchFxOnBean(beanNode, frames, prefab, size);
                }
            });
            if (!COLOR_COMPLETE_MATCH_SPRITE_ENABLED) {
                playWithFrames([]);
                return;
            }
            this.ensureColorCompleteMatchFrames((frames: SpriteFrame[]) => {
                if (frames.length > 0) playWithFrames(frames);
            });
        },

        playColorCompleteEffect(colorId: number, playSound: boolean = true) {
            if (playSound) AudioMgr.inst.play('winColor');
            this.playColorCompleteMatchFxForColor(colorId);
        },
    });
}
