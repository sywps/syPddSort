#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const common = require('./minigame-build-common');
const { bootstrapSource } = require('./creator-web-bootstrap');
const { normalizeRuntimePackIndices } = require('./normalize-minigame-pack-indices');
const { buildBundleSourceRecord, materializeBundleEntry, ensureStandaloneCconExtensionMap } = require('./patch-bootstrap-dynamic-assets');
const project = path.resolve(__dirname, '..');

function readMainLevels(root) {
    const levels = fs.readdirSync(path.join(root, 'assets/LevelData'))
        .map(name => /^level_(\d+)\.json$/.exec(name))
        .filter(Boolean).map(match => Number(match[1])).sort((a, b) => a - b);
    if (!levels.length || levels[0] !== 1 || levels.some((id, i) => id !== i + 1)) {
        throw Error('无广告版主线关卡必须从 1 开始连续，构建已停止');
    }
    return levels;
}

function prepareConfig(root) {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'tools/creator-web-build-config.json'), 'utf8'));
    const url = 'db://assets/Scenes/Boot.scene';
    const uuid = JSON.parse(fs.readFileSync(path.join(root, 'assets/Scenes/Boot.scene.meta'), 'utf8')).uuid;
    config.startScene = uuid;
    config.scenes = [{ url, uuid }];
    return config;
}

function finishBuild(directory, mainLevels) {
    const indexPath = path.join(directory, 'index.html');
    const source = fs.readFileSync(indexPath, 'utf8');
    if (source.includes('creator-web-bootstrap.js')) throw Error('网页已经包含无广告版启动脚本，请重新构建后再处理');
    // Gate engine startup as well as isolating storage: storage denial must never fall back to a normal save.
    const startup = /System\.import\(([^)]+)\)/g;
    const matches = [...source.matchAll(startup)];
    if (matches.length !== 1) throw Error('无法唯一识别 Cocos Web 启动入口，构建已停止');
    normalizeRuntimePackIndices(directory);
    repairCreatorAtlases(directory);
    const html = source.replace(/<title>[\s\S]*?<\/title>/, '<title>拼豆游戏 · 无广告版</title>')
        .replace('</head>', '<link rel="icon" href="data:,">\n</head>')
        .replace(startup, "(window.__PDD_CREATOR_WEB_READY__ ? System.import($1) : Promise.reject(new Error('无广告版初始化失败，已停止加载游戏')))")
        .replace(/(<script\b)/i, '<script src="creator-web-bootstrap.js"></script>\n$1');
    fs.writeFileSync(path.join(directory, 'creator-web-bootstrap.js'), bootstrapSource({ version: 1, mainLevels }));
    fs.writeFileSync(indexPath, html);
    fs.writeFileSync(path.join(directory, 'creator-web-manifest.json'), JSON.stringify({
        version: 1, builtAt: new Date().toISOString(), rewardMode: 'immediate',
        storageNamespace: 'pdd.creator-web.v1:', mainLevels, levelDataSource: 'bundled',
    }, null, 2) + '\n');
}

function repairCreatorAtlases(directory) {
    const assets = path.join(directory, 'assets');
    if (!fs.existsSync(assets)) return;
    const bundles = [];
    for (const entry of fs.readdirSync(assets, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const bundle = path.join(assets, entry.name);
        const hashed = fs.readdirSync(bundle).filter(name => /^config\.[a-f0-9]+\.json$/.test(name));
        if (hashed.length !== 1) throw Error('无法唯一识别无广告版 Bundle 配置: ' + entry.name);
        const file = path.join(bundle, hashed[0]);
        bundles.push({ dir: bundle, file, config: JSON.parse(fs.readFileSync(file, 'utf8')) });
    }
    let repaired = 0;
    for (const target of bundles) {
        const references = new Set();
        const visit = value => {
            if (typeof value === 'string' && /^[a-f0-9]{9}@6c48a$/i.test(value)) references.add(value);
            else if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === 'object') Object.values(value).forEach(visit);
        };
        for (const file of common.walkFiles(path.join(target.dir, 'import'))) {
            if (file.endsWith('.json')) visit(JSON.parse(fs.readFileSync(file, 'utf8')));
        }
        for (const uuid of references) {
            if (target.config.uuids.includes(uuid)) continue;
            const owners = bundles.filter(candidate => {
                const index = candidate.config.uuids.indexOf(uuid);
                const redirects = candidate.config.redirect || [];
                return index >= 0 && !redirects.some((ref, i) => i % 2 === 0 && (ref === index || ref === uuid));
            });
            if (owners.length !== 1) throw Error('无法唯一定位自动图集资源: ' + target.config.name + '/' + uuid);
            const owner = owners[0];
            const source = buildBundleSourceRecord(owner.config.name, owner.dir, owner.config);
            materializeBundleEntry(target.config, source, target.dir, uuid, new Set(), {
                visited: new Set(), imports: new Set(), native: new Set(), packed: new Set(),
            });
            if (!target.config.uuids.includes(uuid)) throw Error('自动图集补齐失败: ' + uuid);
            repaired++;
        }
        ensureStandaloneCconExtensionMap(target.dir, target.config, target.file);
        fs.writeFileSync(target.file, JSON.stringify(target.config));
        // Keep an optional unversioned alias consistent when inspecting previous output.
        const alias = path.join(target.dir, 'config.json');
        if (fs.existsSync(alias)) fs.writeFileSync(alias, JSON.stringify(target.config));
    }
    return repaired;
}

function main(args) {
    if (args.some(arg => arg !== '--prepare-only')) throw Error('用法: node scripts/build-creator-web.js [--prepare-only]');
    const mainLevels = readMainLevels(project);
    const config = prepareConfig(project);
    const configPath = path.join(project, 'temp', 'creator-web-build-config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    if (args.includes('--prepare-only')) { console.log(configPath); return; }
    const result = common.spawnCocosBuild(project, configPath);
    // Creator CLI reports success with either 0 or 36, depending on the host version.
    if (result.status !== 0 && result.status !== 36) throw Error('Cocos 构建失败，退出码: ' + result.status);
    const directory = path.join(project, 'build', config.outputName);
    finishBuild(directory, mainLevels);
    console.log('无广告版构建完成: ' + directory);
}

if (require.main === module) {
    try { main(process.argv.slice(2)); }
    catch (error) { console.error(error); process.exitCode = 1; }
}
module.exports = { readMainLevels, prepareConfig, finishBuild, repairCreatorAtlases };
