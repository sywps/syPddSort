import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest } from './store.mjs';

export class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
export function requireThat(condition, message, status = 400) { if (!condition) throw new ApiError(status, message); }
export function text(value, label, max = 1000) {
    requireThat(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max, `${label}不能为空，且不超过 ${max} 字`);
    return value.trim();
}
export function integer(value, label, min, max) {
    requireThat(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max, `${label}应为 ${min}—${max} 的整数`);
    return value;
}
export const manager = user => requireThat(user.role === 'manager', '仅负责人可以执行此操作', 403);
export function audit(state, user, action, entity, detail = '') {
    state.audit.push({ id: randomUUID(), time: Date.now(), actor: user.name, userId: user.id, action, entity, detail });
}
export function getExperiment(state, id) {
    const exp = state.experiments.find(e => e.id === id);
    requireThat(exp, '实验不存在', 404);
    return exp;
}
export function canEdit(user, exp) { requireThat(user.role === 'manager' || exp.ownerId === user.id, '只能操作自己负责的实验', 403); }
export function checkVersion(exp, body) { requireThat(body.version === exp.version, '内容已被更新，请刷新后重试', 409); }
export function loadLevel(root, levelId) {
    integer(levelId, '关卡', 2, 10000);
    let bytes;
    try { bytes = readFileSync(join(root, 'assets/LevelData', `level_${levelId}.json`)); }
    catch { throw new ApiError(422, '本地关卡文件不可读，不能创建基线'); }
    let data;
    try { data = JSON.parse(bytes); } catch { throw new ApiError(422, '关卡 JSON 无效'); }
    requireThat(data.levelId === levelId && Number.isInteger(data.conveyorCapacity) && Number.isInteger(data.timeLimit), '关卡 ID 或参数无效', 422);
    for (const key of ['correctColorArr', 'initRandomColorArr']) {
        requireThat(Array.isArray(data[key]) && data[key].length === data.boardHeight && data[key].every(row =>
            Array.isArray(row) && row.length === data.boardWidth && row.every(v => Number.isInteger(v) && v >= 0 && v <= 255)), '关卡棋盘数据不完整', 422);
    }
    return { data, hash: digest(bytes) };
}
export function resource(state, id) {
    const item = state.resources.find(r => r.id === id);
    requireThat(item, '请选择已校验的 PNG 资源', 422);
    return item;
}
export function createTask(state, user, body, root) {
    manager(user);
    const type = text(body.type, '模板', 30);
    requireThat(['parameter', 'background'].includes(type), '该模板尚未接入');
    const levelId = integer(body.levelId, '目标关卡', 2, 10000);
    const baseline = loadLevel(root, levelId);
    const field = type === 'parameter' ? text(body.field, '变量', 40) : 'background';
    requireThat(['timeLimit', 'conveyorCapacity', 'background'].includes(field) && (type !== 'parameter' || field !== 'background'), '不支持的参数');
    const ownerId = body.ownerId || '';
    requireThat(!ownerId || state.users.some(u => u.id === ownerId && !u.disabled), '成员不存在');
    const task = { id: randomUUID(), title: text(body.title, '任务名称', 100), brief: text(body.brief, '任务说明'),
        type, levelId, field, baseline, controlResource: type === 'background' ? resource(state, body.controlResourceId).id : null,
        ownerId, createdBy: user.id, createdAt: Date.now(),
        samplePerGroup: integer(body.samplePerGroup, '每组目标样本', 30, 1000000),
        windowHours: integer(body.windowHours, '用户观察窗口（小时）', 1, 168),
        minDays: integer(body.minDays, '最短运行天数', 1, 60),
        dailyEligible: body.dailyEligible === null ? null : integer(body.dailyEligible, '预计每日符合条件用户', 1, 10000000),
        maxFailurePercent: integer(body.maxFailurePercent, '失败率护栏（%）', 1, 30),
        metric: '观察窗口内完成目标关卡的用户比例（含分配后加载失败用户）',
    };
    state.tasks.push(task); audit(state, user, '创建任务', task.id, task.title); return task;
}
export function createExperiment(state, user, body) {
    const task = state.tasks.find(t => t.id === body.taskId);
    requireThat(task, '任务不存在', 404);
    requireThat(task.ownerId === user.id || user.role === 'manager', '请先领取任务或由负责人分派', 403);
    const exp = { id: randomUUID(), taskId: task.id, ownerId: user.id, version: 1, status: 'draft', createdAt: Date.now(),
        baseline: structuredClone(task.baseline), title: text(body.title, '实验名称', 100), hypothesis: text(body.hypothesis, '假设'),
        candidate: validateCandidate(state, task, body.candidate), evidence: null, feedback: '', traffic: 0, slots: [], recap: null };
    state.experiments.push(exp); audit(state, user, '创建实验', exp.id, exp.title); return exp;
}
function validateCandidate(state, task, candidate) {
    if (task.type === 'background') {
        const id = resource(state, candidate).id;
        requireThat(id !== task.controlResource, 'B 组必须与 A 组资源不同');
        return id;
    }
    integer(candidate, 'B 组参数', task.field === 'timeLimit' ? 30 : 12, task.field === 'timeLimit' ? 1800 : 300);
    requireThat(candidate !== task.baseline.data[task.field], 'B 组必须与 A 组参数不同');
    return candidate;
}
export function assertBaseline(task, root) {
    requireThat(loadLevel(root, task.levelId).hash === task.baseline.hash, '基线关卡已变化：请创建新任务重新冻结基线，此实验不能发布', 409);
}
export function experimentAction(state, user, id, body, root) {
    const exp = getExperiment(state, id), task = state.tasks.find(t => t.id === exp.taskId);
    checkVersion(exp, body);
    const previous = { version: exp.version, status: exp.status, title: exp.title, hypothesis: exp.hypothesis, candidate: exp.candidate,
        evidence: exp.evidence, feedback: exp.feedback, recap: exp.recap, savedAt: Date.now(), actor: user.name };
    const action = body.action;
    if (['edit', 'evidence', 'submit', 'recap', 'anomaly'].includes(action)) canEdit(user, exp); else manager(user);
    if (action === 'edit') {
        requireThat(['draft', 'returned'].includes(exp.status), '已提交的实验不能编辑', 409);
        exp.title = text(body.title, '实验名称', 100); exp.hypothesis = text(body.hypothesis, '假设');
        exp.candidate = validateCandidate(state, task, body.candidate); exp.evidence = null;
    } else if (action === 'evidence') {
        requireThat(['draft', 'returned'].includes(exp.status), '此状态不能更新自测', 409);
        requireThat(body.checkedA === true && body.checkedB === true && body.checkedFailure === true, '请完成 A/B 展示和失败路径检查');
        exp.evidence = { note: text(body.note, '自测记录'), reference: text(body.reference, '测试证据位置', 500), tester: user.name, time: Date.now() };
    } else if (action === 'submit') {
        requireThat(['draft', 'returned'].includes(exp.status), '仅草稿或退回状态可提交', 409);
        requireThat(exp.evidence, '请先记录 A/B 自测证据'); assertBaseline(task, root); exp.status = 'review'; exp.feedback = '';
    } else if (action === 'approve' || action === 'return') {
        requireThat(exp.status === 'review', '仅待审阅实验可审批', 409);
        if (action === 'approve') { assertBaseline(task, root); exp.status = 'queued'; }
        else { exp.feedback = text(body.note, '退回原因'); exp.evidence = null; exp.status = 'returned'; }
    } else if (action === 'start') {
        requireThat(exp.status === 'queued', '仅待排期实验可启动', 409); assertBaseline(task, root);
        const traffic = integer(body.traffic, '覆盖流量（%）', 1, 100);
        const active = state.experiments.filter(e => ['running', 'observing'].includes(e.status));
        requireThat(!active.some(e => { const t = state.tasks.find(t => t.id === e.taskId); return t.levelId === task.levelId; }), '目标关卡已有运行或观察中的实验，请排队', 409);
        const used = new Set(active.flatMap(e => e.slots));
        requireThat(used.size + traffic <= state.budget, '超过团队实验流量预算', 409);
        exp.slots = Array.from({ length: 100 }, (_, i) => i).filter(i => !used.has(i)).slice(0, traffic);
        exp.traffic = traffic; exp.status = 'running'; exp.startedAt = Date.now();
        exp.configHash = digest(JSON.stringify({ task, candidate: exp.candidate }));
    } else if (action === 'stop') {
        requireThat(exp.status === 'running', '实验未在运行', 409); exp.status = 'observing'; exp.stoppedAt = Date.now();
    } else if (action === 'terminate') {
        requireThat(['running', 'observing'].includes(exp.status), '仅运行或观察中的实验可终止', 409);
        exp.status = 'terminated'; exp.terminationReason = text(body.note, '终止原因'); exp.stoppedAt = Date.now();
    } else if (action === 'finish') {
        requireThat(['observing', 'terminated'].includes(exp.status), '先停止入组，再等待观察完成', 409);
        const last = state.assignments.filter(a => a.experimentId === id).reduce((latest, a) => Math.max(latest, a.time), 0);
        requireThat(!last || Date.now() >= last + task.windowHours * 3600000, '最后入组用户的观察窗口尚未结束', 409);
        exp.status = 'recap';
    } else if (action === 'recap') {
        requireThat(exp.status === 'recap', '实验尚未进入复盘', 409);
        exp.recap = Object.fromEntries(['change', 'hypothesis', 'finding', 'limits', 'next'].map(key => [key, text(body[key], '复盘内容', 2000)]));
        exp.recap.author = user.name; exp.recap.time = Date.now();
    } else if (action === 'archive') {
        requireThat(exp.status === 'recap' && exp.recap, '先完成复盘', 409); exp.status = 'archived'; exp.archivedAt = Date.now();
    } else if (action === 'anomaly') {
        exp.anomaly = { note: text(body.note, '异常说明'), time: Date.now(), reporter: user.name };
    } else throw new ApiError(400, '未知操作');
    exp.history ||= []; exp.history.push(previous);
    exp.version++; audit(state, user, action, id, body.note || exp.title); return exp;
}

