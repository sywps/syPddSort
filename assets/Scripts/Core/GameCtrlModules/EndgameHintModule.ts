import {
    Color, Node, UITransform, UIOpacity, Prefab, instantiate, assetManager, GAME_ASSETS_BUNDLE_NAME, tween, Tween, Layers, Sprite, SpriteFrame, Vec3,
} from '../GameCtrlShared';

const ENDGAME_HINT_PREFAB_PATH = 'UI/Prefabs/Fx/EndgameHintCell';
const ENDGAME_HINT_THRESHOLD = 3;
const ENDGAME_HINT_POOL_LIMIT = 12;
const ENDGAME_BOARD_HINT_EXTRA_SIZE = 8;
const ENDGAME_HINT_STAR_FRAME_NAME = 'block_match-animation_16';
const ENDGAME_HINT_STAR_FRAME_PATH = `Textures/UI/${ENDGAME_HINT_STAR_FRAME_NAME}`;
const ENDGAME_HINT_STAR_VISIBLE_DURATION = 1.4;
const ENDGAME_HINT_STAR_MAX_OPACITY = 190;
const ENDGAME_HINT_STAR_MAX_SCALE = 1;
const ENDGAME_HINT_STAR_SPIN_DEGREES = 360;
const ENDGAME_HINT_STAR_LOOP_PAUSE = 0.3;

type EndgameHintTarget = {
    key: string;
    parent: Node;
    size: number;
};

function setLayerDeep(node: Node, layer: number): void {
    node.layer = layer;
    for (const child of node.children) {
        setLayerDeep(child, layer);
    }
}

function getNodeVisualCenterLocal(node: Node): Vec3 {
    const transform = node.getComponent(UITransform);
    if (!transform) return new Vec3(0, 0, 0);
    const anchor = transform.anchorPoint;
    return new Vec3(
        (0.5 - anchor.x) * transform.contentSize.width,
        (0.5 - anchor.y) * transform.contentSize.height,
        0,
    );
}

