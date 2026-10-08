const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

class MockNode {
    constructor(name = 'Node') {
        this.name = name;
        this.isValid = true;
        this.scene = this;
        this.parent = null;
        this.components = [];
        this.listeners = new Map();
    }

    addChild(child) {
        child.parent = this;
        child.scene = this.scene;
    }

    addComponent(ComponentClass) {
        const component = new ComponentClass();
        component.node = this;
        this.components.push(component);
        return component;
    }

    getComponents(ComponentClass) {
        return this.components.filter((component) => component instanceof ComponentClass);
    }

    on(event, callback, target) {
        const listeners = this.listeners.get(event) || [];
        listeners.push({ callback, target });
        this.listeners.set(event, listeners);
    }

    off(event, callback, target) {
        const listeners = this.listeners.get(event) || [];
        this.listeners.set(event, listeners.filter((entry) => entry.callback !== callback || entry.target !== target));
    }

    emit(event, ...args) {
        for (const entry of this.listeners.get(event) || []) {
            entry.callback.apply(entry.target, args);
        }
    }

    destroy() {
        this.isValid = false;
        this.destroyQueued = true;
    }
}

class MockAudioSource {
    static EventType = { STARTED: 'started', ENDED: 'ended' };
    static maxAudioChannel = 24;

    constructor() {
        this.isValid = true;
        this.playOnAwake = true;
        this.loop = false;
        this.volume = 1;
        this.clip = null;
        this.playing = false;
        this.playCount = 0;
        this.stopCount = 0;
        this.pauseCount = 0;
        this.destroyCount = 0;
        this.destroyQueued = false;
    }

    play() {
        this.playCount += 1;
        this.playing = true;
        this.node.emit(MockAudioSource.EventType.STARTED, this);
    }

    stop() {
        this.stopCount += 1;
        this.playing = false;
    }

    pause() {
        this.pauseCount += 1;
        this.playing = false;
    }

    destroy() {
        this.destroyCount += 1;
        this.stop();
        this.destroyQueued = true;
    }

    complete() {
        this.playing = false;
        this.node.emit(MockAudioSource.EventType.ENDED, this);
    }
}

const storage = new Map();
const vibrationDurations = [];
const scene = new MockNode('Scene');
let audioClockMs = 0;
const audioMgrSource = read('assets/Scripts/Core/AudioMgr.ts');
const audioManifestSource = read('assets/Scripts/Core/AudioManifest.ts');
const boardInputViewportSource = read('assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts');
const pchConveyorSource = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const settingsSource = read('assets/Scripts/Core/Panels/SettingsPanelController.ts');
const gameplaySessionSource = read('assets/Scripts/Core/GameplaySessionController.ts');
const compiledAudioMgr = ts.transpileModule(audioMgrSource, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        experimentalDecorators: true,
        useDefineForClassFields: false,
    },
    fileName: 'AudioMgr.ts',
}).outputText;

