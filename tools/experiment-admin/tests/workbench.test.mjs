import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { createWorkbench } from '../server.mjs';
import { results } from '../domain.mjs';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const password = 'test-only-Password-123!';
async function fixture(t) {
    const dir = mkdtempSync(join(tmpdir(), 'pdd-ab-test-')), root = join(dir, 'game');
    mkdirSync(join(root, 'assets/LevelData'), { recursive: true });
    mkdirSync(join(root, 'assets/Scripts/Core'), { recursive: true });
    for (const id of [3, 4]) copyFileSync(join(project, `assets/LevelData/level_${id}.json`), join(root, `assets/LevelData/level_${id}.json`));
    copyFileSync(join(project, 'assets/Scripts/Core/LevelConfig.ts'), join(root, 'assets/Scripts/Core/LevelConfig.ts'));
    const file = join(dir, 'db.sqlite');
    let app = createWorkbench({ root, file }), url = await app.listen(0);
    t.after(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });
    async function request(path, data, cookie = '', expected = 200, extra = {}) {
        const res = await fetch(`${url}/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { Origin: url, 'Content-Type': 'application/json', Cookie: cookie, ...extra }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
        const body = await res.json(); assert.equal(res.status, expected, JSON.stringify(body));
        return { body, cookie: res.headers.get('set-cookie')?.split(';')[0] };
    }
    const setup = await request('setup', { username: 'lead', name: '负责人', password });
    const lead = setup.cookie;
    const intern = (await request('users', { username: 'intern', name: '实习生', password, role: 'intern' }, lead)).body;
    const internCookie = (await request('login', { username: 'intern', password })).cookie;
    const outsider = (await request('users', { username: 'other', name: '另一个实习生', password, role: 'intern' }, lead)).body;
    const outsiderCookie = (await request('login', { username: 'other', password })).cookie;
    return { root, file, request, lead, intern, internCookie, outsider, outsiderCookie, get app() { return app; },
        async restart() { await app.close(); app = createWorkbench({ root, file }); url = await app.listen(0); },
    };
}
async function task(f, overrides = {}) {
    return (await f.request('tasks', { title: '第 3 关容量', brief: '只修改容量并检查 A/B 操作', type: 'parameter', levelId: 3,
        field: 'conveyorCapacity', ownerId: f.intern.id, samplePerGroup: 30, windowHours: 1, minDays: 1, dailyEligible: 1000, maxFailurePercent: 5, ...overrides }, f.lead)).body;
}
async function candidate(f, taskId, overrides = {}) {
    return (await f.request('experiments', { taskId, title: '容量增加', hypothesis: '容量增加可以降低早期退出', candidate: 66, ...overrides }, f.internCookie)).body;
}
async function action(f, exp, action, body = {}, cookie = f.lead, expected = 200) {
    return (await f.request(`experiments/${exp.id}`, { version: exp.version, action, ...body }, cookie, expected)).body;
}
async function approved(f, t) {
    let e = await candidate(f, t.id);
    e = await action(f, e, 'evidence', { checkedA: true, checkedB: true, checkedFailure: true, note: '测试设备与操作记录', reference: '/local/test-record.md' }, f.internCookie);
    e = await action(f, e, 'submit', {}, f.internCookie);
    return action(f, e, 'approve');
}

test('受限试玩入口、真实事件顺序、撤销与候选版本隔离', async t => {
    const f = await fixture(t), job = await task(f);
    let e = await candidate(f, job.id);
    const body = { experimentId: e.id, version: e.version, variant: 'B', gameUrl: 'http://127.0.0.1:7456/' };
    await f.request('previews', body, f.outsiderCookie, 403);
    await f.request('previews', { ...body, gameUrl: 'https://example.com/' }, f.lead, 400);
    const issued = (await f.request('previews', body, f.internCookie)).body;
    const url = new URL(issued.url), token = new URLSearchParams(url.hash.slice(1)).get('pddWorkbenchToken');
    const headers = { Origin: url.origin, Authorization: `Bearer ${token}` };
    const call = (path, data, expected = 200, extra = {}) => f.request(`../preview/${path}`, data, '', expected, { ...headers, ...extra });
    await call('config', {}, 403, { Origin: 'http://localhost:7456' });
    await call('config', {}, 401, { Authorization: '' });
    const config = (await call('config', {})).body;
    assert.equal(config.level.conveyorCapacity, 66);
    assert.equal(config.variant, 'B');
    const event = type => ({ type, eventId: `${issued.id}:${type}`, configHash: config.configHash });
    await call('event', event('complete'), 409);
    await call('event', event('exposure'), 409);
    await call('event', event('loaded'));
    await call('event', event('exposure'));
    await call('event', event('complete'));
    assert.equal((await call('event', event('complete'))).body.duplicate, true);
    assert.equal(f.app.store.read().events.length, 0);
    const state = (await f.request('state', undefined, f.lead)).body;
    assert.equal(state.previews.events.length, 3);
    assert.ok(!JSON.stringify(state.previews).includes(token));
    assert.ok(!JSON.stringify(state.previews).includes('tokenHash'));
    e = await action(f, e, 'edit', { title: e.title, hypothesis: e.hypothesis, candidate: 72 }, f.internCookie);
    await call('config', {}, 409);
    const next = (await f.request('previews', { ...body, version: e.version }, f.internCookie)).body;
    await f.request('previews/revoke', { id: next.id }, f.outsiderCookie, 403);
    await f.request('previews/revoke', { id: next.id }, f.lead);
    const nextToken = new URLSearchParams(new URL(next.url).hash.slice(1)).get('pddWorkbenchToken');
    await call('config', {}, 401, { Authorization: `Bearer ${nextToken}` });
});

test('账号、服务端角色、CSRF、会话撤销与持久化', async t => {
    const f = await fixture(t);
    await f.request('state', undefined, '', 401);
    await f.request('budget', { budget: 100 }, f.internCookie, 403);
    await f.request('budget', { budget: 100 }, f.lead, 403, { Origin: 'https://other.example' });
    await f.request('setup', { username: 'takeover', password }, '', 409);
    await f.request('users', { name: '短密码', username: 'short', password: 'x', role: 'intern' }, f.lead, 400);
    const created = await task(f);
    await f.restart();
    const state = (await f.request('state', undefined, f.lead)).body;
    assert.equal(state.tasks[0].id, created.id);
    assert.ok(!JSON.stringify(state.users).includes('password'));
    assert.equal(state.palette[1], '#ED5090');
    await f.request('users/disable', { id: f.intern.id }, f.lead);
    await f.request('state', undefined, f.internCookie, 401);
    await f.request('login', { username: 'intern', password }, '', 401);
});

test('领取任务并发冲突、编辑归属、证据失效和审阅锁定', async t => {
    const f = await fixture(t), job = await task(f, { ownerId: '' });
    await f.request('tasks/assign', { id: job.id, ownerId: f.intern.id }, f.internCookie);
    await f.request('tasks/assign', { id: job.id, ownerId: f.outsider.id }, f.outsiderCookie, 409);
    let e = await candidate(f, job.id);
    await action(f, e, 'submit', {}, f.internCookie, 400);
    await action(f, e, 'edit', { title: '篡改', hypothesis: '外人', candidate: 72 }, f.outsiderCookie, 403);
    e = await action(f, e, 'evidence', { checkedA: true, checkedB: true, checkedFailure: true, note: '检查通过', reference: 'test.mp4' }, f.internCookie);
    const old = e;
    e = await action(f, e, 'edit', { title: '新候选', hypothesis: '新说明', candidate: 72 }, f.internCookie);
    assert.equal(e.evidence, null);
    await action(f, old, 'submit', {}, f.internCookie, 409);
    e = await action(f, e, 'evidence', { checkedA: true, checkedB: true, checkedFailure: true, note: '再次检查', reference: 'test2.mp4' }, f.internCookie);
    e = await action(f, e, 'submit', {}, f.internCookie);
    await action(f, e, 'approve', {}, f.internCookie, 403);
    await action(f, e, 'edit', { title: '偷改', hypothesis: '新说明', candidate: 80 }, f.lead, 409);
    e = await action(f, e, 'return', { note: '需要补充失败路径证据' });
    assert.equal(e.feedback, '需要补充失败路径证据');
    await action(f, e, 'submit', {}, f.internCookie, 400);
    e = await action(f, e, 'evidence', { checkedA: true, checkedB: true, checkedFailure: true, note: '已补失败路径', reference: 'test3.mp4' }, f.internCookie);
    e = await action(f, e, 'submit', {}, f.internCookie);
    e = await action(f, e, 'approve'); assert.equal(e.status, 'queued');
    assert.ok(e.history.some(h => h.candidate === 66 && h.title === '容量增加'));
});

test('基线冻结检查、参数范围和不支持的模板显性失败', async t => {
    const f = await fixture(t), job = await task(f);
    await f.request('tasks', { type: 'tutorial' }, f.lead, 400);
    await f.request('experiments', { taskId: job.id, title: '错值', hypothesis: '错值', candidate: -1 }, f.internCookie, 400);
    let e = await approved(f, job);
    const path = join(f.root, 'assets/LevelData/level_3.json'), data = JSON.parse(readFileSync(path));
    data.timeLimit += 1; writeFileSync(path, JSON.stringify(data));
    await action(f, e, 'start', { traffic: 10 }, f.lead, 409);
    assert.equal(f.app.store.read().experiments[0].status, 'queued');
});

test('批量审阅逐项返回结果，不把部分失败包装成整批成功', async t => {
    const f = await fixture(t), job = await task(f);
    let first = await candidate(f, job.id), second = await candidate(f, job.id, { candidate: 72 });
    for (const original of [first, second]) {
        let e = await action(f, original, 'evidence', { checkedA: true, checkedB: true, checkedFailure: true, note: '批量验收证据', reference: 'test.md' }, f.internCookie);
        e = await action(f, e, 'submit', {}, f.internCookie);
        if (original.id === first.id) first = e; else second = e;
    }
    const items = [{ id: first.id, version: first.version }, { id: second.id, version: second.version - 1 }];
    await f.request('experiments/batch-approve', { items }, f.internCookie, 403);
    const response = (await f.request('experiments/batch-approve', { items }, f.lead)).body;
    assert.deepEqual(response.items.map(i => i.ok), [true, false]);
    assert.match(response.items[1].error, /已被更新/);
    const state = f.app.store.read();
    assert.equal(state.experiments.find(e => e.id === first.id).status, 'queued');
    assert.equal(state.experiments.find(e => e.id === second.id).status, 'review');
});

test('真实 PNG 校验、重复资源、冻结的背景候选', async t => {
    const f = await fixture(t);
    await f.request('resources', { name: '伪图片', base64: Buffer.from('not png').toString('base64') }, f.internCookie, 400);
    const image = new PNG({ width: 64, height: 64 }); image.data.fill(255);
    const first = { name: '白色', base64: PNG.sync.write(image).toString('base64') };
    const a = (await f.request('resources', first, f.internCookie)).body;
    await f.request('resources', first, f.internCookie, 409);
    image.data[0] = 30;
    const b = (await f.request('resources', { name: '另一张', base64: PNG.sync.write(image).toString('base64') }, f.internCookie)).body;
    const job = await task(f, { type: 'background', field: 'background', controlResourceId: a.id });
    const e = await candidate(f, job.id, { candidate: b.id }); assert.equal(e.candidate, b.id);
    for (const variant of ['A', 'B']) {
        const issued = (await f.request('previews', { experimentId: e.id, version: e.version, variant, gameUrl: 'http://127.0.0.1:7456/' }, f.internCookie)).body;
        const token = new URLSearchParams(new URL(issued.url).hash.slice(1)).get('pddWorkbenchToken');
        const headers = { Origin: 'http://127.0.0.1:7456', Authorization: `Bearer ${token}` };
        const image = (await f.request('../preview/image', {}, '', 200, headers)).body;
        assert.equal(image.id, variant === 'A' ? a.id : b.id);
        assert.deepEqual(Buffer.from(image.base64, 'base64'), Buffer.from(f.app.store.asset(image.id)));
        f.app.store.change(s => { s.previewSessions.find(p => p.id === issued.id).expires = Date.now() - 1; });
        await f.request('../preview/config', {}, '', 401, headers);
    }
    const corrupt = PNG.sync.write(image); corrupt[corrupt.length - 1] ^= 1;
    await f.request('resources', { name: '损坏', base64: corrupt.toString('base64') }, f.lead, 422);
});

test('流量预算、关卡互斥、稳定分流、事件幂等与配置归因', async t => {
    const f = await fixture(t), job = await task(f);
    let e = await approved(f, job), second = await approved(f, job);
    await action(f, e, 'start', { traffic: 40 }, f.lead, 409);
    await f.request('budget', { budget: 100 }, f.lead);
    e = await action(f, e, 'start', { traffic: 100 });
    await action(f, second, 'start', { traffic: 10 }, f.lead, 409);
    const a = (await f.request('validation/assign', { uid: 'stable-user', levelId: 3 }, f.lead)).body;
    const repeat = (await f.request('validation/assign', { uid: 'stable-user', levelId: 3 }, f.lead)).body;
    assert.equal(a.assignmentId, repeat.assignmentId);
    assert.equal(a.level.conveyorCapacity, a.variant === 'A' ? job.baseline.data.conveyorCapacity : 66);
    assert.equal((await f.request('validation/assign', { uid: 'stable-user', levelId: 4 }, f.lead)).body.assigned, false);
    const event = { eventId: 'id-1', assignmentId: a.assignmentId, configHash: a.configHash, type: 'exposure' };
    await f.request('validation/event', { ...event, configHash: 'wrong' }, f.lead, 409);
    await f.request('validation/event', { ...event, type: 'complete' }, f.lead, 409);
    await f.request('validation/event', event, f.lead);
    assert.equal((await f.request('validation/event', event, f.lead)).body.duplicate, true);
    await f.request('validation/event', { ...event, type: 'failure', reason: '模拟错误' }, f.lead, 409);
    await f.request('validation/event', { ...event, eventId: 'id-2', type: 'complete' }, f.lead);
    e = await action(f, e, 'stop');
    assert.equal((await f.request('validation/assign', { uid: 'new-user', levelId: 3 }, f.lead)).body.assigned, false);
    assert.equal((await f.request('validation/assign', { uid: 'stable-user', levelId: 3 }, f.lead)).body.assigned, true);
    await action(f, e, 'finish', {}, f.lead, 409);
    const report = results(f.app.store.read(), e, Date.now() + 7200000);
    assert.equal(report.rows.reduce((n, r) => n + r.completed, 0), 1);
    assert.equal(report.status, '样本积累中');
});

test('护栏自动停止入组，失败用户保留，观察完成后复盘归档', async t => {
    const f = await fixture(t), job = await task(f);
    await f.request('budget', { budget: 100 }, f.lead);
    let e = await action(f, await approved(f, job), 'start', { traffic: 100 });
    const assignments = [];
    for (let i = 0; i < 150; i++) {
        const a = (await f.request('validation/assign', { uid: `guard-user-${i}`, levelId: 3 }, f.lead)).body;
        assignments.push(a);
        const counts = ['A', 'B'].map(v => assignments.filter(a => a.variant === v).length);
        if (Math.min(...counts) >= 20) break;
    }
    const group = assignments.filter(a => a.variant === 'A');
    for (const a of group.slice(0, 2)) await f.request('validation/event', { eventId: `fail-${a.assignmentId}`, assignmentId: a.assignmentId, configHash: a.configHash, type: 'failure', reason: '测试资源错误' }, f.lead);
    let stored = f.app.store.read(); e = stored.experiments[0];
    assert.equal(e.status, 'observing'); assert.ok(e.anomaly);
    assert.equal(results(stored, e).rows.find(r => r.variant === 'A').failed, 2);
    assert.equal(results(stored, e).rows.reduce((n, r) => n + r.assigned, 0), assignments.length);
    f.app.store.change(s => { s.assignments.forEach(a => { a.time -= 7200000; }); });
    e = await action(f, e, 'finish');
    await action(f, e, 'archive', {}, f.lead, 409);
    e = await action(f, e, 'recap', { change: '容量', hypothesis: '改善', finding: '本地失败护栏触发', limits: '仅模拟验证', next: '修复并正式复验' }, f.internCookie);
    e = await action(f, e, 'archive'); assert.equal(e.status, 'archived');
    const exported = (await f.request(`export/${e.id}`, undefined, f.lead)).body;
    assert.equal(exported.productionReady, false); assert.equal(exported.experiment.recap.finding, '本地失败护栏触发');
    await f.request(`export/${e.id}`, undefined, f.internCookie, 403);
});
