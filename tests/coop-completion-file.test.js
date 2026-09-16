'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const config = require('../cloudfunctions/coopService/runtime/CoopModeConfig');
const replay = require('../cloudfunctions/coopService/runtime/PvpHumanReplay');
const { createCompletionFileHandler } = require('../cloudfunctions/coopService/completion-file');
const full = require('../assets/LevelData/coop_level_7.json');
const compile = (file, dependencies) => {
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    } }).outputText;
    const module = { exports: {} };
    new Function('module', 'exports', 'require', code)(module, module.exports, dependencies);
    return module.exports;
};
const { createCoopService } = compile(path.join(__dirname, '../cloudfunctions/coopService/core.js'), id => {
    if (id === 'crypto') return require('node:crypto');
    if (id === './levels/manifest.json') return { levels: [{ levelId: 7, collectionId: 'test-pattern' }] };
    if (id === './legacy-levels/manifest.json') return { levels: [] };
    if (id === './levels/coop_level_7.json') return full;
    if (id === './runtime/CoopModeConfig') return config;
    if (id === './runtime/PvpHumanReplay') return replay;
    throw new Error(id);
});
const files = new Map(), local = new Map(), calls = [];
let uploadFailure = false, uploads = 0, owner = 'A', loseResponse = false;
const wx = {
    env: { USER_DATA_PATH: '/user' },
    getFileSystemManager: () => ({
        writeFile: ({ filePath, data, success }) => { local.set(filePath, data); success(); },
        unlink: ({ filePath }) => local.delete(filePath),
    }),
    cloud: { uploadFile: async ({ cloudPath, filePath }) => {
        uploads++;
        if (uploadFailure) throw new Error('上传中断');
        const fileID = `cloud://test.bucket/${cloudPath}`;
        files.set(fileID, Buffer.from(local.get(filePath)));
        return { fileID };
    } },
};
const { CoopServiceMgr } = compile(path.join(__dirname, '../assets/Scripts/Core/CoopServiceMgr.ts'), id => {
    if (id === 'cc') return { sys: { localStorage: { removeItem() {} } } };
    if (id.endsWith('/CoopModeConfig')) return config;
    if (id.endsWith('/PvpHumanReplay')) return replay;
    if (id.endsWith('/MiniGamePlatform')) return { getWeChatMiniGameRuntime: () => wx, isMiniGameRuntime: () => true };
    if (['PlatformCloudMgr', 'RemoteDataCdnClient', 'WeChatShareReturnService', 'UserMgr'].some(name => id.endsWith('/' + name))) return {};
    throw new Error(id);
});
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const state = { users: {}, posts: {}, runs: {} };
const store = {
    get: async (kind, id) => clone(state[kind][id]),
    set: async (kind, id, value) => { state[kind][id] = clone(value); },
    transaction: async fn => fn(store),
};
let now = 0;
const core = createCoopService(store, () => now);
const execute = createCompletionFileHandler(core, {
    downloadFile: async ({ fileID }) => { assert(files.has(fileID)); return { fileContent: files.get(fileID) }; },
    deleteFile: async ({ fileList }) => { fileList.forEach(id => files.delete(id)); return { fileList: [] }; },
});
const call = (action, data = {}) => execute(owner, { ...data, action, rulesVersion: config.COOP_RULES_VERSION });

async function main() {
    const created = await call('create', { levelId: 7 });
    const mgr = new CoopServiceMgr();
    mgr.fullLevel = async () => full;
    mgr.call = async (action, data) => {
        assert(Buffer.byteLength(JSON.stringify(data)) < 4096, 'cloud calls contain no full replay array');
        calls.push({ action, ...data });
        const result = await call(action, data);
        if (action === 'complete' && loseResponse) { loseResponse = false; throw new Error('响应丢失'); }
        return result;
    };
    await mgr.prepare({}, created.post, created.run);
    await assert.rejects(mgr.flush(), /只有完成/);
    assert.equal(uploads, 0, 'no progress file is uploaded during gameplay');
    // A long completed game exceeding both the former 2 MB and 100,000 event limits.
    const events = [[0, 0, 1]];
    for (let i = 1; i <= 180000; i++) events.push([i * 16, 1, 0]);
    let time = 2880000;
    const solved = new replay.PvpHumanReplay(config.coopHalfLevel(full, 'creator'), config.COOP_MAX_ELAPSED_MS, true);
    solved.apply(events[0]);
    while (!solved.board.isAllLocked()) { const event = [++time, 5, 0]; solved.apply(event); events.push(event); }
    assert(Buffer.byteLength(JSON.stringify(events)) > 2000000);
    mgr.active.events = events; mgr.active.completed = true; now = time + 1000;
    uploadFailure = true;
    await assert.rejects(mgr.flush(), /上传中断/);
    const requestId = mgr.active.pending.requestId;
    assert.equal(mgr.active.events.length, events.length);
    assert.equal(local.size, 0, 'temporary local file is removed even after failed upload');
    assert.equal((await call('detail', { postId: created.post.id })).run.status, 'playing');
    uploadFailure = false; loseResponse = true;
    await assert.rejects(mgr.flush(), /响应丢失/);
    assert.equal(files.size, 0, 'confirmed cloud replay file was cleaned');
    const count = uploads;
    await mgr.flush();
    assert.equal(uploads, count, 'lost response retry confirms stored result without re-upload');
    assert.equal(mgr.active.run.status, 'complete');
    assert.equal(mgr.active.events.length, 0);
    assert.equal(mgr.active.run.elapsedMs, time);
    assert(calls.every(item => item.requestId === requestId));
    owner = 'B';
    const joined = await call('join', { postId: created.post.id });
    const ticket = await call('completeUpload', { postId: created.post.id, requestId });
    const ownFile = `cloud://test.bucket/${ticket.cloudPath}`;
    const otherFile = calls.find(item => item.replayFileID).replayFileID;
    await assert.rejects(call('complete', { postId: created.post.id, requestId, version: 0, replayFileID: otherFile }), /归属/);
    files.set(ownFile, Buffer.from('[[0,0,1]]'));
    await assert.rejects(call('complete', { postId: created.post.id, requestId, version: 0, replayFileID: ownFile }), /尚未完成/);
    const partner = new replay.PvpHumanReplay(config.coopHalfLevel(full, 'collaborator'), config.COOP_MAX_ELAPSED_MS, true);
    const partnerEvents = [[0, 0, 1]]; partner.apply(partnerEvents[0]);
    while (!partner.board.isAllLocked()) { const e = [partnerEvents.length, 5, 0]; partner.apply(e); partnerEvents.push(e); }
    files.set(ownFile, Buffer.from(JSON.stringify(partnerEvents)));
    const result = await call('complete', { postId: created.post.id, requestId, version: joined.run.version, replayFileID: ownFile });
    assert.equal(result.overview.unlocked['test-pattern'], now);
    assert.equal(result.post.completedCount, 1);
    assert.equal((await call('complete', { postId: created.post.id, requestId, version: 0, replayFileID: ownFile })).post.completedCount, 1);
    assert.equal(files.size, 0);
    console.log('COOP_COMPLETION_FILE_TESTS_PASSED: large replay, small requests, ownership, retries, result-only writes and rewards');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
