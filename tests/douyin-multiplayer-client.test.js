'use strict';
const assert = require('node:assert/strict'), fs = require('fs'), ts = require('typescript'), vm = require('vm');
function load(name, dependencies) {
    const code = ts.transpileModule(fs.readFileSync('assets/Scripts/Core/' + name + '.ts', 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true }
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, require: dependencies, console, Date });
    return module.exports;
}
async function main() {
    let platform = 'douyin', failed = false, launch = { query: { coopPost: 'a'.repeat(24) } };
    const shared = [], requests = [], telemetry = [];
    const tt = { getEnterOptionsSync: () => launch, shareAppMessage: payload => shared.push(payload) };
    const config = require('../cloudfunctions-douyin/multiplayer/coop/runtime/CoopModeConfig');
    const full = require('../cloudfunctions-douyin/multiplayer/coop/levels/coop_level_1.json');
    const { CoopServiceMgr } = load('CoopServiceMgr', id => {
        if (id === 'cc') return { sys: { localStorage: {} }, JsonAsset: class {} };
        if (id === './MiniGamePlatform') return { getWeChatMiniGameRuntime: () => null, getDouyinMiniGameRuntime: () => tt, isMiniGameRuntime: () => true };
        if (id === './RemoteDataCdnClient') return { isLocalBrowserPreview: () => false };
        if (id === './CoopModeConfig') return config;
        if (id === './PvpHumanReplay') return require('../cloudfunctions-douyin/multiplayer/coop/runtime/PvpHumanReplay');
        if (id === './UserMgr') return { UserMgr: { inst: { getDisplayProfile: () => ({ displayName: '玩家' }) } } };
        if (id === './AnalyticsMgr') return { AnalyticsMgr: { inst: { trackMultiplayerLobby: (...args) => telemetry.push(args) } } };
        if (id === './PlatformCloudMgr') return { PlatformCloudMgr: { inst: { getPlatform: () => platform, init: async () => true,
            async callFunction(name, data) {
                requests.push({ name, data }); if (failed) throw Error('network unavailable');
                return data.action === 'level' ? { ok: true, level: full, levelHash: config.coopLevelHash(full) } : { ok: true, overview: { unlocked: {} } };
            } } } };
        if (id.includes('WeChatShareReturnService')) return { applyLocalWeChatShareMaterial() { throw Error('Douyin must not use WeChat share material'); } };
        if (id === './CoopBrowserRuntime' || id === './CoopBrowserStore') return {};
        throw Error('unknown client dependency: ' + id);
    });
    const mgr = new CoopServiceMgr();
    assert.equal(mgr.launchPostId(), 'a'.repeat(24));
    launch = { query: { coopPost: 'b'.repeat(24) } }; assert.equal(mgr.launchPostId(), 'b'.repeat(24), 'hot entry re-reads current invite');
    launch = { query: { coopPost: '../invalid' } }; assert.equal(mgr.launchPostId(), '');
    mgr.share({ id: 'a'.repeat(24), creatorDone: true });
    assert.equal(shared[0].query, 'coopPost=' + 'a'.repeat(24)); assert(shared[0].title);
    assert.throws(() => mgr.share({ creatorDone: false }), /先拼完/);
    await mgr.overview();
    assert.equal(requests[0].name, 'coopService'); assert.equal(requests[0].data.rulesVersion, config.COOP_RULES_VERSION);
    await mgr.fullLevel({ _loadLevelDataFromConfiguredSource() { throw Error('must use cloud authoritative level'); } }, 1);
    assert.equal(requests[1].data.action, 'level');
    failed = true; await assert.rejects(mgr.overview(), /network unavailable/);
    assert.equal(telemetry.at(-1)[3], false); assert.equal(telemetry[0][3], true);
    platform = 'none'; await assert.rejects(mgr.overview(), /需要小游戏云服务/);
    console.log('PASS Douyin coop client: native invitation query, sharing, authoritative cloud levels, cloud calls and explicit failures');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
