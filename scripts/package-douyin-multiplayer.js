'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const { execFileSync } = require('child_process');
const acorn = require('acorn');
const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(__dirname, 'build-douyin-multiplayer.js'), '--check'], { stdio: 'inherit', windowsHide: true });
const output = path.join(root, 'artifacts/douyin-multiplayer-dev-v1');
fs.mkdirSync(path.join(output, 'functions'), { recursive: true });
const changed = ['businessCommon', 'chapterRewardSync', 'multiplayerStore', 'multiplayerRuntime', 'multiplayerCommon', 'coopService', 'pvpService', 'multiplayerSetup', 'multiplayerMaintenance'];
const files = [...changed, 'adminAuth', 'businessRules'].map(name => {
    const code = fs.readFileSync(path.join(root, 'cloudfunctions-douyin', name + '.js'), 'utf8');
    new vm.Script(code, { filename: name });
    // Cloud runtime rejects ES2021 logical assignment even when local Node accepts it.
    acorn.parse(code, { ecmaVersion: 2020, sourceType: 'script' });
    fs.writeFileSync(path.join(output, 'functions', name + '.js'), code);
    return { name: name + '.js', code, update: changed.includes(name), sha256: crypto.createHash('sha256').update(code).digest('hex') };
});
for (const file of files) for (const match of file.code.matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g)) {
    // The generated bundle's internal requires are resolved inside its checked module table.
    if (file.name !== 'multiplayerRuntime.js' && !files.some(other => other.name === match[1] + '.js')) throw Error('Missing deployment dependency: ' + match[1]);
}
const template = fs.readFileSync(path.join(root, 'scripts/templates/douyin-multiplayer.html'), 'utf8');
const html = template.replace('/* FILES */[]', () => JSON.stringify(files.filter(file => file.update)).replace(/</g, '\\u003c'));
new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
fs.writeFileSync(path.join(output, '操作页.html'), html);
fs.copyFileSync(path.join(root, 'docs/douyin-multiplayer-dev.md'), path.join(output, '操作说明.md'));
fs.copyFileSync(path.join(root, 'cloudfunctions-douyin/package.dependencies.json'), path.join(output, 'package.dependencies.json'));
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ revision: 'douyin-multiplayer-v1', cloudPublished: false, deviceVerified: false,
    environment: 'dev', envId: 'env-nvk6FNcrq5', serviceId: '1m0ub3f29wtv7', importedWechatReplays: false,
    files: files.map(({ code, ...file }) => file) }, null, 2));
console.log('Prepared ' + output + ': ' + changed.length + ' changed modules and 2 existing dependencies. Not deployed.');
