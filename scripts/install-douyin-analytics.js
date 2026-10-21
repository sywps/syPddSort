'use strict';
const fs = require('fs');
const path = require('path');
module.exports = function installDouyinAnalytics(root, env = process.env) {
    const mode = env.PDD_DOUYIN_ANALYTICS_MODE || 'off';
    if (!['off', 'dev'].includes(mode)) throw Error('Only off/dev analytics are currently verified; production remains disabled');
    const file = path.join(root, 'game.js');
    let source = fs.readFileSync(file, 'utf8');
    source = source.replace(/^globalThis\.__PDD_DOUYIN_ANALYTICS__=.*;\r?\n/gm, '');
    if (mode === 'dev') {
        const businessDev = env.PDD_DOUYIN_BUSINESS_MODE === 'dev' && env.PDD_DOUYIN_CLOUD_ENV === 'env-nvk6FNcrq5' &&
            source.includes('globalThis.__PDD_DOUYIN_CLOUD_ENV__="env-nvk6FNcrq5";');
        if (!businessDev && (env.PDD_DOUYIN_CLOUD_ENV || !source.includes('globalThis.__PDD_DOUYIN_CLOUD_ENV__="";'))) {
            throw Error('Analytics dev package must keep business cloud disabled');
        }
        if (env.PDD_DOUYIN_IDENTITY_TEST === '1') throw Error('Do not combine real analytics and identity-only diagnostics');
        const buildId = env.PDD_DOUYIN_ANALYTICS_BUILD_ID;
        if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(buildId || '')) throw Error('Set PDD_DOUYIN_ANALYTICS_BUILD_ID to an explicit build ID');
        source = 'globalThis.__PDD_DOUYIN_ANALYTICS__=' + JSON.stringify({ mode: 'dev',
            envID: 'env-nvk6FNcrq5', serviceID: '1m0ub3f29wtv7', buildId }) + ';\n' + source;
    }
    fs.writeFileSync(file, source);
    return mode;
};
