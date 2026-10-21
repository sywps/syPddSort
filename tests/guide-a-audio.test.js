const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const compile = file => ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
}).outputText;
class Source {
    static EventType = { STARTED: 'started', ENDED: 'ended' };
    isValid = true;
    play() { this.playing = true; this.node.emit('started'); }
    stop() { this.playing = false; }
}
class Node {
    isValid = true;
    events = new Map();
    addChild(child) { this.child = child; }
    addComponent() { const source = new Source(); source.node = this; return source; }
    on(event, callback) { this.events.set(event, callback); }
    emit(event) { this.events.get(event)?.(); }
    destroy() { this.isValid = false; }
}
const manifest = { exports: {} };
vm.runInNewContext(compile('assets/Scripts/Core/AudioManifest.ts'), { module: manifest, exports: manifest.exports });
const moduleUnderTest = { exports: {} };
vm.runInNewContext(compile('assets/Scripts/Core/AudioMgr.ts'), {
    module: moduleUnderTest, exports: moduleUnderTest.exports, console, setTimeout, clearTimeout,
    require(id) {
        if (id === 'cc') return {
            _decorator: { ccclass: () => cls => cls }, AudioSource: Source, Node, isValid: value => !!value?.isValid,
            sys: { localStorage: { getItem: () => null, setItem() {} } },
            director: { getScene: () => ({ name: 'Game' }) },
        };
        if (id === './AudioManifest') return manifest.exports;
        if (id === './PackageNames') return {};
        if (id === './RuntimeLog') return { runtimeLog() {} };
        if (id === './MiniGamePlatform') return { getDouyinMiniGameRuntime: () => null };
        throw new Error(id);
    },
});
const audio = new moduleUnderTest.exports.AudioMgr();
audio.audioRoot = new Node();
audio.sfxClips.set('guideA1', { isValid: true });
audio.sfxClips.set('guideA2', { isValid: true });
const pending = [];
audio.preload = (name, done) => pending.push(done);

audio.playGuideVoice('guideA1');
audio.playGuideVoice('guideA2');
pending.shift()();
assert.equal(audio.guideVoiceSource, null, 'late step-one loading must not play over step two');
pending.shift()();
const second = audio.guideVoiceSource;
assert.equal(second.playing, true);
assert.equal(second.clip, audio.sfxClips.get('guideA2'));
audio.stopGuideVoice();
assert.equal(second.playing, false);
assert.equal(second.node.isValid, false);

audio.playGuideVoice('guideA1');
audio.setVoiceEnabled(false);
pending.shift()();
assert.equal(audio.guideVoiceSource, null, 'mute must cancel pending narration');
audio.playGuideVoice('guideA1');
assert.equal(pending.length, 0, 'muted narration must not load');
audio.setVoiceEnabled(true);
audio.playGuideVoice('guideA1');
pending.shift()();
const first = audio.guideVoiceSource;
audio.suspendForBackground();
assert.equal(first.playing, false);
assert.equal(audio.guideVoiceSource, null);
audio.resumeFromBackground();
assert.equal(audio.guideVoiceSource, null, 'foreground must not replay an obsolete guide');
audio.playGuideVoice('guideA2');
audio.beginExternalInterruption();
pending.shift()();
assert.equal(audio.guideVoiceSource, null, 'external interruption must cancel pending narration');
audio.endExternalInterruption();
audio.playGuideVoice('guideA2');
pending.shift()();
const ended = audio.guideVoiceSource;
ended.node.emit('ended');
assert.equal(audio.guideVoiceSource, null);
assert.equal(ended.node.isValid, false, 'finished voice channel must release its node');

// New guides share the same player, mute and interruption lifecycle as the first-level guide.
for (const name of ['guideSpeed', 'guideCapacity']) {
    audio.sfxClips.set(name, { name, isValid: true });
    audio.prepareGuideVoices([name]);
    assert.equal(pending.length, 1, 'prepare only the requested guide');
    pending.shift()();
    assert.equal(audio.preparedGuideVoices.size, 1);
    const prepared = audio.preparedGuideVoices.get(name);
    assert.ok(prepared);
    assert.equal(prepared.playing, undefined, 'preparation must not play speech');
    assert.equal(prepared.playOnAwake, false);
    audio.playGuideVoice(name);
    pending.shift()();
    assert.equal(audio.guideVoiceSource, prepared, 'the visible guide consumes its prepared player');
    assert.equal(audio.preparedGuideVoices.size, 0);
    audio.stopGuideVoice();
    assert.equal(prepared.playing, false);
    assert.equal(prepared.node.isValid, false);

    let current = true;
    audio.playGuideVoice(name, () => current);
    current = false;
    pending.shift()();
    assert.equal(audio.guideVoiceSource, null, 'late loading must not speak for a dismissed guide');
    audio.playGuideVoice(name, () => current);
    assert.equal(pending.length, 0, 'an obsolete guide must not start loading');

    for (const [cancel, resume] of [
        [() => audio.setVoiceEnabled(false), () => audio.setVoiceEnabled(true)],
        [() => audio.suspendForBackground(), () => audio.resumeFromBackground()],
        [() => audio.beginExternalInterruption(), () => audio.endExternalInterruption()],
        [() => audio.stopVoice(), () => {}],
    ]) {
        audio.prepareGuideVoices([name]);
        cancel();
        pending.shift()();
        assert.equal(audio.preparedGuideVoices.size, 0, 'canceled preparation cannot create a late player');
        resume();
        audio.playGuideVoice(name);
        cancel();
        pending.shift()();
        assert.equal(audio.guideVoiceSource, null, 'canceled loading must not start playing');
        resume();
        audio.playGuideVoice(name);
        pending.shift()();
        const playing = audio.guideVoiceSource;
        cancel();
        assert.equal(playing.playing, false, 'interruptions stop an already playing guide');
        resume();
        assert.equal(audio.guideVoiceSource, null, 'resuming must not replay an old guide');
    }
}
audio.sfxClips.set('voiceWin1', { isValid: true });
audio.playVoice('voiceWin1', 'result');
pending.shift()();
const result = audio.guideVoiceSource;
audio.stopGuideVoice();
assert.equal(result.playing, true, 'guide-only cleanup preserves a result voice');
audio.stopVoice();
console.log('guide-a-audio.test.js passed: guide player reuse, current context, mute and interruption cleanup');
