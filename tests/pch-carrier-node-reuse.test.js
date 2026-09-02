const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
);

function methodBody(marker) {
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `missing method marker: ${marker}`);
    const open = source.indexOf('{', start);
    assert.ok(open >= 0, `missing method body: ${marker}`);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        const character = source[index];
        if (character === '{') depth += 1;
        if (character !== '}') continue;
        depth -= 1;
        if (depth === 0) return source.slice(open + 1, index);
    }
    throw new Error(`unterminated method body: ${marker}`);
}

class FakeSprite {}

class FakeNode {
    constructor(name) {
        this.name = name;
        this.children = [];
        this.parent = null;
        this.active = true;
        this.isValid = true;
        this.destroyed = false;
        this.sprite = null;
        this.position = [0, 0, 0];
        this.scale = [1, 1, 1];
    }

    addChild(child) {
        if (child.parent) {
            const previousIndex = child.parent.children.indexOf(child);
            if (previousIndex >= 0) child.parent.children.splice(previousIndex, 1);
        }
        child.parent = this;
        this.children.push(child);
    }

    getChildByName(name) {
        return this.children.find((child) => child.isValid && child.name === name) || null;
    }

    getComponent(Type) {
        return Type === FakeSprite ? this.sprite : null;
    }

    addComponent(Type) {
        assert.equal(Type, FakeSprite);
        this.sprite = { spriteFrame: {} };
        return this.sprite;
    }

    setPosition(x, y, z = 0) {
        this.position = [x, y, z];
    }

    setScale(x, y, z = 1) {
        this.scale = [x, y, z];
    }

    setSiblingIndex(index) {
        if (!this.parent) return;
        const currentIndex = this.parent.children.indexOf(this);
        if (currentIndex >= 0) this.parent.children.splice(currentIndex, 1);
        this.parent.children.splice(Math.max(0, Math.min(index, this.parent.children.length)), 0, this);
    }

    destroy() {
        this.destroyed = true;
        this.isValid = false;
        if (!this.parent) return;
        const index = this.parent.children.indexOf(this);
        if (index >= 0) this.parent.children.splice(index, 1);
        this.parent = null;
    }
}

const Tween = { stopAllByTarget() {} };
const resetConveyorCarrier = new Function(
    'Tween',
    'Sprite',
    'return function (carrier) {' + methodBody('private resetConveyorCarrier(') + '};',
)(Tween, FakeSprite);
const renderConveyorCarrierVisual = new Function(
    'Sprite',
    'PCH_STACK_BEAN_SIZE',
    'PCH_STACK_LAYER_OFFSET',
    'return function (carrier, stack, carrierIndex) {'
        + methodBody('private renderConveyorCarrierVisual(')
        + '};',
)(FakeSprite, 33, 8);

const controller = {
    carrierDirectionNodes: [],
    stopNodeTreeTweens() {},
    makeNode(name, parent, _width, _height, x, y) {
        const node = new FakeNode(name);
        parent.addChild(node);
        node.setPosition(x, y, 0);
        return node;
    },
    configureStackBean(bean, name, colorId, layer, stackLength) {
        bean.name = name;
        bean.colorId = colorId;
        bean.active = true;
        bean.alpha = layer === stackLength - 1 ? 255 : 184;
        bean.setPosition(0, layer * 8, 0);
        bean.setScale(1, 1, 1);
    },
};

const carrier = new FakeNode('PchCarrier-0');
const direction = new FakeNode('Direction');
direction.sprite = { spriteFrame: {} };
carrier.addChild(direction);
const staleChild = new FakeNode('UnexpectedLegacyChild');
carrier.addChild(staleChild);

resetConveyorCarrier.call(controller, carrier);
assert.equal(staleChild.destroyed, true, 'unknown non-Direction children must retain the original cleanup behavior');

renderConveyorCarrierVisual.call(controller, carrier, [1], 0);
const layer0 = carrier.getChildByName('PchStackBean-0-0');
assert.ok(layer0?.isValid);
assert.equal(direction.active, false);

resetConveyorCarrier.call(controller, carrier);
renderConveyorCarrierVisual.call(controller, carrier, [1, 2, 3], 0);
const layer1 = carrier.getChildByName('PchStackBean-0-1');
const layer2 = carrier.getChildByName('PchStackBean-0-2');
assert.equal(carrier.getChildByName('PchStackBean-0-0'), layer0, 'existing bottom layer must be reused when the stack grows');
assert.ok(layer1?.isValid && layer2?.isValid);

resetConveyorCarrier.call(controller, carrier);
renderConveyorCarrierVisual.call(controller, carrier, [4, 5], 0);
assert.equal(carrier.getChildByName('PchStackBean-0-0'), layer0);
assert.equal(carrier.getChildByName('PchStackBean-0-1'), layer1);
assert.equal(layer2.active, false, 'unused high-water layers must be hidden instead of destroyed');
assert.equal(layer2.destroyed, false);

resetConveyorCarrier.call(controller, carrier);
renderConveyorCarrierVisual.call(controller, carrier, [], 0);
assert.equal(direction.active, true, 'Direction must return when a carrier becomes empty');
assert.equal(layer0.active, false);
assert.equal(layer1.active, false);
assert.equal(layer2.active, false);

resetConveyorCarrier.call(controller, carrier);
renderConveyorCarrierVisual.call(controller, carrier, [6, 7, 8], 0);
assert.equal(carrier.getChildByName('PchStackBean-0-0'), layer0);
assert.equal(carrier.getChildByName('PchStackBean-0-1'), layer1);
assert.equal(carrier.getChildByName('PchStackBean-0-2'), layer2);
assert.equal(
    carrier.children.filter((child) => child.name.startsWith('PchStackBean-')).length,
    3,
    'repeated updates must not grow the carrier node count beyond the high-water mark',
);

resetConveyorCarrier.call(controller, carrier);
renderConveyorCarrierVisual.call(controller, carrier, [6, 7, 8, 9, 10, 11], 0);
const layer5 = carrier.getChildByName('PchStackBean-0-5');
assert.ok(layer5?.isValid, 'an expanded carrier must render every layer above the old depth of three');
assert.deepEqual(layer5.position, [0, 40, 0], 'expanded beans must continue stacking upward');
assert.equal(
    carrier.children.filter((child) => child.name.startsWith('PchStackBean-')).length,
    6,
    'the carrier must create exactly the high-water nodes needed for six stored beans',
);

resetConveyorCarrier.call(controller, carrier);
renderConveyorCarrierVisual.call(controller, carrier, [6, 7, 8], 0);
assert.equal(layer5.active, false, 'unused expanded layers must be hidden when the stack shrinks');
assert.equal(layer5.destroyed, false, 'unused expanded layers must remain reusable');

console.log('pch-carrier-node-reuse.test.js passed');
