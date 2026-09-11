export const BOARD_EFFECT_TEXTURE_NAMES = [
    'block_bright_pindd',
    'pdpx_eff_Star_01',
    'pdpx_eff_Trail_02',
    'pdpx_eff_Mask_01',
];

export const BOOTSTRAP_BOARD_EFFECT_TEXTURE_PATHS = BOARD_EFFECT_TEXTURE_NAMES
    .map((name) => `GameUI/Atlases/BoardEffects/${name}`);

export const GAME_ASSETS_PRELOAD_TEXTURE_PATHS: string[] = [];

export const POPUP_UI_TEXTURE_NAMES = [
    'popup_modal_shade',
    'popup_frame_soft',
    'popup_title_badge_blank',
    'popup_close_button',
    'popup_list_row_bg',
    'popup_primary_button',
    'popup_secondary_button',
    'popup_tab_inactive',
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

export const RESULT_PANEL_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
    '金币',
    'popup_ad_play_icon',
    'popup_share_icon',
];

export const SETTINGS_PANEL_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
    ...POPUP_SETTINGS_TEXTURE_NAMES,
];

export const LEADERBOARD_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
    'leaderboard_row_standard',
    'leaderboard_tab_active',
    'leaderboard_avatar_default',
    'leaderboard_avatar_frame',
    'leaderboard_tab_inactive',
    'leaderboard_title_plaque',
    'medal_bronze_rank_3',
    'medal_gold_rank_1',
    'medal_silver_rank_2',
    'my_ranking_panel',
];

export const COLLECTION_TEXTURE_NAMES = [
    ...POPUP_UI_TEXTURE_NAMES,
];

export const HOME_MENU_TEXTURE_NAMES = [
    'bg_game',
    'collection_card_unlocked',
];

export const GAMEPLAY_SLOT_TEXTURE_NAMES = [
    '倒计时',
    'popup_ad_play_icon',
    'guide_hand',
];

export const SKILL_BUTTON_TEXTURE_NAMES = [
    'popup_tool_wand_icon',
    'popup_tool_freeze_icon',
    'popup_tool_brush_icon',
    'popup_tool_magnet_icon',
    'popup_ad_play_icon',
];

export const GOLD_SHOP_RELEASE_TEXTURE_NAMES = [...GOLD_SHOP_TEXTURE_NAMES];
export const RESOURCE_ACQUIRE_RELEASE_TEXTURE_NAMES = [...RESOURCE_ACQUIRE_TEXTURE_NAMES];

export const RECOVER_VIGOR_RELEASE_TEXTURE_NAMES = [...RECOVER_VIGOR_TEXTURE_NAMES];
export const SETTINGS_PANEL_RELEASE_TEXTURE_NAMES = [...SETTINGS_PANEL_TEXTURE_NAMES];
export const LEADERBOARD_RELEASE_TEXTURE_NAMES = [...LEADERBOARD_TEXTURE_NAMES];
export const COLLECTION_RELEASE_TEXTURE_NAMES = [...COLLECTION_TEXTURE_NAMES];

export const GAME_ASSETS_BOOTSTRAP_PRELOAD_TEXTURE_PATHS: string[] = [];

export const GAME_ASSETS_TEXTURE_SEARCH_DIRS = [
    'Textures/UI',
    'Textures/BG',
];

export type LocalAtlasBundleName = 'bootstrap' | 'gameAssets';

