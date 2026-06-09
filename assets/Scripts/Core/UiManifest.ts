export const GAME_ASSETS_PRELOAD_TEXTURE_PATHS: string[] = [];

export const POPUP_UI_TEXTURE_NAMES = [
    'popup_modal_shade',
    'popup_frame_soft',
    'popup_title_badge_blank',
    'popup_close_button',
    'popup_card_unlocked',
    'popup_card_locked',
    'popup_lock_icon',
    'popup_list_row_bg',
    'popup_shop_icon_plate',
    'popup_reward_card',
    'popup_claimed_badge',
    'popup_primary_button',
    'popup_secondary_button',
    'popup_tab_active',
    'popup_tab_inactive',
    'popup_currency_chip',
    'popup_result_preview_plate',
    'popup_progress_bar_bg',
    'popup_progress_bar_fill',
    'popup_guide_bubble',
    'popup_guide_highlight_ring',
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
    'daily_signin_gold_icon',
    'popup_ad_play_icon',
    'popup_vigor_icon',
    'popup_tool_wand_icon',
    'popup_tool_brush_icon',
    'popup_tool_magnet_icon',
];

export const RECOVER_VIGOR_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
    'popup_vigor_icon',
];

export const DAILY_SIGNIN_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
    'daily_signin_gold_icon',
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
    'collection_arrow_left',
    'collection_arrow_right',
];

export const HOME_MENU_TEXTURE_NAMES = [
    'bg_game',
    'home_lives',
    'home_gold',
    'home_settings',
    'home_start_button',
    'home_leaderboard',
    'home_collection',
    'daily_signin_button_icon',
    'collection_card_unlocked',
];

export const GAMEPLAY_SLOT_TEXTURE_NAMES = [
    '倒计时',
    'slot_panel_shell_ui',
    'slot_row_empty_pindd',
    'slot_row_empty_ui',
    'slot_row_locked_ui',
    'slot_row_lock_mask_ui',
    'slot_row_lock_dash_ui',
    'unlock_button',
    'guide_hand',
    'popup_guide_bubble',
    'popup_guide_highlight_ring',
];

export const SKILL_BUTTON_TEXTURE_NAMES = [
    'popup_gameplay_tool_slot_plate',
    'popup_tool_wand_icon',
    'popup_tool_brush_icon',
    'popup_tool_magnet_icon',
];

export const GOLD_SHOP_RELEASE_TEXTURE_NAMES = [
    'popup_ad_play_icon',
];

export const RECOVER_VIGOR_RELEASE_TEXTURE_NAMES: string[] = [];
export const DAILY_SIGNIN_RELEASE_TEXTURE_NAMES: string[] = [];
export const SETTINGS_PANEL_RELEASE_TEXTURE_NAMES = [...POPUP_SETTINGS_TEXTURE_NAMES];
export const LEADERBOARD_RELEASE_TEXTURE_NAMES: string[] = [];
export const COLLECTION_RELEASE_TEXTURE_NAMES = [
    'collection_arrow_left',
    'collection_arrow_right',
];

export const GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS: string[] = [];

export const GAME_ASSETS_TEXTURE_SEARCH_DIRS = [
    'Textures/UI',
    'Textures/BG',
    'Textures/Pindd/UI',
];
