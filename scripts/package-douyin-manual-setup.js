'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts/douyin-prod-manual-20261011');
const names = ['adminAuth', 'businessCommon', 'chapterRewardSync', 'analyticsCommon', 'businessSetup', 'analyticsSetup', 'analyticsReport', 'analyticsExport'];
const all = [...names, 'businessRules', 'businessIdentity', 'syncUserState', 'updateUserProfileAssets',
    'analyticsIdentity', 'addBehaviorData', 'addFunnelEvents', 'saveLevelRecord'];
fs.mkdirSync(path.join(output, 'functions'), { recursive: true });
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const files = all.map(name => {
    const filename = name + '.js';
    const data = fs.readFileSync(path.join(root, 'cloudfunctions-douyin', filename));
    const code = data.toString('utf8');
    new vm.Script(code, { filename });
    for (const match of code.matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g)) {
        if (!all.includes(match[1])) throw Error('Missing dependency: ' + match[1]);
    }
    fs.writeFileSync(path.join(output, 'functions', filename), data);
    if (digest(fs.readFileSync(path.join(output, 'functions', filename))) !== digest(data)) throw Error('Copy mismatch');
    return { name: filename, code, sha256: digest(data), replace: names.includes(name) };
});
const template = fs.readFileSync(path.join(__dirname, 'templates/douyin-manual-setup.html'), 'utf8');
const html = template.replace('/* DELIVERY_FILES */[]', JSON.stringify(files).replace(/</g, '\\u003c'));
new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
fs.writeFileSync(path.join(output, '操作页.html'), html);
fs.copyFileSync(path.join(root, 'docs/douyin-prod-manual-setup.md'), path.join(output, '操作说明.md'));
fs.copyFileSync(path.join(root, 'cloudfunctions-douyin/package.dependencies.json'), path.join(output, 'package.dependencies.json'));
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({
    revision: 'manual-prod-20261011', cloudPublished: false, productionDatabaseVerified: false,
    productionClientReady: false, automaticInitialization: false,
    appId: 'ttf45082ed6a36c15802', prodEnvId: 'env-XzE6JatzwX', serviceId: '1m0ub3f29wtv7',
    files: files.map(({ name, sha256, replace }) => ({ name, sha256, replace }))
}, null, 2) + '\n');
console.log('Prepared manual setup delivery: ' + names.length + ' replacement files, ' + all.length + ' complete modules; syntax/dependencies/hashes verified. No credential generated or cloud operation.');
