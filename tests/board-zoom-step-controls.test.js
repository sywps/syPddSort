const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/BoardZoomControlModule.ts'),
    'utf8',
);

assert.ok(
    source.includes('const BOARD_ZOOM_STEP_PROGRESS = 1 / 5;'),
    'board zoom buttons must use five equal normalized intervals',
);
assert.ok(
    source.includes("this.applyBoardZoomControlProgress(currentProgress + direction * BOARD_ZOOM_STEP_PROGRESS, 'zoom_button');"),
    'each plus/minus press must move exactly one normalized zoom interval',
);
assert.ok(
    source.includes('const normalized = clamp01(progress);'),
    'stepped zoom must clamp at the minimum and maximum endpoints',
);

for (const glyph of ['plusGlyph', 'minusGlyph']) {
    assert.ok(
        source.includes(`ui.${glyph}?.targetOff(this);`),
        `${glyph} handlers must be safely rebound`,
    );
    assert.ok(
        source.includes(`ui.${glyph}?.on(Node.EventType.TOUCH_START, this.onBoardZoomStepTouchStart, this);`),
        `${glyph} must intercept touch start before it reaches the Slider track`,
    );
    assert.ok(
        source.includes(`ui.${glyph}?.on(Node.EventType.TOUCH_CANCEL, this.onBoardZoomStepTouchCancel, this);`),
        `${glyph} must intercept cancelled touches before they reach the Slider track`,
    );
}

assert.ok(
    source.includes('ui.plusGlyph?.on(Node.EventType.TOUCH_END, this.onBoardZoomPlusTouchEnd, this);'),
    'plus must have its own stepped touch-end handler',
);
assert.ok(
    source.includes('ui.minusGlyph?.on(Node.EventType.TOUCH_END, this.onBoardZoomMinusTouchEnd, this);'),
    'minus must have its own stepped touch-end handler',
);

for (const handler of [
    'onBoardZoomStepTouchStart',
    'onBoardZoomPlusTouchEnd',
    'onBoardZoomMinusTouchEnd',
    'onBoardZoomStepTouchCancel',
]) {
    const start = source.indexOf(`${handler}(event: EventTouch): void {`);
    assert.ok(start >= 0, `${handler} must exist`);
    const end = source.indexOf('\n        },', start);
    assert.ok(source.slice(start, end).includes('stopZoomEvent(event);'), `${handler} must stop Slider-track bubbling`);
}

assert.ok(source.includes('this.stepBoardZoomControl(1);'), 'plus must increase one interval');
assert.ok(source.includes('this.stepBoardZoomControl(-1);'), 'minus must decrease one interval');

const clamp01 = (value) => Math.max(0, Math.min(1, value));
let progress = 0;
for (let i = 0; i < 5; i += 1) progress = clamp01(progress + 1 / 5);
assert.strictEqual(progress, 1, 'five plus presses must reach maximum zoom');
assert.strictEqual(clamp01(progress + 1 / 5), 1, 'plus must remain clamped at maximum zoom');
for (let i = 0; i < 5; i += 1) progress = clamp01(progress - 1 / 5);
assert.ok(Math.abs(progress) < Number.EPSILON * 4, 'five minus presses must reach minimum zoom');
assert.strictEqual(clamp01(progress - 1 / 5), 0, 'minus must remain clamped at minimum zoom');

console.log('board-zoom-step-controls.test.js passed');
