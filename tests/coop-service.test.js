'use strict';
const assert = require('node:assert/strict');
const { createCoopService } = require('../cloudfunctions/coopService/core');
const { coopHalfLevel, COOP_RULES_VERSION, COOP_MAX_ELAPSED_MS } = require('../cloudfunctions/coopService/runtime/CoopModeConfig');
const { PvpHumanReplay } = require('../cloudfunctions/coopService/runtime/PvpHumanReplay');
const { controllerReplay } = require('./pvp-human-replay-fixture');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
function memoryStore() {
    let data = { users: {}, posts: {}, runs: {} }, queue = Promise.resolve();
    const api = {
        get: async (kind, id) => clone(data[kind][id] || null),
        set: async (kind, id, value) => { data[kind][id] = clone(value); },
        list: async (kind, filter, cursor, limit) => Object.entries(data[kind]).filter(([id, v]) => id > cursor && Object.entries(filter).every(([k, val]) => v[k] === val))
            .sort(([a], [b]) => a.localeCompare(b)).slice(0, limit).map(([, v]) => clone(v)),
        transaction(fn) {
            const result = queue.then(async () => { const before = clone(data); try { return await fn(api); } catch (e) { data = before; throw e; } });
            queue = result.catch(() => {}); return result;
        },
    };
    return api;
}

