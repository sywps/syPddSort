const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('assets/Scripts/Core/GameCtrlModules/BeanSkinModule.ts', 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exportsBox = {};
let creator = false;
const storage = new Map();
const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
new Function('exports', 'require', compiled)(exportsBox, name => {
    if (name === '../BrowserLevelPreview') return { getBrowserLevelPreview: () => ({ active: false }) };
    if (name === '../CreatorWeb') return { isCreatorWeb: () => creator };
    if (name === '../GameCtrlShared') return { PINDD_BEAN_VARIANTS: [1, 2, 4], sys: { localStorage }, UserStateSyncMgr: { inst: { flushPendingSave() {} } } };
    if (['../RuntimeLog', '../PreviewRewardSave'].includes(name)) return {};
    throw Error(`Unexpected module dependency: ${name}`);
});
const catalog = JSON.parse(fs.readFileSync('assets/GameAssetsBundle/BeanSkins/bean-skins.json', 'utf8'));
function load(json) {
    const runtime = {};
    exportsBox.installBeanSkinModule(runtime);
    runtime._withGameAssetsBundle = callback => callback({});
    runtime._loadAtlasDataFromBundle = (_bundle, key, _context, callback) => {
        assert.equal(key, 'BeanSkins/bean-skins');
        callback(null, json);
    };
    let result;
    runtime._loadBeanSkinConfig((config, error) => { result = { config, error, runtime }; });
    assert(result, 'loader calls back');
    return result;
}
const current = load(catalog);
assert.ifError(current.error);
assert.deepStrictEqual(current.config.rows.map(row => row.id), [2000, 2004, 2002, 2003, 2001]);
assert.equal(current.config.byId.get(2004).unlockValue, 9);
assert.equal(current.config.byId.get(2001).unlockValue, 117);
assert.equal(current.runtime.isBeanSkinOwned(2001), false);
creator = true;
for (const row of current.config.rows) {
    assert(current.runtime.isBeanSkinOwned(row.id));
    current.runtime._persistEquippedBeanSkinSelection(row.id);
    assert.equal(load(catalog).runtime.getEquippedBeanSkinId(), row.id, 'selection survives a fresh runtime');
}
assert.equal(current.runtime.isBeanSkinOwned(9999), false);
assert.equal(storage.has('pdd.level'), false);
creator = false;
assert.equal(load(catalog).runtime.getEquippedBeanSkinId(), 2000, 'ordinary mode still rejects locked equipment');
current.runtime._loadBeanSkinConfig((config, error) => {
    assert.ifError(error);
    assert.strictEqual(config, current.config, 'successful catalog is cached');
});
const legacy = structuredClone(catalog);
legacy.skins.forEach((row, i) => { row.sort = i + 1; });
assert.ifError(load(legacy).error);
for (const [mutate, message] of [
    [json => { json.skins[1].sort = json.skins[2].sort; }, /sort positions must be unique/],
    [json => { json.skins[1].sort = 1.5; }, /invalid sort row/],
    [json => { json.skins[1].sort = 6; }, /invalid sort row/],
    [json => { json.skins[0].sort = 2; }, /invalid sort row/],
    [json => { json.skins.pop(); }, /must contain exactly ids/],
    [json => { json.skins[1] = { ...json.skins[2] }; }, /must contain exactly ids/],
    [json => { json.skins[1].key = 'bean_skin_05'; }, /invalid identity row/],
]) {
    const value = structuredClone(catalog);
    mutate(value);
    const result = load(value);
    assert.equal(result.config, null);
    assert.match(result.error.message, message);
    assert.equal(result.runtime._beanSkinConfigCache, undefined, 'invalid catalog is not cached');
}
console.log('Bean skin loader: reordered catalog, ID lookup, legacy order, cache and invalid catalog rejection passed');
