'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));

function loadTsModule(relativePath, mocks = {}) {
    const filename = path.join(root, relativePath);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        fileName: filename,
    }).outputText;
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        loaded._compile(output, filename);
    } finally {
        Module._load = originalLoad;
    }
    return loaded.exports;
}

const levelConfig = loadTsModule('assets/Scripts/Core/LevelConfig.ts');
assert.strictEqual(levelConfig.validateHard(0, 'normal'), 0);
assert.strictEqual(levelConfig.validateHard(1, 'hard'), 1);
assert.throws(() => levelConfig.validateHard(undefined, 'missing'), /Hard must be 0 or 1/);
assert.throws(() => levelConfig.validateHard(2, 'invalid'), /Hard must be 0 or 1/);
assert.throws(() => levelConfig.validateHard('1', 'string'), /Hard must be 0 or 1/);

const levelDir = path.join(root, 'assets', 'LevelData');
const mainFiles = fs.readdirSync(levelDir).filter((name) => /^level_\d+\.json$/.test(name));
const themeFiles = fs.readdirSync(levelDir).filter((name) => /^zt_level_\d+\.json$/.test(name));
const hardMainLevelIds = new Set([3, 10]);
assert.strictEqual(mainFiles.length, 300);
assert.strictEqual(themeFiles.length, 205);
for (const name of mainFiles) {
    const level = JSON.parse(fs.readFileSync(path.join(levelDir, name), 'utf8'));
    assert.strictEqual(level.Hard, hardMainLevelIds.has(level.levelId) ? 1 : 0, `${name} Hard mismatch`);
}
for (const name of themeFiles) {
    const level = JSON.parse(fs.readFileSync(path.join(levelDir, name), 'utf8'));
    assert.strictEqual(level.Hard, 0, `${name} must be a normal level`);
}
assert.strictEqual(readJson('assets/BootstrapBundle/LevelData/level_1.json').Hard, 0);
const experimentDir = path.join(root, 'experiments', 'ly_0224', 'treatment');
const experimentFiles = fs.readdirSync(experimentDir).filter((name) => /^level_\d+\.json$/.test(name));
assert.strictEqual(experimentFiles.length, 8);
for (const name of experimentFiles) {
    const levelId = Number(name.match(/\d+/)[0]);
    const level = JSON.parse(fs.readFileSync(path.join(experimentDir, name), 'utf8'));
    assert.strictEqual(level.Hard, levelId === 3 ? 1 : 0, `${name} experiment Hard mismatch`);
}

const manifest = readJson('assets/LevelData/level-manifest.json');
assert.strictEqual(manifest.entries.length, 300);
assert.strictEqual(manifest.entries.filter((entry) => entry.Hard === 1).length, hardMainLevelIds.size);
assert.strictEqual(manifest.entries.find((entry) => entry.levelId === 3).Hard, 1);
assert.strictEqual(manifest.entries.find((entry) => entry.levelId === 10).Hard, 1);
assert.strictEqual(manifest.entries.every((entry) => entry.Hard === (hardMainLevelIds.has(entry.levelId) ? 1 : 0)), true);

const prefabPath = 'assets/GameAssetsBundle/UI/Prefabs/Fx/HardLevelIntro.prefab';
const prefab = readJson(prefabPath);
const ids = [];
const visitIds = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Number.isInteger(value.__id__)) ids.push(value.__id__);
    for (const child of Object.values(value)) visitIds(child);
};
visitIds(prefab);
assert.strictEqual(ids.every((id) => id >= 0 && id < prefab.length), true, 'prefab contains dangling __id__ refs');
const types = prefab.map((entry) => entry.__type__);
assert.ok(types.includes('cc.BlockInputEvents'));
assert.ok(types.includes('cc.Widget'));
const prefabNodes = prefab.filter((entry) => entry.__type__ === 'cc.Node');
const nodeNames = new Set(prefabNodes.map((entry) => entry._name));
for (const name of ['HardLevelIntro', 'Backdrop', 'Visuals', 'Banner', 'ArrowLeftFar', 'ArrowLeftNear', 'ArrowRightNear', 'ArrowRightFar', 'StarCluster', 'StarUpperLeft', 'StarTop', 'StarLeft', 'StarLowerRight', 'Badge', 'Title']) {
    assert.ok(nodeNames.has(name), `prefab missing ${name}`);
}
const nodeByName = (name) => prefabNodes.find((entry) => entry._name === name);
const componentOfType = (node, type) => node._components
    .map((reference) => prefab[reference.__id__])
    .find((entry) => entry.__type__ === type);
