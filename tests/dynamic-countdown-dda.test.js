const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readJson(relPath) {
    return JSON.parse(read(relPath));
}

const expectedTimes = new Map();
for (const level of [11, 12, 13, 14, 16, 17, 18, 20, 21]) expectedTimes.set(level, 270);
for (const level of [15, 19, 22, 24, 25, 26, 28]) expectedTimes.set(level, 300);
for (const level of [23, 27, 29, 30, 32, 33, 34]) expectedTimes.set(level, 330);
for (const level of [31, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 48, 49, 50, 52, 53]) expectedTimes.set(level, 360);
for (const level of [47, 51, 54, 55, 56, 57, 58, 60, 61, 62, 64, 65]) expectedTimes.set(level, 390);
for (const level of [59, 63, 66, 67, 68, 69, 70, 72, 73]) expectedTimes.set(level, 420);
for (const level of [71, 74, 76, 77, 78, 80, 81]) expectedTimes.set(level, 450);
for (const level of [75, 79, 82, 84, 85, 86, 88]) expectedTimes.set(level, 480);
for (const level of [83, 89, 90, 92]) expectedTimes.set(level, 510);
for (const level of [87, 91, 93, 94, 96, 97]) expectedTimes.set(level, 540);
for (const level of [95, 98]) expectedTimes.set(level, 570);
for (const level of [99, 100]) expectedTimes.set(level, 600);

assert.strictEqual(expectedTimes.size, 90, 'level 11-100 time table must cover exactly 90 levels');
for (let level = 4; level <= 10; level++) {
    const data = readJson(`assets/LevelData/level_${level}.json`);
    assert.strictEqual(data.timeLimit, 600, `level ${level} timeLimit must stay at 10 minutes`);
}
for (let level = 11; level <= 100; level++) {
    const data = readJson(`assets/LevelData/level_${level}.json`);
    assert.strictEqual(data.timeLimit, expectedTimes.get(level), `level ${level} timeLimit must match confirmed plan`);
}

const manifest = readJson('assets/LevelData/level-manifest.json');
const manifestByLevel = new Map(manifest.entries.map((entry) => [entry.levelId, entry]));
for (let level = 4; level <= 10; level++) {
    assert.strictEqual(manifestByLevel.get(level)?.timeLimit, 600, `level ${level} manifest timeLimit must stay at 10 minutes`);
}
for (let level = 11; level <= 100; level++) {
    assert.strictEqual(manifestByLevel.get(level)?.timeLimit, expectedTimes.get(level), `level ${level} manifest timeLimit must match confirmed plan`);
}

const dynamicModule = read('assets/Scripts/Core/GameCtrlModules/DynamicCountdownDdaModule.ts');
assert.ok(dynamicModule.includes('DYNAMIC_COUNTDOWN_ENABLE_LEVEL = 11'), 'dynamic DDA must start at level 11');
assert.ok(dynamicModule.includes('DYNAMIC_COUNTDOWN_CLEAN_WIN_TRIGGER = 3'), 'dynamic DDA must require 3 clean wins');
assert.ok(dynamicModule.includes('DYNAMIC_COUNTDOWN_CLEAN_REMAIN_RATIO = 0.15'), 'clean win must require >15% remaining time');
assert.ok(dynamicModule.includes('DYNAMIC_COUNTDOWN_COMPRESS_FACTOR = 0.8'), 'compressed level must use 80% time');
assert.ok(dynamicModule.includes('DYNAMIC_COUNTDOWN_FAIL_FACTOR_2 = 1.15'), 'second same-level final fail must use 115% time');
assert.ok(dynamicModule.includes('DYNAMIC_COUNTDOWN_FAIL_FACTOR_3_PLUS = 1.3'), 'third same-level final fail must use 130% time');
assert.ok(dynamicModule.includes('recordDynamicCountdownFinalFail'), 'dynamic DDA must expose final fail recording');
assert.ok(dynamicModule.includes('undoDynamicCountdownRecordedFail'), 'dynamic DDA must support undo when a lose-panel revive continues play');

const installer = read('assets/Scripts/Core/installGameCtrlModules.ts');
assert.ok(installer.includes("import { installDynamicCountdownDdaModule }"), 'dynamic DDA module must be imported by installer');
assert.ok(installer.includes('installDynamicCountdownDdaModule(runtime);'), 'dynamic DDA module must be installed on runtime');

const session = read('assets/Scripts/Core/GameplaySessionController.ts');
assert.ok(session.includes('runtime.resolveDynamicCountdownTimeLimit(resolvedTimeLimit, resolvedLevelId, gameplayEntryMode)'), 'initGame must apply dynamic DDA after onboarding time resolution');
assert.ok(session.includes('runtime._currentLevelUnlimitedTime = dynamicTimeLimit <= 0'), 'unlimited time flag must use dynamic result');
assert.ok(session.includes('runtime.timeRemain = dynamicTimeLimit'), 'timeRemain must use dynamic result');

const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
assert.ok(settlement.includes('this.recordDynamicCountdownWin();'), 'gameWin must update dynamic DDA win state');
assert.ok(settlement.includes('this.recordDynamicCountdownFinalFail();'), 'showLosePanel must record final fail');
assert.ok(settlement.includes('this.undoDynamicCountdownRecordedFail();'), 'revive continuation must undo a recorded final fail');
assert.ok(settlement.includes('this.markDynamicCountdownAssisted();'), 'revive continuation must mark assisted run');

const skillUi = read('assets/Scripts/Core/GameplaySkillUiController.ts');
assert.ok(skillUi.includes('runtime.markDynamicCountdownAssisted();'), 'successful skill use must mark assisted run');

const slotUi = read('assets/Scripts/Core/GameplaySlotUiController.ts');
assert.ok(slotUi.includes('runtime.markDynamicCountdownAssisted();'), 'successful slot-row unlock must mark assisted run');

console.log('dynamic-countdown-dda.test.js passed');
