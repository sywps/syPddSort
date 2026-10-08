'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
const filename = path.resolve('cloudfunctions/pvpService/index.js');
const localRequire = createRequire(filename);
let source = 'wx_client', failQuery = false;
const writes = [], filters = [];
const db = {
  command: { in: values => ({ in: values }), lte: value => ({ lte: value }) },
  collection(name) {
    return {
      where(filter) {
        filters.push({ name, filter });
        return { limit(size) {
          assert.equal(size, 100);
          return { async get() {
            if (failQuery) throw new Error('database unavailable');
            return { data: [{ _id: name + '-expired' }] };
          } };
        } };
      },
      doc(id) { return { async update({ data }) { writes.push({ name, id, data }); } }; },
    };
  },
};
const exportsObject = {};
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  exports: exportsObject,
  require: name => name === 'wx-server-sdk' ? {
    init() {}, database: () => db, getWXContext: () => ({ SOURCE: source, OPENID: 'client' }),
  } : localRequire(name),
  process: { env: { PVP_MAINTENANCE_TOKEN: 'test-only-token' } },
  console: { log() {}, error() {} }, Buffer, Date,
}, { filename });
(async () => {
  const spoof = await exportsObject.main({ action: 'maintenance', SOURCE: 'wx_trigger', Type: 'Timer', TriggerName: 'pvpMaintenanceEvery5Min' });
  assert.equal(spoof.ok, false);
  assert.match(spoof.errorMessage, /authorization failed/);
  assert.equal(writes.length, 0, 'client event cannot impersonate a timer');
  source = 'wx_trigger';
  const timer = await exportsObject.main({});
  assert.equal(timer.ok, true);
  assert.equal(timer.maintenance.expiredMatches, 1);
  assert.equal(timer.maintenance.retiredReplays, 1);
  assert.equal(writes[0].data.status, 'EXPIRED');
  assert.equal(writes[1].data.eligibleForMatchmaking, false);
  assert.equal(filters[0].filter.status.in.includes('SETTLED'), false);
  assert.equal(typeof filters[0].filter.expiresAt.lte, 'number');
  failQuery = true;
  await assert.rejects(exportsObject.main({}), /database unavailable/);
  failQuery = false;
  source = 'wx_client';
  assert.equal((await exportsObject.main({ action: 'maintenance', maintenanceToken: 'test-only-token' })).ok, true);
  console.log('PVP_MAINTENANCE_TIMER_TESTS_PASSED');
})().catch(error => { console.error(error); process.exitCode = 1; });
