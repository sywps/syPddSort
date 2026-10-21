#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { configureDouyinCdnEnvironment, extractRequiredDouyinCdnSlot } = require('./douyin-cdn-slot-config');

const [kind, ...args] = process.argv.slice(2);
const scripts = {
    levels: 'sync-level-data-cdn-wechat.js',
    skin: 'sync-skin-data-cdn-wechat.js',
    profile: 'sync-profile-data-cdn-wechat.js',
};
if (kind !== 'all' && !Object.hasOwn(scripts, kind)) {
    console.error('用法: node scripts/sync-douyin-cdn.js <all|levels|skin|profile> --cdn-slot=<A|B> [--dry-run]');
    process.exit(1);
}

let command;
try {
    command = extractRequiredDouyinCdnSlot(args);
    configureDouyinCdnEnvironment(command.target, process.env);
    if (command.remainingArgs.some(arg => arg !== '--dry-run')) throw new Error('未知参数: ' + command.remainingArgs.join(' '));
    if (command.remainingArgs.length > 1) throw new Error('只能传入一次 --dry-run');
} catch (error) {
    console.error('ERROR: ' + error.message);
    process.exit(1);
}
for (const script of kind === 'all' ? Object.values(scripts) : [scripts[kind]]) {
    const result = spawnSync(process.execPath, [path.join(__dirname, script), '--cdn-slot=' + command.slot, ...command.remainingArgs], {
        cwd: path.resolve(__dirname, '..'),
        env: process.env,
        stdio: 'inherit',
        shell: false,
    });
    if (result.error) console.error(result.error.message);
    if (result.error || result.signal || result.status !== 0) process.exit(result.status || 1);
}
