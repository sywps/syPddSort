#!/usr/bin/env node

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const {
    configureWechatCdnEnvironment,
    extractRequiredWechatCdnSlot,
} = require('./wechat-cdn-slot-config');

const projectDir = path.resolve(__dirname, '..');

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function parseCommand(args) {
    let parsed;
    try {
        parsed = extractRequiredWechatCdnSlot(args);
        configureWechatCdnEnvironment(parsed.target, process.env);
    } catch (error) {
        fail(error && error.message ? error.message : String(error));
    }
    const dryRunArgs = parsed.remainingArgs.filter((arg) => arg === '--dry-run');
    const unknownArgs = parsed.remainingArgs.filter((arg) => arg !== '--dry-run');
    if (unknownArgs.length > 0) fail('未知参数: ' + unknownArgs.join(' '));
    if (dryRunArgs.length > 1) fail('只能传入一次 --dry-run');
    return { slot: parsed.slot, dryRun: dryRunArgs.length === 1 };
}

function runSync(scriptName, command) {
    const args = [path.join(projectDir, 'scripts', scriptName)];
    if (command.dryRun) args.push('--dry-run');
    args.push('--cdn-slot=' + command.slot);
    const result = spawnSync(process.execPath, args, {
        cwd: projectDir,
        env: process.env,
        stdio: 'inherit',
        shell: false,
    });
    if (result.error) fail(result.error.message);
    if (result.status !== 0) process.exit(result.status || 1);
}

const command = parseCommand(process.argv.slice(2));
console.log(`=== 微信 CDN 槽位 ${command.slot} ${command.dryRun ? 'Dry-run' : '同步'} ===`);
runSync('sync-level-data-cdn-wechat.js', command);
runSync('sync-skin-data-cdn-wechat.js', command);
console.log(`=== 微信 CDN 槽位 ${command.slot} ${command.dryRun ? 'Dry-run 校验完成' : '完整同步完成'} ===`);
