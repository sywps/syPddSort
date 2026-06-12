#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectDir = path.resolve(__dirname, '..');
const gameAssetsRoot = path.join(projectDir, 'assets', 'GameAssetsBundle');
const levelDataRoot = path.join(projectDir, 'assets', 'LevelData');
const bootstrapRoot = path.join(projectDir, 'assets', 'BootstrapBundle');
const bootstrapLevelIds = [1];
const beanAtlasFrames = Array.from({ length: 21 }, (_, index) => {
    const color = String(index + 1).padStart(3, '0');
    return [1, 2, 4].map((variant) => `b${color}_${variant}`);
}).flat();

function fail(message) {
    console.error('[prepare-bootstrap] ' + message);
    process.exit(1);
}

function log(message) {
    console.log('[prepare-bootstrap] ' + message);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function uuidFromSeed(seed) {
    const hex = crypto.createHash('md5').update(seed).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function jsonMeta(name) {
    return {
        ver: '2.0.1',
        importer: 'json',
        imported: true,
        uuid: uuidFromSeed('bootstrap-json:' + name),
        files: ['.json'],
        subMetas: {},
        userData: {},
    };
}

function assertFile(filePath, label) {
    if (!fs.existsSync(filePath)) fail('缺少 ' + label + ': ' + path.relative(projectDir, filePath));
}

function assertAbsent(filePath, label) {
    if (fs.existsSync(filePath)) fail(label + ' 不应存在: ' + path.relative(projectDir, filePath));
}

function syncBootstrapLevelData() {
    const levelDir = path.join(bootstrapRoot, 'LevelData');
    fs.mkdirSync(levelDir, { recursive: true });
    assertFile(path.join(bootstrapRoot, 'LevelData.meta'), 'BootstrapBundle/LevelData.meta');
    const allowed = new Set(bootstrapLevelIds.map((levelId) => `level_${levelId}.json`));
    for (const name of fs.readdirSync(levelDir)) {
        if (!/^level_\d+\.json(\.meta)?$/.test(name)) continue;
        const jsonName = name.endsWith('.meta') ? name.slice(0, -5) : name;
        if (allowed.has(jsonName)) continue;
        fs.rmSync(path.join(levelDir, name), { force: true });
        log(`已移除非首关 Bootstrap 快照: ${name}`);
    }
    for (const levelId of bootstrapLevelIds) {
        const src = path.join(levelDataRoot, `level_${levelId}.json`);
        const dest = path.join(levelDir, `level_${levelId}.json`);
        assertFile(src, `assets/LevelData/level_${levelId}.json`);
        const srcContent = fs.readFileSync(src, 'utf8');
        if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== srcContent) {
            fs.writeFileSync(dest, srcContent);
            log(`已同步首关快照: level_${levelId}.json`);
        }
        writeJson(dest + '.meta', jsonMeta(`LevelData/level_${levelId}`));
    }
}

function validateBootstrapBeanAtlas() {
    const beanDir = path.join(bootstrapRoot, 'Beans');
    assertFile(path.join(bootstrapRoot, 'Beans.meta'), 'BootstrapBundle/Beans.meta');
    assertFile(path.join(beanDir, 'bean-atlas-data.json'), 'Bootstrap bean atlas data');
    assertFile(path.join(beanDir, 'bean-atlas-data.json.meta'), 'Bootstrap bean atlas data meta');
    assertFile(path.join(beanDir, 'bean-atlas.png'), 'Bootstrap bean atlas png');
    assertFile(path.join(beanDir, 'bean-atlas.png.meta'), 'Bootstrap bean atlas png meta');
    assertAbsent(path.join(beanDir, 'bean-atlas.json'), 'Bootstrap 旧 bean-atlas JSON');
    const atlasData = readJson(path.join(beanDir, 'bean-atlas-data.json'));
    const frames = atlasData.frames || {};
    const missing = beanAtlasFrames.filter((frameName) => !frames[frameName]);
    if (missing.length > 0) fail('Bootstrap bean atlas 缺少首屏/全关卡豆豆帧: ' + missing.join(', '));
}

function validateRemoteDoesNotOwnBeanAtlas() {
    const remoteBeanDir = path.join(gameAssetsRoot, 'Textures', 'Beans');
    for (const name of [
        'bean-atlas.json',
        'bean-atlas.json.meta',
        'bean-atlas-data.json',
        'bean-atlas-data.json.meta',
        'bean-atlas.png',
        'bean-atlas.png.meta',
    ]) {
        assertAbsent(path.join(remoteBeanDir, name), 'Remote bean atlas');
    }
}

syncBootstrapLevelData();
validateBootstrapBeanAtlas();
validateRemoteDoesNotOwnBeanAtlas();
log('BootstrapBundle 已准备完成：首关快照来自 assets/LevelData，豆豆图集真源来自 BootstrapBundle/Beans');
