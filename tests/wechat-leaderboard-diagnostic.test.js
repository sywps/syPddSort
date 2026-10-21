'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const install = require('../scripts/runtime/wechat-leaderboard-diagnostic');

function harness(mode, options = {}) {
    const calls = { submit: 0, fetch: 0, init: 0, rows: 0, self: 0, avatar: 0, close: 0 };
    class WxCloudMgr { async init() { calls.init++; return true; } }
    class LeaderboardMgr {
        enableCloudInit() { calls.init++; }
        async submitProgress() { calls.submit++; }
        async callLeaderboardCloudFunction() { return { ok: options.businessOk !== false }; }
        async fetchLeaderboard() {
            calls.fetch++;
            if (options.fetchError) throw Error('injected transport failure');
            return { source: options.source || 'wechat-cloud', entries: [{ uuid: 'private-id', avatarUrl: 'https://private/avatar', rank: 1 }], self: null };
        }
    }
    const mgr = new LeaderboardMgr();
    const label = {}, statusNode = { active: false, getComponent: () => label };
    const list = { getChildByName: () => statusNode }, self = {}, box = { isValid: true };
    const runtime = { _spriteFrameCacheMeta: new Map(), sfCache: new Map(),
        async openLeaderboard() { mgr.enableCloudInit(); return this.loadGlobalLeaderboard(box, list, self, 1); },
        _retainPanelTextureOwner() {}, _openPanelAfterTextures() {},
        async loadGlobalLeaderboard() {
            await mgr.submitProgress();
            const result = await mgr.fetchLeaderboard();
            await this.getWeChatFriendAvatarEntries();
            this.renderLeaderboardRows(list, result.entries);
            this.renderLeaderboardSelfBox(self, result);
            return 'original-result';
        },
        renderLeaderboardRows() { calls.rows++; this.renderLeaderboardRow(); },
        renderLeaderboardSelfBox() { calls.self++; this.loadAvatarToNode('private-url', {}, {}); },
        renderLeaderboardRow() { this.loadAvatarToNode('private-url', {}, { avatarId: 1 }); },
        loadAvatarToNode() { calls.avatar++; }, _closePanelWithTextureOwner() { calls.close++; return 7; },
        switchLeaderboardTab() {}, async getWeChatFriendAvatarEntries() { return []; },
        isLeaderboardTabRequestCurrent: () => true, resetLeaderboardListState() {}, showToast() {} };
    const scene = { name: 'Home', components: [runtime], children: [], getComponent: () => null, getChildByName: () => null };
    const sceneListeners = {};
    class Texture2D {} class SpriteFrame {}
    const cc = { Texture2D, SpriteFrame, Sprite: class {}, Label: class {}, isValid: () => true,
        js: { getClassByName: name => options.missingClass ? null : ({ WxCloudMgr, LeaderboardMgr })[name] },
        assetManager: { assets: new Map() }, Director: { EVENT_AFTER_SCENE_LAUNCH: 'scene' },
        director: { getScene: () => scene, on: (name, cb) => sceneListeners[name] = cb, off() {} } };
    const callbacks = [], host = {}, lines = [];
    const file = { text: '', writeFileSync() { if (options.fileFail) throw Error('injected fs failure'); },
        appendFileSync(p, text) { this.text += text; }, readFileSync() { return this.text; } };
    const wxApi = { env: { USER_DATA_PATH: '/sandbox' }, getFileSystemManager: () => file };
    const api = install(host, wxApi, { warn: (...args) => lines.push(args) },
        { mode, diagnosticId: 'unit', baseBuildId: 'unit' },
        { setTimeout: (cb, ms) => { callbacks.push({ cb, ms }); return callbacks.length; }, clearTimeout() {} });
    api.attachEngine(cc);
    return { api, runtime, calls, label, file, callbacks, mgr, events: () => api.state().events.map(e => e.event) };
}

test('full keeps request, rendering, return value and close behavior', async () => {
    const h = harness('full');
    assert.equal(await h.runtime.openLeaderboard(), 'original-result');
    assert.equal(h.calls.submit, 1); assert.equal(h.calls.fetch, 1);
    assert.equal(h.calls.rows, 1); assert.equal(h.calls.self, 1);
    assert.equal(h.calls.avatar, 2);
    assert.equal(h.api.state().catalogAvatarCalls, 1); assert.equal(h.api.state().urlAvatarCalls, 1);
    assert.equal(h.runtime._closePanelWithTextureOwner({}, 'leaderboard'), 7);
    for (const item of h.callbacks) item.cb();
    assert(h.events().includes('close.settle.10000'));
    assert.equal(h.api.state().failed, false);
    const data = h.api.readLog();
    assert(!data.includes('private-id')); assert(!data.includes('private-url'));
    assert(!data.includes('https://private/avatar'));
});
test('panel skips leaderboard activation, submission, fetch, rows and avatars', async () => {
    const h = harness('panel'); await h.runtime.openLeaderboard();
    assert.deepEqual(h.calls, { submit: 0, fetch: 0, init: 0, rows: 0, self: 0, avatar: 0, close: 0 });
    assert(h.events().includes('rank.requests.skipped'));
    assert.match(h.label.string, /未发起排行榜请求/);
    // Background SDK activity stays untouched outside leaderboard tests.
    h.runtime._closePanelWithTextureOwner({}, 'leaderboard');
    h.mgr.enableCloudInit(); assert.equal(h.calls.init, 1);
});
test('data retains real data flow and suppresses rows and both avatar branches', async () => {
    const h = harness('data'); assert.equal(await h.runtime.openLeaderboard(), 'original-result');
    assert.equal(h.calls.fetch, 1); assert.equal(h.calls.submit, 1);
    assert.equal(h.calls.rows, 0); assert.equal(h.calls.self, 0); assert.equal(h.calls.avatar, 0);
    assert.match(h.label.string, /已返回1项/);
    assert.equal(h.api.state().cloudSource, 'wechat-cloud');
});
test('local fallback is explicitly marked uncovered', async () => {
    const h = harness('data', { source: 'local-preview' }); await h.runtime.openLeaderboard();
    assert(h.events().includes('rank.cloud.not-covered'));
    assert.match(h.label.string, /未覆盖/);
});
test('rejected transport is logged and propagated', async () => {
    const h = harness('data', { fetchError: true });
    await assert.rejects(h.runtime.openLeaderboard(), /injected transport failure/);
    assert(h.events().includes('rank.fetch.error')); assert(h.events().includes('rank.flow.error'));
    assert(!h.events().includes('rank.flow.end'));
});
test('business rejection is visible even if caller handles its result', async () => {
    const h = harness('full', { businessOk: false });
    assert.deepEqual(await h.mgr.callLeaderboardCloudFunction(), { ok: false });
    assert(h.events().includes('rank.cloudcall.business-failed'));
});
test('missing hooks and file errors invalidate diagnostics visibly', () => {
    for (const options of [{ missingClass: true }, { fileFail: true }]) {
        const h = harness('full', options);
        assert.equal(h.api.state().failed, true);
        assert(h.events().includes('diagnostic.failed'));
    }
});
test('retained log and on-disk diagnostic file are bounded', async () => {
    const h = harness('full');
    for (let i = 0; i < 1600; i++) await h.mgr.callLeaderboardCloudFunction();
    assert.equal(h.api.state().events.length, 1200);
    assert(h.api.state().dropped > 0);
    assert(Buffer.byteLength(h.file.text) <= 512 * 1024);
    assert.equal(h.api.state().storage, 'limit-reached');
});
