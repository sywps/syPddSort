const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const core = path.join(root, 'assets/Scripts/Core');
const read = p => fs.readFileSync(p, 'utf8');
const json = p => JSON.parse(read(path.join(root, p)));
function compile(source, dependencies = {}, globals = {}) {
    const mod = { exports: {} };
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    new Function('module', 'exports', 'require', ...Object.keys(globals), output)(mod, mod.exports,
        name => { assert(name in dependencies, `unexpected import ${name}`); return dependencies[name]; }, ...Object.values(globals));
    return mod.exports;
}
const config = compile(read(path.join(core, 'LevelConfig.ts')));
const { BoardModel } = compile(read(path.join(core, 'BoardModel.ts')));
const { PchConveyorRules } = compile(read(path.join(core, 'PchConveyorRules.ts')), { './LevelConfig': config });
function route(search, launch = null, globals = {}) {
    return compile(read(path.join(core, 'FirstLevelContent.ts')), {
        './FirstLevelExperiment': { firstLevelExperiment: { decision: null } },
        './MiniGamePlatform': { getWeChatMiniGameRuntime: () => launch === null ? null : ({ getLaunchOptionsSync: () => ({ query: launch }) }) },
    }, { window: search === null ? undefined : { location: { search } }, ...globals });
}
assert.equal(route('?firstLevelContent=C', {}, { URLSearchParams: undefined }).getFirstLevelPreview(), null);
assert.equal(route('?firstLevelContent=C', { firstLevelContent: 'B' }, { URLSearchParams: undefined }).getFirstLevelPreview(), 'B');
assert.equal(route('', { level: '1=C' }, { window: { get location() { throw Error('WeChat must not read location'); } }, URLSearchParams: undefined }).getFirstLevelPreview(), 'C');
assert.equal(route('').getLocalLevelContentPath(1), 'LevelData/level_1');
for (const content of ['A', 'B', 'C']) {
    const expected = content === 'A' ? 'LevelData/level_1' : `LevelData/${content}`;
    for (const routing of [route(`?level=1=${content}`), route(null, { level: `1=${content}` }), route(`?firstLevelContent=${content}`), route(null, { firstLevelContent: content })]) {
        assert.equal(routing.getLocalLevelContentPath(1), expected);
        assert.equal(routing.getLocalLevelContentPath(2), 'LevelData/level_2');
        assert.equal(routing.getLocalLevelContentPath(1, 'coop_level_'), 'LevelData/coop_level_1');
    }
}
assert.throws(() => route('?firstLevelContent=D').getLocalLevelContentPath(1), /invalid content/);
const launch = { firstLevelContent: 'B' };
const stable = route(null, launch);
assert.equal(stable.getFirstLevelContent(), 'B');
launch.firstLevelContent = 'C';
assert.equal(stable.getFirstLevelContent(), 'B', 'prefetch and entry must use the same content');

const source = read(path.join(core, 'PchConveyorGameplayController.ts'));
const ast = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
const cls = ast.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'PchConveyorGameplayController');
const methods = ['showLevelOneBoardGuide', 'showLevelOneBoardGuideStep', 'onOpeningGuideLevelOneTap', 'showOpeningFeatureGuide'];
const harnessSource = methods.map(name => cls.members.find(n => n.name?.getText(ast) === name).getText(ast)).join('\n');
class Vec3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
const { Harness } = compile(`export class Harness { ${harnessSource} }`, {}, { Vec3, UITransform: class {}, console });
const formal = json('assets/BootstrapBundle/LevelData/level_1.json');
const atlas = json('assets/BootstrapBundle/Beans/bean-atlas-data.json');
const flowSource = read(path.join(core, 'GameCtrlModules/GameplayLevelFlowModule.ts'));
const flowAst = ts.createSourceFile('flow.ts', flowSource, ts.ScriptTarget.Latest, true);
let loaderMethod;
function findLoader(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(flowAst) === '_loadLocalLevelDataImpl') loaderMethod = node.getText(flowAst);
    ts.forEachChild(node, findLoader);
}
findLoader(flowAst);
const { Loader } = compile(`export class Loader { ${loaderMethod} }`, {}, { JsonAsset: class {}, console, AnalyticsMgr: { inst: { trackFunnelEvent() {} } } });
const bootstrapArtifacts = require('../scripts/bundle-artifact-utils').collectSourceBundleArtifacts(
    path.join(root, 'assets/BootstrapBundle'), 'bootstrap', message => { throw Error(message); });
