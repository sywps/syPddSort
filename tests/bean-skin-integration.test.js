const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const expectedIds = [2000, 2001, 2002, 2003, 2004];
const expectedKeys = expectedIds.map((_, index) => `bean_skin_0${index + 1}`);
const expectedFrames = [];
for (let colorId = 1; colorId <= 20; colorId++) {
    const colorKey = `b${colorId < 10 ? `00${colorId}` : `0${colorId}`}`;
    for (const variant of [1, 2, 4]) expectedFrames.push(`${colorKey}_${variant}`);
}

const catalogPath = 'assets/GameAssetsBundle/BeanSkins/bean-skins.json';
const catalog = readJson(catalogPath);
const panelPrefab = readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/BackgroundSkinPanel.prefab');
const prefabObject = (ref) => panelPrefab[ref.__id__];
const requirePrefabChild = (parent, name, context) => {
    const childRef = parent._children.find((ref) => prefabObject(ref)?._name === name);
    assert.ok(childRef, `${context}/${name} node`);
    return prefabObject(childRef);
};
const hasPrefabComponent = (node, type) => node._components.some((ref) => prefabObject(ref)?.__type__ === type);
const prefabRoot = prefabObject(panelPrefab[0].data);
const panelBox = requirePrefabChild(prefabRoot, 'Box', 'BackgroundSkinPanel');
const backgroundPage = requirePrefabChild(panelBox, 'Content', 'BackgroundSkinPanel/Box');
const beanPage = requirePrefabChild(panelBox, 'BeanSkinPage', 'BackgroundSkinPanel/Box');
const tabs = requirePrefabChild(panelBox, 'SkinCategoryTabs', 'BackgroundSkinPanel/Box');
const cardList = requirePrefabChild(beanPage, 'CardList', 'BackgroundSkinPanel/Box/BeanSkinPage');
assert.strictEqual(catalog.defaultEquipped, 2000, 'default bean skin id');
assert.deepStrictEqual(catalog.skins.map((skin) => skin.id), expectedIds, 'catalog ids');
assert.deepStrictEqual(catalog.skins.map((skin) => skin.key), expectedKeys, 'neutral product keys');
assert.strictEqual(catalog.skins[0].resourceMode, 'bootstrap_existing', 'default atlas stays in Bootstrap');
assert.ok(catalog.skins.slice(1).every((skin) => skin.resourceMode === 'game_assets_atlas'), 'new atlases use gameAssets');
assert.ok(catalog.skins.slice(1).every((skin) => skin.unlockType === 'ad' && skin.unlockValue === 1), 'new skins need one ad');
assert.ok(!/(type|screw)[_-]?[1-5]/i.test(read(catalogPath)), 'catalog must not expose source package names');

const defaultAtlas = readJson('assets/BootstrapBundle/Beans/bean-atlas-data.json');
for (const frameName of expectedFrames) {
    assert.ok(defaultAtlas.frames[frameName], `default atlas frame ${frameName}`);
}

const seenMetaUuids = new Set();
for (let index = 1; index <= 5; index++) {
    const key = `bean_skin_0${index}`;
    const iconPath = `assets/GameAssetsBundle/BeanSkins/icons/${key}.png`;
    const icon = PNG.sync.read(fs.readFileSync(path.join(root, iconPath)));
    assert.ok(icon.width > 0 && icon.height > 0 && icon.width <= 128 && icon.height <= 128, `${key} icon dimensions`);
    const iconMeta = readJson(`${iconPath}.meta`);
    assert.strictEqual(iconMeta.importer, 'image', `${key} icon importer`);
    assert.ok(!seenMetaUuids.has(iconMeta.uuid), `${key} icon uuid unique`);
    seenMetaUuids.add(iconMeta.uuid);
    if (index === 1) continue;
    const skinDir = `assets/GameAssetsBundle/BeanSkins/skin_0${index}`;
    const atlasData = readJson(`${skinDir}/bean-atlas-data.json`);
    const frameNames = Object.keys(atlasData.frames).sort();
    assert.deepStrictEqual(frameNames, [...expectedFrames].sort(), `${key} exact 60 frames`);
    const atlas = PNG.sync.read(fs.readFileSync(path.join(root, `${skinDir}/bean-atlas.png`)));
    assert.strictEqual(atlas.width, 1024, `${key} atlas width`);
    assert.strictEqual(atlas.height, 1024, `${key} atlas height`);
    for (const [name, rect] of Object.entries(atlasData.frames)) {
        assert.ok(rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0, `${key}/${name} positive rect`);
        assert.ok(rect.x + rect.w <= atlas.width && rect.y + rect.h <= atlas.height, `${key}/${name} rect in atlas`);
    }
    const atlasMeta = readJson(`${skinDir}/bean-atlas.png.meta`);
    assert.strictEqual(atlasMeta.importer, 'image', `${key} atlas importer`);
    assert.strictEqual(atlasMeta.subMetas.f9941.userData.width, 1024, `${key} atlas meta width`);
    assert.strictEqual(atlasMeta.subMetas.f9941.userData.height, 1024, `${key} atlas meta height`);
    assert.ok(!seenMetaUuids.has(atlasMeta.uuid), `${key} atlas uuid unique`);
    seenMetaUuids.add(atlasMeta.uuid);
}

