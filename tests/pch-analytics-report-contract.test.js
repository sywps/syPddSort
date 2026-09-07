const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const aggregateScript = path.join(root, 'scripts/aggregate-daily-report-range.js');

function writeSummary(tempRoot, date, summary) {
    const outputDir = path.join(tempRoot, 'artifacts', 'cloudbase-daily-report', date);
    fs.mkdirSync(outputDir, { recursive: true });
    const text = `${JSON.stringify(summary, null, 2)}\n`;
    const filePath = path.join(outputDir, 'combined_summary.json');
    fs.writeFileSync(filePath, text);
    return { filePath, text };
}

function diagnosisBase(overrides) {
    return {
        schemaVersion: 10,
        coreMetrics: {},
        firstLevelFunnel: [],
        first20Levels: [],
        adPerformance: { overall: {}, topByShow: [] },
        firstDayChurnAnalysis: null,
        levelAdRelationship: [],
        experimentBreakdowns: {},
        levelNetValue: null,
        dataQuality: {},
        ...overrides,
    };
}

const oldSummary = {
    date: '2026-08-01',
    envId: 'test-env',
    collections: {
        user_behavior: {
            summary: {
                totalShowNum: 8,
                totalClickNum: 4,
                totalFinishNum: 2,
                clickRate: 0.5,
            },
        },
    },
    dailyDiagnosis: diagnosisBase({
        schemaVersion: 9,
        coreMetrics: {
            dau: 10,
            l1FunnelStartUv: 9,
            l1FunnelPassUv: 5,
            firstLevelUiReadySessions: 8,
            firstLevelAnyTouchSessions: 7,
            adShowPv: 8,
            adClickPv: 4,
            adFinishPv: 2,
        },
        firstLevelFunnel: [
            { label: '首次有效选择', eventName: 'first_valid_select', records: 9, sessions: 8, users: 7 },
            { label: '首次放置成功', eventName: 'first_place_success', records: 7, sessions: 6, users: 5 },
        ],
        firstLevelFunnelAllLevels: [{ eventName: 'tutorial_done', records: 3, sessions: 3, users: 3 }],
        tutorialTapBreakdown: [{ key: 'success|board', records: 5, sessions: 4, users: 3 }],
        tutorialTapByStep: [{ key: 'step1|success|board', records: 5, sessions: 4, users: 3 }],
        first20Levels: [{
            levelId: 1,
            enterUv: 9,
            passUv: 5,
            recordCount: 8,
            selectionAttempts: 99,
            magnetMovedBeans: 88,
            manual2xUsed: true,
        }],
        adPerformance: {
            overall: { showNum: 8, clickNum: 4, finishNum: 2, userNum: 3, clickRate: 0.5 },
            topByShow: [{ adType: 'rewarded', page: 'level_revive', showNum: 8, clickNum: 4, finishNum: 2, userNum: 3, clickRate: 0.5 }],
        },
        dataQuality: {
            firstLevelFunnelRecords: 19,
            firstLevelFunnelSessions: 14,
        },
    }),
};

