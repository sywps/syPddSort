const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

function harness() {
    const storage = new Map(), played = [], timers = new Map(), logs = [];
    let clock = new Date(2026, 8, 30, 12).getTime(), timerId = 0, autoStart = true;
    class ClockDate extends Date {
        constructor(...args) { super(...(args.length ? args : [clock])); }
        static now() { return clock; }
    }
    class Node {
        isValid = true; activeInHierarchy = true; children = []; events = new Map();
        addChild(node) { this.children.push(node); }
        addComponent(Type) { const source = new Type(); source.node = this; return source; }
        on(event, callback) { this.events.set(event, callback); }
        emit(event) { this.events.get(event)?.(); }
        destroy() { this.isValid = false; }
    }
    class Source {
        static EventType = { STARTED: 'started', ENDED: 'ended' };
        isValid = true; playing = false;
        play() { this.playing = true; played.push(this); if (autoStart) this.node.emit('started'); }
        stop() { this.playing = false; }
        finish() { this.playing = false; this.node.emit('ended'); }
    }
    const cc = {
        _decorator: { ccclass: () => value => value }, Node, AudioSource: Source, isValid: value => !!value && value.isValid !== false,
        sys: { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } },
        director: { getScene: () => ({ name: 'Game' }) },
    };
    const app = { router: { isTransitioning: false }, session: { pendingGameplayRequest: null } };
    const modules = { cc, './MiniGamePlatform': {getDouyinMiniGameRuntime:()=>null}, './PackageNames': {}, './RuntimeLog': { runtimeLog() {} }, './AppRoot': { AppRoot: { tryGet: () => app } } };
    function load(file, id) {
        const source = read(`assets/Scripts/Core/${file}.ts`);
        const compiled = ts.transpileModule(source, { compilerOptions: {
            target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true,
        }, reportDiagnostics: true });
        assert.equal(compiled.diagnostics.length, 0, `${file} must transpile`);
        const module = { exports: {} };
        vm.runInNewContext(compiled.outputText, {
            module, exports: module.exports, Date: ClockDate, Math: Object.create(Math),
            console: { error: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
            setTimeout(fn, ms) { timers.set(++timerId, { fn, at: clock + ms }); return timerId; },
            clearTimeout: id => timers.delete(id),
            require(id) { assert.ok(modules[id], `unexpected dependency ${id}`); return modules[id]; },
        });
        return modules[id] = module.exports;
    }
    const manifest = load('AudioManifest', './AudioManifest');
    const { AudioMgr } = load('AudioMgr', './AudioMgr');
    const audio = AudioMgr.inst;
    audio.audioRoot = new Node();
    for (const name of Object.keys(manifest.AUDIO_SFX_RESOURCE_PATH)) audio.sfxClips.set(name, { name });
    const popup = new Node();
    const runtime = {
        node: new Node(), _gameplayInitSeq: 1, _activeGameplayEntryMode: 'main', isGameEnd: false,
        isRankedPvpMode: () => false, isCoopMode: () => false,
        getRuntimeSceneName: () => 'Game', requireCanvasUiRoot: () => popup,
        getBoardCompletionStats: () => ({ completePercent: 40 }),
        _pchConveyorGameplayController: { isOpeningGuideActive: () => false },
    };
    const { GameplayVoiceController } = load('GameplayVoiceController', './GameplayVoiceController');
    const controller = new GameplayVoiceController(runtime);
    runtime._gameplayVoiceController = controller;
    return { audio, runtime, controller, manifest, popup, app, played, storage, logs, Node,
        delayStarts() { autoStart = false; },
        advance(ms) { clock += ms; for (const [id, task] of [...timers]) if (task.at <= clock) { timers.delete(id); task.fn(); } },
        daily() { return JSON.parse(storage.get('pdd.voice.daily')); },
        finish() { audio.guideVoiceSource?.finish(); },
    };
}

