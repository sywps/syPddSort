const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const dashboardPath = path.join(root, 'cloudfunctions/getAllDashboardData/index.js');
const timestamp = Date.parse('2026-07-24T10:00:00+08:00');

const collections = {
  user_behavior: [
    { openid: 'control-pass', eventName: 'enter_level', levelId: 2, logicalLevelId: 2, abId: 'front10_v1', abBucket: 'control', timestamp },
    { openid: 'control-pass', eventName: 'smart_hint_show', levelId: 2, logicalLevelId: 2, abId: 'front10_v1', abBucket: 'control', timestamp: timestamp + 1 },
    { openid: 'control-pass', eventName: 'ad_show', levelId: 2, logicalLevelId: 2, abId: 'front10_v1', abBucket: 'control', timestamp: timestamp + 2 },
    { openid: 'control-pass', eventName: 'ad_finish', levelId: 2, logicalLevelId: 2, abId: 'front10_v1', abBucket: 'control', timestamp: timestamp + 3 },
    { openid: 'control-pass', eventName: 'level_pass', levelId: 2, logicalLevelId: 2, abId: 'front10_v1', abBucket: 'control', smartHintShownCount: 1, timestamp: timestamp + 4 },
    { openid: 'control-fail', eventName: 'enter_level', levelId: 2, logicalLevelId: 2, abId: 'front10_v1', abBucket: 'control', timestamp: timestamp + 5 },
    { openid: 'control-fail', eventName: 'level_fail', levelId: 2, logicalLevelId: 2, abId: 'front10_v1', abBucket: 'control', timestamp: timestamp + 6 },
    { openid: 'treatment-pass', eventName: 'enter_level', levelId: 2, logicalLevelId: 2, abId: 'front10_v1', abBucket: 'treatment', timestamp: timestamp + 7 },
    { openid: 'treatment-pass', eventName: 'ad_show', levelId: 2, logicalLevelId: 2, abId: 'front10_v1', abBucket: 'treatment', timestamp: timestamp + 8 },
    { openid: 'treatment-pass', eventName: 'ad_click', levelId: 2, logicalLevelId: 2, abId: 'front10_v1', abBucket: 'treatment', timestamp: timestamp + 9 },
    { openid: 'treatment-pass', eventName: 'level_pass', levelId: 2, logicalLevelId: 2, abId: 'front10_v1', abBucket: 'treatment', smartHintShownCount: 0, timestamp: timestamp + 10 },
    { openid: 'treatment-pass', eventName: 'enter_level', levelId: 10, logicalLevelId: 10, abId: 'front10_v1', abBucket: 'treatment', timestamp: timestamp + 11 },
    { openid: 'treatment-pass', eventName: 'level_pass', levelId: 10, logicalLevelId: 10, abId: 'front10_v1', abBucket: 'treatment', smartHintShownCount: 0, timestamp: timestamp + 12 },
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
  assert.strictEqual(result.front10ExperimentStats.experimentId, 'front10_v1');

  const level2All = findRow(result.front10ExperimentStats, 2, 'all');
  assert.strictEqual(level2All.enterUsers, 3);
  assert.strictEqual(level2All.passUsers, 2);
  assert.strictEqual(level2All.smartGuidedPassUsers, 1);

  const level2Control = findRow(result.front10ExperimentStats, 2, 'control');
  assert.strictEqual(level2Control.enterUsers, 2);
  assert.strictEqual(level2Control.passUsers, 1);
  assert.strictEqual(level2Control.failUsers, 1);
  assert.strictEqual(level2Control.adFinishCount, 1);
  assert.strictEqual(level2Control.smartHintShowCount, 1);
  assert.strictEqual(level2Control.smartGuidedPassUsers, 1);
  assert.strictEqual(level2Control.smartGuidedPassShownTotal, 1);

  const level2Treatment = findRow(result.front10ExperimentStats, 2, 'treatment');
  assert.strictEqual(level2Treatment.enterUsers, 1);
  assert.strictEqual(level2Treatment.passUsers, 1);
  assert.strictEqual(level2Treatment.adClickCount, 1);
  assert.strictEqual(level2Treatment.smartGuidedPassUsers, 0);

  const level10Treatment = findRow(result.front10ExperimentStats, 10, 'treatment');
  assert.strictEqual(level10Treatment.enterUsers, 1);
  assert.strictEqual(level10Treatment.passUsers, 1);

  console.log('front10-experiment-dashboard-cloud.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
