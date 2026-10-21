const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { installCreatorWeb, bootstrapSource } = require('../scripts/creator-web-bootstrap');
const { readMainLevels, prepareConfig, finishBuild } = require('../scripts/build-creator-web');
const root = path.resolve(__dirname, '..');

function storage() {
    const data = new Map();
    return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key), key: index => [...data.keys()][index] ?? null,
        get length() { return data.size; } };
}

function load(file, deps = {}, globals = {}) {
    const result = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
    }).outputText;
    new Function('exports', 'require', ...Object.keys(globals), source)(result.exports, name => {
        assert.ok(name in deps, `missing dependency ${name} for ${file}`);
        return deps[name];
    }, ...Object.values(globals));
    return result.exports;
}

test('creator storage isolates reads, writes, removal and clear; survives reload without touching formal/preview saves', () => {
    const original = storage();
    original.setItem('pdd.level', '80');
    original.setItem('pdd.preview.inventory.v1', 'formal preview');
    const scope = { localStorage: original };
    installCreatorWeb(scope, { mainLevels: [1, 2, 3] });
    assert.equal(scope.localStorage.getItem('pdd.level'), null);
    scope.localStorage.setItem('pdd.level', 2);
    scope.localStorage.setItem('pdd.preview.inventory.v1', 'creator rewards');
    const reload = { localStorage: original };
    installCreatorWeb(reload, { mainLevels: [1, 2, 3] });
    assert.equal(reload.localStorage.getItem('pdd.level'), '2');
    assert.equal(reload.localStorage.length, 2);
    assert.equal(reload.localStorage.key(2), null);
    reload.localStorage.removeItem('pdd.level');
    reload.localStorage.clear();
    assert.deepEqual([...original.data], [['pdd.level', '80'], ['pdd.preview.inventory.v1', 'formal preview']]);
});

test('storage rejection leaves the engine gate closed and renders an explicit error', () => {
    const scope = { localStorage: { setItem() { throw Error('storage denied'); } } };
    const game = {}, messages = [];
    const document = { getElementById: () => game, createElement: () => ({}), body: { appendChild: node => messages.push(node.textContent) } };
    vm.runInNewContext(bootstrapSource({ mainLevels: [1] }), { window: scope, document, console: { error() {} } });
    assert.equal(scope.__PDD_CREATOR_WEB_READY__, false);
    assert.equal(scope.__PDD_CREATOR_WEB__, undefined);
    assert.equal(game.hidden, true);
    assert.match(messages[0], /storage denied/);
});

test('shipped creator mode starts on Home, selection persists and jumping does not complete skipped levels', () => {
    const native = storage(), scope = { localStorage: native, location: { search: '', hash: '' } };
    installCreatorWeb(scope, { mainLevels: [1, 2, 3, 4, 5] });
    const mini = { isMiniGameRuntime: () => false };
    const creator = load('assets/Scripts/Core/CreatorWeb.ts', { './MiniGamePlatform': mini }, { window: scope });
    const deps = { 'cc/env': { PREVIEW: false }, './MiniGamePlatform': mini, './CreatorWeb': creator };
    const preview = () => load('assets/Scripts/Core/BrowserLevelPreview.ts', deps, { window: scope }).getBrowserLevelPreview();
    const state = preview();
    assert.equal(state.active, true);
    assert.equal(state.getLevel(), 1);
    state.setLevel(4);
    assert.deepEqual(state.completedLevels(), []);
    assert.equal(preview().getLevel(), 4);
    state.completeLevel(4);
    assert.equal(preview().getLevel(), 5);
    assert.deepEqual(preview().completedLevels(), [4]);
    state.completeLevel(5);
    assert.equal(preview().getLevel(), 5);
    assert.throws(() => state.setLevel(6), /未包含/);
    assert.throws(() => state.setLevel(1.5), /正整数/);
    assert.equal(native.getItem('pdd.level'), null);
    const route = load('assets/Scripts/Core/StartupRouteService.ts', {
        './CreatorWeb': creator, './StartupLocalProgress': { readStartupLocalProgress() { throw Error('must not consult formal save'); } },
    });
    assert.equal(route.resolveStartupRouteDecision().reason, 'creator_home');
    mini.isMiniGameRuntime = () => true;
    assert.equal(creator.isCreatorWeb(), false, 'creator marker cannot enable mini-game rewards');
});