const expectedArrowLayout = [
    ['ArrowLeftFar', -167, -1],
    ['ArrowLeftNear', -67, -1],
    ['ArrowRightNear', 67, 1],
    ['ArrowRightFar', 167, 1],
];
for (const [name, x, scaleX] of expectedArrowLayout) {
    const node = nodeByName(name);
    assert.strictEqual(node._lpos.x, x, `${name} start position mismatch`);
    assert.strictEqual(node._lscale.x, scaleX, `${name} direction mismatch`);
    assert.strictEqual(componentOfType(node, 'cc.UIOpacity')._opacity, 0, `${name} must start hidden`);
}
const starCluster = nodeByName('StarCluster');
const starNames = starCluster._children.map((reference) => prefab[reference.__id__]._name);
assert.deepStrictEqual(starNames, ['StarUpperLeft', 'StarTop', 'StarLeft', 'StarLowerRight']);
assert.strictEqual(componentOfType(starCluster, 'cc.Sprite')._enabled, false, 'full star atlas sprite must stay hidden');
const expectedStarLayout = [
    ['StarUpperLeft', -92, 80, 18],
    ['StarTop', -25, 100, 26],
    ['StarLeft', -116, 0, 22],
    ['StarLowerRight', 88, -58, 16],
];
for (const [name, x, y, size] of expectedStarLayout) {
    const node = nodeByName(name);
    const transform = componentOfType(node, 'cc.UITransform');
    assert.strictEqual(node._parent.__id__, prefab.indexOf(starCluster), `${name} parent mismatch`);
    assert.deepStrictEqual([node._lpos.x, node._lpos.y], [x, y], `${name} position mismatch`);
    assert.deepStrictEqual([transform._contentSize.width, transform._contentSize.height], [size, size], `${name} size mismatch`);
    assert.strictEqual(componentOfType(node, 'cc.Sprite')._enabled, true, `${name} sprite must be enabled`);
    assert.strictEqual(componentOfType(node, 'cc.UIOpacity')._opacity, 0, `${name} must have independent opacity`);
}
const title = prefab.find((entry) => entry.__type__ === 'cc.Label');
assert.strictEqual(title._string, '超级困难');
assert.strictEqual(title._isBold, true);
assert.strictEqual(title._enableOutline, true);
const expectedFrames = new Set([
    '7f48c11a-adff-4f6e-bd5d-8e97122d0b2e@f9941',
    '7d3837d0-f059-49cd-b26d-e948bfe2a30e@f9941',
    '04d7356d-c3cd-46f9-8920-31b34afe98ae@f9941',
    '2b1ca377-4055-40dc-946f-efef277cb507@f9941',
    'a548bb99-ade1-447c-b632-8170ea200f01@f9941',
]);
for (const sprite of prefab.filter((entry) => entry.__type__ === 'cc.Sprite')) {
    assert.ok(expectedFrames.has(sprite._spriteFrame.__uuid__), `unexpected SpriteFrame ${sprite._spriteFrame.__uuid__}`);
}
const introControllerSource = read('assets/Scripts/Core/HardLevelIntroController.ts');
assert.ok(introControllerSource.includes('new SpriteFrame()'), 'star atlas quadrants must use owned SpriteFrames');
assert.ok(introControllerSource.includes('new Rect('), 'star atlas quadrants must be cropped');
assert.ok(introControllerSource.includes('frame.destroy()'), 'owned star frames must be released');
for (const name of starNames) {
    assert.ok(introControllerSource.includes(`nodeName: '${name}'`), `controller missing ${name} crop mapping`);
}
assert.ok(introControllerSource.includes('HARD_LEVEL_INTRO_ARROW_TARGET_X = 353'));
assert.ok(introControllerSource.includes('HARD_LEVEL_INTRO_ARROW_PEAK_OPACITY = 153'));
assert.ok(introControllerSource.includes('startAt: 0.1, peakAt: 0.433, endAt: 1.1'));
assert.ok(introControllerSource.includes('starts: [0.5, 0.9]'));
assert.ok(introControllerSource.includes('starts: [0.7]'));
assert.ok(introControllerSource.includes('spec.lifetime * 0.18'));
assert.ok(introControllerSource.includes('spec.lifetime * 0.42'));
assert.ok(!introControllerSource.includes('tween(nodes.starCluster)'), 'stars must not animate as one cluster');

