const assert = require('node:assert/strict');
const { createSubmitFeedback } = require('../cloudfunctions/submitFeedback/service');

async function main() {
    const data = new Map();
    let clock = 100000;
    let failure = null;
    const transaction = { collection: name => ({ doc: id => ({
        get: async () => { if (failure) throw failure; return { data: data.get(`${name}/${id}`) }; },
        set: async ({ data: value }) => { data.set(`${name}/${id}`, value); },
    }) }) };
    const submit = createSubmitFeedback({ runTransaction: fn => fn(transaction), now: () => clock });
    const event = { requestId: 'test-request-0001', content: '广告播放完没有奖励', levelId: 12, openid: 'forged' };
    assert.equal((await submit(event, '')).code, 'UNAUTHORIZED');
    assert.equal((await submit({ ...event, content: '  ' }, 'player')).code, 'INVALID_CONTENT');
    assert.equal((await submit({ ...event, content: '字'.repeat(501) }, 'player')).code, 'INVALID_CONTENT');
    assert.equal((await submit({ ...event, requestId: '../bad' }, 'player')).code, 'INVALID_REQUEST');
    const first = await submit(event, 'player');
    assert.equal(first.ok, true);
    const record = data.get(`user_feedback/${first.feedbackId}`);
    assert.equal(record.openid, 'player');
    assert.equal(record.content, event.content);
    assert.equal(record.status, 'pending');
    assert.equal(record.createdAt.getTime(), clock);
    assert.deepEqual(await submit(event, 'player'), first, 'retry must acknowledge original record');
    assert.equal(data.size, 2, 'retry must not duplicate record');
    assert.equal((await submit({ ...event, content: 'changed' }, 'player')).code, 'REQUEST_CONFLICT');
    assert.equal((await submit({ ...event, requestId: 'test-request-0002' }, 'player')).code, 'RATE_LIMITED');
    assert.equal((await submit(event, 'another-player')).ok, true);
    clock += 60000;
    assert.equal((await submit({ ...event, requestId: 'test-request-0002' }, 'player')).ok, true);
    failure = new Error('database unavailable');
    await assert.rejects(submit(event, 'player'), /database unavailable/);
    failure = new Error('collection user_feedback does not exist');
    await assert.rejects(submit(event, 'player'), /collection/, 'missing collection must not be silently ignored');
    console.log('feedback-service.test.js passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
