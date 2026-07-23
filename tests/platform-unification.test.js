const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const miniGamePlatform = read('assets/Scripts/Core/MiniGamePlatform.ts');
const installPlatformModules = read('assets/Scripts/Platform/installPlatformGameCtrlModules.ts');
const installDouyinModules = read('assets/Scripts/Platform/Douyin/installDouyinGameCtrlModules.ts');
const douyinSidebar = read('assets/Scripts/Platform/Douyin/DouyinSidebarModule.ts');
const writeWechatBuildConfig = read('scripts/write-wechat-build-config.js');
const writeDouyinBuildConfig = read('scripts/write-douyin-build-config.js');
const postbuildDouyin = read('scripts/postbuild-douyin.js');

const douyinMarkerIndex = miniGamePlatform.indexOf('if (hasDouyinBuildMarker()) return');
const wechatMarkerIndex = miniGamePlatform.indexOf('if (hasWeChatBuildMarker()) return');
const previewParamIndex = miniGamePlatform.indexOf('const previewPlatform = getBrowserPreviewPlatformParam()');
assert.ok(douyinMarkerIndex >= 0, 'platform source must check Douyin build marker');
assert.ok(wechatMarkerIndex >= 0, 'platform source must check WeChat build marker');
assert.ok(previewParamIndex >= 0, 'platform source must support browser preview platform param');
assert.ok(douyinMarkerIndex < previewParamIndex, 'build marker must take priority over browser platform param');
assert.ok(wechatMarkerIndex < previewParamIndex, 'build marker must take priority over browser platform param');
assert.ok(miniGamePlatform.includes("params.get('platform')"), 'browser preview platform must use platform query param');
assert.ok(miniGamePlatform.includes("normalized === 'wechat'"), 'platform param must support wechat');
assert.ok(miniGamePlatform.includes("normalized === 'douyin'"), 'platform param must support douyin');
assert.ok(!miniGamePlatform.includes("if (buildPlatform === 'wechat') return true;"), 'wechat build/preview marker alone must not be treated as a real wx runtime');
const wechatRuntimeFunction = miniGamePlatform.match(/export function isWeChatMiniGameRuntime\(\): boolean \{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(wechatRuntimeFunction.includes("if (buildPlatform === 'douyin') return false;"), 'WeChat runtime detection must still reject Douyin builds');
assert.ok(wechatRuntimeFunction.includes('const wxRuntime = getWeChatRuntimeCandidate();'), 'WeChat runtime detection must inspect real wx APIs');
assert.ok(wechatRuntimeFunction.includes("typeof wxRuntime?.request === 'function'"), 'WeChat runtime detection must require wx.request for CDN-capable runtime');
assert.ok(wechatRuntimeFunction.includes('wxRuntime?.getSystemInfoSync'), 'WeChat runtime detection must accept wx.getSystemInfoSync');
assert.ok(wechatRuntimeFunction.includes('wxRuntime?.getDeviceInfo'), 'WeChat runtime detection must accept wx.getDeviceInfo');
assert.ok(wechatRuntimeFunction.includes('wxRuntime?.cloud'), 'WeChat runtime detection must accept wx.cloud');
assert.ok(wechatRuntimeFunction.includes('wxRuntime?.getStorageSync'), 'WeChat runtime detection must accept wx storage as a runtime marker');

assert.ok(installPlatformModules.includes("import { runtimeLog } from '../Core/RuntimeLog';"), 'platform installer must gate debug logging');
assert.ok(!installPlatformModules.includes('hasDouyinBuildMarker'), 'platform installer must not duplicate build marker checks');
assert.ok(!installPlatformModules.includes('getMiniGameApi'), 'platform installer must not probe platform APIs directly');
assert.ok(!installPlatformModules.includes('console.log'), 'platform installer must not log directly');

assert.ok(installDouyinModules.includes("import { runtimeLog } from '../../Core/RuntimeLog';"), 'Douyin installer must gate debug logging');
assert.ok(!installDouyinModules.includes('console.log'), 'Douyin installer must not log directly');

assert.ok(douyinSidebar.includes("import { getDouyinMiniGameRuntime } from '../../Core/MiniGamePlatform';"), 'Douyin sidebar must use unified platform runtime getter');
assert.ok(!douyinSidebar.includes('declare const tt'), 'Douyin sidebar must not declare direct tt runtime');
assert.ok(!douyinSidebar.includes('function getDouyinApi'), 'Douyin sidebar must not keep a parallel Douyin API detector');
assert.ok(!douyinSidebar.includes('console.log(`[douyin-sidebar]'), 'Douyin sidebar must not log directly');
assert.ok(!douyinSidebar.includes("console.warn('[douyin-sidebar]"), 'Douyin sidebar must not warn directly');

assert.ok(writeWechatBuildConfig.includes("const platformConfig = require('./minigame-platform-config.js');"), 'WeChat build config must use shared platform config');
assert.ok(writeDouyinBuildConfig.includes("const platformConfig = require('./minigame-platform-config.js');"), 'Douyin build config must use shared platform config');
assert.ok(writeWechatBuildConfig.includes('experimentalEraseModules: true'), 'WeChat build must keep performance erase modules optimization');
assert.ok(writeDouyinBuildConfig.includes('experimentalEraseModules: true'), 'Douyin build must keep performance erase modules optimization');
assert.ok(postbuildDouyin.includes("const requiredOrder = ['main'];"), 'Douyin startup preload must only require main');
assert.ok(postbuildDouyin.includes("|| name === 'bootstrap'"), 'Douyin postbuild must remove bootstrap from startup preload');

console.log('platform-unification.test.js passed');
