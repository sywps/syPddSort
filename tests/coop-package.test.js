'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const { coopHalfLevel, coopRegionGrid } = require('../cloudfunctions/coopService/runtime/CoopModeConfig');
const bundleDir = path.join(root, 'build/wechatgame/minigame/assets/main');
const file = process.argv[2] || path.join(bundleDir, fs.readdirSync(bundleDir).find(name => /^index\..+\.js$/.test(name)));
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const candidates = [];
function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.getText(ast).includes('合作区域颜色数量不守恒')) candidates.push(node);
    ts.forEachChild(node, visit);
}
visit(ast);
assert(candidates.length, 'package must contain the cooperation partition validator');
const fn = candidates.sort((a, b) => a.end - a.pos - (b.end - b.pos))[0];
const dependencies = {};
function bindHelpers(node) {
    if (ts.isReturnStatement(node) && node.expression && ts.isCallExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)) dependencies[node.expression.expression.text] = Object.assign;
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'correctColorArr'
        && ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression)) {
        dependencies[node.initializer.expression.text] = coopRegionGrid;
    }
    ts.forEachChild(node, bindHelpers);
}
bindHelpers(fn);
// Execute the actual Cocos output. Only the object-spread and grid-display helpers are supplied.
const packagedHalf = new Function(...Object.keys(dependencies), `return (${fn.getText(ast)});`)(...Object.values(dependencies));
const catalog = require('../assets/GameAssetsBundle/coop-manifest.json').levels;
let halves = 0, rejections = 0;
for (const entry of catalog) {
    const full = JSON.parse(fs.readFileSync(path.join(root, 'assets/LevelData', entry.file)));
    for (const role of ['creator', 'collaborator']) {
        assert.deepEqual(packagedHalf(full, role), coopHalfLevel(full, role), `${entry.name}: ${role} must load in the package`);
        halves++;
    }
    if (!full.coopRegions) continue;
    const broken = JSON.parse(JSON.stringify(full));
    const r = broken.coopRegions.findIndex(row => row.includes(1));
    const c = broken.coopRegions[r].indexOf(1);
    broken.initRandomColorArr[r][c] = broken.initRandomColorArr[r][c] % 20 + 1;
    for (const role of ['creator', 'collaborator']) {
        assert.throws(() => packagedHalf(broken, role), /合作区域颜色数量不守恒/, 'invalid inventories must still be rejected');
        rejections++;
    }
}
console.log(`COOP_PACKAGE_TESTS_PASSED: ${halves} packaged halves, ${rejections} invalid-inventory rejections`);
