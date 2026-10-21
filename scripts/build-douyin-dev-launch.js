#!/usr/bin/env node
'use strict';

// Release-compiled game using the existing DEV backend. This is not a PROD deployment.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const common = require('./minigame-build-common');
const cdn = require('./douyin-cdn-slot-config');
const root = path.resolve(__dirname, '..');
const ENV = 'env-nvk6FNcrq5', SERVICE = '1m0ub3f29wtv7', APP = 'ttf45082ed6a36c15802';
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function configuration(args, inherited = process.env) {
    const parsed = cdn.extractRequiredDouyinCdnSlot(args);
    if (parsed.remainingArgs.length !== 1 || !parsed.remainingArgs[0].startsWith('--build-id=')) {
        throw Error('用法: npm run build:douyin:dev-launch -- --cdn-slot=A --build-id=douyin-a-dev-launch-20261011-r1');
    }
    const buildId = parsed.remainingArgs[0].slice('--build-id='.length);
    if (!new RegExp('^douyin-' + parsed.slot.toLowerCase() + '-dev-launch-[a-z0-9-]{1,48}$').test(buildId)) {
        throw Error('build-id 必须与槽位匹配，格式为 douyin-a-dev-launch-日期-r版本');
    }
    const env = { ...inherited };
    const fixed = { DOUYIN_APPID: APP, PDD_DOUYIN_BUSINESS_MODE: 'dev', PDD_DOUYIN_ANALYTICS_MODE: 'dev',
        PDD_DOUYIN_CLOUD_ENV: ENV, PDD_DOUYIN_CLOUD_PATH_PREFIX: '', PDD_DOUYIN_IDENTITY_TEST: '0',
        PDD_DOUYIN_ANALYTICS_BUILD_ID: buildId };
    for (const [key, value] of Object.entries(fixed)) {
        if (env[key] && env[key] !== value) throw Error('上线候选配置冲突: ' + key);
    }
    Object.assign(env, fixed, { PDD_COCOS_ASSETDB_FORCE_REFRESH: '1', WECHAT_COCOS_ASSETDB_WARM_TIMEOUT_MS: '300000',
        COCOS_PREVIEW_PORTS: '1', DOUYIN_CLEAN_COCOS_CACHE: '0' });
    cdn.configureDouyinCdnEnvironment(parsed.target, env);
    return { env, buildId, target: parsed.target };
}

function verifyPackage(runtime, settings) {
    const entry = fs.readFileSync(path.join(runtime, 'game.js'), 'utf8');
    const project = common.readJson(path.join(runtime, 'project.config.json'));
    if (project.appid !== APP || project.setting?.urlCheck !== true) throw Error('AppID 或正式域名校验配置不正确');
    cdn.assertRuntimeDouyinCdnTarget(entry, settings.target);
    const marker = key => {
        const rows = [...entry.matchAll(new RegExp('globalThis\\.' + key + '=([^;\\n]+);', 'g'))];
        if (rows.length !== 1) throw Error('构建标记缺失或重复: ' + key);
        return JSON.parse(rows[0][1]);
    };
    if (marker('__PDD_DOUYIN_BUILD_MODE__') !== 'release' || marker('__PDD_DOUYIN_CLOUD_ENV__') !== ENV ||
        marker('__PDD_DOUYIN_CLOUD_PATH_PREFIX__') !== '') throw Error('候选包必须是 release 编译并连接固定 DEV 环境');
    const business = marker('__PDD_DOUYIN_BUSINESS__'), analytics = marker('__PDD_DOUYIN_ANALYTICS__');
    for (const value of [business, analytics]) {
        if (value.mode !== 'dev' || value.envID !== ENV || value.serviceID !== SERVICE) throw Error('云存档/统计配置不一致');
    }
    if (analytics.buildId !== settings.buildId) throw Error('统计 buildId 不正确');
    for (const file of ['cloud-identity-test.js', 'cloud-analytics-test.js', 'startup-diagnostic.js', 'sdk/sysdk-wxapp.js']) {
        if (fs.existsSync(path.join(runtime, file))) throw Error('候选包残留测试入口或微信 SDK: ' + file);
    }
    if (/PDD_DOUYIN_(?:IDENTITY|ANALYTICS)_TEST_BEGIN|startup-diagnostic|__PDD_SIDEBAR_DIAGNOSTIC__|pddStartupDiagnostic/.test(entry) || /DOUYIN_ADMIN_TOKEN|x-pdd-admin-token/.test(entry)) {
        throw Error('候选包入口包含云诊断入口或管理凭据字段');
    }
    if (sha(path.join(runtime, 'sdk/douyin/adapter.js')) !== sha(path.join(root, 'sdk/douyin/adapter.js'))) {
        throw Error('候选包 SDK 与当前源码不一致');
    }
    const game = common.readJson(path.join(runtime, 'game.json'));
    const subpackages = (game.subpackages || []).map(item => {
        const sub = path.resolve(runtime, item.root);
        if (!sub.startsWith(path.resolve(runtime) + path.sep) || !fs.existsSync(sub)) throw Error('分包路径无效');
        return sub;
    });
    const mainBytes = common.dirSize(runtime, subpackages);
    if (mainBytes > 4 * 1024 * 1024) throw Error('主包超过4MB');
    require('./repair-douyin-atlas-dependencies').verifyAtlasDependencies(runtime);
    return { buildId: settings.buildId, appId: APP, compilerMode: 'release', backend: 'dev', envID: ENV,
        serviceID: SERVICE, cdnSlot: settings.target.slot, mainBytes, domainCheck: true,
        liveDeviceVerified: false, publicReleaseAccessVerified: false };
}