const moduleRecord = { exports: {} };
const ccMock = {
    _decorator: { ccclass: () => (target) => target },
    AudioClip: class MockAudioClip {},
    AudioSource: MockAudioSource,
    Node: MockNode,
    isValid: (value, strictMode = false) => !!value?.isValid && (!strictMode || !value.destroyQueued),
    sys: {
        isNative: false,
        localStorage: {
            getItem: (key) => storage.has(key) ? storage.get(key) : null,
            setItem: (key, value) => storage.set(key, value),
        },
    },
    assetManager: {
        getBundle: () => null,
        loadBundle: () => {
            throw new Error('unexpected bundle load in audio mute regression');
        },
    },
    director: {
        getScene: () => scene,
        addPersistRootNode: () => {},
    },
};
const audioManifestMock = {
    AUDIO_BGM_RESOURCE_PATH: 'Audio/bgm',
    AUDIO_BGM_VOLUME: 0.29,
    AUDIO_GAME_BGM_RESOURCE_PATH: 'Audio/bgm',
    AUDIO_GAME_BGM_VOLUME: 0.29,
    AUDIO_HOME_BGM_RESOURCE_PATH: 'Audio/bgm',
    AUDIO_HOME_BGM_VOLUME: 0.35,
    AUDIO_BOOTSTRAP_SFX_NAMES: [
        'select', 'settle', 'fly', 'button', 'tick', 'lose',
        'winColor', 'winAll', 'winSettlement', 'revivePop',
        'judgmentGreat', 'judgmentExcellent', 'judgmentAwesome',
        'judgmentAmazing', 'judgmentPerfect', 'judgmentUnbelievable',
    ],
    AUDIO_SFX_RESOURCE_PATH: {
        select: 'Audio/select',
        button: 'Audio/ui',
        settle: 'Audio/settle',
        conveyorEnter: 'Audio/pindd/sfx_bead_placesnap',
        conveyorReturn: 'Audio/pindd/sfx_bead_patternsnap',
        fly: 'Audio/fly',
        tick: 'Audio/tick',
        lose: 'Audio/lose',
        winColor: 'Audio/win-color',
        winAll: 'Audio/win-all',
        winSettlement: 'Audio/win-settlement',
        revivePop: 'Audio/revive-pop',
        judgmentGreat: 'Audio/judgment-great',
        judgmentExcellent: 'Audio/judgment-excellent',
        judgmentAwesome: 'Audio/judgment-awesome',
        judgmentAmazing: 'Audio/judgment-amazing',
        judgmentPerfect: 'Audio/judgment-perfect',
        judgmentUnbelievable: 'Audio/judgment-unbelievable',
    },
    AUDIO_SFX_VOLUME: {
        select: 0.55, button: 0.52, place: 0.72, settle: 0.32, conveyorEnter: 1, conveyorReturn: 1, fly: 0.4, return: 0.22,
        tick: 0.4, coin: 0.42, win: 0.52, lose: 0.44, winColor: 0.5,
        winAll: 0.5, winSettlement: 0.62, revivePop: 0.32,
        judgmentGreat: 0.56, judgmentExcellent: 0.56, judgmentAwesome: 0.56,
        judgmentAmazing: 0.56, judgmentPerfect: 0.56, judgmentUnbelievable: 0.56,
    },
    AUDIO_SFX_VOLUME_VARIANCE: {},
};

function mockRequire(request) {
    if (request === 'cc') return ccMock;
    if (request === './AudioManifest') return audioManifestMock;
    if (request === './PackageNames') {
        return { GAME_ASSETS_BUNDLE_NAME: 'gameAssets', LOCAL_BOOTSTRAP_BUNDLE_NAME: 'bootstrap' };
    }
    if (request === './RuntimeLog') return { runtimeLog: () => {} };
    throw new Error(`unexpected module: ${request}`);
}

vm.runInNewContext(compiledAudioMgr, {
    module: moduleRecord,
    exports: moduleRecord.exports,
    require: mockRequire,
    console,
    setTimeout,
    clearTimeout,
    Date: { now: () => audioClockMs },
    navigator: { vibrate: (duration) => vibrationDurations.push(duration) },
    Math,
    Map,
    Set,
}, { filename: 'AudioMgr.compiled.js' });

const { AudioMgr } = moduleRecord.exports;
const audioMgr = AudioMgr.inst;
const host = new MockNode('Host');
audioMgr.init(host);

