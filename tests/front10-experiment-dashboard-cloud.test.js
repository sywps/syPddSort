const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const dashboardPath = path.join(root, 'cloudfunctions/getAllDashboardData/index.js');
const timestamp = Date.parse('2026-07-24T10:00:00+08:00');

const collections = {
  user_behavior: [
    { openid: 'base-pass', eventName: 'enter_level', levelId: 2, logicalLevelId: 2, abId: 'ly_0224', abBucket: 'base', timestamp },
    { openid: 'base-pass', eventName: 'smart_hint_show', levelId: 2, logicalLevelId: 2, abId: 'ly_0224', abBucket: 'base', timestamp: timestamp + 1 },
    { openid: 'base-pass', eventName: 'ad_show', levelId: 2, logicalLevelId: 2, abId: 'ly_0224', abBucket: 'base', timestamp: timestamp + 2 },
    { openid: 'base-pass', eventName: 'ad_finish', levelId: 2, logicalLevelId: 2, abId: 'ly_0224', abBucket: 'base', timestamp: timestamp + 3 },
    { openid: 'base-pass', eventName: 'level_pass', levelId: 2, logicalLevelId: 2, abId: 'ly_0224', abBucket: 'base', smartHintShownCount: 1, timestamp: timestamp + 4 },
    { openid: 'base-fail', eventName: 'enter_level', levelId: 2, logicalLevelId: 2, abId: 'ly_0224', abBucket: 'base', timestamp: timestamp + 5 },
    { openid: 'base-fail', eventName: 'level_fail', levelId: 2, logicalLevelId: 2, abId: 'ly_0224', abBucket: 'base', timestamp: timestamp + 6 },
    { openid: 'exp-pass', eventName: 'enter_level', levelId: 2, logicalLevelId: 2, abId: 'ly_0224', abBucket: 'exp', timestamp: timestamp + 7 },
    { openid: 'exp-pass', eventName: 'ad_show', levelId: 2, logicalLevelId: 2, abId: 'ly_0224', abBucket: 'exp', timestamp: timestamp + 8 },
    { openid: 'exp-pass', eventName: 'ad_click', levelId: 2, logicalLevelId: 2, abId: 'ly_0224', abBucket: 'exp', timestamp: timestamp + 9 },
    { openid: 'exp-pass', eventName: 'level_pass', levelId: 2, logicalLevelId: 2, abId: 'ly_0224', abBucket: 'exp', smartHintShownCount: 0, timestamp: timestamp + 10 },
    { openid: 'exp-pass', eventName: 'enter_level', levelId: 10, logicalLevelId: 10, abId: 'ly_0224', abBucket: 'exp', timestamp: timestamp + 11 },
    { openid: 'exp-pass', eventName: 'level_pass', levelId: 10, logicalLevelId: 10, abId: 'ly_0224', abBucket: 'exp', smartHintShownCount: 0, timestamp: timestamp + 12 },
    { openid: 'revive-user', eventName: 'revive_panel_show', levelId: 3, logicalLevelId: 3, page: 'pch_buffer_full_revive', timestamp: timestamp + 13 },
    { openid: 'revive-user', eventName: 'ad_click', levelId: 3, logicalLevelId: 3, page: 'pch_buffer_full_revive', timestamp: timestamp + 14 },
    { openid: 'revive-user', eventName: 'ad_show', levelId: 3, logicalLevelId: 3, page: 'pch_buffer_full_revive', timestamp: timestamp + 15 },
    { openid: 'revive-user', eventName: 'ad_finish', levelId: 3, logicalLevelId: 3, page: 'pch_buffer_full_revive', timestamp: timestamp + 16 },
    { openid: 'revive-user', eventName: 'revive_success', levelId: 3, logicalLevelId: 3, page: 'pch_buffer_full_revive', timestamp: timestamp + 17 },
    { openid: 'share-revive-user', eventName: 'revive_panel_show', levelId: 4, logicalLevelId: 4, page: 'level_revive', timestamp: timestamp + 18 },
    { openid: 'share-revive-user', eventName: 'share_click', levelId: 4, logicalLevelId: 4, page: 'level_revive_share', timestamp: timestamp + 19 },
    { openid: 'share-revive-user', eventName: 'share_success', levelId: 4, logicalLevelId: 4, page: 'level_revive_share', timestamp: timestamp + 20 },
    { openid: 'share-revive-user', eventName: 'share_revive_success', levelId: 4, logicalLevelId: 4, page: 'level_revive_share', timestamp: timestamp + 21 },
  ],
  level_record: [
    { openid: 'revive-user', levelId: 3, gameplayMode: 'pch_conveyor', gameplaySchemaVersion: 1, gameplayStats: { magnetUses: 2, brushUses: 3, freezeUses: 4 }, endTime: timestamp + 18 },
    { openid: 'legacy-user', levelId: 3, gameplayMode: '', gameplaySchemaVersion: 0, gameplayStats: { magnetUses: 100 }, endTime: timestamp + 19 },
  ],
  first_level_funnel: [
    { openid: 'guide-user', sessionId: 'pch-l1', eventName: 'pch_first_store_success', logicalLevelId: 1, timestamp: timestamp + 20 },
    { openid: 'guide-user', sessionId: 'pch-l1', eventName: 'pch_first_return_success', logicalLevelId: 1, timestamp: timestamp + 21 },
    { openid: 'guide-user', sessionId: 'pch-l2', eventName: 'pch_guide_step_shown', logicalLevelId: 2, timestamp: timestamp + 22 },
    { openid: 'guide-user', sessionId: 'pch-l2', eventName: 'pch_guide_tap_result', logicalLevelId: 2, timestamp: timestamp + 23 },
    { openid: 'guide-user', sessionId: 'pch-l2', eventName: 'pch_guide_step_done', logicalLevelId: 2, timestamp: timestamp + 24 },
    { openid: 'legacy-user', sessionId: 'legacy-l1', eventName: 'first_valid_select', logicalLevelId: 1, timestamp: timestamp + 25 },
  ],
  daily_stat: [],
  user_profile: [],
};

