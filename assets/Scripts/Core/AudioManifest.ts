export const AUDIO_HOME_BGM_RESOURCE_PATH = 'Audio/bgm';
export const AUDIO_GAME_BGM_RESOURCE_PATH = 'Audio/bgm';
export const AUDIO_BGM_RESOURCE_PATH = AUDIO_GAME_BGM_RESOURCE_PATH;
export const AUDIO_HOME_BGM_VOLUME = 0.35;
export const AUDIO_GAME_BGM_VOLUME = 0.29;
export const AUDIO_BGM_VOLUME = AUDIO_GAME_BGM_VOLUME;

export const AUDIO_SFX_RESOURCE_PATH = {
    select: 'Audio/pindd/bean_pickup',
    place: 'Audio/pindd/bean_correct_place',
    slot: 'Audio/pindd/right_place_short',
    fly: 'Audio/pindd/bean_fly',
    return: 'Audio/pindd/error',
    button: 'Audio/ui',
    uiPanel: 'Audio/ui',
    tick: 'Audio/tick',
    win: 'Audio/win',
    lose: 'Audio/lose',
    winColor: 'Audio/winColor',
    winAll: 'Audio/winColor',
    winSettlement: 'Audio/winSettlement',
    coin: 'Audio/pindd/shelf',
    propWand: 'Audio/pindd/select',
    propBrush: 'Audio/pindd/shelf',
    propFreeze: 'Audio/pindd/prop_freeze',
    revivePop: 'Audio/ui',
    guideLevel1Pick1: 'Audio/guide_level1_pick_1',
    guideLevel1Place1: 'Audio/guide_level1_place_1',
    guideLevel1Pick2: 'Audio/guide_level1_pick_2',
    guideLevel1Place2: 'Audio/guide_level1_place_2',
} as const;

export type SfxName = keyof typeof AUDIO_SFX_RESOURCE_PATH;

export const AUDIO_SFX_VOLUME: Record<SfxName, number> = {
    select: 0.55,
    place: 0.72,
    slot: 0.68,
    fly: 0.40,
    return: 0.22,
    button: 0.52,
    uiPanel: 0.48,
    tick: 0.40,
    win: 0.52,
    lose: 0.44,
    winColor: 0.50,
    winAll: 0.50,
    winSettlement: 0.62,
    coin: 0.42,
    propWand: 0.38,
    propBrush: 0.34,
    propFreeze: 0.30,
    revivePop: 0.32,
    guideLevel1Pick1: 0.72,
    guideLevel1Place1: 0.75,
    guideLevel1Pick2: 0.72,
    guideLevel1Place2: 0.75,
};

export const AUDIO_SFX_VOLUME_VARIANCE: Partial<Record<SfxName, number>> = {
    select: 0.03,
    place: 0.04,
    slot: 0.05,
    fly: 0.02,
    return: 0.04,
    button: 0.05,
    uiPanel: 0.04,
    tick: 0.03,
    coin: 0.04,
};

export const AUDIO_BOOTSTRAP_SFX_NAMES: SfxName[] = [
    'select',
    'place',
    'slot',
    'fly',
    'return',
    'button',
    'uiPanel',
    'tick',
    'coin',
    'guideLevel1Pick1',
    'guideLevel1Place1',
    'guideLevel1Pick2',
    'guideLevel1Place2',
];
