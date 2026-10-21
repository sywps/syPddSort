const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const platform = process.env.PDD_RECOVERY_TEST_PLATFORM || 'wechat';
if (!['wechat', 'douyin'].includes(platform)) throw Error('invalid recovery test platform');
const scope = { __PDD_BUILD_PLATFORM__: platform };
if (platform === 'wechat') scope.wx = { request() {}, getSystemInfoSync() { return {}; } };
else scope.tt = { request() {}, getSystemInfoSync() { return {}; } };
const output = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../assets/Scripts/Core/MiniGamePlatform.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: output, globalThis: scope });
if (!output.isMiniGameRuntime()) throw Error('platform fixture did not enable shared recovery');
if (platform === 'douyin' && output.isWeChatMiniGameRuntime()) throw Error('Douyin fixture must never impersonate WeChat');
module.exports = output;
