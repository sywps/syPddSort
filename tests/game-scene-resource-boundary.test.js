const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const scene = JSON.parse(fs.readFileSync(path.join(root, 'assets/BootstrapBundle/Scenes/Game.scene'), 'utf8'));
const nodes = scene.filter(record => record?.__type__ === 'cc.Node');
assert(!nodes.some(node => node._name === 'CompactLayout'));
assert(!JSON.stringify(scene).includes('5874aaa9-f1be-4047-a76a-bc098c25535f'));
const normal = nodes.find(node => node._name === 'NormalLayout');
assert(normal?._active, 'Normal conveyor remains enabled');
for (const node of nodes) {
    for (const child of node._children || []) {
        assert.equal(scene[child.__id__]?.__type__, 'cc.Node', node._name);
        assert.equal(scene[child.__id__]._parent?.__id__, scene.indexOf(node), node._name);
    }
    for (const component of node._components || []) {
        assert.equal(scene[component.__id__]?.node?.__id__, scene.indexOf(node), node._name);
    }
}
function validate(value) {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, '__id__')) assert(scene[value.__id__], 'dangling reference '+value.__id__);
    Object.values(value).forEach(validate);
}
validate(scene);
assert(!fs.existsSync(path.join(root, 'assets/BootstrapBundle/GameUI/RainbowConveyor/compact_conveyor_track.png')));
const patcher = fs.readFileSync(path.join(root, 'scripts/patch-bootstrap-dynamic-assets.js'), 'utf8');
assert(!patcher.includes("'GameUI/RainbowConveyor/compact_conveyor_track'"));
console.log('game-scene-resource-boundary.test.js passed');
