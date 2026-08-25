/**
 * 关卡数据接口定义
 */

/**
 * 颜色 ID 映射。
 * 这些值与 `BootstrapBundle/Beans/bean-atlas-data.json` 中的 bNNN_* 帧名、关卡 JSON 数字一一对应。
 * 不要按历史英文色名推断颜色；以 COLOR_HEX / 豆豆图集实际帧为准。
 */
export enum BeanColor {
    NONE = 0,
    ROSE = 1,
    CYAN = 2,
    GOLD = 3,
    ORANGE = 4,
    PEACH = 5,
    CREAM = 6,
    INDIGO = 7,
    VIOLET = 8,
    LIME = 9,
    RED = 10,
    GREEN = 11,
    EMERALD = 12,
    SKY_BLUE = 13,
    PINK = 14,
    LAVENDER = 15,
    BROWN = 16,
    MAROON = 17,
    NAVY = 18,
    CHARCOAL = 19,
    IVORY = 20,
}

/** 颜色 ID 到主视觉色值映射（取自 bNNN_2 正常豆子贴图主色） */
export const COLOR_HEX: Record<number, string> = {
    1: '#ED5090',
    2: '#4EEAEA',
    3: '#F8C811',
    4: '#FE8B10',
    5: '#F4BD9E',
    6: '#EBDEA6',
    7: '#4A4DCF',
    8: '#7221BC',
    9: '#9FCE21',
    10: '#EA281A',
    11: '#37A92D',
    12: '#207955',
    13: '#20A8DC',
    14: '#EEB2BC',
    15: '#C4BED9',
    16: '#974714',
    17: '#782F3C',
    18: '#36387E',
    19: '#373737',
    20: '#F2EDE4',
};

/** 设计/工具展示用中文色名 */
export const COLOR_NAMES: Record<number, string> = {
    1: '玫红',
    2: '亮青',
    3: '金',
    4: '橙',
    5: '桃',
    6: '浅黄',
    7: '靛蓝',
    8: '紫',
    9: '绿',
    10: '红',
    11: '青绿',
    12: '翠绿',
    13: '天蓝',
    14: '粉',
    15: '浅紫',
    16: '棕',
    17: '酒红',
    18: '藏青',
    19: '深灰',
    20: '米白',
};

/** 简化锁定态色值。实际锁定豆子优先使用 bNNN_1 贴图。 */
export const COLOR_HEX_LOCKED: Record<number, string> = {
    1: '#A82860',
    2: '#35A09A',
    3: '#BC7A02',
    4: '#B65600',
    5: '#B68574',
    6: '#ACA172',
    7: '#3235A0',
    8: '#51148A',
    9: '#6C9606',
    10: '#AC1E11',
    11: '#267921',
    12: '#12543A',
    13: '#0F72A2',
    14: '#AA7F88',
    15: '#847F96',
    16: '#662E0A',
    17: '#5A1C27',
    18: '#212259',
    19: '#242424',
    20: '#AFA99F',
};

/** 新版传送带每个载具可堆叠的豆豆数量。 */
export const CONVEYOR_STACK_DEPTH = 3;

/** 校验关卡配置的新版传送带容量（单位：豆豆颗数）。 */
export function validateConveyorCapacity(value: unknown, label: string = 'level data'): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new Error(`[ConveyorCapacity] ${label}.conveyorCapacity must be a positive integer: ${value}`);
    }
    if (value % CONVEYOR_STACK_DEPTH !== 0) {
        throw new Error(`[ConveyorCapacity] ${label}.conveyorCapacity must be a multiple of ${CONVEYOR_STACK_DEPTH}: ${value}`);
    }
    return value;
}

export interface LevelTutorialGuideConfig {
    mode?: string;
    guideCopies?: string[];
    title?: string;
    subtitle?: string;
}

/** 关卡数据 */
export interface LevelData {
    levelId: number;
    boardWidth: number;
    boardHeight: number;
    timeLimit: number;
    slotTotalCount: number;
    /** 新版传送带可暂存的豆豆总数，不是行数。 */
    conveyorCapacity: number;
    tutorialGuide?: LevelTutorialGuideConfig;
    /** 每格正确颜色 [row][col] */
    correctColorArr: number[][];
    /** 初始乱序颜色 [row][col] */
    initRandomColorArr: number[][];
}

/** 豆豆块信息 */
export interface BeanBlockInfo {
    colorId: number;
    /** 块内豆豆在棋盘上的坐标 */
    cells: { row: number; col: number }[];
    isLocked: boolean;
    /** 来源: board 或 slot */
    source: 'board' | 'slot';
    /** 若来源为slot，记录槽位索引 */
    slotIndex?: number;
}