for (const [content, game] of [['B', '拼豆天才'], ['C', '这不是挑战']]) {
    const data = json(`assets/BootstrapBundle/LevelData/${content}.json`);
    const original = json(`tools/competitors/${game}/levels/main/lv_001.json`);
    assert.deepEqual(data.correctColorArr, original.correctColorArr);
    if (content === 'B') {
        const target = data.correctColorArr.flat().filter(Boolean);
        const initial = data.initRandomColorArr.flat().filter(Boolean);
        assert.deepEqual([...initial].sort(), [...target].sort(), 'B preserves color counts');
        assert.equal(data.displacementRatio, 1);
        data.correctColorArr.forEach((row, r) => row.forEach((color, c) => {
            if (color) assert.notEqual(data.initRandomColorArr[r][c], color, 'every B bean must be misplaced');
            else assert.equal(data.initRandomColorArr[r][c], 0, 'B preserves empty cells');
        }));
    } else {
        assert.deepEqual(data.initRandomColorArr, original.initRandomColorArr);
    }
    assert(data.tutorialGuide.guideCopies.every(copy => !copy.includes('发光的')));
    for (const color of new Set(data.correctColorArr.flat().filter(Boolean))) {
        for (const variant of [1, 2, 4]) assert(atlas.frames[`b${String(color).padStart(3, '0')}_${variant}`], `${content}: required bean frame is local`);
    }
    const loader = new Loader();
    loader.shouldUseLocalBootstrapBundle = () => true;
    loader.getLevelDataPath = route(`?firstLevelContent=${content}`).getLocalLevelContentPath;
    let loaded;
    loader._withBootstrapBundle = cb => cb({ load: (assetPath, type, done) => done(null, {
        json: json(`assets/BootstrapBundle/${assetPath}.json`),
    }) });
    loader._loadLocalLevelDataImpl(1, value => { loaded = value; });
    assert.deepEqual(loaded, data, 'actual local loader must load selected variant');
    for (const field of ['timeLimit', 'slotTotalCount', 'conveyorCapacity', 'autoConveyorFinishSpeed', 'winAdBonusEnabled']) {
        assert.equal(data[field], formal[field], `${content}: shared first-level setting ${field}`);
    }
    assert(bootstrapArtifacts.some(item => item.assetPath === `LevelData/${content}`), 'release artifact collector must include variant');
    const board = new BoardModel(data);
    const rules = new PchConveyorRules(board, data.conveyorCapacity, data.singleSelectionLimit, undefined, data.autoConveyorFinishSpeed);
    const h = new Harness();
    const parent = { getComponent: () => ({ convertToNodeSpaceAR: p => p }) };
    h.rules = rules;
    h.runtime = { levelData: data, isGameEnd: false, getGameplayFixedRoot: () => parent };
    h.runtime.cellNodes = data.correctColorArr.map((row, r) => row.map((_, c) => ({ getComponent: () => ({
        getBoundingBoxToWorld: () => ({ xMin: c * 30, xMax: c * 30 + 20, yMin: r * 30, yMax: r * 30 + 20, center: { x: c * 30 + 10, y: r * 30 + 10 } }),
    }) })));
    const shown = [];
    h.loadOpeningGuideBeanRing = (_, ready) => ready();
    h.showOpeningGuideBeanRings = () => {};
    h.showOpeningTargetGuideAt = (...args) => shown.push(args);
    h.trackOpeningGuideEvent = () => {};
    h.clearOpeningGuideNodes = () => {};
    let finished = 0, dismissed = 0;
    h.reportOpeningGuideTutorialFinish = () => finished++;
    h.dismissOpeningGuide = () => dismissed++;
    const selected = [];
    h.handleBoardTap = (row, col) => {
        const block = rules.selectBoard(row, col);
        assert(block, `${content}: guide points to a selectable block`);
        selected.push(block.colorId);
        const result = rules.storeBlock(block, 0);
        assert(result.moved > 0);
        rules.markQueuedBeansReady(result.moved);
        return 'stored';
    };
    h.showLevelOneBoardGuide(parent);
    for (let step = 0; step < 2; step++) {
        assert.equal(shown[step][5], data.tutorialGuide.guideCopies[step], `${content}: matching guide copy`);
        h.onOpeningGuideLevelOneTap({});
    }
    assert.deepEqual(selected, data.tutorialGuide.openingColors);
    assert.equal(finished, 1); assert.equal(dismissed, 1);
    for (let tick = 0; tick < 50; tick++) {
        for (let i = 0; i < rules.carrierCount; i++) {
            rules.transferReadyBeansToCarrier(i);
            rules.autoPlaceAvailableLayers(i);
        }
    }
    assert.equal(rules.bufferCount, 0, `${content}: guided beans return successfully`);
    assert.deepEqual(board.currentColors, board.correctColors, `${content}: two guided moves solve source opening layout`);
    h.runtime.levelData = { tutorialGuide: { openingColors: [999, 13], guideCopies: ['one', 'two'] } };
    assert.throws(() => h.showLevelOneBoardGuide(parent), /not playable/);
    let fatal;
    h.runtime._activeGameplayEntryMode = 'main';
    h.runtime.getLevelDataPath = () => `LevelData/${content}`;
    h.runtime._stopGameplayEntryWithFatalError = (...args) => { fatal = args; };
    h.showOpeningFeatureGuide(parent);
    assert.equal(fatal[1], 'opening_guide_invalid', 'invalid guide must stop gameplay, not silently skip');
}
console.log('first-level-abc.test.js passed: routes, source grids, package collection, two-step guide and completed boards');
