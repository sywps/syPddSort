const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/GameplayShareLoadingModule.ts'),
    'utf8',
);
const firstLevelRouteSource = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts'),
    'utf8',
);
const sceneEntrySource = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts'),
    'utf8',
);
const completionFxSource = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameCtrlModules/GameplayColorCompleteFxModule.ts'),
    'utf8',
);

function createRuntime() {
    const module = { exports: {} };
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;
    vm.runInNewContext(output, {
        module,
        exports: module.exports,
        require(id) {
            if (id === '../AppRoot') return { AppRoot: { tryGet: () => null } };
            if (id === '../../Platform/WeChatShareReturnService') {
                return { weChatShareReturnService: {} };
            }
            return {};
        },
    });

    const scheduled = [];
    const failures = [];
    const runtime = {
        isValid: true,
        _gameplayLoadRequestVersion: 0,
        _levelDataLoadStopped: false,
        _loadingWatchdogHandler: null,
        _loadingWatchdogContext: null,
        scheduleOnce(handler, seconds) {
            scheduled.push({ handler, seconds, cancelled: false });
        },
        unschedule(handler) {
            for (const task of scheduled) {
                if (task.handler === handler) task.cancelled = true;
            }
        },
        stopLevelDataLoadWithFatalError(...args) {
            failures.push(args);
        },
    };
    module.exports.installGameplayShareLoadingModule(runtime);
    return { runtime, scheduled, failures };
}

const { runtime, scheduled, failures } = createRuntime();
runtime.beginGameplayLoadingWatchdog(1, 'LevelData/level_1', 'local');

assert.strictEqual(scheduled.length, 1, 'watchdog must arm once when gameplay loading starts');
assert.strictEqual(scheduled[0].seconds, 5, 'local loading must retain its existing five-second idle budget');

const firstDeadline = scheduled[0];
runtime.noteGameplayLoadingProgress('first_level_json_loaded');
assert.strictEqual(firstDeadline.cancelled, true, 'real loading progress must retire the previous deadline');
assert.strictEqual(scheduled.length, 2, 'real loading progress must arm a fresh idle deadline');

firstDeadline.handler();
assert.strictEqual(failures.length, 0, 'a retired deadline must not fail the active request');

const secondDeadline = scheduled[1];
secondDeadline.handler();
assert.strictEqual(failures.length, 0, 'deadline expiry must wait one frame for already-queued completion callbacks');
assert.strictEqual(scheduled.length, 3, 'deadline expiry must schedule one confirmation frame');

const staleConfirmation = scheduled[2];
runtime.noteGameplayLoadingProgress('bean-atlas-ready');
assert.strictEqual(staleConfirmation.cancelled, true, 'same-frame progress must cancel timeout confirmation');
staleConfirmation.handler();
assert.strictEqual(failures.length, 0, 'cancelled timeout confirmation must remain harmless');

const finalDeadline = scheduled[3];
finalDeadline.handler();
const finalConfirmation = scheduled[4];
finalConfirmation.handler();

assert.strictEqual(failures.length, 1, 'a genuinely idle request must still fail fast');
assert.strictEqual(failures[0][2], 'level_data_load_timeout');
assert.strictEqual(failures[0][3], 'local_load_timeout');
assert.strictEqual(failures[0][5].lastProgressStage, 'bean-atlas-ready');
assert.strictEqual(failures[0][5].timeoutMs, 5000);

assert.ok(
    firstLevelRouteSource.includes("if (success) this.noteGameplayLoadingProgress?.(eventName);"),
    'successful level-data diagnostics must refresh the active loading watchdog',
);
for (const stage of ['bean-atlas-ready', 'critical-ui-ready', 'board-effects-ready']) {
    assert.ok(
        sceneEntrySource.includes(`this.noteGameplayLoadingProgress?.('${stage}');`),
        `active gameplay startup must report ${stage}`,
    );
}
assert.ok(
    completionFxSource.includes("this.noteGameplayLoadingProgress?.('spine-prewarm-ready');"),
    'the initGame-gating Spine prewarm must report completion before running queued callbacks',
);

console.log('gameplay-loading-watchdog-progress.test.js passed');
