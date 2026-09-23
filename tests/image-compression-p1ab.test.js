const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const resolve = relativePath => path.join(root, relativePath);
const readText = relativePath => fs.readFileSync(resolve(relativePath), 'utf8');
const readJson = relativePath => JSON.parse(readText(relativePath));
const hash = relativePath => crypto.createHash('sha256').update(fs.readFileSync(resolve(relativePath))).digest('hex');
const archivePrefix = 'config/unused-art/image-compression-p1ab-20260920/original-active/';

const targets = [
    ['assets/GameAssetsBundle/Textures/UI/popup_primary_button.png', 512, 320, 'd32c3490-5ef2-489f-b31d-158385e5b817', 'aea8334b7a17be5d14167de1e75cdab5b54bdc8082df63b9c8cbd4f67bc1e427'],
    ['assets/HomeAssetsBundle/GameUI/home_primary_button.png', 384, 240, '459a1915-ec9f-4d00-a2b2-31b1d4353841', '57fb2da98883172007536ba4493eb4aacbf0235d2568f3d9257ee8a72b430aac'],
    ['assets/HomeAssetsBundle/GameUI/home_secondary_button.png', 384, 240, '8dd98ba0-d425-4b92-a013-d5ab5f2b5e72', 'ae9608ca9e0ff2fb9d3adaa9767c595dcfe98b6875897f2bb5c0ea7c9babae1d'],
    ['assets/GameAssetsBundle/Textures/UI/profile_panel_aqua_v2.png', 924, 1024, '9560bd92-fc83-420d-b670-98f40a19b631', '2c9cbd950f1780e9dd11282a5f3387d485004bd0bbaf87c91a358b67ee4f5c9b'],
    ['assets/GameAssetsBundle/Textures/UI/revive_timeout_illustration.png', 640, 452, '123c4ced-f82b-4826-9499-1d90c53d8478', '9c2746bb964737dc6e527d81c88a8b524a02809fbb4bd76bdcea0ad7cc309347'],
];

for (const [file, width, height, uuid, originalHash] of targets) {
    const png = PNG.sync.read(fs.readFileSync(resolve(file)));
    const meta = readJson(`${file}.meta`);
    const frame = meta.subMetas.f9941.userData;
    const archived = `${archivePrefix}${file}`;
    assert.equal(png.width, width, `${file} width`);
    assert.equal(png.height, height, `${file} height`);
    assert.equal(meta.uuid, uuid, `${file} UUID`);
    assert.equal(frame.rawWidth, width, `${file} Meta rawWidth`);
    assert.equal(frame.rawHeight, height, `${file} Meta rawHeight`);
    assert.equal(hash(archived), originalHash, `${file} original backup hash`);
    assert(fs.existsSync(resolve(`${archived}.meta`)), `${file} original Meta backup`);
    assert(fs.statSync(resolve(file)).size < fs.statSync(resolve(archived)).size, `${file} must be smaller`);
}

const profileMeta = readJson('assets/GameAssetsBundle/Textures/UI/profile_panel_aqua_v2.png.meta').subMetas.f9941.userData;
assert.deepEqual(
    [profileMeta.borderLeft, profileMeta.borderRight, profileMeta.borderTop, profileMeta.borderBottom],
    [108.615, 108.615, 232.727, 116.364],
    'Profile nine-slice borders must scale with the bitmap',
);

const activeProfile = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/ProfilePanel.prefab');
const archivedProfile = readJson(`${archivePrefix}assets/GameAssetsBundle/UI/Prefabs/Panels/ProfilePanel.prefab`);
const findProfileFrame = prefab => {
    const node = prefab.find(entry => entry?.__type__ === 'cc.Node' && entry._name === 'SettingsFrame');
    assert(node, 'Profile SettingsFrame node');
    assert.equal(node._children.length, 0, 'Profile SettingsFrame must remain an isolated image node');
    const components = node._components.map(ref => prefab[ref.__id__]);
    const transform = components.find(component => component?.__type__ === 'cc.UITransform');
    const sprite = components.find(component => component?.__type__ === 'cc.Sprite');
    return { node, transform, sprite };
};
const before = findProfileFrame(archivedProfile);
const after = findProfileFrame(activeProfile);
assert.equal(after.sprite._spriteFrame.__uuid__, '9560bd92-fc83-420d-b670-98f40a19b631@f9941');
for (const axis of ['width', 'height']) {
    const scaleAxis = axis === 'width' ? 'x' : 'y';
    const beforeRendered = before.transform._contentSize[axis] * before.node._lscale[scaleAxis];
    const afterRendered = after.transform._contentSize[axis] * after.node._lscale[scaleAxis];
    assert(Math.abs(beforeRendered - afterRendered) < 0.2, `Profile rendered ${axis} must remain stable`);
}
for (const [border, scaleAxis] of [['borderLeft', 'x'], ['borderRight', 'x'], ['borderTop', 'y'], ['borderBottom', 'y']]) {
    const originalMeta = readJson(`${archivePrefix}assets/GameAssetsBundle/Textures/UI/profile_panel_aqua_v2.png.meta`).subMetas.f9941.userData;
    const beforeRendered = originalMeta[border] * before.node._lscale[scaleAxis];
    const afterRendered = profileMeta[border] * after.node._lscale[scaleAxis];
    assert(Math.abs(beforeRendered - afterRendered) < 0.2, `Profile rendered ${border} must remain stable`);
}

const home = readText('assets/HomeAssetsBundle/Scenes/Home.scene');
assert(home.includes('459a1915-ec9f-4d00-a2b2-31b1d4353841@f9941'));
assert(home.includes('8dd98ba0-d425-4b92-a013-d5ab5f2b5e72@f9941'));
for (const prefab of [
    'AcquireResourcePanel',
    'ArtworkPreview',
    'BackgroundSkinPanel',
    'BufferFullRevivePanel',
    'FeedbackPanel',
    'GameCirclePanel',
    'LosePanel',
    'RecoverVigorPanel',
    'RevivePanel',
    'SettingsPanel',
    'WinPanel',
]) {
    assert(
        readText(`assets/GameAssetsBundle/UI/Prefabs/Panels/${prefab}.prefab`).includes('d32c3490-5ef2-489f-b31d-158385e5b817@f9941'),
        `${prefab} must retain the shared primary button`,
    );
}
for (const prefab of ['RevivePanel', 'LosePanel', 'AppTransition']) {
    assert(readText(`assets/GameAssetsBundle/UI/Prefabs/Panels/${prefab}.prefab`).includes('123c4ced-f82b-4826-9499-1d90c53d8478@f9941'));
}

const downscale = readText('scripts/downscale-large-textures.js');
assert(downscale.includes("process.argv.includes('--p1ab-only')"));
for (const [file] of targets) assert(downscale.includes(file));

console.log('image-compression-p1ab.test.js passed');
