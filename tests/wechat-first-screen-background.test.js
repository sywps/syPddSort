const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const builder = JSON.parse(read('settings/v2/packages/builder.json'));
const postbuild = read('scripts/postbuild-wechat-minigame.js');
const buildWechat = read('scripts/build-wechat.js');

const splash = builder['splash-setting'];
assert.ok(splash, 'wechat build config must keep splash-setting');
assert.deepStrictEqual(
    splash.clearColor,
    {
        x: 0.9607843137254902,
        y: 0.9215686274509803,
        z: 0.8627450980392157,
        w: 1,
    },
    'wechat splash clearColor must match the light project loading background',
);
assert.deepStrictEqual(
    splash.background?.color,
    splash.clearColor,
    'wechat splash background color must be explicit so Cocos first-screen cannot fall back to near-black',
);

assert.ok(
    postbuild.includes('const WECHAT_FIRST_SCREEN_BG_COLOR'),
    'postbuild must define the canonical WeChat first-screen background color',
);
assert.ok(
    postbuild.includes('patchWechatFirstScreenBackground(patchedFirstScreen)'),
    'postbuild must patch generated first-screen.js bgColor',
);
assert.ok(
    !postbuild.includes('injectDevtoolsStartupGameTrace'),
    'postbuild must not inject temporary DevTools startup tracing',
);
assert.ok(
    !postbuild.includes('injectDevtoolsFirstScreenTrace'),
    'postbuild must not inject temporary first-screen tracing',
);
assert.ok(
    !postbuild.includes('injectDevtoolsApplicationTrace'),
    'postbuild must not inject temporary application tracing',
);
assert.ok(
    !postbuild.includes('[PDD_STARTUP_TRACE]'),
    'postbuild must not emit temporary startup trace markers',
);
assert.ok(
    !postbuild.includes('wx.loadSubpackage.call.'),
    'postbuild must not wrap WeChat subpackage loading for diagnostics',
);
assert.ok(
    postbuild.includes("normalizeMainBundleAsLocal(resolveRuntimeRoot(), resolveSettingsPath())"),
    'startup main must be normalized into a local bundle before Cocos reads preloadBundles',
);
assert.ok(
    postbuild.includes('pruneConvertedMainBundleEntrypoints(runtimeRoot, settingsFilePath)'),
    'local main conversion must remove only byte-identical legacy subpackage entry copies',
);
assert.ok(
    postbuild.includes('normalizeWechatSplashSettings(settingsPath)'),
    'postbuild must normalize generated settings splash colors',
);
assert.ok(
    buildWechat.includes('assertWechatFirstScreenBackground(runtimeDir, settings);'),
    'wechat build wrapper must fail fast when generated first-screen background is unsafe',
);
assert.ok(
    buildWechat.includes("firstScreen.includes('let bgColor = ' + wechatFirstScreenBgLiteral + ';')"),
    'wechat build wrapper must inspect the actual generated first-screen.js',
);

console.log('wechat-first-screen-background.test.js passed');
