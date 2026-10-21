'use strict';
const fs = require('fs');
const path = require('path');
const START = '// PDD_DOUYIN_IDENTITY_TEST_BEGIN';
const END = '// PDD_DOUYIN_IDENTITY_TEST_END';

function installDouyinIdentityTest(runtimeRoot, env = process.env) {
    const option = env.PDD_DOUYIN_IDENTITY_TEST || '0';
    if (!['0', '1'].includes(option)) throw Error('PDD_DOUYIN_IDENTITY_TEST must be 0 or 1');
    const entry = path.join(runtimeRoot, 'game.js');
    let body = fs.readFileSync(entry, 'utf8');
    if (option === '1') {
        if (!body.includes('globalThis.__PDD_CDN_SLOT__="A";')) throw Error('Identity test requires A slot');
        if (!body.includes('globalThis.__PDD_DOUYIN_CLOUD_ENV__="";') || env.PDD_DOUYIN_CLOUD_ENV) {
            throw Error('Identity test must not enable business cloud');
        }
    }
    const start = body.indexOf(START);
    if (start >= 0) {
        const end = body.indexOf(END, start);
        if (end < 0) throw Error('Incomplete identity test entry marker');
        body = body.slice(0, start) + body.slice(end + END.length).replace(/^\r?\n/, '');
    }
    const output = path.join(runtimeRoot, 'cloud-identity-test.js');
    if (option === '1') {
        fs.copyFileSync(path.join(__dirname, 'runtime/douyin-cloud-identity-test.js'), output);
        body += '\n' + START + '\nrequire("./cloud-identity-test")(globalThis, typeof tt === "undefined" ? null : tt);\n' + END + '\n';
    } else if (fs.existsSync(output)) fs.unlinkSync(output);
    fs.writeFileSync(entry, body);
    return option === '1';
}
module.exports = { installDouyinIdentityTest };