async function main() {
    let time = 1000000;
    const store = memoryStore();
    const execute = createCoopService(store, () => time);
    const call = (owner, action, extra = {}) => execute(owner, { action, rulesVersion: COOP_RULES_VERSION, displayName: owner, ...extra });
    await assert.rejects(call('', 'overview'), /身份/);
    await assert.rejects(execute('A', { action: 'overview', rulesVersion: 'wrong' }), /版本/);
    const created = await call('A', 'create', { levelId: 7 });
    const postId = created.post.id;
    const legacy = await store.get('runs', created.run.id);
    await store.set('runs', legacy.id, { ...legacy, checkpoint: { old: 'board' }, progress: 0.4, elapsedMs: 1234, priorElapsedMs: 100, attempt: 1 });
    const migrated = await call('A', 'detail', { postId });
    assert.equal(migrated.run.elapsedMs, 0);
    assert(!('checkpoint' in await store.get('runs', legacy.id)), 'old process data removed on next access');
    assert.equal((await call('A', 'create', { levelId: 7 })).post.id, postId, 'create retries resume existing post');
    await assert.rejects(call('A', 'create', { levelId: 2 }), /先完成/);
    await assert.rejects(call('B', 'join', { postId }), /还未完成/);
    await assert.rejects(call('A', 'publish', { postId, published: true }), /先拼完/);
    await assert.rejects(call('B', 'save', { postId }), /尚未加入/);
    await assert.rejects(call('A', 'save', { postId }), /只支持保存完成/);
    await assert.rejects(call('A', 'complete', { postId, requestId: '1111111111111111', version: 0, events: [[0, 0, 1], [50, 2, 999, 0, 1, 1]] }), /selection/);
    assert.equal((await call('A', 'detail', { postId })).run.version, 0, 'invalid replay leaves state unchanged');
    const full = require('../cloudfunctions/coopService/levels/coop_level_7.json');
    const fixtures = {};
    for (const role of ['creator', 'collaborator']) {
        const half = coopHalfLevel(full, role);
        const fixture = controllerReplay({ ...half, timeLimit: 600 });
        assert.equal(fixture.terminalType, 'PASS', `actual controller must solve ${role}`);
        fixtures[role] = fixture.envelope.events;
        const continuous = new PvpHumanReplay(half, COOP_MAX_ELAPSED_MS);
        let restored = new PvpHumanReplay(half, COOP_MAX_ELAPSED_MS);
        for (let i = 0; i < fixture.envelope.events.length; i++) {
            const event = fixture.envelope.events[i]; continuous.apply(event); restored.apply(event);
            if (i % 71 === 0) restored = PvpHumanReplay.fromCheckpoint(half, clone(restored.checkpoint()), COOP_MAX_ELAPSED_MS);
        }
        assert.deepEqual(restored.checkpoint(), continuous.checkpoint(), 'all transport and pending arrivals survive checkpoints');
        assert(restored.board.isAllLocked());
    }
    async function submit(owner, role, start = 0, count = Infinity) {
        let detail = await call(owner, 'detail', { postId });
        const events = fixtures[role];
        const end = Math.min(events.length, start + count);
        let last;
        for (let i = start; i < end; i = end) {
            const chunk = events.slice(i, end);
            time += 600000;
            const payload = { postId, version: detail.run.version, requestId: `${owner.charCodeAt(0).toString(16)}-${String(i).padStart(16, '0')}`, events: chunk };
            last = await call(owner, 'complete', payload); detail = last;
            const duplicate = await call(owner, 'complete', payload);
            assert.equal(duplicate.run.version, last.run.version, 'lost response retry is idempotent');
            await assert.rejects(call(owner, 'complete', { ...payload, events: [[0, 0, 2]] }), /内容不同/);
            const persisted = await store.get('runs', last.run.id);
            assert(!('checkpoint' in persisted) && !('progress' in persisted) && !('events' in persisted), 'database stores no gameplay state');
        }
        return last;
    }
    await submit('A', 'creator');
    assert.deepEqual((await call('A', 'overview')).overview.unlocked, {}, 'one half does not unlock pattern');
    await assert.rejects(call('A', 'join', { postId }), /不能参与自己/);
    await call('A', 'publish', { postId, published: true });
    assert.equal((await call('B', 'square')).posts.length, 1);
    const joins = await Promise.all(['B', 'C', 'D'].map(owner => call(owner, 'join', { postId })));
    assert.equal(new Set(joins.map(item => item.run.id)).size, 3, 'each collaborator has own run');
    assert.equal((await call('B', 'join', { postId })).run.id, joins[0].run.id, 'join retry is idempotent');
    await assert.rejects(submit('C', 'collaborator', 0, 180), /尚未完成/);
    const partialC = await call('C', 'detail', { postId });
    assert.equal(partialC.run.version, 0);
    assert.equal(partialC.run.elapsedMs, 0, 'incomplete attempts save neither progress nor time');
    await submit('B', 'collaborator');
    const aFirst = (await call('A', 'overview')).overview;
    assert(aFirst.unlocked.coop_original_07);
    assert.equal(aFirst.activeCreated, null);
    assert((await call('B', 'overview')).overview.unlocked.coop_original_07);
    assert.deepEqual((await call('C', 'overview')).overview.unlocked, {});
    assert.deepEqual((await call('C', 'detail', { postId })).run, partialC.run, 'B completion never changes C progress');
    await submit('D', 'collaborator');
    assert.equal((await call('A', 'overview')).overview.unlocked.coop_original_07, aFirst.unlocked.coop_original_07, 'creator reward never repeats');
    await submit('C', 'collaborator');
    assert((await call('C', 'overview')).overview.unlocked.coop_original_07);
    const final = await call('A', 'participants', { postId });
    assert.equal(final.participants.length, 3);
    assert(final.participants.every(p => p.status === 'complete' && p.elapsedMs > 0 && p.completedAt > 0));
    assert.equal((await call('A', 'detail', { postId })).post.completedCount, 3);
    await assert.rejects(call('B', 'participants', { postId }), /只能查看/);
    await call('A', 'publish', { postId, published: false });
    assert.equal((await call('E', 'square')).posts.length, 0);
    assert((await call('E', 'join', { postId })).run, 'private link still accepts independent participants');
    const next = await call('A', 'create', { levelId: 1 });
    assert.notEqual(next.post.id, postId);
    const user = (await call('E', 'overview')).overview;
    assert.equal(user.activeJoined, postId);
    const assistPost = await call('F', 'create', { levelId: 7 });
    for (const [owner, role] of [['F', 'creator'], ['G', 'collaborator']]) {
        if (role === 'collaborator') await call(owner, 'join', { postId: assistPost.post.id });
        const replay = new PvpHumanReplay(coopHalfLevel(full, role), COOP_MAX_ELAPSED_MS, true);
        const events = [[0, 0, 1], [0, 7, 12], [0, 9, 90], [1000, 8]];
        events.forEach(event => replay.apply(event));
        for (let i = 0; !replay.board.isAllLocked() && i < 20; i++) {
            const event = [1001 + i, 5, 0]; replay.apply(event); events.push(event);
        }
        time += 3000;
        const saved = await call(owner, 'complete', { postId: assistPost.post.id, version: 0,
            requestId: `${owner.charCodeAt(0).toString(16)}-0000000000000001`, events });
        assert.equal(saved.run.status, 'complete', 'props can complete a cooperation half through server replay');
        assert.equal(saved.run.checkpoint, undefined);
    }
    assert((await call('F', 'overview')).overview.unlocked.coop_original_07);
    assert((await call('G', 'overview')).overview.unlocked.coop_original_07);
    console.log('COOP_SERVICE_TESTS_PASSED: completion-only writes, incomplete rejection, independent rewards and retries');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
