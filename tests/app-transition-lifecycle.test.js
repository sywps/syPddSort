const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/AppTransitionController.ts'),
    'utf8',
);

class Component {}
class BlockInputEvents {
    constructor() {
        this.enabled = true;
    }
}
class Camera {}
Camera.ClearFlag = { DEPTH_ONLY: 2 };
class Canvas {
    constructor(camera) {
        this.cameraComponent = camera;
    }
}
class Mask {}
class UITransform {
    setContentSize(width, height) {
        this.width = width;
        this.height = height;
    }
}
class Node {
    constructor(name) {
        this.name = name;
        this.active = true;
        this.children = [];
        this.components = new Map();
        this.isValid = true;
    }
    getChildByName(name) {
        return this.children.find((child) => child.name === name) || null;
    }
    getComponent(Type) {
        return this.components.get(Type) || null;
    }
    addComponent(Type) {
        const component = new Type();
        component.node = this;
        this.components.set(Type, component);
        return component;
    }
}

const events = new EventEmitter();
const director = {
    once(event, callback) { events.once(event, callback); },
    off(event, callback) { events.off(event, callback); },
};
const viewListeners = new Map();
const view = {
    getVisibleSize() { return { width: 720, height: 1280 }; },
    on(event, callback) { viewListeners.set(event, callback); },
    off(event, callback) {
        if (viewListeners.get(event) === callback) viewListeners.delete(event);
    },
};
const cc = {
    _decorator: { ccclass: () => (Type) => Type },
    BlockInputEvents,
    Camera,
    Canvas,
    Component,
    Director: { EVENT_AFTER_DRAW: 'after-draw' },
    director,
    Mask,
    Node,
    UITransform,
    view,
};

const output = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        experimentalDecorators: true,
    },
}).outputText;
const moduleUnderTest = { exports: {} };
vm.runInNewContext(output, {
    module: moduleUnderTest,
    exports: moduleUnderTest.exports,
    require(id) {
        if (id === 'cc') return cc;
        if (id === './AppSession') return {};
        throw new Error(`unmocked import: ${id}`);
    },
    console,
});
const { AppTransitionController } = moduleUnderTest.exports;

function makeController() {
    const camera = new Camera();
    const rootNode = new Node('AppTransition');
    rootNode.components.set(UITransform, new UITransform());
    rootNode.components.set(Canvas, new Canvas(camera));
    rootNode.components.set(BlockInputEvents, new BlockInputEvents());
    const cameraNode = new Node('Camera');
    const irisMaskNode = new Node('IrisMask');
    const contentNode = new Node('Content');
    const backgroundNode = new Node('Background');
    cameraNode.components.set(UITransform, new UITransform());
    irisMaskNode.components.set(UITransform, new UITransform());
    irisMaskNode.components.set(Mask, new Mask());
    contentNode.components.set(UITransform, new UITransform());
    backgroundNode.components.set(UITransform, new UITransform());
    contentNode.children.push(backgroundNode);
    irisMaskNode.children.push(contentNode);
    rootNode.children.push(cameraNode, irisMaskNode);
    const controller = new AppTransitionController();
    controller.node = rootNode;
    controller.initialize();
    return {
        controller,
        rootNode,
        blocker: rootNode.getComponent(BlockInputEvents),
        camera,
        irisMask: irisMaskNode.getComponent(UITransform),
        background: backgroundNode.getComponent(UITransform),
    };
}

async function flushPromises() {
    await new Promise((resolve) => setImmediate(resolve));
}

async function run() {
    const first = makeController();
    assert.equal(first.rootNode.active, false, 'initialized transition must stay hidden');
    assert.equal(first.blocker.enabled, false, 'idle transition must not block input');
    assert.equal(first.camera.priority, 110, 'transition camera must render above startup loading');
    assert.equal(first.camera.clearFlags, Camera.ClearFlag.DEPTH_ONLY, 'transition camera must preserve the scene color buffer');
    assert.equal(first.background.width, 960, 'background must preserve its 3:4 aspect while covering 720x1280');
    assert.equal(first.background.height, 1280, 'background cover-fit must keep the full visible height');

    let taskCalls = 0;
    const promise = first.controller.run('route:Game:level_1', 'Game', 'forward', async () => {
        taskCalls++;
    });
    const joined = first.controller.run('route:Game:level_1', 'Game', 'forward', async () => {
        taskCalls++;
    });
    assert.equal(joined, promise, 'same-key requests must share one transaction promise');
    await assert.rejects(
        first.controller.run('route:Home', 'Home', 'reverse', async () => {}),
        /transition already in flight/,
        'different routes must fail fast while a transaction is active',
    );
    assert.equal(first.rootNode.active, true);
    assert.equal(first.blocker.enabled, true, 'covering must intercept input immediately');
    assert.equal(taskCalls, 0, 'route task must not start before the old page is covered');

    first.controller.update(0.16);
    assert.ok(first.irisMask.width > 0, 'cover must grow the themed circular layer from the screen center');
    first.controller.update(0.16);
    await flushPromises();
    assert.equal(taskCalls, 1, 'joined requests must dispatch the route only once');
    assert.equal(first.controller.completeAfterDraw('Home'), false, 'a stale target must not release the cover');
    assert.equal(first.controller.completeAfterDraw('Game'), true);
    assert.equal(first.controller.completeAfterDraw('Game'), false, 'duplicate ready signals must share one draw listener');
    events.emit('after-draw');
    first.controller.update(0.10);
    const firstRetractDiameter = first.irisMask.width;
    assert.ok(firstRetractDiameter > 0, 'reveal must keep one themed circular layer over the new scene');
    first.controller.update(0.10);
    const secondRetractDiameter = first.irisMask.width;
    assert.ok(
        secondRetractDiameter < firstRetractDiameter,
        'the themed circular layer must retract toward the center',
    );
    first.controller.update(0.14);
    await promise;
    assert.equal(first.rootNode.active, false, 'successful reveal must hide the persistent canvas');
    assert.equal(first.blocker.enabled, false, 'successful reveal must release input');

    const failed = first.controller.run('route:Home', 'Home', 'reverse', async () => {
        throw new Error('home route failed');
    });
    first.controller.update(0.32);
    await flushPromises();
    first.controller.update(0.34);
    await assert.rejects(failed, /home route failed/, 'route failures must reject after the reverse reveal');
    assert.equal(first.rootNode.active, false);
    assert.equal(first.blocker.enabled, false);

    const doomed = first.controller.run('route:Game:level_2', 'Game', 'forward', async () => {});
    first.controller.completeAfterDraw('Game');
    first.controller.onDestroy();
    await assert.rejects(doomed, /controller destroyed/);
    assert.equal(events.listenerCount('after-draw'), 0, 'destroy must cancel pending draw readiness');
    assert.equal(viewListeners.size, 0, 'destroy must remove resize listeners');

    console.log('app-transition-lifecycle.test.js passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
