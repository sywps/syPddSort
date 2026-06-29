const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/StartupLocalProgress.ts'), 'utf8');

function loadModule(storage) {
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(output, {
        module,
        exports: module.exports,
        require(id) {
            if (id === 'cc') {
                return {
                    sys: {
                        localStorage: {
                            getItem(key) {
                                return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
                            },
                        },
                    },
                };
            }
            throw new Error(`unexpected require: ${id}`);
        },
    }, { filename: 'StartupLocalProgress.ts' });
    return module.exports;
}

{
    const progress = loadModule({}).readStartupLocalProgress();
    assert.strictEqual(progress.level, 1);
    assert.strictEqual(progress.state, 'rawLevelMissing');
}

{
    const progress = loadModule({ 'pdd.level': '6' }).readStartupLocalProgress();
    assert.strictEqual(progress.level, 6);
    assert.strictEqual(progress.state, 'local_progress_gt_1');
    assert.strictEqual(progress.source, 'pdd.level');
}

{
    const progress = loadModule({
        'pdd.user.profile.v1': JSON.stringify({ lastLevelId: 6 }),
    }).readStartupLocalProgress();
    assert.strictEqual(progress.level, 1);
    assert.strictEqual(progress.state, 'rawLevelMissing');
    assert.strictEqual(progress.source, 'default');
    assert.strictEqual(progress.hasStoredProgress, false);
}

{
    const progress = loadModule({
        'pdd.level': '2',
        'pdd.user.profile.v1': JSON.stringify({ lastLevelId: 6 }),
    }).readStartupLocalProgress();
    assert.strictEqual(progress.level, 2);
    assert.strictEqual(progress.state, 'local_progress_gt_1');
    assert.strictEqual(progress.source, 'pdd.level');
}

{
    const progress = loadModule({
        'pdd.level': 'abc',
        'pdd.user.profile.v1': JSON.stringify({ lastLevelId: 1 }),
    }).readStartupLocalProgress();
    assert.strictEqual(progress.level, 1);
    assert.strictEqual(progress.state, 'rawLevelInvalid');
    assert.strictEqual(progress.hasStoredProgress, false);
}

console.log('startup-local-progress.test.js passed');
