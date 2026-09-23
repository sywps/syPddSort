const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const vm = require('vm');
// Engine implementation intentionally exposes only a mangled data accessor.
class Graphics {
    constructor() { this.impl = { xw: () => this.data }; this.data = []; this.subModels = []; this.destroyed = 0; }
    activeSubModel(index) { this.subModels[index] = {}; }
    _uploadData() { this.impl.xw().forEach((data, index) => Object.assign(this.subModels[index], data)); }
    clear() { this.data = []; }
    onDestroy() { this.destroyed++; this.subModels = []; }
}
const moduleBox = { exports: {} };
let registered;
const code = ts.transpileModule(fs.readFileSync('assets/Scripts/Core/BoardOutlineGraphics.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true } }).outputText;
vm.runInNewContext(code, { module: moduleBox, exports: moduleBox.exports, require: () => ({ Graphics, _decorator: { ccclass: name => value => { registered = name; return value; } } }) });
const Component = moduleBox.exports.BoardOutlineGraphics;
assert.equal(registered, 'BoardOutlineGraphics');
for (const method of ['activeSubModel', '_uploadData', 'onDestroy']) assert.equal(Component.prototype[method], Graphics.prototype[method]);
const instance = new Component();
assert.equal(instance.impl.getRenderDataList, undefined);
for (const count of [8, 200, 0, 30]) {
    instance.clear();
    instance.data = count ? [{ vertexStart: count, indexStart: count * 3 }] : [];
    if (count) instance.activeSubModel(0);
    instance._uploadData();
    if (count) assert.equal(instance.subModels[0].vertexStart, count);
}
instance.onDestroy(); assert.equal(instance.destroyed, 1);
console.log('board-outline-graphics: mangled engine accessor, redraw and destruction delegation passed');
