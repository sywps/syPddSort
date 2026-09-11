const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');

const groups = [
    {
        id: 'bootstrap_conveyor_small',
        bundle: 'bootstrap',
        directory: 'assets/BootstrapBundle/GameUI/RainbowConveyor/Atlases/ConveyorSmall',
        atlas: 'conveyor_small',
        names: ['wf_base_14', 'exit_1', 'exit_2', 'exit_1_2', 'exit_1_3', 'exit_1_4', 'gameProp_2007', 'conveyor_0', 'conveyor_1', 'conveyor_2', 'conveyor_3', 'conveyor_4', 'conveyor_5', 'conveyor_7a', 'conveyor_7b'],
    },
    {
        id: 'bootstrap_pch_capacity',
        bundle: 'bootstrap',
        directory: 'assets/BootstrapBundle/GameUI/RainbowConveyor/Atlases/PchCapacity',
        atlas: 'pch_capacity',
        names: ['pch_capacity_fill_sliced', 'pch_capacity_track_sliced'],
    },
    {
        id: 'bootstrap_game_scene_small',
        bundle: 'bootstrap',
        directory: 'assets/BootstrapBundle/GameUI/Atlases/GameSceneSmall',
        atlas: 'game_scene_small',
        names: ['倒计时', 'board_zoom_fill', 'board_zoom_track', 'board_zoom_thumb', 'board_zoom_locate', 'board_zoom_plus', 'board_zoom_minus', 'gameplay_skill_slot_background', 'guide_bubble_frame', 'guide_hand', 'pch_speed_inactive', 'popup_tool_add_badge', 'popup_tool_count_badge', 'solid_white', 'toast_bubble_background'],
    },
    {
        id: 'game_settings',
        bundle: 'gameAssets',
        directory: 'assets/GameAssetsBundle/Textures/UI/Atlases/Settings',
        atlas: 'settings',
        names: ['popup_settings_sound_icon', 'popup_settings_music_icon', 'popup_settings_vibrate_icon', 'popup_settings_toggle_on', 'popup_settings_toggle_off'],
    },
    {
        id: 'game_leaderboard',
        bundle: 'gameAssets',
        directory: 'assets/GameAssetsBundle/Textures/UI/Atlases/Leaderboard',
        atlas: 'leaderboard',
        names: ['popup_list_row_bg', 'popup_tab_inactive'],
    },
    {
        id: 'game_leaderboard_v2',
        bundle: 'gameAssets',
        directory: 'assets/GameAssetsBundle/Textures/UI/Atlases/LeaderboardV2',
        atlas: 'leaderboard_v2',
        names: ['leaderboard_row_standard', 'leaderboard_title_plaque', 'medal_bronze_rank_3', 'medal_gold_rank_1', 'medal_silver_rank_2', 'my_ranking_panel'],
    },
    {
        id: 'game_bean_skin_icons',
        bundle: 'gameAssets',
        directory: 'assets/GameAssetsBundle/BeanSkins/icons',
        atlas: 'bean_skin_icons',
        names: ['bean_skin_01', 'bean_skin_02', 'bean_skin_03', 'bean_skin_04', 'bean_skin_05'],
    },
];

function assertAtlasMeta(relativePath) {
    const meta = JSON.parse(read(relativePath));
    assert.strictEqual(meta.importer, 'auto-atlas', `${relativePath} importer`);
    assert.strictEqual(meta.userData?.maxWidth, 1024, `${relativePath} maxWidth`);
    assert.strictEqual(meta.userData?.maxHeight, 1024, `${relativePath} maxHeight`);
    assert.strictEqual(meta.userData?.padding, 4, `${relativePath} padding`);
    assert.strictEqual(meta.userData?.allowRotation, false, `${relativePath} rotation`);
    assert.strictEqual(meta.userData?.removeTextureInBundle, true, `${relativePath} removeTextureInBundle`);
    assert.strictEqual(meta.userData?.removeImageInBundle, true, `${relativePath} removeImageInBundle`);
    assert.strictEqual(meta.userData?.removeSpriteAtlasInBundle, true, `${relativePath} removeSpriteAtlasInBundle`);
}

