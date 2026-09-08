const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const readJson = relative => JSON.parse(read(relative));

const groups = [
    {
        id: 'bootstrap_game_scene_small',
        sourceDir: 'assets/BootstrapBundle/GameUI',
        targetDir: 'assets/BootstrapBundle/GameUI/Atlases/GameSceneSmall',
        pacMeta: 'assets/BootstrapBundle/GameUI/Atlases/GameSceneSmall/game_scene_small.pac.meta',
        members: [
            'popup_ad_play_icon',
            'popup_primary_button',
            'popup_tool_brush_icon',
            'popup_tool_freeze_icon',
            'popup_tool_magnet_icon',
            'popup_tool_wand_icon',
            '设置',
        ],
    },
    {
        id: 'bootstrap_board_effects',
        sourceDir: 'assets/BootstrapBundle/GameUI',
        targetDir: 'assets/BootstrapBundle/GameUI/Atlases/BoardEffects',
        pacMeta: 'assets/BootstrapBundle/GameUI/Atlases/BoardEffects/board_effects.pac.meta',
        members: [
            'block_bright_pindd',
            'pdpx_eff_Mask_01',
            'pdpx_eff_Star_01',
            'pdpx_eff_Trail_02',
        ],
    },
];

const uiManifest = read('assets/Scripts/Core/UiManifest.ts');
const bootstrapPatcher = read('scripts/patch-bootstrap-dynamic-assets.js');
const buildWechat = read('scripts/build-wechat.js');

for (const group of groups) {
    const pacMeta = readJson(group.pacMeta);
    assert.equal(pacMeta.importer, 'auto-atlas', `${group.id} must use Cocos AutoAtlas`);
    assert.equal(pacMeta.userData.removeImageInBundle, true, `${group.id} must remove source ImageAssets`);
    assert.equal(pacMeta.userData.removeTextureInBundle, true, `${group.id} must remove source Textures`);
    assert.equal(pacMeta.userData.removeSpriteAtlasInBundle, true, `${group.id} must remove SpriteAtlas wrapper`);
    assert.equal(pacMeta.userData.allowRotation, false, `${group.id} must not rotate UI frames`);
    assert.equal(pacMeta.userData.padding, 4, `${group.id} must keep 4px padding`);

    for (const member of group.members) {
        const sourceImage = path.join(root, group.sourceDir, `${member}.png`);
        const sourceMeta = `${sourceImage}.meta`;
        const targetImage = path.join(root, group.targetDir, `${member}.png`);
        const targetMeta = `${targetImage}.meta`;
        assert.equal(fs.existsSync(sourceImage), false, `${group.id}/${member} old image path must be removed`);
        assert.equal(fs.existsSync(sourceMeta), false, `${group.id}/${member} old meta path must be removed`);
        assert.equal(fs.existsSync(targetImage), true, `${group.id}/${member} image must exist in atlas folder`);
        assert.equal(fs.existsSync(targetMeta), true, `${group.id}/${member} meta must exist in atlas folder`);
        const meta = JSON.parse(fs.readFileSync(targetMeta, 'utf8'));
        assert.equal(meta.subMetas?.f9941?.userData?.packable, true, `${group.id}/${member} must remain packable`);
        const route = `GameUI/Atlases/${group.id === 'bootstrap_board_effects' ? 'BoardEffects' : 'GameSceneSmall'}/${member}`;
        assert.ok(uiManifest.includes(`'bootstrap:${member}': '${route}'`), `missing atlas route for ${member}`);
        assert.ok(bootstrapPatcher.includes(`'${route}'`), `bootstrap allowlist must use moved path for ${member}`);
        assert.ok(!bootstrapPatcher.includes(`'GameUI/${member}'`), `bootstrap allowlist must not retain old path for ${member}`);
    }
}

for (const member of ['progress_fill', '进度条']) {
    for (const relativePath of [
        `assets/BootstrapBundle/GameUI/${member}.png`,
        `assets/BootstrapBundle/GameUI/${member}.png.meta`,
        `assets/BootstrapBundle/GameUI/Atlases/GameSceneSmall/${member}.png`,
        `assets/BootstrapBundle/GameUI/Atlases/GameSceneSmall/${member}.png.meta`,
    ]) {
        assert.equal(fs.existsSync(path.join(root, relativePath)), false, `obsolete progress resource must be removed: ${relativePath}`);
    }
    assert.equal(uiManifest.includes(`'bootstrap:${member}'`), false, `obsolete progress route must be removed: ${member}`);
    assert.equal(bootstrapPatcher.includes(`GameSceneSmall/${member}`), false, `obsolete progress allowlist entry must be removed: ${member}`);
}

assert.ok(
    uiManifest.includes('.map((name) => `GameUI/Atlases/BoardEffects/${name}`)'),
    'strict board-effect preload paths must point at the BoardEffects atlas folder',
);
assert.ok(
    buildWechat.includes("'GameUI/Atlases/BoardEffects/block_bright_pindd/spriteFrame'"),
    'WeChat package validation must verify the packed SpriteFrame path instead of a removed standalone ImageAsset path',
);
assert.equal(fs.existsSync(path.join(root, 'assets/BootstrapBundle/GameUI/guide_prompt_button.png')), false);
assert.equal(fs.existsSync(path.join(root, 'assets/BootstrapBundle/GameUI/home_bg.jpeg')), true);
assert.equal(fs.existsSync(path.join(root, 'assets/BootstrapBundle/GameUI/loading_cover.jpeg')), true);

console.log('bootstrap-atlas-expansion.test.js passed');