const imageContracts = [
    ['hard_intro_banner.png', '7d3837d0-f059-49cd-b26d-e948bfe2a30e', 'e467dca554a7e1e92b78cfe76e173d3eb1e30bb8f78fbdc539362ee31a79d8f8'],
    ['hard_intro_arrow.png', '04d7356d-c3cd-46f9-8920-31b34afe98ae', 'e9548685780a77d8595ac0c4293c4321ad043a35e178c25a3ad63472263f3b6f'],
    ['hard_intro_badge.png', '2b1ca377-4055-40dc-946f-efef277cb507', '126a7143208a3da9baf3a7970aadf3610290361a2c8ac2cfab910fa00ea8e6e0'],
    ['hard_intro_stars.png', 'a548bb99-ade1-447c-b632-8170ea200f01', '1d45e4ea7a8fda109519f82aa55581e34c088d08b3aac02c6dcee4e9b12caf65'],
];
for (const [name, uuid, hash] of imageContracts) {
    const relativePath = `assets/GameAssetsBundle/UI/Images/${name}`;
    const meta = readJson(`${relativePath}.meta`);
    assert.strictEqual(meta.uuid, uuid);
    assert.strictEqual(meta.subMetas.f9941.uuid, `${uuid}@f9941`);
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex');
    assert.strictEqual(actualHash, hash, `${name} source hash mismatch`);
}
const badgeFrame = readJson('assets/GameAssetsBundle/UI/Images/hard_intro_badge.png.meta').subMetas.f9941.userData;
assert.deepStrictEqual(
    [badgeFrame.rawWidth, badgeFrame.rawHeight],
    [320, 320],
    'replacement badge must retain its downsampled source dimensions',
);
assert.ok(badgeFrame.width > 0 && badgeFrame.width <= badgeFrame.rawWidth, 'replacement badge width must be a valid source frame');
assert.ok(badgeFrame.height > 0 && badgeFrame.height <= badgeFrame.rawHeight, 'replacement badge height must be a valid source frame');

function runStartupScenario({ hard, autoComplete }) {
    const state = { opening: 0, bgm: 0, beginLevel: 0, hard, complete: null, failure: null };
    const pch = {
        stop() {},
        start() {},
        playOpeningPatternShuffle() { state.opening += 1; },
        getAnalyticsSnapshot() { return {}; },
    };
    const intro = {
        stop() {},
        play(value, onComplete, onFailure) {
            state.hard = value;
            state.complete = onComplete;
            state.failure = onFailure;
            if (autoComplete) onComplete();
        },
    };
    const analytics = {
        setLevelContext() {}, markFirstLevelReady() {}, trackFunnelEvent() {}, flushFunnelEvents() {},
        beginLevel() { state.beginLevel += 1; },
    };
    const mocks = {
        './GameCtrlShared': {
            AnalyticsMgr: { inst: analytics },
            AudioMgr: { inst: { init() {}, preload() {}, playGameBgm() { state.bgm += 1; } } },
            BoardModel: class BoardModel {},
            SySDKMgr: { inst: { reportLevelEnter() {} } },
        },
        './AppRoot': { AppRoot: { tryGet: () => null } },
        './DebugPerfTrace': { collectActiveBlockInputEvents: () => [] },
        './HardLevelIntroController': { ensureHardLevelIntroController: () => intro },
        './LevelConfig': {
            validateConveyorCapacity: (value) => value,
            validateHard: (value) => value,
        },
        './LevelExperimentService': { getFrontLevelExperimentAnalyticsContext: () => null },
        './PchConveyorGameplayController': { ensurePchConveyorGameplayController: () => pch },
        './AnalyticsMgr': { PCH_GAMEPLAY_MODE: 'pch', PCH_GAMEPLAY_SCHEMA_VERSION: 1 },
        './StartupTrace': { flushStartupTrace() {}, markStartupTrace() {} },
    };
    const { GameplaySessionController } = loadTsModule('assets/Scripts/Core/GameplaySessionController.ts', mocks);
    const base = {
        getActiveLogicalLevelId: () => 3,
        getActivePhysicalLevelId: () => 3,
        getGameplayEntryMode: () => 'main',
        getUrlLevel: () => 0,
        getAnalyticsLevelId: () => 3,
        getAnalyticsPage: () => 'level_game',
        isFirstLevelFunnelActive: () => false,
        shouldUseLocalBootstrapBundle: () => false,
        getRuntimeRemoteHash: () => '',
        activeBoardTouches: new Set(),
    };
    const runtime = new Proxy(base, {
        get(target, property) {
            if (property in target) return target[property];
            if (typeof property === 'string' && property.startsWith('_')) return undefined;
            return () => undefined;
        },
    });
    new GameplaySessionController(runtime).initGame({
        levelId: 3, Hard: hard, boardWidth: 1, boardHeight: 1, timeLimit: 210,
        slotTotalCount: 3, conveyorCapacity: 60, correctColorArr: [[1]], initRandomColorArr: [[1]],
    });
    return { state, runtime };
}

const hardStartup = runStartupScenario({ hard: 1, autoComplete: false });
assert.strictEqual(hardStartup.state.opening, 0, 'Hard=1 must wait before opening shuffle');
assert.strictEqual(hardStartup.state.beginLevel, 0, 'startup analytics must wait for the intro');
hardStartup.state.complete();
assert.strictEqual(hardStartup.state.opening, 1);
assert.strictEqual(hardStartup.state.bgm, 1);
assert.strictEqual(hardStartup.state.beginLevel, 1);

const normalStartup = runStartupScenario({ hard: 0, autoComplete: true });
assert.strictEqual(normalStartup.state.opening, 1, 'Hard=0 must continue synchronously');
assert.strictEqual(normalStartup.state.beginLevel, 1);

console.log('hard-level intro contract passed');
