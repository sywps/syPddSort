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
} from '../GameCtrlShared';

const PINDD_SPINE_FX_PATH = 'Spine/PinddFx/zhuanshi';
const PINDD_SPINE_FX_NODE_NAME = 'PinddSpineFx';
const PINDD_SPINE_FX_SOURCE_HEIGHT = 43.27;
const PINDD_SPINE_FX_SCALE = 1;
const PINDD_SPINE_FX_ACTIVE_LIMIT = 80;
const PINDD_SPINE_FX_POOL_LIMIT = 96;
const PINDD_SPINE_FX_BATCH_CONCURRENCY = 24;
const PINDD_SPINE_FX_BATCH_RETRY_SECONDS = 0.033;
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

const PINDD_SPINE_FX_SCALE_BY_ANIMATION: Record<PinddSpineFxAnimationName, number> = {
    a1_1: 1,
    b1_1: 1,
    c1_1: 0.92,
};
const PINDD_SPINE_FX_OPACITY_BY_ANIMATION: Record<PinddSpineFxAnimationName, number> = {
    a1_1: 230,
    b1_1: 245,
    c1_1: 215,
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
        ): void {
            if (!beanNode?.isValid) {
                if (typeof onDone === 'function') onDone();
                return;
            }
            this.ensurePinddSpineFxSkeletonData((skeletonData: sp.SkeletonData) => {
                if (!beanNode?.isValid) {
                    if (typeof onDone === 'function') onDone();
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
        },

        playPinddSpineFxOnBeans(
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
            const seq = Number(this._pinddSpineFxBatchSeq) || 0;
            let nextIndex = 0;
            let running = 0;
            let completed = 0;
            let done = false;
            let pumpBatch: () => void = () => {};
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
                    this.playPinddSpineFxOnBean(beanNode, animationName, finishOne);
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

        clearPatternCompleteMatchFx(): void {
            this._patternCompleteMatchFxRoot = null;
            this.clearPinddSpineFx?.();
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

            this.playPinddSpineFxOnBeans(beanNodes, PINDD_SPINE_FX_ANIMATION.colorComplete);
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
            if (beanNodes.length === 0) {
                finish();
                return;
            }
            this.clearPatternCompleteMatchFx();
            this.playPinddSpineFxOnBeans(beanNodes, PINDD_SPINE_FX_ANIMATION.patternComplete, finish);
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
