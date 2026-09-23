const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), {spawnSync} = require('child_process');
test('WeChat generated build configurations retain the RichText used by ProfilePanel', () => {
  const scene = JSON.parse(fs.readFileSync('assets/Scenes/Boot.scene.meta')).uuid;
  const prefab = JSON.parse(fs.readFileSync('assets/GameAssetsBundle/UI/Prefabs/Panels/ProfilePanel.prefab'));
  assert(prefab.some(x=>x.__type__==='cc.RichText'));
  const dir = fs.mkdtempSync(path.resolve('temp/profile-engine-test-'));
  for(const mode of ['release','debug']) {
    const file = path.join(dir,mode+'.json');
    const run = spawnSync(process.execPath,['scripts/write-wechat-build-config.js',file,'db://assets/Scenes/Boot.scene',scene,'--'+mode],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const config=JSON.parse(fs.readFileSync(file));
    assert(config.includeModules.includes('rich-text'));
    assert.equal(config.overwriteProjectSettings.includeModules['rich-text'],'on');
  }
});