const gameSceneAllowlistMatch = audioMgrSource.match(/const GAME_SCENE_SFX_ALLOWLIST = new Set<SfxName>\(\[([^\]]*)\]\);/);
assert.ok(gameSceneAllowlistMatch, 'AudioMgr must declare an explicit Game-scene SFX allowlist');
assert.deepStrictEqual(
    [...gameSceneAllowlistMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]),
    [
        'settle', 'conveyorEnter', 'conveyorReturn', 'button', 'tick', 'winColor', 'winAll', 'winSettlement', 'lose', 'revivePop',
        'judgmentGreat', 'judgmentExcellent', 'judgmentAwesome',
        'judgmentAmazing', 'judgmentPerfect', 'judgmentUnbelievable',
    ],
    'Game-scene SFX allowlist must match the approved gameplay policy',
);
assert.strictEqual(
    (boardInputViewportSource.match(/AudioMgr\.inst\.play\('select'\)/g) || []).length
        + (pchConveyorSource.match(/AudioMgr\.inst\.play\('select'\)/g) || []).length,
    3,
    'bean selection callers must remain available behind the reversible Game-scene policy gate',
);
assert.strictEqual(
    (boardInputViewportSource.match(/AudioMgr\.inst\.vibrateSelect\(\)/g) || []).length,
    2,
    'legacy board and slot selection must retain their vibration feedback',
);
assert.strictEqual(
    (pchConveyorSource.match(/AudioMgr\.inst\.vibrateSelect\(\)/g) || []).length,
    0,
    'PCH batch selection must defer vibration to each inbound bean arrival',
);
assert.ok(
    audioManifestSource.includes("select: 'Audio/pindd/bean_pickup'"),
    'the disabled select cue must keep its approved resource mapping for restoration',
);
assert.ok(
    audioManifestSource.includes("settle: 'Audio/pindd/bean_return_settle'"),
    'the PCH return settlement cue must keep its dedicated resource mapping',
);

assert.strictEqual(audioMgr.sfxSources.length, 8, 'AudioMgr must create a bounded eight-channel SFX pool');
assert.ok(audioMgr.sfxSources.every((source) => source.playOnAwake === false), 'pooled SFX channels must never autoplay');
assert.strictEqual(audioMgr.bgmSrc.playOnAwake, false, 'BGM source must remain explicitly manager-owned');

const originalSources = [...audioMgr.sfxSources, audioMgr.bgmSrc];
const staleUntrackedSource = audioMgr.audioRoot.addComponent(MockAudioSource);
staleUntrackedSource.loop = true;
staleUntrackedSource.play();
audioMgr.sfxSources[0].isValid = false;
audioMgr.init(host);
assert.ok(originalSources.slice(1).every(source => ccMock.isValid(source, true)), 'healthy sources survive partial SFX repair');
assert.strictEqual(audioMgr.bgmSrc, originalSources.at(-1), 'SFX repair retains BGM identity');
assert.strictEqual(ccMock.isValid(staleUntrackedSource, true), true, 'unknown source is preserved');
assert.strictEqual(staleUntrackedSource.playing, true, 'unknown playback is not touched');
assert.strictEqual(audioMgr.sfxSources.length, 8, 'only missing SFX capacity is replenished');
staleUntrackedSource.destroy(); // Test-owned fixture cleanup, not manager ownership inference.
const sourceComponentCountBeforeSameFrameInit = audioMgr.audioRoot.getComponents(MockAudioSource).length;
audioMgr.init(host);
assert.strictEqual(
    audioMgr.audioRoot.getComponents(MockAudioSource).length,
    sourceComponentCountBeforeSameFrameInit,
    'a second init in the destruction frame must not create another replacement generation',
);

const rogueLoopSource = audioMgr.sfxSources[0];
rogueLoopSource.loop = true;
rogueLoopSource.clip = { _nativeAsset: { url: 'stale-bgm.mp3' } };
rogueLoopSource.play();
audioMgr.bgmClip = { _nativeAsset: { url: 'bgm.mp3' } };
audioMgr.bgmLoadState = 'ready';
audioMgr.playGameBgm();
assert.strictEqual(rogueLoopSource.playing, false, 'starting BGM must stop any unexpected parallel loop source');
assert.strictEqual(rogueLoopSource.loop, false, 'unexpected loop sources must not remain restartable');
assert.strictEqual(
    audioMgr.audioRoot.getComponents(MockAudioSource)
        .filter((source) => ccMock.isValid(source, true) && source.loop && source.playing)
        .length,
    1,
    'AudioMgr must leave exactly one playing loop source',
);
rogueLoopSource.destroy();
audioMgr.init(host);

