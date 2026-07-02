import {
    assetManager,
    AudioMgr,
    Bundle,
    GAME_ASSETS_BUNDLE_NAME,
    Layers,
    Node,
    sp,
    UIOpacity,
    UITransform,
    Vec3,
    view,
} from '../GameCtrlShared';

const PINDD_SPINE_FX_PATH = 'Spine/PinddFx/zhuanshi';
const SPINE_WASM_SUBPACKAGE_NAME = 'spineWasm';
const PINDD_SPINE_FX_NODE_NAME = 'PinddSpineFx';
const PINDD_SPINE_PATTERN_COMPLETE_ROOT_NAME = 'PatternCompleteMatchFxRoot';
const PINDD_SPINE_FX_SOURCE_HEIGHT = 43.27;
const PINDD_SPINE_FX_SCALE = 1;
const PINDD_SPINE_FX_ACTIVE_LIMIT = 6144;
const PINDD_SPINE_FX_POOL_LIMIT = 160;
const PINDD_SPINE_FX_BATCH_CONCURRENCY = 24;
const PINDD_SPINE_FX_BATCH_RETRY_SECONDS = 0.033;
const PINDD_SPINE_FX_BATCH_ACTIVE_LIMIT_RETRY_SECONDS = 0.033;
const PINDD_SPINE_FX_ANIMATION = {
    settle: 'a1_1',
    colorComplete: 'b1_1',
    patternComplete: 'c1_1',
} as const;
const PINDD_SPINE_FX_DURATION: Record<PinddSpineFxAnimationName, number> = {
    a1_1: 0.7,
    b1_1: 0.8333,
    c1_1: 0.6667,
};

type PinddSpineFxAnimationName = typeof PINDD_SPINE_FX_ANIMATION[keyof typeof PINDD_SPINE_FX_ANIMATION];
type PinddSpineFxPlayOptions = {
    retryOnActiveLimit?: boolean;
    batchSeq?: number;
};
type PinddSpineFxBatchOptions = {
    maxNodes?: number;
    maxWaitSeconds?: number;
    waitForAll?: boolean;
};

const PINDD_SPINE_FX_SCALE_BY_ANIMATION: Record<PinddSpineFxAnimationName, number> = {
    a1_1: 1,
    b1_1: 1,
    c1_1: 1,
};
const PINDD_SPINE_FX_OPACITY_BY_ANIMATION: Record<PinddSpineFxAnimationName, number> = {
    a1_1: 230,
    b1_1: 245,
    c1_1: 255,
};

function setFxLayerDeep(node: Node, layer: number): void {
    node.layer = layer;
    for (const child of node.children) {
        setFxLayerDeep(child, layer);
    }
}

function createPinddSpineFxError(message: string): Error {
    return new Error(`[pindd-spine-fx] ${message}`);
}

function createPinddSpineWasmError(err: unknown): Error {
    const message = err instanceof Error ? err.message : String(err || 'unknown error');
    return createPinddSpineFxError(`Spine wasm load failed: ${message}`);
}

function ensurePinddSpineWasmSubpackageReady(): Promise<void> {
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
        return Promise.reject(createPinddSpineFxError(`${SPINE_WASM_SUBPACKAGE_NAME} subpackage loader unavailable`));
    }
    globalScope.__PDD_SPINE_WASM_SUBPACKAGE_PROMISE__ = new Promise<void>((resolve, reject) => {
        wxApi.loadSubpackage({
            name: SPINE_WASM_SUBPACKAGE_NAME,
            success: () => resolve(),
            fail: (err: unknown) => reject(createPinddSpineFxError(`${SPINE_WASM_SUBPACKAGE_NAME} subpackage load failed: ${err instanceof Error ? err.message : String(err || 'unknown error')}`)),
        });
    });
    return globalScope.__PDD_SPINE_WASM_SUBPACKAGE_PROMISE__;
}

