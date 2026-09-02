const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function loadRendererRuntime() {
    class Color {
        constructor(r, g, b, a = 255) {
            if (typeof r === 'string') {
                const hex = r.replace('#', '');
                this.r = parseInt(hex.slice(0, 2), 16);
                this.g = parseInt(hex.slice(2, 4), 16);
                this.b = parseInt(hex.slice(4, 6), 16);
                this.a = 255;
                return;
            }
            this.r = r;
            this.g = g;
            this.b = b;
            this.a = a;
        }
    }
    class UITransform {
        setContentSize(width, height) {
            this.width = width;
            this.height = height;
        }
    }
    class Graphics {
        constructor() {
            this.pendingRects = [];
            this.fills = [];
        }
        roundRect(...args) {
            this.pendingRects.push(args);
        }
        fill() {
            this.fills.push({
                color: this.fillColor,
                rects: this.pendingRects.slice(),
            });
            this.pendingRects.length = 0;
        }
    }
    class Node {
        constructor(name) {
            this.name = name;
            this.children = [];
            this.components = new Map();
            this.isValid = true;
            this.layer = 0;
        }
        addChild(child) {
            child.parent = this;
            this.children.push(child);
        }
        addComponent(ComponentType) {
            const component = new ComponentType();
            component.node = this;
            this.components.set(ComponentType, component);
            return component;
        }
        getComponent(ComponentType) {
            return this.components.get(ComponentType) || null;
        }
        getChildByName(name) {
            return this.children.find((child) => child.name === name) || null;
        }
        setPosition(x, y, z) {
            this.position = { x, y, z };
        }
        destroy() {
            this.isValid = false;
        }
    }
    const source = ts.transpileModule(renderer, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(source, {
        module,
        exports: module.exports,
        require(id) {
            if (id === 'cc') {
                return {
                    Color,
                    Graphics,
                    Layers: { Enum: { UI_2D: 1 } },
                    Node,
                    UITransform,
                };
            }
            if (id === './LevelConfig') {
                return { COLOR_HEX: { 1: '#FF0000', 2: '#00FF00' } };
            }
            throw new Error(`unexpected require: ${id}`);
        },
    }, { filename: 'PixelPosterPreviewRenderer.ts' });
    return { ...module.exports, Graphics, Node };
}

const renderer = read('assets/Scripts/Core/PixelPosterPreviewRenderer.ts');
assert.ok(renderer.includes("export type PixelPosterPreviewMode = 'list' | 'poster' | 'win'"), 'pixel poster renderer must expose list/poster/win modes');
assert.ok(renderer.includes('export function renderPixelPosterPreview'), 'pixel poster renderer must expose the shared render entry');
assert.ok(renderer.includes('import { Color, Graphics, Layers, Node, UITransform }'), 'shared preview renderer must use lightweight Graphics instead of bean SpriteFrames');
assert.ok(!renderer.includes('SpriteFrame'), 'shared preview renderer must not depend on bean SpriteFrame textures');
assert.ok(renderer.includes("mode === 'list' ? 24 : 42"), 'small previews must cap cell size without loading heavy internal bean texture');
assert.ok(renderer.includes('size + seamBleed'), 'pixel cells must bleed slightly to avoid white seams');
assert.ok(renderer.includes('Math.max(0.5, size * 0.04)'), 'pixel cells must keep subtle corner rounding');
assert.ok(renderer.includes('PIXEL_PREVIEW_BATCH_CELL_LIMIT = 256'), 'tiny pixel previews must bound each merged Graphics submission');
assert.ok(renderer.includes('function drawTinyCellBatches('), 'tiny pixel previews must merge cells instead of filling once per pixel');
assert.ok(renderer.includes('const colorCache = new Map<number, Color>();'), 'preview colors must be reused instead of allocated once per pixel');
assert.ok(renderer.includes('if (cellSize < 7)'), 'only visually tiny cells may use the simplified batched path');
assert.ok(renderer.includes('start += PIXEL_PREVIEW_BATCH_CELL_LIMIT * 2'), 'large previews must split merged paths into bounded chunks');

const rendererRuntime = loadRendererRuntime();
const previewParent = new rendererRuntime.Node('PreviewParent');
const preview = rendererRuntime.renderPixelPosterPreview(previewParent, [[1, 2, 1]], {
    maxW: 12,
    maxH: 4,
    padding: 0,
    maxCellSize: 4,
});
const previewGraphics = preview.getComponent(rendererRuntime.Graphics);
assert.strictEqual(previewGraphics.fills.length, 2, 'three tiny cells using two colors must merge into two fill submissions');
assert.strictEqual(
    previewGraphics.fills.reduce((count, fill) => count + fill.rects.length, 0),
    3,
    'merged tiny-cell rendering must preserve every visible cell',
);
const largePreviewParent = new rendererRuntime.Node('LargePreviewParent');
const largePreview = rendererRuntime.renderPixelPosterPreview(
    largePreviewParent,
    [Array.from({ length: 600 }, () => 1)],
    {
        maxW: 600,
        maxH: 1,
        padding: 0,
        maxCellSize: 1,
    },
);
const largePreviewGraphics = largePreview.getComponent(rendererRuntime.Graphics);
assert.deepStrictEqual(
    largePreviewGraphics.fills.map((fill) => fill.rects.length),
    [256, 256, 88],
    'a single-color preview must split large Graphics paths at the bounded batch size',
);

const collection = read('assets/Scripts/Core/GameCtrlModules/CollectionAvatarModule.ts');
assert.ok(collection.includes("renderPixelPosterPreview } from '../PixelPosterPreviewRenderer';"), 'collection module must import the shared pixel poster renderer');
assert.ok(collection.includes('releasePixelPosterPreviewTree(oldScrollContent);'), 'collection module must release stale generated preview trees before rerendering');
assert.ok(collection.includes("name: 'Preview'"), 'large pattern preview must render into the Preview node');
assert.ok(collection.includes("name: usePrefabContainer ? 'PixelPosterPreview' : 'PixelPreview'"), 'card previews must render inside prefab PixelPreview containers when present');
assert.ok(collection.includes("Math.min(renderW, renderH) >= 220 ? 'poster' : 'list'"), 'large home previews must use poster mode while small collection cards use list mode');
assert.ok(collection.includes('options?: { grayscale?: boolean; maxCellSize?: number; padding?: number }'), 'card previews must allow callers to override fit sizing without duplicating render logic');
assert.ok(collection.includes("maxCellSize: options?.maxCellSize ?? (previewMode === 'poster' ? 32 : 24)"), 'collection cards must keep their default cell cap unless a caller opts into container fit');
assert.ok(collection.includes("padding: options?.padding ?? (previewMode === 'poster' ? 8 : 10)"), 'collection cards must keep their default padding unless a caller opts into container fit');
assert.ok(collection.includes('renderPixelPosterPreview(renderParent, correctArr'), 'collection preview methods must call the shared renderer');

const collectionGuide = read('assets/Scripts/Core/GameCtrlModules/CollectionGuideModule.ts');
assert.ok(collectionGuide.includes('this.drawBeanPreviewGrid(card, data.correctColorArr'), 'collection detail preview must route through drawBeanPreviewGrid');
assert.ok(!collectionGuide.includes('[collection-preview] bean SpriteFrames unavailable'), 'collection detail preview must not be blocked by bean SpriteFrame availability');
assert.ok(!collectionGuide.includes('_prepareBeanFramesForLevelData(data, drawPreview)'), 'collection detail preview must not wait for bean atlas loading');

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
assert.ok(installer.indexOf('installThemePanelFlowModule(runtime);') > installer.indexOf('installCollectionAvatarModule(runtime);'), 'theme gameplay flow must be installed after collection preview helpers');
assert.ok(installer.indexOf('installCollectionGuideModule(runtime);') > installer.indexOf('installCollectionAvatarModule(runtime);'), 'collection guide module must be installed after collection preview helpers');

console.log('pixel-poster-preview.test.js passed');
