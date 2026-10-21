'use strict';
// Only the query/write operations used by the shared multiplayer rules. No CloudBase connection.
const common = require('./businessCommon');
const crypto = require('crypto');
const names = Object.freeze(Object.fromEntries([
    'coop_users', 'coop_posts', 'coop_runs', 'pvp_profiles', 'pvp_matches', 'pvp_replays',
    'pvp_settlements', 'pvp_checkpoints', 'pvp_ticket_claims', 'pvp_rank_reward_claims', 'user_profile'
].map(name => [name, 'douyin_' + name])));
const operation = Symbol('mongo-operation');
const command = Object.freeze(Object.fromEntries(['in', 'lte', 'gt', 'inc'].map(kind => [kind, value => ({ [operation]: kind, value })])));
function filter(query) {
    return Object.fromEntries(Object.entries(query).map(([key, value]) => [key,
        value && value[operation] ? { ['$' + value[operation]]: value.value } : value]));
}
function patch(data) {
    const update = {};
    for (const [key, value] of Object.entries(data)) {
        if (key === '_id') throw common.failure('INVALID_WRITE', '不能修改记录编号');
        const op = value && value[operation] === 'inc' ? '$inc' : '$set';
        if (!update[op]) update[op] = {};
        update[op][key] = op === '$inc' ? value.value : value;
    }
    return update;
}
function createStore(connection, session) {
    const { db, client } = connection;
    const opts = session ? { session } : {};
    async function execute(fn) {
        try { return await fn(); }
        catch (error) {
            // Preserve Mongo labels/codes so withTransaction can retry conflicts. Do not expose URI/errors to clients.
            if (!error.businessCode) { error.businessCode = 'DATABASE_FAILED'; error.message = '多人玩法数据读写失败，请重试'; }
            throw error;
        }
    }
    function collection(name) {
        if (!names[name]) throw common.failure('INVALID_COLLECTION', '未知多人玩法数据表');
        const target = db.collection(names[name]);
        function query(where = {}, order = {}, count = 100) {
            return {
                where: value => query({ ...where, ...filter(value) }, order, count),
                orderBy: (key, direction) => query(where, { ...order, [key]: direction === 'desc' ? -1 : 1 }, count),
                limit: value => {
                    if (!Number.isInteger(value) || value < 1 || value > 200) throw Error('invalid query limit');
                    return query(where, order, value);
                },
                get: () => execute(async () => ({ data: await target.find(where, opts).sort(order).limit(count).toArray() })),
            };
        }
        return {
            ...query(),
            doc(id) {
                if (typeof id !== 'string' || !id || id.length > 256) throw common.failure('INVALID_ID', '记录编号无效');
                return {
                    get: () => execute(async () => ({ data: await target.findOne({ _id: id }, opts) })),
                    set: ({ data }) => execute(async () => {
                        if (data._id !== undefined && data._id !== id) throw Error('record id mismatch');
                        common.ack(await target.replaceOne({ _id: id }, { ...data, _id: id }, { ...opts, upsert: true }));
                    }),
                    update: ({ data }) => execute(async () => {
                        const result = await target.updateOne({ _id: id }, patch(data), opts);
                        common.ack(result);
                        if (result.matchedCount !== 1) throw common.failure('RECORD_MISSING', '数据记录已变化，请重试');
                    }),
                };
            },
            add: ({ data }) => execute(async () => {
                const id = crypto.randomBytes(16).toString('hex');
                common.ack(await target.insertOne({ ...data, _id: id }, opts));
                return { _id: id };
            }),
        };
    }
    return { collection, command, runTransaction: async fn => {
        if (session) throw Error('nested transaction is not supported');
        for (let attempt = 0; ; attempt++) {
            try { return await common.transaction(client, tx => fn(createStore(connection, tx))); }
            catch (error) { if (error.code !== 11000 || attempt >= 2) throw error; }
        }
    } };
}
function coopStore(store) {
    const tables = { users: 'coop_users', posts: 'coop_posts', runs: 'coop_runs' };
    return {
        async get(kind, id) { const row = (await store.collection(tables[kind]).doc(id).get()).data; if (!row) return null; const { _id, ...data } = row; return data; },
        set: (kind, id, data) => store.collection(tables[kind]).doc(id).set({ data }),
        async list(kind, query, cursor, limit) {
            return (await store.collection(tables[kind]).where({ ...query, ...(cursor ? { _id: command.gt(cursor) } : {}) }).orderBy('_id', 'asc').limit(limit).get()).data;
        },
        transaction: fn => store.runTransaction(tx => fn(coopStore(tx))),
    };
}
module.exports = { names, createStore, coopStore };
