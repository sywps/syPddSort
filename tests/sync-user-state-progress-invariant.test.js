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
                async get() { assert.strictEqual(id, doc._id); return { data: clone(doc) }; },
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
                async runTransaction(callback) { return callback({ collection: () => collection }); },
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

async function runSkinResetGetCase() {
    const runtime = loadCloudFunction({
        savedLevel: 60,
        lastLevelId: 60,
        stateUpdatedAt: 100,
        ownedBackgroundSkinIds: [1000, 1001, 1002, 1003, 1004],
        backgroundSkinOwnedIds: [1005],
        backgroundSkinAdProgress: { 1004: 3 },
        equippedBackgroundSkinId: 1004,
        equippedBackgroundSkinUpdatedAt: 123,
    });
    const result = clone(await runtime.main({ action: 'get' }));
    assert.strictEqual(result.ok, true, 'get reset: cloud function should succeed');
    assert.deepStrictEqual(result.gameState.ownedBackgroundSkinIds, [1000], 'get reset: returned owned skins');
    assert.deepStrictEqual(result.gameState.backgroundSkinAdProgress, {}, 'get reset: returned ad progress');
    assert.strictEqual(result.gameState.backgroundSkinResetVersion, 1, 'get reset: returned reset version');
    assert.strictEqual(result.gameState.equippedBackgroundSkinId, 1000, 'get reset: returned equipped skin');
    const doc = runtime.getDoc();
    assert.deepStrictEqual(doc.ownedBackgroundSkinIds, [1000], 'get reset: persisted owned skins');
    assert.deepStrictEqual(doc.backgroundSkinOwnedIds, [], 'get reset: cleared legacy owned skins');
    assert.deepStrictEqual(doc.backgroundSkinAdProgress, {}, 'get reset: persisted empty ad progress');
    assert.strictEqual(doc.backgroundSkinResetVersion, 1, 'get reset: persisted reset version');
    assert.strictEqual(doc.equippedBackgroundSkinId, 1000, 'get reset: persisted equipped skin');
    assert.ok(doc.backgroundSkinResetBackupV1, 'get reset: backup should exist');
    assert.deepStrictEqual(doc.backgroundSkinResetBackupV1.ownedBackgroundSkinIds, [1000, 1001, 1002, 1003, 1004, 1005], 'get reset: backup owned skins');
    assert.deepStrictEqual(doc.backgroundSkinResetBackupV1.backgroundSkinAdProgress, { 1004: 3 }, 'get reset: backup ad progress');
}

async function runOldClientSkinSaveCase() {
    const runtime = loadCloudFunction({
        savedLevel: 10,
        lastLevelId: 10,
        stateUpdatedAt: 100,
        backgroundSkinResetVersion: 1,
        ownedBackgroundSkinIds: [1000, 1001],
        backgroundSkinAdProgress: {},
    });
    const result = clone(await runtime.main({
        action: 'save',
        gameState: {
            savedLevel: 10,
            stateUpdatedAt: 200,
            ownedBackgroundSkinIds: [1000, 1001, 1002, 1003],
            backgroundSkinAdProgress: { 1002: 1 },
            equippedBackgroundSkinId: 1002,
            equippedBackgroundSkinUpdatedAt: 200,
        },
    }));
    assert.strictEqual(result.ok, true, 'old client save: cloud function should succeed');
    assert.deepStrictEqual(result.gameState.ownedBackgroundSkinIds, [1000], 'old client save: returned owned skins');
    assert.deepStrictEqual(result.gameState.backgroundSkinAdProgress, {}, 'old client save: returned ad progress');
    assert.strictEqual(result.gameState.backgroundSkinResetVersion, 1, 'old client save: returned reset version');
    assert.notStrictEqual(result.gameState.equippedBackgroundSkinId, 1002, 'old client save: should not equip locked skin');
    const doc = runtime.getDoc();
    assert.deepStrictEqual(doc.ownedBackgroundSkinIds, [1000], 'old client save: persisted owned skins');
    assert.deepStrictEqual(doc.backgroundSkinAdProgress, {}, 'old client save: persisted ad progress');
}

