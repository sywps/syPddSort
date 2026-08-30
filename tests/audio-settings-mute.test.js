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
        'select', 'place', 'fly', 'return', 'button', 'tick', 'coin',
        'win', 'lose', 'winColor', 'winAll', 'winSettlement', 'revivePop',
    ],
    AUDIO_SFX_RESOURCE_PATH: {
        select: 'Audio/select',
        button: 'Audio/ui',
        place: 'Audio/place',
        fly: 'Audio/fly',
        return: 'Audio/return',
        tick: 'Audio/tick',
        coin: 'Audio/coin',
        win: 'Audio/win',
        lose: 'Audio/lose',
        winColor: 'Audio/win-color',
        winAll: 'Audio/win-all',
        winSettlement: 'Audio/win-settlement',
        revivePop: 'Audio/revive-pop',
    },
    AUDIO_SFX_VOLUME: {
        select: 0.55, button: 0.52, place: 0.72, fly: 0.4, return: 0.22,
        tick: 0.4, coin: 0.42, win: 0.52, lose: 0.44, winColor: 0.5,
        winAll: 0.5, winSettlement: 0.62, revivePop: 0.32,
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
    ['place', 'button', 'tick', 'winColor', 'winAll', 'winSettlement', 'lose', 'revivePop', 'coin', 'win'],
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

assert.strictEqual(audioMgr.sfxSources.length, 8, 'AudioMgr must create a bounded eight-channel SFX pool');
assert.ok(audioMgr.sfxSources.every((source) => source.playOnAwake === false), 'pooled SFX channels must never autoplay');
assert.strictEqual(audioMgr.bgmSrc.playOnAwake, false, 'BGM source must remain explicitly manager-owned');

const originalSources = [...audioMgr.sfxSources, audioMgr.bgmSrc];
const staleUntrackedSource = audioMgr.audioRoot.addComponent(MockAudioSource);
staleUntrackedSource.loop = true;
staleUntrackedSource.play();
audioMgr.sfxSources[0].isValid = false;
audioMgr.init(host);
assert.ok(
    originalSources.every((source) => !ccMock.isValid(source, true)),
    'reinitialization must invalidate every obsolete tracked AudioSource',
);
assert.strictEqual(ccMock.isValid(staleUntrackedSource, true), false, 'reinitialization must remove stale untracked AudioSources from PddAudioRoot');
assert.strictEqual(staleUntrackedSource.playing, false, 'stale BGM-like playback must stop before replacement sources are created');
assert.strictEqual(
    audioMgr.audioRoot.getComponents(MockAudioSource).filter((source) => ccMock.isValid(source, true)).length,
    9,
    'PddAudioRoot must contain exactly eight live SFX sources and one live BGM source',
);
const sourceComponentCountBeforeSameFrameInit = audioMgr.audioRoot.getComponents(MockAudioSource).length;
audioMgr.init(host);
assert.strictEqual(
    audioMgr.audioRoot.getComponents(MockAudioSource).length,
    sourceComponentCountBeforeSameFrameInit,
    'a second init in the destruction frame must not create another replacement generation',
);

const rogueLoopSource = audioMgr.audioRoot.addComponent(MockAudioSource);
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

const flyClip = { _nativeAsset: { url: 'fly.mp3' }, loadMode: 0 };
audioMgr.sfxClips.set('fly', flyClip);
for (let i = 0; i < 8; i++) audioMgr.play('fly');
assert.strictEqual(audioMgr.busySfxSources.size, 8, 'eight overlapping SFX must occupy eight independent channels');
assert.ok(audioMgr.sfxSources.every((source) => source.playing), 'all eight overlapping channels must be playing');

const firstSource = audioMgr.sfxSources[0];
const firstStopCount = firstSource.stopCount;
audioMgr.play('fly');
assert.strictEqual(firstSource.playCount, 2, 'the ninth sound must reclaim the oldest round-robin channel');
assert.ok(firstSource.stopCount > firstStopCount, 'reclaimed channels must be stopped before reuse');

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

const placeClip = { _nativeAsset: { url: 'place.mp3' } };
audioMgr.sfxClips.set('place', placeClip);
const pooledPlayCountBeforePlace = audioMgr.sfxSources.reduce((sum, source) => sum + source.playCount, 0);
for (let i = 0; i < 9; i++) audioMgr.play('place');
const placeSources = [...audioMgr.placeOneShotSources];
assert.strictEqual(placeSources.length, 9, 'nine overlapping place cues must each receive an independent one-shot source');
assert.strictEqual(
    audioMgr.sfxSources.reduce((sum, source) => sum + source.playCount, 0),
    pooledPlayCountBeforePlace,
    'place one-shots must not reclaim a fixed pooled SFX channel',
);
assert.ok(placeSources.every((source) => source.playing), 'every overlapping place one-shot must continue playing');
assert.ok(placeSources.every((source) => source.stopCount === 0), 'a later place cue must not stop an earlier active place cue');

const firstPlaceSource = placeSources[0];
firstPlaceSource.complete();
assert.strictEqual(audioMgr.placeOneShotSources.size, 8, 'a place source must release only after its Clip ends');
assert.strictEqual(firstPlaceSource.destroyCount, 1, 'a naturally finished place source must be disposed after ending');
assert.strictEqual(firstPlaceSource.node.isValid, false, 'the naturally finished place source node must be destroyed');

const remainingPlaceSources = [...audioMgr.placeOneShotSources];
audioMgr.stopSfx();
assert.strictEqual(audioMgr.placeOneShotSources.size, 0, 'explicit SFX shutdown must release every active place one-shot');
assert.ok(remainingPlaceSources.every((source) => !ccMock.isValid(source, true)), 'explicit SFX shutdown must destroy active place one-shot sources');

const toggleHandler = settingsSource.match(/toggle\.on\(Button\.EventType\.CLICK, \(\) => \{([\s\S]*?)\n    \}, runtime\);/);
assert.ok(toggleHandler, 'settings toggle click handler must remain discoverable');
assert.ok(
    toggleHandler[1].indexOf('onToggle(next);') < toggleHandler[1].indexOf("AudioMgr.inst.play('button');"),
    'settings must apply the new state before optional button feedback',
);
assert.ok(!audioMgrSource.includes('.playOneShot('), 'AudioMgr must not use untracked one-shot playback');

const audioInitIndex = gameplaySessionSource.indexOf('AudioMgr.inst.init(runtime.node);');
const criticalButtonPreloadIndex = gameplaySessionSource.indexOf("AudioMgr.inst.preload('button');", audioInitIndex);
const optionalWarmupGateIndex = gameplaySessionSource.indexOf('const bootstrapOnlyGameplayStartup', audioInitIndex);
assert.ok(audioInitIndex >= 0, 'gameplay startup must initialize AudioMgr');
assert.ok(
    criticalButtonPreloadIndex > audioInitIndex && criticalButtonPreloadIndex < optionalWarmupGateIndex,
    'the critical button cue must start preloading immediately after AudioMgr init and before optional gameplay warmup gates',
);
assert.strictEqual(
    (gameplaySessionSource.match(/AudioMgr\.inst\.playGameBgm\(\);/g) || []).length,
    1,
    'gameplay startup must have one authoritative BGM start after UI readiness',
);

const getTotalSfxPlayCount = () => audioMgr.sfxSources.reduce((sum, source) => sum + source.playCount, 0)
    + [...audioMgr.placeOneShotSources].reduce((sum, source) => sum + source.playCount, 0);
audioMgr.sfxClips.set('place', placeClip);
audioMgr.sfxClips.set('button', { _nativeAsset: { url: 'button.mp3' } });
audioMgr.sfxClips.set('uiPanel', { _nativeAsset: { url: 'ui-panel.mp3' } });
const allowedGameSfxNames = [
    'place', 'button', 'tick', 'winColor', 'winAll',
    'winSettlement', 'lose', 'revivePop', 'coin', 'win',
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
audioMgr.sfxClips.set('return', { _nativeAsset: { url: 'return.mp3' } });
const homeSfxPlayCountBefore = getTotalSfxPlayCount();
audioMgr.play('fly');
audioMgr.play('return');
assert.strictEqual(
    getTotalSfxPlayCount() - homeSfxPlayCountBefore,
    2,
    'non-Game scenes must keep their existing SFX behavior',
);

console.log('audio-settings-mute.test.js passed');
