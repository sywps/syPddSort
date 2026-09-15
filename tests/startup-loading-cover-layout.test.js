const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

let visible;
const cc = {
    _decorator: { ccclass: () => Type => Type }, Component: class {},
    UITransform: class {}, Sprite: class {}, Widget: class {},
    view: { getVisibleSize: () => visible },
};
const moduleOutput = { exports: {} };
const source = fs.readFileSync('assets/Scripts/Core/StartupLoadingController.ts', 'utf8');
vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, experimentalDecorators: true },
}).outputText, {
    module: moduleOutput, exports: moduleOutput.exports,
    require: name => name === 'cc' ? cc : {},
});
const { StartupLoadingController } = moduleOutput.exports;
const controller = new StartupLoadingController();
const rect = () => ({ setContentSize(width, height) { this.width = width; this.height = height; } });
const canvasRect = rect(), overlayRect = rect(), coverRect = rect();
const widget = { enabled: true };
const group = { setPosition(x, y) { this.x = x; this.y = y; } };
controller.node = { getComponent: () => canvasRect };
controller.track = { parent: group };
controller.cover = {
    isValid: true, parent: { getComponent: () => overlayRect }, setPosition() {},
    getComponent(Type) {
        if (Type === cc.Sprite) return { spriteFrame: { originalSize: { width: 941, height: 1672 } } };
        return Type === cc.Widget ? widget : coverRect;
    },
};
for (const [width, height] of [[720, 1280], [720, 1600], [720, 1440], [720, 1680]]) {
    visible = { width, height };
    controller.resize();
    assert(coverRect.width >= width - 1e-8 && coverRect.height >= height - 1e-8, 'artwork must fill screen without bars');
    assert(Math.abs(coverRect.width / coverRect.height - 941 / 1672) < 1e-9, 'no stretching');
    const scale = coverRect.height / 1672;
    // Image-space safe bounds include the Logo and all health-notice text, not the side background.
    for (const [x, y] of [[210, 400], [735, 1615]]) {
        assert(Math.abs((x - 941 / 2) * scale) < width / 2, 'essential artwork must not be cropped horizontally');
        assert(Math.abs((y - 1672 / 2) * scale) < height / 2, 'essential artwork must not be cropped vertically');
    }
    assert.equal(canvasRect.width, width);
    assert.equal(overlayRect.height, height, 'input blocker remains full screen');
    assert.equal(widget.enabled, false, 'Widget cannot stretch the fitted cover');
    const noticeTop = -coverRect.height * 0.33;
    const restartBottom = group.y + 6.873 - 30;
    assert(restartBottom > noticeTop + 25, 'restart/progress controls must stay above health notice');
    assert(group.y + 70.357 + 55 < 0, 'stage text stays below the centered logo');
}
const meta = JSON.parse(fs.readFileSync('assets/Textures/UI/loading_cover.jpeg.meta', 'utf8'));
assert.equal(meta.uuid, '68c7d0e7-b854-4fd7-903e-6176fb9aebbb');
assert.equal(meta.subMetas.f9941.userData.rawWidth, 941);
assert.equal(meta.subMetas.f9941.userData.rawHeight, 1672);
assert(source.includes('new Color(78, 199, 252, 255)'), 'padding must use the new blue palette');
console.log('startup-loading-cover-layout.test.js passed');
