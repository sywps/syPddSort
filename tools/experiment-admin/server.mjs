import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import { openStore, passwordHash, passwordMatches, digest } from './store.mjs';
import { ApiError, requireThat, text, integer, manager, audit, createTask, createExperiment, experimentAction, getExperiment, results } from './domain.mjs';
import { assign, recordEvent } from './runtime.mjs';
import { issuePreview, previewSession, previewConfig, previewEvent, publicPreviewState, localGameUrl } from './preview.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const defaults = { root: resolve(here, '../..'), file: resolve(here, '../../local/experiment-admin/workbench.sqlite') };
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const publicFiles = { '/': 'index.html', '/app.js': 'app.js', '/views.js': 'views.js', '/style.css': 'style.css' };
const safeUser = ({ password, ...user }) => user;
function checkedPassword(value) {
    requireThat(typeof value === 'string' && value.length >= 12 && value.length <= 128, '密码需要 12—128 个字符');
    return passwordHash(value);
}
function loadPalette(root) {
    const source = readFileSync(join(root, 'assets/Scripts/Core/LevelConfig.ts'), 'utf8');
    const block = /export const COLOR_HEX:[^=]+\s*=\s*\{([^}]+)\}/.exec(source)?.[1];
    requireThat(block, '关卡调色板不可读', 500);
    const entries = [...block.matchAll(/(\d+)\s*:\s*['"](#[a-fA-F0-9]{6})['"]/g)];
    requireThat(entries.length > 0, '关卡调色板无效', 500);
    return Object.fromEntries(entries.map(m => [m[1], m[2]]));
}

function validatePng(body) {
    const name = text(body.name, '资源名称', 100);
    requireThat(typeof body.base64 === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(body.base64), '无效的图片内容');
    const bytes = Buffer.from(body.base64, 'base64');
    requireThat(bytes.length >= 24 && bytes.length <= 4 * 1024 * 1024, 'PNG 文件必须小于 4 MB');
    requireThat(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), '首版仅接受真实 PNG 图片');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    requireThat(width >= 64 && height >= 64 && width <= 2048 && height <= 4096 && width * height <= 8388608, '尺寸需在 64×64 至 2048×4096 范围内');
    try { PNG.sync.read(bytes, { checkCRC: true }); } catch { throw new ApiError(422, 'PNG 解码失败或校验损坏'); }
    return { bytes, name, width, height };
}

export function createWorkbench(options = {}) {
    const config = { ...defaults, ...options }, store = openStore(config.file), attempts = new Map();
    let origin;
    function response(res, status, data, extra = {}) {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
        res.end(JSON.stringify(data));
    }
    async function bodyOf(req) {
        requireThat(req.headers['content-type']?.split(';')[0] === 'application/json', '需要 application/json', 415);
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; requireThat(size <= 6 * 1024 * 1024, '请求超过 6 MB', 413); chunks.push(chunk); }
        try { const body = JSON.parse(Buffer.concat(chunks).toString()); requireThat(body && !Array.isArray(body) && typeof body === 'object', '需要 JSON 对象'); return body; }
        catch (e) { if (e.status) throw e; throw new ApiError(400, 'JSON 解析失败'); }
    }
    const server = createServer(async (req, res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        try {
            requireThat(req.headers.host === new URL(origin).host, 'Host 不被允许', 403);
            const requestUrl = new URL(req.url, origin);
            if (requestUrl.pathname.startsWith('/preview/')) {
                const gameOrigin = req.headers.origin;
                localGameUrl(`${gameOrigin}/`);
                res.setHeader('Access-Control-Allow-Origin', gameOrigin);
                res.setHeader('Vary', 'Origin');
                res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
                res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
                if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
                requireThat(req.method === 'POST', '试玩接口只接受 POST', 405);
                const previewToken = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
                const body = await bodyOf(req);
                const result = store.change(state => {
                    const session = previewSession(state, previewToken, gameOrigin);
                    if (requestUrl.pathname === '/preview/config') return previewConfig(state, session);
                    if (requestUrl.pathname === '/preview/event') return previewEvent(state, session, body);
                    if (requestUrl.pathname === '/preview/image') {
                        const config = previewConfig(state, session);
                        requireThat(config.background, '该试玩没有背景资源', 404);
                        const bytes = store.asset(config.background.id); requireThat(bytes, '试玩图片丢失', 422);
                        return { id: config.background.id, base64: Buffer.from(bytes).toString('base64') };
                    }
                    throw new ApiError(404, '试玩接口不存在');
                });
                response(res, 200, result); return;
            }
            if (!['GET', 'HEAD'].includes(req.method)) requireThat(req.headers.origin === origin, '请求来源不被允许', 403);
            const url = new URL(req.url, origin), path = url.pathname;
            if (publicFiles[path] && req.method === 'GET') {
                const file = publicFiles[path], ext = file.slice(file.lastIndexOf('.'));
                res.writeHead(200, { 'Content-Type': types[ext], 'Cache-Control': 'no-store' }); res.end(readFileSync(join(here, 'public', file))); return;
            }
            if (path === '/api/auth' && req.method === 'GET') {
                const token = /(?:^|; )pdd_workbench=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1] || '';
                const user = store.userForSession(token);
                response(res, 200, { setup: store.read().users.length === 0, user: user ? safeUser(user) : null }); return;
            }
            if (['/api/setup', '/api/login'].includes(path) && req.method === 'POST') {
                const body = await bodyOf(req), key = req.socket.remoteAddress;
                const throttle = attempts.get(key) || { count: 0, until: Date.now() + 600000 };
                if (Date.now() > throttle.until) { throttle.count = 0; throttle.until = Date.now() + 600000; }
                requireThat(throttle.count < 10, '登录尝试过多，请 10 分钟后重试', 429);
                throttle.count++; attempts.set(key, throttle);
                let user;
                if (path === '/api/setup') {
                    requireThat(store.read().users.length === 0, '工作台已初始化', 409);
                    const hash = checkedPassword(body.password);
                    user = store.change(state => {
                        requireThat(state.users.length === 0, '工作台已初始化', 409);
                        const u = { id: randomUUID(), name: text(body.name, '姓名', 40), username: text(body.username, '账号', 60), role: 'manager', password: hash, disabled: false };
                        state.users.push(u); audit(state, u, '初始化工作台', u.id); return u;
                    });
                } else {
                    user = store.read().users.find(u => u.username === body.username && !u.disabled);
                    requireThat(user && passwordMatches(body.password, user.password), '账号或密码错误', 401);
                }
                attempts.delete(key);
                response(res, 200, { user: safeUser(user) }, { 'Set-Cookie': `pdd_workbench=${store.session(user.id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${origin.startsWith('https:') ? '; Secure' : ''}` }); return;
            }
            const token = /(?:^|; )pdd_workbench=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1] || '';
            const user = store.userForSession(token);
            requireThat(user, '请先登录', 401);
            if (path === '/api/state' && req.method === 'GET') {
                const state = store.read();
                response(res, 200, { user: safeUser(user), users: state.users.map(safeUser), tasks: state.tasks, experiments: state.experiments,
                    resources: state.resources, budget: state.budget, audit: user.role === 'manager' ? state.audit : state.audit.filter(a => a.userId === user.id),
                    results: Object.fromEntries(state.experiments.map(e => [e.id, results(state, e)])), previews: publicPreviewState(state), palette: loadPalette(config.root), environment: 'local-validation', productionConnected: false }); return;
            }
            if (path.startsWith('/api/resources/') && req.method === 'GET') {
                const id = path.split('/')[3], bytes = store.asset(id);
                requireThat(bytes, '资源不存在', 404);
                res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' }); res.end(Buffer.from(bytes)); return;
            }
            if (path.startsWith('/api/export/') && req.method === 'GET') {
                manager(user); const state = store.read(), exp = getExperiment(state, path.split('/')[3]);
                const task = state.tasks.find(t => t.id === exp.taskId);
                const previews = publicPreviewState(state);
                response(res, 200, { schemaVersion: 1, environment: 'local-validation', productionReady: false, experiment: exp, task, result: results(state, exp),
                    previews: { sessions: previews.sessions.filter(s => s.experimentId === exp.id), events: previews.events.filter(e => e.experimentId === exp.id) } },
                    { 'Content-Disposition': `attachment; filename="experiment-${exp.id}.json"` }); return;
            }
            requireThat(req.method === 'POST', '接口不存在', 404);
            const body = await bodyOf(req);
            if (path === '/api/logout') {
                store.logout(token); response(res, 200, { ok: true }, { 'Set-Cookie': 'pdd_workbench=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); return;
            }
            if (path === '/api/password') {
                requireThat(passwordMatches(body.current, user.password), '当前密码错误', 403);
                const hash = checkedPassword(body.password);
                store.change(state => { state.users.find(u => u.id === user.id).password = hash; audit(state, user, '修改密码', user.id); });
                store.revoke(user.id); response(res, 200, { ok: true }); return;
            }
            let result;
            if (path === '/api/previews') {
                result = store.change(state => issuePreview(state, user, body, config.root, origin));
            } else if (path === '/api/previews/revoke') {
                result = store.change(state => {
                    const session = (state.previewSessions || []).find(s => s.id === body.id);
                    requireThat(session, '试玩会话不存在', 404);
                    requireThat(user.role === 'manager' || session.issuerId === user.id, '只能撤销自己签发的入口', 403);
                    session.revoked = true; audit(state, user, '撤销试玩入口', session.experimentId, session.id); return { ok: true };
                });
            } else if (path === '/api/users') {
                manager(user); const hash = checkedPassword(body.password);
                result = store.change(state => {
                    const username = text(body.username, '账号', 60); requireThat(!state.users.some(u => u.username === username), '账号已存在', 409);
                    requireThat(['intern', 'manager'].includes(body.role), '无效角色');
                    const u = { id: randomUUID(), username, name: text(body.name, '姓名', 40), role: body.role, password: hash, disabled: false };
                    state.users.push(u); audit(state, user, '创建成员', u.id, u.name); return safeUser(u);
                });
            } else if (path === '/api/users/disable') {
                manager(user); requireThat(body.id !== user.id, '不能禁用当前账号');
                result = store.change(state => { const u = state.users.find(u => u.id === body.id); requireThat(u, '成员不存在', 404); u.disabled = true; audit(state, user, '禁用成员', u.id, u.name); return { ok: true }; });
                store.revoke(body.id);
            } else if (path === '/api/tasks') {
                result = store.change(state => createTask(state, user, body, config.root));
            } else if (path === '/api/tasks/assign') {
                result = store.change(state => {
                    const task = state.tasks.find(t => t.id === body.id); requireThat(task, '任务不存在', 404);
                    if (user.role !== 'manager') requireThat(!task.ownerId && body.ownerId === user.id, '任务已被领取或不允许分派', 409);
                    requireThat(state.users.some(u => u.id === body.ownerId && !u.disabled), '成员不存在');
                    task.ownerId = body.ownerId; audit(state, user, '分派或领取任务', task.id, body.ownerId); return task;
                });
            } else if (path === '/api/resources') {
                const item = validatePng(body);
                result = store.change(state => {
                    const id = digest(item.bytes); requireThat(!state.resources.some(r => r.id === id), '相同图片已在资源库中，请复用', 409);
                    store.putAsset(id, item.bytes);
                    const resource = { id, name: item.name, width: item.width, height: item.height, size: item.bytes.length, ownerId: user.id, createdAt: Date.now() };
                    state.resources.push(resource); audit(state, user, '上传资源候选', id, item.name); return resource;
                });
            } else if (path === '/api/experiments') {
                result = store.change(state => createExperiment(state, user, body));
            } else if (path === '/api/experiments/batch-approve') {
                manager(user);
                requireThat(Array.isArray(body.items) && body.items.length > 0 && body.items.length <= 50, '每批请选择 1—50 个实验');
                requireThat(body.items.every(item => item && typeof item.id === 'string' && Number.isInteger(item.version)), '批量审阅参数无效');
                result = { items: body.items.map(item => {
                    try {
                        const exp = store.change(state => experimentAction(state, user, item.id, { action: 'approve', version: item.version }, config.root));
                        return { id: item.id, ok: true, status: exp.status };
                    } catch (error) { return { id: item.id, ok: false, error: error.status ? error.message : '保存失败，请检查服务日志' }; }
                }) };
            } else if (/^\/api\/experiments\/[^/]+$/.test(path)) {
                result = store.change(state => experimentAction(state, user, path.split('/')[3], body, config.root));
            } else if (path === '/api/budget') {
                manager(user); const budget = integer(body.budget, '流量预算', 1, 100);
                result = store.change(state => {
                    const used = state.experiments.filter(e => ['running', 'observing'].includes(e.status)).reduce((n, e) => n + e.traffic, 0);
                    requireThat(budget >= used, '预算不能低于当前占用流量', 409); state.budget = budget; audit(state, user, '修改流量预算', 'team', `${budget}%`); return { budget };
                });
            } else if (path === '/api/validation/assign' || path === '/api/validation/event') {
                manager(user);
                result = store.change(state => path.endsWith('/assign') ? assign(state, body) : recordEvent(state, body));
            } else throw new ApiError(404, '接口不存在');
            response(res, 200, result);
        } catch (error) {
            if (!error.status) console.error('[experiment-admin]', error.message);
            response(res, error.status || 500, { error: error.status ? error.message : '服务端操作失败，未保存。请检查服务日志。' });
        }
    });
    server.requestTimeout = 15000;
    return {
        store, server,
        async listen(port = 4318) {
            if (config.publicOrigin) {
                const publicUrl = new URL(config.publicOrigin);
                requireThat(publicUrl.protocol === 'https:' && publicUrl.pathname === '/' && !publicUrl.search && !publicUrl.hash && !publicUrl.username, '共享访问地址必须是 HTTPS origin');
                requireThat(store.read().users.length > 0, '请先通过本机地址初始化负责人，再配置共享访问地址');
            }
            await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
            origin = config.publicOrigin ? new URL(config.publicOrigin).origin : `http://127.0.0.1:${server.address().port}`; return origin;
        },
        async close() { await new Promise(resolve => server.close(resolve)); store.close(); },
    };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const app = createWorkbench({ file: process.env.PDD_AB_DB || defaults.file, publicOrigin: process.env.PDD_AB_ORIGIN });
    const url = await app.listen(Number(process.env.PDD_AB_PORT || 4318));
    console.log(`游戏实验工作台：${url}\n仅本地验证环境；首次打开创建负责人账号。数据库：${process.env.PDD_AB_DB || defaults.file}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
