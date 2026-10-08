const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const compile = name => ts.transpileModule(fs.readFileSync(path.join(root, `assets/Scripts/Core/${name}.ts`), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
}).outputText;
const manifest = {};
vm.runInNewContext(compile('AudioManifest'), { exports: manifest });
const code = compile('AudioMgr');

function harness({ deferPlayers = false } = {}) {
    let clock = 100000, timerId = 0;
    const timers = new Map(), cache = new Map(), storage = new Map();
    const requests = [], clips = [], played = [], logs = [], playerLoads = [];
    class Node {
        constructor(name) { this.name = name; this.isValid = true; this.children = []; this.components = []; this.events = new Map(); }
        addChild(node) { node.parent = this; this.children.push(node); }
        addComponent(Type) { const value = new Type(); value.node = this; this.components.push(value); return value; }
        getComponents(Type) { return this.components.filter(item => item instanceof Type); }
        on(event, callback, target) { const items = this.events.get(event) || []; items.push({ callback, target }); this.events.set(event, items); }
        off(event, callback, target) { this.events.set(event, (this.events.get(event) || []).filter(item => item.callback !== callback || item.target !== target)); }
        emit(event, ...args) { for (const item of this.events.get(event) || []) item.callback.apply(item.target, args); }
        destroy() { this.isValid = false; }
    }
    class Source {
        static maxAudioChannel = 24;
        static EventType = { STARTED: 'started', ENDED: 'ended' };
        isValid = true; playing = false; playCount = 0; stopCount = 0;
        clipAssignments = 0; playerReady = !deferPlayers; pendingPlay = false;
        get clip() { return this._clip; }
        set clip(value) {
            if (this._clip === value) return;
            this._clip = value; this.clipAssignments++; this.pendingPlay = false;
            this.playerReady = !deferPlayers;
            if (value && deferPlayers) playerLoads.push({ source: this, clip: value, done: false });
        }
        play() {
            this.playCount++;
            if (!this.playerReady && this.clip) { this.pendingPlay = true; return; }
            this.start();
        }
        start() { this.pendingPlay = false; this.playing = true; played.push(this); this.node.emit('started', this); }
        stop() { this.pendingPlay = false; this.playing = false; this.stopCount++; }
        pause() { this.playing = false; }
        destroy() { this.isValid = false; }
    }
    const scene = new Node('Game');
    const cc = {
        _decorator: { ccclass: () => value => value }, Node, AudioSource: Source, AudioClip: class {},
        isValid: value => !!value?.isValid,
        sys: { isNative: false, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } },
        director: { getScene: () => scene, addPersistRootNode() {} },
        assetManager: {
            getBundle: name => cache.get(name) || null,
            loadBundle: (name, callback) => requests.push({ name, callback, done: false }),
        },
    };
    const exports = {};
    vm.runInNewContext(code, {
        exports, Date: { now: () => clock }, console: { warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
        setTimeout(fn, ms) { timers.set(++timerId, { fn, at: clock + ms }); return timerId; },
        clearTimeout: id => timers.delete(id),
        require(id) {
            if (id === 'cc') return cc;
            if (id === './AudioManifest') return manifest;
            if (id === './RuntimeLog') return { runtimeLog() {} };
            if (id === './PackageNames') return { GAME_ASSETS_BUNDLE_NAME: 'gameAssets', LOCAL_BOOTSTRAP_BUNDLE_NAME: 'bootstrap' };
            throw new Error(`unexpected dependency ${id}`);
        },
    });
    const audio = exports.AudioMgr.inst;
    function bundle(name) { return { name, load(file, type, callback) { clips.push({ file, callback, done: false }); } }; }
    function finishBundle(index, error = null) {
        const request = requests[index]; assert(request && !request.done); request.done = true;
        const value = error ? null : bundle(request.name);
        if (value) cache.set(request.name, value);
        request.callback(error, value);
    }
    function finishClip(index, error = null) {
        const request = clips[index]; assert(request && !request.done); request.done = true;
        request.callback(error, error ? null : { name: request.file, isValid: true });
    }
    return { audio, requests, clips, cache, logs, timers, played, playerLoads, Node, bundle, finishBundle, finishClip,
        finishPlayer(index, error = null) {
            const request = playerLoads[index]; assert(request && !request.done); request.done = true;
            const source = request.source;
            if (error || source.clip !== request.clip || !source.node.isValid) return;
            source.playerReady = true;
            if (source.pendingPlay) source.start();
        },
        init() { audio.init(new Node('Host')); },
        advance(ms, runTimers = true) {
            clock += ms;
            if (runTimers) for (const [id, task] of [...timers]) if (task.at <= clock) { timers.delete(id); task.fn(); }
        },
        preload(name) { const results = []; audio.preload(name, error => results.push(error || null)); return results; },
    };
}
const networkError = () => new Error('temporary network failure');

