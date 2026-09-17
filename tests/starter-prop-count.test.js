const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const shared = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlShared.ts'), 'utf8');
const count = Number(shared.match(/const NEW_USER_STARTER_PROP_COUNT = (\d+);/)[1]);
assert.equal(count, 1);
const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/PlayerMetaStateModule.ts'), 'utf8');
const method = source.slice(source.indexOf('        grantStarterPropsForNewUser(): void {'), source.indexOf('        refreshGoldUI(): void {'));
const js = ts.transpileModule(`const methods = { ${method} }; methods;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;

function setup(initial = {}) {
    const data = new Map(Object.entries(initial));
    const methods = vm.runInNewContext(js, {
        NEW_USER_STARTER_PROP_COUNT: count,
        sys: { localStorage: { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value) } },
    });
    let syncs = 0;
    const runtime = { getPropStorageKey: kind => kind, queueCloudGameStateSync: () => syncs++ };
    return { data, grant: () => methods.grantStarterPropsForNewUser.call(runtime), syncs: () => syncs };
}
const fresh = setup();
fresh.grant();
for (const kind of ['freeze', 'brush', 'magnet']) assert.equal(fresh.data.get(kind), '1');
assert.equal(fresh.data.has('expand'), false);
fresh.grant();
assert.equal(fresh.syncs(), 1, 'reopening must not grant again');
const existing = setup({ freeze: '0', brush: '5', magnet: '3' });
existing.grant();
assert.deepEqual(Object.fromEntries(existing.data), { freeze: '0', brush: '5', magnet: '3' });
assert.equal(existing.syncs(), 0);
const legacy = setup({ wand: '4' });
legacy.grant();
assert.equal(legacy.data.get('freeze'), '4', 'preserve legacy inventory migration');
assert.equal(legacy.data.get('brush'), '1');
assert.equal(legacy.data.get('magnet'), '1');
console.log('starter-prop-count.test.js passed');
