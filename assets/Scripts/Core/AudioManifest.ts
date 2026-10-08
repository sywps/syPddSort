export const AUDIO_HOME_BGM_RESOURCE_PATH = 'Audio/bgm';
export const AUDIO_GAME_BGM_RESOURCE_PATH = 'Audio/bgm';
export const AUDIO_BGM_RESOURCE_PATH = AUDIO_GAME_BGM_RESOURCE_PATH;
export const AUDIO_HOME_BGM_VOLUME = 0.35;
export const AUDIO_GAME_BGM_VOLUME = 0.35;
export const AUDIO_BGM_VOLUME = AUDIO_GAME_BGM_VOLUME;

export const AUDIO_SFX_RESOURCE_PATH = {
    guideA1: 'Audio/guide_a_1',
    guideA2: 'Audio/guide_a_2',
    select: 'Audio/pindd/bean_pickup',
    settle: 'Audio/pindd/bean_return_settle',
    conveyorEnter: 'Audio/pindd/bean_return_settle',
    conveyorReturn: 'Audio/pindd/sfx_bead_patternsnap',
    fly: 'Audio/pindd/bean_fly',
    button: 'Audio/ui',
    tick: 'Audio/tick',
    lose: 'Audio/lose',
    winColor: 'Audio/Judgment/SFX_color_complete',
    winAll: 'Audio/winColor',
    winSettlement: 'Audio/winSettlement',
    revivePop: 'Audio/ui',
    judgmentGreat: 'Audio/Judgment/SFX_Female_great',
    judgmentExcellent: 'Audio/Judgment/SFX_Female_excellent',
    judgmentAwesome: 'Audio/Judgment/SFX_Female_awesome',
    judgmentAmazing: 'Audio/Judgment/SFX_Female_amazing',
    judgmentPerfect: 'Audio/Judgment/SFX_Female_perfect',
    judgmentUnbelievable: 'Audio/Judgment/SFX_Female_unbelievable',
    voiceWarn: 'Audio/voices/voice_warn',
    voiceWin1: 'Audio/voices/voice_win_1',
    voiceWin2: 'Audio/voices/voice_win_2',
    voiceRebirth1: 'Audio/voices/voice_rebirth_1',
    voiceRebirth2: 'Audio/voices/voice_rebirth_2',
    voiceRebirth3: 'Audio/voices/voice_rebirth_3',
    voiceHint: 'Audio/voices/voice_hint_1',
} as const;

export type SfxName = keyof typeof AUDIO_SFX_RESOURCE_PATH;

export const AUDIO_SFX_VOLUME: Record<SfxName, number> = {
    guideA1: 1,
    guideA2: 1,
    select: 0, // Temporarily muted for return-sound audition; previous volume: 0.55.
    settle: 0.32,
    conveyorEnter: 0, // Temporarily muted for return-sound audition; previous volume: 0.32.
    conveyorReturn: 1,
    fly: 0.40,
    button: 0.52,
    tick: 0.40,
    lose: 0.44,
    winColor: 0.32,
    winAll: 0.50,
    winSettlement: 0.62,
    revivePop: 0.32,
    judgmentGreat: 0.42,
    judgmentExcellent: 0.42,
    judgmentAwesome: 0.42,
    judgmentAmazing: 0.42,
    judgmentPerfect: 0.42,
    judgmentUnbelievable: 0.42,
    voiceWarn: 0.85,
    voiceWin1: 0.85,
    voiceWin2: 0.85,
    voiceRebirth1: 0.85,
    voiceRebirth2: 0.85,
    voiceRebirth3: 0.85,
    voiceHint: 0.85,
};

// Remote gameplay voices must stay out of AUDIO_BOOTSTRAP_SFX_NAMES.
export const GAMEPLAY_VOICE_NAMES: SfxName[] = [
    'voiceWarn', 'voiceWin1', 'voiceWin2',
    'voiceRebirth1', 'voiceRebirth2', 'voiceRebirth3',
];

export const AUDIO_SFX_VOLUME_VARIANCE: Partial<Record<SfxName, number>> = {
    select: 0.03,
    fly: 0.02,
    button: 0.05,
    tick: 0.03,
};

export const AUDIO_BOOTSTRAP_SFX_NAMES: SfxName[] = [
    'guideA1',
    'guideA2',
    'select',
    'settle',
    'conveyorEnter',
    'conveyorReturn',
    'fly',
    'button',
    'tick',
    'lose',
    'winColor',
    'winAll',
    'winSettlement',
    'revivePop',
    'judgmentGreat',
    'judgmentExcellent',
    'judgmentAwesome',
    'judgmentAmazing',
    'judgmentPerfect',
    'judgmentUnbelievable',
];