// Real preload calls recover on new demand; the failed request is completed, not replayed.
{
    const h = harness();
    const first = h.preload('voiceWarn'); h.finishBundle(0, networkError());
    assert.equal(first.length, 1); assert(first[0]);
    assert(h.preload('voiceWin1')[0]); assert.equal(h.requests.length, 1);
    h.advance(1999); assert(h.preload('voiceWin1')[0]); assert.equal(h.requests.length, 1);
    h.advance(1); assert.equal(h.requests.length, 1, 'elapsed cooldown must not launch background retries');
    const recovered = h.preload('voiceWin1');
    assert.equal(h.requests.length, 2); assert.equal(recovered.length, 0);
    h.finishBundle(1); h.finishClip(0);
    assert.deepEqual(recovered, [null]); assert.equal(first.length, 1);
    assert.equal(h.audio.isSfxReady('voiceWin1'), true);
    assert.equal(h.audio.gameAssetsBundleFailures, 0);
    assert.equal(h.audio.gameAssetsBundleRetryAt, 0);
    assert.equal(h.timers.size, 0);
}

// Persistent failures are throttled at 2/5/15/30/30 seconds; suppressed demand does not extend cooldown.
{
    const h = harness();
    for (const [index, delay] of [2000, 5000, 15000, 30000, 30000].entries()) {
        const result = h.preload('voiceWarn'); assert.equal(h.requests.length, index + 1);
        h.finishBundle(index, networkError()); assert(result[0]);
        for (let i = 0; i < 30; i++) assert(h.preload('voiceWarn')[0]);
        h.advance(delay - 1); assert(h.preload('voiceWarn')[0]);
        assert.equal(h.requests.length, index + 1);
        h.advance(1); assert.equal(h.requests.length, index + 1);
        assert.equal(h.timers.size, 0);
    }
    const result = h.preload('voiceWarn'); h.finishBundle(5); h.finishClip(0);
    assert.deepEqual(result, [null]); assert.equal(h.logs.length, 5, 'log actual network failures once each');
}

// A package loaded by another owner is usable immediately, even within our cooldown.
for (const name of ['gameAssets', 'bootstrap']) {
    const h = harness(); h.audio.preferRemoteAudio = true;
    const cue = name === 'bootstrap' ? 'button' : 'voiceWarn';
    const failed = h.preload(cue); h.finishBundle(0, networkError());
    if (name === 'bootstrap') h.finishBundle(1, networkError());
    assert(failed[0]);
    const calls = h.requests.length;
    h.cache.set(name, h.bundle(name));
    const result = h.preload(cue); h.finishClip(0);
    assert.deepEqual(result, [null]); assert.equal(h.requests.length, calls);
}

