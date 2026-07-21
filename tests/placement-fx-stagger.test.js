const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts'),
    'utf8',
);
const output = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
}).outputText;
const sandbox = {
    exports: {},
    module: { exports: {} },
    require(request) {
        if (request === './GameplayColorCompleteFxModule') {
            return { installGameplayColorCompleteFxMethods() {} };
        }
        if (request === './GameplaySlotCompactionModule') {
            return { installGameplaySlotCompactionMethods() {} };
        }
        if (request === '../RuntimeLog') {
            return { runtimeLog() {} };
        }
        if (request === '../GameCtrlShared') {
            return new Proxy({}, {
                get() {
                    return class RuntimeStub {};
                },
            });
        }
        return {};
    },
    console,
};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(output, sandbox, { filename: 'GameplayPlacementFxModule.ts' });

const { getBeanFlyStaggerDelay } = sandbox.module.exports;
assert.strictEqual(getBeanFlyStaggerDelay(0), 0, 'empty transfers must not stagger');
assert.strictEqual(getBeanFlyStaggerDelay(1), 0, 'single-bean transfers must start immediately');
assert.strictEqual(getBeanFlyStaggerDelay(12), 0.028, 'the existing 12-bean L1 animation cadence must stay unchanged');

const fortyEightDelay = getBeanFlyStaggerDelay(48);
assert.ok(fortyEightDelay > 0, 'large transfers must retain a visible stagger');
assert.ok(Math.abs(fortyEightDelay * 47 - 0.35) < 1e-9, 'the last bean in a 48-bean transfer must start within the 0.35-second cap');
assert.ok(getBeanFlyStaggerDelay(96) * 95 <= 0.35 + Number.EPSILON, 'the cap must remain generic for larger blocks');

console.log('placement-fx-stagger.test.js passed');