export function installEndgameHintModule(target: any): void {
    Object.assign(target, {
        collectEndgameBoardBeans(): Array<{ row: number; col: number; colorId: number }> {
            const cells: Array<{ row: number; col: number; colorId: number }> = [];
            const boardModel = this.boardModel;
            if (!boardModel) return cells;
            for (let r = 0; r < boardModel.height; r++) {
                for (let c = 0; c < boardModel.width; c++) {
                    const isPatternCell = (boardModel.correctColors[r]?.[c] || 0) > 0;
                    const colorId = boardModel.currentColors[r]?.[c] || 0;
                    if (!isPatternCell || colorId === 0 || boardModel.locked[r]?.[c]) continue;
                    cells.push({ row: r, col: c, colorId });
                }
            }
            return cells;
        },

        refreshEndgameHints(reason: string = 'state-change'): void {
            if (!this.boardModel || !this.cellNodes) return;
            if (this.isGameEnd || this._skillActive) {
                this.clearEndgameHints(false);
                return;
            }
            if (this.isSelected) return;
            if (this._flyingTargets && this._flyingTargets.size > 0) {
                this.clearEndgameHints(false);
                return;
            }

            const boardBeans = this.collectEndgameBoardBeans();
            if (boardBeans.length === 0 || boardBeans.length > ENDGAME_HINT_THRESHOLD) {
                this.clearEndgameHints(false);
                return;
            }

            this.ensureEndgameHintPrefab(() => {
                this.ensureEndgameHintStarFrames((frames: SpriteFrame[]) => {
                    if (!this.boardModel || this.isGameEnd || this._skillActive) return;
                    if (this.isSelected) return;
                    if (frames.length === 0) {
                        this.warnEndgameHintLoadFailure('star frames missing');
                        this.clearEndgameHints(false);
                        return;
                    }
                    const latestCells = this.collectEndgameBoardBeans();
                    if (latestCells.length === 0 || latestCells.length > ENDGAME_HINT_THRESHOLD) {
                        this.clearEndgameHints(false);
                        return;
                    }
                    this.showEndgameHints(latestCells, reason, frames);
                });
            });
        },

        ensureEndgameHintPrefab(onDone: () => void): void {
            const isRuntimeAlive = () => !!(this._isRuntimeAliveForAsyncCallback?.() ?? this.isValid);
            if (this._endgameHintPrefab) {
                onDone();
                return;
            }
            if (this._endgameHintPrefabLoading) {
                this._endgameHintPrefabCallbacks.push(onDone);
                return;
            }

            this._endgameHintPrefabLoading = true;
            this._endgameHintPrefabCallbacks = [onDone];
            const finish = (prefab: Prefab | null) => {
                if (!isRuntimeAlive()) return;
                this._endgameHintPrefabLoading = false;
                if (prefab) this._endgameHintPrefab = prefab;
                const callbacks = this._endgameHintPrefabCallbacks || [];
                this._endgameHintPrefabCallbacks = [];
                if (!prefab) return;
                for (const cb of callbacks) cb();
            };

            const loadFromBundle = (bundle: any) => {
                if (!bundle) {
                    this.warnEndgameHintLoadFailure('gameAssets bundle unavailable');
                    finish(null);
                    return;
                }
                bundle.load(ENDGAME_HINT_PREFAB_PATH, Prefab, (err: Error | null, prefab: Prefab | null) => {
                    if (err || !prefab) {
                        this.warnEndgameHintLoadFailure(err?.message || 'prefab missing');
                        finish(null);
                        return;
                    }
                    finish(prefab);
                });
            };

            if (this.gameAssetsBundle) {
                loadFromBundle(this.gameAssetsBundle);
                return;
            }
            assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
                if (!isRuntimeAlive()) return;
                if (err || !bundle) {
                    this.warnEndgameHintLoadFailure(err?.message || 'gameAssets bundle unavailable');
                    finish(null);
                    return;
                }
                this.gameAssetsBundle = bundle;
                loadFromBundle(bundle);
            });
        },

        warnEndgameHintLoadFailure(message: string): void {
            if (this._endgameHintLoadWarned) return;
            this._endgameHintLoadWarned = true;
            console.warn(`[endgame-hint] load skipped: ${message}`);
        },

        getEndgameHintStarFrames(): SpriteFrame[] {
            const frame = this.getSF(ENDGAME_HINT_STAR_FRAME_NAME);
            return frame ? [frame] : [];
        },

        ensureEndgameHintStarFrames(onDone: (frames: SpriteFrame[]) => void): void {
            const isRuntimeAlive = () => !!(this._isRuntimeAliveForAsyncCallback?.() ?? this.isValid);
            const cached = this.getEndgameHintStarFrames();
            if (cached.length > 0) {
                onDone(cached);
                return;
            }
            const loadFromBundle = (bundle: any) => {
                if (!bundle) {
                    this.warnEndgameHintLoadFailure('gameAssets bundle unavailable');
                    onDone([]);
                    return;
                }
                const candidates = [`${ENDGAME_HINT_STAR_FRAME_PATH}/spriteFrame`, ENDGAME_HINT_STAR_FRAME_PATH];
                const tryLoad = (index: number) => {
                    if (index >= candidates.length) {
                        this.warnEndgameHintLoadFailure(`${ENDGAME_HINT_STAR_FRAME_NAME} missing`);
                        onDone([]);
                        return;
                    }
                    bundle.load(candidates[index], SpriteFrame, (err: Error | null, frame: SpriteFrame | null) => {
                        if (!isRuntimeAlive()) return;
                        if (!err && frame) {
                            frame.name = ENDGAME_HINT_STAR_FRAME_NAME;
                            if (typeof this._cacheSpriteFrame === 'function') {
                                this._cacheSpriteFrame(frame, ENDGAME_HINT_STAR_FRAME_NAME);
                            } else {
                                this.sfCache.set(ENDGAME_HINT_STAR_FRAME_NAME, frame);
                            }
                            onDone([frame]);
                            return;
                        }
                        tryLoad(index + 1);
                    });
                };
                tryLoad(0);
            };
            if (this.gameAssetsBundle) {
                loadFromBundle(this.gameAssetsBundle);
                return;
            }
            assetManager.loadBundle(GAME_ASSETS_BUNDLE_NAME, (err, bundle) => {
                if (!isRuntimeAlive()) return;
                if (err || !bundle) {
                    this.warnEndgameHintLoadFailure(err?.message || 'gameAssets bundle unavailable');
                    onDone([]);
                    return;
                }
                this.gameAssetsBundle = bundle;
                loadFromBundle(bundle);
            });
        },

        showEndgameHints(cells: Array<{ row: number; col: number; colorId: number }>, reason: string, frames: SpriteFrame[]): void {
            void reason;
            const targets = this.buildEndgameHintTargets(cells);
            const existingNodes = Array.isArray(this._endgameHintNodes) ? this._endgameHintNodes : [];
            const reusableNodes = new Map<string, Node>();
            for (const node of existingNodes) {
                if (!node || !node.isValid) continue;
                const key = String((node as any)._endgameHintKey || '');
                if (!key || reusableNodes.has(key)) continue;
                reusableNodes.set(key, node);
            }
            const nextNodes: Node[] = [];
            for (const target of targets) {
                const node = reusableNodes.get(target.key) || this.acquireEndgameHintNode();
                if (!node) continue;
                this.configureEndgameHintNode(node, target, frames, reusableNodes.has(target.key));
                nextNodes.push(node);
                reusableNodes.delete(target.key);
            }
            for (const node of reusableNodes.values()) {
                this.releaseEndgameHintNode(node, false);
            }
            this._endgameHintNodes = nextNodes;
        },

        buildEndgameHintTargets(cells: Array<{ row: number; col: number; colorId: number }>): EndgameHintTarget[] {
            const targets: EndgameHintTarget[] = [];
            const seen = new Set<string>();
            const boardSize = Math.max(24, (this.cellSize || 44) + ENDGAME_BOARD_HINT_EXTRA_SIZE);
            for (const cell of cells) {
                const parent = this.cellNodes[cell.row]?.[cell.col] || null;
                if (!parent || !parent.isValid) continue;
                const key = `board:${cell.row},${cell.col}`;
                if (seen.has(key)) continue;
                seen.add(key);
                targets.push({ key, parent, size: boardSize });
            }
            return targets;
        },

        acquireEndgameHintNode(): Node | null {
            const pooled = this._endgameHintPool.pop();
            if (pooled && pooled.isValid) return pooled;
            const prefab = this._endgameHintPrefab as Prefab | null;
            return prefab ? instantiate(prefab) : null;
        },

        configureEndgameHintNode(node: Node, target: EndgameHintTarget, frames: SpriteFrame[], keepLoop: boolean = false): void {
            if (!keepLoop) Tween.stopAllByTarget(node);
            const opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
            if (!keepLoop) Tween.stopAllByTarget(opacity);
            if (node.parent !== target.parent) {
                target.parent.addChild(node);
            }
            setLayerDeep(node, Layers.Enum.UI_2D);
            (node as any)._endgameHintKey = target.key;
            node.name = `EndgameHint_${target.key}`;
            node.active = true;
            node.setPosition(getNodeVisualCenterLocal(target.parent));
            node.setScale(1, 1, 1);
            if (!keepLoop) node.setRotationFromEuler(0, 0, 0);
            const rootTransform = node.getComponent(UITransform) || node.addComponent(UITransform);
            rootTransform.setContentSize(target.size, target.size);
            const glow = node.getChildByName('HintGlow');
            if (glow && !keepLoop) Tween.stopAllByTarget(glow);
            const glowTransform = glow?.getComponent(UITransform) || null;
            if (glowTransform) {
                glowTransform.setContentSize(target.size, target.size);
            }
            glow?.setPosition(0, 0, 0);
            glow?.setRotationFromEuler(0, 0, 0);
            const glowSprite = glow?.getComponent(Sprite) || null;
            if (!glow || !glowSprite || frames.length === 0) {
                if (glow) glow.active = false;
                return;
            }
            glow.active = true;
            glowSprite.enabled = true;
            glowSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            glowSprite.color = new Color(255, 255, 255, 255);
            glowSprite.spriteFrame = frames[0];
            opacity.opacity = ENDGAME_HINT_STAR_MAX_OPACITY;
            if (keepLoop) return;
            tween(node)
                .repeatForever(
                    tween(node)
                        .set({ eulerAngles: new Vec3(0, 0, 0) })
                        .to(
                            ENDGAME_HINT_STAR_VISIBLE_DURATION,
                            { eulerAngles: new Vec3(0, 0, ENDGAME_HINT_STAR_SPIN_DEGREES) },
                            { easing: 'linear' },
                        )
                        .delay(ENDGAME_HINT_STAR_LOOP_PAUSE),
                )
                .start();
            glow.setScale(0, 0, 1);
            tween(glow)
                .repeatForever(
                    tween(glow)
                        .set({ scale: new Vec3(0, 0, 1) })
                        .to(
                            ENDGAME_HINT_STAR_VISIBLE_DURATION * 0.5,
                            {
                                scale: new Vec3(ENDGAME_HINT_STAR_MAX_SCALE, ENDGAME_HINT_STAR_MAX_SCALE, 1),
                            },
                            { easing: 'sineOut' },
                        )
                        .to(
                            ENDGAME_HINT_STAR_VISIBLE_DURATION * 0.5,
                            {
                                scale: new Vec3(0, 0, 1),
                            },
                            { easing: 'sineIn' },
                        )
                        .delay(ENDGAME_HINT_STAR_LOOP_PAUSE),
                )
                .start();
        },

        releaseEndgameHintNode(node: Node, destroy: boolean = false): void {
            if (!node || !node.isValid) return;
            Tween.stopAllByTarget(node);
            const opacity = node.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
            const glow = node.getChildByName('HintGlow');
            if (glow) Tween.stopAllByTarget(glow);
            delete (node as any)._endgameHintKey;
            node.removeFromParent();
            node.active = false;
            if (destroy || this._endgameHintPool.length >= ENDGAME_HINT_POOL_LIMIT) {
                node.destroy();
            } else {
                this._endgameHintPool.push(node);
            }
        },

        clearEndgameHints(destroy: boolean = false): void {
            const nodes = this._endgameHintNodes || [];
            for (const node of nodes) {
                this.releaseEndgameHintNode(node, destroy);
            }
            nodes.length = 0;
            if (destroy) {
                for (const node of this._endgameHintPool || []) {
                    if (node && node.isValid) node.destroy();
                }
                this._endgameHintPool = [];
            }
        },
    });
}
