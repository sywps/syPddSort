const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const homeBannerUuid = 'e140c1b6-a30c-4331-8fe0-b86dff4dac7d';
const winPanelBannerUuid = 'be42d22d-0aeb-4a3c-a253-2d2ae53c05cd';

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readJson(relPath) {
    return JSON.parse(read(relPath));
}

function countOccurrences(text, value) {
    return text.split(value).length - 1;
}

function readPngSize(buffer) {
    assert.ok(buffer.length >= 24, 'PNG buffer should contain an IHDR');
    assert.strictEqual(buffer[0], 0x89, 'PNG signature byte 0');
    assert.strictEqual(buffer[1], 0x50, 'PNG signature byte 1');
    assert.strictEqual(buffer[2], 0x4e, 'PNG signature byte 2');
    assert.strictEqual(buffer[3], 0x47, 'PNG signature byte 3');
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
    };
}

const winPanel = read('assets/GameAssetsBundle/UI/Prefabs/Panels/WinPanel.prefab');
const winPanelJson = JSON.parse(winPanel);
const homeMeta = readJson('assets/HomeAssetsBundle/GameUI/横幅光效.png.meta');
const winPanelMeta = readJson('assets/GameAssetsBundle/Textures/UI/横幅光效.png.meta');

assert.strictEqual(homeMeta.uuid, homeBannerUuid, 'Home banner glow UUID must remain owned by HomeAssetsBundle');
assert.strictEqual(winPanelMeta.uuid, winPanelBannerUuid, 'WinPanel banner glow must have a route-owned GameAssetsBundle UUID');
assert.notStrictEqual(winPanelMeta.uuid, homeMeta.uuid, 'WinPanel banner glow must not reuse the HomeAssetsBundle UUID');
assert.strictEqual(
    winPanelMeta.subMetas['6c48a'].uuid,
    `${winPanelBannerUuid}@6c48a`,
    'WinPanel route-owned texture submeta must use the GameAssetsBundle UUID',
);
assert.strictEqual(
    winPanelMeta.subMetas.f9941.uuid,
    `${winPanelBannerUuid}@f9941`,
    'WinPanel route-owned SpriteFrame submeta must use the GameAssetsBundle UUID',
);
assert.strictEqual(
    winPanelMeta.subMetas.f9941.userData.imageUuidOrDatabaseUri,
    `${winPanelBannerUuid}@6c48a`,
    'WinPanel route-owned SpriteFrame must point at its own texture submeta',
);
assert.strictEqual(
    winPanelMeta.userData.redirect,
    `${winPanelBannerUuid}@6c48a`,
    'WinPanel route-owned image meta redirect must point at its own texture submeta',
);

assert.ok(
    winPanel.includes(`"__uuid__": "${winPanelBannerUuid}@f9941"`),
    'WinPanel.prefab must bind 横幅光效 to the route-owned GameAssetsBundle SpriteFrame',
);
assert.strictEqual(
    countOccurrences(winPanel, `${winPanelBannerUuid}@f9941`),
    1,
    'WinPanel.prefab should bind the route-owned banner glow SpriteFrame once',
);
assert.ok(
    !winPanel.includes(`${homeBannerUuid}@f9941`),
    'WinPanel.prefab must not reference the HomeAssetsBundle banner glow SpriteFrame',
);

const findNode = (name) => winPanelJson.find((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === name);
const settlementTopHud = findNode('SettlementTopHud');
const settlementSettings = findNode('SettingsButton');
const settlementGold = findNode('GoldGroup');
assert.ok(settlementTopHud && settlementSettings && settlementGold, 'WinPanel must own its minimal settlement HUD nodes');
assert.ok(winPanel.includes('d301f7b8-b783-6861-36c5-31dbb54a2ac0@f9941'), 'settlement settings must use the bootstrap-owned settings art');
const settlementGoldMeta = readJson('assets/GameAssetsBundle/Textures/UI/settlement_gold_banner.png.meta');
assert.strictEqual(settlementGoldMeta.uuid, '2cdb93ff-01d5-4df6-9159-c7102c6a27a1', 'settlement gold banner must have a route-owned GameAssets UUID');
assert.ok(winPanel.includes(`${settlementGoldMeta.uuid}@f9941`), 'WinPanel must bind the route-owned settlement gold banner');
assert.ok(
    fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/Textures/UI/settlement_gold_banner.png'))
        .equals(fs.readFileSync(path.join(root, 'assets/HomeAssetsBundle/GameUI/金币框 (2).png'))),
    'route-owned settlement gold art must preserve the approved visual bytes',
);
assert.ok(!winPanel.includes('0e1ed6f8-e8e5-4b18-b013-3b127dc041cd@f9941'), 'WinPanel must not depend on the Home settings UUID');
assert.ok(!winPanel.includes('47b2f68a-ec42-b2e7-59e3-7ceba831b196@f9941'), 'WinPanel must not depend on the Home gold-banner UUID');

const homeImage = fs.readFileSync(path.join(root, 'assets/HomeAssetsBundle/GameUI/横幅光效.png'));
const winPanelImage = fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/Textures/UI/横幅光效.png'));
const winPanelImageSize = readPngSize(winPanelImage);
assert.ok(homeImage.equals(winPanelImage), 'WinPanel route-owned banner glow should match the Home visual bytes while keeping a separate UUID');
assert.deepStrictEqual(winPanelImageSize, { width: 320, height: 320 }, 'WinPanel route-owned banner glow should be downscaled to the runtime display budget');
assert.ok(winPanelImage.length <= 130 * 1024, 'WinPanel route-owned banner glow should stay around the 100KB package budget');

const defaultSkinIcon = fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/Skins/Icons/bg_000.png'));
assert.deepStrictEqual(readPngSize(defaultSkinIcon), { width: 180, height: 288 }, 'bg_000 skin icon should be a real thumbnail, not the full background');
assert.ok(defaultSkinIcon.length <= 100 * 1024, 'bg_000 skin icon should stay near the requested 100KB budget');

console.log('win-panel-route-owned-assets.test.js passed');
