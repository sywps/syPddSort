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
const SPINE_WASM_SUBPACKAGE_NAME = 'spineWasm';
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

function createFreezeSpineFxError(message: string): Error {
    return new Error(`[freeze-spine-fx] ${message}`);
}

function createFreezeSpineWasmError(err: unknown): Error {
    const message = err instanceof Error ? err.message : String(err || 'unknown error');
    return createFreezeSpineFxError(`Spine wasm load failed: ${message}`);
}

function ensureFreezeSpineWasmSubpackageReady(): Promise<void> {
    const globalScope = globalThis as any;
    if (!globalScope.__PDD_WECHAT_BUILD__) {
        return Promise.resolve();
    }
    const existing = globalScope.__PDD_SPINE_WASM_SUBPACKAGE_PROMISE__;
    if (existing && typeof existing.then === 'function') {
        return existing;
    }
    const wxApi = globalScope.__rawWx || globalScope.wx;
    if (!wxApi || typeof wxApi.loadSubpackage !== 'function') {
        return Promise.reject(createFreezeSpineFxError(`${SPINE_WASM_SUBPACKAGE_NAME} subpackage loader unavailable`));
    }
    globalScope.__PDD_SPINE_WASM_SUBPACKAGE_PROMISE__ = new Promise<void>((resolve, reject) => {
        wxApi.loadSubpackage({
            name: SPINE_WASM_SUBPACKAGE_NAME,
            success: () => resolve(),
            fail: (err: unknown) => reject(createFreezeSpineFxError(`${SPINE_WASM_SUBPACKAGE_NAME} subpackage load failed: ${err instanceof Error ? err.message : String(err || 'unknown error')}`)),
        });
    });
    return globalScope.__PDD_SPINE_WASM_SUBPACKAGE_PROMISE__;
}

function ensureFreezeSpineWasmReady(): Promise<void> {
    return ensureFreezeSpineWasmSubpackageReady().then(() => {
        const loadWasm = (sp as any)?.loadWasmModuleSpine;
        if (typeof loadWasm !== 'function') {
            return Promise.resolve();
        }
        try {
            return Promise.resolve(loadWasm.call(sp)).then(() => undefined, (err: unknown) => {
                throw createFreezeSpineWasmError(err);
            });
        } catch (err) {
            return Promise.reject(createFreezeSpineWasmError(err));
        }
    });
}

export function installGameplayFreezeEffectModule(target: any): void {
    Object.assign(target, {
        ensureFreezeSpineFxSkeletonData(onDone: (data: sp.SkeletonData) => void): void {
            const isRuntimeAlive = () => !!(this._isRuntimeAliveForAsyncCallback?.() ?? this.isValid);
            const skeletonDataCtor = (sp as any)?.SkeletonData;
            if (!skeletonDataCtor) {
                throw createFreezeSpineFxError('Spine module is disabled or unavailable');
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
            const finish = (data: sp.SkeletonData) => {
                if (!isRuntimeAlive()) return;
                this._freezeSpineFxSkeletonDataLoading = false;
                this._freezeSpineFxSkeletonData = data;
                const callbacks = this._freezeSpineFxSkeletonDataCallbacks || [];
                this._freezeSpineFxSkeletonDataCallbacks = [];
                for (const cb of callbacks) cb(data);
            };
            const loadFromBundle = (bundle: Bundle | null) => {
                if (!bundle) {
                    this._freezeSpineFxSkeletonDataLoading = false;
                    this._freezeSpineFxSkeletonDataCallbacks = [];
                    throw createFreezeSpineFxError('gameAssets bundle unavailable');
                    return;
                }
                bundle.load(FREEZE_SPINE_FX_PATH, skeletonDataCtor, (err: Error | null, data: sp.SkeletonData | null) => {
                    if (err || !data) {
                        this._freezeSpineFxSkeletonDataLoading = false;
                        this._freezeSpineFxSkeletonDataCallbacks = [];
                        throw createFreezeSpineFxError(`missing required SkeletonData ${FREEZE_SPINE_FX_PATH}: ${err?.message || 'asset missing'}`);
                        return;
                    }
                    finish(data);
                });
            };

            const loadSkeletonData = () => {
                if (typeof this._withGameAssetsBundle === 'function') {
                    this._withGameAssetsBundle(loadFromBundle);
                    return;
                }

                assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
                    if (!isRuntimeAlive()) return;
                    if (err || !bundle) {
                        this._freezeSpineFxSkeletonDataLoading = false;
                        this._freezeSpineFxSkeletonDataCallbacks = [];
                        throw createFreezeSpineFxError(`gameAssets bundle unavailable: ${err?.message || 'missing bundle'}`);
                        return;
                    }
                    this.gameAssetsBundle = bundle;
                    loadFromBundle(bundle);
                });
            };

            ensureFreezeSpineWasmReady().then(() => {
                if (!isRuntimeAlive()) return;
                loadSkeletonData();
            }).catch((err: Error) => {
                if (!isRuntimeAlive()) return;
                this._freezeSpineFxSkeletonDataLoading = false;
                this._freezeSpineFxSkeletonDataCallbacks = [];
                throw err;
            });
        },

        getFreezeSpineFxLayout(parent: Node): { x: number; y: number; scale: number } {
            const transform = parent.getComponent(UITransform);
            if (!transform) {
                throw createFreezeSpineFxError(`${FREEZE_SPINE_FX_LAYER_NAME} is missing UITransform`);
            }
            const width = Number(transform.contentSize.width);
            const height = Number(transform.contentSize.height);
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
                throw createFreezeSpineFxError(`${FREEZE_SPINE_FX_LAYER_NAME} has invalid size: width=${String(transform.contentSize.width)}, height=${String(transform.contentSize.height)}`);
            }
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
                throw createFreezeSpineFxError('active freeze Spine node is missing SkeletonData');
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
                completeOnce();
                throw createFreezeSpineFxError(`end animation failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        },

        playFreezeSpineFx(): void {
            this.ensureFreezeSpineFxSkeletonData((skeletonData: sp.SkeletonData) => {
                if (this.isGameEnd || Math.max(0, Number(this._freezeTimeLeft) || 0) <= 0) return;
                const skeletonCtor = (sp as any)?.Skeleton;
                if (!skeletonCtor) {
                    throw createFreezeSpineFxError('Spine component is disabled or unavailable');
                }
                const fxRoot = typeof this.requireCanvasUiRoot === 'function'
                    ? this.requireCanvasUiRoot('FxRoot')
                    : null;
                if (!fxRoot?.isValid) {
                    throw createFreezeSpineFxError('FxRoot unavailable');
                }
                const fxLayer = fxRoot.getChildByName(FREEZE_SPINE_FX_LAYER_NAME);
                if (!fxLayer?.isValid) {
                    throw createFreezeSpineFxError(`${FREEZE_SPINE_FX_LAYER_NAME} unavailable`);
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
                    if ((node as any).__freezeSpineFxSeq === seq) {
                        this._freezeSpineFxNode = null;
                    }
                    this.destroyFreezeSpineFxNode(node);
                    throw createFreezeSpineFxError(`play failed: ${err instanceof Error ? err.message : String(err)}`);
                }
            });
        },
    });
}
