const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const gameplayView = read('assets/Scripts/Core/GameplayViewController.ts');
const sceneRuntime = read('assets/Scripts/Core/GameSceneRuntimeController.ts');

assert.ok(
    gameplayView.includes("const hideLevelOneTitle = runtime._activeGameplayEntryMode === 'main'")
        && gameplayView.includes('&& runtime.getActiveLogicalLevelId?.() === 1;')
        && gameplayView.includes('normalNode.active = !hideLevelOneTitle;')
        && gameplayView.includes('level1Node.active = false;'),
    'gameplay view must hide both title variants only for mainline level 1',
);
assert.ok(
    sceneRuntime.includes("const hideLevelOneTitle = pending.entryMode === 'main' && levelId === 1;")
        && sceneRuntime.includes('normalNode.active = !hideLevelOneTitle;')
        && sceneRuntime.includes('level1Node.active = false;'),
    'pending gameplay startup must not briefly show the level-1 title',
);

console.log('level1-title-visibility.test.js passed');
