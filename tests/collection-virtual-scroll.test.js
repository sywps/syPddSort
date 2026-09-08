const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function extractMethod(sourceText, signature) {
    const start = sourceText.indexOf(signature);
    assert.ok(start >= 0, `missing method signature: ${signature}`);
    const bodyMarker = sourceText.indexOf(') {', start);
    const open = bodyMarker >= 0 ? bodyMarker + 2 : -1;
    assert.ok(open >= 0, `missing method body: ${signature}`);
    let depth = 0;
    for (let index = open; index < sourceText.length; index += 1) {
        if (sourceText[index] === '{') depth += 1;
        if (sourceText[index] === '}') depth -= 1;
        if (depth === 0) return sourceText.slice(start, index + 1);
    }
    throw new Error(`unterminated method body: ${signature}`);
}

function compileObjectMethod(sourceText, signature, dependencies) {
    const method = extractMethod(sourceText, signature);
    const parameterStart = method.indexOf('(');
    const output = ts.transpileModule(`function extractedMethod${method.slice(parameterStart)}`, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
    const names = Object.keys(dependencies);
    const values = names.map((name) => dependencies[name]);
    return new Function(...names, `${output}; return extractedMethod;`)(...values);
}
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/CollectionAvatarModule.ts'),
    'utf8',
).replace(/\r\n/g, '\n');
const flowSource = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/CollectionGuideModule.ts'),
    'utf8',
);
const panelSource = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/Panels/CollectionPanelController.ts'),
    'utf8',
);

const helperStart = source.indexOf('export function resolveCollectionVirtualWindow(');
const helperEnd = source.indexOf('function getRankTextColor', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'collection virtual window helper must remain extractable');

const helperSource = source.slice(helperStart, helperEnd);
const helperOutput = ts.transpileModule(helperSource, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
}).outputText;
const helperModule = { exports: {} };
vm.runInNewContext(helperOutput, {
    module: helperModule,
    exports: helperModule.exports,
    Math,
    Number,
}, { filename: 'collection-virtual-window.ts' });

const {
    readCollectionPreviewGridCache,
    rememberCollectionPreviewGrid,
    resolveCollectionVirtualWindow,
} = helperModule.exports;
assert.strictEqual(typeof resolveCollectionVirtualWindow, 'function');
assert.strictEqual(typeof readCollectionPreviewGridCache, 'function');
assert.strictEqual(typeof rememberCollectionPreviewGrid, 'function');

const entryCount = 300;
const columnCount = 2;
const viewH = 480;
const rowPitch = 200;
const bufferRows = 2;
const rowCount = Math.ceil(entryCount / columnCount);
const topPadding = 40;
const bottomPadding = 40;
const totalH = topPadding + (rowCount - 1) * rowPitch + bottomPadding;
const startY = totalH / 2 - topPadding;
const minScrollY = -(totalH - viewH) / 2;
const maxScrollY = (totalH - viewH) / 2;

const initialWindow = resolveCollectionVirtualWindow(
    entryCount,
    columnCount,
    viewH,
    rowPitch,
    startY,
    minScrollY,
    bufferRows,
);
assert.strictEqual(initialWindow.poolSize, 18, 'the 300-entry catalog must allocate only nine two-card rows');
assert.ok(initialWindow.poolSize < entryCount, 'catalog size must not determine instantiated card count');

for (let contentY = minScrollY; contentY <= maxScrollY; contentY += 73) {
    const window = resolveCollectionVirtualWindow(
        entryCount,
        columnCount,
        viewH,
        rowPitch,
        startY,
        contentY,
        bufferRows,
    );
    assert.ok(window.firstIndex >= 0);
    assert.ok(window.lastIndexExclusive <= entryCount);
    assert.ok(
        window.lastIndexExclusive - window.firstIndex <= window.poolSize,
        'every scroll position must fit inside the fixed card pool',
    );
}

const nextRowWindow = resolveCollectionVirtualWindow(
    entryCount,
    columnCount,
    viewH,
    rowPitch,
    startY,
    minScrollY + rowPitch,
    bufferRows,
);
assert.strictEqual(nextRowWindow.poolSize, initialWindow.poolSize, 'scrolling must keep the pool size fixed');
assert.ok(nextRowWindow.firstIndex >= initialWindow.firstIndex, 'scrolling down must advance or retain the first bound entry');

