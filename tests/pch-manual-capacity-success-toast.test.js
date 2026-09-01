const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
).replace(/\r\n/g, '\n');

function extractMethod(sourceText, signature) {
    const start = sourceText.indexOf(signature);
    assert.ok(start >= 0, `missing method signature: ${signature}`);
    const open = sourceText.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < sourceText.length; index += 1) {
        if (sourceText[index] === '{') depth += 1;
        if (sourceText[index] === '}') depth -= 1;
        if (depth === 0) return sourceText.slice(start, index + 1);
    }
    assert.fail(`unterminated method: ${signature}`);
}

const onCapacityAdTap = extractMethod(source, 'private onCapacityAdTap(event: any): void');
assert.match(
    onCapacityAdTap,
    /runRewardedGrant\('pch_conveyor_expand',[\s\S]*?grantFailToast: '传送带扩容失败，请重试',[\s\S]*?successToast: '传送带已扩容 \+12'/,
    'manual conveyor expansion must show the same +12 success toast after a verified rewarded grant',
);

console.log('pch-manual-capacity-success-toast.test.js passed');
