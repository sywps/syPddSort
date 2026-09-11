const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.resolve(__dirname, '../assets/Scripts/Core/GameCtrlModules/GameplayColorCompleteFxModule.ts');
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
let method;
let clearMethod;
function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'recyclePinddSpineFxNode') method = node.getText(ast);
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'clearPatternCompleteMatchFx') clearMethod = node.getText(ast);
    ts.forEachChild(node, visit);
}
visit(ast);
assert(method, 'load actual production recycling method');
assert(clearMethod, 'load actual production bulk cleanup caller');
const sandbox = { sp: { Skeleton: class Skeleton {} }, UIOpacity: class UIOpacity {}, PINDD_SPINE_FX_POOL_LIMIT: 80 };
vm.runInNewContext(ts.transpileModule(`globalThis.methods = ({${method}, ${clearMethod}}); globalThis.recycle = methods.recyclePinddSpineFxNode`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, sandbox);

function node(id, valid = true) {
    return {
        id, isValid: valid, active: true, detached: false, scale: null,
        opacity: { opacity: 40 }, skeleton: { setCompleteListener(listener) { this.listener = listener; } },
        getComponent(type) { return type === sandbox.sp.Skeleton ? this.skeleton : this.opacity; },
        removeFromParent() { this.detached = true; },
        setScale(...scale) { this.scale = scale; },
        destroy() { this.isValid = false; },
    };
}
function runtime(nodes) {
    const pooled = [];
    return {
        _activePinddSpineFxNodes: nodes,
        _pinddSpineFxActiveCount: nodes.filter(n => n.isValid).length,
        _pinddSpineFxPool: { put: n => pooled.push(n) },
        getNodePoolSize: () => pooled.length,
        pooled,
    };
}

// Complete all same-frame effects and count actual replacement allocations, not heap estimates.
const nodes = Array.from({ length: 869 }, (_, index) => node(index));
const value = runtime(nodes.slice());
let replacements = 0;
let replacementSlots = 0;
for (const effect of nodes) {
    const prior = value._activePinddSpineFxNodes;
    sandbox.recycle.call(value, effect);
    if (value._activePinddSpineFxNodes !== prior) {
        replacements++;
        replacementSlots += value._activePinddSpineFxNodes.length;
    }
    assert(effect.detached);
    assert.equal(effect.active, false);
    assert.deepEqual(effect.scale, [1, 1, 1]);
    assert.equal(effect.opacity.opacity, 255);
    assert.equal(effect.__pinddSpineFxSeq, 1);
}
assert.equal(value._pinddSpineFxActiveCount, 0);
assert.equal(value._activePinddSpineFxNodes.length, 0);
assert.equal(value.pooled.length, 80, 'retain the existing pool bound');
assert.equal(nodes.filter(n => n.isValid).length, 80, 'overflow effects are destroyed');
console.log(`869 completions: replacement arrays=${replacements}, replacement slots=${replacementSlots}`);
assert.equal(replacements, 0, 'effect recycling must not allocate a replacement active list per completion');

// Keep survivor order and remove stale nodes and all occurrences of the recycled node.
const a = node('a'), b = node('b'), c = node('c'), dead = node('dead', false);
const mixed = runtime([dead, a, b, c, b, dead]);
sandbox.recycle.call(mixed, b);
assert.deepEqual(mixed._activePinddSpineFxNodes.map(n => n.id), ['a', 'c']);
sandbox.recycle.call(mixed, a);
assert.deepEqual(mixed._activePinddSpineFxNodes.map(n => n.id), ['c']);
sandbox.recycle.call(mixed, c);
assert.equal(mixed._activePinddSpineFxNodes.length, 0);
const empty = runtime([]);
sandbox.recycle.call(empty, dead);
assert.equal(empty._pinddSpineFxActiveCount, 0);

// The real bulk-cleanup caller snapshots the list; mutating the live list must not skip effects.
const bulkNodes = Array.from({ length: 869 }, (_, index) => node(index));
const bulk = runtime(bulkNodes.slice());
bulk.recyclePinddSpineFxNode = sandbox.recycle;
sandbox.methods.clearPatternCompleteMatchFx.call(bulk);
assert.equal(bulk._activePinddSpineFxNodes.length, 0);
assert.equal(bulk._pinddSpineFxActiveCount, 0);
assert.equal(bulk.pooled.length, 80);
assert(bulkNodes.every(effect => effect.detached && effect.__pinddSpineFxSeq === 1));
console.log('spine-fx-recycle-allocation.test.js passed (allocation count and pool behavior; device memory unmeasured)');
