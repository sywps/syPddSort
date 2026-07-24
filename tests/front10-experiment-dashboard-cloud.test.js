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
  ],
  level_record: [],
  first_level_funnel: [],
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

  console.log('front10-experiment-dashboard-cloud.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
