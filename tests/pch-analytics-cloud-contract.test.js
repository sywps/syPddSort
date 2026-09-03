const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadCloudFunction(relPath) {
    const writes = [];
    const fakeDb = {
        command: {
            inc(value) { return { operation: 'inc', value }; },
        },
        collection(name) {
            return {
                add({ data }) {
                    writes.push({ collection: name, data: plain(data) });
                    return Promise.resolve({ _id: `${name}-${writes.length}` });
                },
                where() {
                    return {
                        limit() {
                            return {
                                get: async () => ({ data: [] }),
                            };
                        },
                    };
                },
                doc() {
                    return {
                        update: async () => ({ stats: { updated: 1 } }),
                    };
                },
            };
        },
    };
    const fakeCloud = {
        DYNAMIC_CURRENT_ENV: 'test-env',
        init() {},
        database: () => fakeDb,
        getWXContext: () => ({ OPENID: 'test-openid' }),
    };
    const sandbox = {
        console,
        exports: {},
        require(name) {
            if (name === 'wx-server-sdk') return fakeCloud;
            return require(name);
        },
    };
    const filePath = path.join(root, relPath);
    vm.runInNewContext(fs.readFileSync(filePath, 'utf8'), sandbox, { filename: filePath });
    return { main: sandbox.exports.main, writes };
}

async function main() {
    const behavior = loadCloudFunction('cloudfunctions/addBehaviorData/index.js');
    const behaviorResult = await behavior.main({
        eventName: 'level_fail',
        levelId: 3,
        gameplayMode: 'pch_conveyor',
        gameplayEntryMode: 'theme',
        gameplaySchemaVersion: 1,
        failureReason: 'buffer_full',
        gameplayStats: { magnetUses: 99 },
        selectionAttempts: 88,
    });
    assert.strictEqual(behaviorResult.ok, true, behaviorResult.errorMessage);
    const behaviorWrite = behavior.writes.find((entry) => entry.collection === 'user_behavior');
    assert.ok(behaviorWrite, 'addBehaviorData must write user_behavior');
    assert.strictEqual(behaviorWrite.data.gameplayMode, 'pch_conveyor');
    assert.strictEqual(behaviorWrite.data.gameplayEntryMode, 'theme');
    assert.strictEqual(behaviorWrite.data.gameplaySchemaVersion, 1);
    assert.strictEqual(behaviorWrite.data.failureReason, 'buffer_full');
    assert.ok(!Object.hasOwn(behaviorWrite.data, 'gameplayStats'), 'behavior rows must not persist a nested snapshot');
    assert.ok(!Object.hasOwn(behaviorWrite.data, 'selectionAttempts'), 'retired counters must not enter behavior rows');

    const levelRecord = loadCloudFunction('cloudfunctions/saveLevelRecord/index.js');
    const levelResult = await levelRecord.main({
        levelId: 3,
        passStatus: false,
        endReason: 'fail',
        gameplayMode: 'pch_conveyor',
        gameplayEntryMode: 'theme',
        gameplaySchemaVersion: 1,
        failureReason: 'timeout',
        startTime: 100,
        endTime: 200,
        gameplayStats: {
            magnetUses: 2.9,
            brushUses: -5,
            freezeUses: 2000000000,
            selectionAttempts: 90,
            magnetMovedBeans: 40,
            manual2xUsed: true,
        },
    });
    assert.strictEqual(levelResult.ok, true, levelResult.errorMessage);
    const levelWrite = levelRecord.writes.find((entry) => entry.collection === 'level_record');
    assert.ok(levelWrite, 'saveLevelRecord must write level_record');
    assert.strictEqual(levelWrite.data.gameplayMode, 'pch_conveyor');
    assert.strictEqual(levelWrite.data.gameplayEntryMode, 'theme');
    assert.strictEqual(levelWrite.data.gameplaySchemaVersion, 1);
    assert.strictEqual(levelWrite.data.failureReason, 'timeout');
    assert.deepStrictEqual(levelWrite.data.gameplayStats, {
        magnetUses: 2,
        brushUses: 0,
        freezeUses: 1000000000,
    });

    const invalidSchema = loadCloudFunction('cloudfunctions/saveLevelRecord/index.js');
    await invalidSchema.main({
        levelId: 4,
        gameplayMode: 'pch_conveyor',
        gameplayEntryMode: 'unexpected',
        gameplaySchemaVersion: 2,
        gameplayStats: { magnetUses: 10 },
    });
    const invalidWrite = invalidSchema.writes.find((entry) => entry.collection === 'level_record');
    assert.strictEqual(invalidWrite.data.gameplaySchemaVersion, 0);
    assert.strictEqual(invalidWrite.data.gameplayEntryMode, '', 'unknown entry modes must be normalized away');
    assert.strictEqual(invalidWrite.data.gameplayStats, null, 'unsupported schemas must not persist arbitrary stats');

    console.log('pch-analytics-cloud-contract.test.js passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
