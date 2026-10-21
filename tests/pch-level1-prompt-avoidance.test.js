const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8');
const start = source.indexOf('    private prepareLevelOnePromptLayout(');
const end = source.indexOf('    private getOpeningGuidePromptCenterYAboveConveyor(', start);
assert.ok(start > 0 && end > start);
const method = source.slice(start, end);
assert.ok(!method.includes('boardViewport'));
assert.ok(!method.includes('boardGroup'));
const output = ts.transpileModule('class Layout { ' + method + ' }; module.exports = Layout;', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('module', 'UITransform', 'OPENING_GUIDE_PROMPT_HEIGHT', output)(mod, class {}, 140);
const layout = new mod.exports();
layout.belt = {};
layout.runtime = { getGameplayNodeBoundsInFixedRoot(node) {
    assert.equal(node, layout.belt);
    return { top: -300 };
} };
const parent = { getComponent: () => ({ height: 1280, anchorY: .5 }) };
assert.equal(layout.prepareLevelOnePromptLayout(parent), -262);
assert.equal(-222 - layout.prepareLevelOnePromptLayout(parent), 40);
console.log('pch-level1-prompt-avoidance.test.js passed');
