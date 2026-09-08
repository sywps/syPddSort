const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const startupTrace = read('assets/Scripts/Core/StartupTrace.ts');
const debugPerfTrace = read('assets/Scripts/Core/DebugPerfTrace.ts');
const bootScene = read('assets/Scripts/Core/BootSceneCtrl.ts');
const gameRuntime = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const gameplaySession = read('assets/Scripts/Core/GameplaySessionController.ts');
const postbuild = read('scripts/postbuild-wechat-minigame.js');

assert.ok(startupTrace.includes("const RUNTIME_ENTRY_AT_KEY = '__PDD_RUNTIME_ENTRY_AT__';"));
assert.ok(startupTrace.includes('startedAt: readRuntimeEntryAt(host) || Date.now()'));
assert.ok(postbuild.includes('eventName:"startup_runtime_entry"'));
assert.ok(postbuild.includes('eventName:"startup_first_screen_drawn"'));
assert.ok(postbuild.includes("'$1draw();\\n$1' + helperName + '();\\n$2tick();'"));
assert.ok(postbuild.includes('fullProcessMemorySource:"wechat_devtools_or_cloud_test"'));
assert.ok(debugPerfTrace.includes("memoryScope: memory ? 'js_heap_only' : 'not_available'"));
assert.ok(debugPerfTrace.includes("fullProcessMemorySource: 'wechat_devtools_or_cloud_test'"));
assert.ok(bootScene.includes("debugPerfTrace('runtime.boot.start'"));
assert.ok(gameRuntime.includes("markStartupTrace('startup_game_first_frame'"));
assert.ok(gameRuntime.includes('Director as any)?.EVENT_AFTER_DRAW'));
assert.ok(gameRuntime.includes("debugPerfSnapshot('runtime.game.firstFrame'"));
assert.ok(gameRuntime.includes("debugPerfSnapshot('runtime.destroy.after'"));
assert.ok(gameplaySession.includes("debugPerfSnapshot('runtime.game.firstPlayable'"));
assert.ok(gameplaySession.indexOf("debugPerfSnapshot('runtime.game.firstPlayable'") < gameplaySession.indexOf("markStartupTrace('startup_first_playable_ready'"));

let now = 1250;
const moduleRef = { exports: {} };
const sandbox = {
    Date: { now: () => now },
    module: moduleRef,
    exports: moduleRef.exports,
    __PDD_RUNTIME_ENTRY_AT__: 1000,
    __PDD_STARTUP_TRACE__: {
        startedAt: 1000,
        events: [{
            eventName: 'startup_runtime_entry',
            timestamp: 1000,
            elapsedMs: 0,
            extra: { source: 'game.js' },
        }],
        flushed: false,
    },
};
vm.runInNewContext(ts.transpileModule(startupTrace, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
    },
}).outputText, sandbox, { filename: 'StartupTrace.ts' });
const tracked = [];
moduleRef.exports.markStartupTrace('startup_boot_start');
now = 1400;
moduleRef.exports.flushStartupTrace((event) => tracked.push(event));
assert.deepStrictEqual(tracked.map((event) => event.eventName), [
    'startup_runtime_entry',
    'startup_boot_start',
]);
assert.deepStrictEqual(tracked.map((event) => event.duration), [0, 250]);
assert.ok(tracked.every((event) => event.extra.startupStartedAt === 1000));

console.log('startup-observability-contract.test.js passed');
