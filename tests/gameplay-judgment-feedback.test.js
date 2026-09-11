const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function readWavInfo(filePath) {
    const buffer = fs.readFileSync(filePath);
    assert.strictEqual(buffer.toString('ascii', 0, 4), 'RIFF', `${filePath} must be a RIFF WAV`);
    assert.strictEqual(buffer.toString('ascii', 8, 12), 'WAVE', `${filePath} must be a WAVE file`);
    const channels = buffer.readUInt16LE(22);
    const sampleRate = buffer.readUInt32LE(24);
    const byteRate = buffer.readUInt32LE(28);
    let offset = 12;
    let dataBytes = 0;
    while (offset + 8 <= buffer.length) {
        const chunkName = buffer.toString('ascii', offset, offset + 4);
        const chunkBytes = buffer.readUInt32LE(offset + 4);
        if (chunkName === 'data') {
            dataBytes = chunkBytes;
            break;
        }
        offset += 8 + chunkBytes + (chunkBytes % 2);
    }
    assert.ok(dataBytes > 0 && byteRate > 0, `${filePath} must contain decodable PCM data`);
    return { channels, sampleRate, duration: dataBytes / byteRate };
}

const modulePath = 'assets/Scripts/Core/GameCtrlModules/GameplayJudgmentFeedbackModule.ts';
const source = read(modulePath);
const manifest = read('assets/Scripts/Core/AudioManifest.ts');
const audioMgr = read('assets/Scripts/Core/AudioMgr.ts');
const assetBootstrap = read('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts');
const colorFx = read('assets/Scripts/Core/GameCtrlModules/GameplayColorCompleteFxModule.ts');
const placement = read('assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts');
const gameplaySession = read('assets/Scripts/Core/GameplaySessionController.ts');

const expected = [
    ['great', 'judgment_Great_green', 'judgmentGreat', 'SFX_Female_great'],
    ['awesome', 'judgment_Awesome_orange', 'judgmentAwesome', 'SFX_Female_awesome'],
    ['amazing', 'judgment_Amazing_red', 'judgmentAmazing', 'SFX_Female_amazing'],
    ['excellent', 'judgment_Excellent_blue', 'judgmentExcellent', 'SFX_Female_excellent'],
    ['perfect', 'judgment_Perfect_purple', 'judgmentPerfect', 'SFX_Female_perfect'],
    ['unbelievable', 'judgment_Unbelievable_pink', 'judgmentUnbelievable', 'SFX_Female_unbelievable'],
];

for (const [key, textureName, voiceName, audioFile] of expected) {
    assert.ok(source.includes(`{ key: '${key}', textureName: '${textureName}', voice: '${voiceName}' }`), `${key} visual and voice must share one entry`);
    assert.ok(manifest.includes(`${voiceName}: 'Audio/Judgment/${audioFile}'`), `${voiceName} must map to its matching WAV`);
    assert.ok(manifest.includes(`${voiceName}: 0.56`), `${voiceName} must use the approved reduced volume`);
    const pngPath = path.join(root, 'assets/GameAssetsBundle/Textures/UI/Judgment', `${textureName}.png`);
    const wavPath = path.join(root, 'assets/GameAssetsBundle/Audio/Judgment', `${audioFile}.wav`);
    assert.ok(fs.existsSync(pngPath) && fs.existsSync(`${pngPath}.meta`), `${textureName} PNG and meta must exist`);
    assert.ok(fs.existsSync(wavPath) && fs.existsSync(`${wavPath}.meta`), `${audioFile} WAV and meta must exist`);
    assert.ok(source.includes(`'${textureName}'`), `${textureName} must be in the gameplay Judgment manifest`);
    const png = PNG.sync.read(fs.readFileSync(pngPath));
    const pngMeta = JSON.parse(fs.readFileSync(`${pngPath}.meta`, 'utf8'));
    assert.strictEqual(pngMeta.subMetas.f9941.userData.rawWidth, png.width, `${textureName} meta width must match the source PNG`);
    assert.strictEqual(pngMeta.subMetas.f9941.userData.rawHeight, png.height, `${textureName} meta height must match the source PNG`);
    assert.strictEqual(pngMeta.subMetas.f9941.userData.trimType, 'none', `${textureName} must preserve the complete glow bounds`);
    const wavInfo = readWavInfo(wavPath);
    assert.deepStrictEqual([wavInfo.sampleRate, wavInfo.channels], [22050, 2], `${audioFile} must retain the reference encoding`);
    const wavMeta = JSON.parse(fs.readFileSync(`${wavPath}.meta`, 'utf8'));
    assert.strictEqual(wavMeta.importer, 'audio-clip', `${audioFile} meta must use the Cocos audio importer`);
}

