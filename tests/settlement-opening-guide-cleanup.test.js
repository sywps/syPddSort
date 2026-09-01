const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
);
const start = source.indexOf('    pauseForSettlement(): void {');
const end = source.indexOf('    resumeAfterSettlement(): void {', start);
assert.ok(start >= 0 && end > start, 'missing settlement pause lifecycle');

const pauseSource = source.slice(start, end);
assert.ok(pauseSource.includes('this.dismissOpeningGuide();'), 'settlement pause must dismiss the opening guide');
assert.ok(
    pauseSource.indexOf('this.dismissOpeningGuide();') < pauseSource.indexOf('this.resetCapacityWarning();'),
    'opening guide must be cleared before settlement visuals are reset',
);

console.log('settlement-opening-guide-cleanup.test.js passed');