async function runPostResetAdUnlockSaveCase() {
    const runtime = loadCloudFunction({
        savedLevel: 10,
        lastLevelId: 10,
        stateUpdatedAt: 100,
        backgroundSkinResetVersion: 1,
        ownedBackgroundSkinIds: [1000, 1001],
        backgroundSkinAdProgress: {},
    });
    const result = clone(await runtime.main({
        action: 'save',
        gameState: {
            savedLevel: 10,
            stateUpdatedAt: 300,
            backgroundSkinResetVersion: 1,
            ownedBackgroundSkinIds: [1000, 1001, 1004],
            backgroundSkinAdProgress: { 1004: 1 },
            equippedBackgroundSkinId: 1004,
            equippedBackgroundSkinUpdatedAt: 300,
        },
    }));
    assert.strictEqual(result.ok, true, 'post-reset ad save: cloud function should succeed');
    assert.deepStrictEqual(result.gameState.ownedBackgroundSkinIds, [1000, 1004], 'post-reset ad save: returned owned skins');
    assert.deepStrictEqual(result.gameState.backgroundSkinAdProgress, { 1004: 1 }, 'post-reset ad save: returned ad progress');
    assert.strictEqual(result.gameState.equippedBackgroundSkinId, 1004, 'post-reset ad save: returned equipped skin');
    const doc = runtime.getDoc();
    assert.deepStrictEqual(doc.ownedBackgroundSkinIds, [1000, 1004], 'post-reset ad save: persisted owned skins');
    assert.deepStrictEqual(doc.backgroundSkinAdProgress, { 1004: 1 }, 'post-reset ad save: persisted ad progress');
    assert.strictEqual(doc.equippedBackgroundSkinId, 1004, 'post-reset ad save: persisted equipped skin');
}

async function runRetiredSkinGetCase() {
    const resetBackup = { marker: 'keep-existing-backup' };
    const runtime = loadCloudFunction({
        savedLevel: 10,
        lastLevelId: 10,
        stateUpdatedAt: 100,
        backgroundSkinResetVersion: 1,
        ownedBackgroundSkinIds: [1000, 1001, 1002, 1004],
        backgroundSkinOwnedIds: [1001, 1005],
        backgroundSkinAdProgress: { 1001: 9, 1002: 1, 1004: 3 },
        equippedBackgroundSkinId: 1001,
        equippedBackgroundSkinUpdatedAt: 123,
        backgroundSkinResetBackupV1: resetBackup,
    });
    const result = clone(await runtime.main({ action: 'get' }));
    assert.strictEqual(result.ok, true, 'retired get: cloud function should succeed');
    assert.deepStrictEqual(result.gameState.ownedBackgroundSkinIds, [1000, 1002, 1004, 1005], 'retired get: preserve other owned skins');
    assert.deepStrictEqual(result.gameState.backgroundSkinAdProgress, { 1002: 1, 1004: 3 }, 'retired get: preserve other ad progress');
    assert.strictEqual(result.gameState.equippedBackgroundSkinId, 1000, 'retired get: fallback equipped skin');
    assert.strictEqual(result.gameState.equippedBackgroundSkinUpdatedAt, 123, 'retired get: preserve equipped timestamp');
    const doc = runtime.getDoc();
    assert.deepStrictEqual(doc.ownedBackgroundSkinIds, [1000, 1002, 1004, 1005], 'retired get: persist other owned skins');
    assert.deepStrictEqual(doc.backgroundSkinOwnedIds, [], 'retired get: clear retired legacy ownership');
    assert.deepStrictEqual(doc.backgroundSkinAdProgress, { 1002: 1, 1004: 3 }, 'retired get: persist other ad progress');
    assert.strictEqual(doc.equippedBackgroundSkinId, 1000, 'retired get: persist fallback equipped skin');
    assert.deepStrictEqual(doc.backgroundSkinResetBackupV1, resetBackup, 'retired get: preserve existing reset backup');
}

