const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const core = `${__dirname}/../assets/Scripts/Core/`;
function compile(source, deps = {}, globals = {}) {
    const mod = { exports: {} };
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    new Function('exports', 'require', ...Object.keys(globals), js)(mod.exports, key => deps[key], ...Object.values(globals));
    return mod.exports;
}
const source = fs.readFileSync(core + 'BrowserLevelPreview.ts', 'utf8');
const { BrowserLevelPreviewState: State } = compile(source, { 'cc/env': { PREVIEW: true }, './MiniGamePlatform': {} });
let state = new State(true, '?level=8');
assert.equal(state.getLevel(), 8);
state.setLevel(9);
assert.equal(state.getLevel(), 9);
assert.equal(new State(true, '?level=8').getLevel(), 8, 'reload resets session');
assert.equal(new State(true, '').active, false);
assert.equal(new State(false, '?level=8').active, false, 'release does not enable preview');
for (const query of ['?level=1=A', '?level=8&theme=1', '?level=8&pvppreview=1', '?level=8&cooppost=x', '?level=8&levelfile=x']) {
    assert.equal(new State(true, query).active, false, query);
}
assert.equal(new State(true, '?level=8', '#pddWorkbenchToken=x').active, false);
for (const query of ['?level=', '?level=0', '?level=-1', '?level=8abc', '?level=1.5', '?level=9007199254740992']) {
    assert.throws(() => new State(true, query).getLevel(), /预览关卡参数无效/);
}
function method(file, name) {
    const ast = ts.createSourceFile(file, fs.readFileSync(core + file, 'utf8'), ts.ScriptTarget.Latest, true);
    let result;
    function walk(node) {
        if (ts.isMethodDeclaration(node) && node.name.getText(ast) === name) result = node.getText(ast);
        ts.forEachChild(node, walk);
    }
    walk(ast);
    assert.ok(result, name);
    return result;
}
const forbidden = () => { throw Error('preview must not touch real progression'); };
const { Harness } = compile(`export class Harness {
    ${method('GameCtrlModules/AssetBootstrapModule.ts', 'recordMainlineLevelEntry')}
    ${method('GameCtrlModules/AssetBootstrapModule.ts', 'saveLevelProgress')}
    ${method('GameCtrlModules/GuideLeaderboardModule.ts', 'getDefaultEntryLevel')}
}`, {}, {
    getBrowserLevelPreview: () => state,
    sys: { localStorage: { setItem: forbidden } },
    UserMgr: { inst: { markLevelProgress: forbidden } },
    LeaderboardMgr: { inst: { submitProgress: forbidden } },
});
const runtime = new Harness();
runtime.getSavedLevel = () => 899;
runtime.queueCloudGameStateSync = forbidden;
state = new State(true, '?level=8');
runtime.recordMainlineLevelEntry(8);
assert.equal(runtime.getDefaultEntryLevel(), 8);
runtime.saveLevelProgress(9);
assert.equal(runtime.getDefaultEntryLevel(), 9, 'return home retains temporary next level');
assert.equal(runtime.getSavedLevel(), 899);
state = new State(true, '');
assert.equal(runtime.getDefaultEntryLevel(), 899, 'remove parameter restores actual save');
console.log('browser-level-preview tests passed');
