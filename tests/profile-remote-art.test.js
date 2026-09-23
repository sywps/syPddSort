'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), ts = require('typescript');
const catalog = require('../config/profile-assets/manifest.json').items;
const packagedGeometry = require('../openDataContext/profile-frames');
const original = require('../config/profile-assets/profile_live.json');
const clone = value => JSON.parse(JSON.stringify(value));
function loadTs(name, dependencies) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(`assets/Scripts/Core/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('module', 'exports', 'require', 'setTimeout', code)(module, module.exports, name => { if (!(name in dependencies)) throw Error(name); return dependencies[name]; }, fn => { fn(); return 0; });
  return module.exports;
}
const validator = loadTs('ProfileArtManifest', {});
function replacement() {
  const live = clone(original);
  for (const id of [1001, 2001]) {
    const row = live.items.find(x => x.id === id);
    row.sha256 = String(id === 1001 ? 'a' : 'b').repeat(64);
    row.asset = `${id}.${row.sha256.slice(0, 12)}.png`;
    row.width = row.height = 300;
    if (row.kind === 'frame') row.bounds = [60, 70, 240, 250];
  }
  live.dataVersion = 'c'.repeat(64);
  return live;
}
function harness(live = replacement(), storage = new Map(), offline = false) {
  const downloads = [], requests = [], failures = [];
  class SpriteFrame { addRef() {} }
  const dependencies = {
    cc: { SpriteFrame, ImageAsset: class {}, Texture2D: class {}, assetManager: {
      loadRemote(url, options, callback) { downloads.push(url); const row = live.items.find(x => url.endsWith(x.asset)); callback(null, { width: row.width, height: row.height }); },
      getBundle() { return { load(path, type, callback) { const frame = new SpriteFrame(); frame.local = path; callback(null, frame); } }; },
    } },
    './ProfileCustomizationConfig': { PROFILE_ITEMS: catalog, PROFILE_FRAME_GEOMETRY: packagedGeometry, profileItem: id => { const row = catalog.find(x => x.id === id); if (!row) throw Error('bad id'); return row; } },
    './ProfileArtManifest': validator,
    './ProfileDiagnostics': { reportProfileFailure: (...args) => failures.push(args) },
    './RemoteDataCdnClient': {
      normalizeCdnBaseUrl: value => value || '', shouldUseLocalLevelDataMirror: () => false,
      requestCdnText: async url => { requests.push(url); if (offline) throw Error('offline'); return JSON.stringify(live); },
      readCdnStorageObject: key => storage.get(key), writeCdnStorageObject: (key, value) => storage.set(key, value),
    },
  };
  const module = loadTs('ProfileResourceService', dependencies);
  return { service: module.ProfileResourceService, ...module, downloads, requests, failures, storage };
}
test('remote manifest accepts new artwork for fixed IDs and rejects malformed contracts', () => {
  assert.equal(validator.validateProfileArtManifest(replacement(), catalog).items[0].width, 300);
  for (const mutate of [x => x.items.pop(), x => x.items.push(x.items[0]), x => x.items[0].asset = '../a.png', x => x.items[0].width = 0, x => x.items.find(r => r.kind === 'frame').bounds = [0, 0, 9000, 20]]) {
    const data = replacement(); mutate(data); assert.throws(() => validator.validateProfileArtManifest(data, catalog));
  }
});
test('fresh client loads new default art and its geometry from one snapshot, with isolated slot caches', async () => {
  const a = 'https://example.com/a/profile/', b = 'https://example.com/b/profile/';
  globalThis.__PDD_PROFILE_DATA_CDN_URL__ = a;
  try {
    const h = harness();
    const [portrait, frame] = await Promise.all([h.service.load(1001), h.service.load(2001)]);
    assert(!portrait.local); assert(!frame.local); assert.equal(h.requests.length, 1);
    assert.deepEqual(h.service.geometry(frame, 2001), { width: 300, height: 300, bounds: [60, 70, 240, 250] });
    assert.equal(h.profileAssetUrl(1001), a + replacement().items[0].asset);
    const bundled = await h.service.loadDefault(2001);
    assert.deepEqual(h.service.geometry(bundled, 2001), packagedGeometry[2001]);
    globalThis.__PDD_PROFILE_DATA_CDN_URL__ = b;
    await h.service.prepare(); assert.equal(h.requests.length, 2); assert.equal(h.storage.size, 2);
    const nextLaunch = harness(original);
    await nextLaunch.service.load(1001);
    assert.equal(nextLaunch.downloads[0], b + original.items[0].asset);
  } finally { delete globalThis.__PDD_PROFILE_DATA_CDN_URL__; }
});
test('manifest failure is diagnosed, retains only same-slot valid cache, and has bounded retries', async () => {
  const base = 'https://example.com/a/profile/';
  globalThis.__PDD_PROFILE_DATA_CDN_URL__ = base;
  try {
    const storage = new Map();
    await harness(replacement(), storage).service.prepare();
    const cached = harness(replacement(), storage, true);
    await cached.service.load(2001); assert.equal(cached.requests.length, 2); assert(cached.failures.some(x => x[0] === 'manifest'));
    globalThis.__PDD_PROFILE_DATA_CDN_URL__ = 'https://example.com/b/profile/';
    const failed = harness(replacement(), storage, true);
    assert((await failed.service.load(1001)).local);
    await assert.rejects(failed.service.load(1002)); assert.equal(failed.requests.length, 2); assert.equal(failed.downloads.length, 0);
  } finally { delete globalThis.__PDD_PROFILE_DATA_CDN_URL__; }
});
test('friend worker uses new same-ID art and geometry even with old stored URLs', () => {
  const worker = require('../openDataContext/profile-live');
  const baseUrl = 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat_b/profile/';
  try {
    worker.accept({ baseUrl, manifest: replacement() });
    assert.equal(worker.url('old-url', 1001), baseUrl + replacement().items[0].asset);
    assert.deepEqual(worker.geometry(2001).bounds, [60, 70, 240, 250]);
    assert.throws(() => worker.accept({ baseUrl: 'https://evil.example/', manifest: replacement() }));
    assert.equal(worker.assets()[2001].asset, '2001.bbbbbbbbbbbb.png');
  } finally { worker.accept(null); }
});
