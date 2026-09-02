const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scenePath = path.join(root, 'assets/HomeAssetsBundle/Scenes/Home.scene');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
const isNode = (entry) => entry && entry.__type__ === 'cc.Node';
const isSceneOrNode = (entry) => isNode(entry) || entry?.__type__ === 'cc.Scene';

let nodeCount = 0;
for (let index = 0; index < scene.length; index += 1) {
    const node = scene[index];
    if (!isNode(node)) continue;
    nodeCount += 1;

    const children = node._children || [];
    assert.ok(Array.isArray(children), `Home.scene node #${index} must serialize children as an array`);
    for (const childRef of children) {
        const childIndex = childRef?.__id__;
        assert.ok(Number.isInteger(childIndex), `Home.scene node #${index} has a child without a numeric __id__`);
        assert.notStrictEqual(childIndex, index, `Home.scene node #${index} must not contain itself as a child`);
        const child = scene[childIndex];
        assert.ok(isNode(child), `Home.scene node #${index} child #${childIndex} must be a cc.Node`);
        assert.strictEqual(child._parent?.__id__, index, `Home.scene child #${childIndex} must point back to parent #${index}`);
    }

    if (node._parent) {
        const parentIndex = node._parent.__id__;
        const parent = scene[parentIndex];
        assert.ok(isSceneOrNode(parent), `Home.scene node #${index} parent #${parentIndex} must be a cc.Scene or cc.Node`);
        assert.ok((parent._children || []).some((childRef) => childRef?.__id__ === index), `Home.scene parent #${parentIndex} must contain child #${index}`);
    }
}

assert.ok(nodeCount > 0, 'Home.scene must contain nodes');
console.log('home-scene-node-tree-integrity.test.js passed');
