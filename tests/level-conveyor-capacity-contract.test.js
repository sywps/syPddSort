'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    LEVEL_DATA_CLIENT_BUILD,
    LEVEL_DATA_CONTRACT,
    LEVEL_DATA_SCHEMA_VERSION,
    validateConveyorCapacity,
} = require('../scripts/conveyor-capacity-contract');

const root = path.resolve(__dirname, '..');

assert.equal(LEVEL_DATA_CONTRACT, 'v3', 'new conveyor data must use contract v3');
assert.equal(LEVEL_DATA_SCHEMA_VERSION, 3, 'new conveyor data must use schema 3');
assert.equal(LEVEL_DATA_CLIENT_BUILD, 3, 'new conveyor data must require client build 3');
assert.throws(
    () => validateConveyorCapacity({}, 'missing'),
    /positive integer/,
    'missing conveyorCapacity must fail fast',
);
assert.throws(
    () => validateConveyorCapacity({ conveyorCapacity: 25 }, 'unaligned'),
    /multiple of 3/,
    'capacity must align to the three-bean carrier depth',
);
assert.equal(validateConveyorCapacity({ conveyorCapacity: 60 }, 'valid'), 60);

function validateDirectory(relDir, expectedCount) {
    const absDir = path.join(root, relDir);
    const files = fs.readdirSync(absDir).filter((name) => /^(?:level_|zt_level_)\d+\.json$/.test(name));
    assert.equal(files.length, expectedCount, `${relDir} playable level count`);
    for (const name of files) {
        const data = JSON.parse(fs.readFileSync(path.join(absDir, name), 'utf8'));
        assert.equal(validateConveyorCapacity(data, `${relDir}/${name}`), 60, `${name} initial capacity`);
        assert.equal(Object.hasOwn(data, 'slotPolicy'), false, `${name} must not retain slotPolicy`);
        assert.equal(Object.hasOwn(data, 'initialSlotUnlockedRows'), false, `${name} must not retain row data`);
    }
}

validateDirectory('assets/LevelData', 348);
validateDirectory('assets/BootstrapBundle/LevelData', 1);
validateDirectory('experiments/ly_0224/treatment', 8);
const treatmentLevel2 = JSON.parse(fs.readFileSync(path.join(root, 'experiments/ly_0224/treatment/level_2.json'), 'utf8'));
assert.equal(treatmentLevel2.tutorialGuide, undefined, 'retired slot-intro treatment metadata must be removed');

const levelConfig = fs.readFileSync(path.join(root, 'assets/Scripts/Core/LevelConfig.ts'), 'utf8');
assert.match(levelConfig, /conveyorCapacity:\s*number;/, 'LevelData must require conveyorCapacity');
assert.doesNotMatch(levelConfig, /slotPolicy\??:/, 'LevelData must not expose the legacy policy');

const themePanelFlow = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/ThemePanelFlowModule.ts'), 'utf8');
const builtinLevelStart = themePanelFlow.indexOf('getBuiltinLevel(): LevelData');
const builtinLevelEnd = themePanelFlow.indexOf('getDefaultThemeGroups()', builtinLevelStart);
assert.ok(builtinLevelStart >= 0 && builtinLevelEnd > builtinLevelStart, 'built-in theme level source must be present');
assert.match(
    themePanelFlow.slice(builtinLevelStart, builtinLevelEnd),
    /conveyorCapacity:\s*60,/,
    'built-in theme fallback must use the new conveyor capacity',
);

const session = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameplaySessionController.ts'), 'utf8');
assert.match(session, /validateConveyorCapacity\(data\.conveyorCapacity/, 'local gameplay must validate capacity');
assert.doesNotMatch(session, /resolveSlotRowPolicy|new SlotModel|runtime\.renderSlots\(\)/, 'active session must not initialize old row gameplay');
assert.match(session, /const pchController = ensurePchConveyorGameplayController\(runtime\);[\s\S]*?pchController\.start\(\);/, 'active session must always start PCH gameplay');

const slotSkillModule = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/GameplaySlotSkillModule.ts'), 'utf8');
assert.match(
    slotSkillModule,
    /slotHasBeans\(\): boolean \{\s*return ensurePchConveyorGameplayController\(this\)\.hasStoredBeans\(\);\s*\}/,
    'stored-bean skill checks must query the PCH conveyor before and after gameplay start',
);
assert.doesNotMatch(
    slotSkillModule,
    /ensureGameplaySlotUiController\(this\)\.slotHasBeans\(\)/,
    'stored-bean skill checks must not route through the retired row-slot UI',
);

const slotUi = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameplaySlotUiController.ts'), 'utf8');
assert.doesNotMatch(slotUi, /slotHasBeans\(\): boolean/, 'retired row-slot UI must not own the active stored-bean query');
assert.doesNotMatch(slotUi, /slotModel\.getAll\(\)\.some/, 'retired row-slot storage must not be read by active skill checks');

const rules = fs.readFileSync(path.join(root, 'assets/Scripts/Core/PchConveyorRules.ts'), 'utf8');
assert.match(rules, /capacity \/ this\.stackDepth/, 'carrier count must derive from per-level capacity');
assert.doesNotMatch(rules, /initialCarrierCount\s*=\s*20/, 'rules must not hard-code 60 as twenty carriers');

const cdnService = fs.readFileSync(path.join(root, 'assets/Scripts/Core/LevelDataCdnService.ts'), 'utf8');
assert.match(cdnService, /const LEVEL_DATA_SCHEMA_VERSION = 3;/, 'runtime CDN must require schema 3');
assert.match(cdnService, /validateConveyorCapacity\(entry\.data\.conveyorCapacity, key\)/, 'CDN packs must validate capacity');
assert.doesNotMatch(cdnService, /LEVEL_DATA_COMPAT_SCHEMA_VERSION|validateSlotPolicy/, 'runtime must not accept the old data contract');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/LevelData/level-manifest.json'), 'utf8'));
assert.equal(manifest.levelCount, 300);
assert.equal(manifest.entries.length, 300);
assert.equal(manifest.entries.every((entry) => entry.conveyorCapacity === 60), true, 'manifest capacities must all be 60');

console.log('level-conveyor-capacity-contract.test.js passed');
