'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const path = require('path');
// Execute the emitted class and its actual Cocos Babel helper, not a fresh TS transpilation.
function compiledClass(root, globals, moduleName) {
    const source = fs.readFileSync(path.join(root, 'subpackages/main/game.js'), 'utf8');
    const marker = source.indexOf('"' + moduleName + '",');
    assert(marker >= 0, 'compiled diagnostic module must exist');
    const start = source.indexOf(';', marker) + 1;
    const tail = source.slice(start).match(/\w+\._RF\.pop\(\)/);
    assert(tail, 'compiled module boundary must exist');
    const body = source.slice(start, start + tail.index).replace(/[,;]\s*$/, ';');
    const ast = ts.createSourceFile('diagnostic.js', body, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let className;
    for (const statement of ast.statements) if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
            const method = moduleName === 'AnalyticsDelivery' ? '.enqueue=function' : '.getSnapshot=function';
            if (declaration.initializer?.getText(ast).includes(method)) className = declaration.name.getText(ast);
        }
    }
    assert(className, 'compiled diagnostic class must be found');
    const registrations = new Map();
    const System = { register: (name, deps, factory) => {
        if (Array.isArray(name)) { assert.equal(name.length, 0); deps(() => {}).execute(); }
        else registrations.set(name, { deps, factory });
    } };
    for (const file of fs.readdirSync(path.join(root, 'src/chunks')).filter(x => x.endsWith('.js'))) {
        vm.runInNewContext(fs.readFileSync(path.join(root, 'src/chunks', file), 'utf8'), { ...globals, System });
    }
    const helperPath = source.match(/"\.\/(rollupPluginModLoBabelHelpers-[^"]+\.js)"/)[1];
    const helper = registrations.get('chunks:///' + helperPath);
    assert(helper && helper.deps.length === 0, 'actual helper module must exist');
    const exports = {};
    helper.factory((name, value) => { if (typeof name === 'object') Object.assign(exports, name); else exports[name] = value; return value; }).execute();
    const setter = source.match(/setters:\[function\((\w+)\)\{([^}]+)\}/);
    assert(setter, 'actual helper setter must exist');
    const aliases = {};
    for (const match of setter[2].matchAll(new RegExp('(\\w+)=' + setter[1] + '\\.(\\w+)', 'g'))) {
        assert(exports[match[2]], 'actual helper export must exist');
        aliases[match[1]] = exports[match[2]];
    }
    return vm.runInNewContext(body + '\n' + className, { ...globals, ...aliases });
}
function harness() {
    let now = 1000, next = 0;
    const timers = new Map(), logs = [], storage = new Map(), cache = new Map();
    class Clock extends Date { static now() { return now; } }
    function load(name) {
        if (cache.has(name)) return cache.get(name);
        const exports = {};
        const globals = { exports, require: id => load(id.slice(2)), Date: Clock, Math, Set, Map,
            console: { warn: (...args) => logs.push(args), info: (...args) => logs.push(args), error: (...args) => logs.push(args) },
            setTimeout: (fn, ms) => { const id = ++next; timers.set(id, { fn, at: now + ms }); return id; },
            clearTimeout: id => timers.delete(id) };
        if (process.argv[2] && ['DouyinUploadDiagnostics', 'AnalyticsDelivery'].includes(name)) {
            exports[name] = compiledClass(path.resolve(process.argv[2]), globals, name);
        } else vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/Scripts/Core/' + name + '.ts', 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        }).outputText, globals);
        cache.set(name, exports); return exports;
    }
    const diagnostics = new (load('DouyinUploadDiagnostics').DouyinUploadDiagnostics)('diagnostic-test');
    const Delivery = load('AnalyticsDelivery').AnalyticsDelivery;
    const create = (send, ready = async () => 'SECRET_OWNER', observer = diagnostics) => new Delivery({
        getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value),
    }, ready, send, () => true, { strictOwner: true, environment: 'douyin_dev', diagnostics: observer });
    return { diagnostics, create, logs, storage, timers, now: value => { now = value; },
        advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } } };
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const event = id => ({ eventId: id, eventName: 'ad_finish', timestamp: 1, openid: 'SECRET_PAYLOAD' });
const ack = data => ({ ok: true, count: 1, acknowledgedIds: [data.eventId] });
async function main() {
    {
        const h = harness(); let identities = 0, sends = 0;
        const d = h.create(async (name, data) => { sends++; return ack(data); }, async () => { identities++; return 'owner'; });
        d.enqueue('addBehaviorData', event('before-hide'), 'owner');
        assert.equal(h.timers.size, 1);
        d.setPaused(true); d.setPaused(true);
        assert.equal(h.timers.size, 0, 'hide cancels only the queue timer');
        assert(d.enqueue('addBehaviorData', event('during-hide'), 'owner'));
        assert.equal(JSON.parse([...h.storage.values()][0]).length, 2, 'background events persist');
        await d.flush(); h.advance(60000); await settle();
        assert.equal(identities, 0); assert.equal(sends, 0); assert.equal(d.quality.uploadFailures, 0);
        d.setPaused(false); d.setPaused(false);
        assert.equal(h.timers.size, 1, 'duplicate show schedules once');
        h.advance(1200); await settle();
        assert.equal(identities, 1); assert.equal(sends, 1); assert.equal(d.size, 1);
        h.advance(1200); await settle(); assert.equal(d.size, 0);
    }
    {
        const h = harness(); let finishIdentity, identities = 0, sends = 0;
        const d = h.create(async (name, data) => { sends++; return ack(data); }, () => ++identities === 1
            ? new Promise(resolve => { finishIdentity = resolve; }) : Promise.resolve('owner'));
        d.enqueue('addBehaviorData', event('hide-during-identity'));
        const work = d.flush(); d.setPaused(true); finishIdentity('owner'); await work;
        assert.equal(sends, 0); assert.equal(d.size, 1); assert.equal(d.quality.uploadFailures, 0);
        assert.equal(h.timers.size, 0);
        const saved = JSON.parse([...h.storage.values()][0])[0];
        assert.equal(saved.owner, 'owner', 'retain confirmed ownership across background/restart');
        assert.equal(saved.id, 'hide-during-identity'); assert.equal(saved.data.timestamp, 1);
        assert.equal(h.diagnostics.getSnapshot().failures.length, 0, 'deferral is not failure');
        d.setPaused(false); h.advance(1200); await settle();
        assert.equal(identities, 2, 'resume must recheck identity'); assert.equal(d.size, 0);
    }
    {
        const h = harness(); let finishSend, sends = 0;
        const d = h.create((name, data) => { sends++; return new Promise(resolve => { finishSend = () => resolve(ack(data)); }); });
        d.enqueue('addBehaviorData', event('in-flight-success'));
        const work = d.flush(); await settle(); d.setPaused(true);
        d.enqueue('addBehaviorData', event('saved-while-in-flight'));
        finishSend(); await work;
        assert.equal(d.size, 1, 'background ack removes only the sent event'); assert.equal(sends, 1);
        assert.equal(h.timers.size, 0); assert.equal(d.quality.uploadFailures, 0);
        d.setPaused(false); h.advance(1200); await settle();
        d.setPaused(true); d.setPaused(false); await d.flush();
        assert.equal(sends, 2, 'hide/show/manual flush cannot duplicate an in-flight request');
        finishSend(); await settle(); assert.equal(d.size, 0);
    }
    {
        const h = harness(); let rejectSend, attempts = 0;
        const d = h.create((name, data) => ++attempts === 1 ? new Promise((resolve, reject) => { rejectSend = reject; }) : Promise.resolve(ack(data)));
        d.enqueue('addBehaviorData', event('in-flight-fail'));
        const work = d.flush(); await settle(); d.setPaused(true); rejectSend(Error('douyin analytics request timeout')); await work;
        assert.equal(d.size, 1); assert.equal(d.quality.uploadFailures, 1); assert.equal(h.timers.size, 0);
        d.setPaused(false); h.advance(2399); await settle(); assert.equal(attempts, 1, 'resume preserves backoff');
        h.advance(1); await settle(); assert.equal(d.size, 0); assert.equal(attempts, 2);
        assert.equal(h.diagnostics.getSnapshot().unresolvedRetryLinks, 0);
    }
    {
        const h = harness(); let finishSend;
        const d = h.create((name, data) => new Promise(resolve => { finishSend = () => resolve(ack(data)); }));
        d.enqueue('addBehaviorData', event('background-late'));
        const work = d.flush(); await settle(); d.setPaused(true); h.advance(15000); await work;
        assert.equal(d.quality.uploadFailures, 1); assert.equal(d.size, 1); assert.equal(h.timers.size, 0);
        finishSend(); await settle(); assert.equal(d.size, 1, 'late ack after timeout cannot erase event');
    }
    {
        const h = harness(); let finishIdentity, sends = 0;
        const d = h.create(async (name, data) => { sends++; return ack(data); }, () => new Promise(resolve => { finishIdentity = resolve; }));
        d.enqueue('addBehaviorData', event('resume-during-identity'));
        const work = d.flush(); d.setPaused(true); d.setPaused(false); await d.flush();
        finishIdentity('owner'); await work;
        assert.equal(sends, 1); assert.equal(d.size, 0); assert.equal(h.timers.size, 0);
    }
    {
        const h = harness(); let owner = 'first', sends = 0;
        const d = h.create(async (name, data) => { sends++; return ack(data); }, async () => owner);
        d.setPaused(true); d.enqueue('addBehaviorData', event('wrong-account'), owner); owner = 'second';
        d.setPaused(false); await d.flush();
        assert.equal(sends, 0); assert.equal(d.quality.rejected, 1);
        const quarantined = JSON.parse([...h.storage.entries()].find(([key]) => key.endsWith('.quarantine'))[1]);
        assert.equal(quarantined[0].reason, 'account_mismatch');
    }
    {
        const h = harness();
        h.diagnostics.begin('analyticsIdentity', [])({ outcome: 'identity_ready' });
        const snapshot = h.diagnostics.getSnapshot();
        assert.equal(JSON.stringify(snapshot.recent[0].retryOf), '[]', 'first success is not a retry');
        assert.equal(h.logs.length, 0, 'ordinary success must not log retry result');
    }
    {
        const h = harness(); let attempt = 0;
        h.diagnostics.setState('foreground');
        const d = h.create(async (name, data) => {
            attempt++;
            if (attempt === 1) {
                h.now(1100); h.diagnostics.setState('background'); h.now(1200); h.diagnostics.setState('foreground');
                throw Error('douyin analytics request timeout');
            }
            return ack(data);
        });
        d.enqueue('addBehaviorData', event('e1'));
        await d.flush(); assert.equal(d.size, 1); assert.equal(d.quality.uploadFailures, 1);
        let snapshot = h.diagnostics.getSnapshot(); const failure = snapshot.failures[0];
        assert.equal(failure.endpoint, 'addBehaviorData'); assert.equal(failure.elapsedMs, 200);
        assert.equal(failure.errorCode, 'REQUEST_TIMEOUT'); assert.equal(failure.lifecycleChanges, 2);
        assert.equal(failure.stateAtStart, 'foreground'); assert.equal(failure.stateAtEnd, 'foreground');
        assert.equal(failure.retryDelayMs, 2400); assert.equal(snapshot.unresolvedRetryLinks, 1);
        await d.flush(); assert.equal(d.size, 0);
        snapshot = h.diagnostics.getSnapshot(); assert.equal(snapshot.unresolvedRetryLinks, 0);
        const retry = snapshot.recent.find(x => x.outcome === 'acknowledged');
        assert.equal(retry.retryOf[0], failure.attemptId); assert.equal(retry.recoveredEventIds[0], 'e1');
        assert.equal(snapshot.failures[0].retryResults[0].outcome, 'acknowledged');
        assert(!JSON.stringify(snapshot).includes('SECRET')); assert(!JSON.stringify(h.logs).includes('SECRET'));
        snapshot.failures[0].endpoint = 'mutated'; assert.equal(h.diagnostics.getSnapshot().failures[0].endpoint, 'addBehaviorData');
    }
    {
        const h = harness(); let attempts = 0, sends = 0;
        const d = h.create(async (name, data) => { sends++; return ack(data); }, async () => {
            if (!attempts++) throw Error('analytics identity timeout'); return 'owner';
        });
        d.enqueue('addBehaviorData', event('identity'));
        await d.flush(); assert.equal(sends, 0);
        assert.equal(h.diagnostics.getSnapshot().failures[0].endpoint, 'analyticsIdentity');
        await d.flush(); assert.equal(d.size, 0);
        assert.equal(h.diagnostics.getSnapshot().failures[0].retryResults[0].outcome, 'identity_ready');
    }
    {
        const h = harness(); let complete, attempts = 0;
        const d = h.create((name, data) => ++attempts === 1 ? new Promise(resolve => { complete = () => resolve(ack(data)); }) : Promise.resolve(ack(data)));
        d.enqueue('addBehaviorData', event('late'));
        const pending = d.flush(); await settle(); h.advance(15000); await pending;
        assert.equal(d.size, 1); assert.equal(h.diagnostics.getSnapshot().failures[0].errorCode, 'ACK_TIMEOUT');
        complete(); await settle();
        assert.equal(d.size, 1, 'late response cannot remove pending event or mark recovery');
        assert(!h.diagnostics.getSnapshot().recent.some(x => x.outcome === 'acknowledged'));
        await d.flush(); assert.equal(d.size, 0);
    }
    {
        const h = harness(); const d = h.create(async () => ({ ok: true, count: 1, acknowledgedIds: ['wrong'] }));
        d.enqueue('addBehaviorData', event('mismatch')); await d.flush();
        assert.equal(d.size, 1); assert.equal(h.diagnostics.getSnapshot().failures[0].errorCode, 'ACK_MISMATCH');
        assert(!h.diagnostics.getSnapshot().recent.some(x => x.outcome === 'acknowledged'));
    }
    {
        const h = harness(); const d = h.create(async (name, data) => ({ ok: false, rejectedIds: [data.eventId], errorCode: 'INVALID_EVENT', errorMessage: 'douyin analytics rejected request' }));
        d.enqueue('addBehaviorData', event('rejected')); await d.flush();
        const snapshot = h.diagnostics.getSnapshot();
        assert.equal(d.size, 0); assert.equal(d.quality.rejected, 1);
        assert.equal(snapshot.failures[0].rejectedIds[0], 'rejected');
        assert.equal(snapshot.unresolvedRetryLinks, 0, 'quarantine is terminal, not a pending retry');
        assert(!snapshot.recent.some(x => x.outcome === 'acknowledged'));
    }
    {
        const h = harness(); const d = h.create(async (name, data) => ack(data), undefined, { begin() { throw Error('observer unavailable'); } });
        d.enqueue('addBehaviorData', event('safe')); await d.flush(); assert.equal(d.size, 0); assert.equal(d.quality.uploadFailures, 0);
        const d2 = h.create(async (name, data) => ack(data), undefined, { begin() { return () => { throw Error('observer unavailable'); }; } });
        d2.enqueue('addBehaviorData', event('safe2')); await d2.flush(); assert.equal(d2.size, 0); assert.equal(d2.quality.uploadFailures, 0);
    }
    {
        const h = harness();
        const d = h.diagnostics;
        d.begin('addFunnelEvents', [{ id: 'one', eventName: 'app_show' }, { id: 'two', eventName: 'app_hide' }])({
            outcome: 'failed', rejectedIds: ['two'], error: Error('douyin analytics rejected request'),
        });
        d.begin('addFunnelEvents', [{ id: 'unrelated', eventName: 'app_show' }])({ outcome: 'acknowledged' });
        assert.equal(d.getSnapshot().unresolvedRetryLinks, 1, 'unrelated success cannot resolve failed event');
        d.begin('addFunnelEvents', [{ id: 'one', eventName: 'app_show' }])({ outcome: 'acknowledged' });
        const snapshot = d.getSnapshot();
        assert.equal(snapshot.unresolvedRetryLinks, 0);
        assert.equal(snapshot.failures[0].retryResults[0].recoveredEventIds[0], 'one');
        assert.equal(snapshot.failures[0].rejectedIds[0], 'two');
    }
    {
        const h = harness();
        for (let i = 0; i < 1100; i++) h.diagnostics.begin('addBehaviorData', [{ id: 'e' + i, eventName: 'ad_show' }])({ outcome: 'failed', error: Error('SECRET_RAW_ERROR') });
        const snapshot = h.diagnostics.getSnapshot();
        assert.equal(snapshot.recent.length, 100); assert.equal(snapshot.failures.length, 20);
        assert.equal(snapshot.unresolvedRetryLinks, 1000); assert.equal(snapshot.droppedRetryLinks, 100);
        assert(!JSON.stringify(snapshot).includes('SECRET_RAW_ERROR'));
    }
    console.log('PASS upload diagnostics: timeout/late response, identity, exact ack, lifecycle, retry correlation, redaction, bounds, observer isolation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
