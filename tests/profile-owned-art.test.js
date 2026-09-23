const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const crypto = require('crypto');
const { PNG } = require('pngjs');
const manifest = require('../config/profile-assets/manifest.json');
const sources = require('../config/profile-art-source/catalog.json');
const geometry = require('../openDataContext/profile-frames');
const vm = require('vm');

test('only the 25 owned artworks ship and all mirrors match the immutable manifest', () => {
  assert.equal(manifest.version, 2);
  assert.equal(manifest.items.filter(x => x.kind === 'avatar').length, 12);
  assert.equal(manifest.items.filter(x => x.kind === 'frame').length, 13);
  assert.equal(sources.items.find(x => x.id === 1001).source, '头像1.png');
  assert.equal(sources.items.find(x => x.id === 2001).source, 'ChatGPT Image 2026年9月18日 14_13_38 (8).png');
  assert(!sources.items.some(x => x.source.includes('14_13_37 (6)')));
  assert.equal(manifest.items.find(x => x.id === 2001).unlock, 'default');
  assert(!manifest.items.some(x => x.id === 2002));
  assert.deepEqual(fs.readdirSync('config/profile-assets').filter(x => x.endsWith('.png')).sort(), manifest.items.map(x => x.asset).sort());
  assert.deepEqual(fs.readdirSync('assets/LevelData/ProfilePreview').filter(x => x.endsWith('.png')).sort(), manifest.items.map(x => `${x.id}.png`).sort());
  for (const row of manifest.items) {
    const bytes = fs.readFileSync(`config/profile-assets/${row.asset}`);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), row.sha256);
    assert(bytes.equals(fs.readFileSync(`assets/LevelData/ProfilePreview/${row.id}.png`)));
    const m = JSON.parse(fs.readFileSync(`assets/LevelData/ProfilePreview/${row.id}.png.meta`)).subMetas.f9941.userData;
    assert.equal(m.width, row.width); assert.equal(m.height, row.height);
    if (row.kind === 'frame') {
      const p = PNG.sync.read(bytes), g = geometry[row.id];
      assert.equal(g.width, p.width); assert.equal(g.height, p.height);
      assert.deepEqual(g.bounds, [49, 49, 207, 207]);
      assert.equal(p.data[(Math.floor(p.height / 2) * p.width + Math.floor(p.width / 2)) * 4 + 3], 0);
      assert(g.bounds[0] > 0 && g.bounds[2] < p.width);
    }
  }
  for (const [id, file] of [[1001, 'leaderboard_avatar_default'], [2001, 'leaderboard_avatar_frame']]) {
    const bytes = fs.readFileSync(`config/profile-assets/${manifest.items.find(x => x.id === id).asset}`);
    assert(bytes.equals(fs.readFileSync(`assets/HomeAssetsBundle/GameUI/Profile/${id}.png`)));
    assert(bytes.equals(fs.readFileSync(`openDataContext/ranking/${file}.png`)));
  }
});

test('friend rows keep frame 2014 and remap old artwork URLs to the current catalog', () => {
  const source = fs.readFileSync('openDataContext/index.js', 'utf8');
  const scope = { console, require: name => { assert.equal(name, './profile-live'); return require('../openDataContext/profile-live'); } };
  vm.runInNewContext(source.slice(source.indexOf('function readGameProfile('), source.indexOf('function renderFullLeaderboard(')), scope);
  const base = 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat_b/profile/';
  const row = scope.readGameProfile({ KVDataList: [{ key: 'profile_v1', value: JSON.stringify({ version: 1, displayName: '玩家ABC', avatarId: 1036, frameId: 2014, avatarUrl: base + '1036.abcdefabcdef.png', frameUrl: base + '2014.abcdefabcdef.png' }) }] });
  assert.equal(row.avatarId, 1001); assert.equal(row.frameId, 2014);
  assert.equal(row.avatarUrl, base + manifest.items.find(x => x.id === 1001).asset);
  assert.equal(row.frameUrl, base + manifest.items.find(x => x.id === 2014).asset);
});
