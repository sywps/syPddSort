'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const VENDOR_SHA256 = '7fe581299892ee562cd487d2b9553e2c686db51f1a08ef413b312081acdd0630';
const START = '// PDD_DOUYIN_SYSDK_BEGIN';
const END = '// PDD_DOUYIN_SYSDK_END';

// The game facade never exposes payments or subscriptions. Omit those unused
// implementations from the shipped SDK; keep the hash-checked supplier original.
function omitUnusedCapabilities(source) {
    for (const [start, end] of [
        ['  // real pay function', '  // 虚拟支付扣除余额'],
        ['  // 拉起订阅消息', '  //拉起客服消息'],
    ]) {
        const begin = source.indexOf(start), finish = source.indexOf(end);
        if (begin < 0 || finish <= begin || source.indexOf(start, begin + start.length) >= 0
            || source.indexOf(end, finish + end.length) >= 0) {
            throw new Error('Unexpected Douyin SDK capability boundary');
        }
        source = source.slice(0, begin) + source.slice(finish);
    }
    if (/openAwemeCustomerService|requestSubscribeMessage/.test(source)) {
        throw new Error('Unused Douyin payment/subscription API remains in shipped SDK');
    }
    return source;
}

function installDouyinSySdk(runtimeRoot, projectRoot = path.resolve(__dirname, '..')) {
    const sourceRoot = path.join(projectRoot, 'sdk', 'douyin');
    const config = require(path.join(sourceRoot, 'sysdk-conf.js'));
    if (Object.keys(config).sort().join(',') !== 'APP_ID,GAME_KEY'
        || config.APP_ID !== 'ttf45082ed6a36c15802' || !config.GAME_KEY) {
        throw new Error('Douyin SDK public configuration is invalid');
    }
    const vendor = fs.readFileSync(path.join(sourceRoot, 'vendor', 'sysdk-wxapp.js'));
    if (crypto.createHash('sha256').update(vendor).digest('hex') !== VENDOR_SHA256) {
        throw new Error('Douyin vendor SDK changed: review the adapter before updating its version');
    }
    const vendorBody = omitUnusedCapabilities(vendor.toString('utf8')).replace("const SY_CONF = require('./sysdk-conf');", '')
        .replace('export default Sygame', 'return Sygame;');
    const target = path.join(runtimeRoot, 'sdk', 'douyin');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'vendor.js'),
        '// Shengye 1001.1.9; static CommonJS factory (no eval).\nmodule.exports = function(tt, SY_CONF) {\n' + vendorBody + '\n};\n');
    // Serialize an explicit whitelist; the vendor's server appsecret is never an input to this build.
    fs.writeFileSync(path.join(target, 'sysdk-conf.js'), 'module.exports = ' + JSON.stringify({
        APP_ID: config.APP_ID, GAME_KEY: config.GAME_KEY,
    }, null, 2) + ';\n');
    fs.copyFileSync(path.join(sourceRoot, 'adapter.js'), path.join(target, 'adapter.js'));
    const entry = path.join(runtimeRoot, 'game.js');
    let game = fs.readFileSync(entry, 'utf8');
    const begin = game.indexOf(START);
    if (begin >= 0) {
        const end = game.indexOf(END, begin);
        if (end < 0) throw new Error('Incomplete Douyin SDK entry marker');
        game = game.slice(0, begin) + game.slice(end + END.length).replace(/^\r?\n/, '');
    }
    const loader = [START, '(function(){',
        'var sdk=null;',
        'globalThis.__PDD_LOAD_DOUYIN_SYSDK__=function(){',
        'if(sdk)return sdk;',
        'var api=typeof tt!=="undefined"?tt:globalThis.tt;',
        'if(!api)throw new Error("[DouyinSySDK] tt runtime unavailable");',
        'var next=require("./sdk/douyin/adapter")(api);next.init();sdk=next;',
        'globalThis.__PDD_DOUYIN_SYSDK__=sdk;return sdk;};',
        // Capture cold entry / onShow before the engine, without blocking it on login/network.
        'try{globalThis.__PDD_LOAD_DOUYIN_SYSDK__();}catch(error){console.error("[DouyinSySDK] initialization failed:",error.message);}',
        '})();', END, ''].join('\n');
    fs.writeFileSync(entry, loader + game);
    return { vendorVersion: '1001.1.9', vendorSha256: VENDOR_SHA256 };
}

module.exports = { installDouyinSySdk };
