'use strict';

const crypto = require('crypto');
const { PvpHumanReplay } = require('./runtime/PvpHumanReplay');
const { pixelLevelHash } = require('./runtime/PvpBotReplay');
const { coopHalfLevel, COOP_MAX_ELAPSED_MS, COOP_RULES_VERSION } = require('./runtime/CoopModeConfig');
const manifest = require('./levels/manifest.json');
const entries = new Map(manifest.levels.map(level => [level.levelId, level]));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const runId = (post, user) => hash(`${post}:${user}`).slice(0, 40);
const userId = user => hash(user).slice(0, 40);
const blankUser = () => ({ activeCreated: null, activeJoined: null, unlocked: {} });
const postView = post => ({ id: post.id, levelId: post.levelId, creatorName: post.creatorName,
    levelHash: pixelLevelHash(fullLevel(post.levelId)), creatorDone: post.creatorDone, published: post.published, completedCount: post.completedCount });
const runView = run => run && ({ id: run.id, postId: run.postId, role: run.role, version: run.version,
    status: run.status, elapsedMs: run.status === 'complete' ? run.elapsedMs : 0, completedAt: run.completedAt, displayName: run.displayName,
    lastRequestId: run.lastRequestId || '' });
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function fullLevel(id) {
    requireValue(entries.has(id), '合作关卡不存在');
    return require(`./levels/coop_level_${id}.json`);
}
function newRun(post, owner, role, name, now) {
    return { id: runId(post.id, owner), postId: post.id, owner, role, displayName: name,
        version: 0, status: 'playing', elapsedMs: 0, completedAt: null,
        updatedAt: now, createdAt: now };
}

async function readRun(tx, id) {
    const run = await tx.get('runs', id);
    if (run && ['checkpoint', 'progress', 'priorElapsedMs', 'attempt'].some(key => key in run)) {
        delete run.checkpoint; delete run.progress; delete run.priorElapsedMs; delete run.attempt;
        if (run.status !== 'complete') run.elapsedMs = 0;
        await tx.set('runs', id, run);
    }
    return run;
}