// Many clips and duplicate callers share the same package load, then each clip loads once.
{
    const h = harness();
    const names = [...manifest.GAMEPLAY_VOICE_NAMES, 'voiceWarn'];
    const results = names.map(name => h.preload(name));
    assert.equal(h.requests.length, 1);
    h.finishBundle(0, networkError());
    assert(results.every(result => result.length === 1 && result[0]));
    h.advance(2000);
    const retry = names.map(name => h.preload(name));
    assert.equal(h.requests.length, 2);
    h.finishBundle(1);
    assert.equal(h.clips.length, manifest.GAMEPLAY_VOICE_NAMES.length);
    h.clips.forEach((_, index) => h.finishClip(index));
    assert(retry.every(result => result.length === 1 && result[0] === null));
    assert.equal(h.audio.pendingSfxLoads.size, 0);
}

// Failed local core audio can use remote fallback; the next new core cue can retry local loading.
{
    const h = harness(); h.audio.preferRemoteAudio = true;
    const result = h.preload('button');
    assert.equal(h.requests[0].name, 'bootstrap'); h.finishBundle(0, networkError());
    assert.equal(h.requests[1].name, 'gameAssets'); h.finishBundle(1); h.finishClip(0);
    assert.deepEqual(result, [null]);
    const alias = h.preload('revivePop'); assert.deepEqual(alias, [null]);
    h.advance(2000);
    const next = h.preload('tick'); assert.equal(h.requests[2].name, 'bootstrap');
    h.finishBundle(2); h.finishClip(1);
    assert.deepEqual(next, [null]); assert.equal(h.audio.bootstrapBundleFailures, 0);
}

// Bundle recovery cannot bring a failed autoplay request back to life.
{
    const h = harness(); h.init();
    h.audio.play('conveyorReturn'); h.finishBundle(0, networkError());
    assert.equal(h.audio.pendingAutoplaySfx.size, 0);
    h.advance(2000);
    const result = h.preload('conveyorReturn'); h.finishBundle(1); h.finishClip(0);
    assert.deepEqual(result, [null]); assert.equal(h.played.length, 0);
    h.audio.play('conveyorReturn'); assert.equal(h.played.length, 1);
}

// A failed voice and a voice requested during cooldown both end before the package recovers.
{
    const h = harness(); h.init(); let oldStarts = 0, newStarts = 0;
    h.audio.playVoice('voiceWarn', 'warning', { onStarted: () => oldStarts++ });
    h.finishBundle(0, networkError());
    h.audio.playVoice('voiceWarn', 'warning', { onStarted: () => oldStarts++ });
    assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
    h.advance(2000);
    const ready = h.preload('voiceWarn'); h.finishBundle(1); h.finishClip(0);
    assert.deepEqual(ready, [null]); assert.equal(oldStarts, 0); assert.equal(h.played.length, 0);
    h.audio.playVoice('voiceWarn', 'warning', { onStarted: () => newStarts++ });
    assert.equal(newStarts, 1); assert.equal(oldStarts, 0);
}

// Expired, scene-cancelled, and muted voice requests remain silent; the cached clip is reusable later.
for (const cancel of ['deadline', 'scene', 'mute', 'stale-context']) {
    const h = harness(); h.init(); let current = true, started = 0;
    h.audio.playVoice('voiceWin1', 'result', { isCurrent: () => current, onStarted: () => started++ });
    if (cancel === 'deadline') h.advance(1201);
    if (cancel === 'scene') h.audio.stopVoice();
    if (cancel === 'mute') h.audio.setVoiceEnabled(false);
    if (cancel === 'stale-context') current = false;
    h.finishBundle(0); h.finishClip(0);
    assert.equal(started, 0); assert.equal(h.played.length, 0, cancel);
    current = true; h.audio.setVoiceEnabled(true);
    h.audio.playVoice('voiceWin1', 'result', { isCurrent: () => current, onStarted: () => started++ });
    assert.equal(started, 1); assert.equal(h.requests.length, 1);
}

