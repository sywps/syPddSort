'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..'), logs = path.join(root, '.planning/douyin-multiplayer-plan-20261012/test-logs');
fs.mkdirSync(logs, { recursive: true });
const cases = [
    ['scripts/build-douyin-multiplayer.js', '--check'],
    ['tests/douyin-multiplayer-cloud.test.js'], ['tests/douyin-multiplayer-client.test.js'],
    ['tests/douyin-business-cloud.test.js'], ['tests/douyin-prod-cloud.test.js'],
    ['tests/coop-client.test.js'], ['tests/pvp-client-economy.test.js'], ['tests/douyin-multiplayer-callers.test.js'],
];
let failed = false;
for (const args of cases) {
    const result = spawnSync(process.execPath, args, { cwd: root, windowsHide: true, encoding: 'utf8' });
    const name = path.basename(args[0]), output = (result.stdout || '') + (result.stderr || '');
    fs.writeFileSync(path.join(logs, name + '.log'), output);
    const passed = result.status === 0 && !result.error;
    console.log((passed ? 'PASS ' : 'FAIL ') + name);
    if (!passed) { failed = true; console.error(result.error || output.slice(-3500)); }
}
process.exitCode = failed ? 1 : 0;
