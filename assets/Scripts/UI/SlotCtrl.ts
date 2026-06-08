/**
 * 暂存槽控制
 */

import { BeanBlockInfo } from '../Core/LevelConfig';

export class SlotModel {
    private slots: (BeanBlockInfo | null)[];
    public totalCount: number;
    public unlockedCount: number;

    constructor(count: number) {
        this.totalCount = count;
        this.unlockedCount = count;
        this.slots = new Array(count).fill(null);
    }

    private getUsableCount(): number {
        return Math.max(0, Math.min(this.unlockedCount ?? this.totalCount, this.totalCount));
    }

    /** 增加底层槽位容量 */
    expand(addCount: number) {
        this.totalCount += addCount;
        for (let i = 0; i < addCount; i++) {
            this.slots.push(null);
        }
    }

    hasEmptySlot(): boolean {
        const usableCount = this.getUsableCount();
        for (let i = 0; i < usableCount; i++) {
            if (this.slots[i] === null) return true;
        }
        return false;
    }

    /** 存入豆豆块，按颜色自动排序放置，返回存入的槽位索引，失败返回-1 */
    store(block: BeanBlockInfo): number {
        const usableCount = this.getUsableCount();
        if (usableCount <= 0) return -1;

        // 找到同色豆豆的最后一个位置，插入其后
        let insertAt = -1;
        let lastSameColor = -1;
        let firstEmpty = -1;

        for (let i = 0; i < usableCount; i++) {
            if (this.slots[i] !== null && this.slots[i]!.colorId === block.colorId) {
                lastSameColor = i;
            }
            if (this.slots[i] === null && firstEmpty === -1) {
                firstEmpty = i;
            }
        }

        if (firstEmpty === -1) return -1; // 没有空位

        if (lastSameColor >= 0) {
            // 在同色最后一个之后插入
            insertAt = lastSameColor + 1;
            // 把 insertAt 及之后的非空元素往后挪一格
            // 先找到最后一个非空元素
            let lastOccupied = -1;
            for (let i = usableCount - 1; i >= 0; i--) {
                if (this.slots[i] !== null) { lastOccupied = i; break; }
            }
            if (lastOccupied >= usableCount - 1 && this.slots[usableCount - 1] !== null) {
                return -1; // 满了，无法移位
            }
            // 从后往前移
            for (let i = Math.min(lastOccupied + 1, usableCount - 1); i > insertAt; i--) {
                this.slots[i] = this.slots[i - 1];
                if (this.slots[i]) this.slots[i]!.slotIndex = i;
            }
            this.slots[insertAt] = block;
        } else {
            // 没有同色豆豆，放到第一个空位
            insertAt = firstEmpty;
            this.slots[insertAt] = block;
        }

        block.source = 'slot';
        block.slotIndex = insertAt;
        return insertAt;
    }

    /** 取出指定槽位的豆豆块 */
    take(index: number): BeanBlockInfo | null {
        if (index < 0 || index >= this.getUsableCount()) return null;
        const block = this.slots[index];
        if (block) {
            this.slots[index] = null;
        }
        return block;
    }

    /** 放回指定槽位，不做排序挪动；目标槽必须为空 */
    putAt(index: number, block: BeanBlockInfo): boolean {
        if (index < 0 || index >= this.getUsableCount()) return false;
        if (this.slots[index] !== null) return false;
        block.source = 'slot';
        block.slotIndex = index;
        this.slots[index] = block;
        return true;
    }

    /** 最大化取出：取出指定槽位同色的所有豆豆，合并为一个block返回 */
    takeAllSameColor(index: number): BeanBlockInfo | null {
        const usableCount = this.getUsableCount();
        if (index < 0 || index >= usableCount) return null;
        const target = this.slots[index];
        if (!target) return null;

        const colorId = target.colorId;
        const allCells: { row: number; col: number }[] = [];

        // 收集所有同色豆豆
        for (let i = 0; i < usableCount; i++) {
            if (this.slots[i] && this.slots[i]!.colorId === colorId) {
                allCells.push(...this.slots[i]!.cells);
                this.slots[i] = null;
            }
        }

        // 压缩空位，把后面的往前挪
        this.compact();

        return {
            colorId,
            cells: allCells,
            isLocked: false,
            source: 'slot',
        };
    }

    /** 压缩空位，所有非空元素靠前排列 */
    private compact() {
        const nonNull: BeanBlockInfo[] = [];
        const usableCount = this.getUsableCount();
        for (let i = 0; i < usableCount; i++) {
            const slot = this.slots[i];
            if (slot !== null) nonNull.push(slot);
        }
        for (let i = 0; i < usableCount; i++) {
            this.slots[i] = nonNull[i] || null;
            if (this.slots[i]) this.slots[i]!.slotIndex = i;
        }
        for (let i = usableCount; i < this.slots.length; i++) {
            this.slots[i] = null;
        }
    }

    /** 按颜色排序暂存槽中的豆豆，同色合并，空位集中到末尾 */
    sortByColor() {
        const nonNull: BeanBlockInfo[] = [];
        const usableCount = this.getUsableCount();
        for (let i = 0; i < usableCount; i++) {
            const slot = this.slots[i];
            if (slot !== null) nonNull.push(slot);
        }
        // 按颜色ID排序
        nonNull.sort((a, b) => a.colorId - b.colorId);
        // 合并同色豆豆
        const merged: BeanBlockInfo[] = [];
        for (const block of nonNull) {
            const last = merged[merged.length - 1];
            if (last && last.colorId === block.colorId) {
                last.cells.push(...block.cells);
            } else {
                merged.push({ ...block, cells: [...block.cells] });
            }
        }
        // 写回槽位
        for (let i = 0; i < usableCount; i++) {
            this.slots[i] = i < merged.length ? merged[i] : null;
            if (this.slots[i]) this.slots[i]!.slotIndex = i;
        }
        for (let i = usableCount; i < this.slots.length; i++) {
            this.slots[i] = null;
        }
    }

    getBlock(index: number): BeanBlockInfo | null {
        return this.slots[index] ?? null;
    }

    getAll(): (BeanBlockInfo | null)[] {
        return this.slots;
    }
}