// A timed-out caller completes once; an eventual engine failure still allows a later retry.
{
    const h = harness(); const timedOut = h.preload('voiceWarn');
    h.advance(5001); assert(timedOut[0]);
    h.finishBundle(0, networkError()); assert.equal(timedOut.length, 1);
    h.advance(2000); const result = h.preload('voiceWarn'); h.finishBundle(1); h.finishClip(0);
    assert.deepEqual(result, [null]); assert.equal(timedOut.length, 1);
}

// Existing lifecycle recovery restores failed BGM loading; later voice recovery leaves BGM untouched.
{
    const h = harness(); h.init(); h.audio.playGameBgm();
    h.finishBundle(0, networkError()); h.finishBundle(1, networkError());
    h.audio.suspendForBackground(); h.advance(2000); h.audio.resumeFromBackground();
    assert.equal(h.requests[2].name, 'bootstrap'); h.finishBundle(2); h.finishClip(0);
    const bgm = h.audio.bgmSrc, clip = bgm.clip;
    assert.equal(bgm.playing, true); assert.equal(bgm.playCount, 1);
    const failedVoice = h.preload('voiceWarn'); h.finishBundle(3, networkError()); assert(failedVoice[0]);
    h.advance(5000); const result = h.preload('voiceWarn'); h.finishBundle(4); h.finishClip(1);
    assert.deepEqual(result, [null]);
    assert.equal(bgm.clip, clip); assert.equal(bgm.playCount, 1); assert.equal(bgm.stopCount, 0);
}

// Ordinary foreground actions retry failed BGM without requiring a scene or lifecycle change.
{
    const h = harness(); h.init(); h.audio.sfxClips.set('button', {});
    h.audio.playGameBgm(); h.finishBundle(0, networkError()); h.finishBundle(1, networkError());
    for (let i = 0; i < 20; i++) h.audio.play('button');
    assert.equal(h.requests.length, 2); assert.equal(h.audio.bgmClipFailures, 0, 'bundle cooldown refusals are not clip failures');
    h.advance(1999); h.audio.play('button'); assert.equal(h.requests.length, 2);
    h.advance(1); assert.equal(h.requests.length, 2, 'there is no automatic background retry');
    h.audio.play('button'); assert.equal(h.requests.length, 3);
    h.finishBundle(2); h.finishClip(0);
    assert.equal(h.audio.bgmSrc.playing, true); assert.equal(h.audio.bgmSrc.playCount, 1);
}

// Actual BGM clip failures have their own capped backoff even when both packages are already cached.
{
    const h = harness(); h.init(); h.audio.sfxClips.set('button', {});
    h.cache.set('bootstrap', h.bundle('bootstrap')); h.cache.set('gameAssets', h.bundle('gameAssets'));
    h.audio.playGameBgm();
    for (const [index, delay] of [2000, 5000, 15000, 30000, 30000].entries()) {
        if (index) h.audio.play('button');
        h.finishClip(index * 2, networkError()); h.finishClip(index * 2 + 1, networkError());
        assert.equal(h.audio.bgmClipFailures, index + 1);
        for (let i = 0; i < 20; i++) h.audio.play('button');
        h.audio.playGameBgm(); h.audio.setBgmEnabled(true);
        h.advance(delay - 1); h.audio.play('button');
        assert.equal(h.clips.length, (index + 1) * 2, 'demand must neither bypass nor extend the clip cooldown');
        h.advance(1); assert.equal(h.clips.length, (index + 1) * 2);
        assert.equal(h.timers.size, 0);
    }
    h.audio.play('button'); h.finishClip(10);
    assert.equal(h.audio.bgmSrc.playing, true); assert.equal(h.audio.bgmClipFailures, 0);
    assert.equal(h.audio.bgmClipRetryAt, 0); assert.equal(h.requests.length, 0);
    h.audio.play('button'); h.audio.playGameBgm();
    assert.equal(h.audio.bgmSrc.playCount, 1, 'healthy BGM must not restart on ordinary demand');
    assert.equal(h.audio.bgmSrc.stopCount, 0);
}