test('ad button completes immediately, runs reward callback once and persists actual reward inventory', () => {
    const original = storage(), scope = { localStorage: original };
    installCreatorWeb(scope, { mainLevels: [1] });
    const policy = load('assets/Scripts/Core/ChapterRewardPolicy.ts');
    const rewardDeps = { cc: { sys: { localStorage: scope.localStorage } }, './ChapterRewardPolicy': policy };
    const reward = () => load('assets/Scripts/Core/PreviewRewardSave.ts', rewardDeps).PreviewRewardSave;
    const { AdConfig } = load('assets/Scripts/Platform/AdConfig.ts', {
        cc: { _decorator: { ccclass: () => value => value }, Component: class {} },
        '../Core/WeChatDeviceInfo': {}, '../Core/CreatorWeb': { isCreatorWeb: () => true },
        '../Core/MiniGamePlatform': {}, './RewardedAdProvider': { getRewardedAdProvider() { throw Error('must not create native ad'); } },
        './Douyin/DouyinPlatformConfig': { DOUYIN_PLATFORM_CONFIG: { ads: { rewardedVideo: '' } } },
        './WeChat/WeChatPlatformConfig': { WECHAT_PLATFORM_CONFIG: { ads: { rewardedVideo: '' } } },
    });
    const events = [];
    AdConfig.showRewardedAd(outcome => {
        assert.equal(outcome.status, 'verified_complete');
        reward().setGold(reward().gold() + 50);
        reward().setProp('brush', reward().prop('brush') + 1);
        events.push('grant');
    }, { onShow: () => events.push('show'), onClose: () => events.push('close') });
    assert.deepEqual(events, ['show', 'close', 'grant']);
    assert.equal(reward().gold(), 50);
    assert.equal(reward().prop('brush'), 1);
    assert.equal(original.getItem('pdd.preview.inventory.v1'), null);
});

test('dedicated config bundles local content and gates Cocos startup without changing normal config', () => {
    const config = prepareConfig(root);
    assert.equal(config.outputName, 'creator-web');
    assert.equal(config.platform, 'web-mobile');
    assert.equal(config.flags.LOAD_SPINE_MANUALLY, false);
    assert.equal(config.flags.WASM_SUBPACKAGE, false);
    assert(config.bundleConfigs.some(row => row.name === 'levelData' && row.output && !row.isRemote));
    const levels = readMainLevels(root);
    assert(levels.length > 1);
    const parent = path.join(root, 'temp/creator-web-tests');
    fs.mkdirSync(parent, { recursive: true });
    const output = fs.mkdtempSync(path.join(parent, 'package-'));
    fs.writeFileSync(path.join(output, 'index.html'), '<title>normal</title><div id="GameDiv"></div><script src="system.js"></script><script>System.import("./index.js").catch(console.error)</script>');
    finishBuild(output, levels);
    const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    assert(html.indexOf('creator-web-bootstrap.js') < html.indexOf('system.js'));
    assert.match(html, /__PDD_CREATOR_WEB_READY__ \? System.import/);
    assert.match(fs.readFileSync(path.join(output, 'creator-web-bootstrap.js'), 'utf8'), /pdd.creator-web.v1:/);
    assert.doesNotMatch(fs.readFileSync(path.join(output, 'creator-web-bootstrap.js'), 'utf8'), /aliyuncs|__PDD_LEVEL_DATA_CDN_URL__/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'creator-web-manifest.json'), 'utf8')).levelDataSource, 'bundled');
    assert.throws(() => finishBuild(output, levels), /已经包含/);
});

test('creator public hosts load bundled levels without enabling production CDN', () => {
    const url = 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_douyin/levels/';
    const client = load('assets/Scripts/Core/RemoteDataCdnClient.ts', {
        './MiniGamePlatform': { isMiniGameRuntime: () => false, getMiniGameBuildPlatform: () => 'web',
            getWeChatMiniGameRuntime: () => null, getDouyinMiniGameRuntime: () => null }, './StartupTrace': {},
        './CreatorWeb': { isCreatorWeb: () => true },
    }, { window: { location: { hostname: 'creator.example.com' } }, fetch() {} });
    assert.equal(client.shouldUseLocalLevelDataMirror(), true);
    assert.equal(client.canUseCdn(url), false);
    assert.equal(client.canUseCdn(url.replace('remote_douyin/', 'remote_douyin_b/')), false);
    const scope = { localStorage: storage() };
    installCreatorWeb(scope, { mainLevels: [1, 2] });
    assert.equal(scope.__PDD_LEVEL_DATA_CDN_URL__, undefined);
    assert.equal(scope.__PDD_LEVEL_EXPERIMENT_BUCKET__, 'off');
});