const flyClip = { _nativeAsset: { url: 'fly.mp3' }, loadMode: 0 };
audioMgr.sfxClips.set('fly', flyClip);
for (let i = 0; i < 8; i++) audioMgr.play('fly');
assert.strictEqual(audioMgr.busySfxSources.size, 8, 'eight overlapping SFX must occupy eight independent channels');
assert.ok(audioMgr.sfxSources.every((source) => source.playing), 'all eight overlapping channels must be playing');

const firstSource = audioMgr.sfxSources[0];
const firstStopCount = firstSource.stopCount;
audioMgr.play('fly');
assert.strictEqual(firstSource.playCount, 1, 'the ninth sound must grow the pool without interrupting existing sounds');
assert.strictEqual(audioMgr.sfxSources.length, 9);
assert.strictEqual(firstSource.stopCount, firstStopCount, 'busy channels must not be stopped');

firstSource.complete();
assert.ok(!audioMgr.busySfxSources.has(firstSource), 'an ended channel must return to the available pool');

audioMgr.gameAssetsBundleState = 'loading';
audioMgr.play('tick');
assert.ok(audioMgr.pendingAutoplaySfx.has('tick'), 'an unloaded requested cue must retain autoplay intent while enabled');

audioMgr.bgmSrc.playing = true;
const bgmStopCount = audioMgr.bgmSrc.stopCount;
audioMgr.setSfxEnabled(false);
assert.strictEqual(storage.get('pdd.setting.sfx'), '0', 'SFX disable must persist immediately');
assert.strictEqual(audioMgr.pendingAutoplaySfx.size, 0, 'SFX disable must cancel every pending autoplay intent');
assert.strictEqual(audioMgr.busySfxSources.size, 0, 'SFX disable must release every active channel');
assert.ok(audioMgr.sfxSources.every((source) => !source.playing), 'SFX disable must stop every active channel immediately');
assert.strictEqual(audioMgr.bgmSrc.stopCount, bgmStopCount, 'SFX disable must not stop or mutate BGM playback');
assert.strictEqual(audioMgr.bgmSrc.playing, true, 'BGM must keep playing when only SFX is disabled');

const totalPlayCountWhileMuted = audioMgr.sfxSources.reduce((sum, source) => sum + source.playCount, 0);
audioMgr.play('fly');
assert.strictEqual(
    audioMgr.sfxSources.reduce((sum, source) => sum + source.playCount, 0),
    totalPlayCountWhileMuted,
    'muted SFX calls must not start a channel',
);

audioMgr.setSfxEnabled(true);
audioMgr.play('fly');
assert.strictEqual(storage.get('pdd.setting.sfx'), '1', 'SFX re-enable must persist immediately');
assert.ok(audioMgr.sfxSources.some((source) => source.playing), 'SFX playback must resume after re-enabling');