function makeCommand(name, value) {
  return {
    name,
    value,
    and(other) {
      return { name: 'and', left: this, right: other };
    },
  };
}

class Query {
  constructor(name) {
    this.name = name;
    this.skipSize = 0;
    this.limitSize = 100;
  }

  where() {
    return this;
  }

  orderBy() {
    return this;
  }

  skip(value) {
    this.skipSize = Math.max(0, Math.floor(Number(value) || 0));
    return this;
  }

  limit(value) {
    this.limitSize = Math.max(0, Math.floor(Number(value) || 0));
    return this;
  }

  async get() {
    const data = collections[this.name] || [];
    return { data: data.slice(this.skipSize, this.skipSize + this.limitSize) };
  }
}

const fakeCloud = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init() {},
  database() {
    return {
      command: {
        gte: (value) => makeCommand('gte', value),
        lt: (value) => makeCommand('lt', value),
        lte: (value) => makeCommand('lte', value),
      },
      collection(name) {
        return new Query(name);
      },
    };
  },
};

const sandbox = {
  console,
  exports: {},
  require(name) {
    if (name === 'wx-server-sdk') return fakeCloud;
    return require(name);
  },
};

vm.runInNewContext(fs.readFileSync(dashboardPath, 'utf8'), sandbox, { filename: dashboardPath });

function findRow(stats, logicalLevelId, abBucket) {
  return stats.rows.find((row) => row.logicalLevelId === logicalLevelId && row.abBucket === abBucket);
}

