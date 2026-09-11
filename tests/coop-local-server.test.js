'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLocalServer } = require('../scripts/coop-local-server');
const { COOP_RULES_VERSION, coopHalfLevel, COOP_MAX_ELAPSED_MS } = require('../cloudfunctions/coopService/runtime/CoopModeConfig');
const { PvpHumanReplay } = require('../cloudfunctions/coopService/runtime/PvpHumanReplay');
const full = require('../assets/LevelData/coop_level_7.json');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coop-local-test-'));
const file = path.join(directory, 'state.json');
let now = 1000000;
let server;
let base;
async function start() {
    server = createLocalServer({ file, now: () => now });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
}
async function call(player, action, data = {}) {
    const response = await fetch(base + '/coop', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:7456' },
        body: JSON.stringify({ player, event: { ...data, action, rulesVersion: COOP_RULES_VERSION } }) });
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:7456');
    const result = await response.json();
    if (!result.ok) throw new Error(result.errorMessage);
    return result;
}
function proof(role) {
    const replay = new PvpHumanReplay(coopHalfLevel(full, role), COOP_MAX_ELAPSED_MS, true);
    const events = [[0, 0, 1]];
    replay.apply(events[0]);
    for (let i = 1; !replay.board.isAllLocked() && i <= 20; i++) { const event = [i * 10, 5, 0]; replay.apply(event); events.push(event); }
    assert(replay.board.isAllLocked());
    return events;
}
async function main() {
    try {
        await start();
        assert.equal((await (await fetch(base + '/health')).json()).mode, 'local-coop');
        assert.equal((await fetch(base + '/health', { headers: { Origin: 'https://example.com' } })).status, 403);
        await assert.rejects(call('ONLINE_USER', 'overview'), /只能是/);
        const created = await call('A', 'create', { levelId: 7 });
        const postId = created.post.id;
        const before = fs.readFileSync(file, 'utf8');
        now += 1000;
        await assert.rejects(call('A', 'complete', { postId, version: 0, requestId: 'a-0000000000000001', events: [[0, 0, 1]] }), /尚未完成/);
        assert.equal(fs.readFileSync(file, 'utf8'), before, 'incomplete attempt does not change disk state');
        const creatorProof = { postId, version: 0, requestId: 'a-0000000000000002', events: proof('creator') };
        await call('A', 'complete', creatorProof);
        await call('A', 'publish', { postId, published: true });
        assert.equal((await call('B', 'square')).posts[0].id, postId);
        assert.equal((await call('B', 'detail', { postId })).run, null, 'shared invitation is visible before joining');
        await Promise.all(['B', 'C'].map(player => call(player, 'join', { postId })));
        now += 1000;
        const partnerProof = { postId, version: 0, requestId: 'b-0000000000000001', events: proof('collaborator') };
        await call('B', 'complete', partnerProof);
        await call('B', 'complete', partnerProof);
        for (const player of ['A', 'B']) assert((await call(player, 'overview')).overview.unlocked.coop_original_07);
        assert.deepEqual((await call('C', 'overview')).overview.unlocked, {});
        const participants = (await call('A', 'participants', { postId })).participants;
        assert.equal(participants.filter(person => person.status === 'complete').length, 1);
        assert.equal(participants.filter(person => person.status === 'playing').length, 1);
        for (const run of Object.values(JSON.parse(fs.readFileSync(file)).runs)) {
            assert(!('checkpoint' in run) && !('events' in run) && !('progress' in run));
        }
        await new Promise(resolve => server.close(resolve));
        await start();
        assert((await call('B', 'overview')).overview.unlocked.coop_original_07, 'completion survives local server restart');
        assert.equal((await call('C', 'detail', { postId })).run.elapsedMs, 0, 'unfinished player restarts without progress');
        now += 1000;
        await call('C', 'complete', { ...partnerProof, requestId: 'c-0000000000000001' });
        assert.equal((await call('A', 'detail', { postId })).post.completedCount, 2);
        console.log('COOP_LOCAL_SERVER_TESTS_PASSED: HTTP, local-only origins, A/B/C isolation, result-only persistence and restart');
    } finally {
        if (server?.listening) await new Promise(resolve => server.close(resolve));
        fs.rmSync(directory, { recursive: true, force: true });
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
