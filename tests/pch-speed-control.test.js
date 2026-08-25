const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
);

assert.ok(
    !source.includes('this.manualSpeedMultiplier = 1;'),
    'starting the next level must not reset the selected speed',
);
assert.ok(
    source.includes("parent.getChildByName('Settings')")
        && source.includes('const PCH_SPEED_BUTTON_FALLBACK_SIZE = 85')
        && source.includes('settingsButton?.getComponent(UITransform)?.contentSize.width')
        && source.includes('const PCH_TOP_BUTTON_GAP = 24')
        && source.includes('settingsButton.position.x + buttonSize + PCH_TOP_BUTTON_GAP'),
    'speed button must use the same runtime size as the settings button with a visible gap',
);
assert.match(
    source,
    /active \? '2X' : '1X',[\s\S]*?Color\.WHITE/,
    'the speed badge must show 1X/2X in white',
);
assert.ok(
    source.includes('graphics.circle(0, -3 * scale, buttonSize / 2);'),
    'the visible speed-button outer circle must use the full configured diameter',
);
assert.ok(
    source.includes("badge.node.name = 'PchSpeedBadge';")
        && source.includes('(badge as Label & { isBold?: boolean }).isBold = true;'),
    'the 1X/2X speed badge must use bold text',
);
assert.ok(
    !source.includes('本关两倍速可用')
        && !source.includes('本关可使用两倍速道具')
        && !source.includes('PchSpeedLevelHint')
        && !source.includes('PchSpeedButtonHint'),
    'the 2X speed control must not render availability text',
);

console.log('pch-speed-control.test.js passed');