async function runRetiredSkinOldClientSaveCase() {
    const runtime = loadCloudFunction({
        savedLevel: 10,
        lastLevelId: 10,
        stateUpdatedAt: 300,
        backgroundSkinResetVersion: 1,
        ownedBackgroundSkinIds: [1000, 1002],
        backgroundSkinAdProgress: { 1002: 1 },
        equippedBackgroundSkinId: 1002,
        equippedBackgroundSkinUpdatedAt: 300,
    });
    const result = clone(await runtime.main({
        action: 'save',
        gameState: {
            savedLevel: 10,
            stateUpdatedAt: 400,
            backgroundSkinResetVersion: 1,
            ownedBackgroundSkinIds: [1000, 1001, 1004],
            backgroundSkinOwnedIds: [1001],
            backgroundSkinAdProgress: { 1001: 9, 1004: 2 },
            equippedBackgroundSkinId: 1001,
            equippedBackgroundSkinUpdatedAt: 400,
        },
    }));
    assert.strictEqual(result.ok, true, 'retired old-client save: cloud function should succeed');
    assert.deepStrictEqual(result.gameState.ownedBackgroundSkinIds, [1000, 1002, 1004], 'retired old-client save: filter only retired ownership');
    assert.deepStrictEqual(result.gameState.backgroundSkinAdProgress, { 1002: 1, 1004: 2 }, 'retired old-client save: preserve other ad progress');
    assert.strictEqual(result.gameState.equippedBackgroundSkinId, 1000, 'retired old-client save: fallback newer retired selection');
    const doc = runtime.getDoc();
    assert.deepStrictEqual(doc.ownedBackgroundSkinIds, [1000, 1002, 1004], 'retired old-client save: persist filtered ownership');
    assert.deepStrictEqual(doc.backgroundSkinAdProgress, { 1002: 1, 1004: 2 }, 'retired old-client save: persist other ad progress');
    assert.strictEqual(doc.equippedBackgroundSkinId, 1000, 'retired old-client save: persist fallback selection');
}

async function runBeanSkinNewerSelectionMergeCase() {
    const runtime = loadCloudFunction({
        savedLevel: 10,
        lastLevelId: 10,
        stateUpdatedAt: 100,
        ownedBeanSkinIds: [2000, 2001],
        equippedBeanSkinId: 2001,
        equippedBeanSkinUpdatedAt: 100,
    });
    const result = clone(await runtime.main({
        action: 'save',
        gameState: {
            savedLevel: 10,
            stateUpdatedAt: 200,
            ownedBeanSkinIds: [2000, 2002],
            equippedBeanSkinId: 2002,
            equippedBeanSkinUpdatedAt: 200,
        },
    }));
    assert.strictEqual(result.skinStateSchemaVersion, 2, 'bean merge: skin schema version');
    assert.deepStrictEqual(result.gameState.ownedBeanSkinIds, [2000, 2001, 2002], 'bean merge: ownership union');
    assert.strictEqual(result.gameState.equippedBeanSkinId, 2002, 'bean merge: newer selection wins');
    assert.strictEqual(result.gameState.equippedBeanSkinUpdatedAt, 200, 'bean merge: newer selection timestamp');
    const doc = runtime.getDoc();
    assert.deepStrictEqual(doc.ownedBeanSkinIds, [2000, 2001, 2002], 'bean merge: persisted ownership union');
}

async function runBeanSkinOlderSelectionCannotOverwriteCase() {
    const runtime = loadCloudFunction({
        savedLevel: 10,
        lastLevelId: 10,
        stateUpdatedAt: 300,
        ownedBeanSkinIds: [2000, 2003],
        equippedBeanSkinId: 2003,
        equippedBeanSkinUpdatedAt: 300,
    });
    const result = clone(await runtime.main({
        action: 'save',
        gameState: {
            savedLevel: 10,
            stateUpdatedAt: 400,
            ownedBeanSkinIds: [2000, 2004],
            equippedBeanSkinId: 2004,
            equippedBeanSkinUpdatedAt: 200,
        },
    }));
    assert.deepStrictEqual(result.gameState.ownedBeanSkinIds, [2000, 2003, 2004], 'bean older: ownership still unions');
    assert.strictEqual(result.gameState.equippedBeanSkinId, 2003, 'bean older: current newer selection wins');
    assert.strictEqual(result.gameState.equippedBeanSkinUpdatedAt, 300, 'bean older: current timestamp preserved');
}