// Warning admission, priority, recovery and once-per-level semantics.
{
    const h = harness(); h.controller.beginLevel();
    let dangerous = false;
    h.controller.warn(() => dangerous);
    assert.equal(h.played.length, 0);
    dangerous = true;
    h.runtime._pchConveyorGameplayController.isOpeningGuideActive = () => true;
    h.controller.warn(() => dangerous); assert.equal(h.played.length, 0);
    h.runtime._pchConveyorGameplayController.isOpeningGuideActive = () => false;
    h.audio.playGuideVoice('guideA1');
    h.controller.warn(() => dangerous); assert.equal(h.played.length, 1, 'guide voice must not be interrupted');
    h.finish(); h.controller.warn(() => dangerous);
    assert.equal(h.played.at(-1).clip.name, 'voiceWarn');
    h.audio.playVoice('judgmentGreat', 'judgment');
    assert.equal(h.played.length, 2, 'English voice must not overlap warning');
    dangerous = false; h.controller.update(.1);
    assert.ok(h.audio.guideVoiceSource?.playing, 'started warning finishes after danger clears');
    dangerous = true; h.controller.warn(() => dangerous); assert.equal(h.played.length, 2);
    h.controller.resumedAfterRevive(); h.controller.warn(() => dangerous); assert.equal(h.played.length, 2);
    h.controller.beginLevel(); h.controller.warn(() => dangerous); assert.equal(h.played.length, 3);
    assert.equal(h.daily().count, 2, 'only new event voices count, not guides');
    h.audio.stopVoice();
}

// The real conveyor UI condition, including matching beans and scene teardown.
{
    const h = harness(); h.controller.beginLevel();
    const source = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
    const match = source.match(/private syncWarningOverlay\(remaining: number\): void \{([\s\S]*?)\n    \}\n/);
    assert.ok(match);
    const method = new Function('PCH_RED_WARNING_REMAINING_THRESHOLD', `return function(remaining) {${match[1]}}`)(10);
    let returnable = false;
    const conveyor = { runtime: h.runtime, rules: { bufferCapacity: 60, bufferCount: 49, hasReturnableCarrierMatch: () => returnable },
        isActive: () => true, resetWarningOverlay() { this.warningOverlayShown = false; }, startWarningOverlayPulse() { this.warningOverlayShown = true; } };
    method.call(conveyor, 11); assert.equal(h.played.length, 0);
    conveyor.rules.bufferCount = 50; returnable = true;
    method.call(conveyor, 10); assert.equal(h.played.length, 0);
    returnable = false; method.call(conveyor, 10); assert.equal(h.played.length, 1);
    conveyor.rules = null; h.runtime._gameplayInitSeq++; h.controller.update(.1); assert.equal(h.audio.guideVoiceSource, null);
}

// Win selection, result waiting and guide-only cleanup isolation.
{
    const h = harness(), panel = new h.Node(); h.controller.beginLevel();
    h.controller.warn(() => true); const warning = h.audio.guideVoiceSource;
    h.runtime.isGameEnd = true; h.controller.win(panel, 1);
    assert.equal(warning.playing, true, 'result waits until the warning finishes');
    assert.equal(h.played.length, 1);
    h.finish();
    assert.equal(h.played.at(-1).clip.name, 'voiceWin1');
    h.audio.stopGuideVoice(); assert.ok(h.audio.guideVoiceSource, 'guide cleanup must not stop a result');
    h.controller.win(panel, 1); assert.equal(h.played.length, 2);
    h.controller.beginLevel(); h.controller.win(panel, 2);
    assert.equal(h.played.at(-1).clip.name, 'voiceWin2');
    h.app.router.isTransitioning = true; h.controller.update(.1);
    assert.equal(h.audio.guideVoiceSource, null);
}

// Each distinct failure may speak; "just a little more" requires >=80%.
{
    const h = harness(), panel = new h.Node(); h.controller.beginLevel(); h.runtime.isGameEnd = true;
    for (let i = 0; i < 20; i++) {
        h.controller.revive(panel);
        assert.ok(['voiceRebirth1', 'voiceRebirth2'].includes(h.played.at(-1).clip.name));
        const count = h.played.length; h.controller.revive(panel); assert.equal(h.played.length, count);
        h.controller.resumedAfterRevive();
        assert.ok(h.audio.guideVoiceSource?.playing, 'reviving preserves an already started sentence');
        h.finish();
    }
    // Inspect the actual selection with controlled randomness in the module VM.
    const original = Math.random;
    Math.random = () => .999;
    try {
        h.runtime.getBoardCompletionStats = () => ({ completePercent: 80 });
        h.controller.revive(panel); assert.equal(h.played.at(-1).clip.name, 'voiceRebirth3');
    } finally { Math.random = original; }
    panel.activeInHierarchy = false; h.controller.update(.1); assert.ok(h.audio.guideVoiceSource?.playing);
    h.finish();
}