const settleClip = { _nativeAsset: { url: 'settle.mp3' } };
audioMgr.sfxClips.set('settle', settleClip);
audioMgr.stopSfx();
for (let i = 0; i < 30; i++) audioMgr.play('settle');
assert.equal(audioMgr.busySfxSources.size, 22, 'reserve two of 24 engine channels');
assert.equal(audioMgr.sfxSources.length, 22);
const voices = [...audioMgr.busySfxSources];
const counts = voices.map(s => s.playCount);
audioMgr.play('button');
assert.deepStrictEqual(voices.map(s => s.playCount), counts, 'full pool skips without stealing');
voices[0].complete();
assert.equal(audioMgr.busySfxSources.size, 21);
assert.equal(voices[0].destroyCount, 0, 'ended source remains reusable');
audioMgr.play('settle');
assert.equal(voices[0].playCount, counts[0] + 1);
assert.equal(audioMgr.sfxSources.length, 22);
audioMgr.setSfxEnabled(false);
assert.equal(audioMgr.busySfxSources.size, 0);
assert.equal(audioMgr.sfxSources.length, 10, 'stopping all effects retains at most ten idle sources');
assert.ok(voices.every(s => !s.playing));
assert.equal(voices.filter(s => s.destroyCount === 1).length, 12);
audioMgr.setSfxEnabled(true);
for (let i = 0; i < 22; i++) audioMgr.play('settle');
assert.equal(audioMgr.busySfxSources.size, 22, 'idle retention limit must not limit simultaneous playback');
const expandedVoices = [...audioMgr.sfxSources];
expandedVoices.forEach(source => source.complete());
assert.equal(audioMgr.busySfxSources.size, 0);
assert.equal(audioMgr.sfxSources.length, 10, 'natural completion also trims idle sources');
assert.equal(expandedVoices.filter(s => s.destroyCount === 1).length, 12);
audioMgr.setSfxEnabled(false);
audioMgr.play('settle');
assert.equal(audioMgr.busySfxSources.size, 0);
audioMgr.setSfxEnabled(true);
// Each pending arrival consumes one slot, even when sharing a resource load.
audioMgr.sfxClips.delete('settle');
audioMgr._ensureSfxLoaded = () => {};
for (let i = 0; i < 30; i++) audioMgr.play('settle');
assert.equal(audioMgr.pendingAutoplaySfx.get('settle'), 22);
audioMgr.play('button');
assert.equal(audioMgr.busySfxSources.size, 0, 'pending loads reserve shared capacity');
audioMgr._finishSfxLoad('settle', settleClip);
assert.equal(audioMgr.busySfxSources.size, 22);
assert.equal(audioMgr.pendingAutoplaySfx.size, 0);
audioMgr.stopSfx();
audioMgr.sfxClips.delete('settle');
audioMgr.play('settle');
audioMgr.stopSfx();
audioMgr._finishSfxLoad('settle', settleClip);
assert.equal(audioMgr.busySfxSources.size, 0, 'late load cannot replay a cancelled request');

// Background transitions cancel both playing and loading requests.
audioMgr.play('settle');
audioMgr.suspendForBackground();
assert.equal(audioMgr.busySfxSources.size, 0);
assert.equal(audioMgr.pendingAutoplaySfx.size, 0);
audioMgr.play('settle');
assert.equal(audioMgr.busySfxSources.size, 0);
audioMgr.resumeFromBackground();
audioMgr.play('settle');
assert.equal(audioMgr.busySfxSources.size, 1);
audioMgr.stopSfx();

const toggleHandler = settingsSource.match(/toggle\.on\(Button\.EventType\.CLICK, \(\) => \{([\s\S]*?)\n    \}, runtime\);/);
assert.ok(toggleHandler, 'settings toggle click handler must remain discoverable');
assert.ok(
    toggleHandler[1].indexOf('onToggle(next);') < toggleHandler[1].indexOf("AudioMgr.inst.play('button');"),
    'settings must apply the new state before optional button feedback',
);
const homeButtonHandlerStart = settingsSource.indexOf('bindClick(homeBtn, () => {');
const homeButtonHandlerEnd = settingsSource.indexOf('\n                    });', homeButtonHandlerStart);
assert.ok(homeButtonHandlerStart >= 0 && homeButtonHandlerEnd > homeButtonHandlerStart, 'settings home button handler must remain discoverable');
const homeButtonHandler = settingsSource.slice(homeButtonHandlerStart, homeButtonHandlerEnd);
assert.ok(
    homeButtonHandler.indexOf("AudioMgr.inst.play('button');") > homeButtonHandler.indexOf('if (settingsClosed || homeRouteInFlight || !overlay?.isValid) return;'),
    'settings home button must only play feedback after its valid-click guard',
);
assert.ok(
    homeButtonHandler.indexOf("AudioMgr.inst.play('button');") < homeButtonHandler.indexOf('routePromise = requestHomeRouteFromSettings();'),
    'settings home button feedback must play before its route request starts',
);
assert.ok(!audioMgrSource.includes('.playOneShot('), 'AudioMgr must not use untracked one-shot playback');