function main(args = process.argv.slice(2)) {
    const settings = configuration(args);
    const output = path.join(root, 'build', 'bytedance-mini-game-' + settings.buildId.replace(/^douyin-/, ''));
    if (fs.existsSync(output)) throw Error('候选包目录已存在，请使用新 build-id；不会覆盖旧包');
    const planRoot = path.join(root, '.planning', 'douyin-dev-launch-20261011');
    fs.mkdirSync(planRoot, { recursive: true });
    const run = fs.mkdtempSync(path.join(planRoot, 'build-'));
    const worker = path.join(run, 'worker'); fs.mkdirSync(worker);
    console.log('Build record: ' + run);
    const inputs = ['assets', 'scripts', 'settings', 'extensions', 'config', 'experiments', 'sdk', 'openDataContext',
        'cloudfunctions', 'package.json', 'package-lock.json', 'tsconfig.json', 'engine-mangle-config.json',
        'bundle-build-config-BootstrapBundle.json'];
    for (const name of inputs) {
        const source = path.join(root, name);
        if (fs.existsSync(source)) fs.cpSync(source, path.join(worker, name), {
            recursive: true, filter: file => path.basename(file) !== 'node_modules' });
    }
    const inputsManifest = [];
    const walk = (dir, action) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isSymbolicLink()) throw Error('快照中不允许未知链接: ' + file);
            if (entry.isDirectory()) walk(file, action); else action(file);
        }
    };
    walk(worker, file => {
        const relative = path.relative(worker, file), hash = sha(file);
        if (hash !== sha(path.join(root, relative))) throw Error('源码复制不一致: ' + relative);
        inputsManifest.push({ file: relative.split(path.sep).join('/'), sha256: hash });
    });
    fs.writeFileSync(path.join(run, 'source-snapshot.json'), JSON.stringify(inputsManifest, null, 2));
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(worker, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const target of ['editor', 'preview']) fs.mkdirSync(path.join(worker, 'temp/programming/packer-driver/targets', target), { recursive: true });
    for (const [script, params, logName] of [
        ['warm-cocos-assetdb.js', [path.join(worker, 'temp/douyin-warm.json')], 'warm.log'],
        ['build-douyin.js', ['--release', '--cdn-slot=' + settings.target.slot], 'build.log']]) {
        console.log('START ' + script);
        const fd = fs.openSync(path.join(run, logName), 'w');
        let result;
        try { result = spawnSync(process.execPath, [path.join(worker, 'scripts', script), ...params], {
            cwd: worker, env: settings.env, windowsHide: true, stdio: ['ignore', fd, fd] }); }
        finally { fs.closeSync(fd); }
        if (result.error || result.status !== 0) throw Error(script + ' failed; see ' + path.join(run, logName));
        console.log('DONE ' + script);
    }
    // Refuse to label a stale snapshot as the current source if edits happened during the build.
    for (const row of inputsManifest) if (sha(path.join(root, row.file)) !== row.sha256) throw Error('构建期间源码已变化: ' + row.file);
    const built = common.resolveRuntimeRoot(path.join(worker, 'build/bytedance-mini-game'));
    const report = verifyPackage(built, settings);
    fs.cpSync(built, output, { recursive: true, errorOnExist: true, force: false });
    const files = [];
    walk(output, file => {
        const relative = path.relative(output, file), hash = sha(file);
        if (hash !== sha(path.join(built, relative))) throw Error('产物复制不一致: ' + relative);
        files.push({ file: relative.split(path.sep).join('/'), bytes: fs.statSync(file).size, sha256: hash });
    });
    fs.writeFileSync(path.join(run, 'package-verification.json'), JSON.stringify({ ...report, output, files }, null, 2));
    fs.writeFileSync(path.join(planRoot, 'latest-build.json'), JSON.stringify({ ...report, output, run }, null, 2));
    console.log('DELIVERED ' + output);
    console.log('本地产物验证通过；尚未完成真机及正式访问验证，不代表已获准上线。');
}
if (require.main === module) {
    try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { configuration, verifyPackage };
