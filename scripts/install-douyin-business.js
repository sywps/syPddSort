'use strict';
const fs = require('fs'), path = require('path');
module.exports = function install(root, env = process.env) {
    const mode = env.PDD_DOUYIN_BUSINESS_MODE || 'off';
    if (!['off', 'dev'].includes(mode)) throw Error('Business cloud only supports explicit dev mode; production disabled');
    const file = path.join(root, 'game.js');
    let source = fs.readFileSync(file, 'utf8').replace(/^globalThis\.__PDD_DOUYIN_BUSINESS__=.*;\r?\n/gm, '');
    if (mode === 'dev') {
        if (env.PDD_DOUYIN_CLOUD_ENV !== 'env-nvk6FNcrq5' || env.PDD_DOUYIN_CLOUD_PATH_PREFIX || env.PDD_DOUYIN_IDENTITY_TEST === '1' ||
            !source.includes('globalThis.__PDD_DOUYIN_CLOUD_ENV__="env-nvk6FNcrq5";')) throw Error('Business dev environment/diagnostic configuration mismatch');
        source = 'globalThis.__PDD_DOUYIN_BUSINESS__=' + JSON.stringify({ mode: 'dev', envID: 'env-nvk6FNcrq5', serviceID: '1m0ub3f29wtv7' }) + ';\n' + source;
    }
    fs.writeFileSync(file, source);
    return mode;
};