// Delayed loads cannot outlive the event, channel replacement, mute, or ads.
for (const cancel of ['mute', 'background', 'ad', 'route', 'stale', 'timeout', 'replacement']) {
    const h = harness(); const pending = [];
    h.audio.preload = (name, done) => pending.push(done);
    let current = true, starts = 0;
    h.audio.playVoice('voiceWarn', 'warning', { isCurrent: () => current, onStarted: () => starts++ });
    if (cancel === 'mute') h.audio.setVoiceEnabled(false);
    if (cancel === 'background') h.audio.suspendForBackground();
    if (cancel === 'ad') h.audio.beginExternalInterruption();
    if (cancel === 'route') h.audio.stopVoice();
    if (cancel === 'stale') current = false;
    if (cancel === 'timeout') h.advance(1201);
    if (cancel === 'replacement') h.audio.playVoice('voiceWin1', 'result');
    pending[0]();
    assert.equal(starts, 0, `${cancel}: late load must not start`);
    assert.equal(h.played.length, 0, `${cancel}: no obsolete playback`);
    h.audio.stopVoice();
}
{
    const h = harness(); h.audio.preload = (name, done) => done(new Error('missing asset'));
    h.controller.warn(() => true);
    assert.equal(h.played.length, 0); assert.ok(h.logs.length > 0);
    assert.equal(h.audio.activeVoiceKind, null, 'load error must release narrator');
    assert.equal(h.storage.has('pdd.voice.daily'), false);
}

