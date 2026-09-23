const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const ts = require('typescript');
test('browser friend self row follows current customization on every render', () => {
  const source = fs.readFileSync('assets/Scripts/Core/GameCtrlModules/GuideLeaderboardModule.ts', 'utf8');
  const start = source.indexOf('showUnsupportedFriendLeaderboard(selfBox: Node)');
  const end = source.indexOf('async loadWeChatFriendLeaderboard', start);
  const code = ts.transpileModule(`const methods = {${source.slice(start, end)}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  let profile = { displayName: '玩家123', avatarUrl: 'selected.png', avatarId: 1004, frameId: 2003, lastLevelId: 153 };
  const methods = new Function('UserMgr', code + ';return methods;')({ inst: {
    getProfile() { throw Error('raw account profile must not be used'); },
    getDisplayProfile() { return profile; },
  } });
  const box = {}; let result;
  const runtime = { renderLeaderboardSelfEntry(node, entry) { assert.equal(node, box); result = entry; } };
  for (const id of [1004, 1005]) {
    profile = { ...profile, avatarId: id };
    methods.showUnsupportedFriendLeaderboard.call(runtime, box);
    assert.equal(result.avatarId, id); assert.equal(result.frameId, 2003);
    assert.equal(result.avatarUrl, profile.avatarUrl); assert.equal(result.displayName, profile.displayName);
    assert.equal(result.progressLevel, 153); assert.equal(result.rank, 0);
  }
});