// A missing local clip is throttled even if remote fallback is unavailable or still cooling down.
{
    const h = harness(); h.init(); h.audio.sfxClips.set('button', {});
    h.cache.set('bootstrap', h.bundle('bootstrap'));
    h.preload('voiceWarn'); h.finishBundle(0, networkError());
    h.audio.playGameBgm(); h.finishClip(0, networkError());
    assert.equal(h.audio.bgmClipFailures, 1); assert.equal(h.requests.length, 1);
    h.advance(1999); h.audio.play('button'); assert.equal(h.clips.length, 1);
    h.advance(1); h.audio.play('button'); h.finishClip(1, networkError());
    assert.equal(h.requests.length, 2);
    for (let i = 0; i < 20; i++) h.audio.play('button');
    assert.equal(h.clips.length, 2, 'remote fallback must keep the entire BGM request in flight');
    h.finishBundle(1, networkError());
    h.advance(4999); h.audio.play('button'); assert.equal(h.clips.length, 2);
    h.advance(1); h.audio.play('button'); h.finishClip(2);
    assert.equal(h.audio.bgmSrc.playing, true);
}

// A successful remote fallback completes one request and does not count the local miss as a failed attempt.
{
    const h = harness(); h.init(); h.audio.sfxClips.set('button', {});
    h.cache.set('bootstrap', h.bundle('bootstrap'));
    h.audio.playGameBgm(); h.finishClip(0, networkError());
    h.audio.play('button'); assert.equal(h.requests.length, 1); assert.equal(h.clips.length, 1);
    h.finishBundle(0); h.audio.play('button'); assert.equal(h.clips.length, 2);
    h.finishClip(1);
    assert.equal(h.audio.bgmSrc.playing, true); assert.equal(h.audio.bgmSrc.playCount, 1);
    assert.equal(h.audio.bgmClipFailures, 0); assert.equal(h.logs.length, 0);
}

// Changing tracks resets clip cooldown, and completion of an older request cannot overwrite the new track.
{
    const h = harness(); h.init(); h.cache.set('bootstrap', h.bundle('bootstrap'));
    h.audio.playGameBgm(); h.finishClip(0, networkError());
    h.audio.playHomeBgm(); assert.equal(h.clips.length, 1, 'home/game use the same current track');
    h.audio.playBgm('Audio/alternate'); h.finishClip(1);
    const otherClip = h.audio.bgmClip;
    h.finishBundle(0);
    assert.equal(h.audio.bgmClip, otherClip); assert.equal(h.clips.length, 2);
    assert.equal(h.audio.bgmSrc.playCount, 1);
    h.audio.playGameBgm(); h.finishClip(2, networkError()); h.finishClip(3, networkError());
    assert.equal(h.audio.bgmClipFailures, 1);
    h.audio.playBgm('Audio/alternate'); assert.equal(h.audio.bgmClipFailures, 0);
    h.finishClip(4); assert.equal(h.audio.bgmClipRetryAt, 0);
}

// Player preparation is part of the startup deadline, even after the clip itself is cached.
for (const failedPlayer of [false, true]) {
    const h = harness({ deferPlayers: true }); h.init(); let starts = 0;
    h.audio.sfxClips.set('voiceWarn', {}); h.audio.sfxClips.set('judgmentGreat', {});
    h.audio.playVoice('voiceWarn', 'warning', { onStarted: () => starts++ });
    const oldSource = h.audio.guideVoiceSource;
    assert.equal(h.playerLoads.length, 1); assert.equal(h.timers.size, 1);
    if (failedPlayer) h.finishPlayer(0, networkError());
    h.advance(1199); assert.equal(h.audio.guideVoiceSource, oldSource);
    h.advance(1); assert.equal(h.audio.guideVoiceSource, null); assert.equal(h.audio.activeVoiceKind, null);
    assert.equal(oldSource.clip, null); assert.equal(oldSource.node.isValid, false);
    assert(h.logs.some(args => String(args[0]).includes('Voice startup timed out')));
    assert.equal(h.audio.playVoice('judgmentGreat', 'judgment'), true, 'failed warning cannot monopolize narration');
    const newSource = h.audio.guideVoiceSource;
    if (!failedPlayer) h.finishPlayer(0);
    oldSource.node.emit('started'); oldSource.node.emit('ended');
    assert.equal(h.audio.guideVoiceSource, newSource, 'late callbacks cannot clear a newer request');
    assert.equal(h.timers.size, 1); assert.equal(starts, 0);
    h.finishPlayer(1); assert.equal(h.played.length, 1); assert.equal(h.timers.size, 0);
}

