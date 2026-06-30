const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readJson(relPath) {
    return JSON.parse(read(relPath));
}

const levelCdn = read('assets/Scripts/Core/LevelDataCdnService.ts');
assert.ok(levelCdn.includes('FOREGROUND_CDN_REQUEST_ATTEMPTS = 2'), 'foreground CDN requests must retry once before failing');
assert.ok(levelCdn.includes('shouldDegradeExperimentToStable'), 'C/D experiment CDN failures must be able to retry stable CDN');
assert.ok(levelCdn.includes('buildStableContext(context.assignment)'), 'experiment degradation must keep the original bucket context while loading stable data');
assert.ok(levelCdn.includes('lastFailure: this.lastFailure'), 'CDN diagnostics must expose the last failure stage');
assert.ok(levelCdn.includes('lastDegradeReason: this.lastDegradeReason'), 'CDN diagnostics must expose experiment degradation reason');
assert.ok(levelCdn.includes('level_live.json minClientBuild unsupported'), 'level data manifest must enforce client build compatibility');

const firstLevelRoute = read('assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts');
assert.ok(firstLevelRoute.includes("setRemoteLoadFatalChildActive(card, 'RemoteLoadFatalErrorTitle', true)"), 'fatal overlay code must only toggle the scene-owned title');
assert.ok(firstLevelRoute.includes("setRemoteLoadFatalChildActive(card, 'RemoteLoadFatalErrorPath', false)"), 'fatal overlay code must hide internal path details from users');
assert.ok(!firstLevelRoute.includes("titleLabel.string ="), 'fatal overlay code must not own title copy');
assert.ok(!firstLevelRoute.includes("hintLabel.string ="), 'fatal overlay code must not own hint copy');
assert.ok(!firstLevelRoute.includes("pathLabel.string ="), 'fatal overlay code must not render internal level paths');
assert.ok(!firstLevelRoute.includes("detailLabel.string ="), 'fatal overlay code must not render internal error details');

for (const scenePath of [
    'assets/Scenes/UIPreview.scene',
    'assets/HomeAssetsBundle/Scenes/Home.scene',
    'assets/BootstrapBundle/Scenes/Game.scene',
]) {
    const scene = readJson(scenePath);
    const strings = scene
        .filter((entry) => entry && typeof entry._string === 'string')
        .map((entry) => entry._string);
    assert.ok(strings.includes('请重启小游戏'), `${scenePath} must own the short restart title`);
    assert.ok(strings.includes('资源更新中'), `${scenePath} must own the short update hint`);
    assert.ok(!strings.includes('资源加载失败'), `${scenePath} must not expose the old fatal title`);
    assert.ok(!strings.includes('请检查资源与配置后重新进入游戏'), `${scenePath} must not expose operator-facing copy`);
    assert.ok(!strings.includes('已停止进入默认关卡，避免关卡数据错乱'), `${scenePath} must not expose internal safety copy`);
    assert.ok(!strings.includes('LevelData/level_1'), `${scenePath} must not expose an internal level path placeholder`);
    assert.ok(!strings.includes('remote_load_error'), `${scenePath} must not expose an internal error placeholder`);
}

const addFunnelEvents = read('cloudfunctions/addFunnelEvents/index.js');
assert.ok(addFunnelEvents.includes('isSystemErrorLikeEvent(eventName, errorCode)'), 'cloud funnel logging must only expand nested diagnostics for error-like events');
assert.ok(addFunnelEvents.includes('sanitizeExtra(raw.extra, isSystemErrorLikeEvent(eventName, errorCode))'), 'cloud funnel events must gate nested extra sanitization');
assert.ok(addFunnelEvents.includes('allowNested'), 'cloud funnel extra sanitizer must support bounded nested diagnostics');
assert.ok(addFunnelEvents.includes('(error|failed|unavailable|missing|timeout|cdn|json|asset)'), 'cloud funnel error gate must focus on system error/failed events');

console.log('cdn-fallback-ui-logging.test.js passed');
