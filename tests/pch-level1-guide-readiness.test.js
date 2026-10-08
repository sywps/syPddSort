const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8');
const ast = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
const controller = ast.statements.find(node => ts.isClassDeclaration(node));
const names = ['onRootTouchEnd', 'handleOpeningGuideRootTap', 'handleLevelOneOpeningGuideRootTap',
    'isOpeningGuideTargetEvent', 'onOpeningGuideLevelOneTap'];
const methods = controller.members.filter(node => names.includes(node.name?.getText(ast))).map(node => node.getText(ast)).join('\n');
const compiled = ts.transpileModule(`class Harness { ${methods} }; module.exports = Harness;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('module', 'UITransform', compiled)(mod, class {});
const h = new mod.exports();
let actions = 0, completed = 0;
const bounds = { contains: p => p.x >= 10 && p.x <= 20 && p.y >= 10 && p.y <= 20 };
h.runtime = { isGameEnd: false, cellNodes: [[{ getComponent: () => ({ getBoundingBoxToWorld: () => bounds }) }]],
    getGameplayFixedRoot: () => ({}), levelData: {} };
h.rules = { board: { currentColors: [[3]] }, cells: [{ row: 0, col: 0, current: 3, locked: false }] };
h.inputRoot = { isValid: true };
h.inputLocked = true;
h.openingGuideLevelOneStep = 0;
h.openingGuideLevelOneCells = [{ row: 0, col: 0 }, { row: 0, col: 0 }];
h.trackOpeningGuideEvent = () => {};
h.maybeShowOpeningGuideWrongTapToast = () => {};
h.handleBoardTap = () => { actions++; return 'stored'; };
h.reportOpeningGuideTutorialFinish = () => { completed++; };
h.dismissOpeningGuide = () => { h.inputLocked = false; h.openingGuideLevelOneStep = -1; };
h.clearOpeningGuideNodes = () => { h.openingGuide = null; h.openingGuideTarget = null; };
h.showLevelOneBoardGuideStep = () => {
    assert.ok(h.openingGuideRingData, 'the second step must not run before the ring resource is ready');
    h.openingGuide = { isValid: true, activeInHierarchy: true, name: 'PchLevelOneGuideStep2' };
    h.openingGuideTarget = { isValid: true, activeInHierarchy: true, parent: h.inputRoot };
};
const event = (target = h.inputRoot, x = 15) => ({ target, getUILocation: () => ({ x, y: 15 }), propagationStopped: false });

// The actual first-step initializer sets its step before the async ring load completes.
for (const state of ['loading', 'destroyed', 'target_missing', 'target_hidden']) {
    h.openingGuide = state === 'loading' ? null : { isValid: state !== 'destroyed', activeInHierarchy: state !== 'destroyed', name: 'PchLevelOneGuideStep1' };
    h.openingGuideTarget = state === 'target_missing' ? null : { isValid: true, activeInHierarchy: state !== 'target_hidden', parent: h.inputRoot };
    const tap = event();
    h.onRootTouchEnd(tap);
    assert.equal(actions, 0, `${state}: an early touch must not consume the first move`);
    assert.equal(h.openingGuideLevelOneStep, 0, `${state}: wait for the first guide instead of invalidating its load`);
    assert.equal(tap.propagationStopped, true, `${state}: preserve the loading input lock`);
}
h.openingGuideRingData = {};
h.openingGuide = { isValid: true, activeInHierarchy: true, name: 'PchLevelOneGuideStep1' };
h.openingGuideTarget = { isValid: true, activeInHierarchy: true, parent: h.inputRoot };
const miss = event(h.openingGuideTarget, 25);
h.onRootTouchEnd(miss);
h.handleOpeningGuideRootTap(miss);
assert.equal(actions, 0, 'once ready, a gap still does not count as a bean');
const first = event(h.openingGuideTarget);
h.onRootTouchEnd(first);
assert.equal(actions, 0, 'the root capture delegates to the actual guide target');
h.handleOpeningGuideRootTap(first);
assert.equal(actions, 1, 'a ready target touch advances exactly once');
assert.equal(h.openingGuideLevelOneStep, 1);
const second = event();
h.onRootTouchEnd(second);
assert.equal(actions, 2, 'a target-colored bean outside the target node route remains accepted');
assert.equal(completed, 1);
assert.equal(h.inputLocked, false);
console.log('pch-level1-guide-readiness.test.js passed: pending/destroyed guides reject early input; ready target/root routes complete two steps once');
