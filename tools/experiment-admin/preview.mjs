import { randomBytes, randomUUID } from 'node:crypto';
import { digest } from './store.mjs';
import { requireThat, getExperiment, canEdit, checkVersion, assertBaseline, audit, text } from './domain.mjs';

export function localGameUrl(value) {
    let url;
    try { url = new URL(value); } catch { requireThat(false, '试玩地址无效'); }
    requireThat(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash,
        '试玩地址仅支持本机 Cocos HTTP 根地址，例如 http://127.0.0.1:7456/');
    return url;
}
function configFor(state, exp, variant) {
    const task = state.tasks.find(t => t.id === exp.taskId), level = structuredClone(exp.baseline.data);
    if (task.type === 'parameter' && variant === 'B') level[task.field] = exp.candidate;
    const backgroundId = task.type === 'background' ? (variant === 'A' ? task.controlResource : exp.candidate) : null;
    const background = backgroundId ? state.resources.find(r => r.id === backgroundId) : null;
    requireThat(!backgroundId || background, '试玩图片不存在', 422);
    const config = { experimentId: exp.id, variant, level, background: background ? { id: background.id, width: background.width, height: background.height } : null };
    return { ...config, configHash: digest(JSON.stringify(config)) };
}
export function issuePreview(state, user, body, root, adminOrigin) {
    const exp = getExperiment(state, body.experimentId);
    canEdit(user, exp); checkVersion(exp, body);
    requireThat(!['terminated', 'archived'].includes(exp.status), '该实验已结束，不再签发试玩入口', 409);
    const task = state.tasks.find(t => t.id === exp.taskId); assertBaseline(task, root);
    requireThat(body.variant === 'A' || body.variant === 'B', '选择 A 或 B 组');
    const url = localGameUrl(text(body.gameUrl, 'Cocos 预览地址', 200));
    const config = configFor(state, exp, body.variant), token = randomBytes(32).toString('hex');
    state.previewSessions ||= [];
    requireThat(state.previewSessions.filter(s => s.experimentId === exp.id && s.expires > Date.now() && !s.revoked).length < 20, '有效试玩链接已达 20 个，请先撤销旧链接');
    const session = { id: randomUUID(), tokenHash: digest(token), experimentId: exp.id, variant: body.variant, configHash: config.configHash,
        origin: url.origin, issuerId: user.id, issuerName: user.name, createdAt: Date.now(), expires: Date.now() + 3600000, revoked: false };
    state.previewSessions.push(session); audit(state, user, '签发试玩入口', exp.id, `${body.variant} 组，有效期 1 小时`);
    url.searchParams.set('level', String(task.levelId));
    url.hash = new URLSearchParams({ pddWorkbenchOrigin: adminOrigin, pddWorkbenchToken: token }).toString();
    return { id: session.id, url: url.href, expires: session.expires, variant: body.variant };
}
export function previewSession(state, token, requestOrigin) {
    requireThat(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), '试玩凭据缺失', 401);
    const session = (state.previewSessions || []).find(s => s.tokenHash === digest(token));
    requireThat(session && !session.revoked && session.expires > Date.now(), '试玩入口已过期或撤销，请重新生成', 401);
    requireThat(session.origin === requestOrigin, '试玩来源与签发地址不一致', 403);
    requireThat(state.users.some(u => u.id === session.issuerId && !u.disabled), '签发成员已被禁用', 403);
    const exp = getExperiment(state, session.experimentId);
    requireThat(!['terminated', 'archived'].includes(exp.status), '实验已结束，试玩已停止', 409);
    requireThat(configFor(state, exp, session.variant).configHash === session.configHash, '候选内容已经变化，请重新生成试玩入口', 409);
    return session;
}
export function previewConfig(state, session) {
    return { schemaVersion: 1, source: 'client-preview', sessionId: session.id, expires: session.expires,
        ...configFor(state, getExperiment(state, session.experimentId), session.variant) };
}
export function previewEvent(state, session, body) {
    requireThat(body.configHash === session.configHash, '试玩事件的配置版本不一致', 409);
    const eventId = text(body.eventId, '事件 ID', 150), type = text(body.type, '事件类型', 30);
    requireThat(['loaded', 'exposure', 'complete', 'failure'].includes(type), '不支持的试玩事件');
    const reason = type === 'failure' ? text(body.reason, '失败说明', 500) : '';
    state.previewEvents ||= [];
    const events = state.previewEvents.filter(e => e.sessionId === session.id), prior = events.find(e => e.eventId === eventId);
    if (prior) { requireThat(prior.type === type && prior.reason === reason, '重复事件 ID 内容冲突', 409); return { duplicate: true }; }
    requireThat(!events.some(e => e.type === type), '同一试玩会话请复用已发事件 ID', 409);
    if (type === 'exposure') requireThat(events.some(e => e.type === 'loaded'), '尚未确认配置加载', 409);
    if (type === 'complete') requireThat(events.some(e => e.type === 'exposure'), '尚未确认真实展示', 409);
    state.previewEvents.push({ sessionId: session.id, experimentId: session.experimentId, variant: session.variant,
        configHash: session.configHash, eventId, type, reason, time: Date.now() });
    return { accepted: true };
}
export function publicPreviewState(state) {
    return { sessions: (state.previewSessions || []).map(({ tokenHash, ...s }) => s), events: state.previewEvents || [] };
}