(async () => {
  const result = await sandbox.exports.main({
    startDate: '2026-07-24',
    endDate: '2026-07-24',
    days: 1,
  });

  assert.strictEqual(result.ok, true, result.errorMessage);
  assert.strictEqual(result.front10ExperimentStats.experimentId, 'ly_0224');

  const level2All = findRow(result.front10ExperimentStats, 2, 'all');
  assert.strictEqual(level2All.enterUsers, 3);
  assert.strictEqual(level2All.passUsers, 2);
  assert.strictEqual(level2All.smartGuidedPassUsers, 1);

  const level2Base = findRow(result.front10ExperimentStats, 2, 'base');
  assert.strictEqual(level2Base.enterUsers, 2);
  assert.strictEqual(level2Base.passUsers, 1);
  assert.strictEqual(level2Base.failUsers, 1);
  assert.strictEqual(level2Base.adFinishCount, 1);
  assert.strictEqual(level2Base.smartHintShowCount, 1);
  assert.strictEqual(level2Base.smartGuidedPassUsers, 1);
  assert.strictEqual(level2Base.smartGuidedPassShownTotal, 1);

  const level2Exp = findRow(result.front10ExperimentStats, 2, 'exp');
  assert.strictEqual(level2Exp.enterUsers, 1);
  assert.strictEqual(level2Exp.passUsers, 1);
  assert.strictEqual(level2Exp.adClickCount, 1);
  assert.strictEqual(level2Exp.smartGuidedPassUsers, 0);

  const level10Exp = findRow(result.front10ExperimentStats, 10, 'exp');
  assert.strictEqual(level10Exp.enterUsers, 1);
  assert.strictEqual(level10Exp.passUsers, 1);

  const revive = result.reviveAdFunnel.find((row) => row.logicalLevelId === 3 && row.page === 'pch_buffer_full_revive');
  assert.ok(revive, 'dashboard must expose the buffer-full revive placement');
  assert.deepStrictEqual(
    [revive.panelShowNum, revive.clickNum, revive.showNum, revive.finishNum, revive.reviveSuccessNum],
    [1, 1, 1, 1, 1],
  );
  assert.deepStrictEqual(
    [revive.panelClickRate, revive.adShowRate, revive.adFinishRate, revive.reviveSuccessRate],
    [100, 100, 100, 100],
  );

  const shareRevive = result.reviveShareFunnel.find((row) => row.logicalLevelId === 4 && row.page === 'level_revive');
  assert.ok(shareRevive, 'dashboard must expose the timeout share-revive placement');
  assert.deepStrictEqual(
    [shareRevive.panelShowNum, shareRevive.shareClickNum, shareRevive.qualifiedReturnNum, shareRevive.shareReviveSuccessNum],
    [1, 1, 1, 1],
  );
  assert.deepStrictEqual(
    [shareRevive.panelShareClickRate, shareRevive.qualifiedReturnRate, shareRevive.shareReviveSuccessRate],
    [100, 100, 100],
  );

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(result.pchSkillUses)),
    [{ logicalLevelId: 3, magnetUses: 2, brushUses: 3, freezeUses: 4 }],
  );
  assert.deepStrictEqual(
    Array.from(result.pchOnboardingFunnel.levels, (row) => row.logicalLevelId),
    [1, 2, 3],
  );
  const levelOnePch = result.pchOnboardingFunnel.levels[0].groups.find((row) => row.abBucket === 'all');
  assert.strictEqual(levelOnePch.steps.find((row) => row.key === 'pch_first_store_success').sessionCount, 1);
  assert.strictEqual(levelOnePch.steps.find((row) => row.key === 'pch_first_return_success').sessionCount, 1);
  assert.ok(!levelOnePch.steps.some((row) => row.key === 'first_valid_select'));
  const levelTwoPch = result.pchOnboardingFunnel.levels[1].groups.find((row) => row.abBucket === 'all');
  assert.strictEqual(levelTwoPch.diagnostics.find((row) => row.key === 'pch_guide_tap_result').sessionCount, 1);

  console.log('front10-experiment-dashboard-cloud.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