const previewCache = new Map();
const gridA = [[1]];
const gridB = [[2]];
const gridC = [[3]];
rememberCollectionPreviewGrid(previewCache, 'level_1', gridA, 2);
rememberCollectionPreviewGrid(previewCache, 'level_2', gridB, 2);
assert.strictEqual(readCollectionPreviewGridCache(previewCache, 'level_1'), gridA, 'reading a cached preview must return and refresh it');
rememberCollectionPreviewGrid(previewCache, 'level_3', gridC, 2);
assert.strictEqual(previewCache.has('level_1'), true, 'a recently read preview must remain cached');
assert.strictEqual(previewCache.has('level_2'), false, 'the least recently used preview must be evicted at the limit');
assert.strictEqual(previewCache.has('level_3'), true, 'the newest preview must remain cached');

const eventTypes = {
    TOUCH_START: 'touch-start',
    TOUCH_MOVE: 'touch-move',
    TOUCH_END: 'touch-end',
    TOUCH_CANCEL: 'touch-cancel',
};
const setupCollectionScroll = compileObjectMethod(source, 'setupCollectionScroll(viewport: Node', {
    COLLECTION_PREVIEW_SETTLE_DELAY_SECONDS: 0.08,
    LEADERBOARD_SCROLL_DECAY: 0.9,
    LEADERBOARD_SCROLL_MIN_SPEED: 30,
    Node: { EventType: eventTypes },
});
const handlers = new Map();
const viewport = {
    isValid: true,
    targetOff() {},
    on(event, handler) {
        handlers.set(event, handler);
    },
};
const content = {
    isValid: true,
    position: { x: 0, y: 0, z: 0 },
    setPosition(x, y, z) {
        this.position = { x, y, z };
    },
};
const delayedCalls = [];
const cancelledCalls = [];
const renderCalls = [];
const scrollRuntime = {
    _collectionVirtualState: { viewport, content, generation: 1, previewFlushCallback: null },
    _collectionScrollInertiaStep: null,
    unschedule(callback) {
        cancelledCalls.push(callback);
    },
    scheduleOnce(callback, delay) {
        delayedCalls.push({ callback, delay });
    },
    schedule() {},
    renderCollectionVisiblePreviews(...args) {
        renderCalls.push(args);
    },
};
setupCollectionScroll.call(scrollRuntime, viewport, content, 480, 1000, 200);
handlers.get(eventTypes.TOUCH_START)({ getUILocation: () => ({ y: 0 }) });
handlers.get(eventTypes.TOUCH_MOVE)({ getUILocation: () => ({ y: 80 }) });
const firstFlush = delayedCalls[0];
assert.strictEqual(renderCalls[0][5], true, 'moving the list must only rebind cards and defer preview loading');
assert.strictEqual(firstFlush.delay, 0.08, 'preview loading must wait for the configured scroll-settle delay');
handlers.get(eventTypes.TOUCH_MOVE)({ getUILocation: () => ({ y: 120 }) });
assert.ok(cancelledCalls.includes(firstFlush.callback), 'continued movement must cancel the previous delayed preview flush');
const latestFlush = delayedCalls[delayedCalls.length - 1];
latestFlush.callback();
assert.strictEqual(renderCalls[renderCalls.length - 1][5], false, 'the latest settled window must load its previews');
assert.strictEqual(scrollRuntime._collectionVirtualState.previewFlushCallback, null, 'the completed flush must release its callback reference');

