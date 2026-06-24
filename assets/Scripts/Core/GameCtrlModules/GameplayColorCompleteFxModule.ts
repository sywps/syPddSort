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
const PINDD_SPINE_FX_UUID = 'ebc7075d-a1ec-459b-a209-1b510525f23c';
const PINDD_SPINE_FX_NODE_NAME = 'PinddSpineFx';
const PINDD_SPINE_FX_SOURCE_HEIGHT = 43.27;
const PINDD_SPINE_FX_SCALE = 1;
const PINDD_SPINE_FX_ACTIVE_LIMIT = 80;
const PINDD_SPINE_FX_POOL_LIMIT = 96;
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

export function installGameplayColorCompleteFxMethods(target: any): void {
    Object.assign(target, {
        warnPinddSpineFxLoadFailure(message: string): void {
            if (this._pinddSpineFxLoadWarned) return;
            this._pinddSpineFxLoadWarned = true;
            console.error(`[pindd-spine-fx] load skipped: ${message}`);
        },

        warnPinddSpineFxPlayFailure(message: string): void {
            if (this._pinddSpineFxPlayWarned) return;
            this._pinddSpineFxPlayWarned = true;
            console.error(`[pindd-spine-fx] play skipped: ${message}`);
        },

        ensurePinddSpineFxSkeletonData(onDone: (data: sp.SkeletonData | null) => void): void {
            const isRuntimeAlive = () => !!(this._isRuntimeAliveForAsyncCallback?.() ?? this.isValid);
            const skeletonDataCtor = (sp as any)?.SkeletonData;
            if (!skeletonDataCtor) {
                this.warnPinddSpineFxLoadFailure('Spine module is disabled or unavailable');
                onDone(null);
                return;
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
            const finish = (data: sp.SkeletonData | null) => {
                if (!isRuntimeAlive()) return;
                this._pinddSpineFxSkeletonDataLoading = false;
                if (data) this._pinddSpineFxSkeletonData = data;
                const callbacks = this._pinddSpineFxSkeletonDataCallbacks || [];
                this._pinddSpineFxSkeletonDataCallbacks = [];
                for (const cb of callbacks) cb(data);
            };
            const loadFromBundle = (bundle: Bundle | null) => {
                const loadByUuid = () => {
                    const loadAny = (assetManager as any)?.loadAny;
                    if (typeof loadAny !== 'function') {
                        this.warnPinddSpineFxLoadFailure('assetManager.loadAny unavailable');
                        finish(null);
                        return;
                    }
                    loadAny.call(assetManager, { uuid: PINDD_SPINE_FX_UUID, type: skeletonDataCtor }, (err: Error | null, data: sp.SkeletonData | null) => {
                        if (err || !data) {
                            this.warnPinddSpineFxLoadFailure(err?.message || 'SkeletonData missing');
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
                bundle.load(PINDD_SPINE_FX_PATH, skeletonDataCtor, (err: Error | null, data: sp.SkeletonData | null) => {
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
                    this.warnPinddSpineFxLoadFailure(err?.message || 'gameAssets bundle unavailable');
                    finish(null);
                    return;
                }
                this.gameAssetsBundle = bundle;
                loadFromBundle(bundle);
            });
        },

        acquirePinddSpineFxNode(): { node: Node; skeleton: sp.Skeleton } | null {
            const skeletonCtor = (sp as any)?.Skeleton;
            if (!skeletonCtor) {
                this.warnPinddSpineFxLoadFailure('Spine component is disabled or unavailable');
                return null;
            }
            if ((Number(this._pinddSpineFxActiveCount) || 0) >= PINDD_SPINE_FX_ACTIVE_LIMIT) return null;
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
            const fallbackBeanSize = Math.max(1, Number(this.getBoardBeanVisualSize?.() || 1));
            const beanSize = Math.max(1, Math.min(
                Number(beanTransform?.contentSize.width || fallbackBeanSize),
                Number(beanTransform?.contentSize.height || fallbackBeanSize),
            ));
            const slotSize = Math.max(1, Number(this.getBoardSlotVisualSize?.() || this.cellSize || 0));
            const targetSize = slotSize > 1 ? slotSize : beanSize;
            const animationScale = animationName ? (PINDD_SPINE_FX_SCALE_BY_ANIMATION[animationName] || 1) : 1;
            return Math.max(0.01, (targetSize * PINDD_SPINE_FX_SCALE * animationScale) / PINDD_SPINE_FX_SOURCE_HEIGHT);
        },

        playPinddSpineFxOnBean(
            beanNode: Node,
            animationName: PinddSpineFxAnimationName,
            onDone?: () => void,
        ): void {
            const finishWithoutFx = () => {
                if (typeof onDone === 'function') onDone();
            };
            if (!beanNode?.isValid) {
                finishWithoutFx();
                return;
            }
            this.ensurePinddSpineFxSkeletonData((skeletonData: sp.SkeletonData | null) => {
                if (!beanNode?.isValid) {
                    finishWithoutFx();
                    return;
                }
                if (!skeletonData) {
                    finishWithoutFx();
                    return;
                }
                const acquired = this.acquirePinddSpineFxNode();
                if (!acquired) {
                    finishWithoutFx();
                    return;
                }
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
                    this.warnPinddSpineFxPlayFailure(err instanceof Error ? err.message : String(err));
                    completeOnce();
                }
            });
        },

        playPinddSpineFxOnBeans(
            beanNodes: Node[],
            animationName: PinddSpineFxAnimationName,
            onDone?: () => void,
        ): void {
            const nodes = (beanNodes || []).filter((node) => node?.isValid);
            let remaining = nodes.length;
            if (remaining === 0) {
                onDone?.();
                return;
            }
            const finishOne = () => {
                remaining--;
                if (remaining <= 0) onDone?.();
            };
            for (const beanNode of nodes) {
                this.playPinddSpineFxOnBean(beanNode, animationName, finishOne);
            }
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
