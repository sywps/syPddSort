'use strict';
// Mongo API test double; no network. Serial snapshots model atomic commit/rollback, not real driver conflicts.
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
function createMongo() {
    let data = {}, queue = Promise.resolve(), failure;
    const matches = (row, query) => Object.entries(query).every(([key, value]) => {
        const actual = row[key];
        if (value && typeof value === 'object') return Object.entries(value).every(([op, rhs]) => {
            if (op === '$in') return rhs.includes(actual);
            if (op === '$lte') return actual <= rhs;
            if (op === '$gt') return actual > rhs;
            throw Error('unsupported operator ' + op);
        });
        return actual === value;
    });
    const db = { collection(name) {
        const table = opts => { const store = opts?.session?.data || data; return store[name] ||= {}; };
        const fail = op => { if (failure?.name === name && failure.op === op) { failure = null; throw Error('simulated Mongo failure mongodb://secret'); } };
        return {
            async createIndex() { table(); },
            async findOne(query, opts) { fail('read'); return clone(Object.values(table(opts)).find(row => matches(row, query)) || null); },
            find(query, opts) {
                let order = {}, count = Infinity;
                return { sort(value) { order = value; return this; }, limit(value) { count = value; return this; },
                    async toArray() { fail('read'); return clone(Object.values(table(opts)).filter(row => matches(row, query)).sort((a, b) => {
                        for (const [key, direction] of Object.entries(order)) if (a[key] !== b[key]) return (a[key] < b[key] ? -1 : 1) * direction;
                        return 0;
                    }).slice(0, count)); } };
            },
            async insertOne(row, opts) { fail('write'); const rows = table(opts); if (rows[row._id]) throw Object.assign(Error('duplicate'), { code: 11000 }); rows[row._id] = clone(row); return { acknowledged: true }; },
            async replaceOne(query, row, opts) { fail('write'); const rows = table(opts), existing = rows[query._id]; if (existing || opts?.upsert) rows[query._id] = clone(row); return { acknowledged: true, matchedCount: existing ? 1 : 0 }; },
            async updateOne(query, update, opts) {
                fail('write'); const rows = table(opts), existing = rows[query._id] && matches(rows[query._id], query) ? rows[query._id] : null;
                if (existing || opts?.upsert) {
                    const next = { ...(existing || query), ...clone(update.$set || {}) };
                    for (const [key, value] of Object.entries(update.$inc || {})) next[key] = (next[key] || 0) + value;
                    rows[query._id] = next;
                }
                return { acknowledged: true, matchedCount: existing ? 1 : 0 };
            },
            async deleteOne(query, opts) { delete table(opts)[query._id]; return { acknowledged: true }; },
        };
    } };
    class MongoClient {
        async connect() {} async close() {} db() { return db; }
        startSession() { return { async endSession() {}, async withTransaction(fn, opts) {
            if (opts.readConcern.level !== 'snapshot' || opts.writeConcern.w !== 'majority') throw Error('invalid transaction options');
            const previous = queue; let release; queue = new Promise(resolve => { release = resolve; }); await previous;
            this.data = clone(data);
            try { const result = await fn(); data = this.data; return result; }
            finally { this.data = null; release(); }
        } }; }
    }
    return { MongoClient, db, rows: name => Object.values(data[name] || {}), failNext: (name, op = 'write') => { failure = { name, op }; }, snapshot: () => clone(data) };
}
module.exports = { createMongo };