const audioInitIndex = gameplaySessionSource.indexOf('AudioMgr.inst.init(runtime.node);');
const criticalButtonPreloadIndex = gameplaySessionSource.indexOf("AudioMgr.inst.preload('button');", audioInitIndex);
const optionalWarmupGateIndex = gameplaySessionSource.indexOf('runtime.startPostPlayableWarmup', audioInitIndex);
const settlePreloadIndex = gameplaySessionSource.indexOf("AudioMgr.inst.preload('settle');", audioInitIndex);
assert.ok(audioInitIndex >= 0, 'gameplay startup must initialize AudioMgr');
assert.ok(
    criticalButtonPreloadIndex > audioInitIndex && criticalButtonPreloadIndex < optionalWarmupGateIndex,
    'the critical button cue must start preloading immediately after AudioMgr init and before optional gameplay warmup gates',
);
assert.ok(settlePreloadIndex > criticalButtonPreloadIndex && settlePreloadIndex < optionalWarmupGateIndex, 'the PCH return cue must preload before optional warmup on every gameplay entry');
assert.strictEqual(
    (gameplaySessionSource.match(/AudioMgr\.inst\.playGameBgm\(\);/g) || []).length,
    1,
    'gameplay startup must have one authoritative BGM start after UI readiness',
);

const getTotalSfxPlayCount = () => audioMgr.sfxSources.reduce((sum, source) => sum + source.playCount, 0);
audioMgr.sfxClips.set('button', { _nativeAsset: { url: 'button.mp3' } });
audioMgr.sfxClips.set('uiPanel', { _nativeAsset: { url: 'ui-panel.mp3' } });
const allowedGameSfxNames = [
    'settle', 'conveyorEnter', 'conveyorReturn', 'button', 'tick', 'winColor', 'winAll',
    'winSettlement', 'lose', 'revivePop',
    'judgmentGreat', 'judgmentExcellent', 'judgmentAwesome',
    'judgmentAmazing', 'judgmentPerfect', 'judgmentUnbelievable',
];
for (const name of allowedGameSfxNames) {
    audioMgr.sfxClips.set(name, { _nativeAsset: { url: `${name}.mp3` } });
}
audioMgr.sfxClips.set('select', { _nativeAsset: { url: 'select.mp3' } });

scene.name = 'Game';
audioMgr.stopSfx();
const gameSfxPlayCountBefore = getTotalSfxPlayCount();
for (const name of allowedGameSfxNames) audioMgr.play(name);
audioMgr.play('select');
audioMgr.play('uiPanel');
audioMgr.play('fly');
audioMgr.play('return');
audioMgr.play('slot');
assert.strictEqual(
    getTotalSfxPlayCount() - gameSfxPlayCountBefore,
    allowedGameSfxNames.length,
    'Game scene must play every approved cue and reject removed or disabled keys',
);

const loadedBoundaryPlayCountBefore = getTotalSfxPlayCount();
audioMgr._playLoadedClip('fly', flyClip);
assert.strictEqual(
    getTotalSfxPlayCount(),
    loadedBoundaryPlayCountBefore,
    'the loaded-clip boundary must block a disallowed cue that finishes loading in Game',
);

audioMgr.sfxClips.delete('fly');
const ensuredPreloads = [];
const originalEnsureSfxLoaded = audioMgr._ensureSfxLoaded;
audioMgr._ensureSfxLoaded = (name) => ensuredPreloads.push(name);
audioMgr.play('fly');
assert.deepStrictEqual(ensuredPreloads, [], 'blocked Game SFX must not create an autoplay load request');
audioMgr.preload('fly');
audioMgr._ensureSfxLoaded = originalEnsureSfxLoaded;
assert.deepStrictEqual(ensuredPreloads, ['fly'], 'Game allowlist must not suppress resource preloading');

const gameBgmPlayCountBefore = audioMgr.bgmSrc.playCount;
audioMgr.bgmSrc.stop();
audioMgr.playGameBgm();
assert.strictEqual(audioMgr.bgmSrc.playCount, gameBgmPlayCountBefore + 1, 'Game BGM must remain outside the SFX allowlist');

const vibrationCountBefore = vibrationDurations.length;
audioMgr.vibratePlace();
assert.deepStrictEqual(vibrationDurations.slice(vibrationCountBefore), [12], 'Game vibration must remain outside the SFX allowlist');

