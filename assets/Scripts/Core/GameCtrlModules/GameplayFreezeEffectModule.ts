import {
    assetManager,
    Bundle,
    GAME_ASSETS_BUNDLE_NAME,
    Layers,
    Node,
    sp,
    UIOpacity,
    UITransform,
} from '../GameCtrlShared';

const FREEZE_SPINE_FX_PATH = 'Spine/PinddFreeze/bingdonglizi';
const FREEZE_SPINE_FX_UUID = '147069ac-5bbd-4232-ae8c-a61ef72543fb';
const FREEZE_SPINE_FX_LAYER_NAME = 'FreezeFxLayer';
const FREEZE_SPINE_FX_NODE_NAME = 'FreezeSpineFx';
const FREEZE_SPINE_FX_SOURCE_WIDTH = 1061.5;
const FREEZE_SPINE_FX_SOURCE_HEIGHT = 2355.43;
const FREEZE_SPINE_FX_REFERENCE_WIDTH = 750;
const FREEZE_SPINE_FX_REFERENCE_HEIGHT = 1334;
const FREEZE_SPINE_FX_REFERENCE_Y = -133.4;
const FREEZE_SPINE_FX_REFERENCE_ANCHOR_X = 0.504408848493435;
const FREEZE_SPINE_FX_REFERENCE_ANCHOR_Y = 0.4999978751722795;
const FREEZE_SPINE_FX_END_DURATION = 4.12;
const FREEZE_SPINE_FX_ANIMATION = {
    start: 'a1',
    loop: 'b1',
    end: 'c1',
} as const;

function setFreezeFxLayerDeep(node: Node, layer: number): void {
    node.layer = layer;
    for (const child of node.children) {
        setFreezeFxLayerDeep(child, layer);
    }
}

