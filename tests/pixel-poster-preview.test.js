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
assert.ok(collection.includes("name: usePrefabContainer ? 'PixelPosterPreview' : 'PixelPreview'"), 'card previews must render inside prefab PixelPreview containers when present');
assert.ok(collection.includes("Math.min(renderW, renderH) >= 220 ? 'poster' : 'list'"), 'large home previews must use poster mode while small collection cards use list mode');
assert.ok(collection.includes('options?: { grayscale?: boolean; maxCellSize?: number; padding?: number }'), 'card previews must allow callers to override fit sizing without duplicating render logic');
assert.ok(collection.includes("maxCellSize: options?.maxCellSize ?? (previewMode === 'poster' ? 32 : 24)"), 'collection cards must keep their default cell cap unless a caller opts into container fit');
assert.ok(collection.includes("padding: options?.padding ?? (previewMode === 'poster' ? 8 : 10)"), 'collection cards must keep their default padding unless a caller opts into container fit');
assert.ok(collection.includes('renderPixelPosterPreview(renderParent, correctArr'), 'collection preview methods must call the shared renderer');

const themePanel = read('assets/Scripts/Core/GameCtrlModules/ThemePanelFlowModule.ts');
assert.ok(themePanel.includes('this.drawBeanPreviewGrid(card, data.correctColorArr'), 'collection detail preview must route through drawBeanPreviewGrid');
assert.ok(!themePanel.includes('[collection-preview] bean SpriteFrames unavailable'), 'collection detail preview must not be blocked by bean SpriteFrame availability');
assert.ok(!themePanel.includes('_prepareBeanFramesForLevelData(data, drawPreview)'), 'collection detail preview must not wait for bean atlas loading');

const themeLoading = read('assets/Scripts/Core/GameCtrlModules/ThemeLoadingOverlayModule.ts');
assert.ok(themeLoading.includes("this.drawCollectionPixelPreviewOnCard(parent, levelId, offsetX, offsetY, maxW, maxH, 'zt_level_', {"), 'theme card previews must reuse the shared card preview path with theme-specific fit options');
assert.ok(themeLoading.includes('maxCellSize: Math.max(maxW, maxH),'), 'theme card previews must not be capped by the collection card default cell size');
assert.ok(themeLoading.includes('padding: 0,'), 'theme card previews must let PreviewContainer define the fit bounds');

const home = read('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts');
assert.ok(home.includes('drawHomeLevelPixelPreview(parent: Node, levelId: number'), 'home module must expose next-level preview drawing');
assert.ok(home.includes('this.drawCollectionPixelPreviewOnCard(previewAnchor, levelId, x, y, frameSize, frameSize);'), 'home next-level preview must reuse the shared card preview path');

const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
assert.ok(settlement.includes('drawWinPatternPreview()'), 'settlement module must draw a win pattern preview');
assert.ok(settlement.includes("import { renderPixelPosterPreview } from '../PixelPosterPreviewRenderer';"), 'settlement module must import the shared pixel poster renderer');
assert.ok(settlement.includes("name: 'PixelPosterPreview'"), 'win pattern preview must render generated content inside PatternPreview');
assert.ok(settlement.includes("previewNode.getChildByName('Preview')?.destroy();"), 'win pattern preview must clean legacy generated nodes without removing PatternPreview');
assert.ok(settlement.includes('maxW = Math.max(120, previewTransform?.width || 392)'), 'win pattern preview width must come from the PatternPreview container');
assert.ok(settlement.includes('maxH = Math.max(120, previewTransform?.height || 228)'), 'win pattern preview height must come from the PatternPreview container');

const installer = read('assets/Scripts/Core/installGameCtrlModules.ts');
assert.ok(installer.indexOf('installCollectionAvatarModule(runtime);') >= 0, 'collection avatar module must be installed');
assert.ok(installer.indexOf('installThemePanelFlowModule(runtime);') > installer.indexOf('installCollectionAvatarModule(runtime);'), 'theme panel flow must be installed after collection preview helpers');

console.log('pixel-poster-preview.test.js passed');