scene.name = 'Home';
audioMgr.stopSfx();
audioMgr.sfxClips.set('fly', flyClip);
const homeSfxPlayCountBefore = getTotalSfxPlayCount();
audioMgr.play('fly');
assert.strictEqual(
    getTotalSfxPlayCount() - homeSfxPlayCountBefore,
    1,
    'non-Game scenes must keep their existing SFX behavior',
);

// Full-class lifecycle regressions for dynamic pools and local repair.
const mgr = new AudioMgr();
mgr.init(host);
mgr.bgmClip = { name: 'continuity' };
mgr.bgmAutoplayRequested = true;
mgr.ensureBgmPlaying();
const music = mgr.bgmSrc;
music.currentTime = 12.5;
let clipWrites = 0;
let timeWrites = 0;
let musicClip = music.clip;
let musicTime = music.currentTime;
Object.defineProperty(music, 'clip', { get: () => musicClip, set: value => { clipWrites++; musicClip = value; } });
Object.defineProperty(music, 'currentTime', { get: () => musicTime, set: value => { timeWrites++; musicTime = value; } });
const before = [music.playCount, music.stopCount, music.pauseCount, music.destroyCount];
for (let i = 0; i < 16; i++) {
    const source = mgr._acquireSfxSource();
    mgr.busySfxSources.add(source);
    source.play();
    mgr.init(host);
    assert.strictEqual(mgr.bgmSrc, music);
}
assert.strictEqual(mgr.sfxSources.length, 16);
assert.deepStrictEqual([music.playCount, music.stopCount, music.pauseCount, music.destroyCount], before);
assert.equal(clipWrites, 0);
assert.equal(timeWrites, 0);
assert.equal(music.currentTime, 12.5);
mgr.playBgm(mgr.bgmResourcePath, mgr.bgmVolume);
assert.equal(clipWrites, 0, 'same-track request after init must not reassign clip');
assert.equal(timeWrites, 0);
assert.deepStrictEqual([music.playCount, music.stopCount, music.pauseCount, music.destroyCount], before);

for (const source of [...mgr.sfxSources]) source.complete();
assert.equal(mgr.sfxSources.length, 10);
mgr.init(host);
assert.strictEqual(mgr.bgmSrc, music);
assert.equal(clipWrites, 0);
const broken = mgr.sfxSources[0];
broken.destroy();
mgr.busySfxSources.add(broken);
mgr.sfxSources.push(mgr.sfxSources[1], music);
mgr.init(host);
assert.equal(mgr.sfxSources.length, 9);
assert.equal(new Set(mgr.sfxSources).size, 9);
assert.ok(!mgr.busySfxSources.has(broken));
assert.ok(!mgr.sfxSources.includes(music));
assert.deepStrictEqual([music.playCount, music.stopCount, music.pauseCount, music.destroyCount], before);
assert.equal(clipWrites, 0);
const unknown = mgr.audioRoot.addComponent(MockAudioSource);
unknown.loop = true; unknown.play();
const voice = new MockNode('voice').addComponent(MockAudioSource);
mgr.guideVoiceSource = voice; voice.play();
mgr.init(host);
assert.equal(unknown.stopCount, 0);
assert.equal(unknown.destroyCount, 0);
assert.strictEqual(mgr.guideVoiceSource, voice);
assert.equal(voice.stopCount, 0);
for (const field of ['bgmEnabled', 'suspended', 'externalInterruptionRefs']) {
    mgr[field] = field === 'bgmEnabled' ? false : 1;
    const currentMusic = mgr.bgmSrc;
    const priorPlays = currentMusic.playCount;
    mgr.init(host);
    assert.strictEqual(mgr.bgmSrc, currentMusic);
    assert.equal(currentMusic.playCount, priorPlays, `${field}: valid source is not restarted`);
    const healthySfx = [...mgr.sfxSources];
    mgr.bgmSrc.destroy();
    mgr.init(host);
    assert.equal(mgr.bgmSrc.playCount, 0, `${field}: recovery must not autoplay`);
    assert.deepStrictEqual([...mgr.sfxSources], healthySfx);
    mgr[field] = field === 'bgmEnabled' ? true : 0;
}
mgr.bgmSrc.destroy();
mgr.init(host);
assert.equal(mgr.bgmSrc.playCount, 1, 'rebuild missing BGM when playback is allowed');
assert.equal(unknown.stopCount, 0, 'BGM recovery must not stop unknown loops');
assert.equal(unknown.destroyCount, 0);
const retiredRoot = mgr.audioRoot;
retiredRoot.destroy();
mgr.init(host);
assert.notStrictEqual(mgr.audioRoot, retiredRoot);
assert.equal(mgr.bgmSrc.playCount, 1);
assert.equal(mgr.sfxSources.length, 8);
assert.ok(mgr.sfxSources.every(source => source.node === mgr.audioRoot));
assert.equal(mgr.audioRoot.listeners.get(MockAudioSource.EventType.ENDED).length, 1);
const channelLimit = MockAudioSource.maxAudioChannel;
MockAudioSource.maxAudioChannel = 6;
const small = new AudioMgr(); small.init(host);
const smallMusic = small.bgmSrc;
assert.equal(small.sfxSources.length, 4);
small.init(host);
assert.strictEqual(small.bgmSrc, smallMusic, 'platform with fewer than 8 channels initializes idempotently');
MockAudioSource.maxAudioChannel = channelLimit;