export function installGameplayFreezeEffectModule(target: any): void {
    Object.assign(target, {
        warnFreezeSpineFxLoadFailure(message: string): void {
            if (this._freezeSpineFxLoadWarned) return;
            this._freezeSpineFxLoadWarned = true;
            console.error(`[freeze-spine-fx] load skipped: ${message}`);
        },

        warnFreezeSpineFxPlayFailure(message: string): void {
            if (this._freezeSpineFxPlayWarned) return;
            this._freezeSpineFxPlayWarned = true;
            console.error(`[freeze-spine-fx] play skipped: ${message}`);
        },

        ensureFreezeSpineFxSkeletonData(onDone: (data: sp.SkeletonData | null) => void): void {
            const isRuntimeAlive = () => !!(this._isRuntimeAliveForAsyncCallback?.() ?? this.isValid);
            const skeletonDataCtor = (sp as any)?.SkeletonData;
            if (!skeletonDataCtor) {
                this.warnFreezeSpineFxLoadFailure('Spine module is disabled or unavailable');
                onDone(null);
                return;
            }
            if (this._freezeSpineFxSkeletonData) {
                onDone(this._freezeSpineFxSkeletonData);
                return;
            }
            if (this._freezeSpineFxSkeletonDataLoading) {
                this._freezeSpineFxSkeletonDataCallbacks.push(onDone);
                return;
            }

            this._freezeSpineFxSkeletonDataLoading = true;
            this._freezeSpineFxSkeletonDataCallbacks = [onDone];
            const finish = (data: sp.SkeletonData | null) => {
                if (!isRuntimeAlive()) return;
                this._freezeSpineFxSkeletonDataLoading = false;
                if (data) this._freezeSpineFxSkeletonData = data;
                const callbacks = this._freezeSpineFxSkeletonDataCallbacks || [];
                this._freezeSpineFxSkeletonDataCallbacks = [];
                for (const cb of callbacks) cb(data);
            };
            const loadFromBundle = (bundle: Bundle | null) => {
                const loadByUuid = () => {
                    const loadAny = (assetManager as any)?.loadAny;
                    if (typeof loadAny !== 'function') {
                        this.warnFreezeSpineFxLoadFailure('assetManager.loadAny unavailable');
                        finish(null);
                        return;
                    }
                    loadAny.call(assetManager, { uuid: FREEZE_SPINE_FX_UUID, type: skeletonDataCtor }, (err: Error | null, data: sp.SkeletonData | null) => {
                        if (err || !data) {
                            this.warnFreezeSpineFxLoadFailure(err?.message || 'SkeletonData missing');
                            finish(null);
                            return;
                        }
                        finish(data);
                    });
                };
                if (!bundle) {
                    loadByUuid();
                    return;
                }
                bundle.load(FREEZE_SPINE_FX_PATH, skeletonDataCtor, (err: Error | null, data: sp.SkeletonData | null) => {
                    if (err || !data) {
                        loadByUuid();
                        return;
                    }
                    finish(data);
                });
            };

            if (typeof this._withGameAssetsBundle === 'function') {
                this._withGameAssetsBundle(loadFromBundle);
                return;
            }

            assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
                if (!isRuntimeAlive()) return;
                if (err || !bundle) {
                    this.warnFreezeSpineFxLoadFailure(err?.message || 'gameAssets bundle unavailable');
                    finish(null);
                    return;
                }
                this.gameAssetsBundle = bundle;
                loadFromBundle(bundle);
            });
        },

        getFreezeSpineFxLayout(parent: Node): { x: number; y: number; scale: number } {
            const transform = parent.getComponent(UITransform);
            const width = Math.max(1, Number(transform?.contentSize.width) || Number(this.constructor?.VIEWPORT_WIDTH) || 720);
            const height = Math.max(1, Number(transform?.contentSize.height) || Number(this.constructor?.VIEWPORT_HEIGHT) || 1280);
            return {
                x: 0,
                y: FREEZE_SPINE_FX_REFERENCE_Y * (height / FREEZE_SPINE_FX_REFERENCE_HEIGHT),
                scale: width / FREEZE_SPINE_FX_REFERENCE_WIDTH,
            };
        },

        destroyFreezeSpineFxNode(node: Node | null | undefined): void {
            if (!node?.isValid) return;
            const skeletonCtor = (sp as any)?.Skeleton;
            const skeleton = skeletonCtor ? node.getComponent(skeletonCtor) as sp.Skeleton | null : null;
            if (skeleton) {
                skeleton.setCompleteListener(() => {});
                skeleton.clearTracks();
                skeleton.skeletonData = null;
                skeleton.enabled = false;
            }
            node.removeFromParent();
            node.destroy();
        },

        clearFreezeSpineFx(): void {
            this._freezeSpineFxSeq = (Number(this._freezeSpineFxSeq) || 0) + 1;
            const node = this._freezeSpineFxNode || null;
            this._freezeSpineFxNode = null;
            this.destroyFreezeSpineFxNode(node);
        },

        stopFreezeSpineFx(playEnding: boolean = true): void {
            const node = this._freezeSpineFxNode || null;
            if (!node?.isValid) {
                this._freezeSpineFxNode = null;
                return;
            }
            if (!playEnding) {
                this.clearFreezeSpineFx();
                return;
            }
            const skeletonCtor = (sp as any)?.Skeleton;
            const skeleton = skeletonCtor ? node.getComponent(skeletonCtor) as sp.Skeleton | null : null;
            if (!skeleton || !skeleton.skeletonData) {
                this.destroyFreezeSpineFxNode(node);
                return;
            }
            const seq = (Number(this._freezeSpineFxSeq) || 0) + 1;
            this._freezeSpineFxSeq = seq;
            (node as any).__freezeSpineFxSeq = seq;
            let completed = false;
            const completeOnce = () => {
                if (completed || !node?.isValid || (node as any).__freezeSpineFxSeq !== seq) return;
                completed = true;
                if (this._freezeSpineFxNode === node) {
                    this._freezeSpineFxNode = null;
                }
                this.destroyFreezeSpineFxNode(node);
            };
            try {
                skeleton.setCompleteListener(() => completeOnce());
                skeleton.clearTracks();
                skeleton.setAnimation(0, FREEZE_SPINE_FX_ANIMATION.end, false);
                this.scheduleOnce(completeOnce, FREEZE_SPINE_FX_END_DURATION);
            } catch (err) {
                this.warnFreezeSpineFxPlayFailure(err instanceof Error ? err.message : String(err));
                completeOnce();
            }
        },

        playFreezeSpineFx(): void {
            this.ensureFreezeSpineFxSkeletonData((skeletonData: sp.SkeletonData | null) => {
                if (!skeletonData || this.isGameEnd || Math.max(0, Number(this._freezeTimeLeft) || 0) <= 0) return;
                const skeletonCtor = (sp as any)?.Skeleton;
                if (!skeletonCtor) {
                    this.warnFreezeSpineFxLoadFailure('Spine component is disabled or unavailable');
                    return;
                }
                const fxRoot = typeof this.requireCanvasUiRoot === 'function'
                    ? this.requireCanvasUiRoot('FxRoot')
                    : null;
                if (!fxRoot?.isValid) {
                    this.warnFreezeSpineFxPlayFailure('FxRoot unavailable');
                    return;
                }
                const fxLayer = fxRoot.getChildByName(FREEZE_SPINE_FX_LAYER_NAME);
                if (!fxLayer?.isValid) {
                    this.warnFreezeSpineFxPlayFailure(`${FREEZE_SPINE_FX_LAYER_NAME} unavailable`);
                    return;
                }
                this.clearFreezeSpineFx();
                const node = new Node(FREEZE_SPINE_FX_NODE_NAME);
                node.layer = Layers.Enum.UI_2D;
                const transform = node.addComponent(UITransform);
                transform.setContentSize(FREEZE_SPINE_FX_SOURCE_WIDTH, FREEZE_SPINE_FX_SOURCE_HEIGHT);
                const setAnchorPoint = (transform as any).setAnchorPoint;
                if (typeof setAnchorPoint === 'function') {
                    setAnchorPoint.call(transform, FREEZE_SPINE_FX_REFERENCE_ANCHOR_X, FREEZE_SPINE_FX_REFERENCE_ANCHOR_Y);
                }
                const opacity = node.addComponent(UIOpacity);
                opacity.opacity = 255;
                fxLayer.addChild(node);
                setFreezeFxLayerDeep(node, Layers.Enum.UI_2D);
                const layout = this.getFreezeSpineFxLayout(fxLayer);
                node.setPosition(layout.x, layout.y, 0);
                node.setScale(layout.scale, layout.scale, 1);

                const skeleton = node.addComponent(skeletonCtor) as sp.Skeleton;
                skeleton.enabled = true;
                skeleton.premultipliedAlpha = false;
                skeleton.enableBatch = true;
                const seq = (Number(this._freezeSpineFxSeq) || 0) + 1;
                this._freezeSpineFxSeq = seq;
                (node as any).__freezeSpineFxSeq = seq;
                this._freezeSpineFxNode = node;
                try {
                    skeleton.skeletonData = skeletonData;
                    skeleton.setCompleteListener(() => {});
                    skeleton.setAnimation(0, FREEZE_SPINE_FX_ANIMATION.start, false);
                    skeleton.addAnimation(0, FREEZE_SPINE_FX_ANIMATION.loop, true, 0);
                } catch (err) {
                    this.warnFreezeSpineFxPlayFailure(err instanceof Error ? err.message : String(err));
                    if ((node as any).__freezeSpineFxSeq === seq) {
                        this._freezeSpineFxNode = null;
                    }
                    this.destroyFreezeSpineFxNode(node);
                }
            });
        },
    });
}
