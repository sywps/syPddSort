'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const skillUi = read('assets/Scripts/Core/GameplaySkillUiController.ts');
const gameScene = JSON.parse(read('assets/BootstrapBundle/Scenes/Game.scene'));

const sceneNode = (name) => gameScene.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === name);
const sceneChildren = (node) => (node?._children || [])
    .map((reference) => gameScene[reference.__id__])
    .filter((entry) => entry?.__type__ === 'cc.Node');
const sceneChild = (node, name) => sceneChildren(node).find((entry) => entry._name === name);
const sceneComponent = (node, type) => (node?._components || [])
    .map((reference) => gameScene[reference.__id__])
    .find((entry) => entry?.__type__ === type);
const assertFiniteTransform = (node, pathLabel) => {
    assert.ok(node, `${pathLabel} must exist in Game.scene`);
    assert.ok(Number.isFinite(node._lpos?.x) && Number.isFinite(node._lpos?.y), `${pathLabel} must own a finite scene position`);
    assert.ok(Number.isFinite(node._lscale?.x) && node._lscale.x > 0, `${pathLabel} must own a positive scene scale`);
};

const fixedRoot = sceneNode('GameplayFixedRoot');
const bottomHud = sceneChild(fixedRoot, 'BottomHudGroup');
const skillArea = sceneChild(bottomHud, 'SkillArea');
const shellNames = ['SkillMagnet', 'SkillBrush', 'SkillFreeze'];

assert.deepEqual(
    sceneChildren(skillArea).map((node) => node._name),
    shellNames,
    'SkillArea must author exactly the three gameplay skill shells',
);

for (const shellName of shellNames) {
    const shell = sceneChild(skillArea, shellName);
    assertFiniteTransform(shell, `SkillArea/${shellName}`);
    const shellUi = sceneComponent(shell, 'cc.UITransform');
    assert.ok(shellUi?._contentSize?.width > 0 && shellUi?._contentSize?.height > 0, `${shellName} must own a valid scene size`);
    const widget = sceneComponent(shell, 'cc.Widget');
    assert.equal(widget?._enabled, true, `${shellName} Widget must remain scene-enabled`);
    assert.ok(Number.isFinite(widget?._horizontalCenter) && Number.isFinite(widget?._bottom), `${shellName} Widget must own its scene alignment`);

    for (const badgeName of ['AdPlayIcon', 'CountBadge']) {
        const badge = sceneChild(shell, badgeName);
        assertFiniteTransform(badge, `SkillArea/${shellName}/${badgeName}`);
        const badgeUi = sceneComponent(badge, 'cc.UITransform');
        assert.ok(badgeUi?._contentSize?.width > 0 && badgeUi?._contentSize?.height > 0, `${shellName}/${badgeName} must own a valid scene size`);
    }
}

assert.ok(skillUi.includes('const shellWidget = shell.getComponent(Widget);'), 'runtime must fail fast when a scene-authored skill Widget is missing');
assert.ok(!skillUi.includes('shellWidget.enabled ='), 'runtime must not change scene-authored skill Widget state');
assert.ok(!skillUi.includes('COMPACT_SKILL_'), 'runtime compact layout constants must be removed');
assert.ok(!skillUi.includes('shell.setPosition('), 'runtime must not position skill shells');
assert.ok(!skillUi.includes('shell.setScale('), 'runtime must not scale skill shells');
assert.ok(!skillUi.includes('badge.setPosition('), 'runtime must not position skill badges');

console.log('gameplay-skill-scene-layout.test.js passed');