const expectedRoutes = new Map();
const bootstrapPatch = read('scripts/patch-bootstrap-dynamic-assets.js');
for (const group of groups) {
    assert.ok(fs.existsSync(path.join(root, `${group.directory}/${group.atlas}.pac`)), `${group.id} .pac must exist`);
    assertAtlasMeta(`${group.directory}/${group.atlas}.pac.meta`);
    for (const name of group.names) {
        const imagePath = `${group.directory}/${name}.png`;
        assert.ok(fs.existsSync(path.join(root, imagePath)), `${group.id} image missing: ${name}`);
        assert.ok(fs.existsSync(path.join(root, `${imagePath}.meta`)), `${group.id} meta missing: ${name}`);
        const assetPath = imagePath
            .replace(/^assets\/BootstrapBundle\//, '')
            .replace(/^assets\/GameAssetsBundle\//, '')
            .replace(/\.png$/, '');
        expectedRoutes.set(`${group.bundle}:${name}`, assetPath);
        if (group.bundle === 'bootstrap') {
            assert.ok(
                bootstrapPatch.includes(`'${assetPath}'`),
                `${group.id} member must use its migrated Bootstrap allowlist path: ${assetPath}`,
            );
        }
    }
}

const uiManifest = read('assets/Scripts/Core/UiManifest.ts');
assert.ok(uiManifest.includes('LOCAL_ATLAS_MEMBER_ROUTES'), 'UiManifest must export exact local atlas member routes');
assert.ok(uiManifest.includes('getLocalAtlasMemberRoute'), 'UiManifest must export route lookup helper');
assert.ok(uiManifest.includes('isLocalAtlasMember'), 'UiManifest must export atlas membership helper');
for (const [key, assetPath] of expectedRoutes) {
    assert.ok(uiManifest.includes(`'${key}': '${assetPath}'`), `missing exact route ${key} -> ${assetPath}`);
}

const assetBootstrap = read('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts');
assert.ok(assetBootstrap.includes("getLocalAtlasMemberRoute('gameAssets', imgName)"), 'gameAssets loader must prefer exact atlas route');
assert.ok(assetBootstrap.includes("getLocalAtlasMemberRoute('bootstrap', imgName)"), 'Bootstrap loader must prefer exact atlas route');
assert.ok(assetBootstrap.includes("isLocalAtlasMember('gameAssets', imgName)"), 'gameAssets ImageAsset fallback must reject atlas members');
assert.ok(assetBootstrap.includes("isLocalAtlasMember('bootstrap', imgName)"), 'Bootstrap ImageAsset fallback must reject atlas members');

const buildWechat = read('scripts/build-wechat.js');
const beanSkinIconGroup = groups.find((group) => group.id === 'game_bean_skin_icons');
assert.ok(beanSkinIconGroup, 'bean skin icon atlas group must exist');
for (const name of beanSkinIconGroup.names) {
    assert.ok(
        buildWechat.includes(`'BeanSkins/icons/${name}/spriteFrame'`),
        `WeChat artifact gate must require the packed SpriteFrame path for ${name}`,
    );
    assert.ok(
        !buildWechat.includes(`'BeanSkins/icons/${name}',`),
        `WeChat artifact gate must not require the removed standalone path for ${name}`,
    );
}

assert.ok(bootstrapPatch.includes('findAutoAtlasStandaloneSources'), 'Bootstrap patch must detect atlas-routed sources');
assert.ok(bootstrapPatch.includes('findAutoAtlasRemovableNativeUuids'), 'Bootstrap patch must gate native removal by .pac settings');
assert.ok(bootstrapPatch.includes('removedAutoAtlasNative'), 'Bootstrap patch must report removed original natives');

const fillMeta = JSON.parse(read('assets/BootstrapBundle/GameUI/RainbowConveyor/Atlases/PchCapacity/pch_capacity_fill_sliced.png.meta'));
const trackMeta = JSON.parse(read('assets/BootstrapBundle/GameUI/RainbowConveyor/Atlases/PchCapacity/pch_capacity_track_sliced.png.meta'));
for (const [label, meta] of [['fill', fillMeta], ['track', trackMeta]]) {
    const frame = Object.values(meta.subMetas || {}).find((entry) => entry?.importer === 'sprite-frame');
    assert.ok(frame, `${label} SpriteFrame meta missing`);
    const borders = frame.userData || {};
    assert.ok(borders.borderLeft > 0 && borders.borderRight > 0, `${label} sliced horizontal borders must survive`);
}

assert.strictEqual(expectedRoutes.size, 50, 'local atlas migration must cover exactly 50 members');
console.log('local-auto-atlas-contract.test.js passed');
