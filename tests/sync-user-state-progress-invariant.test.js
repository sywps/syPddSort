const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'cloudfunctions/syncUserState/index.js'), 'utf8');

function clone(value) {
    return value ? JSON.parse(JSON.stringify(value)) : value;
}

function loadCloudFunction(initialDoc) {
    const module = { exports: {} };
    let doc = initialDoc ? clone({ _id: 'doc_existing', openid: 'openid_unit', ...initialDoc }) : null;
    const collection = {
        where(query) {
            assert.strictEqual(query.openid, 'openid_unit');
            return {
                limit() {
                    return {
                        async get() {
                            return { data: doc ? [clone(doc)] : [] };
                        },
                    };
                },
            };
        },
        async add({ data }) {
            doc = { _id: 'doc_new', ...clone(data) };
            return { _id: 'doc_new' };
        },
        doc(id) {
            return {
                async update({ data }) {
                    assert.strictEqual(id, doc._id);
                    doc = { ...doc, ...clone(data) };
                    return { updated: 1 };
                },
            };
        },
    };
    const cloud = {
        DYNAMIC_CURRENT_ENV: 'unit-env',
        init() {},
        getWXContext() {
            return { OPENID: 'openid_unit' };
        },
        database() {
            return {
                collection(name) {
                    assert.strictEqual(name, 'user_profile');
                    return collection;
                },
            };
        },
    };
    vm.runInNewContext(source, {
        module,
        exports: module.exports,
        require(id) {
            if (id === 'wx-server-sdk') return cloud;
            throw new Error(`unexpected require: ${id}`);
        },
        Date,
        console,
    }, { filename: 'cloudfunctions/syncUserState/index.js' });
    return {
        main: module.exports.main,
        getDoc: () => clone(doc),
    };
}

async function runCase(name, initialDoc, event, expectedLevel) {
    const runtime = loadCloudFunction(initialDoc);
    const result = await runtime.main(event);
    assert.strictEqual(result.ok, true, `${name}: cloud function should succeed`);
    assert.strictEqual(result.gameState?.savedLevel, expectedLevel, `${name}: returned savedLevel`);
    assert.strictEqual(result.profile?.lastLevelId, expectedLevel, `${name}: returned lastLevelId`);
    const doc = runtime.getDoc();
    if (event.action === 'save') {
        assert.strictEqual(doc.savedLevel, expectedLevel, `${name}: persisted savedLevel`);
        assert.strictEqual(doc.lastLevelId, expectedLevel, `${name}: persisted lastLevelId`);
    }
}

(async () => {
    await runCase(
        'get normalizes profile-only progress',
        { lastLevelId: 8 },
        { action: 'get' },
        8,
    );

    await runCase(
        'get normalizes mismatched cloud progress upward',
        { savedLevel: 2, lastLevelId: 9 },
        { action: 'get' },
        9,
    );

    await runCase(
        'profile-only save writes both progress fields',
        null,
        { action: 'save', profile: { version: 1, uuid: 'u1', lastLevelId: 4 } },
        4,
    );

    await runCase(
        'gameState-only save writes both progress fields',
        null,
        { action: 'save', gameState: { savedLevel: 5, stateUpdatedAt: 100 } },
        5,
    );

    await runCase(
        'lower incoming progress cannot overwrite existing high progress',
        { savedLevel: 10, lastLevelId: 10, stateUpdatedAt: 100 },
        {
            action: 'save',
            profile: { version: 1, uuid: 'u2', lastLevelId: 1 },
            gameState: { savedLevel: 1, stateUpdatedAt: 200 },
        },
        10,
    );

    console.log('sync-user-state-progress-invariant.test.js passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
