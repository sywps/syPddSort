const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const BOOTSTRAP_IMAGE_UUID = 'e82626ae-c0c9-aa40-532e-293d6db5eaf2';
const BOOTSTRAP_SPRITE_FRAME_UUID = `${BOOTSTRAP_IMAGE_UUID}@f9941`;
const HOME_IMAGE_UUID = 'ad83774d-dd9c-457f-98a5-fb251fa00f23';
const HOME_SPRITE_FRAME_UUID = `${HOME_IMAGE_UUID}@f9941`;
const FIRST_SKIN_ICON_UUID = '17e3b06f-3135-45de-a732-8f89104751e1';
const SOURCE_IMAGE = 'assets/HomeAssetsBundle/GameUI/home_bg.jpeg';
const SOURCE_META = `${SOURCE_IMAGE}.meta`;
const TARGET_IMAGE = 'assets/BootstrapBundle/GameUI/home_bg.jpeg';
const TARGET_META = `${TARGET_IMAGE}.meta`;
const HOME_IMAGE = 'assets/HomeAssetsBundle/GameUI/home_bg_home.jpeg';
const HOME_META = `${HOME_IMAGE}.meta`;
const FIRST_SKIN_ICON = 'assets/GameAssetsBundle/Skins/Icons/bg_000.png';
const FIRST_SKIN_ICON_META = `${FIRST_SKIN_ICON}.meta`;

function absolute(relativePath) {
    return path.join(root, relativePath);
}

function read(relativePath) {
    return fs.readFileSync(absolute(relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function sha256(relativePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(absolute(relativePath))).digest('hex');
}

function collectMetaOwners(directory, uuid, result = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            collectMetaOwners(entryPath, uuid, result);
        } else if (entry.name.endsWith('.meta') && fs.readFileSync(entryPath, 'utf8').includes(uuid)) {
            result.push(path.relative(root, entryPath).replace(/\\/g, '/'));
        }
    }
    return result;
}

function assertSceneUsesBackground(relativePath, spriteFrameUuid, label) {
    const records = JSON.parse(read(relativePath));
    const sprites = records.filter(
        (record) => record?.__type__ === 'cc.Sprite' && record._spriteFrame?.__uuid__ === spriteFrameUuid,
    );
    assert.strictEqual(sprites.length, 1, `${relativePath} must reference ${label} once`);
    const backgroundNode = records[sprites[0].node?.__id__];
    assert.strictEqual(backgroundNode?._name, 'BG', `${relativePath} ${label} must belong to BG`);
}

assert.ok(!fs.existsSync(absolute(SOURCE_IMAGE)), 'home_bg image must leave HomeAssetsBundle');
assert.ok(!fs.existsSync(absolute(SOURCE_META)), 'home_bg meta must leave HomeAssetsBundle');
assert.ok(fs.existsSync(absolute(TARGET_IMAGE)), 'home_bg image must live in BootstrapBundle/GameUI');
assert.ok(fs.existsSync(absolute(TARGET_META)), 'home_bg meta must live in BootstrapBundle/GameUI');
assert.ok(fs.existsSync(absolute(HOME_IMAGE)), 'Home.scene must own a dedicated home background image');
assert.ok(fs.existsSync(absolute(HOME_META)), 'Home.scene must own a dedicated home background meta');

const bootstrapMeta = JSON.parse(read(TARGET_META));
assert.strictEqual(bootstrapMeta.uuid, BOOTSTRAP_IMAGE_UUID, 'Bootstrap home_bg image UUID must be preserved');
assert.strictEqual(bootstrapMeta.subMetas?.f9941?.uuid, BOOTSTRAP_SPRITE_FRAME_UUID, 'Bootstrap home_bg SpriteFrame UUID must be preserved');
const homeMeta = JSON.parse(read(HOME_META));
assert.strictEqual(homeMeta.uuid, HOME_IMAGE_UUID, 'Home background image must use an independent UUID');
assert.strictEqual(homeMeta.subMetas?.f9941?.uuid, HOME_SPRITE_FRAME_UUID, 'Home background SpriteFrame UUID must match Home.scene');
assert.notStrictEqual(HOME_IMAGE_UUID, BOOTSTRAP_IMAGE_UUID, 'Home and Bootstrap backgrounds must not share a Cocos UUID');
assert.strictEqual(
    sha256(TARGET_IMAGE),
    'f1b6b94a91955a23262d10ab22afcb2ea502bd42b3065dcd7e599cbf30196bed',
    'home_bg image bytes must not change during the move',
);
assert.strictEqual(
    sha256(HOME_IMAGE),
    sha256(TARGET_IMAGE),
    'Home background image must retain the approved Bootstrap background pixels',
);
assert.strictEqual(
    sha256(TARGET_META),
    'dd20fc9475a2f17a6e469b404540ba1cfe46843f0aa5597e7abb81adb4540bc5',
    'home_bg meta bytes must not change during the move',
);
assert.deepStrictEqual(
    collectMetaOwners(absolute('assets'), BOOTSTRAP_IMAGE_UUID).sort(),
    [TARGET_META],
    'Bootstrap home_bg UUID must have exactly one owning meta file',
);
assert.deepStrictEqual(
    collectMetaOwners(absolute('assets'), HOME_IMAGE_UUID).sort(),
    [HOME_META],
    'Home background UUID must have exactly one owning meta file',
);

