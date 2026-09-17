const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const transpile = source => ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function loadTrace() {
    const module = { exports: {} };
    const warnings = [], errors = [];
    let now = 1000;
    const host = { __PDD_STARTUP_DIAGNOSTIC__: true };
    vm.runInNewContext(transpile(read('assets/Scripts/Core/StartupTrace.ts')), {
        module, exports: module.exports,
        Date: { now: () => now }, globalThis: host,
        console: { warn: (...args) => warnings.push(args), error: (...args) => errors.push(args) },
    });
    return { ...module.exports, warnings, errors, host, advance(ms) { now += ms; } };
}
const unsupported = loadTrace();
assert.equal(unsupported.reportWeChatStartupPlayable({}), 'unavailable');
assert.equal(unsupported.reportWeChatStartupPlayable({}), 'failed');
assert.equal(unsupported.warnings.length, 1, 'unsupported API is terminal and diagnosed once');
const trace = loadTrace();
trace.reportWeChatStartupPlayable({ reportScene() { throw new Error('platform failed'); } });
assert.equal(trace.errors.length, 1, 'platform failure is visible and not marked successful');
const payloads = [];
const wx = { reportScene(options) { assert.equal(this, wx); payloads.push(options); } };
assert.equal(trace.reportWeChatStartupPlayable(wx), 'retry');
trace.advance(500);
trace.reportWeChatStartupPlayable(wx);
trace.reportWeChatStartupPlayable(wx);
assert.equal(payloads.length, 1, 'report once across scene changes in this launch');
assert.equal(payloads[0].sceneId, 7);
const failed = loadTrace();
let attempts = 0;
const broken = { reportScene() { attempts++; throw Error('offline'); } };
failed.reportWeChatStartupPlayable(broken);
for (let i = 0; i < 60; i++) failed.reportWeChatStartupPlayable(broken);
assert.equal(attempts, 1, 'frames during backoff do not call platform');
failed.advance(500); failed.reportWeChatStartupPlayable(broken);
failed.advance(1000); assert.equal(failed.reportWeChatStartupPlayable(broken), 'failed');
failed.advance(5000); failed.reportWeChatStartupPlayable(broken);
assert.equal(attempts, 3, 'shared attempt budget survives later calls');
trace.flushStartupTrace(() => {});
trace.recordStartupDiagnostic('after-flush');
assert.equal(trace.host.__PDD_STARTUP_DIAGNOSTIC_EVENTS__.at(-1).event, 'after-flush');
for (let i = 0; i < 400; i++) trace.recordStartupDiagnostic('bounded');
assert.equal(trace.host.__PDD_STARTUP_DIAGNOSTIC_EVENTS__.length, 240);

function methods(file, names) {
    const source = read(file);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const cls = ast.statements.find(ts.isClassDeclaration);
    return names.map(name => {
        const member = cls.members.find(item => item.name?.getText(ast) === name);
        assert(member, file+':'+name);
        return member.getText(ast);
    }).join('\n');
}
const buttonType = {};
const pchModule = { exports: {} };
vm.runInNewContext(transpile('export class Probe {' + methods(
    'assets/Scripts/Core/PchConveyorGameplayController.ts', ['isStartupInteractionReady'],
) + '}'), { module: pchModule, exports: pchModule.exports, Button: buttonType });
const pch = new pchModule.exports.Probe();
Object.assign(pch, { openingPatternState: 'running', root: { activeInHierarchy: true }, rules: {}, runtime: {}, settingsPaused: false, inputLocked: true });
assert.equal(pch.isStartupInteractionReady(), false, 'opening animation is not playable');
pch.openingPatternState = 'done';
assert.equal(pch.isStartupInteractionReady(), false, 'waiting for tutorial assets is not playable');
let interactable = false;
pch.openingGuideTarget = { activeInHierarchy: true, getComponent(type) { assert.equal(type, buttonType); return { interactable }; } };
assert.equal(pch.isStartupInteractionReady(), false, 'disabled guide target is not playable');
interactable = true;
assert.equal(pch.isStartupInteractionReady(), true, 'visible clickable tutorial is a valid first interaction');
pch.settingsPaused = true;
assert.equal(pch.isStartupInteractionReady(), false);
pch.settingsPaused = false;

