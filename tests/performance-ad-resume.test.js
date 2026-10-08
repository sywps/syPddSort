const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

function createRuntime() {
    let now = 10000;
    let nextId = 0;
    let onResume = () => {};
    const timers = new Map();
    const frames = [];
    const nativeFrames = [];
    const events = new Map();
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/PerformanceMgr.ts'), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, {
        module, exports: module.exports, console,
        Date: class extends Date { static now() { return now; } },
        setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
        __rawWx: { getSystemInfoSync() {}, setPreferredFramesPerSecond(fps) { nativeFrames.push(fps); } },
        require(id) {
            if (id === 'cc') return {
                Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' }, sys: {}, director: { root: {} },
                game: { on(event, fn, host) { events.set(event, fn.bind(host)); },
                    isPaused: () => false, setFrameRate: fps => frames.push(fps) },
            };
            if (id.endsWith('AdConfig')) return { AdConfig: { notifyGameResumed() { onResume(); } } };
            if (id.endsWith('AudioMgr')) return { AudioMgr: { inst: { suspendForBackground() {}, resumeFromBackground() {} } } };
            throw new Error(id);
        },
    });
    const mgr = module.exports.PerformanceMgr.inst;
    mgr.init();
    return {
        mgr, frames, nativeFrames, emit: event => events.get(event)(),
        onResume(fn) { onResume = fn; },
        advance(ms) {
            const end = now + ms;
            while (true) {
                const entry = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
                if (!entry || entry[1].at > end) break;
                now = entry[1].at; timers.delete(entry[0]); entry[1].fn();
            }
            now = end;
        },
    };
}

for (const order of ['before-show', 'during-show', 'after-show']) {
    const r = createRuntime();
    r.emit('hide');
    assert.strictEqual(r.frames.at(-1), 15);
    if (order === 'before-show') {
        r.mgr.markUserActivity(6000);
        r.advance(1000);
        assert.strictEqual(r.frames.at(-1), 15, 'background reward must not raise background FPS');
    }
    if (order === 'during-show') r.onResume(() => r.mgr.markUserActivity(6000));
    r.emit('show');
    if (order === 'after-show') r.mgr.markUserActivity(6000);
    assert.strictEqual(r.frames.at(-1), 45, order);
    r.advance(1000);
    r.mgr.markUserActivity(); // A normal touch must not shorten the reward window.
    r.advance(4999);
    assert.strictEqual(r.frames.at(-1), 45, `${order}: retain the full reward window`);
    r.advance(1);
    assert.strictEqual(r.frames.at(-1), 30, `${order}: return to idle after the window`);
    assert.deepStrictEqual(r.nativeFrames, r.frames, 'native and Cocos FPS must agree');
}
const r = createRuntime();
r.emit('hide'); r.emit('show');
assert.strictEqual(r.frames.at(-1), 45);
r.advance(2500);
assert.strictEqual(r.frames.at(-1), 30);
r.mgr.markUserActivity(6000); r.emit('hide'); r.advance(6000);
assert.strictEqual(r.frames.at(-1), 15, 'expired foreground timers must not change background FPS');
console.log('performance-ad-resume.test.js passed');
