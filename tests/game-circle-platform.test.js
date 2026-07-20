const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const platform = read('assets/Scripts/Core/MiniGamePlatform.ts');
const panel = read('assets/Scripts/Core/Panels/GameCirclePanelController.ts');
const sceneHome = read('assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts');
const sceneRuntime = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const postbuild = read('scripts/postbuild-wechat-minigame.js');

assert.ok(platform.includes('getWeChatMiniGameWindowInfo'), 'Game Circle must use full WeChat window diagnostics');
assert.ok(platform.includes('normalizeNativeButtonStyle(style, windowInfo)'), 'native Game Circle button style must be clamped against the WeChat window');
assert.ok(platform.includes("type: 'text'"), 'native Game Circle button should use transparent text mode');
assert.ok(!platform.includes("icon: 'green'"), 'text-mode native Game Circle button must not pass image-only icon');
assert.ok(platform.includes("text: '进入游戏圈'"), 'native Game Circle button must keep the SDK text action target');
assert.ok(platform.includes("backgroundColor: 'rgba(0, 0, 0, 0)'"), 'native Game Circle button must be a transparent hit layer');
assert.ok(platform.includes("borderColor: 'rgba(0, 0, 0, 0)'"), 'native Game Circle button border must be transparent');
assert.ok(platform.includes("color: 'rgba(0, 0, 0, 0)'"), 'native Game Circle button text must be transparent so the Cocos prefab remains the visual source');
assert.ok(!platform.includes("backgroundColor: '#07c160'"), 'native Game Circle button must not expose the WeChat green text button');
assert.ok(platform.includes('if (target) options.openlink = target;'), 'Game Circle openlink must be omitted when no valid target is configured');
assert.ok(platform.includes("throw new Error('[GameCircle] wx runtime is unavailable')"), 'Game Circle must fail fast when wx runtime is missing');
assert.ok(platform.includes("throw new Error('[GameCircle] wx.createGameClubButton is unavailable')"), 'Game Circle must fail fast when the native API is missing');
assert.ok(platform.includes('button.show();'), 'native Game Circle button creation must show the SDK button directly');
assert.ok(!platform.includes('ok: false'), 'Game Circle platform code must not return soft failure results');

assert.ok(panel.includes('clampRectToWindow'), 'Game Circle panel must clamp the native hit rect to the device window');
assert.ok(panel.includes('GAME_CIRCLE_NATIVE_HIT_PADDING'), 'Game Circle native hit rect must include tap padding');
assert.ok(panel.includes('resolveUiVisibleLowerLeft'), 'Game Circle panel must convert centered Cocos UI coordinates before mapping to the WeChat window');
assert.ok(panel.includes('rect.left >= -epsilon'), 'Game Circle native rect must first detect bottom-left Cocos UI coordinates');
assert.ok(panel.includes('-visibleSize.width / 2'), 'Game Circle native rect must handle Canvas-centered UI coordinates');
assert.ok(panel.includes('leftUi - visibleLowerLeft.x'), 'Game Circle native rect must be based on the resolved UI visible lower-left origin');
assert.ok(panel.includes('runtime.bindPanelButton(enterBtn'), 'visible Game Circle button must detect missed native-button coverage');
assert.ok(panel.includes('Cocos EnterBtn received the tap'), 'Cocos Game Circle button taps must report a placement/API error instead of opening a fallback path');
assert.ok(!panel.includes('openByPageManager'), 'Game Circle must not call PageManager from a Cocos button');
assert.ok(!panel.includes('openWeChatGameCirclePage'), 'Game Circle panel must not trigger openPage directly');
assert.ok(!panel.includes('runtimeWarn'), 'Game Circle platform failures must not be downgraded to warnings');
assert.ok(!panel.includes('showToast'), 'Game Circle platform failures must not be downgraded to Toast messages');
assert.ok(panel.includes('destroy(): void'), 'Game Circle controller must expose scene-owner cleanup for its native button');
assert.ok(sceneRuntime.includes('this.runtime._gameCirclePanelController?.destroy?.();'), 'scene teardown must destroy any surviving native Game Circle button');
assert.ok(sceneRuntime.includes('UserMgr.inst.destroyUserInfoButtons();'), 'scene teardown must destroy any surviving native user-info button');

assert.ok(sceneHome.includes("const GAME_CIRCLE_OPENLINK = '';"), 'default Game Circle entry must open the Game Circle home page instead of a stale hard-coded openlink');

assert.ok(postbuild.includes("WECHAT_GAME_CIRCLE_MIN_LIB_VERSION = '2.30.3'"), 'WeChat build must pin the minimum Game Circle openlink base library');
assert.ok(postbuild.includes('compareVersion(libVersion, WECHAT_GAME_CIRCLE_MIN_LIB_VERSION) < 0'), 'WeChat build must bump too-low libVersion values');
assert.ok(postbuild.includes("WECHAT_GAME_CIRCLE_PLUGIN_NAME = 'MiniGameCommon'"), 'WeChat build must know the optional Game Circle plugin name');
assert.ok(postbuild.includes("WECHAT_GAME_CIRCLE_PLUGIN_PROVIDER = 'wxaed5ace05d92b218'"), 'WeChat build must keep the documented MiniGameCommon provider for authorized builds');
assert.ok(postbuild.includes('WECHAT_GAME_CIRCLE_PLUGIN_ENABLED'), 'WeChat Game Circle plugin declaration must be gated by an explicit env flag');
assert.ok(postbuild.includes('removeWechatGameCirclePluginConfig'), 'WeChat build must remove stale unauthorized Game Circle plugin declarations by default');
assert.ok(postbuild.includes('游戏圈 MiniGameCommon 插件声明已跳过'), 'WeChat build must skip the unauthorized MiniGameCommon plugin by default');
assert.ok(postbuild.includes('var gameCirclePluginEnabled = ensureWechatGameCirclePluginInGameJson'), 'WeChat build must report whether the optional plugin was enabled');

console.log('game-circle-platform.test.js passed');
