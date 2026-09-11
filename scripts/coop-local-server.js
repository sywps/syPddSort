'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createCoopService } = require('../cloudfunctions/coopService/core');
const { COOP_RULES_VERSION } = require('../cloudfunctions/coopService/runtime/CoopModeConfig');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function createLocalStore(file) {
    let data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { users: {}, posts: {}, runs: {} };
    if (!data.users || !data.posts || !data.runs) throw new Error('本地合作数据格式错误');
    let queue = Promise.resolve();
    const reader = state => ({
        get: async (kind, id) => clone(state[kind][id] || null),
        list: async (kind, filter, cursor, limit) => Object.entries(state[kind])
            .filter(([id, value]) => id > cursor && Object.entries(filter).every(([key, wanted]) => value[key] === wanted))
            .sort(([a], [b]) => a.localeCompare(b)).slice(0, limit).map(([, value]) => clone(value)),
    });
    return {
        get: (kind, id) => reader(data).get(kind, id),
        list: (...args) => reader(data).list(...args),
        transaction(operation) {
            const result = queue.then(async () => {
                const draft = clone(data);
                let changed = false;
                const result = await operation({ ...reader(draft), set: async (kind, id, value) => { draft[kind][id] = clone(value); changed = true; } });
                if (changed) {
                    fs.mkdirSync(path.dirname(file), { recursive: true });
                    fs.writeFileSync(file + '.tmp', JSON.stringify(draft));
                    fs.renameSync(file + '.tmp', file);
                    data = draft;
                }
                return result;
            });
            queue = result.catch(() => {});
            return result;
        },
    };
}

function createLocalServer({ file, now = Date.now }) {
    const execute = createCoopService(createLocalStore(file), now);
    return http.createServer(async (req, res) => {
        const respond = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
        const host = String(req.headers.host || '');
        if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return respond(403, { ok: false, errorMessage: '仅允许本机访问' });
        const origin = req.headers.origin;
        if (origin) {
            if (!/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) return respond(403, { ok: false, errorMessage: '仅支持本地浏览器预览' });
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Private-Network', 'true');
        }
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (req.method === 'GET' && req.url === '/health') return respond(200, { ok: true, mode: 'local-coop', rulesVersion: COOP_RULES_VERSION });
        if (req.method !== 'POST' || req.url !== '/coop') return respond(404, { ok: false, errorMessage: '接口不存在' });
        try {
            let bytes = 0;
            const chunks = [];
            for await (const chunk of req) {
                bytes += chunk.length;
                if (bytes > 2100000) throw new Error('完成校验数据过大');
                chunks.push(chunk);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!['A', 'B', 'C'].includes(body.player)) throw new Error('模拟玩家只能是 A、B、C');
            const result = await execute(`local-player-${body.player}`, { ...body.event, displayName: `模拟玩家 ${body.player}` });
            respond(200, { ok: true, ...result });
        } catch (error) { respond(400, { ok: false, errorMessage: error.message }); }
    });
}

if (require.main === module) {
    const file = path.resolve(__dirname, '../local/coop-simulator/state.json');
    const server = createLocalServer({ file });
    server.on('error', error => { console.error('[coop-local]', error.message); process.exitCode = 1; });
    server.listen(7559, '127.0.0.1', () => console.log(`本地合作服务 http://127.0.0.1:7559 · ${COOP_RULES_VERSION}\n模拟玩家 A/B/C，数据文件 ${file}\n打开 Cocos 本地浏览器预览 → 像素拼图 → 双人合作`));
}
module.exports = { createLocalServer };
