const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dailyJob = path.join(root, 'scripts/user-behavior-daily-job.js');
const date = '2026-09-10';
const collections = ['user_behavior', 'level_record', 'ad_stat', 'daily_stat', 'first_level_funnel'];

function writeExport(outputRoot, collection, records) {
    const outputDir = path.join(outputRoot, collection);
    fs.mkdirSync(outputDir, { recursive: true });
    const filePath = path.join(outputDir, `database_export-fixture-${collection}-${date}.json`);
    fs.writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''));
}

function roundMeta(openid, roundId, logicalLevelId, bucket) {
    return {
        openid,
        sessionId: `${openid}-session`,
        roundId,
        clientBuildId: 'build-contract',
        levelId: logicalLevelId,
        logicalLevelId,
        physicalLevelId: logicalLevelId,
        experimentId: 'level-layout-v1',
        experimentBucket: bucket,
        levelDataSource: 'level_data_cdn',
        gameplayMode: 'pch_conveyor',
        gameplaySchemaVersion: 1,
        timestamp: Date.UTC(2026, 8, 10, 4),
    };
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-capacity-round-report-'));
try {
    const l4 = roundMeta('l1-base', 'round-l4', 4, 'base');
    const l5 = roundMeta('l1-exp', 'round-l5', 5, 'exp');
    const collisionA = {
        ...roundMeta('collision-user', 'shared-round', 4, 'base'),
        clientBuildId: 'build-a',
    };
    const collisionB = {
        ...roundMeta('collision-user', 'shared-round', 4, 'base'),
        clientBuildId: 'build-b',
    };
    writeExport(tempRoot, 'user_behavior', [
        { openid: 'launch-only-1', eventName: 'app_launch', levelId: 0, timestamp: l4.timestamp },
        { openid: 'launch-only-2', eventName: 'app_launch', levelId: 0, timestamp: l4.timestamp },
        { openid: 'l1-base', eventName: 'app_launch', levelId: 0, timestamp: l4.timestamp },
        { openid: 'l1-base', eventName: 'enter_level', levelId: 1, experimentId: 'level-layout-v1', experimentBucket: 'base', timestamp: l4.timestamp },
        { openid: 'l1-base', eventName: 'level_pass', levelId: 1, experimentId: 'level-layout-v1', experimentBucket: 'base', timestamp: l4.timestamp },
        { openid: 'l1-exp', eventName: 'enter_level', levelId: 1, experimentId: 'level-layout-v1', experimentBucket: 'exp', timestamp: l4.timestamp },
        { ...l4, eventName: 'enter_level' },
        { ...l4, eventName: 'ad_click', page: 'pch_conveyor_expand', triggerSource: 'capacity_soft_hint', adTransactionId: 'round-l4:ad:1' },
        { ...l4, eventName: 'ad_reward_success', page: 'pch_conveyor_expand', triggerSource: 'capacity_soft_hint', adTransactionId: 'round-l4:ad:1', adAttemptId: '41' },
        { ...l5, eventName: 'enter_level' },
        { ...l5, eventName: 'ad_click', page: 'pch_conveyor_expand', triggerSource: 'capacity_soft_hint', adTransactionId: 'round-l5:ad:1' },
        { ...l5, eventName: 'ad_reward_success', page: 'pch_conveyor_expand', triggerSource: 'capacity_soft_hint', adTransactionId: 'round-l5:ad:1', adAttemptId: '51' },
        { ...collisionA, eventName: 'ad_click', page: 'pch_conveyor_expand', triggerSource: 'capacity_soft_hint', adTransactionId: 'shared-round:ad:1' },
        { ...collisionB, eventName: 'ad_reward_success', page: 'pch_conveyor_expand', triggerSource: 'capacity_soft_hint', adTransactionId: 'shared-round:ad:1', adAttemptId: '61' },
    ]);
    writeExport(tempRoot, 'first_level_funnel', [
        { ...l4, eventSeq: 1, eventName: 'pch_capacity_soft_hint_eligible' },
        { ...l4, eventSeq: 2, eventName: 'pch_capacity_soft_hint_shown' },
        { ...l4, eventSeq: 3, eventName: 'pch_capacity_soft_hint_click' },
        { ...l4, eventSeq: 4, eventName: 'pch_capacity_reward_followup_action', extra: { elapsedMsAfterReward: 640 } },
        { ...l5, eventSeq: 1, eventName: 'pch_capacity_soft_hint_eligible' },
        { ...l5, eventSeq: 2, eventName: 'pch_capacity_soft_hint_shown' },
        { ...l5, eventSeq: 3, eventName: 'pch_capacity_soft_hint_click' },
        { ...l5, eventSeq: 4, eventName: 'pch_capacity_reward_followup_action', extra: { elapsedMsAfterReward: 820 } },
        { ...collisionA, eventSeq: 1, eventName: 'pch_capacity_soft_hint_eligible' },
        { ...collisionA, eventSeq: 2, eventName: 'pch_capacity_soft_hint_shown' },
        { ...collisionA, eventSeq: 3, eventName: 'pch_capacity_soft_hint_click' },
        { ...collisionB, eventSeq: 4, eventName: 'pch_capacity_reward_followup_action', extra: { elapsedMsAfterReward: 910 } },
    ]);
    writeExport(tempRoot, 'level_record', [
        {
            ...l4,
            passStatus: true,
            endReason: 'pass',
            startTime: l4.timestamp,
            endTime: l4.timestamp + 30000,
            gameplayStats: { peakBufferRatio: 0.9, capacityExpandCount: 1, validActionCount: 21, finalProgressRatio: 1 },
        },
        {
            ...l5,
            passStatus: true,
            endReason: 'pass',
            startTime: l5.timestamp,
            endTime: l5.timestamp + 40000,
            gameplayStats: { peakBufferRatio: 0.95, capacityExpandCount: 1, validActionCount: 27, finalProgressRatio: 1 },
        },
        {
            ...collisionB,
            passStatus: true,
            endReason: 'pass',
            startTime: collisionB.timestamp,
            endTime: collisionB.timestamp + 45000,
            gameplayStats: { peakBufferRatio: 0.92, capacityExpandCount: 1, validActionCount: 23, finalProgressRatio: 1 },
        },
    ]);
    writeExport(tempRoot, 'daily_stat', [{ date, dau: 5, newUser: 2, totalPlay: 4 }]);
    writeExport(tempRoot, 'ad_stat', []);

    const result = spawnSync(process.execPath, [
        dailyJob,
        '--date', date,
        '--collections', collections.join(','),
        '--out-dir', tempRoot,
        '--reuse-existing',
    ], { cwd: root, encoding: 'utf8' });
    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const output = JSON.parse(fs.readFileSync(path.join(tempRoot, 'combined_summary.json'), 'utf8'));
    const diagnosis = output.dailyDiagnosis;
    for (const [levelId, bucket, delay] of [[4, 'BASE', 640], [5, 'EXP', 820]]) {
        const row = diagnosis.capacityAdRoundFunnel.rows.find((item) => (
            item.logicalLevelId === levelId
            && item.experimentId === 'level-layout-v1'
            && item.bucket === bucket
        ));
        assert.ok(row, `missing L${levelId} ${bucket} round funnel row`);
        assert.deepStrictEqual(
            [row.roundCount, row.eligibleRounds, row.shownRounds, row.clickedRounds, row.rewardedRounds, row.followupRounds, row.passedRounds],
            [1, 1, 1, 1, 1, 1, 1],
        );
        assert.deepStrictEqual(
            [row.eligibleToShownRate, row.shownToClickRate, row.clickToRewardRate, row.rewardToFollowupRate, row.rewardToPassRate],
            [1, 1, 1, 1, 1],
        );
        assert.strictEqual(row.avgFollowupDelayMs, delay);
    }

    const collisionRows = diagnosis.capacityAdRoundFunnel.rows.filter((item) => (
        item.logicalLevelId === 4
        && item.experimentId === 'level-layout-v1'
        && ['build-a', 'build-b'].includes(item.clientBuildId)
    ));
    assert.strictEqual(collisionRows.length, 2, 'same roundId under different client builds must stay separate');
    const collisionByBuild = Object.fromEntries(collisionRows.map((row) => [row.clientBuildId, row]));
    assert.deepStrictEqual(
        [collisionByBuild['build-a'].eligibleRounds, collisionByBuild['build-a'].clickedRounds, collisionByBuild['build-a'].rewardedRounds, collisionByBuild['build-a'].followupRounds, collisionByBuild['build-a'].passedRounds],
        [1, 1, 0, 0, 0],
    );
    assert.deepStrictEqual(
        [collisionByBuild['build-b'].eligibleRounds, collisionByBuild['build-b'].clickedRounds, collisionByBuild['build-b'].rewardedRounds, collisionByBuild['build-b'].followupRounds, collisionByBuild['build-b'].passedRounds],
        [0, 0, 1, 1, 1],
    );

    const experiment = diagnosis.experimentBreakdowns.first20Levels['level-layout-v1'];
    const cohortByGroup = Object.fromEntries(experiment.groupRows.map((row) => [row.group, row.cohortUsers]));
    assert.ok(cohortByGroup.control > 0, 'base must be classified into the control group');
    assert.ok(cohortByGroup.treatment > 0, 'exp must be classified into the treatment group');
    assert.strictEqual(cohortByGroup.null, 0, 'base/exp must not fall into NULL');

    assert.strictEqual(output.effectiveDailyCore.retain1, null);
    assert.strictEqual(output.effectiveDailyCore.retain3, null);
    assert.strictEqual(output.effectiveDailyCore.retain7, null);
    assert.strictEqual(diagnosis.coreMetrics.l1EnterUv, 2);
    assert.strictEqual(diagnosis.coreMetrics.l1PassUv, 1);
    assert.strictEqual(diagnosis.coreMetrics.l1UvPassRate, 0.5);
    assert.strictEqual(diagnosis.coreMetrics.l1PassRateDenominator, 'user_behavior.enter_level.users');
    assert.strictEqual(diagnosis.firstDayChurnAnalysis.baseUsers, 2, 'L1 churn denominator must use actual L1 entrants');
    const l4Level = diagnosis.first20Levels.find((row) => row.levelId === 4);
    assert.deepStrictEqual(
        [l4Level.pchStatsRecordCount, l4Level.avgPeakBufferRatio, l4Level.capacityExpandCount, l4Level.avgValidActionCount, l4Level.avgFinalProgressRatio],
        [2, 0.91, 2, 22, 1],
        'the first-20 table must expose the collected PCH pressure and progress metrics',
    );

    console.log('pch-capacity-daily-round-contract.test.js passed');
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}
