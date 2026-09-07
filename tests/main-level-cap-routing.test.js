const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const routeSource = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/LevelRouteService.ts'),
    'utf8',
);
const sceneHomeEntrySource = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts'),
    'utf8',
);
const settlementSource = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts'),
    'utf8',
);
const normalizedSceneHomeEntrySource = sceneHomeEntrySource.replace(/\r\n/g, '\n');
const normalizedSettlementSource = settlementSource.replace(/\r\n/g, '\n');

const output = ts.transpileModule(routeSource, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
    },
}).outputText;
const routeModule = { exports: {} };
vm.runInNewContext(output, {
    module: routeModule,
    exports: routeModule.exports,
}, { filename: 'LevelRouteService.ts' });

const { getPhysicalMainLevelId } = routeModule.exports;
for (const [savedLevel, expectedPhysicalLevel] of [
    [1, 1],
    [300, 300],
    [301, 300],
    [999999, 300],
]) {
    assert.strictEqual(
        getPhysicalMainLevelId(savedLevel),
        expectedPhysicalLevel,
        `saved level ${savedLevel} must route to physical level ${expectedPhysicalLevel}`,
    );
}

assert.ok(
    normalizedSceneHomeEntrySource.includes("const resolvedLevelId = prefix === 'level_'\n                ? mapLogicalToPhysicalLevelId(normalizedLevelId)"),
    'ordinary mainline loading must consume the capped physical-level mapper',
);

const fastStartBegin = sceneHomeEntrySource.indexOf('startGameAssetsLevelFast(');
const fastStartEnd = sceneHomeEntrySource.indexOf('startLocalBootstrapLevelFast(', fastStartBegin);
assert.ok(fastStartBegin >= 0 && fastStartEnd > fastStartBegin, 'fast mainline startup owner must remain inspectable');
const fastStartSource = sceneHomeEntrySource.slice(fastStartBegin, fastStartEnd);
assert.ok(
    fastStartSource.includes("if (prefix === 'level_')"),
    'fast startup must scope the cap to mainline levels',
);
assert.ok(
    fastStartSource.includes('levelId = mapLogicalToPhysicalLevelId(levelId);')
        && fastStartSource.includes('activeLevelId = mapLogicalToPhysicalLevelId(activeLevelId);'),
    'fast startup must cap both the loaded file ID and active/display ID',
);

assert.ok(
    normalizedSettlementSource.includes('const nextId = this.getActiveLogicalLevelId() + 1;\n            this.saveLevelProgress(nextId);'),
    'winning level 300 must keep the existing monotonic saved-progress update',
);
assert.ok(
    normalizedSettlementSource.includes('this.loadLevel(nextId);'),
    'settlement-next must continue through the capped ordinary loading boundary',
);

console.log('main-level-cap-routing.test.js passed');
