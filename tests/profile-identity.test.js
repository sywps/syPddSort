const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), ts = require('typescript');
function user(saved) {
    const values = new Map(saved ? [['pdd.user.profile.v1', JSON.stringify(saved)]] : []);
    const module = { exports: {} };
    const deps = {
        cc: { _decorator: { ccclass: () => cls => cls }, sys: { localStorage: { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v) } } },
        './MiniGamePlatform': { getWeChatMiniGameRuntime: () => null },
        './RuntimeLog': { runtimeLog() {} },
        './ProfileCustomizationMgr': { ProfileCustomizationMgr: { inst: { display: p => p, notifyIdentityChanged() {} } } },
        './UserStateSyncMgr': { UserStateSyncMgr: { inst: { queueSave() {} } } },
    };
    const js = ts.transpileModule(fs.readFileSync('assets/Scripts/Core/UserMgr.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true } }).outputText;
    new Function('module','exports','require',js)(module,module.exports,id=>{if(!deps[id])throw Error(id);return deps[id];});
    return module.exports.UserMgr.inst;
}
test('guest prefix migrates without changing the original suffix or authorized names', () => {
    assert.equal(user({uuid:'ab12cd34-rest',displayName:'游客AB12CD34',isGuest:true}).getProfile().displayName,'玩家AB12CD34');
    assert.equal(user({uuid:'ab12cd34-rest',displayName:'游客AB12CD34',isGuest:false}).getProfile().displayName,'游客AB12CD34');
    assert.match(user().getProfile().displayName,/^玩家[0-9A-F]{8}$/);
});
test('a newer guest cloud save never replaces valid authorized identity', () => {
    const mgr=user({uuid:'ab12cd34-rest',displayName:'授权名字',avatarUrl:'https://example.com/a.png',isGuest:false,lastActiveAt:1});
    mgr.applyCloudProfile({uuid:'ab12cd34-rest',displayName:'游客AB12CD34',isGuest:true,lastActiveAt:99,lastLevelId:100});
    assert.equal(mgr.getProfile().displayName,'授权名字');
    assert.equal(mgr.getProfile().lastLevelId,100);
});
