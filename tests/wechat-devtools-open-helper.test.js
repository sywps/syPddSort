const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const helper = read('scripts/open-wechat-devtools.js');
const buildWechat = read('scripts/build-wechat.js');
const pkg = JSON.parse(read('package.json'));

assert.ok(helper.includes("DEFAULT_CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'"), 'helper must use the WeChat DevTools CLI entry');
assert.ok(helper.includes("'open', '--project'") || helper.includes("[command, '--project'"), 'helper must call CLI open/auto with --project');
assert.ok(helper.includes("if (port) cliArgs.push('--port'"), 'helper must only pass CLI --port when explicitly configured');
assert.ok(helper.includes("openPort: process.env.WECHAT_DEVTOOLS_OPEN_PORT || ''"), 'helper must not force a default open port when DevTools is already running');
assert.ok(helper.includes("'--trust-project'"), 'auto mode must trust the generated project explicitly');
assert.ok(helper.includes("path.resolve(args.project)"), 'helper must resolve the package project to an absolute path');
assert.ok(helper.includes("compileType !== 'game'"), 'helper must reject non-game project configs');
assert.ok(helper.includes("game.json 缺少分包"), 'helper must validate required subpackages before opening DevTools');

assert.ok(buildWechat.includes("scripts', 'open-wechat-devtools.js'"), 'wechat build auto-open must reuse the CLI helper');
assert.ok(!buildWechat.includes("Contents/MacOS/wechatwebdevtools';"), 'wechat build auto-open must not use the old app executable path');

assert.strictEqual(pkg.scripts['wechat:devtools:open'], 'node scripts/open-wechat-devtools.js --mode open');
assert.strictEqual(pkg.scripts['wechat:devtools:auto'], 'node scripts/open-wechat-devtools.js --mode auto');

console.log('wechat-devtools-open-helper.test.js passed');
