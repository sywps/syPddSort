const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');

const source = fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8');
const parsed = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
const declaration = parsed.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'PchConveyorGameplayController');
const method = declaration.members.find(node => node.name?.getText(parsed) === 'animateBeanReturn');
const compiled = ts.transpileModule(`class Harness { ${method.getText(parsed)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
let steps;
let tweenTarget;
const tween = node => {
    tweenTarget = node;
    steps = [];
    const chain = {
        delay: seconds => { steps.push({ delay: seconds }); return chain; },
        call: callback => { steps.push({ callback }); return chain; },
        to: (seconds, props, options) => { steps.push({ seconds, props, options }); return chain; },
        start: () => chain,
    };
    return chain;
};
const Harness = new Function('tween', 'UITransform', 'AudioMgr', 'PCH_RETURN_STAGGER_SECONDS',
    'PCH_RETURN_TRANSFER_SECONDS', 'PCH_RETURN_COMPLETE_DELAY_SECONDS', `${compiled}; return Harness;`)(
    tween, {}, { inst: { play() {}, vibratePlace() {} } }, 0.02, 0.2, 0.1,
);
const h = new Harness();
const rootOffset = { x: 30, y: 40 };
let target = { x: 130, y: 240, z: 0 };
let targetSize = 20;
let renders = 0;
let finishes = 0;
let scheduled;
const bean = {
    isValid: true, active: true,
    position: { x: 0, y: 0, z: 0, clone() { return { x: this.x, y: this.y, z: this.z }; } },
    setPosition(x, y, z) { Object.assign(this.position, { x, y, z }); },
    setScale(x, y, z) { this.scale = { x, y, z }; },
};
Object.assign(h, {
    pchColorCompleteSequenceGeneration: 1, activeReturnAnimations: 0,
    presentationCompletions: new Map(), activeReturnBeans: new Set(), pendingReturnCompletions: new Map(),
    root: { getComponent: () => ({ convertToNodeSpaceAR: p => ({ x: p.x - rootOffset.x, y: p.y - rootOffset.y, z: p.z }) }) },
    runtime: {
        unschedule() {}, renderBoardCell() { renders++; },
        getBoardFlyBeanSizeInLayer: () => targetSize,
        scheduleOnce(callback) { scheduled = callback; },
    },
    getBoardCellWorldPosition: () => target,
    createFlyBean: () => bean, attachSphereFlyEffect() {},
    destroyFlyBean() { bean.isValid = false; },
    finishReturnAnimation() { finishes++; },
});
h.animateBeanReturn(1, {}, 10, { row: 2, col: 3 }, 3, {});
assert.strictEqual(tweenTarget, bean, 'pause/resume/stop must still target the bean');
assert.strictEqual(steps[0].delay, 0.06);
const flight = steps.find(step => step.options);
assert.strictEqual(flight.seconds, 0.2);
const update = ratio => flight.options.onUpdate(bean, ratio);
update(0.5);
assert.deepStrictEqual([bean.position.x, bean.position.y, bean.scale.x], [75, 150, 1.75], 'stationary target preserves quadOut');
target = { x: 230, y: 340, z: 0 };
targetSize = 30;
update(0.5);
assert.deepStrictEqual([bean.position.x, bean.position.y, bean.scale.x], [150, 225, 2.5], 'pan and zoom must update during flight');
rootOffset.x = 50;
update(1);
assert.deepStrictEqual([bean.position.x, bean.position.y, bean.scale.x], [180, 300, 3], 'landing must use current target in fly-parent coordinates');
steps.at(-1).callback();
assert.strictEqual(bean.active, false);
assert.strictEqual(renders, 1);
scheduled();
scheduled();
assert.strictEqual(finishes, 1, 'completion is idempotent');
assert.strictEqual(h.activeReturnBeans.size, 0);
update(0.2);
assert.strictEqual(bean.position.x, 180, 'completed animation cannot mutate a recycled bean');
console.log('pch-return-follow-target.test.js passed');
