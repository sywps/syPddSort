const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('openDataContext/index.js', 'utf8');
const layout = { x: 64.8, y: 817.55062, width: 93.28, fontSize: 25.44, color: '#4B3F47' };
function boot() {
    const draws = [], requests = [], timers = new Map(), errors = [];
    let message, timerId = 0, depth = 0;
    const ctx = new Proxy({
        measureText: text => ({ width: text.length * 14 }),
        fillText: (text, x, y) => draws.push({ text, x, y, depth }),
        save: () => depth++, restore: () => depth--,
    }, { get: (o, k) => k in o ? o[k] : () => {} });
    const canvas = { width: 596, height: 840, getContext: () => ctx };
    const sandbox = {
        console: { log() {}, info() {}, warn: (...a) => errors.push(a), error: (...a) => errors.push(a) },
        setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
        clearTimeout: id => timers.delete(id),
        require: id => id === './profile-frames' ? { 2001: { width: 256, height: 256, bounds: [20, 20, 236, 236] } } : {},
        wx: {
            getSharedCanvas: () => canvas,
            onMessage: fn => { message = fn; },
            getFriendCloudStorage: options => requests.push(options),
            createImage: () => ({ width: 256, height: 256, set src(value) { this.onload?.(); } }),
        },
    };
    vm.runInNewContext(source + '\n globalThis.inspectRank = () => ({ selfRank, entries: allSortedEntries, active: friendRankActive });', sandbox);
    const send = data => message(data);
    const enter = identity => send({ type: 'getFriendRankings', selfIdentity: identity, selfRankLayout: layout });
    const lastBadge = () => draws.filter(d => d.y === layout.y).at(-1);
    return { sandbox, draws, requests, timers, errors, canvas, send, enter, lastBadge };
}
function entry(id, score, name = '同名用户') {
    return { nickname: name, avatarUrl: '', KVDataList: [
        { key: 'score', value: JSON.stringify({ wxgame: { score } }) },
        { key: 'friend_identity_v1', value: id },
    ] };
}
test('same friend snapshot yields second place; nickname is not identity and scroll cannot move the badge', () => {
    const h = boot(); h.enter('me');
    assert.equal(h.lastBadge().text, '—');
    assert(h.requests[0].keyList.includes('friend_identity_v1'));
    h.requests[0].success({ data: [entry('lower', 16), entry('me', 25), entry('higher', 57)] });
    assert.equal(h.sandbox.inspectRank().selfRank, 2);
    assert.equal(h.lastBadge().text, '第2名');
    assert.equal(h.lastBadge().depth, 0, 'self badge must be outside list clipping');
    assert(h.draws.some(d => d.text === '通关24关' && d.depth === 1));
    h.send({ type: 'scroll', offset: 10 });
    assert.equal(h.lastBadge().text, '第2名');
    assert.equal(h.canvas.height, 840, 'open domain must never resize the Cocos-owned canvas');
});
test('ties use exactly the displayed list order, rather than counting higher scores', () => {
    const h = boot(); h.enter('me');
    h.requests[0].success({ data: [entry('me', 25, 'Z'), entry('other', 25, 'A')] });
    assert.equal(h.sandbox.inspectRank().selfRank, 2);
    assert.equal(h.lastBadge().text, '第2名');
});
test('confirmed absent and beyond top100 are unranked; missing/duplicate identity is unknown', () => {
    for (const [identity, data, want] of [
        ['me', [entry('other', 25)], '未上榜'],
        ['me', [], '未上榜'],
        ['me', [...Array.from({ length: 100 }, (_, i) => entry('other' + i, 200 - i)), entry('me', 25)], '未上榜'],
        ['', [entry('other', 25)], '—'],
        ['me', [entry('me', 25), entry('me', 26)], '—'],
    ]) {
        const h = boot(); h.enter(identity); h.requests[0].success({ data });
        assert.equal(h.lastBadge().text, want);
    }
});
test('failure/timeout never says unranked; responses after close or replacement are ignored', () => {
    const h = boot(); h.enter('me');
    h.requests[0].fail({ errMsg: 'network failed' });
    assert.equal(h.lastBadge().text, '—');
    assert(h.errors.length);
    h.enter('me');
    for (const callback of [...h.timers.values()]) callback();
    assert.equal(h.lastBadge().text, '—');
    h.requests[1].success({ data: [entry('me', 25)] });
    assert.equal(h.lastBadge().text, '—');
    h.enter('me'); const old = h.requests[2];
    h.enter('me'); h.requests[3].success({ data: [entry('higher', 99), entry('me', 25)] });
    old.success({ data: [entry('me', 25)] });
    assert.equal(h.lastBadge().text, '第2名');
    h.send({ type: 'deactivate' });
    const count = h.draws.length;
    h.requests[3].success({ data: [entry('me', 25)] });
    assert.equal(h.draws.length, count);
});
function methods(file, start, end, deps = {}) {
    const text = fs.readFileSync(file, 'utf8');
    const from = text.indexOf(start), until = text.indexOf(end, from);
    assert(from >= 0 && until > from);
    const js = ts.transpileModule(`const methods = {${text.slice(from, until)}};`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    return new Function(...Object.keys(deps), js + '; return methods;')(...Object.values(deps));
}
test('national self row continues to use cloud self.rank without subtracting or friend matching', () => {
    const profile = { displayName: 'game', avatarId: 1008, frameId: 2008, lastLevelId: 25 };
    const m = methods('assets/Scripts/Core/GameCtrlModules/CollectionAvatarModule.ts', 'renderLeaderboardSelfBox(', 'estimateRankByProgress(', {
        UserMgr: { inst: { getDisplayProfile: () => profile } },
    });
    let actual;
    m.renderLeaderboardSelfBox.call({ renderLeaderboardSelfEntry: (_, entry) => actual = entry }, {}, { self: { rank: 37, progressLevel: 25 } });
    assert.equal(actual.rank, 37); assert.equal(actual.avatarId, 1008); assert.equal(actual.frameId, 2008);
});
test('identity submission writes only the dedicated friend identity key', async () => {
    let request;
    const m = methods('assets/Scripts/Core/GameCtrlModules/FriendRankModule.ts', 'async prepareFriendRankIdentity()', '/** 好友排行旧兜底', {
        UserMgr: { inst: { getProfile: () => ({ uuid: 'uuid-me' }) } },
        withFriendRankTimeout: p => p,
    });
    const result = await m.prepareFriendRankIdentity.call({ getWeChatRuntime: () => ({
        setUserCloudStorage(options) { request = options; options.success(); },
    }) });
    assert.equal(result, 'uuid-me');
    assert.deepEqual(request.KVDataList, [{ key: 'friend_identity_v1', value: 'uuid-me' }]);
});

test('switching back restores native rank label and sibling order before destroying the friend canvas', () => {
    const m = methods('assets/Scripts/Core/GameCtrlModules/FriendRankModule.ts', 'resetLeaderboardListState(', 'async prepareFriendRankIdentity()', {
        setFriendRankLoadingVisible() {},
    });
    const badge = { isValid: true, enabled: false }, viewport = { active: true };
    const events = [];
    const host = { active: true, removeFromParent() { events.push('detach'); }, destroy() { events.push('destroy'); } };
    const list = { __friendSelfBadge: badge, __friendListSibling: 2,
        setSiblingIndex(i) { events.push(i); },
        getChildByName(name) { return name === 'LeaderboardViewport' ? viewport : host; },
    };
    m.resetLeaderboardListState.call({ clearLeaderboardScroll(v) { assert.equal(v, viewport); } }, list);
    assert.equal(badge.enabled, true); assert.equal(host.active, false);
    assert.deepEqual(events, [2, 'detach', 'destroy']);
    assert.equal(list.__friendSelfBadge, undefined);
});

test('canvas self badge matches prefab coordinates; list keeps its independent clip height', () => {
    const d = JSON.parse(fs.readFileSync('assets/GameAssetsBundle/UI/Prefabs/Panels/LeaderboardPanel.prefab', 'utf8'));
    const node = name => d.find(n => n.__type__ === 'cc.Node' && n._name === name);
    const component = (n, t) => n._components.map(r => d[r.__id__]).find(c => c.__type__ === t);
    const list = node('LeaderboardList'), self = node('LeaderboardSelfBox'), badge = node('LeaderboardSelfBadgeLbl');
    const main = fs.readFileSync('assets/Scripts/Core/GameCtrlModules/FriendRankModule.ts', 'utf8');
    const width = Number(main.match(/const hostWidth = (\d+)/)[1]);
    const height = Number(main.match(/const listHeight = (\d+)/)[1]);
    const top = -62.933 + height / 2;
    const near = (a, b) => assert(Math.abs(a - b) < 0.00001);
    near(layout.x, width / 2 + self._lpos.x + badge._lpos.x * self._lscale.x - list._lpos.x);
    near(layout.y, top - (self._lpos.y + badge._lpos.y * self._lscale.y - list._lpos.y));
    near(layout.width, component(badge, 'cc.UITransform')._contentSize.width * self._lscale.x);
    const view = node('LeaderboardViewport'), v = component(view, 'cc.UITransform');
    assert.equal(height, v._contentSize.height);
    near(top, view._lpos.y + height * (1 - v._anchorPoint.y));
    assert(source.includes('ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)'));
});