const events = [];
const Director = { EVENT_AFTER_DRAW: 'after-draw' };
const director = {
    on(event, callback, context) { events.push({ event, callback, context, once: false }); },
    once(event, callback, context) { events.push({ event, callback, context, once: true }); },
    off(event, callback, context) {
        for (let i = events.length - 1; i >= 0; i--) if (events[i].event === event && events[i].callback === callback && events[i].context === context) events.splice(i, 1);
    },
    getTotalFrames() { return 1; },
};
function draw() {
    for (const entry of [...events]) {
        if (!events.includes(entry)) continue;
        if (entry.once) director.off(entry.event, entry.callback, entry.context);
        entry.callback.call(entry.context);
    }
}
const runtimeModule = { exports: {} };
let runtimeTrace = loadTrace();
let wechat = true, reports = 0;
const platform = { reportScene({ sceneId }) { assert.equal(sceneId, 7); reports++; } };
vm.runInNewContext(transpile('export class Probe {' + methods(
    'assets/Scripts/Core/GameSceneRuntimeController.ts', ['markGameFirstFrame', 'observeStartupPlayable', 'reportStartupPlayableAfterDraw'],
) + '}'), {
    module: runtimeModule, exports: runtimeModule.exports, director, Director,
    isWeChatMiniGameRuntime: () => wechat,
    getWeChatMiniGameRuntime: () => platform,
    reportWeChatStartupPlayable: api => runtimeTrace.reportWeChatStartupPlayable(api),
    markStartupTrace() {}, debugPerfSnapshot() {},
    recordStartupDiagnostic() {}, AppRoot: { tryGet: () => app }, Button: buttonType,
});
const app = { appTransition: { isTransitioning: true }, startupLoading: { node: { activeInHierarchy: false } } };
const controller = new runtimeModule.exports.Probe();
controller.runtime = { node: { isValid: true }, _pchConveyorGameplayController: pch, _loadingOverlay: { activeInHierarchy: true } };
controller.markGameFirstFrame('Boot');
assert.equal(reports, 0, 'registration is not a rendered frame');
draw();
assert.equal(reports, 0, 'loading overlay prevents reporting');
controller.runtime._loadingOverlay.activeInHierarchy = false;
controller.runtime._modalFocusRefs = 1;
draw(); assert.equal(reports, 0);
controller.runtime._modalFocusRefs = 0;
controller.runtime._adShowing = true;
draw(); assert.equal(reports, 0);
controller.runtime._adShowing = false;
controller.runtime._placementInputLocked = true;
draw(); assert.equal(reports, 0);
controller.runtime._placementInputLocked = false;
draw(); assert.equal(reports, 0, 'persistent transition blocks startup reporting');
app.appTransition.isTransitioning = false;
app.startupLoading.node.activeInHierarchy = true;
draw(); assert.equal(reports, 0, 'persistent startup loading blocks reporting');
app.startupLoading.node.activeInHierarchy = false;
draw(); assert.equal(reports, 1);
assert.equal(events.length, 0, 'observer is detached after reporting');
const home = new runtimeModule.exports.Probe();
let homeEnabled = false;
home.runtime = { node: { isValid: true }, mainMenuNode: { getChildByPath(name) {
    assert.equal(name, 'PrimaryActionLayer/StartBtn');
    return { getComponent() { return { node: { activeInHierarchy: true }, enabledInHierarchy: true, get interactable() { return homeEnabled; } }; } };
} } };
home.observeStartupPlayable('Home');
draw(); assert.equal(events.length, 1, 'Home waits for a real enabled start button');
homeEnabled = true;
draw(); assert.equal(events.length, 0, 'Home uses shared successful report state');
assert.equal(reports, 1, 'Home does not duplicate successful Game report');
controller.markGameFirstFrame('Home');
draw(); assert.equal(reports, 1, 'return to Game must not report a second startup');
controller.markGameFirstFrame('Home');
controller.runtime.node.isValid = false;
draw(); assert.equal(events.length, 0, 'destroyed runtime does not retain observer');
wechat = false;
controller.runtime.node.isValid = true;
controller.markGameFirstFrame('Boot');
draw(); assert.equal(reports, 1, 'non-WeChat preview must not report to WeChat');
wechat = true;
runtimeTrace = loadTrace();
let coopState = 'loading';
home.runtime._coopPanel = { getStartupInteractionState: () => coopState };
home.observeStartupPlayable('Home'); draw();
assert.equal(reports, 1, 'loading invitation panel blocks the underlying Home start button');
coopState = 'ready'; draw();
assert.equal(reports, 2, 'fresh launch directly into Home reports once');
controller.markGameFirstFrame('Home'); draw();
assert.equal(reports, 2, 'Home to Game shares successful report state');
console.log('wechat-startup-playable.test.js passed');