export const LOCAL_ATLAS_MEMBER_ROUTES: Readonly<Record<string, string>> = Object.freeze({
    'bootstrap:wf_base_14': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/wf_base_14',
    'bootstrap:exit_1': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/exit_1',
    'bootstrap:exit_2': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/exit_2',
    'bootstrap:exit_1_2': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/exit_1_2',
    'bootstrap:exit_1_3': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/exit_1_3',
    'bootstrap:exit_1_4': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/exit_1_4',
    'bootstrap:gameProp_2007': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/gameProp_2007',
    'bootstrap:conveyor_0': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/conveyor_0',
    'bootstrap:conveyor_1': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/conveyor_1',
    'bootstrap:conveyor_2': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/conveyor_2',
    'bootstrap:conveyor_3': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/conveyor_3',
    'bootstrap:conveyor_4': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/conveyor_4',
    'bootstrap:conveyor_5': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/conveyor_5',
    'bootstrap:conveyor_7a': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/conveyor_7a',
    'bootstrap:conveyor_7b': 'GameUI/RainbowConveyor/Atlases/ConveyorSmall/conveyor_7b',
    'bootstrap:pch_capacity_fill_sliced': 'GameUI/RainbowConveyor/Atlases/PchCapacity/pch_capacity_fill_sliced',
    'bootstrap:pch_capacity_track_sliced': 'GameUI/RainbowConveyor/Atlases/PchCapacity/pch_capacity_track_sliced',
    'bootstrap:倒计时': 'GameUI/Atlases/GameSceneSmall/倒计时',
    'bootstrap:board_zoom_fill': 'GameUI/Atlases/GameSceneSmall/board_zoom_fill',
    'bootstrap:board_zoom_track': 'GameUI/Atlases/GameSceneSmall/board_zoom_track',
    'bootstrap:board_zoom_thumb': 'GameUI/Atlases/GameSceneSmall/board_zoom_thumb',
    'bootstrap:board_zoom_locate': 'GameUI/Atlases/GameSceneSmall/board_zoom_locate',
    'bootstrap:board_zoom_plus': 'GameUI/Atlases/GameSceneSmall/board_zoom_plus',
    'bootstrap:board_zoom_minus': 'GameUI/Atlases/GameSceneSmall/board_zoom_minus',
    'bootstrap:gameplay_skill_slot_background': 'GameUI/Atlases/GameSceneSmall/gameplay_skill_slot_background',
    'bootstrap:guide_bubble_frame': 'GameUI/Atlases/GameSceneSmall/guide_bubble_frame',
    'bootstrap:guide_hand': 'GameUI/Atlases/GameSceneSmall/guide_hand',
    'bootstrap:pch_speed_inactive': 'GameUI/Atlases/GameSceneSmall/pch_speed_inactive',
    'bootstrap:popup_tool_add_badge': 'GameUI/Atlases/GameSceneSmall/popup_tool_add_badge',
    'bootstrap:popup_tool_count_badge': 'GameUI/Atlases/GameSceneSmall/popup_tool_count_badge',
    'bootstrap:solid_white': 'GameUI/Atlases/GameSceneSmall/solid_white',
    'bootstrap:toast_bubble_background': 'GameUI/Atlases/GameSceneSmall/toast_bubble_background',
    'bootstrap:popup_ad_play_icon': 'GameUI/Atlases/GameSceneSmall/popup_ad_play_icon',
    'bootstrap:popup_primary_button': 'GameUI/Atlases/GameSceneSmall/popup_primary_button',
    'bootstrap:popup_tool_brush_icon': 'GameUI/Atlases/GameSceneSmall/popup_tool_brush_icon',
    'bootstrap:popup_tool_freeze_icon': 'GameUI/Atlases/GameSceneSmall/popup_tool_freeze_icon',
    'bootstrap:popup_tool_magnet_icon': 'GameUI/Atlases/GameSceneSmall/popup_tool_magnet_icon',
    'bootstrap:popup_tool_wand_icon': 'GameUI/Atlases/GameSceneSmall/popup_tool_wand_icon',
    'bootstrap:设置': 'GameUI/Atlases/GameSceneSmall/设置',
    'bootstrap:block_bright_pindd': 'GameUI/Atlases/BoardEffects/block_bright_pindd',
    'bootstrap:pdpx_eff_Mask_01': 'GameUI/Atlases/BoardEffects/pdpx_eff_Mask_01',
    'bootstrap:pdpx_eff_Star_01': 'GameUI/Atlases/BoardEffects/pdpx_eff_Star_01',
    'bootstrap:pdpx_eff_Trail_02': 'GameUI/Atlases/BoardEffects/pdpx_eff_Trail_02',
    'gameAssets:popup_settings_sound_icon': 'Textures/UI/Atlases/Settings/popup_settings_sound_icon',
    'gameAssets:popup_settings_music_icon': 'Textures/UI/Atlases/Settings/popup_settings_music_icon',
    'gameAssets:popup_settings_vibrate_icon': 'Textures/UI/Atlases/Settings/popup_settings_vibrate_icon',
    'gameAssets:popup_settings_toggle_on': 'Textures/UI/Atlases/Settings/popup_settings_toggle_on',
    'gameAssets:popup_settings_toggle_off': 'Textures/UI/Atlases/Settings/popup_settings_toggle_off',
    'gameAssets:popup_list_row_bg': 'Textures/UI/Atlases/Leaderboard/popup_list_row_bg',
    'gameAssets:popup_tab_inactive': 'Textures/UI/Atlases/Leaderboard/popup_tab_inactive',
    'gameAssets:leaderboard_row_standard': 'Textures/UI/Atlases/LeaderboardV2/leaderboard_row_standard',
    'gameAssets:leaderboard_tab_active': 'Textures/UI/Atlases/LeaderboardV2/leaderboard_tab_active',
    'gameAssets:leaderboard_avatar_default': 'Textures/UI/Atlases/LeaderboardV2/leaderboard_avatar_default',
    'gameAssets:leaderboard_avatar_frame': 'Textures/UI/Atlases/LeaderboardV2/leaderboard_avatar_frame',
    'gameAssets:leaderboard_tab_inactive': 'Textures/UI/Atlases/LeaderboardV2/leaderboard_tab_inactive',
    'gameAssets:leaderboard_title_plaque': 'Textures/UI/Atlases/LeaderboardV2/leaderboard_title_plaque',
    'gameAssets:medal_bronze_rank_3': 'Textures/UI/Atlases/LeaderboardV2/medal_bronze_rank_3',
    'gameAssets:medal_gold_rank_1': 'Textures/UI/Atlases/LeaderboardV2/medal_gold_rank_1',
    'gameAssets:medal_silver_rank_2': 'Textures/UI/Atlases/LeaderboardV2/medal_silver_rank_2',
    'gameAssets:my_ranking_panel': 'Textures/UI/Atlases/LeaderboardV2/my_ranking_panel',
    'gameAssets:bean_skin_01': 'BeanSkins/icons/bean_skin_01',
    'gameAssets:bean_skin_02': 'BeanSkins/icons/bean_skin_02',
    'gameAssets:bean_skin_03': 'BeanSkins/icons/bean_skin_03',
    'gameAssets:bean_skin_04': 'BeanSkins/icons/bean_skin_04',
    'gameAssets:bean_skin_05': 'BeanSkins/icons/bean_skin_05',
});

export function getLocalAtlasMemberRoute(bundleName: LocalAtlasBundleName, assetName: string): string {
    return LOCAL_ATLAS_MEMBER_ROUTES[`${bundleName}:${assetName}`] || '';
}

export function isLocalAtlasMember(bundleName: LocalAtlasBundleName, assetName: string): boolean {
    return getLocalAtlasMemberRoute(bundleName, assetName) !== '';
}
