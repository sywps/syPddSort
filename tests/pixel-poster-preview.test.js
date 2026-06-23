const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const renderer = read('assets/Scripts/Core/PixelPosterPreviewRenderer.ts');
assert.ok(renderer.includes("export type PixelPosterPreviewMode = 'list' | 'poster' | 'win'"), 'pixel poster renderer must expose list/poster/win modes');
assert.ok(renderer.includes('export function renderPixelPosterPreview'), 'pixel poster renderer must expose the shared render entry');
assert.ok(renderer.includes("mode === 'list' ? 14 : 12"), 'small previews must suppress heavy internal bean texture');
assert.ok(renderer.includes('size + bleed'), 'pixel cells must bleed slightly to avoid white seams');
assert.ok(renderer.includes('Math.min(1.25, size * 0.055)'), 'pixel cells must keep subtle corner rounding');

const collection = read('assets/Scripts/Core/GameCtrlModules/CollectionAvatarModule.ts');
assert.ok(collection.includes("import { renderPixelPosterPreview } from '../PixelPosterPreviewRenderer';"), 'collection module must import the shared pixel poster renderer');
assert.ok(collection.includes("name: 'Preview'"), 'large pattern preview must render into the Preview node');
assert.ok(collection.includes("name: 'PixelPreview'"), 'card/home preview must render into the PixelPreview node');
assert.ok(collection.includes("Math.min(maxW, maxH) >= 220 ? 'poster' : 'list'"), 'large home previews must use poster mode while small collection cards use list mode');
assert.ok(collection.includes('renderPixelPosterPreview(parent, correctArr'), 'collection preview methods must call the shared renderer');

const themePanel = read('assets/Scripts/Core/GameCtrlModules/ThemePanelFlowModule.ts');
assert.ok(themePanel.includes('this.drawBeanPreviewGrid(card, data.correctColorArr'), 'collection detail preview must route through drawBeanPreviewGrid');
assert.ok(!themePanel.includes('[collection-preview] bean SpriteFrames unavailable'), 'collection detail preview must not be blocked by bean SpriteFrame availability');
assert.ok(!themePanel.includes('_prepareBeanFramesForLevelData(data, drawPreview)'), 'collection detail preview must not wait for bean atlas loading');

const home = read('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts');
assert.ok(home.includes('drawHomeLevelPixelPreview(parent: Node, levelId: number'), 'home module must expose next-level preview drawing');
assert.ok(home.includes('this.drawCollectionPixelPreviewOnCard(previewAnchor, levelId, x, y, frameSize, frameSize);'), 'home next-level preview must reuse the shared card preview path');

const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
assert.ok(settlement.includes('drawWinPatternPreview()'), 'settlement module must draw a win pattern preview');
assert.ok(settlement.includes('this.drawBeanPreviewGrid('), 'win pattern preview must reuse the shared large pattern preview path');

const installer = read('assets/Scripts/Core/installGameCtrlModules.ts');
assert.ok(installer.indexOf('installCollectionAvatarModule(runtime);') >= 0, 'collection avatar module must be installed');
assert.ok(installer.indexOf('installThemePanelFlowModule(runtime);') > installer.indexOf('installCollectionAvatarModule(runtime);'), 'theme panel flow must be installed after collection preview helpers');

console.log('pixel-poster-preview.test.js passed');
