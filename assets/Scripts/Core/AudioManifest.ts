export const AUDIO_HOME_BGM_RESOURCE_PATH = 'Audio/bgm';
export const AUDIO_GAME_BGM_RESOURCE_PATH = 'Audio/bgm';
export const AUDIO_BGM_RESOURCE_PATH = AUDIO_GAME_BGM_RESOURCE_PATH;
export const AUDIO_HOME_BGM_VOLUME = 0.35;
export const AUDIO_GAME_BGM_VOLUME = 0.29;
export const AUDIO_BGM_VOLUME = AUDIO_GAME_BGM_VOLUME;

export const AUDIO_SFX_RESOURCE_PATH = {
    select: 'Audio/pindd/bean_pickup',
    settle: 'Audio/pindd/bean_return_settle',
    fly: 'Audio/pindd/bean_fly',
    button: 'Audio/ui',
    tick: 'Audio/tick',
    lose: 'Audio/lose',
    winColor: 'Audio/winColor',
    winAll: 'Audio/winColor',
    winSettlement: 'Audio/winSettlement',
    revivePop: 'Audio/ui',
} as const;

export type SfxName = keyof typeof AUDIO_SFX_RESOURCE_PATH;

export const AUDIO_SFX_VOLUME: Record<SfxName, number> = {
    select: 0.55,
    settle: 0.72,
    fly: 0.40,
    button: 0.52,
    tick: 0.40,
    lose: 0.44,
    winColor: 0.50,
    winAll: 0.50,
    winSettlement: 0.62,
    revivePop: 0.32,
};

export const AUDIO_SFX_VOLUME_VARIANCE: Partial<Record<SfxName, number>> = {
    select: 0.03,
    fly: 0.02,
    button: 0.05,
    tick: 0.03,
};

export const AUDIO_BOOTSTRAP_SFX_NAMES: SfxName[] = [
    'select',
    'settle',
    'fly',
    'button',
    'tick',
    'lose',
    'winColor',
    'winAll',
    'winSettlement',
    'revivePop',
];
