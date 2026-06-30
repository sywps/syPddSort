#!/usr/bin/env node

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const runtimeRoot = process.argv[2];

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function runNode(script, args) {
    const result = childProcess.spawnSync(process.execPath, [path.join(projectRoot, script), ...args], {
        cwd: projectRoot,
        env: process.env,
        stdio: 'inherit',
        shell: false,
    });
    if (result.error) fail(result.error.message);
    if (result.status !== 0) process.exit(result.status || 1);
}

if (!runtimeRoot) fail('用法: node scripts/postbuild-minigame-bundles.js <runtimeRoot>');
if (!fs.existsSync(runtimeRoot)) fail('小游戏运行时目录不存在: ' + runtimeRoot);

console.log('[minigame-bundles] 补齐 homeAssets 分包资源产物...');
runNode('scripts/patch-home-assets-bundle.js', [runtimeRoot, 'homeAssets']);

console.log('[minigame-bundles] 补齐 gameAssets 分包资源产物...');
runNode('scripts/patch-home-assets-bundle.js', [runtimeRoot, 'gameAssets']);

console.log('[minigame-bundles] 补齐 bootstrap 动态图片与关键首用资源...');
runNode('scripts/patch-bootstrap-dynamic-assets.js', [runtimeRoot]);

console.log('[minigame-bundles] 本地小游戏公共 bundle 后处理完成: ' + runtimeRoot);
