const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
).replace(/\r\n/g, '\n');

function extractMethod(signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `missing method signature: ${signature}`);
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    assert.fail(`unterminated method: ${signature}`);
}

const boardTap = extractMethod('private handleBoardTap(row: number, col: number): PchBoardTapOutcome');
const invalidBranch = boardTap.slice(boardTap.indexOf('if (!block)'), boardTap.indexOf('const sourceWorldPositions'));
assert.doesNotMatch(invalidBranch, /maybeShowCapacityBlockedToast/);
assert.match(
    boardTap,
    /if \(result\.moved <= 0\) \{[\s\S]*?this\.maybeShowCapacityBlockedToast\(\);[\s\S]*?return 'capacity_blocked';/,
    'only a valid block rejected for zero capacity should show the full-conveyor toast',
);

assert.match(source, /const PCH_CAPACITY_BLOCKED_TOAST_COOLDOWN_MS = 1500;/);
const toastMethod = extractMethod('private maybeShowCapacityBlockedToast(): void');
assert.match(toastMethod, /this\.runtime\.showToast\('传送带已满'\);/);

const toastBody = toastMethod
    .replace(/^private maybeShowCapacityBlockedToast\(\): void \{\n/, '')
    .replace(/\n\s*\}$/, '');
const showCapacityBlockedToast = new Function(
    'PCH_CAPACITY_BLOCKED_TOAST_COOLDOWN_MS',
    `return function() {${toastBody}}`,
)(1500);

const originalNow = Date.now;
try {
    let now = 1000;
    Date.now = () => now;
    const toasts = [];
    const controller = {
        capacityBlockedToastLastShownAt: 0,
        runtime: { showToast: (text) => toasts.push(text) },
    };

    showCapacityBlockedToast.call(controller);
    now += 1000;
    showCapacityBlockedToast.call(controller);
    now += 500;
    showCapacityBlockedToast.call(controller);

    assert.deepStrictEqual(toasts, ['传送带已满', '传送带已满']);

    now += 2000;
    assert.throws(
        () => showCapacityBlockedToast.call({ capacityBlockedToastLastShownAt: 0, runtime: {} }),
        /conveyor-full Toast is unavailable/,
    );
} finally {
    Date.now = originalNow;
}

console.log('pch-capacity-blocked-toast.test.js passed');