const moduleSource = read('assets/Scripts/Core/GameCtrlModules/BeanSkinModule.ts');
const installerSource = read('assets/Scripts/Core/installGameCtrlModules.ts');
const routeSource = read('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts');
const flowSource = read('assets/Scripts/Core/GameCtrlModules/GameplayLevelFlowModule.ts');
const assetSource = read('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts');
const runtimeSource = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const syncSource = read('assets/Scripts/Core/UserStateSyncMgr.ts');
const cloudSource = read('cloudfunctions/syncUserState/index.js');
const wechatBuildSource = read('scripts/build-wechat.js');

assert.ok(installerSource.includes('installBeanSkinModule(runtime);'), 'bean module installed');
assert.ok(routeSource.includes('ensureEquippedBeanSkinLoadedForLevelData'), 'entry route loads equipped skin');
assert.ok(routeSource.includes('function getRenderReadyAtlasImageAsset(texture: Texture2D | null)'), 'atlas texture validates its ImageAsset');
assert.match(routeSource, /const imageAsset = getRenderReadyAtlasImageAsset\(texture\);[\s\S]*?spriteFrame\?\.isValid[\s\S]*?releaseMode: 'asset', imageAsset/, 'SpriteFrame texture must be render-ready');
assert.match(routeSource, /texture\.image = imgAsset;[\s\S]*?getRenderReadyAtlasImageAsset\(texture\)[\s\S]*?releaseMode: 'dynamic', imageAsset/, 'ImageAsset fallback creates a render-ready dynamic texture');
assert.ok(flowSource.includes('hasEquippedBeanSkinFramesForLevelData'), 'readiness checks equipped skin');
assert.ok(flowSource.includes('return Array.from(colors).sort((a, b) => a - b);'), 'level colors avoid loose Set spread transpilation');
assert.ok(!flowSource.includes('return [...colors].sort((a, b) => a - b);'), 'level colors never use Set spread in release builds');
assert.ok(assetSource.indexOf('getEquippedBeanSkinFrame(cacheKey)') < assetSource.indexOf('const cached = this.getSF(cacheKey)'), 'equipped atlas precedes default cache');
assert.ok(assetSource.includes('safeColorId > 20'), 'bean color id is strict 1-20');
assert.ok(runtimeSource.includes('releaseBeanSkinRuntimeResources'), 'runtime releases bean resources');
assert.ok(moduleSource.includes("{ key: 'background', text: '背景' }"), 'background tab exists');
assert.ok(moduleSource.includes("{ key: 'bean', text: '豆豆' }"), 'bean tab exists');
assert.ok(moduleSource.includes("requireBeanPanelChild(box, 'BeanSkinPage'"), 'runtime binds authored bean page');
assert.ok(moduleSource.includes('prefab/config card count mismatch'), 'runtime fails on prefab/config card mismatch');
assert.ok(!moduleSource.includes('instantiate('), 'bean panel does not clone runtime nodes');
assert.ok(!moduleSource.includes('new Node('), 'bean panel does not create runtime nodes');
assert.ok(!moduleSource.includes('.addComponent('), 'bean panel does not add runtime components');
assert.ok(moduleSource.includes("actionLabel.string = equipped ? '已使用' : '使用'"), 'owned card states');
assert.ok(moduleSource.includes('button.interactable = !equipped'), 'equipped button stays disabled');
assert.ok(!moduleSource.includes('_getBeanSkinSelectionDecor') && !moduleSource.includes('_redrawBeanSkinSelectionDecor'), 'runtime has no equipped decoration path');
assert.ok(moduleSource.includes('actionLabel.node.active = owned') && moduleSource.includes('adIcon.active = !owned'), 'unowned card is ad icon without label');
assert.match(moduleSource, /runRewardedGrant\('bean_skin_unlock',[\s\S]*?grantBeanSkin\(skin\.id\)[\s\S]*?afterGrant:[\s\S]*?equipBeanSkin\(skin\.id/);
assert.strictEqual(backgroundPage._lpos.y, -58.17, 'authored background page y');
assert.strictEqual(prefabObject(backgroundPage._components[0])._contentSize.height, 650, 'authored background page height');
assert.ok(moduleSource.includes('backgroundContent.active = true') && moduleSource.includes('beanContent.active = false'), 'runtime opens on background page');
assert.strictEqual(beanPage._lpos.y, -64, 'authored bean page y');
assert.strictEqual(prefabObject(beanPage._components[0])._contentSize.height, 620, 'authored bean page height');
assert.ok(hasPrefabComponent(beanPage, 'cc.Mask'), 'bean page authored mask');
assert.ok(hasPrefabComponent(cardList, 'cc.UITransform'), 'bean card list authored transform');
const expectedCardPositions = [[-180, 150], [0, 150], [180, 150], [-180, -140], [0, -140]];
for (let index = 1; index <= 5; index++) {
    const cardName = `BeanSkinCard_0${index}`;
    const card = requirePrefabChild(cardList, cardName, 'BackgroundSkinPanel/Box/BeanSkinPage/CardList');
    assert.strictEqual(card._lpos.x, expectedCardPositions[index - 1][0], `${cardName} x`);
    assert.strictEqual(card._lpos.y, expectedCardPositions[index - 1][1], `${cardName} y`);
    assert.strictEqual(card._lscale.x, 0.76, `${cardName} scale x`);
    assert.ok(hasPrefabComponent(card, 'cc.UITransform'), `${cardName} authored transform`);
    const preview = requirePrefabChild(card, 'Preview', cardName);
    const action = requirePrefabChild(card, 'ActionBtn', cardName);
    const actionLabel = requirePrefabChild(action, 'ActionLbl', `${cardName}/ActionBtn`);
    const adIcon = requirePrefabChild(action, 'AdIcon', `${cardName}/ActionBtn`);
    const actionButton = action._components.map(prefabObject).find((component) => component?.__type__ === 'cc.Button');
    assert.ok(hasPrefabComponent(preview, 'cc.Sprite'), `${cardName} Preview Sprite`);
    assert.ok(actionButton, `${cardName} ActionBtn Button`);
    assert.ok(hasPrefabComponent(actionLabel, 'cc.Label'), `${cardName} ActionLbl Label`);
    assert.ok(hasPrefabComponent(adIcon, 'cc.Sprite'), `${cardName} AdIcon Sprite`);
    assert.deepStrictEqual(
        [actionButton._disabledColor.r, actionButton._disabledColor.g, actionButton._disabledColor.b, actionButton._disabledColor.a],
        [255, 255, 255, 255],
        `${cardName} disabled button keeps normal brightness`,
    );
    assert.ok(!card._children.some((ref) => ['EquippedOutline', 'EquippedCheck'].includes(prefabObject(ref)?._name)), `${cardName} has no equipped decoration`);
}
const loadError = requirePrefabChild(cardList, 'BeanSkinLoadError', 'BackgroundSkinPanel/Box/BeanSkinPage/CardList');
assert.strictEqual(loadError._active, false, 'bean load error starts hidden');
for (const key of ['background', 'bean']) {
    const tab = requirePrefabChild(tabs, `SkinCategoryTab_${key}`, 'BackgroundSkinPanel/Box/SkinCategoryTabs');
    requirePrefabChild(tab, 'Label', `SkinCategoryTab_${key}`);
    assert.ok(hasPrefabComponent(tab, 'cc.Graphics'), `SkinCategoryTab_${key} Graphics`);
}
for (const field of ['ownedBeanSkinIds', 'equippedBeanSkinId', 'equippedBeanSkinUpdatedAt']) {
    assert.ok(syncSource.includes(field), `client sync field ${field}`);
    assert.ok(cloudSource.includes(field), `cloud sync field ${field}`);
}
for (const resourcePath of catalog.skins.flatMap((skin) => [skin.iconKey, skin.atlasDataKey, skin.atlasTextureKey]).filter(Boolean)) {
    assert.ok(wechatBuildSource.includes(`'${resourcePath}'`), `WeChat build asserts ${resourcePath}`);
}
assert.ok(exists('assets/Scripts/Core/GameCtrlModules/BeanSkinModule.ts.meta'), 'bean module meta');

console.log('bean-skin-integration.test.js passed');