function ensurePinddSpineWasmReady(): Promise<void> {
    return ensurePinddSpineWasmSubpackageReady().then(() => {
        const loadWasm = (sp as any)?.loadWasmModuleSpine;
        if (typeof loadWasm !== 'function') {
            return Promise.resolve();
        }
        try {
            return Promise.resolve(loadWasm.call(sp)).then(() => undefined, (err: unknown) => {
                throw createPinddSpineWasmError(err);
            });
        } catch (err) {
            return Promise.reject(createPinddSpineWasmError(err));
        }
    });
}

function selectPinddSpineFxBatchNodes(nodes: Node[], maxNodes?: number): Node[] {
    const safeNodes = (nodes || []).filter((node) => node?.isValid);
    const limit = Math.floor(Number(maxNodes) || 0);
    if (limit <= 0 || safeNodes.length <= limit) {
        return safeNodes;
    }
    if (limit === 1) {
        return [safeNodes[Math.floor(safeNodes.length / 2)]].filter((node) => node?.isValid);
    }
    const selected: Node[] = [];
    const selectedSet = new Set<Node>();
    const step = (safeNodes.length - 1) / (limit - 1);
    for (let i = 0; i < limit; i++) {
        const node = safeNodes[Math.round(i * step)];
        if (node?.isValid && !selectedSet.has(node)) {
            selected.push(node);
            selectedSet.add(node);
        }
    }
    for (const node of safeNodes) {
        if (selected.length >= limit) break;
        if (selectedSet.has(node)) continue;
        selected.push(node);
        selectedSet.add(node);
    }
    return selected;
}