const commonAudioPath = path.join(root, 'assets/GameAssetsBundle/Audio/Judgment/SFX_color_complete.wav');
const removedBannerPath = path.join(root, 'assets/GameAssetsBundle/Textures/UI/Judgment/judgment_banner_ribbon.png');
assert.ok(!fs.existsSync(removedBannerPath) && !fs.existsSync(`${removedBannerPath}.meta`), 'the removed banner asset must not ship');
assert.ok(fs.existsSync(commonAudioPath) && fs.existsSync(`${commonAudioPath}.meta`), 'common color-complete WAV and meta must exist');
const commonAudioInfo = readWavInfo(commonAudioPath);
assert.ok(commonAudioInfo.duration > 1.82 && commonAudioInfo.duration < 1.83, 'common completion cue must retain its 1.824s reference tail');
assert.ok(manifest.includes("winColor: 'Audio/Judgment/SFX_color_complete'"), 'winColor must use the reference common color-complete cue');
assert.ok(manifest.includes("winAll: 'Audio/winColor'"), 'winAll must keep the previous whole-board cue');
assert.ok(manifest.includes('winColor: 0.32'), 'the long common completion cue must use the reduced volume');
assert.ok(assetBootstrap.includes("['Textures/UI/Judgment', ...GAME_ASSETS_TEXTURE_SEARCH_DIRS]"), 'the formal Judgment texture directory must be searchable');

assert.ok(source.includes('GAMEPLAY_JUDGMENT_DURATION_SECONDS = 1'), 'central visual must retain the documented 1.0s timeline');
assert.ok(source.includes('GAMEPLAY_JUDGMENT_VOICE_LOCK_MS = 1180'), 'voice and central visual must share the approved mutual-exclusion window');
assert.ok(source.includes('this.scheduleOnce(this.flushGameplayJudgmentFeedback, 0);'), 'same-frame completions must aggregate on the next scheduler frame');
assert.ok(source.includes('Math.min(GAMEPLAY_JUDGMENT_ENTRIES.length, completedColorCount) - 1'), 'completed-color count must deterministically select the six ranks');
assert.ok(source.includes("this.requireCanvasUiRoot('FxRoot')"), 'central feedback must use the full-screen FxRoot');
assert.ok(!source.includes('GAMEPLAY_JUDGMENT_BANNER_TEXTURE') && !source.includes("createSpriteNode('Banner'"), 'central feedback must not create or load the removed banner');
assert.ok(source.includes('GAMEPLAY_JUDGMENT_SCALE_MULTIPLIER = 0.85'), 'word feedback must use the approved smaller scale');
assert.ok(source.includes('displayScale * GAMEPLAY_JUDGMENT_SCALE_MULTIPLIER'), 'the responsive fit scale must include the smaller-size multiplier');
assert.ok(source.includes('GAMEPLAY_JUDGMENT_VERTICAL_RATIO = 0.31'), 'word feedback must use the approved higher vertical ratio');
assert.ok(source.includes('container.setPosition(0, fxRootHeight * GAMEPLAY_JUDGMENT_VERTICAL_RATIO, 0)'), 'word feedback must position itself from the full-screen height');
assert.ok(source.includes('GAMEPLAY_JUDGMENT_WORD_START_SECONDS = 0.067'), 'word activation must retain the first keyframe');
assert.ok(source.includes('GAMEPLAY_JUDGMENT_DELAYED_WORD_START_SECONDS = 0.167'), 'Awesome and Amazing must follow the documented delayed word keyframe');
assert.ok(colorFx.includes("AudioMgr.inst.play('winColor');\n                this.requestGameplayJudgmentFeedback();"), 'common cue and central feedback must start from the same color-complete event');
assert.ok(colorFx.includes('() => this.waitForGameplayJudgmentFeedback(onDone)'), 'b1 completion callbacks must wait for the 1.0s central visual before final board shrink');
assert.ok(gameplaySession.includes('for (const name of GAMEPLAY_JUDGMENT_PRELOAD_SFX_NAMES)'), 'all Judgment audio must preload on gameplay entry');
assert.ok(gameplaySession.includes('runtime.preloadGameplayJudgmentFeedback?.();'), 'all Judgment SpriteFrames must preload on gameplay entry');
assert.ok(gameplaySession.includes('runtime.clearGameplayJudgmentFeedback?.();'), 'new gameplay sessions must clear stale Judgment callbacks');
assert.ok(placement.includes('this.clearGameplayJudgmentFeedback?.();'), 'placement and scene cleanup must clear Judgment callbacks and nodes');

