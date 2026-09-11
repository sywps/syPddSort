'use strict';
const cloud = require('wx-server-sdk');
const { createCoopService } = require('./core');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const names = { users: 'coop_users', posts: 'coop_posts', runs: 'coop_runs' };
function adapter(source) {
    return {
        async get(kind, id) {
            let result;
            try { result = await source.collection(names[kind]).doc(id).get(); }
            catch (error) {
                const message = String(error.message || error.errMsg || '');
                if (!/collection\s+.*(?:not exist|not found)|集合.*不存在/i.test(message)
                    && /document.*(?:not exist|not found)|文档不存在/i.test(message)) return null;
                throw error;
            }
            if (!result.data) return null;
            const { _id, ...data } = result.data;
            return data;
        },
        async set(kind, id, data) { await source.collection(names[kind]).doc(id).set({ data }); },
        async list(kind, filter, cursor, limit) {
            const result = await source.collection(names[kind]).where({ ...filter, ...(cursor ? { _id: db.command.gt(cursor) } : {}) }).orderBy('_id', 'asc').limit(limit).get();
            if (!Array.isArray(result.data)) throw new Error('合作列表读取失败');
            return result.data;
        },
        transaction: operation => db.runTransaction(tx => operation(adapter(tx))),
    };
}
const execute = createCoopService(adapter(db));
exports.main = async event => {
    try { return { ok: true, ...await execute(cloud.getWXContext().OPENID, event || {}) }; }
    catch (error) { console.error('[coopService]', error); return { ok: false, errorMessage: error.message || '合作服务异常' }; }
};
