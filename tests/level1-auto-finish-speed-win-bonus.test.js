const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadRules() {
    const module = { exports: {} };
    const source = read('assets/Scripts/Core/PchConveyorRules.ts');
    vm.runInNewContext(
        ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        }).outputText,
        {
            module,
            exports: module.exports,
            require(request) {
                if (request === './LevelConfig') {
                    return {
                        CONVEYOR_STACK_DEPTH: 3,
                        validateConveyorCapacity: (value) => value,
                        validatePchSingleSelectionLimit: (value) => value == null ? 12 : value,
                        validateAutoConveyorFinishSpeed: (value) => value == null ? true : value,
                    };
                }
                throw new Error(`unexpected PchConveyorRules dependency: ${request}`);
            },
        },
        { filename: 'PchConveyorRules.ts' },
    );
    return module.exports.PchConveyorRules;
}

const PchConveyorRules = loadRules();
const createReturnableBoard = () => ({
    width: 1,
    height: 1,
    locked: [[false]],
    currentColors: [[0]],
    correctColors: [[1]],
});

const defaultRules = new PchConveyorRules(createReturnableBoard(), 3);
defaultRules.carriers[0].push(1);
assert.strictEqual(defaultRules.conveyorSpeedMultiplier, 5, 'levels without the flag must retain automatic 5x finish speed');

const levelOneRules = new PchConveyorRules(createReturnableBoard(), 3, undefined, undefined, false);
levelOneRules.carriers[0].push(1);
assert.strictEqual(levelOneRules.conveyorSpeedMultiplier, 1, 'a disabled level must keep its manual speed when all beans are on the conveyor');

const levelOne = JSON.parse(read('assets/LevelData/level_1.json'));
assert.strictEqual(levelOne.autoConveyorFinishSpeed, false, 'only level 1 must explicitly disable automatic finish speed');
assert.strictEqual(levelOne.winAdBonusEnabled, false, 'only level 1 must explicitly hide the win 5x-gold reward');

const levelConfig = read('assets/Scripts/Core/LevelConfig.ts');
const gameplayController = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const humanReplay = read('assets/Scripts/Core/PvpHumanReplay.ts');
const botReplay = read('assets/Scripts/Core/PvpBotReplay.ts');
const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const gameplaySession = read('assets/Scripts/Core/GameplaySessionController.ts');
const cdnService = read('assets/Scripts/Core/LevelDataCdnService.ts');

assert.ok(
    levelConfig.includes('autoConveyorFinishSpeed?: boolean;')
        && levelConfig.includes('winAdBonusEnabled?: boolean;')
        && levelConfig.includes('function validateAutoConveyorFinishSpeed')
        && levelConfig.includes('function validateWinAdBonusEnabled'),
    'both level-specific flags must be typed and validated with default-enabled behavior',
);
assert.ok(
    gameplayController.includes('this.runtime.levelData?.autoConveyorFinishSpeed,')
        && humanReplay.includes('undefined, level.autoConveyorFinishSpeed')
        && botReplay.includes('undefined, level.autoConveyorFinishSpeed'),
    'main gameplay and replay rules must receive the same finish-speed flag',
);
assert.ok(
    settlement.includes('this.levelData?.winAdBonusEnabled !== false')
        && settlement.includes('this.levelData?.winAdBonusEnabled === false'),
    'the level-specific win-bonus flag must hide the button and reject direct bonus claims',
);
assert.ok(
    gameplaySession.includes('validateAutoConveyorFinishSpeed(data.autoConveyorFinishSpeed')
        && gameplaySession.includes('validateWinAdBonusEnabled(data.winAdBonusEnabled')
        && cdnService.includes('validateAutoConveyorFinishSpeed(entry.data.autoConveyorFinishSpeed')
        && cdnService.includes('validateWinAdBonusEnabled(entry.data.winAdBonusEnabled'),
    'local and CDN level data must reject malformed rule flags before gameplay',
);

console.log('level1-auto-finish-speed-win-bonus.test.js passed');
