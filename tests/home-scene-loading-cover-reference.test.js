const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const homeScenePath = path.join(projectDir, 'assets/HomeAssetsBundle/Scenes/Home.scene');
const homeScene = fs.readFileSync(homeScenePath, 'utf8');
const sceneJson = JSON.parse(homeScene);

const staleLoadingCoverUuid = '68c7d0e7-b854-4fd7-903e-6176fb9aebbb@f9941';
assert.ok(
  !homeScene.includes(staleLoadingCoverUuid),
  'Home.scene must not reference the shared loading_cover SpriteFrame outside HomeAssetsBundle',
);
const bootstrapGuideButtonUuid = 'e8f180d2-acaa-487c-aab7-3213ab8bb243@f9941';
assert.ok(
  !homeScene.includes(bootstrapGuideButtonUuid),
  'Home.scene ad wait UI must use a HomeAssets-owned SpriteFrame instead of creating a bootstrap bundle dependency',
);
assert.ok(
  homeScene.includes('"AdPendingStripTemplate"'),
  'Home.scene must keep an authored ad waiting strip for cancellable pre-show feedback',
);

const hostComponent = sceneJson.find((item) => (
  item
  && typeof item === 'object'
  && Object.prototype.hasOwnProperty.call(item, 'loadingCover')
));

assert.ok(hostComponent, 'Home.scene must keep the HomeSceneCtrl/GameRuntimeHost component');
assert.strictEqual(
  hostComponent.loadingCover,
  null,
  'Home.scene does not use GameRuntimeHost.loadingCover; keep it null to avoid invalid homeAssets pack refs',
);

console.log('home-scene-loading-cover-reference.test.js passed');