class FakeGraphics {}
class FakeUITransform {}
const previewRenders = [];
const drawCollectionPixelPreviewOnCard = compileObjectMethod(
    source,
    'drawCollectionPixelPreviewOnCard(\n            parent: Node',
    {
        Graphics: FakeGraphics,
        UITransform: FakeUITransform,
        readCollectionPreviewGridCache,
        rememberCollectionPreviewGrid,
        renderPixelPosterPreview(parent, grid, options) {
            previewRenders.push({ parent, grid, options });
        },
    },
);
const previewContainer = {
    isValid: true,
    getComponent(Type) {
        if (Type === FakeUITransform) return { width: 120, height: 80 };
        return null;
    },
};
const previewParent = {
    isValid: true,
    __collectionPreviewBindingToken: 'token-1',
    getChildByName(name) {
        return name === 'PixelPreview' ? previewContainer : null;
    },
};
const previewState = {
    previewGridCache: new Map(),
    previewLoadWaiters: new Map(),
    previewCacheLimit: 2,
};
const loadCallbacks = [];
const previewRuntime = {
    _collectionVirtualState: previewState,
    loadLevelData(levelId, callback, prefix) {
        loadCallbacks.push({ levelId, callback, prefix });
    },
};
const drawOptions = {
    bindingToken: 'token-1',
    flatCells: true,
    reuseExisting: true,
};
drawCollectionPixelPreviewOnCard.call(previewRuntime, previewParent, 1, 0, 0, 120, 80, 'level_', drawOptions);
drawCollectionPixelPreviewOnCard.call(previewRuntime, previewParent, 1, 0, 0, 120, 80, 'level_', drawOptions);
assert.strictEqual(loadCallbacks.length, 1, 'duplicate visible requests must share one level-data load');
loadCallbacks[0].callback({ correctColorArr: [[1, 2]] });
assert.strictEqual(previewRenders.length, 2, 'every current waiter must receive the shared loaded preview');
assert.strictEqual(previewState.previewGridCache.has('level_1'), true, 'loaded preview data must enter the bounded window cache');
drawCollectionPixelPreviewOnCard.call(previewRuntime, previewParent, 1, 0, 0, 120, 80, 'level_', drawOptions);
assert.strictEqual(loadCallbacks.length, 1, 'a nearby back-scroll must use cached preview data without loading again');
assert.strictEqual(previewRenders.length, 3, 'a cache hit must draw the currently bound card');
assert.strictEqual(previewRenders[2].options.reuseExisting, true, 'cached back-scroll drawing must still reuse Graphics');

previewParent.__collectionPreviewBindingToken = 'token-2';
drawCollectionPixelPreviewOnCard.call(previewRuntime, previewParent, 2, 0, 0, 120, 80, 'level_', {
    ...drawOptions,
    bindingToken: 'token-2',
});
previewParent.__collectionPreviewBindingToken = 'token-3';
loadCallbacks[1].callback({ correctColorArr: [[2]] });
assert.strictEqual(previewRenders.length, 3, 'an obsolete async result must not draw into a recycled card');
assert.strictEqual(previewState.previewGridCache.has('level_2'), true, 'a completed obsolete request may still warm the bounded cache');

assert.ok(source.includes('for (let idx = 0; idx < initialWindow.poolSize; idx++)'), 'instantiation must be capped by the virtual pool');
assert.ok(!source.includes('for (let idx = 0; idx < allEntries.length; idx++)'), 'rendering must not instantiate the whole catalog');
assert.ok(source.includes('const poolIndex = entryIndex % items.length;'), 'overlapping entries must keep their ring-buffer card while scrolling');
assert.ok(source.includes('prefix: entry.prefix'), 'recycled cards must keep the manifest level prefix');
assert.ok(flowSource.includes('openCollectionImageModal(levelId, prefix)'), 'recycled card clicks must retain the rebound detail target');
assert.ok(source.includes('__collectionPreviewBindingToken !== options.bindingToken'), 'stale async previews must be rejected after card reuse');
assert.ok(source.includes('COLLECTION_PREVIEW_SETTLE_DELAY_SECONDS = 0.08'), 'scrolling must wait briefly before requesting new previews');
assert.ok(source.includes('rowPitch, 2, true'), 'scroll movement must rebind cards without immediately loading previews');
assert.ok(source.includes('previewGridCache: new Map<string, number[][]>()'), 'each collection window must own a bounded preview-data cache');
assert.ok(source.includes('COLLECTION_PREVIEW_CACHE_MAX_ENTRIES'), 'preview caching must keep an explicit hard upper bound');
assert.ok(source.includes('previewLoadWaiters: new Map'), 'duplicate requests for the same preview must share one in-flight load');
assert.ok(source.includes('this.unschedule(state.previewFlushCallback)'), 'closing or switching collection content must cancel delayed preview work');
assert.ok(source.includes('reuseExisting: true'), 'virtual cards must reuse their Graphics node after rebinding');
assert.ok(
    (panelSource.match(/runtime\.clearCollectionVirtualState\?\.\(\);/g) || []).length >= 2,
    'stale or failed collection opens must invalidate every pooled async preview',
);

console.log('collection-virtual-scroll.test.js passed');
