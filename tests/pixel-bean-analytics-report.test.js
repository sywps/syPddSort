const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dailyScript = path.join(root, 'scripts/user-behavior-daily-job.js');
const aggregateScript = path.join(root, 'scripts/aggregate-daily-report-range.js');

function runNode(script, args, cwd) {
    const result = spawnSync(process.execPath, [script, ...args], {
        cwd,
        encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function writeNdjson(filePath, rows) {
    fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

function diagnosisBase(pixelBeanProgress, pixelBeanAds) {
    return {
        schemaVersion: 11,
        coreMetrics: {},
        firstLevelFunnel: [],
        guideTapBreakdown: [],
        guideTapByStep: [],
        reviveAdFunnel: [],
        first20Levels: [],
        mainlineBottlenecks: [],
        highRetryLevels: [],
        adPerformance: { overall: {}, topByShow: [] },
        firstDayChurnAnalysis: null,
        levelAdRelationship: [],
        experimentBreakdowns: {},
        levelNetValue: null,
        dataQuality: {},
        recommendations: [],
        pixelBeanProgress,
        pixelBeanAds,
    };
}

function writeCombinedSummary(tempRoot, date, diagnosis) {
    const outputDir = path.join(tempRoot, 'artifacts', 'cloudbase-daily-report', date);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'combined_summary.json'), `${JSON.stringify({
        date,
        envId: 'test-env',
        collections: {},
        dailyDiagnosis: diagnosis,
    }, null, 2)}\n`);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-pixel-bean-analytics-'));
try {
    const inputPath = path.join(tempRoot, 'user_behavior.ndjson');
    writeNdjson(inputPath, [
        { openid: 'u1', eventName: 'enter_level', levelId: 1, page: 'theme_level' },
        { openid: 'u1', eventName: 'level_pass', levelId: 1, page: 'theme_level' },
        { openid: 'u1', eventName: 'enter_level', levelId: 2, page: 'theme_level' },
        { openid: 'u2', eventName: 'enter_level', levelId: 1, page: 'theme_level' },
        { openid: 'u2', eventName: 'level_fail', levelId: 1, page: 'theme_level' },
        { openid: 'u3', eventName: 'enter_level', logicalLevelId: 3, levelId: 3003, page: 'theme_level', gameplayEntryMode: 'theme' },
        { openid: 'u3', eventName: 'level_pass', logicalLevelId: 3, levelId: 3003, page: 'theme_level', gameplayEntryMode: 'theme' },
        { openid: 'main-user', eventName: 'enter_level', levelId: 99, page: 'theme_level', gameplayEntryMode: 'main' },
        { openid: 'u1', eventName: 'ad_click', levelId: 2, page: 'pch_conveyor_expand', adType: 'rewardedVideo:pch_conveyor_expand', gameplayEntryMode: 'theme' },
        { openid: 'u1', eventName: 'ad_show', levelId: 2, page: 'pch_conveyor_expand', adType: 'rewardedVideo:pch_conveyor_expand', gameplayEntryMode: 'theme' },
        { openid: 'u1', eventName: 'ad_finish', levelId: 2, page: 'pch_conveyor_expand', adType: 'rewardedVideo:pch_conveyor_expand', gameplayEntryMode: 'theme' },
        { openid: 'u1', eventName: 'ad_reward_success', levelId: 2, page: 'pch_conveyor_expand', adType: 'rewardedVideo:pch_conveyor_expand', gameplayEntryMode: 'theme' },
        { openid: 'u2', eventName: 'ad_click', levelId: 1, page: 'level_revive', adType: 'rewardedVideo:level_revive', gameplayEntryMode: 'theme' },
        { openid: 'u2', eventName: 'ad_show', levelId: 1, page: 'level_revive', adType: 'rewardedVideo:level_revive', gameplayEntryMode: 'theme' },
        { openid: 'u2', eventName: 'ad_finish', levelId: 1, page: 'level_revive', adType: 'rewardedVideo:level_revive', gameplayEntryMode: 'theme' },
        { openid: 'legacy-ad', eventName: 'ad_click', levelId: 200, page: 'pch_conveyor_expand', adType: 'rewardedVideo:pch_conveyor_expand' },
        { openid: 'main-ad', eventName: 'ad_click', levelId: 200, page: 'pch_conveyor_expand', adType: 'rewardedVideo:pch_conveyor_expand', gameplayEntryMode: 'main' },
    ]);

    const dailyOut = path.join(tempRoot, 'daily');
    runNode(dailyScript, [
        '--date', '2026-08-01',
        '--input', inputPath,
        '--out-dir', dailyOut,
        '--collection', 'user_behavior',
    ], root);

    const daily = JSON.parse(fs.readFileSync(path.join(dailyOut, 'summary.json'), 'utf8'));
    assert.deepStrictEqual(daily.pixelBeanProgress.overall, {
        activeUsers: 3,
        enterUsers: 3,
        passUsers: 2,
        failUsers: 1,
        highestEnteredLevel: 3,
        highestPassedLevel: 3,
    });
    assert.deepStrictEqual(daily.pixelBeanProgress.levels, [
        { levelId: 1, enterUv: 2, enterPv: 2, passUv: 1, passPv: 1, failUv: 1, failPv: 1, uvPassRate: 0.5 },
        { levelId: 2, enterUv: 1, enterPv: 1, passUv: 0, passPv: 0, failUv: 0, failPv: 0, uvPassRate: 0 },
        { levelId: 3, enterUv: 1, enterPv: 1, passUv: 1, passPv: 1, failUv: 0, failPv: 0, uvPassRate: 1 },
    ]);
    assert.deepStrictEqual(daily.pixelBeanProgress.maxEnteredLevelDistribution, [
        { levelId: 1, users: 1 },
        { levelId: 2, users: 1 },
        { levelId: 3, users: 1 },
    ]);
    assert.deepStrictEqual(daily.pixelBeanAds.overall, {
        clickNum: 2,
        showNum: 2,
        finishNum: 2,
        rewardSuccessNum: 1,
        userNum: 2,
        adShowRate: 1,
        adFinishRate: 1,
        rewardSuccessRate: 0.5,
    });
    assert.deepStrictEqual(
        daily.pixelBeanAds.rows.map((row) => [row.levelId, row.page, row.rewardSuccessNum]),
        [[1, 'level_revive', 0], [2, 'pch_conveyor_expand', 1]],
    );

    const dayOneProgress = daily.pixelBeanProgress;
    const dayOneAds = daily.pixelBeanAds;
    const dayTwoProgress = {
        scope: dayOneProgress.scope,
        overall: {
            activeUsers: 2,
            enterUsers: 2,
            passUsers: 1,
            failUsers: 1,
            highestEnteredLevel: 4,
            highestPassedLevel: 3,
        },
        levels: [
            { levelId: 3, enterUv: 2, enterPv: 3, passUv: 1, passPv: 1, failUv: 1, failPv: 2, uvPassRate: 0.5 },
            { levelId: 4, enterUv: 2, enterPv: 2, passUv: 0, passPv: 0, failUv: 0, failPv: 0, uvPassRate: 0 },
        ],
        maxEnteredLevelDistribution: [{ levelId: 4, users: 2 }],
    };
    const dayTwoAds = {
        scope: dayOneAds.scope,
        overall: {
            clickNum: 3,
            showNum: 2,
            finishNum: 1,
            rewardSuccessNum: 1,
            userNum: 2,
            adShowRate: 0.6667,
            adFinishRate: 0.5,
            rewardSuccessRate: 1,
        },
        rows: [{
            levelId: 2,
            adType: 'rewardedVideo:pch_conveyor_expand',
            page: 'pch_conveyor_expand',
            label: 'pch_conveyor_expand',
            clickNum: 3,
            showNum: 2,
            finishNum: 1,
            rewardSuccessNum: 1,
            userNum: 2,
            adShowRate: 0.6667,
            adFinishRate: 0.5,
            rewardSuccessRate: 1,
        }],
    };
    writeCombinedSummary(tempRoot, '2026-08-01', diagnosisBase(dayOneProgress, dayOneAds));
    writeCombinedSummary(tempRoot, '2026-08-02', diagnosisBase(dayTwoProgress, dayTwoAds));
    runNode(aggregateScript, [
        '--from', '2026-08-01',
        '--to', '2026-08-02',
        '--date', '2026-08-03',
    ], tempRoot);

    const combinedPath = path.join(tempRoot, 'artifacts', 'cloudbase-daily-report', '2026-08-03', 'combined_summary.json');
    const combined = JSON.parse(fs.readFileSync(combinedPath, 'utf8')).dailyDiagnosis;
    assert.strictEqual(combined.schemaVersion, '11+synthetic-daily-sum');
    assert.deepStrictEqual(combined.pixelBeanProgress.overall, {
        activeUsers: 5,
        enterUsers: 5,
        passUsers: 3,
        failUsers: 2,
        highestEnteredLevel: 4,
        highestPassedLevel: 3,
    });
    assert.deepStrictEqual(
        combined.pixelBeanProgress.levels.find((row) => row.levelId === 3),
        { levelId: 3, enterUv: 3, enterPv: 4, passUv: 2, passPv: 2, failUv: 1, failPv: 2, uvPassRate: 0.6667 },
    );
    assert.deepStrictEqual(combined.pixelBeanProgress.maxEnteredLevelDistribution, [
        { levelId: 1, users: 1 },
        { levelId: 2, users: 1 },
        { levelId: 3, users: 1 },
        { levelId: 4, users: 2 },
    ]);
    assert.deepStrictEqual(combined.pixelBeanAds.overall, {
        clickNum: 5,
        showNum: 4,
        finishNum: 3,
        rewardSuccessNum: 2,
        userNum: 4,
        adShowRate: 0.8,
        adFinishRate: 0.75,
        rewardSuccessRate: 0.6667,
    });
    const combinedExpand = combined.pixelBeanAds.rows.find((row) => row.page === 'pch_conveyor_expand');
    assert.deepStrictEqual(
        [combinedExpand.clickNum, combinedExpand.showNum, combinedExpand.finishNum, combinedExpand.rewardSuccessNum],
        [4, 3, 2, 2],
    );
    assert.deepStrictEqual(
        [combinedExpand.adShowRate, combinedExpand.adFinishRate, combinedExpand.rewardSuccessRate],
        [0.75, 0.6667, 1],
    );

    const html = fs.readFileSync(path.join(root, 'tools/cloudbase-report.html'), 'utf8');
    const scriptBlock = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptBlock, 'dashboard HTML must contain its script block');
    new Function(scriptBlock[1]);
    assert.ok(html.includes('像素拼豆关卡进度'));
    assert.ok(html.includes('像素拼豆广告'));
    assert.ok(html.includes('奖励到账'));

    console.log('pixel-bean-analytics-report.test.js passed');
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}