export function installGameplayColorCompleteFxMethods(target: any): void {
    Object.assign(target, {
        ensurePinddSpineFxSkeletonData(onDone: (data: sp.SkeletonData) => void): void {
            const isRuntimeAlive = () => !!(this._isRuntimeAliveForAsyncCallback?.() ?? this.isValid);
            const skeletonDataCtor = (sp as any)?.SkeletonData;
            if (!skeletonDataCtor) {
                throw createPinddSpineFxError('Spine module is disabled or unavailable');
            }
            if (this._pinddSpineFxSkeletonData) {
                onDone(this._pinddSpineFxSkeletonData);
                return;
            }
            if (this._pinddSpineFxSkeletonDataLoading) {
                this._pinddSpineFxSkeletonDataCallbacks.push(onDone);
                return;
            }

            this._pinddSpineFxSkeletonDataLoading = true;
            this._pinddSpineFxSkeletonDataCallbacks = [onDone];
            const finish = (data: sp.SkeletonData) => {
                if (!isRuntimeAlive()) return;
                this._pinddSpineFxSkeletonDataLoading = false;
                this._pinddSpineFxSkeletonData = data;
                const callbacks = this._pinddSpineFxSkeletonDataCallbacks || [];
                this._pinddSpineFxSkeletonDataCallbacks = [];
                for (const cb of callbacks) cb(data);
            };
            const loadFromBundle = (bundle: Bundle | null) => {
                if (!bundle) {
                    this._pinddSpineFxSkeletonDataLoading = false;
                    this._pinddSpineFxSkeletonDataCallbacks = [];
                    throw createPinddSpineFxError('gameAssets bundle unavailable');
                    return;
                }
                bundle.load(PINDD_SPINE_FX_PATH, skeletonDataCtor, (err: Error | null, data: sp.SkeletonData | null) => {
                    if (err || !data) {
                        this._pinddSpineFxSkeletonDataLoading = false;
                        this._pinddSpineFxSkeletonDataCallbacks = [];
                        throw createPinddSpineFxError(`missing required SkeletonData ${PINDD_SPINE_FX_PATH}: ${err?.message || 'asset missing'}`);
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
                        this._pinddSpineFxSkeletonDataLoading = false;
                        this._pinddSpineFxSkeletonDataCallbacks = [];
                        throw createPinddSpineFxError(`gameAssets bundle unavailable: ${err?.message || 'missing bundle'}`);
                        return;
                    }
                    this.gameAssetsBundle = bundle;
                    loadFromBundle(bundle);
                });
            };

            ensurePinddSpineWasmReady().then(() => {
                if (!isRuntimeAlive()) return;
                loadSkeletonData();
            }).catch((err: Error) => {
                if (!isRuntimeAlive()) return;
                this._pinddSpineFxSkeletonDataLoading = false;
                this._pinddSpineFxSkeletonDataCallbacks = [];
                throw err;
            });
        },

        acquirePinddSpineFxNode(): { node: Node; skeleton: sp.Skeleton } {
            const skeletonCtor = (sp as any)?.Skeleton;
            if (!skeletonCtor) {
                throw createPinddSpineFxError('Spine component is disabled or unavailable');
            }
            if ((Number(this._pinddSpineFxActiveCount) || 0) >= PINDD_SPINE_FX_ACTIVE_LIMIT) {
                throw createPinddSpineFxError(`active effect limit exceeded: ${PINDD_SPINE_FX_ACTIVE_LIMIT}`);
            }
            const pool = this._pinddSpineFxPool;
            const node = pool?.get?.() ?? new Node(PINDD_SPINE_FX_NODE_NAME);
            node.name = PINDD_SPINE_FX_NODE_NAME;
            node.layer = Layers.Enum.UI_2D;
            node.active = true;
            node.setPosition(0, 0, 0);
            node.setScale(1, 1, 1);
            node.angle = 0;
            const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
            transform.setContentSize(PINDD_SPINE_FX_SOURCE_HEIGHT, PINDD_SPINE_FX_SOURCE_HEIGHT);
            const opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
            opacity.opacity = 255;

            const skeleton = (node.getComponent(skeletonCtor) || node.addComponent(skeletonCtor)) as sp.Skeleton;
            skeleton.enabled = true;
            skeleton.premultipliedAlpha = false;
            skeleton.enableBatch = true;
            this._pinddSpineFxActiveCount = (Number(this._pinddSpineFxActiveCount) || 0) + 1;
            if (!Array.isArray(this._activePinddSpineFxNodes)) this._activePinddSpineFxNodes = [];
            this._activePinddSpineFxNodes.push(node);
            return { node, skeleton };
        },

        recyclePinddSpineFxNode(node: Node): void {
            if (!node?.isValid) return;
            const skeletonCtor = (sp as any)?.Skeleton;
            const skeleton = skeletonCtor ? node.getComponent(skeletonCtor) as sp.Skeleton | null : null;
            if (skeleton) {
                skeleton.setCompleteListener(() => {});
                skeleton.clearTracks();
                skeleton.skeletonData = null;
                skeleton.enabled = false;
            }
            (node as any).__pinddSpineFxSeq = ((node as any).__pinddSpineFxSeq || 0) + 1;
            node.removeFromParent();
            node.active = false;
            node.setScale(1, 1, 1);
            const opacity = node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = 255;
            this._pinddSpineFxActiveCount = Math.max(0, (Number(this._pinddSpineFxActiveCount) || 0) - 1);
            if (Array.isArray(this._activePinddSpineFxNodes)) {
                this._activePinddSpineFxNodes = this._activePinddSpineFxNodes.filter((activeNode: Node) => activeNode?.isValid && activeNode !== node);
            }
            const pool = this._pinddSpineFxPool;
            if (!pool?.put || (typeof this.getNodePoolSize === 'function' && this.getNodePoolSize(pool) >= PINDD_SPINE_FX_POOL_LIMIT)) {
                node.destroy();
                return;
            }
            pool.put(node);
        },

        clearPinddSpineFx(): void {
            this._pinddSpineFxBatchSeq = (Number(this._pinddSpineFxBatchSeq) || 0) + 1;
            this._pinddSpineFxReservedCount = 0;
            const skeletonCtor = (sp as any)?.Skeleton;
            const activeNodes: Node[] = Array.isArray(this._activePinddSpineFxNodes) ? this._activePinddSpineFxNodes : [];
            for (const node of activeNodes) {
                if (!node?.isValid) continue;
                const skeleton = skeletonCtor ? node.getComponent(skeletonCtor) as sp.Skeleton | null : null;
                if (skeleton) {
                    skeleton.setCompleteListener(() => {});
                    skeleton.clearTracks();
                    skeleton.skeletonData = null;
                }
                node.removeFromParent();
                node.destroy();
            }
            activeNodes.length = 0;
            this._activePinddSpineFxNodes = activeNodes;
            this._pinddSpineFxActiveCount = 0;
            const pool = this._pinddSpineFxPool;
            if (pool?.clear) pool.clear();
        },

        getPinddSpineFxScaleForBean(beanNode: Node, animationName?: PinddSpineFxAnimationName): number {
            const beanTransform = beanNode.getComponent(UITransform);
            if (!beanTransform) {
                throw createPinddSpineFxError(`bean node is missing UITransform: ${beanNode.name}`);
            }
            const beanSize = Math.max(1, Math.min(
                Number(beanTransform.contentSize.width),
                Number(beanTransform.contentSize.height),
            ));
            const slotSize = Number(this.getBoardSlotVisualSize?.() || this.cellSize || 0);
            if (!Number.isFinite(slotSize) || slotSize <= 0) {
                throw createPinddSpineFxError('board slot visual size is unavailable');
            }
            const targetSize = Math.max(slotSize, beanSize);
            const animationScale = animationName ? (PINDD_SPINE_FX_SCALE_BY_ANIMATION[animationName] || 1) : 1;
            return Math.max(0.01, (targetSize * PINDD_SPINE_FX_SCALE * animationScale) / PINDD_SPINE_FX_SOURCE_HEIGHT);
        },

        playPinddSpineFxOnBean(
            beanNode: Node,
            animationName: PinddSpineFxAnimationName,
            onDone?: () => void,
            options?: PinddSpineFxPlayOptions,
        ): void {
            if (!beanNode?.isValid) {
                if (typeof onDone === 'function') onDone();
                return;
            }
            const retryOnActiveLimit = options?.retryOnActiveLimit === true;
            const batchSeq = Number(options?.batchSeq);
            const isBatchStillCurrent = () => !retryOnActiveLimit
                || !Number.isFinite(batchSeq)
                || this._pinddSpineFxBatchSeq === batchSeq;
            const retryLater = () => {
                if (!isBatchStillCurrent()) return;
                if (typeof this.scheduleOnce === 'function') {
                    this.scheduleOnce(tryPlay, PINDD_SPINE_FX_BATCH_ACTIVE_LIMIT_RETRY_SECONDS);
                    return;
                }
                setTimeout(tryPlay, PINDD_SPINE_FX_BATCH_ACTIVE_LIMIT_RETRY_SECONDS * 1000);
            };
            const tryPlay = () => this.ensurePinddSpineFxSkeletonData((skeletonData: sp.SkeletonData) => {
                if (!isBatchStillCurrent()) return;
                if (!beanNode?.isValid) {
                    if (typeof onDone === 'function') onDone();
                    return;
                }
                if ((Number(this._pinddSpineFxActiveCount) || 0) >= PINDD_SPINE_FX_ACTIVE_LIMIT) {
                    if (retryOnActiveLimit) {
                        retryLater();
                    } else if (typeof onDone === 'function') {
                        onDone();
                    }
                    return;
                }
                const acquired = this.acquirePinddSpineFxNode();
                const { node, skeleton } = acquired;
                const seq = ((node as any).__pinddSpineFxSeq || 0) + 1;
                (node as any).__pinddSpineFxSeq = seq;
                beanNode.addChild(node);
                setFxLayerDeep(node, Layers.Enum.UI_2D);
                node.setPosition(0, 0, 0);
                const scale = this.getPinddSpineFxScaleForBean(beanNode, animationName);
                node.setScale(scale, scale, 1);
                const opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
                opacity.opacity = PINDD_SPINE_FX_OPACITY_BY_ANIMATION[animationName] ?? 255;

                let completed = false;
                const completeOnce = () => {
                    if (completed || !node?.isValid || (node as any).__pinddSpineFxSeq !== seq) return;
                    completed = true;
                    this.recyclePinddSpineFxNode(node);
                    if (typeof onDone === 'function') onDone();
                };
                try {
                    skeleton.skeletonData = skeletonData;
                    skeleton.setCompleteListener(() => {
                        completeOnce();
                    });
                    skeleton.setAnimation(0, animationName, false);
                    this.scheduleOnce(completeOnce, (PINDD_SPINE_FX_DURATION[animationName] || 0.8) + 0.12);
                } catch (err) {
                    this.recyclePinddSpineFxNode(node);
                    throw createPinddSpineFxError(`play failed for ${animationName}: ${err instanceof Error ? err.message : String(err)}`);
                }
            });
            tryPlay();
        },

        playPinddSpineFxOnBeans(
            beanNodes: Node[],
            animationName: PinddSpineFxAnimationName,
            onDone?: () => void,
            options: PinddSpineFxBatchOptions = {},
        ): void {
            const nodes = selectPinddSpineFxBatchNodes(beanNodes, options.maxNodes);
            const total = nodes.length;
            if (total === 0) {
                onDone?.();
                return;
            }
            const seq = (Number(this._pinddSpineFxBatchSeq) || 0) + 1;
            this._pinddSpineFxBatchSeq = seq;
            this._pinddSpineFxReservedCount = 0;
            let nextIndex = 0;
            let running = 0;
            let completed = 0;
            let done = false;
            let pumpBatch: () => void = () => {};
            const finishBatchForTimeout = () => {
                if (done || this._pinddSpineFxBatchSeq !== seq) return;
                done = true;
                this._pinddSpineFxBatchSeq = seq + 1;
                this._pinddSpineFxReservedCount = 0;
                onDone?.();
            };
            if (options.waitForAll === false) {
                const maxWaitSeconds = Math.max(0, Number(options.maxWaitSeconds) || 0);
                if (maxWaitSeconds > 0) {
                    if (typeof this.scheduleOnce === 'function') {
                        this.scheduleOnce(finishBatchForTimeout, maxWaitSeconds);
                    } else {
                        setTimeout(finishBatchForTimeout, maxWaitSeconds * 1000);
                    }
                }
            }
            const finishOne = () => {
                if (done || this._pinddSpineFxBatchSeq !== seq) return;
                running = Math.max(0, running - 1);
                this._pinddSpineFxReservedCount = Math.max(0, (Number(this._pinddSpineFxReservedCount) || 0) - 1);
                completed++;
                if (completed >= total) {
                    done = true;
                    onDone?.();
                    return;
                }
                pumpBatch();
            };
            const finishSkipped = () => {
                if (done || this._pinddSpineFxBatchSeq !== seq) return;
                completed++;
                if (completed >= total) {
                    done = true;
                    onDone?.();
                    return;
                }
                pumpBatch();
            };
            const schedulePump = () => {
                if (done || this._pinddSpineFxBatchSeq !== seq) return;
                if (typeof this.scheduleOnce === 'function') {
                    this.scheduleOnce(pumpBatch, PINDD_SPINE_FX_BATCH_RETRY_SECONDS);
                    return;
                }
                setTimeout(pumpBatch, PINDD_SPINE_FX_BATCH_RETRY_SECONDS * 1000);
            };
            const launchOne = (beanNode: Node) => {
                running++;
                this._pinddSpineFxReservedCount = (Number(this._pinddSpineFxReservedCount) || 0) + 1;
                try {
                    this.playPinddSpineFxOnBean(beanNode, animationName, finishOne, {
                        retryOnActiveLimit: true,
                        batchSeq: seq,
                    });
                } catch (error) {
                    running = Math.max(0, running - 1);
                    this._pinddSpineFxReservedCount = Math.max(0, (Number(this._pinddSpineFxReservedCount) || 0) - 1);
                    done = true;
                    throw error;
                }
            };
            pumpBatch = () => {
                if (done || this._pinddSpineFxBatchSeq !== seq) return;
                const activeCount = Number(this._pinddSpineFxActiveCount) || 0;
                const reservedCount = Number(this._pinddSpineFxReservedCount) || 0;
                const availableByActiveLimit = Math.max(0, PINDD_SPINE_FX_ACTIVE_LIMIT - activeCount - reservedCount);
                const availableByBatchLimit = Math.max(0, PINDD_SPINE_FX_BATCH_CONCURRENCY - running);
                const launchCount = Math.min(availableByActiveLimit, availableByBatchLimit, total - nextIndex);
                if (launchCount <= 0) {
                    schedulePump();
                    return;
                }
                for (let i = 0; i < launchCount; i++) {
                    const beanNode = nodes[nextIndex++];
                    if (!beanNode?.isValid) {
                        finishSkipped();
                        continue;
                    }
                    launchOne(beanNode);
                }
                if (nextIndex < total && running < PINDD_SPINE_FX_BATCH_CONCURRENCY) {
                    schedulePump();
                }
            };
            pumpBatch();
        },

        playPinddSpineFxOnBeansSameFrame(
            beanNodes: Node[],
            animationName: PinddSpineFxAnimationName,
            onDone?: () => void,
        ): void {
            const nodes = (beanNodes || []).filter((node) => node?.isValid);
            const total = nodes.length;
            if (total === 0) {
                onDone?.();
                return;
            }
            this.ensurePinddSpineFxSkeletonData(() => {
                let remaining = total;
                let done = false;
                const finishOne = () => {
                    if (done) return;
                    remaining--;
                    if (remaining <= 0) {
                        done = true;
                        onDone?.();
                    }
                };
                for (const beanNode of nodes) {
                    this.playPinddSpineFxOnBean(beanNode, animationName, finishOne);
                }
            });
        },

        getPatternCompleteMatchFxRoot(): Node {
            const fxRoot = typeof this.requireCanvasUiRoot === 'function'
                ? this.requireCanvasUiRoot('FxRoot')
                : null;
            if (!fxRoot?.isValid) {
                throw createPinddSpineFxError('FxRoot unavailable for pattern-complete effect');
            }
            let root = this._patternCompleteMatchFxRoot;
            if (!root?.isValid || root.parent !== fxRoot) {
                root = fxRoot.getChildByName(PINDD_SPINE_PATTERN_COMPLETE_ROOT_NAME) || new Node(PINDD_SPINE_PATTERN_COMPLETE_ROOT_NAME);
                if (!root.parent) fxRoot.addChild(root);
                this._patternCompleteMatchFxRoot = root;
            }
            root.active = true;
            root.layer = Layers.Enum.UI_2D;
            root.setPosition(0, 0, 0);
            root.setScale(1, 1, 1);
            root.angle = 0;
            const transform = root.getComponent(UITransform) || root.addComponent(UITransform);
            const parentTransform = fxRoot.getComponent(UITransform);
            const fallbackSize = view.getVisibleSize();
            transform.setContentSize(
                Math.max(1, Number(parentTransform?.contentSize.width || fallbackSize.width || 1)),
                Math.max(1, Number(parentTransform?.contentSize.height || fallbackSize.height || 1)),
            );
            setFxLayerDeep(root, Layers.Enum.UI_2D);
            root.setSiblingIndex(Math.max(0, fxRoot.children.length - 1));
            return root;
        },

        playPinddSpineFxAtWorldPosition(
            fxRoot: Node,
            fxRootTransform: UITransform,
            skeletonData: sp.SkeletonData,
            worldPos: Vec3,
            animationName: PinddSpineFxAnimationName,
            onDone?: () => void,
        ): void {
            if (!fxRoot?.isValid || !fxRootTransform || !worldPos) {
                onDone?.();
                return;
            }
            const acquired = this.acquirePinddSpineFxNode();
            const { node, skeleton } = acquired;
            const seq = ((node as any).__pinddSpineFxSeq || 0) + 1;
            (node as any).__pinddSpineFxSeq = seq;
            fxRoot.addChild(node);
            setFxLayerDeep(node, Layers.Enum.UI_2D);
            const localPos = fxRootTransform.convertToNodeSpaceAR(worldPos);
            node.setPosition(localPos.x - 1, localPos.y - 1, 0);
            node.setScale(1, 1, 1);
            const opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
            opacity.opacity = 255;

            let completed = false;
            const completeOnce = () => {
                if (completed || !node?.isValid || (node as any).__pinddSpineFxSeq !== seq) return;
                completed = true;
                this.recyclePinddSpineFxNode(node);
                onDone?.();
            };
            try {
                skeleton.skeletonData = skeletonData;
                skeleton.setCompleteListener(() => {
                    completeOnce();
                });
                skeleton.setAnimation(0, animationName, false);
                if (typeof this.scheduleOnce === 'function') {
                    this.scheduleOnce(completeOnce, (PINDD_SPINE_FX_DURATION[animationName] || 0.8) + 0.12);
                } else {
                    setTimeout(completeOnce, ((PINDD_SPINE_FX_DURATION[animationName] || 0.8) + 0.12) * 1000);
                }
            } catch (err) {
                this.recyclePinddSpineFxNode(node);
                throw createPinddSpineFxError(`play failed for ${animationName}: ${err instanceof Error ? err.message : String(err)}`);
            }
        },

        clearPatternCompleteMatchFx(): void {
            this._pinddSpineFxBatchSeq = (Number(this._pinddSpineFxBatchSeq) || 0) + 1;
            this._pinddSpineFxReservedCount = 0;
            const activeNodes: Node[] = Array.isArray(this._activePinddSpineFxNodes) ? [...this._activePinddSpineFxNodes] : [];
            for (const node of activeNodes) {
                if (node?.isValid) this.recyclePinddSpineFxNode(node);
            }
            const root = this._patternCompleteMatchFxRoot;
            if (!root?.isValid) {
                this._patternCompleteMatchFxRoot = null;
                return;
            }
            for (const child of [...root.children]) {
                child.removeFromParent();
                child.destroy();
            }
        },

        clearBeanSettleMatchFx(): void {
            this.clearPinddSpineFx?.();
        },

        playBeanSettleMatchFxOnBean(beanNode: Node): void {
            if (!beanNode?.isValid) return;
            if (beanNode.getChildByName(PINDD_SPINE_FX_NODE_NAME)) return;
            this.playPinddSpineFxOnBean(beanNode, PINDD_SPINE_FX_ANIMATION.settle);
        },

        playBeanSettleMatchFxOnCell(row: number, col: number): void {
            if (this.boardModel && !this.boardModel.locked?.[row]?.[col]) return;
            const beanNode = this.cellNodes[row]?.[col];
            if (!beanNode?.isValid) return;
            this.playBeanSettleMatchFxOnBean(beanNode);
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

            this.playPinddSpineFxOnBeansSameFrame(beanNodes, PINDD_SPINE_FX_ANIMATION.colorComplete);
        },

        collectPatternCompleteMatchBeanNodes(): Node[] {
            const bm = this.boardModel;
            const bw = this.levelData?.boardWidth || bm?.width || 0;
            const bh = this.levelData?.boardHeight || bm?.height || 0;
            const beanNodes: Node[] = [];
            for (let r = 0; r < bh; r++) {
                for (let c = 0; c < bw; c++) {
                    if (bm.correctColors[r]?.[c] <= 0) continue;
                    if (!bm.locked[r]?.[c]) continue;
                    const beanNode = this.cellNodes[r]?.[c];
                    if (beanNode?.isValid) beanNodes.push(beanNode);
                }
            }
            return beanNodes;
        },

        playPatternCompleteMatchFx(onDone?: () => void): void {
            const finish = () => {
                if (typeof onDone === 'function') onDone();
            };
            const boardNode = this.boardNode?.isValid ? this.boardNode : null;
            if (!boardNode) {
                finish();
                return;
            }
            const beanNodes = this.collectPatternCompleteMatchBeanNodes();
            const beanWorldPositions: Vec3[] = [];
            for (const beanNode of beanNodes) {
                const transform = beanNode.getComponent(UITransform);
                if (!transform) continue;
                beanWorldPositions.push(transform.convertToWorldSpaceAR(new Vec3(0, 0, 0)));
            }
            if (beanWorldPositions.length === 0) {
                finish();
                return;
            }
            if (beanWorldPositions.length > PINDD_SPINE_FX_ACTIVE_LIMIT) {
                throw createPinddSpineFxError(`pattern-complete effect requires ${beanWorldPositions.length} nodes, active limit is ${PINDD_SPINE_FX_ACTIVE_LIMIT}`);
            }
            this.clearPatternCompleteMatchFx();
            const fxRoot = this.getPatternCompleteMatchFxRoot();
            const fxRootTransform = fxRoot.getComponent(UITransform);
            if (!fxRootTransform) {
                throw createPinddSpineFxError('PatternCompleteMatchFxRoot is missing UITransform');
            }
            this.ensurePinddSpineFxSkeletonData((skeletonData: sp.SkeletonData) => {
                if (!fxRoot?.isValid || !this.isValid) {
                    finish();
                    return;
                }
                let remaining = beanWorldPositions.length;
                let done = false;
                const finishOne = () => {
                    if (done) return;
                    remaining--;
                    if (remaining <= 0) {
                        done = true;
                        finish();
                    }
                };
                for (const worldPos of beanWorldPositions) {
                    this.playPinddSpineFxAtWorldPosition(
                        fxRoot,
                        fxRootTransform,
                        skeletonData,
                        worldPos,
                        PINDD_SPINE_FX_ANIMATION.patternComplete,
                        finishOne,
                    );
                }
            });
        },

        enqueueColorCompleteEffect(colorId: number, playSound: boolean = true): void {
            if (!this._pendingColorCompleteEffects || !(this._pendingColorCompleteEffects instanceof Map)) {
                this._pendingColorCompleteEffects = new Map<number, boolean>();
            }
            const prev = this._pendingColorCompleteEffects.get(colorId) || false;
            this._pendingColorCompleteEffects.set(colorId, prev || playSound);
        },

        flushPendingColorCompleteEffects(delaySeconds: number = 0): void {
            const pending = this._pendingColorCompleteEffects;
            if (!pending || !(pending instanceof Map) || pending.size === 0) return;
            const entries = Array.from(pending.entries());
            pending.clear();
            const play = () => {
                for (const [colorId, playSound] of entries) {
                    this.playColorCompleteEffect(colorId, playSound);
                }
            };
            const delay = Math.max(0, Number(delaySeconds) || 0);
            if (delay > 0 && typeof this.scheduleOnce === 'function') {
                this.scheduleOnce(play, delay);
            } else {
                play();
            }
        },

        playColorCompleteEffect(colorId: number, playSound: boolean = true) {
            if (playSound) AudioMgr.inst.play('winColor');
            this.playColorCompleteMatchFxForColor(colorId);
        },
    });
}
