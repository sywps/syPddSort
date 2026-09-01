export const BOARD_EFFECT_TEXTURE_NAMES = [
    'block_bright_pindd',
    'pdpx_eff_Star_01',
    'pdpx_eff_Trail_02',
    'pdpx_eff_Mask_01',
];

export const BOOTSTRAP_BOARD_EFFECT_TEXTURE_PATHS = BOARD_EFFECT_TEXTURE_NAMES
    .map((name) => `GameUI/${name}`);

export const GAME_ASSETS_PRELOAD_TEXTURE_PATHS: string[] = [];

export const POPUP_UI_TEXTURE_NAMES = [
    'popup_modal_shade',
    'popup_frame_soft',
    'popup_title_badge_blank',
    'popup_close_button',
    'popup_card_unlocked',
    'popup_card_locked',
    'popup_list_row_bg',
    'popup_shop_icon_plate',
    'popup_reward_card',
    'popup_claimed_badge',
    'popup_primary_button',
    'popup_secondary_button',
    'popup_tab_active',
    'popup_tab_inactive',
    'popup_currency_chip',
];

export const POPUP_SETTINGS_TEXTURE_NAMES = [
    'popup_settings_sound_icon',
    'popup_settings_music_icon',
    'popup_settings_vibrate_icon',
    'popup_settings_toggle_on',
    'popup_settings_toggle_off',
];

export const GOLD_SHOP_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
    '金币',
    'popup_vigor_icon',
    'popup_tool_wand_icon',
    'popup_tool_freeze_icon',
    'popup_tool_brush_icon',
    'popup_tool_magnet_icon',
];

export const RESOURCE_ACQUIRE_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
    '金币',
    'popup_tool_wand_icon',
    'popup_tool_freeze_icon',
    'popup_tool_brush_icon',
    'popup_tool_magnet_icon',
    'popup_ad_play_icon',
];

export const RECOVER_VIGOR_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
    'popup_vigor_icon',
    'popup_ad_play_icon',
    'popup_share_icon',
];

export const REWARD_RESULT_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
    '金币',
    'popup_vigor_icon',
    'popup_tool_wand_icon',
    'popup_tool_freeze_icon',
    'popup_tool_brush_icon',
    'popup_tool_magnet_icon',
];

export const RESULT_PANEL_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
    'popup_result_time_icon',
    '金币',
    'popup_ad_play_icon',
    'popup_share_icon',
    '进度条',
    'progress_fill',
];

export const SETTINGS_PANEL_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
    ...POPUP_SETTINGS_TEXTURE_NAMES,
];

export const LEADERBOARD_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
];

export const COLLECTION_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
];

export const THEME_PANEL_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
];

export const THEME_PANEL_RELEASE_TEXTURE_NAMES = [...THEME_PANEL_TEXTURE_NAMES];

export const HOME_MENU_TEXTURE_NAMES = [
    'bg_game',
    'collection_card_unlocked',
];

export const GAMEPLAY_SLOT_TEXTURE_NAMES = [
    '倒计时',
    'popup_ad_play_icon',
    'guide_hand',
    'popup_guide_highlight_ring',
];

export const SKILL_BUTTON_TEXTURE_NAMES = [
    'popup_gameplay_tool_slot_plate',
    'popup_tool_wand_icon',
    'popup_tool_freeze_icon',
    'popup_tool_brush_icon',
    'popup_tool_magnet_icon',
    'popup_ad_play_icon',
];

export const GOLD_SHOP_RELEASE_TEXTURE_NAMES = [...GOLD_SHOP_TEXTURE_NAMES];
export const RESOURCE_ACQUIRE_RELEASE_TEXTURE_NAMES = [...RESOURCE_ACQUIRE_TEXTURE_NAMES];

export const RECOVER_VIGOR_RELEASE_TEXTURE_NAMES = [...RECOVER_VIGOR_TEXTURE_NAMES];
export const REWARD_RESULT_RELEASE_TEXTURE_NAMES = [...REWARD_RESULT_TEXTURE_NAMES];
export const SETTINGS_PANEL_RELEASE_TEXTURE_NAMES = [...SETTINGS_PANEL_TEXTURE_NAMES];
export const LEADERBOARD_RELEASE_TEXTURE_NAMES = [...LEADERBOARD_TEXTURE_NAMES];
export const COLLECTION_RELEASE_TEXTURE_NAMES = [...COLLECTION_TEXTURE_NAMES];

export const GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS: string[] = [];

export const GAME_ASSETS_TEXTURE_SEARCH_DIRS = [
    'Textures/UI',
    'Textures/BG',
];