// Reminder: only a natural finish counts; all interruptions allow a fresh idle-home retry.
for (const interruption of ['none', 'background', 'mute', 'ad', 'route']) {
    const h = harness();
    for (let i = 0; i < 5; i++) { h.controller.beginLevel(); h.controller.warn(() => true); h.finish(); }
    h.runtime.getRuntimeSceneName = () => 'Home';
    h.controller.homeShown(); const blocker = new h.Node(); h.popup.children.push(blocker);
    for (let i = 0; i < 16; i++) h.controller.update(.25);
    assert.equal(h.played.length, 5, 'modal blocks homepage timer');
    blocker.activeInHierarchy = false;
    for (let i = 0; i < 11; i++) h.controller.update(.25);
    assert.equal(h.played.length, 5, 'wait the full idle interval');
    h.controller.update(.25);
    assert.equal(h.played.length, 6);
    assert.equal(h.played.at(-1).clip.name, 'voiceHint');
    assert.equal(h.daily().hintCount, 0, 'starting is not a completed reminder');
    if (interruption !== 'none') {
        const oldSource = h.audio.guideVoiceSource;
        if (interruption === 'background') h.audio.suspendForBackground();
        if (interruption === 'mute') h.audio.setVoiceEnabled(false);
        if (interruption === 'ad') h.audio.beginExternalInterruption();
        if (interruption === 'route') { h.app.router.isTransitioning = true; h.audio.stopVoice(); }
        h.controller.update(.25);
        oldSource.node.emit('ended');
        assert.equal(h.daily().hintCount, 0, `${interruption} must not use quota`);
        assert.equal(h.daily().lastHintAt, 0, 'interruption does not start cooldown');
        for (let i = 0; i < 16; i++) h.controller.update(.25);
        assert.equal(h.played.length, 6, 'do not retry while blocked');
        if (interruption === 'background') h.audio.resumeFromBackground();
        if (interruption === 'mute') h.audio.setVoiceEnabled(true);
        if (interruption === 'ad') h.audio.endExternalInterruption();
        blocker.activeInHierarchy = false; h.app.router.isTransitioning = false;
        for (let i = 0; i < 11; i++) h.controller.update(.25);
        assert.equal(h.played.length, 6);
        h.controller.update(.25); assert.equal(h.played.length, 7, 'retry after three new idle seconds');
    }
    const completedSource = h.audio.guideVoiceSource;
    h.finish(); completedSource.node.emit('ended');
    assert.equal(h.daily().hintCount, 1, 'natural end counts exactly once');
    assert.equal(h.daily().count, 5, 'reminder does not count as a gameplay voice');
    h.controller.homeShown();
    for (let i = 0; i < 16; i++) h.controller.update(.25);
    assert.equal(h.daily().hintCount, 1);
    h.controller.dispose();
}
{
    const h = harness();
    const events = n => {
        h.runtime.getRuntimeSceneName = () => 'Game';
        for (let i = 0; i < n; i++) { h.controller.beginLevel(); h.controller.warn(() => true); h.finish(); }
    };
    const home = () => {
        h.runtime.getRuntimeSceneName = () => 'Home'; h.controller.homeShown();
        for (let i = 0; i < 12; i++) h.controller.update(.25);
    };
    events(4); home(); assert.equal(h.audio.guideVoiceSource, null, 'four gameplay voices are insufficient');
    events(1); home(); assert.equal(h.audio.guideVoiceSource?.clip.name, 'voiceHint'); h.finish(); assert.equal(h.daily().hintCount, 1);
    events(10); home(); assert.equal(h.audio.guideVoiceSource, null, 'ten voices alone do not bypass cooldown');
    h.advance(599999); home(); assert.equal(h.audio.guideVoiceSource, null, 'ten-minute boundary is exclusive below 600000ms');
    h.advance(1); home(); assert.equal(h.audio.guideVoiceSource?.clip.name, 'voiceHint'); h.finish();
    assert.equal(h.daily().hintCount, 2); assert.equal(h.daily().lastHintVoiceCount, 15);
    h.advance(600000); events(9); home(); assert.equal(h.audio.guideVoiceSource, null, 'time alone does not bypass ten new voices');
    events(1); home(); h.finish(); assert.equal(h.daily().hintCount, 3);
    h.advance(600000); events(20); home(); assert.equal(h.audio.guideVoiceSource, null, 'daily maximum is three');
    h.advance(24 * 60 * 60 * 1000); home(); assert.equal(h.audio.guideVoiceSource, null);
    events(5); home(); h.finish(); assert.equal(h.daily().hintCount, 1, 'new day resets both counts');
    h.controller.dispose();
}
{
    const h = harness();
    h.storage.set('pdd.voice.daily', JSON.stringify({date:'2026-9-30', count:8, hinted:true, lastWin:'voiceWin1'}));
    h.controller.homeShown();
    assert.equal(h.daily().hintCount, 1, 'migrate an old reminder without granting a fresh first reminder');
    const migratedAt = h.daily().lastHintAt;
    h.advance(60000); h.controller.homeShown(); assert.equal(h.daily().lastHintAt, migratedAt, 'migration timestamp is saved once');
    h.controller.dispose();
}
for (const mode of ['coop', 'pvp', 'external']) {
    const h = harness();
    h.runtime.isCoopMode = () => mode === 'coop';
    h.runtime.isRankedPvpMode = () => mode === 'pvp';
    if (mode === 'external') h.runtime._activeGameplayEntryMode = mode;
    h.controller.beginLevel(); h.controller.warn(() => true); h.runtime.isGameEnd = true;
    h.controller.win(new h.Node(), 1); h.controller.revive(new h.Node());
    assert.equal(h.played.length, 0, `${mode} is outside the approved scope`);
}
{
    const h = harness(); h.runtime._activeGameplayEntryMode = 'theme'; h.controller.beginLevel();
    h.controller.warn(() => true); assert.equal(h.played.length, 1); h.controller.dispose();
    const names = [...h.manifest.GAMEPLAY_VOICE_NAMES, 'voiceHint'];
    for (const name of names) {
        assert.ok(!h.manifest.AUDIO_BOOTSTRAP_SFX_NAMES.includes(name));
        const resource = h.manifest.AUDIO_SFX_RESOURCE_PATH[name];
        assert.ok(fs.statSync(path.join(root, 'assets/GameAssetsBundle', resource + '.mp3')).size < 25000);
        assert.ok(!read('scripts/extract-bootstrap-bundle.js').includes(`'${resource}'`));
        assert.ok(!read('scripts/patch-bootstrap-dynamic-assets.js').includes(`'${resource}'`));
    }
}
// A started reminder survives opening settings and consumes its quota exactly once.
{
    const h = harness();
    for (let i=0;i<5;i++) { h.controller.beginLevel(); h.controller.warn(()=>true); h.finish(); }
    h.runtime.getRuntimeSceneName=()=> 'Home'; h.controller.homeShown();
    for(let i=0;i<12;i++)h.controller.update(.25);
    const source=h.audio.guideVoiceSource;
    h.popup.children.push(new h.Node()); h.runtime._modalFocusRefs=1;
    h.controller.update(.25); assert.equal(source.playing,true);
    h.finish(); source.node.emit('ended');
    assert.equal(h.daily().hintCount,1);
    assert(h.daily().lastHintAt>0);
}
// Only the latest result waits; its event must still exist when the current sentence ends.
for(const stale of [false,true]) {
    const h=harness(); h.controller.beginLevel(); h.controller.warn(()=>true);
    h.runtime.isGameEnd=true;
    const first=new h.Node(),latest=new h.Node();
    h.controller.revive(first); h.controller.win(latest,1);
    assert.equal(h.played.length,1);
    if(stale)latest.activeInHierarchy=false;
    h.finish();
    assert.equal(h.played.length,stale?1:2);
    assert.equal(h.audio.queuedResultVoice,null);
    if(!stale)assert.equal(h.audio.guideVoiceSource.clip.name,'voiceWin1');
}
// Gameplay changes, judgments, guides and ordinary effects cannot cut a started warning.
{
    const h=harness(); h.controller.beginLevel(); h.controller.warn(()=>true);
    const source=h.audio.guideVoiceSource;
    h.runtime._modalFocusRefs=1;h.runtime.isGameEnd=true;
    h.controller.update(.1);
    assert.equal(h.audio.playVoice('voiceHint','hint'),false);
    assert.equal(h.audio.playVoice('judgmentGreat','judgment'),false);
    h.audio.playGuideVoice('guideA1');h.audio.stopGuideVoice();
    h.audio.stopEffectSources();h.audio.setSfxEnabled(false);
    assert.equal(h.audio.guideVoiceSource,source);assert.equal(source.playing,true);
    h.finish();assert.equal(h.audio.guideVoiceSource,null);
}
// Hard interruptions discard both the playing sentence and the pending result.
for(const reason of ['mute','background','ad','share','scene','next-level','restart','dispose']) {
    const h=harness();h.controller.beginLevel();h.controller.warn(()=>true);
    const old=h.audio.guideVoiceSource;h.runtime.isGameEnd=true;h.controller.win(new h.Node(),1);
    if(reason==='mute')h.audio.setVoiceEnabled(false);
    if(reason==='background')h.audio.suspendForBackground();
    if(reason==='ad')h.audio.beginExternalInterruption();
    if(reason==='share')h.runtime._shareShowing=true;
    if(reason==='scene')h.runtime.getRuntimeSceneName=()=> 'Home';
    if(reason==='next-level')h.runtime._gameplayInitSeq++;
    if(reason==='restart')h.controller.beginLevel();
    if(reason==='dispose')h.controller.dispose();
    h.controller.update(.1);old.node.emit('ended');
    assert.equal(h.audio.guideVoiceSource,null,reason);assert.equal(h.audio.queuedResultVoice,null,reason);
    assert.equal(h.played.length,1,reason+' must not replay a stale result');
}
// STARTED, not request acceptance or play(), is the protection boundary.
{
    const h=harness();h.delayStarts();h.controller.beginLevel();let danger=true;
    h.controller.warn(()=>danger);const old=h.audio.guideVoiceSource;
    danger=false;h.controller.update(.1);old.node.emit('started');
    assert.equal(h.audio.guideVoiceSource,null);assert.equal(h.storage.has('pdd.voice.daily'),false);
}
// A slow-loaded queued result is still canceled if its panel has disappeared.
{
    const h=harness();h.controller.beginLevel();h.controller.warn(()=>true);
    const pending=[];h.audio.preload=(name,done)=>pending.push(done);
    const panel=new h.Node();h.runtime.isGameEnd=true;h.controller.win(panel,1);h.finish();
    assert.equal(pending.length,1);panel.activeInHierarchy=false;pending[0]();
    assert.equal(h.played.length,1);assert.equal(h.audio.guideVoiceSource,null);
}
// Reviving cancels a queued/starting result, while preserving any sentence already playing.
{
    const h=harness();h.controller.beginLevel();h.controller.warn(()=>true);
    h.runtime.isGameEnd=true;h.controller.revive(new h.Node());h.controller.resumedAfterRevive();
    h.runtime.isGameEnd=false;h.controller.update(.1);assert.equal(h.audio.guideVoiceSource.playing,true);
    h.finish();assert.equal(h.played.length,1);
}
console.log('gameplay-voice.test.js passed');
