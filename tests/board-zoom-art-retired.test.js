const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const sceneText = read('assets/BootstrapBundle/Scenes/Game.scene');
const scene = JSON.parse(sceneText);
assert(!scene.some(o => o.__type__ === 'cc.Node' && o._name === 'BoardZoomControl'));
function checkRefs(v) {
    if (!v || typeof v !== 'object') return;
    if (Number.isInteger(v.__id__)) assert(v.__id__ >= 0 && v.__id__ < scene.length);
    else Object.values(v).forEach(checkRefs);
}
scene.forEach(checkRefs);
const manifest = read('assets/Scripts/Core/UiManifest.ts');
const build = read('scripts/patch-bootstrap-dynamic-assets.js');
for (const part of ['fill', 'locate', 'minus', 'plus', 'thumb', 'track']) {
    const name = `board_zoom_${part}`;
    assert(!manifest.includes(name) && !build.includes(name));
    for (const ext of ['.png', '.png.meta']) {
        assert(!fs.existsSync(path.join(root, 'assets/BootstrapBundle/GameUI/Atlases/GameSceneSmall', name + ext)));
        assert(fs.existsSync(path.join(root, 'config/unused-art/board-zoom', name + ext)));
    }
    const uuid = JSON.parse(read(`config/unused-art/board-zoom/${name}.png.meta`)).uuid;
    assert(!sceneText.includes(uuid), 'retired sprite must not remain in scene');
}
const source = read('assets/Scripts/Core/GameCtrlModules/BoardZoomControlModule.ts');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(output, { module: mod, exports: mod.exports, require: () => ({}) });
const runtime = {
    getGameplayFixedRoot() { throw new Error('hidden zoom UI must not access scene nodes'); },
};
mod.exports.installBoardZoomControlModule(runtime);
runtime.setupBoardZoomControl();
assert.equal(runtime._boardZoomControlUi, null);
runtime.refreshBoardZoomControl();
runtime.setBoardZoomControlActive(true);
runtime.pulseBoardZoomControlActivity();
console.log('board-zoom-art-retired.test.js passed');