// Timely speech can finish naturally, even if its duration exceeds the startup deadline.
{
    const h = harness({ deferPlayers: true }); h.init(); let starts = 0, completes = 0;
    h.audio.sfxClips.set('voiceWin1', {});
    h.audio.playVoice('voiceWin1', 'result', { onStarted: () => starts++, onCompleted: () => completes++ });
    h.advance(1199); h.finishPlayer(0);
    const source = h.audio.guideVoiceSource;
    h.advance(60000);
    assert.equal(starts, 1); assert.equal(source.playing, true); assert.equal(h.timers.size, 0);
    source.node.emit('ended');
    assert.equal(completes, 1); assert.equal(h.audio.guideVoiceSource, null);
}

// STARTED must also enforce the deadline when an overdue timer has not yet run.
{
    const h = harness({ deferPlayers: true }); h.init(); let starts = 0;
    h.audio.sfxClips.set('voiceWarn', {});
    h.audio.playVoice('voiceWarn', 'warning', { onStarted: () => starts++ });
    const source = h.audio.guideVoiceSource;
    h.advance(1200, false); h.finishPlayer(0);
    assert.equal(starts, 0); assert.equal(source.playing, false);
    assert.equal(h.audio.activeVoiceKind, null); assert.equal(h.timers.size, 0);
}

// Guides get a five-second startup window; an expired player can never resurrect that cue.
{
    const h = harness({ deferPlayers: true }); h.init(); h.audio.sfxClips.set('guideA1', {});
    h.audio.playGuideVoice('guideA1');
    h.advance(4999); assert(h.audio.guideVoiceSource);
    h.advance(1); assert.equal(h.audio.guideVoiceSource, null);
    h.finishPlayer(0); assert.equal(h.played.length, 0);
}

// Both guide players prepare silently and are actually reused across the two tutorial steps.
{
    const h = harness({ deferPlayers: true }); h.init();
    h.audio.sfxClips.set('guideA1', {}); h.audio.sfxClips.set('guideA2', {});
    h.audio.prepareGuideVoices();
    const first = h.audio.preparedGuideVoices.get('guideA1'), second = h.audio.preparedGuideVoices.get('guideA2');
    assert.equal(h.playerLoads.length, 2); assert.equal(h.played.length, 0);
    assert.equal(first.playOnAwake, false); assert.equal(first.loop, false);
    assert.equal(h.audio.activeVoiceKind, null); assert.equal(h.timers.size, 0);
    h.finishPlayer(0); h.finishPlayer(1); assert.equal(h.played.length, 0);
    h.audio.playGuideVoice('guideA1'); assert.equal(h.audio.guideVoiceSource, first);
    h.audio.stopGuideVoice(); assert.equal(first.node.isValid, false);
    assert.equal(second.node.isValid, true, 'step changes preserve the next prepared player');
    h.audio.playGuideVoice('guideA2'); assert.equal(h.audio.guideVoiceSource, second);
    assert.equal(second.clipAssignments, 1); assert.equal(h.playerLoads.length, 2);
    second.node.emit('ended'); h.audio.releasePreparedGuideVoices();
    assert.equal(second.node.isValid, false); assert.equal(h.audio.preparedGuideVoices.size, 0);
}

