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
        sessionId: 'session-1',
        roundId: 'round-1',
        clientBuildId: 'build-1',
        experimentId: 'level-layout-v1',
        experimentBucket: 'base',
        levelDataSource: 'level_data_cdn',
        levelDataVersion: 'data-v1',
        adTransactionId: 'round-1:ad:1',
        adAttemptId: 7,
        triggerSource: 'capacity_soft_hint',
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
    assert.deepStrictEqual(
        [behaviorWrite.data.sessionId, behaviorWrite.data.roundId, behaviorWrite.data.clientBuildId],
        ['session-1', 'round-1', 'build-1'],
    );
    assert.deepStrictEqual(
        [behaviorWrite.data.experimentId, behaviorWrite.data.experimentBucket, behaviorWrite.data.levelDataSource],
        ['level-layout-v1', 'base', 'level_data_cdn'],
    );
    assert.ok(!Object.hasOwn(behaviorWrite.data, 'levelDataVersion'), 'behavior rows must discard the removed level version');
    assert.deepStrictEqual(
        [behaviorWrite.data.adTransactionId, behaviorWrite.data.adAttemptId, behaviorWrite.data.triggerSource],
        ['round-1:ad:1', '7', 'capacity_soft_hint'],
    );
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
        sessionId: 'session-1',
        roundId: 'round-1',
        clientBuildId: 'build-1',
        logicalLevelId: 3,
        physicalLevelId: 103,
        abId: 'level-layout-v1',
        abBucket: 'exp',
        levelDataSource: 'level_data_cdn',
        levelDataVersion: 'data-v1',
        effectiveTimeLimit: 240,
        ddaFactor: 1.25,
        ddaReason: 'recent_failures',
        gameplayStats: {
            magnetUses: 2.9,
            brushUses: -5,
            freezeUses: 2000000000,
            peakBufferCount: 91,
            peakBufferRatio: 1.5,
            capacityExpandCount: 2,
            validActionCount: 18,
            finalBufferCount: 10,
            finalLockedCount: 480,
            totalBeanCount: 501,
            finalProgressRatio: 0.958,
            capacitySoftHintEligibleCount: 1,
            capacitySoftHintShownCount: 1,
            capacitySoftHintClickCount: 1,
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
    assert.deepStrictEqual(
        [levelWrite.data.sessionId, levelWrite.data.roundId, levelWrite.data.clientBuildId],
        ['session-1', 'round-1', 'build-1'],
    );
    assert.deepStrictEqual(
        [levelWrite.data.logicalLevelId, levelWrite.data.physicalLevelId, levelWrite.data.experimentId, levelWrite.data.experimentBucket],
        [3, 103, 'level-layout-v1', 'exp'],
    );
    assert.deepStrictEqual(
        [levelWrite.data.levelDataSource, levelWrite.data.effectiveTimeLimit, levelWrite.data.ddaFactor, levelWrite.data.ddaReason],
        ['level_data_cdn', 240, 1.25, 'recent_failures'],
    );
    assert.ok(!Object.hasOwn(levelWrite.data, 'levelDataVersion'), 'level records must discard the removed level version');
    assert.deepStrictEqual(levelWrite.data.gameplayStats, {
        magnetUses: 2,
        brushUses: 0,
        freezeUses: 1000000000,
        peakBufferCount: 91,
        peakBufferRatio: 1,
        capacityExpandCount: 2,
        validActionCount: 18,
        finalBufferCount: 10,
        finalLockedCount: 480,
        totalBeanCount: 501,
        finalProgressRatio: 0.958,
        capacitySoftHintEligibleCount: 1,
        capacitySoftHintShownCount: 1,
        capacitySoftHintClickCount: 1,
    });

    const funnel = loadCloudFunction('cloudfunctions/addFunnelEvents/index.js');
    const funnelResult = await funnel.main({
        sessionId: 'session-1',
        events: [{
            eventSeq: 1,
            eventName: 'pch_capacity_soft_hint_shown',
            sessionId: 'session-1',
            roundId: 'round-1',
            clientBuildId: 'build-1',
            experimentId: 'level-layout-v1',
            experimentBucket: 'exp',
            levelDataSource: 'level_data_cdn',
            levelDataVersion: 'data-v1',
            extra: { bufferCount: 72, bufferCapacity: 84, bufferRatio: 72 / 84 },
        }],
    });
    assert.strictEqual(funnelResult.ok, true, funnelResult.errorMessage);
    const funnelWrite = funnel.writes.find((entry) => entry.collection === 'first_level_funnel');
    assert.deepStrictEqual(
        [funnelWrite.data.sessionId, funnelWrite.data.roundId, funnelWrite.data.clientBuildId],
        ['session-1', 'round-1', 'build-1'],
    );
    assert.deepStrictEqual(
        [funnelWrite.data.experimentId, funnelWrite.data.experimentBucket],
        ['level-layout-v1', 'exp'],
    );
    assert.ok(!Object.hasOwn(funnelWrite.data, 'levelDataVersion'), 'funnel rows must discard the removed level version');
    assert.strictEqual(funnelWrite.data.extra.bufferCapacity, 84);

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