// The narrator switch owns only speech. Ordinary SFX, music and vibration stay independent.
const independent = new AudioMgr();
independent.init(host);
independent.setSfxEnabled(true);
independent.setVoiceEnabled(true);
independent.sfxClips.set('judgmentGreat', {});
independent.sfxClips.set('button', {});
independent.bgmSrc.playing = true;
independent.playVoice('judgmentGreat', 'judgment');
const narration = independent.guideVoiceSource;
assert.ok(narration?.playing);
independent.play('button');
independent.setSfxEnabled(false);
assert.equal(narration.playing, true, 'SFX switch must leave narration playing');
assert.equal(independent.canPlayVoice(), true);
assert.equal(independent.busySfxSources.size, 0);
independent.stopVoice();
independent.playVoice('judgmentGreat', 'judgment');
assert.ok(independent.guideVoiceSource?.playing, 'speech can start with SFX disabled');
independent.setSfxEnabled(true);
independent.play('button');
const effectSource = [...independent.busySfxSources][0];
independent.setVoiceEnabled(false);
assert.equal(storage.get('pdd.setting.voice'), '0');
assert.equal(independent.guideVoiceSource, null);
assert.ok(effectSource.playing, 'voice switch must leave ordinary effects playing');
assert.ok(independent.bgmSrc.playing, 'voice switch must leave music playing');
assert.equal(new AudioMgr().isVoiceEnabled(), false, 'voice mute survives reopening');
independent.setSfxEnabled(false);
independent.setSfxEnabled(true);
assert.equal(independent.canPlayVoice(), false, 'SFX changes must not re-enable speech');
independent.setVoiceEnabled(true);
assert.equal(independent.guideVoiceSource, null, 'enabling speech must not replay interrupted speech');
assert.equal(new AudioMgr().isVoiceEnabled(), true);
independent.stopSfx();

storage.delete('pdd.setting.voice');
storage.set('pdd.setting.sfx', '0');
const legacyMuted = new AudioMgr();
assert.equal(legacyMuted.isVoiceEnabled(), false, 'existing muted users remain silent during migration');
assert.equal(storage.get('pdd.setting.voice'), '0', 'migration saves an independent preference');
legacyMuted.setSfxEnabled(true);
assert.equal(new AudioMgr().isVoiceEnabled(), false, 'migration is not repeated after the user changes SFX');
storage.delete('pdd.setting.voice');
storage.delete('pdd.setting.sfx');
assert.equal(new AudioMgr().isVoiceEnabled(), true, 'new users have speech enabled by default');
console.log('audio-settings-mute.test.js passed');