// Leaving, muting, backgrounding or showing an ad invalidates pending preparation callbacks.
for (const cancel of ['releasePreparedGuideVoices', 'stopVoice', 'mute', 'suspendForBackground', 'beginExternalInterruption']) {
    const h = harness({ deferPlayers: true }); h.init(); h.audio.preferRemoteAudio = true;
    h.audio.prepareGuideVoices(); assert.equal(h.requests.length, 1);
    if (cancel === 'mute') h.audio.setVoiceEnabled(false); else h.audio[cancel]();
    h.finishBundle(0); h.finishClip(0); h.finishClip(1);
    assert.equal(h.playerLoads.length, 0, cancel); assert.equal(h.audio.preparedGuideVoices.size, 0);
    assert.equal(h.audio.pendingGuideVoicePreparations.size, 0); assert.equal(h.played.length, 0);
}

// Global cleanup also retires players whose native preparation is already in flight.
{
    const h = harness({ deferPlayers: true }); h.init();
    h.audio.sfxClips.set('guideA1', {}); h.audio.sfxClips.set('guideA2', {});
    h.audio.prepareGuideVoices();
    const players = [...h.audio.preparedGuideVoices.values()];
    h.audio.playGuideVoice('guideA1'); h.audio.stopVoice();
    h.finishPlayer(0); h.finishPlayer(1);
    assert(players.every(source => !source.node.isValid && source.clip === null));
    assert.equal(h.audio.guideVoiceSource, null); assert.equal(h.played.length, 0);
}

// Advancing both steps before clips load cancels obsolete speech without producing extra players.
{
    const h = harness({ deferPlayers: true }); h.init(); h.audio.preferRemoteAudio = true;
    h.audio.prepareGuideVoices(); h.audio.playGuideVoice('guideA1');
    h.audio.stopGuideVoice(); h.audio.playGuideVoice('guideA2');
    h.finishBundle(0); h.finishClip(0); h.finishClip(1);
    assert.equal(h.playerLoads.length, 1); assert.equal(h.audio.preparedGuideVoices.size, 0);
    assert.equal(h.audio.guideVoiceSource.clip, h.audio.sfxClips.get('guideA2'));
    h.finishPlayer(0); assert.equal(h.played.length, 1);
}

// A new preparation session is not cancelled by completion of the previous session's shared loads.
{
    const h = harness({ deferPlayers: true }); h.init(); h.audio.preferRemoteAudio = true;
    h.audio.prepareGuideVoices(); h.audio.releasePreparedGuideVoices(); h.audio.prepareGuideVoices();
    h.finishBundle(0); h.finishClip(0); h.finishClip(1);
    assert.equal(h.playerLoads.length, 2); assert.equal(h.audio.preparedGuideVoices.size, 2);
    h.audio.setVoiceEnabled(false); h.audio.prepareGuideVoices();
    assert.equal(h.audio.preparedGuideVoices.size, 0); assert.equal(h.requests.length, 1);
}

// Native preparation may fail silently or never finish. Neither case may exhaust the SFX pool.
for (const failed of [false, true]) {
    const h = harness({ deferPlayers: true }); h.init();
    h.audio.sfxClips.set('button', {});
    for (let i = 0; i < 22; i++) {
        h.audio.play('button');
        if (failed) h.finishPlayer(i, networkError());
    }
    assert.equal(h.audio.busySfxSources.size, 22);
    h.advance(4999); h.audio.play('button');
    assert.equal(h.playerLoads.length, 22, 'pending starts still reserve their channels');
    h.advance(1);
    assert.equal(h.audio.busySfxSources.size, 0);
    assert.equal(h.audio.sfxSources.length, 0);
    assert.equal(h.timers.size, 0);
    assert.equal(h.logs.length, 22, 'each expired start reports its failure');
    assert.equal(h.playerLoads.length, 22, 'cleanup never replays expired cues automatically');
    h.audio.play('button');
    assert.equal(h.playerLoads.length, 23, 'an emptied pool still accepts new playback requests');
    if (!failed) for (let i = 0; i < 22; i++) h.finishPlayer(i);
    assert.equal(h.played.length, 0, 'late preparation cannot play a discarded cue');
    h.finishPlayer(22);
    assert.equal(h.played.length, 1);
    assert.equal(h.timers.size, 0);
}