export function results(state, exp, now = Date.now()) {
    const task = state.tasks.find(t => t.id === exp.taskId), rows = [];
    for (const variant of ['A', 'B']) {
        const users = state.assignments.filter(a => a.experimentId === exp.id && a.variant === variant);
        const row = { variant, assigned: users.length, exposed: 0, failed: 0, completed: 0, mature: 0 };
        for (const a of users) {
            const events = state.events.filter(e => e.assignmentId === a.id);
            row.exposed += Number(events.some(e => e.type === 'exposure'));
            row.failed += Number(events.some(e => e.type === 'failure'));
            const matured = a.time + task.windowHours * 3600000 <= now;
            row.mature += Number(matured);
            row.completed += Number(matured && events.some(e => e.type === 'complete'));
        }
        row.rate = row.mature ? row.completed / row.mature : null; rows.push(row);
    }
    const [a, b] = rows;
    const sampleReady = rows.every(r => r.mature >= task.samplePerGroup);
    const durationReady = !!exp.startedAt && (exp.stoppedAt || now) - exp.startedAt >= task.minDays * 86400000;
    const balanced = a.assigned + b.assigned >= 20 ? (a.assigned - b.assigned) ** 2 / (a.assigned + b.assigned) <= 10.83 : true;
    const failed = rows.some(r => r.assigned >= 20 && r.failed / r.assigned * 100 > task.maxFailurePercent);
    const delta = a.rate === null || b.rate === null ? null : b.rate - a.rate;
    const z = 1.96;
    const interval = r => {
        const n = r.mature, p = r.rate, d = 1 + z * z / n;
        const center = (p + z * z / (2 * n)) / d;
        const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
        return [center - half, center + half];
    };
    let ci = null;
    if (delta !== null) {
        const ai = interval(a), bi = interval(b);
        ci = [delta - Math.hypot(b.rate - bi[0], ai[1] - a.rate), delta + Math.hypot(bi[1] - b.rate, a.rate - ai[0])];
    }
    let status = !balanced || failed ? '数据或护栏异常' : !sampleReady ? '样本积累中' : !durationReady ? '最短运行周期未满足' : '未发现明确差异';
    if (balanced && !failed && sampleReady && durationReady && ci) status = ci[0] > 0 ? '本地验证正向，需正式复验' : ci[1] < 0 ? '本地验证负向' : status;
    if (exp.terminationReason) status = '异常终止，不判定胜出';
    return { rows, delta, ci, status, sampleReady, durationReady, balanced, failed, environment: 'local-validation', cutoff: now };
}
