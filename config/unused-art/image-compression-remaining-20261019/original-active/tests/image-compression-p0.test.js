const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const resolve = relativePath => path.join(root, relativePath);
const readText = relativePath => fs.readFileSync(resolve(relativePath), 'utf8');
const readJson = relativePath => JSON.parse(readText(relativePath));
const sha256 = relativePath => crypto.createHash('sha256').update(fs.readFileSync(resolve(relativePath))).digest('hex');

const optimized = [
    {
        file: 'assets/BootstrapBundle/GameUI/Atlases/Conveyor/expand.png',
        originalFile: 'assets/BootstrapBundle/GameUI/RainbowConveyor/ConveyorV2/expand.png',
        width: 176,
        height: 134,
        uuid: '31c98820-c66f-4162-b457-53597cda4196',
        originalHash: '9953b62d0fcfab3bff11ec4babb13c06352f9e3b668723220d6f379034e58bc5',
    },
    {
        file: 'assets/BootstrapBundle/GameUI/Atlases/Conveyor/arrow.png',
        originalFile: 'assets/BootstrapBundle/GameUI/RainbowConveyor/ConveyorV2/arrow.png',
        width: 60,
        height: 92,
        uuid: '9c67a6a0-a599-4073-9c40-f6fd0901722f',
        originalHash: '8566b604597cb5e25897ccb147348cc8c357193e01ad7fb429c8200ead18fc06',
    },
    {
        file: 'assets/GameAssetsBundle/Textures/UI/app_transition_loading_background.png',
        width: 720,
        height: 1280,
        uuid: '8e8f0bea-1f21-4ca8-bc0f-e2ba4cd62432',
        originalHash: '06b8e588d328c95b78d266759bc769dda9f17d8c635a471dbf5e29ffd2969537',
    },
];

for (const item of optimized) {
    const png = PNG.sync.read(fs.readFileSync(resolve(item.file)));
    assert.equal(png.width, item.width, `${item.file} width`);
    assert.equal(png.height, item.height, `${item.file} height`);

    const meta = readJson(`${item.file}.meta`);
    const frame = meta.subMetas.f9941.userData;
    assert.equal(meta.uuid, item.uuid, `${item.file} must keep its authored UUID`);
    assert.deepEqual(
        [frame.width, frame.height, frame.rawWidth, frame.rawHeight],
        [item.width, item.height, item.width, item.height],
        `${item.file} Meta dimensions`,
    );
    assert.deepEqual(
        frame.vertices.uv,
        [0, item.height, item.width, item.height, 0, 0, item.width, 0],
        `${item.file} SpriteFrame UV`,
    );

    const original = `config/unused-art/image-compression-p0-20260920/original-active/${item.originalFile || item.file}`;
    assert.equal(sha256(original), item.originalHash, `${item.file} original backup hash`);
    assert(fs.existsSync(resolve(`${original}.meta`)), `${item.file} original Meta backup`);
}

const retired = [
    'assets/GameAssetsBundle/Textures/UI/profile_panel_aqua.png',
    'assets/GameAssetsBundle/Textures/UI/ProfileAqua/top.png',
    'assets/GameAssetsBundle/Textures/UI/ProfileAqua/middle.png',
    'assets/GameAssetsBundle/Textures/UI/ProfileAqua/bottom.png',
];
for (const runtimePath of retired) {
    assert(!fs.existsSync(resolve(runtimePath)), `${runtimePath} must be outside runtime assets`);
    const archived = `config/unused-art/image-compression-p0-20260920/retired-assets/${runtimePath}`;
    assert(fs.existsSync(resolve(archived)), `${runtimePath} must have a recoverable archive`);
    assert(fs.existsSync(resolve(`${archived}.meta`)), `${runtimePath} Meta must have a recoverable archive`);
}
assert(!fs.existsSync(resolve('assets/GameAssetsBundle/Textures/UI/ProfileAqua.meta')));
assert(fs.existsSync(resolve('config/unused-art/image-compression-p0-20260920/retired-assets/assets/GameAssetsBundle/Textures/UI/ProfileAqua.meta')));

const profileGenerator = readText('scripts/create-profile-prefabs.js');
assert(profileGenerator.includes('profile_panel_aqua_v2.png'));
assert(!profileGenerator.includes("profile_panel_aqua.png'"));

const book = 'assets/GameAssetsBundle/Textures/UI/CollectionV2/书.png';
const bookMeta = readJson(`${book}.meta`);
assert(fs.existsSync(resolve(book)), 'CollectionV2 book art is active and must remain in assets');
assert(readText('assets/GameAssetsBundle/UI/Prefabs/Panels/CollectionPanelV2.prefab').includes(`${bookMeta.uuid}@f9941`));

const gameScene = readText('assets/BootstrapBundle/Scenes/Game.scene');
assert.equal((gameScene.match(/9c67a6a0-a599-4073-9c40-f6fd0901722f@f9941/g) || []).length, 21);
assert.equal((gameScene.match(/31c98820-c66f-4162-b457-53597cda4196@f9941/g) || []).length, 1);

console.log('image-compression-p0.test.js passed');
