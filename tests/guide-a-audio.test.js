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
    static EventType = { ENDED: 'ended' };
    isValid = true;
    play() { this.playing = true; }
    stop() { this.playing = false; }
}
class Node {
    isValid = true;
    addChild(child) { this.child = child; }
    addComponent() { const source = new Source(); source.node = this; return source; }
    on(event, callback) { this.ended = callback; }
    destroy() { this.isValid = false; }
}
const manifest = { exports: {} };
vm.runInNewContext(compile('assets/Scripts/Core/AudioManifest.ts'), { module: manifest, exports: manifest.exports });
const moduleUnderTest = { exports: {} };
vm.runInNewContext(compile('assets/Scripts/Core/AudioMgr.ts'), {
    module: moduleUnderTest, exports: moduleUnderTest.exports, console, setTimeout, clearTimeout,
    require(id) {
        if (id === 'cc') return {
            _decorator: { ccclass: () => cls => cls }, AudioSource: Source, Node,
            sys: { localStorage: { getItem: () => null, setItem() {} } },
            director: { getScene: () => ({ name: 'Game' }) },
        };
        if (id === './AudioManifest') return manifest.exports;
        if (id === './PackageNames') return {};
        if (id === './RuntimeLog') return { runtimeLog() {} };
        throw new Error(id);
    },
});
const audio = new moduleUnderTest.exports.AudioMgr();
audio.audioRoot = new Node();
audio.sfxClips.set('guideA1', {});
audio.sfxClips.set('guideA2', {});
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
audio.setSfxEnabled(false);
pending.shift()();
assert.equal(audio.guideVoiceSource, null, 'mute must cancel pending narration');
audio.playGuideVoice('guideA1');
assert.equal(pending.length, 0, 'muted narration must not load');
audio.setSfxEnabled(true);
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
ended.node.ended();
assert.equal(audio.guideVoiceSource, null);
assert.equal(ended.node.isValid, false, 'finished voice channel must release its node');
console.log('guide-a-audio.test.js passed');