async function runBeanSkinUnownedSelectionRejectedCase() {
    const runtime = loadCloudFunction({ savedLevel: 10, lastLevelId: 10, stateUpdatedAt: 100 });
    const result = clone(await runtime.main({
        action: 'save',
        gameState: {
            savedLevel: 10,
            stateUpdatedAt: 400,
            ownedBeanSkinIds: [2000, 9999],
            equippedBeanSkinId: 2004,
            equippedBeanSkinUpdatedAt: 400,
        },
    }));
    assert.deepStrictEqual(result.gameState.ownedBeanSkinIds, [2000], 'bean invalid: illegal ids filtered');
    assert.strictEqual(result.gameState.equippedBeanSkinId, 2000, 'bean invalid: unowned selection falls back');
    assert.ok(result.gameState.equippedBeanSkinUpdatedAt > 0, 'bean invalid: fallback has an authoritative timestamp');
    const doc = runtime.getDoc();
    assert.deepStrictEqual(doc.ownedBeanSkinIds, [2000], 'bean invalid: equipped field does not grant ownership');
}

async function runBeanSkinInvalidStoredSelectionGetCase() {
    const runtime = loadCloudFunction({
        savedLevel: 10,
        lastLevelId: 10,
        ownedBeanSkinIds: [2000, 2002, 9999],
        equippedBeanSkinId: 2004,
        equippedBeanSkinUpdatedAt: 123,
    });
    const result = clone(await runtime.main({ action: 'get' }));
    assert.deepStrictEqual(result.gameState.ownedBeanSkinIds, [2000, 2002], 'bean get: illegal ownership filtered');
    assert.strictEqual(result.gameState.equippedBeanSkinId, 2000, 'bean get: unowned stored selection falls back');
    assert.strictEqual(result.gameState.equippedBeanSkinUpdatedAt, 123, 'bean get: selection timestamp preserved');
}

(async () => {
    for (const incomingRevision of [0, 1, 999]) {
        const runtime = loadCloudFunction({ savedLevel: 3, lastLevelId: 3, pvpEconomyRevision: 2,
            vigor: 8, vigorTime: 300000, gold: 288, magnetCount: 1, brushCount: 0, stateUpdatedAt: 100 });
        const response = await runtime.main({ action: 'save', gameState: { savedLevel: 4,
            pvpEconomyRevision: incomingRevision, vigor: 10, gold: 100, magnetCount: 0, stateUpdatedAt: 999999 } });
        assert.strictEqual(response.ok, true);
        assert.strictEqual(runtime.getDoc().vigor, 8, 'stale/future revision cannot restore spent stamina');
        assert.strictEqual(runtime.getDoc().gold, 288, 'stale/future revision cannot erase granted gold');
        assert.strictEqual(runtime.getDoc().magnetCount, 1);
        assert.strictEqual(runtime.getDoc().pvpEconomyRevision, 2);
        assert.strictEqual(runtime.getDoc().savedLevel, 4, 'inventory protection must preserve valid chapter progress');
    }
    const currentRevision = loadCloudFunction({ savedLevel: 3, pvpEconomyRevision: 2,
        vigor: 8, gold: 288, stateUpdatedAt: 100 });
    await currentRevision.main({ action: 'save', gameState: { savedLevel: 3, pvpEconomyRevision: 2,
        vigor: 7, gold: 298, stateUpdatedAt: 200 } });
    assert.strictEqual(currentRevision.getDoc().vigor, 7, 'same revision retains ordinary stamina usage');
    assert.strictEqual(currentRevision.getDoc().gold, 298, 'same revision retains ordinary chapter rewards');
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

    await runSkinResetGetCase();
    await runOldClientSkinSaveCase();
    await runPostResetAdUnlockSaveCase();
    await runRetiredSkinGetCase();
    await runRetiredSkinOldClientSaveCase();
    await runBeanSkinNewerSelectionMergeCase();
    await runBeanSkinOlderSelectionCannotOverwriteCase();
    await runBeanSkinUnownedSelectionRejectedCase();
    await runBeanSkinInvalidStoredSelectionGetCase();

    console.log('sync-user-state-progress-invariant.test.js passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
