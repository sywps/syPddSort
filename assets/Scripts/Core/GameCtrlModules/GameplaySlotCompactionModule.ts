import {
    Node,
    Sprite,
    SLOTS_PER_ROW,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
} from '../GameCtrlShared';
import type { BeanBlockInfo } from '../GameCtrlShared';

type SlotSnapshotEntry = {
    slotIndex: number;
    colorId: number;
    cells: { row: number; col: number }[];
};

export function installGameplaySlotCompactionMethods(target: any): void {
    Object.assign(target, {
        captureSelectedSlotSnapshot() {
            const snapshot: SlotSnapshotEntry[] = [];
            for (const slotIndex of this._selectedSlotIndices) {
                const slotBlock = this.slotModel.getBlock(slotIndex);
                if (!slotBlock) {
                    throw new Error(`[GameplaySlot] Selected slot ${slotIndex} is empty before placement`);
                }
                snapshot.push({
                    slotIndex,
                    colorId: slotBlock.colorId,
                    cells: slotBlock.cells.map((cell: { row: number; col: number }) => ({ row: cell.row, col: cell.col })),
                });
            }
            if (snapshot.length === 0) {
                throw new Error('[GameplaySlot] Missing selected slot snapshot before placement');
            }
            return snapshot;
        },

        removeBlockFromSlots() {
            for (const idx of this._selectedSlotIndices) {
                this.slotModel.take(idx);
            }
            this.slotModel.compactPreserveOrder();
            this.renderSlots();
        },

        removeBlockFromSlotsKeepingGaps() {
            for (const idx of this._selectedSlotIndices) {
                this.slotModel.take(idx);
            }
            this.renderSlots();
        },

        compactSlotsAfterSelectionConsume(onComplete?: () => void) {
            this.compactSlotsAfterPropConsume(onComplete);
        },

        compactSlotsAfterPropConsume(onComplete?: () => void) {
            const beforeSlots = this.slotModel.getAll().slice();
            const beforeIndexByBlock = new Map<BeanBlockInfo, number>();
            for (let i = 0; i < beforeSlots.length; i++) {
                const block = beforeSlots[i];
                if (block) beforeIndexByBlock.set(block, i);
            }

            if (!onComplete) {
                this.slotModel.compactPreserveOrder();
                this.renderSlots();
                return;
            }

            const rawTotalCount = Math.floor(Number(this.slotModel.totalCount) || beforeSlots.length);
            const rawUnlockedCount = Math.floor(Number(this.slotModel.unlockedCount ?? rawTotalCount) || rawTotalCount);
            const usableCount = Math.max(0, Math.min(rawUnlockedCount, rawTotalCount, beforeSlots.length));
            const compactedBlocks: BeanBlockInfo[] = [];
            for (let i = 0; i < usableCount; i++) {
                const block = beforeSlots[i];
                if (block) compactedBlocks.push(block);
            }
            const afterSlots: Array<BeanBlockInfo | null> = new Array(beforeSlots.length).fill(null);
            for (let i = 0; i < usableCount; i++) {
                afterSlots[i] = compactedBlocks[i] || null;
            }
            const moves: Array<{ block: BeanBlockInfo; from: number; to: number }> = [];
            for (let to = 0; to < afterSlots.length; to++) {
                const block = afterSlots[to];
                if (!block) continue;
                const from = beforeIndexByBlock.get(block);
                if (typeof from === 'number' && from !== to) {
                    moves.push({ block, from, to });
                }
            }

            const landedCompactBeans: Array<{ bean: Node; to: number }> = [];
            const SLOT_COMPACT_HANDOFF_DUR = 0.08;
            const finish = () => {
                this.slotModel.compactPreserveOrder();
                this.renderSlots();
                if (landedCompactBeans.length === 0) {
                    if (onComplete) onComplete();
                    return;
                }

                const targetSlots = new Set<number>();
                for (const landed of landedCompactBeans) targetSlots.add(landed.to);
                for (const slotIndex of targetSlots) {
                    const slotNode = this.slotNodes[slotIndex];
                    const realBeanNode = slotNode?.getChildByName('Bean') || null;
                    if (!realBeanNode?.isValid) continue;
                    const realOpacity = realBeanNode.getComponent(UIOpacity) || realBeanNode.addComponent(UIOpacity);
                    Tween.stopAllByTarget(realOpacity);
                    realOpacity.opacity = 0;
                    tween(realOpacity)
                        .to(SLOT_COMPACT_HANDOFF_DUR, { opacity: 255 }, { easing: 'sineOut' })
                        .start();
                }

                let handoffRemaining = landedCompactBeans.length;
                const completeHandoff = () => {
                    handoffRemaining--;
                    if (handoffRemaining > 0) return;
                    this.renderSlotIndices([...targetSlots]);
                    if (onComplete) onComplete();
                };
                for (const landed of landedCompactBeans) {
                    const bean = landed.bean;
                    if (!bean?.isValid) {
                        completeHandoff();
                        continue;
                    }
                    const beanOpacity = bean.getComponent(UIOpacity) || bean.addComponent(UIOpacity);
                    Tween.stopAllByTarget(beanOpacity);
                    beanOpacity.opacity = 255;
                    tween(beanOpacity)
                        .to(SLOT_COMPACT_HANDOFF_DUR, { opacity: 0 }, { easing: 'sineIn' })
                        .call(() => {
                            beanOpacity.opacity = 255;
                            this.recycleFlyBeanNode(bean);
                            completeHandoff();
                        })
                        .start();
                }
            };
            if (moves.length === 0 || !this.dragLayer?.isValid) {
                finish();
                return;
            }

            const layerUT = this.dragLayer.getComponent(UITransform);
            if (!layerUT) {
                finish();
                return;
            }
            const hideCompactSourceSlot = (index: number) => {
                const slot = this.slotNodes[index];
                if (!slot) return;
                const beanNode = slot.getChildByName('Bean');
                const beanSprite = beanNode?.getComponent(Sprite) || null;
                if (beanSprite) beanSprite.enabled = false;
                const beanOpacity = beanNode?.getComponent(UIOpacity) || null;
                if (beanOpacity) beanOpacity.opacity = 255;

                const marker = this.slotMarkerNodes[index];
                const markerSprite = marker?.getComponent(Sprite) || null;
                if (markerSprite) {
                    markerSprite.enabled = true;
                }
                const markerOpacity = marker?.getComponent(UIOpacity) || null;
                if (markerOpacity) {
                    const row = Math.floor(index / SLOTS_PER_ROW);
                    markerOpacity.opacity = row >= this.slotUnlockedRows ? 112 : 255;
                }
            };

            const movingFromSlots = new Set<number>();
            for (const move of moves) movingFromSlots.add(move.from);
            for (const index of movingFromSlots) hideCompactSourceSlot(index);

            const SLOT_COMPACT_MOVE_DUR = 0.22;
            const SLOT_COMPACT_STAGGER = 0.012;
            let remaining = moves.length;
            const markMoveDone = () => {
                remaining--;
                if (remaining <= 0) finish();
            };

            for (let i = 0; i < moves.length; i++) {
                const move = moves[i];
                const fromNode = this.slotNodes[move.from];
                const toNode = this.slotNodes[move.to];
                const fromUT = fromNode?.getComponent(UITransform) || null;
                const toUT = toNode?.getComponent(UITransform) || null;
                if (!fromNode || !toNode || !fromUT || !toUT) {
                    markMoveDone();
                    continue;
                }

                const sourceWorld = fromUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                const targetWorld = toUT.convertToWorldSpaceAR(new Vec3(0, 0, 0));
                const sourceLocal = layerUT.convertToNodeSpaceAR(sourceWorld);
                const targetLocal = layerUT.convertToNodeSpaceAR(targetWorld);
                const bean = this.acquireFlyBeanNode(
                    'SlotCompactBean',
                    this.getSlotBeanVisualSize(),
                    this.getBeanSpriteFrame(move.block.colorId, false),
                );
                this.dragLayer.addChild(bean);
                bean.setPosition(sourceLocal.x, sourceLocal.y, 0);
                bean.setScale(1, 1, 1);

                tween(bean)
                    .delay(i * SLOT_COMPACT_STAGGER)
                    .to(SLOT_COMPACT_MOVE_DUR, {
                        position: new Vec3(targetLocal.x, targetLocal.y, 0),
                    }, { easing: 'sineOut' })
                    .call(() => {
                        landedCompactBeans.push({ bean, to: move.to });
                        markMoveDone();
                    })
                    .start();
            }
        },

        restoreSlotTailToOriginalSlots(block: BeanBlockInfo, remainingCount: number, selectedSlotSnapshot: SlotSnapshotEntry[]) {
            if (!selectedSlotSnapshot || selectedSlotSnapshot.length === 0) {
                throw new Error('[GameplaySlot] Missing selected slot snapshot for restore');
            }
            if (remainingCount < 0 || remainingCount > block.cells.length) {
                throw new Error(`[GameplaySlot] Invalid remaining count ${remainingCount} for block size ${block.cells.length}`);
            }

            const consumedCount = block.cells.length - remainingCount;
            let cellCursor = 0;
            let restoredCount = 0;

            for (const snapshot of selectedSlotSnapshot) {
                const start = cellCursor;
                const end = start + snapshot.cells.length;
                cellCursor = end;
                if (end <= consumedCount) continue;

                const keepStart = Math.max(consumedCount - start, 0);
                const keptCells = snapshot.cells.slice(keepStart);
                if (keptCells.length === 0) continue;

                const restored = this.slotModel.putAt(snapshot.slotIndex, {
                    colorId: snapshot.colorId,
                    cells: keptCells.map((cell) => ({ row: cell.row, col: cell.col })),
                    isLocked: false,
                    source: 'slot',
                });
                if (!restored) {
                    throw new Error(`[GameplaySlot] Failed to restore slot ${snapshot.slotIndex}`);
                }
                restoredCount += keptCells.length;
            }

            if (restoredCount !== remainingCount) {
                throw new Error(`[GameplaySlot] Restored ${restoredCount} cells, expected ${remainingCount}`);
            }
        },

        restoreBlockToSlots(selectedSlotSnapshot: SlotSnapshotEntry[]) {
            const block = this.currentBlock!;
            this.restoreSlotTailToOriginalSlots(block, block.cells.length, selectedSlotSnapshot);
            this.renderSlots();
        },
    });
}