const newSummary = {
    date: '2026-08-02',
    envId: 'test-env',
    collections: {
        user_behavior: {
            summary: {
                totalShowNum: 6,
                totalClickNum: 5,
                totalFinishNum: 4,
                showRate: 1.2,
            },
        },
    },
    dailyDiagnosis: diagnosisBase({
        coreMetrics: {
            dau: 12,
            l1EnterUv: 11,
            l1PassUv: 9,
            l1FailUv: 2,
            l1EnterNotPassUv: 2,
            l1LevelEnterUv: 11,
            l1LevelPassUv: 9,
            pchFirstStoreSessions: 10,
            pchFirstReturnSessions: 8,
            adShowPv: 6,
            adClickPv: 5,
            adFinishPv: 4,
        },
        firstLevelFunnel: [
            { label: '首次存入传送带成功', eventName: 'pch_first_store_success', records: 11, sessions: 10, users: 9 },
            { label: '首次从传送带归位成功', eventName: 'pch_first_return_success', records: 9, sessions: 8, users: 7 },
        ],
        pchFunnelScope: { levelIds: [1, 2, 3], label: 'logical_levels=1,2,3' },
        guideTapBreakdown: [{ key: 'l2_speed|enabled_2x', records: 5, sessions: 4, users: 3 }],
        guideTapByStep: [{ key: 'L2|speed|enabled_2x', records: 5, sessions: 4, users: 3 }],
        reviveAdFunnel: [{
            levelId: 3,
            page: 'pch_buffer_full_revive',
            panelShowNum: 10,
            clickNum: 6,
            showNum: 5,
            finishNum: 4,
            reviveSuccessNum: 3,
            userNum: 3,
        }],
        reviveShareFunnel: [{
            levelId: 3,
            page: 'pch_buffer_full_revive',
            panelShowNum: 10,
            shareClickNum: 6,
            qualifiedReturnNum: 4,
            shareReviveSuccessNum: 3,
            userNum: 3,
        }],
        first20Levels: [{
            levelId: 1,
            enterUv: 11,
            passUv: 9,
            recordCount: 10,
            magnetUses: 2,
            brushUses: 3,
            freezeUses: 4,
        }],
        adPerformance: {
            overall: { showNum: 6, clickNum: 5, finishNum: 4, userNum: 4, showRate: 1.2 },
            topByShow: [{ adType: 'rewarded', page: 'level_revive', showNum: 6, clickNum: 5, finishNum: 4, userNum: 4, showRate: 1.2 }],
        },
        dataQuality: {
            pchFunnelScope: 'logical_levels=1,2,3',
            pchFunnelRecords: 20,
            pchFunnelSessions: 10,
            pchFunnelRawRecords: 25,
        },
    }),
};

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-pch-analytics-report-'));
try {
    const oldInput = writeSummary(tempRoot, oldSummary.date, oldSummary);
    const newInput = writeSummary(tempRoot, newSummary.date, newSummary);
    const result = spawnSync(process.execPath, [
        aggregateScript,
        '--from', oldSummary.date,
        '--to', newSummary.date,
        '--date', '2026-08-03',
    ], { cwd: tempRoot, encoding: 'utf8' });
    assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const outputPath = path.join(tempRoot, 'artifacts', 'cloudbase-daily-report', '2026-08-03', 'combined_summary.json');
    const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const diagnosis = output.dailyDiagnosis;
    assert.deepStrictEqual(diagnosis.firstLevelFunnel.map((row) => row.eventName), [
        'pch_first_store_success',
        'pch_first_return_success',
    ]);
    for (const field of ['firstLevelFunnelAllLevels', 'tutorialTapBreakdown', 'tutorialTapByStep']) {
        assert.ok(!Object.hasOwn(diagnosis, field), `${field} must not survive mixed-history aggregation`);
    }
    assert.strictEqual(diagnosis.coreMetrics.pchFirstStoreSessions, 10);
    assert.strictEqual(diagnosis.coreMetrics.pchFirstReturnSessions, 8);
    assert.strictEqual(diagnosis.coreMetrics.pchFirstStoreToReturnRate, 0.8);
    assert.strictEqual(diagnosis.guideTapBreakdown[0].records, 5);

    const revive = diagnosis.reviveAdFunnel[0];
    assert.deepStrictEqual(
        [revive.panelClickRate, revive.adShowRate, revive.adFinishRate, revive.reviveSuccessRate],
        [0.6, 0.8333, 0.8, 0.75],
    );
    const shareRevive = diagnosis.reviveShareFunnel[0];
    assert.deepStrictEqual(
        [shareRevive.panelShareClickRate, shareRevive.qualifiedReturnRate, shareRevive.shareReviveSuccessRate],
        [0.6, 0.6667, 0.75],
    );
    const levelOne = diagnosis.first20Levels.find((row) => row.levelId === 1);
    assert.deepStrictEqual(
        [levelOne.magnetUses, levelOne.brushUses, levelOne.freezeUses],
        [2, 3, 4],
    );
    assert.ok(!Object.hasOwn(levelOne, 'selectionAttempts'));
    assert.ok(!Object.hasOwn(levelOne, 'magnetMovedBeans'));
    assert.ok(!Object.hasOwn(levelOne, 'manual2xUsed'));
    assert.strictEqual(output.collections.user_behavior.summary.showRate, 1.5556);
    assert.ok(!Object.hasOwn(output.collections.user_behavior.summary, 'clickRate'));
    assert.strictEqual(fs.readFileSync(oldInput.filePath, 'utf8'), oldInput.text, 'old source summary must stay unchanged');
    assert.strictEqual(fs.readFileSync(newInput.filePath, 'utf8'), newInput.text, 'new source summary must stay unchanged');

    const html = fs.readFileSync(path.join(root, 'tools/cloudbase-report.html'), 'utf8');
    const scriptBlock = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptBlock, 'dashboard HTML must contain its script block');
    new Function(scriptBlock[1]);
    assert.ok(html.includes('前三关传送带玩法里程碑（PCH）'));
    assert.ok(html.includes('传送带玩法引导结果（PCH）'));
    assert.ok(html.includes('分关卡复活广告漏斗'));
    assert.ok(html.includes('分关卡分享复活漏斗'));

    const dailyJob = fs.readFileSync(path.join(root, 'scripts/user-behavior-daily-job.js'), 'utf8');
    const dashboard = fs.readFileSync(path.join(root, 'cloudfunctions/getAllDashboardData/index.js'), 'utf8');
    for (const retiredEvent of ['first_touch', 'first_valid_select', 'first_place_attempt', 'first_place_success', 'tutorial_tap_result']) {
        const exactLiteral = new RegExp(`['"]${retiredEvent}['"]`);
        assert.ok(!exactLiteral.test(dailyJob), `daily report must not calculate ${retiredEvent}`);
        assert.ok(!exactLiteral.test(dashboard), `cloud dashboard must not calculate ${retiredEvent}`);
    }
    assert.ok(dashboard.includes('panelClickRate: toPercent(stat.clickNum, stat.panelShowNum)'));
    assert.ok(dashboard.includes('adShowRate: toPercent(stat.showNum, stat.clickNum)'));
    assert.ok(dashboard.includes('adFinishRate: toPercent(stat.finishNum, stat.showNum)'));
    assert.ok(dashboard.includes('reviveSuccessRate: toPercent(stat.reviveSuccessNum, stat.finishNum)'));
    assert.ok(dashboard.includes('panelShareClickRate: toPercent(stat.shareClickNum, stat.panelShowNum)'));
    assert.ok(dashboard.includes('qualifiedReturnRate: toPercent(stat.qualifiedReturnNum, stat.shareClickNum)'));
    assert.ok(dashboard.includes('shareReviveSuccessRate: toPercent(stat.shareReviveSuccessNum, stat.qualifiedReturnNum)'));

    console.log('pch-analytics-report-contract.test.js passed');
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}
