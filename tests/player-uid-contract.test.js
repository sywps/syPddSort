const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const root = path.resolve(__dirname, '..');
const getOpenidPath = path.join(root, 'cloudfunctions', 'getOpenid', 'index.js');
const playerUidPath = path.join(root, 'cloudfunctions', 'getOpenid', 'playerUid.js');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createCloudHarness() {
  const profiles = new Map();
  const sequences = new Map();
  let currentOpenid = 'openid_new';
  let nextProfileId = 1;
  const missingUidQuery = { kind: 'exists', value: false };

  const profileDocument = (id) => ({
    _coll: 'user_profile',
    id,
    async update({ data }) {
      const profile = profiles.get(id);
      if (!profile) throw new Error('document does not exist');
      Object.assign(profile, clone(data));
      return { updated: 1 };
    },
  });
  const sequenceDocument = (id) => ({
    _coll: 'player_uid_sequence',
    id,
  });
  const profileCollection = {
    where(query) {
      const matching = () => {
        const all = Array.from(profiles.values());
        if (Object.prototype.hasOwnProperty.call(query, 'openid')) {
          return all.filter((profile) => profile.openid === query.openid);
        }
        if (query.UID?.kind === missingUidQuery.kind && query.UID?.value === false) {
          return all.filter((profile) => !Object.prototype.hasOwnProperty.call(profile, 'UID'));
        }
        throw new Error(`unexpected query: ${JSON.stringify(query)}`);
      };
      return {
        limit(limit) {
          return {
            async get() {
              return { data: clone(matching().slice(0, limit)) };
            },
          };
        },
        async count() {
          return { total: matching().length };
        },
      };
    },
    async add({ data }) {
      const id = `profile_${nextProfileId++}`;
      profiles.set(id, { _id: id, ...clone(data) });
      return { _id: id };
    },
  };
  const db = {
    command: {
      exists(value) {
        return { kind: 'exists', value };
      },
    },
    collection(name) {
      if (name === 'user_profile') {
        return {
          ...profileCollection,
          doc: profileDocument,
        };
      }
      if (name === 'player_uid_sequence') {
        return { doc: sequenceDocument };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
    async runTransaction(callback) {
      await callback({
        async get(reference) {
          if (reference._coll === 'user_profile') {
            return { data: () => clone(profiles.get(reference.id)) };
          }
          if (reference._coll === 'player_uid_sequence') {
            const sequence = sequences.get(reference.id);
            if (!sequence) throw new Error('document does not exist');
            return { data: () => clone(sequence) };
          }
          throw new Error(`unexpected transaction read: ${reference._coll}`);
        },
        async set(reference, data) {
          if (reference._coll !== 'player_uid_sequence') {
            throw new Error(`unexpected transaction set: ${reference._coll}`);
          }
          sequences.set(reference.id, clone(data));
        },
        async update(reference, data) {
          if (reference._coll !== 'user_profile') {
            throw new Error(`unexpected transaction update: ${reference._coll}`);
          }
          const profile = profiles.get(reference.id);
          if (!profile) throw new Error('document does not exist');
          Object.assign(profile, clone(data));
        },
      });
    },
  };
  return {
    cloud: {
      DYNAMIC_CURRENT_ENV: 'unit-env',
      init() {},
      database() {
        return db;
      },
      getWXContext() {
        return { OPENID: currentOpenid };
      },
    },
    getProfileByOpenid(openid) {
      return Array.from(profiles.values()).find((profile) => profile.openid === openid) || null;
    },
    addProfile(profile) {
      const id = `profile_${nextProfileId++}`;
      profiles.set(id, { _id: id, ...clone(profile) });
      return id;
    },
    setOpenid(openid) {
      currentOpenid = openid;
    },
    sequence() {
      return clone(sequences.get('default'));
    },
  };
}

function loadGetOpenid(harness) {
  const originalLoad = Module._load;
  delete require.cache[getOpenidPath];
  delete require.cache[playerUidPath];
  Module._load = function load(request, parent, isMain) {
    if (request === 'wx-server-sdk') return harness.cloud;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(getOpenidPath);
  } finally {
    Module._load = originalLoad;
  }
}

async function main() {
  const previousToken = process.env.PLAYER_UID_BACKFILL_TOKEN;
  process.env.PLAYER_UID_BACKFILL_TOKEN = 'unit-backfill-token';
  try {
    const harness = createCloudHarness();
    const getOpenid = loadGetOpenid(harness);

    const first = await getOpenid.main({ channel: 'unit' });
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.uid, '10000000');
    assert.strictEqual(first.profile.UID, '10000000');
    const firstProfile = harness.getProfileByOpenid('openid_new');
    assert.strictEqual(firstProfile.UID, '10000000');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(firstProfile, 'uid'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(firstProfile, 'playerUidCreatedAt'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(firstProfile, 'playerUidVersion'), false);
    assert.deepStrictEqual(harness.sequence(), { nextUid: 10000001 });

    const repeated = await getOpenid.main({ channel: 'unit' });
    assert.strictEqual(repeated.uid, '10000000');
    assert.strictEqual(repeated.profile.UID, '10000000');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(repeated.profile, 'uid'), false);
    assert.deepStrictEqual(harness.sequence(), { nextUid: 10000001 });

    harness.addProfile({ openid: 'openid_legacy', gold: 6 });
    const denied = await getOpenid.main({ action: 'backfill', adminToken: 'wrong-token' });
    assert.strictEqual(denied.ok, false);
    assert.strictEqual(harness.getProfileByOpenid('openid_legacy').UID, undefined);

    const dryRun = await getOpenid.main({ action: 'backfill', adminToken: 'unit-backfill-token' });
    assert.deepStrictEqual(dryRun, {
      ok: true,
      action: 'backfill',
      dryRun: true,
      missingProfiles: 1,
      processed: 0,
      remaining: 1,
    });
    const applied = await getOpenid.main({
      action: 'backfill',
      adminToken: 'unit-backfill-token',
      apply: true,
      batchSize: 1,
    });
    assert.deepStrictEqual(applied, {
      ok: true,
      action: 'backfill',
      dryRun: false,
      missingProfiles: 1,
      processed: 1,
      remaining: 0,
    });
    assert.strictEqual(harness.getProfileByOpenid('openid_legacy').UID, '10000001');

    const adminScript = require(path.join(root, 'scripts', 'player-uid-admin.js'));
    assert.strictEqual(adminScript.normalizePlayerUid('12345678'), '12345678');
    assert.throws(() => adminScript.normalizePlayerUid('01234567'));
    assert.strictEqual(adminScript.parseArgs(['--uid', '12345678']).uid, '12345678');
    assert.strictEqual(adminScript.parseArgs(['--backfill']).mode, 'backfill');

    const queryRequests = [];
    const originalFetch = global.fetch;
    const queryOutputDir = fs.mkdtempSync(path.join(root, 'temp-player-uid-query-'));
    const queryOutputPath = path.join(queryOutputDir, 'result.json');
    global.fetch = async (url) => {
      const requestUrl = new URL(url);
      const pathSegments = requestUrl.pathname.split('/').filter(Boolean);
      const collection = decodeURIComponent(pathSegments[pathSegments.length - 2]);
      queryRequests.push({
        collection,
        query: JSON.parse(requestUrl.searchParams.get('query')),
      });
      const list = collection === 'user_profile'
        ? [{ UID: '12345678', openid: 'openid_query' }]
        : collection === 'user_behavior'
          ? [{ openid: 'openid_query', eventName: 'level_pass', timestamp: 1 }]
          : [{ openid: 'openid_query', eventName: 'pch_guide_step_done', timestamp: 2 }];
      return {
        ok: true,
        async text() {
          return JSON.stringify({ list });
        },
      };
    };
    try {
      await adminScript.runQuery(
        { uid: '12345678', maxRecords: 5, outPath: queryOutputPath },
        { apiKey: 'unit-api-key', baseUrl: 'https://unit.example' },
      );
      const exported = JSON.parse(fs.readFileSync(queryOutputPath, 'utf8'));
      assert.strictEqual(exported.UID, '12345678');
      assert.strictEqual(exported.openid, 'openid_query');
      assert.strictEqual(exported.userBehavior.length, 1);
      assert.strictEqual(exported.firstLevelFunnel.length, 1);
      assert.deepStrictEqual(queryRequests, [
        { collection: 'user_profile', query: { UID: '12345678' } },
        { collection: 'user_behavior', query: { openid: 'openid_query' } },
        { collection: 'first_level_funnel', query: { openid: 'openid_query' } },
      ]);
    } finally {
      global.fetch = originalFetch;
      if (fs.existsSync(queryOutputPath)) fs.unlinkSync(queryOutputPath);
      fs.rmdirSync(queryOutputDir);
    }

    const analyticsSource = fs.readFileSync(path.join(root, 'assets', 'Scripts', 'Core', 'AnalyticsMgr.ts'), 'utf8');
    const settingsSource = fs.readFileSync(path.join(root, 'assets', 'Scripts', 'Core', 'Panels', 'SettingsPanelController.ts'), 'utf8');
    assert.match(analyticsSource, /getPlayerUid\(\): string/);
    assert.match(analyticsSource, /LS_ANALYTICS_PLAYER_UID/);
    assert.match(settingsSource, /PLAYER_UID_ROW_NAME = 'PlayerUidRow'/);
    assert.match(settingsSource, /PLAYER_UID_COPY_NAME = 'PlayerUidCopy'/);
    assert.match(settingsSource, /requirePlayerUidRow/);
    assert.match(settingsSource, /AnalyticsMgr\.inst\.getPlayerUid\(\)/);
    assert.match(settingsSource, /getMiniGameApi\('wx'\)/);
  } finally {
    if (previousToken === undefined) {
      delete process.env.PLAYER_UID_BACKFILL_TOKEN;
    } else {
      process.env.PLAYER_UID_BACKFILL_TOKEN = previousToken;
    }
  }
}

main().then(() => {
  console.log('player-uid-contract.test.js passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
