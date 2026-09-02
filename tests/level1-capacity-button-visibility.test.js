const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
).replace(/\r\n/g, '\n');

assert.ok(
    source.includes("const hideFirstLevelControls = this.runtime._activeGameplayEntryMode === 'main'")
        && source.includes('&& Math.floor(Number(this.runtime.levelData?.levelId) || 0) === 1;')
        && source.includes('this.adButton.active = !hideFirstLevelControls;'),
    'only mainline level 1 must hide the conveyor capacity button at startup',
);
assert.ok(
    source.includes("logicalLevelId === 3 && this.adButton?.isValid")
        && source.includes('private expandCapacity(): boolean'),
    'level 3 capacity guidance and non-button capacity expansion paths must remain available',
);

console.log('level1-capacity-button-visibility.test.js passed');
