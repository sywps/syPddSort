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
    vm.runInNewContext(transpile(read('assets/Scripts/Core/StartupTrace.ts')), {
        module, exports: module.exports,
        console: { warn: (...args) => warnings.push(args), error: (...args) => errors.push(args) },
    });
    return { ...module.exports, warnings, errors };
}
const trace = loadTrace();
trace.reportWeChatStartupPlayable(null);
trace.reportWeChatStartupPlayable({});
assert.equal(trace.warnings.length, 1, 'unsupported API is explicitly diagnosed');
trace.reportWeChatStartupPlayable({ reportScene() { throw new Error('platform failed'); } });
assert.equal(trace.errors.length, 1, 'platform failure is visible and not marked successful');
const payloads = [];
const wx = { reportScene(options) { assert.equal(this, wx); payloads.push(options); } };
trace.reportWeChatStartupPlayable(wx);
trace.reportWeChatStartupPlayable(wx);
assert.equal(payloads.length, 1, 'report once across scene changes in this launch');
assert.equal(payloads[0].sceneId, 7);

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
const runtimeTrace = loadTrace();
let wechat = true, reports = 0;
const platform = { reportScene({ sceneId }) { assert.equal(sceneId, 7); reports++; } };
vm.runInNewContext(transpile('export class Probe {' + methods(
    'assets/Scripts/Core/GameSceneRuntimeController.ts', ['markGameFirstFrame', 'reportStartupPlayableAfterDraw'],
) + '}'), {
    module: runtimeModule, exports: runtimeModule.exports, director, Director,
    isWeChatMiniGameRuntime: () => wechat,
    getWeChatMiniGameRuntime: () => platform,
    reportWeChatStartupPlayable: runtimeTrace.reportWeChatStartupPlayable,
    markStartupTrace() {}, debugPerfSnapshot() {},
});
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
draw(); assert.equal(reports, 1);
assert.equal(events.length, 0, 'observer is detached after reporting');
controller.markGameFirstFrame('Home');
draw(); assert.equal(reports, 1, 'return to Game must not report a second startup');
controller.markGameFirstFrame('Home');
controller.runtime.node.isValid = false;
draw(); assert.equal(events.length, 0, 'destroyed runtime does not retain observer');
wechat = false;
controller.runtime.node.isValid = true;
controller.markGameFirstFrame('Boot');
draw(); assert.equal(reports, 1, 'non-WeChat preview must not report to WeChat');
console.log('wechat-startup-playable.test.js passed');