// Store provides transactional get/set and bounded, ordered list operations.
function createCoopService(store, now = Date.now) {
    return async function execute(owner, event) {
        requireValue(typeof owner === 'string' && owner.length > 0, '登录身份不可用');
        requireValue(event.rulesVersion === COOP_RULES_VERSION, '合作玩法版本不一致，请更新游戏');
        const uid = userId(owner);
        const name = String(event.displayName || '像素玩家').slice(0, 24);
        const id = String(event.postId || '');
        const cursor = String(event.cursor || '');
        requireValue(!cursor || /^[a-f0-9]{24,40}$/.test(cursor), '分页位置无效');
        if (event.action === 'catalog') return { levels: manifest.levels.map(({ levelId, name, beanCount, collectionId, file }) => ({ levelId, name, beanCount, collectionId, file })) };
        if (event.action === 'overview') return { overview: await store.get('users', uid) || blankUser() };
        if (event.action === 'history') {
            const runs = await store.list('runs', { owner }, cursor, 21);
            return { runs: runs.slice(0, 20).map(run => ({ postId: run.postId, role: run.role, status: run.status })),
                next: runs.length > 20 ? runs[19].id : '' };
        }
        if (event.action === 'square') {
            const posts = await store.list('posts', { published: true, creatorDone: true }, cursor, 21);
            return { posts: posts.slice(0, 20).map(postView), next: posts.length > 20 ? posts[19].id : '' };
        }
        if (event.action === 'create') {
            fullLevel(event.levelId);
            return store.transaction(async tx => {
                const user = await tx.get('users', uid) || blankUser();
                if (user.activeCreated) {
                    const post = await tx.get('posts', user.activeCreated);
                    requireValue(post && post.levelId === event.levelId, '请先完成正在发起的合作');
                    return { post: postView(post), run: runView(await readRun(tx, runId(post.id, owner))) };
                }
                const createdAt = now();
                const post = { id: crypto.randomBytes(12).toString('hex'), levelId: event.levelId,
                    creator: owner, creatorName: name, creatorDone: false, published: false, completedCount: 0, createdAt };
                const run = newRun(post, owner, 'creator', name, createdAt);
                user.activeCreated = post.id;
                await tx.set('posts', post.id, post); await tx.set('runs', run.id, run); await tx.set('users', uid, user);
                return { post: postView(post), run: runView(run) };
            });
        }
        requireValue(/^[a-f0-9]{24}$/.test(id), '合作分享无效');
        if (event.action === 'participants') {
            const post = await store.get('posts', id);
            requireValue(post && post.creator === owner, '只能查看自己发起的合作记录');
            const runs = await store.list('runs', { postId: id, role: 'collaborator' }, cursor, 21);
            return { participants: runs.slice(0, 20).map(run => ({ displayName: run.displayName, status: run.status,
                elapsedMs: run.status === 'complete' ? run.elapsedMs : 0, completedAt: run.completedAt })), next: runs.length > 20 ? runs[19].id : '' };
        }
        return store.transaction(async tx => {
            const post = await tx.get('posts', id);
            requireValue(post, '合作分享不存在');
            const rid = runId(id, owner);
            let run = await readRun(tx, rid);
            const user = await tx.get('users', uid) || blankUser();
            if (event.action === 'detail') return { post: postView(post), run: runView(run), isCreator: post.creator === owner };
            if (event.action === 'publish') {
                requireValue(post.creator === owner && post.creatorDone, '请先拼完自己的半区');
                requireValue(typeof event.published === 'boolean', '广场状态无效');
                post.published = event.published; await tx.set('posts', id, post);
                return { post: postView(post) };
            }
            if (event.action === 'join') {
                requireValue(post.creator !== owner, '不能参与自己发起的另一半');
                requireValue(post.creatorDone, '发起者还未完成自己的半区');
                if (run) return { post: postView(post), run: runView(run) };
                requireValue(!user.activeJoined, '请先完成正在协助的图案');
                run = newRun(post, owner, 'collaborator', name, now());
                user.activeJoined = id;
                await tx.set('runs', rid, run); await tx.set('users', uid, user);
                return { post: postView(post), run: runView(run) };
            }
            requireValue(run && run.owner === owner, '尚未加入这张合作图');
            requireValue(event.action === 'complete', '只支持保存完成结果，请更新游戏');
            requireValue(typeof event.requestId === 'string' && /^[a-f0-9-]{16,80}$/.test(event.requestId), '保存标识无效');
            requireValue(Array.isArray(event.events) && event.events.length > 0 && event.events.length <= 100000
                && JSON.stringify(event.events).length <= 2000000, '完成校验数据过大或为空');
            const digest = hash(JSON.stringify([event.version, event.events]));
            if (run.lastRequestId === event.requestId) {
                requireValue(run.lastDigest === digest, '保存标识重复但内容不同');
                return { run: runView(run), post: postView(post), overview: user };
            }
            if (run.status === 'complete') return { run: runView(run), post: postView(post), overview: user };
            requireValue(run.version === event.version, '完成记录已变化，请重新打开');
            const half = coopHalfLevel(fullLevel(post.levelId), run.role);
            const replay = new PvpHumanReplay(half, COOP_MAX_ELAPSED_MS, true);
            for (const command of event.events) replay.apply(command);
            requireValue(replay.board.isAllLocked(), '尚未完成，不保存中途进度');
            requireValue(replay.lastTime <= Math.max(0, now() - run.createdAt) + 2000, '拼图时钟不一致，请重新打开');
            delete run.checkpoint; delete run.progress; delete run.priorElapsedMs; delete run.attempt;
            run.elapsedMs = replay.completedAt; run.updatedAt = now();
            run.version++; run.lastRequestId = event.requestId; run.lastDigest = digest;
            if (replay.board.isAllLocked()) {
                run.status = 'complete'; run.completedAt = now();
                if (run.role === 'creator') post.creatorDone = true;
                else {
                    requireValue(post.creatorDone, '发起者尚未完成');
                    const key = entries.get(post.levelId).collectionId;
                    user.unlocked[key] = user.unlocked[key] || now();
                    if (user.activeJoined === id) user.activeJoined = null;
                    const creatorUid = userId(post.creator);
                    const creator = await tx.get('users', creatorUid);
                    requireValue(creator, '发起者存档缺失');
                    creator.unlocked[key] = creator.unlocked[key] || now();
                    if (creator.activeCreated === id) creator.activeCreated = null;
                    post.completedCount++;
                    await tx.set('users', creatorUid, creator);
                }
                await tx.set('posts', id, post); await tx.set('users', uid, user);
            }
            await tx.set('runs', rid, run);
            return { run: runView(run), post: postView(post), overview: user };
        });
    };
}
module.exports = { createCoopService, runId, userId };
