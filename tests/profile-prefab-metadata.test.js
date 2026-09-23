const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { ensureProfilePrefabMetadata } = require('../scripts/profile-prefab-metadata');
test('profile prefabs provide complete editor identities and preserve layout on repair', () => {
  for (const name of ['ProfilePanel', 'ArtworkPreview']) {
    const data = JSON.parse(fs.readFileSync(`assets/GameAssetsBundle/UI/Prefabs/Panels/${name}.prefab`));
    const ids = new Set();
    for (const [index, row] of data.entries()) {
      if (row.__type__ === 'cc.Node') {
        const info = data[row._prefab?.__id__];
        assert.equal(info?.__type__, 'cc.PrefabInfo');
        assert.equal(info.root.__id__, data[0].data.__id__);
        assert.equal(info.asset.__id__, 0);
        assert(!ids.has(info.fileId)); ids.add(info.fileId);
        for (const ref of row._children) assert.equal(data[ref.__id__]._parent.__id__, index);
        for (const ref of row._components) assert.equal(data[ref.__id__].node.__id__, index);
      } else if (row.node) {
        const info = data[row.__prefab?.__id__];
        assert.equal(info?.__type__, 'cc.CompPrefabInfo');
        assert(!ids.has(info.fileId)); ids.add(info.fileId);
      }
    }
    const snapshot = JSON.stringify(data);
    ensureProfilePrefabMetadata(data, name);
    assert.equal(JSON.stringify(data), snapshot, 'repeat generation must preserve existing identities and layout');
  }
});
