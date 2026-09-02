'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const sourceRelativePath = 'assets/HomeAssetsBundle/GameUI/home_icon_background.png';
const bootstrapRelativePath = 'assets/BootstrapBundle/GameUI/gameplay_skill_slot_background.png';
const sourcePath = path.join(projectRoot, sourceRelativePath);
const bootstrapPath = path.join(projectRoot, bootstrapRelativePath);
const sourceMeta = JSON.parse(fs.readFileSync(`${sourcePath}.meta`, 'utf8'));
const bootstrapMeta = JSON.parse(fs.readFileSync(`${bootstrapPath}.meta`, 'utf8'));
const bootstrapPatch = fs.readFileSync(
    path.join(projectRoot, 'scripts/patch-bootstrap-dynamic-assets.js'),
    'utf8',
);
const scene = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'assets/BootstrapBundle/Scenes/Game.scene'),
    'utf8',
));

const BOOTSTRAP_UUID = 'd2fee374-a06c-43bd-a2bd-8fdbb71522c3';
const BOOTSTRAP_SPRITE_UUID = `${BOOTSTRAP_UUID}@f9941`;

assert.deepEqual(
    fs.readFileSync(bootstrapPath),
    fs.readFileSync(sourcePath),
    'Bootstrap skill-slot background must preserve the approved current image bytes',
);
assert.notEqual(bootstrapMeta.uuid, sourceMeta.uuid, 'Bootstrap clone must own a distinct asset UUID');
assert.equal(bootstrapMeta.uuid, BOOTSTRAP_UUID);
assert.equal(bootstrapMeta.subMetas['6c48a'].uuid, `${BOOTSTRAP_UUID}@6c48a`);
assert.equal(bootstrapMeta.subMetas.f9941.uuid, BOOTSTRAP_SPRITE_UUID);
assert.match(
    bootstrapPatch,
    /'GameUI\/gameplay_skill_slot_background'/,
    'The first-level skill background must remain explicitly allowed in the Bootstrap main package',
);

const childrenOf = (node) => (node?._children || []).map((reference) => scene[reference.__id__]);
const findChild = (node, name) => childrenOf(node).find((child) => child?._name === name);
const findComponent = (node, type) => (node?._components || [])
    .map((reference) => scene[reference.__id__])
    .find((component) => component?.__type__ === type);
const skillArea = scene.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'SkillArea');

for (const skillName of ['SkillMagnet', 'SkillBrush', 'SkillFreeze']) {
    const skill = findChild(skillArea, skillName);
    const backgroundSprite = findComponent(skill, 'cc.Sprite');
    assert.equal(
        backgroundSprite?._spriteFrame?.__uuid__,
        BOOTSTRAP_SPRITE_UUID,
        `${skillName} background must remain in BootstrapBundle`,
    );
}

console.log('bootstrap-skill-slot-background-contract.test.js passed');
