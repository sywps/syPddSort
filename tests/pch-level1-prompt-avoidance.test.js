const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8');
const start = source.indexOf('    private chooseLevelOnePromptLayout(');
const end = source.indexOf('    private prepareLevelOnePromptLayout(', start);
const output = ts.transpileModule(`class Layout { ${source.slice(start, end)} }; module.exports = Layout;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('module', output)(mod);
const layout = new mod.exports();
const choose = (...args) => layout.chooseLevelOnePromptLayout(...args);
assert.deepStrictEqual(choose(-100, 180, -300, 500, 140), { y: 274, scale: 1, boardY: 40 });
assert.deepStrictEqual(choose(-80, 390, -300, 420, 140), { y: -174, scale: 1, boardY: 155 });
const compact = choose(-250, 350, -300, 400, 140);
assert.ok(compact.scale < 1);
assert.equal(compact.y, 330);
// Portrait phone ranges and tall/wide board variants: prompt stays inside safe HUD bounds,
// does not overlap the resulting board, and does not enlarge the board.
for (const safeHeight of [400, 500, 600, 720, 900, 1100]) {
    for (const boardHeight of [180, 280, 400, 600, 800]) {
        const bottom = -safeHeight / 2;
        const top = safeHeight / 2;
        const result = choose(-boardHeight / 2, boardHeight / 2, bottom, top, 140);
        const boardBottom = result.boardY - boardHeight * result.scale / 2;
        const boardTop = result.boardY + boardHeight * result.scale / 2;
        assert.ok(result.y - 70 >= bottom - 1e-6);
        assert.ok(result.y + 70 <= top + 1e-6);
        assert.ok(result.y - 70 >= boardTop + 24 - 1e-6 || result.y + 70 <= boardBottom - 24 + 1e-6);
        assert.ok(result.scale > 0 && result.scale <= 1);
    }
}
const stepStart = source.indexOf('    private showLevelOneBoardGuideStep(');
const step = source.slice(stepStart, source.indexOf('    private createOpeningGuideFocusMask(', stepStart));
assert.ok(step.indexOf('prepareLevelOnePromptLayout') < step.indexOf('getBoundingBoxToWorld'));
assert.ok(step.includes('promptY,\n            handTargetLocal'));
assert.ok(source.includes('isLevelOneBoardGuide && promptYOverride !== undefined ? promptYOverride'));
console.log('pch-level1-prompt-avoidance.test.js passed');
