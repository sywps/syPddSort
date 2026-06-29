const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const openDataGame = read('openDataContext/game.js');
const buildWechat = read('scripts/build-wechat.js');
const postbuildWechat = read('scripts/postbuild-wechat-minigame.js');
const writeWechatBuildConfig = read('scripts/write-wechat-build-config.js');

assert.ok(
    openDataGame.includes("require('./index.js')"),
    'openDataContext/game.js must load only the lightweight open-data implementation',
);

for (const marker of ['cocos-js', 'src/settings', 'application.', 'System.register', '__ccSettings', '_virtual_cc', 'assetManager']) {
    assert.ok(
        !openDataGame.includes(marker),
        `openDataContext/game.js must not include Cocos marker: ${marker}`,
    );
}

assert.ok(
    buildWechat.includes('function assertOpenDataContextConfig(runtimeDir, gameJson)'),
    'wechat build must validate openDataContext package shape',
);
assert.ok(
    buildWechat.includes("const stagingBuildName = 'wechatgame-staging'"),
    'wechat build must write Cocos output to a staging directory before publishing build/wechatgame',
);
assert.ok(
    buildWechat.includes('promoteStagingBuild()'),
    'wechat build must publish build/wechatgame only after all postbuild assertions pass',
);
assert.ok(
    buildWechat.indexOf('const subpackageRoot = findSubpackageRoot(gameJson || {}, bundleName)') <
    buildWechat.indexOf("const localDir = path.join(runtimeDir, 'assets', bundleName)"),
    'wechat build must validate real subpackage bundle dirs before any leftover assets/<bundle> dirs',
);

for (const marker of ['System.register', '__ccSettings', '_virtual_cc', 'assetManager', '"packs"', "'packs'"]) {
    assert.ok(
        buildWechat.includes(marker),
        `wechat build must reject openDataContext files containing marker: ${marker}`,
    );
}

assert.ok(
    buildWechat.includes('projectConfig.subContext !== expectedSubContext'),
    'wechat build must validate project.config.json subContext points to the final package openDataContext dir',
);
assert.ok(
    buildWechat.includes("path.posix.join("),
    'wechat build must expect project.config.json subContext relative to the final package root',
);
assert.ok(
    buildWechat.includes('开放数据域不应包含嵌套 project.config.json'),
    'wechat build must reject nested project.config.json inside openDataContext',
);
assert.ok(
    postbuildWechat.includes("rootProjectConfig.subContext = 'minigame/openDataContext'"),
    'wechat postbuild must write subContext relative to the final package root',
);
assert.ok(
    postbuildWechat.includes('已移除开放数据域嵌套 project.config.json'),
    'wechat postbuild must remove nested openDataContext project.config.json',
);
assert.ok(
    writeWechatBuildConfig.includes('normalizeOutputName(outputNameArg)'),
    'wechat build config writer must accept the staging outputName from build-wechat.js',
);

console.log('open-data-context-package.test.js passed');
