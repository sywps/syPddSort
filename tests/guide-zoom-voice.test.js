const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('assets/Scripts/Core/GameCtrlModules/CollectionGuideModule.ts', 'utf8');
const playStart = source.indexOf("                AudioMgr.inst.playGuideVoice('guideZoom'");
const playEnd = source.indexOf('                AnalyticsMgr.inst.trackFunnelEvent', playStart);
assert(playStart > 0 && playEnd > playStart);
const closeStart = source.indexOf('        closePinchGuide(');
const closeEnd = source.indexOf('\n        },', closeStart);
assert(closeStart > 0 && closeEnd > closeStart);
const code = ts.transpileModule(`class Harness {
  play(layer: any) { ${source.slice(playStart, playEnd)} }
  ${source.slice(closeStart, closeEnd)}
}; module.exports = Harness;`, { compilerOptions: {target:ts.ScriptTarget.ES2020} }).outputText;
const calls = []; let isCurrent;
const AudioMgr = {inst:{playGuideVoice:(name,guard)=>{calls.push(name);isCurrent=guard;},stopGuideVoice:()=>calls.push('stop'),releasePreparedGuideVoices:()=>calls.push('release')}};
const mod = {exports:{}};
new Function('module','AudioMgr','AnalyticsMgr','sys','LS_PINCH_GUIDE',code)(mod,AudioMgr,{inst:{trackFunnelEvent(){}}},{localStorage:{setItem(){}}},'pinch');
const h = new mod.exports();
h._activeGameplayEntryMode='main';h.getActiveLogicalLevelId=()=>4;h.unschedule=()=>{};
const layer = {isValid:true,activeInHierarchy:true,destroy(){this.isValid=false;}};
h._pinchGuideLayer=layer;h.play(layer);
assert.deepEqual(calls,['guideZoom']);assert.equal(isCurrent(),true);
layer.activeInHierarchy=false;assert.equal(isCurrent(),false);layer.activeInHierarchy=true;
h.isGameEnd=true;assert.equal(isCurrent(),false);h.isGameEnd=false;
h._pinchGuideLayer={};assert.equal(isCurrent(),false);h._pinchGuideLayer=layer;
h.closePinchGuide('gesture');assert.equal(isCurrent(),false);assert.deepEqual(calls,['guideZoom','stop','release']);
calls.length=0;h.closePinchGuide();assert.deepEqual(calls,[]);
const manifestSource=fs.readFileSync('assets/Scripts/Core/AudioManifest.ts','utf8');
const manifest={exports:{}};
new Function('module','exports',ts.transpileModule(manifestSource,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(manifest,manifest.exports);
assert.equal(manifest.exports.AUDIO_SFX_RESOURCE_PATH.guideZoom,'Audio/voices/guide_zoom');
assert(!manifest.exports.AUDIO_BOOTSTRAP_SFX_NAMES.includes('guideZoom'));
assert(fs.existsSync('assets/GameAssetsBundle/Audio/voices/guide_zoom.mp3'));
console.log('guide-zoom-voice.test.js passed: visible/current guide, stale load guard, dismissal stop, no bootstrap addition');