assert.ok(fs.existsSync(absolute(FIRST_SKIN_ICON)), 'first-skin home_bg thumbnail must exist');
assert.ok(fs.existsSync(absolute(FIRST_SKIN_ICON_META)), 'first-skin thumbnail meta must exist');
const firstSkinIconMeta = JSON.parse(read(FIRST_SKIN_ICON_META));
assert.strictEqual(firstSkinIconMeta.uuid, FIRST_SKIN_ICON_UUID, 'first-skin thumbnail UUID must be preserved');
assert.strictEqual(
    sha256(FIRST_SKIN_ICON),
    '590e452fb22ffbcfa3129041731ff19fe4e406903114302a1f311205edf7950a',
    'first-skin thumbnail must show the approved home_bg crop',
);

assertSceneUsesBackground('assets/HomeAssetsBundle/Scenes/Home.scene', HOME_SPRITE_FRAME_UUID, 'home background');
assertSceneUsesBackground('assets/BootstrapBundle/Scenes/Game.scene', BOOTSTRAP_SPRITE_FRAME_UUID, 'Bootstrap gameplay background');

const skinConfig = JSON.parse(read('assets/GameAssetsBundle/Skins/skins.json'));
const defaultSkin = skinConfig.skins.find((skin) => skin.id === skinConfig.defaultEquipped);
assert.ok(defaultSkin?.isDefault, 'defaultEquipped must resolve to the default skin');
assert.strictEqual(defaultSkin.assetBundle, 'bootstrap');
assert.strictEqual(defaultSkin.assetKey, 'GameUI/home_bg');
assert.strictEqual(defaultSkin.iconBundle, 'gameAssets');
assert.strictEqual(defaultSkin.iconKey, 'Skins/Icons/bg_000');
assert.ok(!skinConfig.skins.some((skin) => skin.id === 1001), 'retired skin 1001 must leave local config');

const skinModule = read('assets/Scripts/Core/GameCtrlModules/SkinBackgroundModule.ts');
const defaultBranchStart = skinModule.indexOf('if (equippedId === DEFAULT_BACKGROUND_SKIN_ID)');
const defaultBranchEnd = skinModule.indexOf('const shortId = equippedId >= 1000', defaultBranchStart);
assert.ok(defaultBranchStart >= 0 && defaultBranchEnd > defaultBranchStart, 'local default skin branch must exist');
const defaultBranch = skinModule.slice(defaultBranchStart, defaultBranchEnd);
assert.ok(defaultBranch.includes("assetKey: 'GameUI/home_bg'"), 'local default skin row must use home_bg');
assert.ok(skinModule.includes('RETIRED_BACKGROUND_SKIN_IDS = new Set<number>([1001])'), 'runtime must explicitly retire skin 1001');
assert.strictEqual((skinModule.match(/!isRetiredBackgroundSkinId\(raw\.id\)/g) || []).length, 2, 'local and CDN configs must both exclude retired skins');
assert.ok(skinModule.includes('return isRetiredBackgroundSkinId(id) ? DEFAULT_BACKGROUND_SKIN_ID : id;'), 'retired equipped skin must resolve to default');
assert.ok(skinModule.includes('_sanitizeRetiredBackgroundSkinState(): boolean'), 'stored retired skin state must be cleaned without rerunning the reset');

const bootstrapPatch = read('scripts/patch-bootstrap-dynamic-assets.js');
assert.ok(bootstrapPatch.includes("'GameUI/home_bg'"), 'Bootstrap image allowlist must include home_bg');
const downscaleScript = read('scripts/downscale-large-textures.js');
assert.ok(downscaleScript.includes(TARGET_IMAGE), 'texture maintenance script must use the new home_bg path');
assert.ok(!downscaleScript.includes(SOURCE_IMAGE), 'texture maintenance script must not use the old home_bg path');

console.log('home-bg-bootstrap-ownership.test.js passed');