// The deadline ends at STARTED, not after a fixed playback duration. Reuse stays intact.
{
    const h = harness({ deferPlayers: true }); h.init(); h.audio.sfxClips.set('button', {});
    h.audio.play('button'); h.advance(4999); h.finishPlayer(0);
    const source = h.played[0];
    h.advance(60000);
    assert.equal(source.stopCount, 0, 'a successfully started sound must not be cut short');
    assert.equal(h.audio.busySfxSources.size, 1);
    assert.equal(h.timers.size, 0);
    source.playing = false; source.node.emit('ended', source);
    assert.equal(h.audio.busySfxSources.size, 0);
    h.audio.play('button');
    assert.equal(h.played[1], source, 'normally completed sources remain reusable');
    assert.equal(h.playerLoads.length, 1);
    assert.equal(h.timers.size, 0);
}

// Stop/mute/background/ad cancellation retires pending players and their deadline callbacks.
for (const reason of ['stop', 'mute', 'background', 'ad', 'root-replaced']) {
    const h = harness({ deferPlayers: true }); h.init(); h.audio.sfxClips.set('button', {});
    h.audio.play('button');
    const obsolete = h.playerLoads[0].source;
    if (reason === 'stop') h.audio.stopSfx();
    if (reason === 'mute') h.audio.setSfxEnabled(false);
    if (reason === 'background') h.audio.suspendForBackground();
    if (reason === 'ad') h.audio.beginExternalInterruption();
    if (reason === 'root-replaced') { h.audio.audioRoot.destroy(); h.init(); }
    assert.equal(h.timers.size, 0, reason);
    assert.equal(h.audio.busySfxSources.size, 0, reason);
    if (reason === 'mute') h.audio.setSfxEnabled(true);
    if (reason === 'background') h.audio.resumeFromBackground();
    if (reason === 'ad') h.audio.endExternalInterruption();
    h.audio.play('button');
    h.finishPlayer(0); obsolete.node.emit('started', obsolete);
    assert.equal(h.played.length, 0, 'cancelled native loads must not resurrect playback');
    assert.equal(h.timers.size, 1, 'an obsolete STARTED cannot clear the new request deadline');
    h.finishPlayer(1); assert.equal(h.played.length, 1); assert.equal(h.timers.size, 0);
    h.advance(60000);
    assert.equal(h.logs.filter(args => String(args[0]).includes('SFX startup timed out')).length, 0);
}

// Normal reinitialization must preserve pending deadlines, including their original expiry.
{
    const h = harness({ deferPlayers: true }); h.init(); h.audio.sfxClips.set('button', {});
    h.audio.play('button'); h.advance(4999); h.init();
    assert.equal(h.timers.size, 1);
    h.advance(1); assert.equal(h.audio.busySfxSources.size, 0); assert.equal(h.timers.size, 0);
}

// Synchronous platform failures use the same cleanup path and permit a fresh player on next demand.
{
    const h = harness(); h.init(); h.audio.sfxClips.set('button', {});
    const broken = h.audio.sfxSources[0];
    broken.play = () => { throw new Error('play failed synchronously'); };
    h.audio.play('button');
    assert.equal(h.audio.busySfxSources.size, 0); assert.equal(h.timers.size, 0);
    assert.equal(broken.isValid, false); assert.equal(broken.clip, null);
    h.audio.play('button'); assert.equal(h.played.length, 1);
}

console.log('audio-bundle-recovery.test.js passed: recovery, backoff, player deadlines, guide preparation, SFX pool recovery and cancellation');