test('first level uses bundled bootstrap and other levels use the configured source', () => {
    const { installGameplayLevelFlowModule } = load('assets/Scripts/Core/GameCtrlModules/GameplayLevelFlowModule.ts', {
        '../GameCtrlShared': { sys: { isNative: false } }, '../AppRoot': {},
        '../GameplaySessionController': {}, '../GameplayViewController': {},
        '../LevelDataCdnService': {}, '../RuntimeLog': {},
    });
    const runtime = {}, paths = [];
    installGameplayLevelFlowModule(runtime);
    Object.assign(runtime, { shouldUseLocalBootstrapBundle: id => id === 1, getLevelDataPath: id => `LevelData/level_${id}`,
        _isMiniGame: () => false, _isUrlLevelPreview: () => true,
        _loadLevelDataFromConfiguredSource: () => paths.push('configured'),
        _withBootstrapBundle: () => paths.push('bootstrap') });
    runtime.loadLevelData(1, () => {});
    runtime._loadLocalLevelDataImpl(1, () => {});
    assert.deepEqual(paths, ['bootstrap', 'bootstrap']);
    runtime.loadLevelData(25, () => {});
    assert.equal(paths.at(-1), 'configured');
});

test('Home jump row validates input, binds once after redraw and reserves space below Start', () => {
    class UITransform { setContentSize(width, height) { Object.assign(this, { width, height }); } setAnchorPoint() {} }
    class Label { static HorizontalAlign = { CENTER: 1 }; static VerticalAlign = { CENTER: 1 }; static Overflow = { CLAMP: 1 }; }
    class EditBox { static InputMode = { NUMERIC: 1 }; static EventType = { TEXT_CHANGED: 'text-changed' }; }
    class Button { static EventType = { CLICK: 'click' }; }
    class Graphics { roundRect() {} fill() {} }
    class Node {
        constructor(name) { this.name = name; this.children = []; this.components = new Map(); this.events = new Map(); this.position = { x: 0, y: 0, z: 0 }; }
        setParent(parent) { this.parent = parent; parent.children.push(this); }
        setPosition(x, y, z = 0) { this.position = { x, y, z }; }
        addComponent(type) { const value = new type(); value.node = this; this.components.set(type, value); return value; }
        getComponent(type) { return this.components.get(type); }
        getChildByName(name) { return this.children.find(child => child.name === name); }
        off(event) { this.events.delete(event); }
        on(event, callback) { assert(!this.events.has(event)); this.events.set(event, callback); }
    }
    const cc = { UITransform, Label, EditBox, Button, Graphics, Node, Color: class {} };
    const { drawCreatorLevelJump } = load('assets/Scripts/Core/CreatorLevelJump.ts', {
        cc, './CreatorWeb': { getCreatorWebConfig: () => ({ mainLevels: [1, 2, 3] }) },
    });
    const group = new Node('HomeContentGroup');
    group.addComponent(UITransform).setContentSize(660, 996);
    const action = new Node('ActionArea'); action.setParent(group);
    const parent = new Node('PrimaryActionLayer'); parent.setParent(action);
    const start = new Node('StartBtn'); start.setParent(parent); start.setPosition(0, -122);
    const entered = [];
    drawCreatorLevelJump(parent, start, 1, id => entered.push(id));
    const readSelection = drawCreatorLevelJump(parent, start, 2, id => entered.push(id));
    assert.equal(group.getComponent(UITransform).height, 1106);
    const row = parent.getChildByName('CreatorLevelJump');
    assert(row.position.y < start.position.y - 62 - 27);
    const input = row.getChildByName('LevelInput').getComponent(EditBox);
    assert.equal(row.getChildByName('Enter'), undefined, 'only the existing Start button enters gameplay');
    const changed = input.node.events.get('text-changed');
    for (const invalid of ['', '0', '-1', '4', '2.5', '2abc']) {
        input.string = invalid; changed(); assert.equal(readSelection(), null);
    }
    assert.deepEqual(entered, []);
    input.string = '3'; changed();
    assert.deepEqual(entered, [3]);
    input.string = '1';
    assert.equal(readSelection(), 1, 'Start validates current input without depending on blur/change ordering');
});
