'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const bootstrapRelativePath = 'assets/BootstrapBundle/GameUI/Atlases/GameSceneSmall/gameplay_skill_slot_background.png';
const bootstrapPath = path.join(projectRoot, bootstrapRelativePath);
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
const BOOTSTRAP_IMAGE_SHA256 = '50355c32517dd6e469262939dbb4e615be81b31f64837d017567292ad5090eb2';

assert.equal(
    crypto.createHash('sha256').update(fs.readFileSync(bootstrapPath)).digest('hex'),
    BOOTSTRAP_IMAGE_SHA256,
    'Bootstrap skill-slot background must preserve its independently approved image bytes',
);
assert.equal(bootstrapMeta.uuid, BOOTSTRAP_UUID);
assert.equal(bootstrapMeta.subMetas['6c48a'].uuid, `${BOOTSTRAP_UUID}@6c48a`);
assert.equal(bootstrapMeta.subMetas.f9941.uuid, BOOTSTRAP_SPRITE_UUID);
assert.match(
    bootstrapPatch,
    /'GameUI\/Atlases\/GameSceneSmall\/gameplay_skill_slot_background'/,
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
