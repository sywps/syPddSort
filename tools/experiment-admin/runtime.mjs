import { randomUUID } from 'node:crypto';
import { digest } from './store.mjs';
import { requireThat, text, integer, results, audit } from './domain.mjs';

const slot = value => parseInt(digest(value).slice(0, 8), 16) % 100;
const system = { id: 'runtime', name: '验证环境护栏' };

export function assign(state, body) {
    const uid = digest(text(body.uid, '验证用户 ID', 128));
    const levelId = integer(body.levelId, '目标关卡', 2, 10000);
    const prior = state.assignments.find(a => a.uid === uid);
    if (prior) {
        const exp = state.experiments.find(e => e.id === prior.experimentId);
        const task = state.tasks.find(t => t.id === exp.taskId);
        if (!['running', 'observing'].includes(exp.status) || task.levelId !== levelId) return { assigned: false, reason: '用户已参与其他实验或原实验已结束' };
        return assignmentResponse(state, prior);
    }
    const trafficSlot = slot(`traffic:v1:${uid}`);
    const exp = state.experiments.find(e => e.status === 'running' && e.slots.includes(trafficSlot) && state.tasks.find(t => t.id === e.taskId).levelId === levelId);
    if (!exp) return { assigned: false, reason: '未命中此关卡的可用实验流量' };
    const assignment = { id: randomUUID(), uid, experimentId: exp.id, variant: slot(`variant:v1:${exp.id}:${uid}`) < 50 ? 'A' : 'B', time: Date.now(), configHash: exp.configHash };
    state.assignments.push(assignment);
    return assignmentResponse(state, assignment);
}

export function assignmentResponse(state, assignment) {
    const exp = state.experiments.find(e => e.id === assignment.experimentId);
    const task = state.tasks.find(t => t.id === exp.taskId);
    const level = structuredClone(exp.baseline.data);
    if (task.type === 'parameter' && assignment.variant === 'B') level[task.field] = exp.candidate;
    return { assigned: true, assignmentId: assignment.id, experimentId: exp.id, variant: assignment.variant,
        environment: 'local-validation', configHash: assignment.configHash, level,
        backgroundResourceId: task.type === 'background' ? (assignment.variant === 'B' ? exp.candidate : task.controlResource) : null };
}

export function recordEvent(state, body) {
    const eventId = text(body.eventId, '幂等事件 ID', 128), type = text(body.type, '事件类型', 20);
    requireThat(['exposure', 'failure', 'complete'].includes(type), '不支持的事件类型');
    const assignment = state.assignments.find(a => a.id === body.assignmentId);
    requireThat(assignment, '分配不存在', 404);
    requireThat(body.configHash === assignment.configHash, '事件配置版本不匹配', 409);
    const fingerprint = digest(JSON.stringify([body.assignmentId, body.configHash, type, body.reason || '']));
    const old = state.events.find(e => e.eventId === eventId);
    if (old) { requireThat(old.fingerprint === fingerprint, '重复事件 ID 内容冲突', 409); return { duplicate: true }; }
    const exp = state.experiments.find(e => e.id === assignment.experimentId);
    const task = state.tasks.find(t => t.id === exp.taskId);
    requireThat(['running', 'observing', 'terminated'].includes(exp.status), '实验已结束采集', 409);
    requireThat(Date.now() <= assignment.time + task.windowHours * 3600000, '事件超出用户观察窗口', 409);
    requireThat(type !== 'exposure' || exp.status !== 'terminated', '实验已终止，不允许新增曝光', 409);
    const prior = state.events.filter(e => e.assignmentId === assignment.id);
    requireThat(type !== 'complete' || prior.some(e => e.type === 'exposure'), '完成事件之前缺少实际曝光', 409);
    requireThat(!prior.some(e => e.type === type), '该用户已经上报同类型事件，请复用原事件 ID', 409);
    const reason = type === 'failure' ? text(body.reason, '失败原因', 500) : '';
    state.events.push({ eventId, fingerprint, assignmentId: assignment.id, type, reason, time: Date.now() });
    const report = results(state, exp);
    if (exp.status === 'running' && (report.failed || !report.balanced)) {
        exp.status = 'observing'; exp.stoppedAt = Date.now(); exp.version++;
        exp.anomaly = { note: report.failed ? '失败率超过预设护栏，已停止新增入组' : '分组比例异常，已停止新增入组', time: Date.now(), reporter: system.name };
        audit(state, system, '护栏停止入组', exp.id, exp.anomaly.note);
    }
    return { accepted: true };
}