const allowlistBody = audioMgr.match(/const GAME_SCENE_SFX_ALLOWLIST = new Set<SfxName>\(\[([\s\S]*?)\]\);/)[1];
for (const [, , voiceName] of expected) {
    assert.ok(allowlistBody.includes(`'${voiceName}'`), `${voiceName} must be allowed in Game scene`);
}

const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
    },
}).outputText;
const moduleRecord = { exports: {} };
let clockMs = 1000;
const gameCtrlSharedMock = {
    AudioMgr: { inst: { play: () => {} } },
    Layers: { Enum: { UI_2D: 1 } },
    Node: class {},
    Sprite: { Type: { SIMPLE: 0 }, SizeMode: { CUSTOM: 0 } },
    SpriteFrame: class {},
    tween: () => ({ to() { return this; }, delay() { return this; }, call() { return this; }, start() {} }),
    Tween: { stopAllByTarget: () => {} },
    UIOpacity: class {},
    UITransform: class {},
    Vec3: class {},
};
vm.runInNewContext(compiled, {
    module: moduleRecord,
    exports: moduleRecord.exports,
    require: (request) => {
        if (request === '../GameCtrlShared') return gameCtrlSharedMock;
        throw new Error(`unexpected module: ${request}`);
    },
    console,
    Date: { now: () => clockMs },
    Error,
    Math,
    Number,
    Object,
    Set,
}, { filename: 'GameplayJudgmentFeedbackModule.compiled.js' });

const scheduled = [];
const played = [];
const runtime = {
    isValid: true,
    _completedColors: new Set([1, 2]),
    _gameplayJudgmentPreloadReady: true,
    scheduleOnce(callback, delay) {
        scheduled.push({ callback, delay });
    },
    unschedule() {},
};
moduleRecord.exports.installGameplayJudgmentFeedbackMethods(runtime);
runtime.playGameplayJudgmentFeedback = (entry) => played.push(entry.key);
runtime.requestGameplayJudgmentFeedback();
runtime._completedColors.add(3);
runtime.requestGameplayJudgmentFeedback();
assert.strictEqual(scheduled.length, 1, 'multiple completions in one frame must schedule one central feedback');
assert.strictEqual(scheduled[0].delay, 0, 'aggregation must wait only until the next scheduler frame');
scheduled.shift().callback.call(runtime);
assert.deepStrictEqual(played, ['amazing'], 'the aggregated feedback must use the final completed-color count for that frame');

runtime._gameplayJudgmentVoiceLockedUntilMs = 3000;
clockMs = 2000;
runtime.requestGameplayJudgmentFeedback();
assert.strictEqual(scheduled.length, 0, 'feedback inside the voice lock must be dropped instead of queued');
clockMs = 3001;
runtime.requestGameplayJudgmentFeedback();
assert.strictEqual(scheduled.length, 1, 'feedback after the voice lock may start normally');
assert.strictEqual(runtime._gameplayJudgmentVisualEndsAtMs, 4001, 'a request must reserve the full 1.0s visual window before the next-frame flush');

scheduled.length = 0;
let judgmentWaitCompleted = false;
runtime.waitForGameplayJudgmentFeedback(() => { judgmentWaitCompleted = true; });
assert.strictEqual(scheduled.length, 1, 'final flow must schedule the remaining central visual hold');
assert.strictEqual(scheduled[0].delay, 1, 'final flow must wait for the exact remaining 1.0s visual timeline');
clockMs = 4001;
runtime._gameplayJudgmentVisualEndsAtMs = 4201;
scheduled.shift().callback.call(runtime);
assert.strictEqual(judgmentWaitCompleted, false, 'a late visual start must extend the final-flow hold');
assert.strictEqual(scheduled.length, 1, 'the hold must recheck the actual visual end time');
assert.ok(Math.abs(scheduled[0].delay - 0.2) < 0.0001, 'the recheck must wait only for the shifted remainder');
clockMs = 4201;
scheduled.shift().callback.call(runtime);
assert.strictEqual(judgmentWaitCompleted, true, 'final flow must resume after the central visual ends');

console.log('gameplay-judgment-feedback.test.js passed');
