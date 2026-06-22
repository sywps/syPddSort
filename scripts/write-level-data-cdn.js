#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const sourceLevelDir = path.join(projectDir, 'assets', 'LevelData');
const outputDir = path.resolve(process.argv[2] || path.join(projectDir, 'build', 'level-data-cdn'));
const packSize = Math.max(1, Math.floor(Number(process.env.PDD_LEVEL_PACK_SIZE || 100) || 100));
const levelFileKinds = [
    { prefix: 'level_', kind: 'mainline', pattern: /^level_(\d+)\.json$/ },
    { prefix: 'zt_level_', kind: 'theme', pattern: /^zt_level_(\d+)\.json$/ },
];

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        fail('JSON 读取失败: ' + path.relative(projectDir, filePath) + ' ' + (err && err.message ? err.message : err));
    }
}

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function hashJson(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function parseLevelFileName(name) {
    for (const kind of levelFileKinds) {
        const match = kind.pattern.exec(name);
        if (match) {
            return {
                prefix: kind.prefix,
                kind: kind.kind,
                levelId: Math.max(1, Math.floor(Number(match[1]) || 1)),
            };
        }
    }
    return null;
}

function collectLevels() {
    if (!fs.existsSync(sourceLevelDir)) {
        fail('关卡源码目录不存在: ' + path.relative(projectDir, sourceLevelDir));
    }
    const levels = fs.readdirSync(sourceLevelDir)
        .map((name) => ({ name, info: parseLevelFileName(name) }))
        .filter((entry) => entry.info)
        .map((entry) => {
            const name = entry.name;
            const info = entry.info;
            const levelId = info.levelId;
            const data = readJson(path.join(sourceLevelDir, name));
            if (!data || typeof data !== 'object') {
                fail('关卡 JSON 不是对象: ' + name);
            }
            const dataLevelId = Math.max(1, Math.floor(Number(data.levelId || levelId) || levelId));
            if (dataLevelId !== levelId) {
                fail('关卡文件名与 levelId 不一致: ' + name + ' levelId=' + dataLevelId);
            }
            return { levelId, file: name, data, prefix: info.prefix, kind: info.kind };
        })
        .sort((a, b) => {
            const kindOrder = a.kind.localeCompare(b.kind);
            return kindOrder || a.levelId - b.levelId;
        });
    if (levels.length < 1) {
        fail('没有找到 level_*.json 或 zt_level_*.json');
    }
    const seenKeys = new Set();
    for (const level of levels) {
        const key = level.prefix + level.levelId;
        if (seenKeys.has(key)) fail('关卡真源存在重复 key: ' + key);
        seenKeys.add(key);
    }
    return levels;
}

function padLevelId(levelId) {
    return String(levelId).padStart(4, '0');
}

function groupLevels(levels) {
    const groups = [];
    for (const kind of levelFileKinds) {
        const entries = levels.filter((entry) => entry.prefix === kind.prefix);
        if (entries.length) groups.push({ prefix: kind.prefix, kind: kind.kind, levels: entries });
    }
    return groups;
}

function buildPack(group, packLevels) {
    const first = packLevels[0].levelId;
    const last = packLevels[packLevels.length - 1].levelId;
    const id = group.kind + '_' + padLevelId(first) + '_' + padLevelId(last);
    const payload = {
        packVersion: 1,
        id,
        kind: group.kind,
        prefix: group.prefix,
        schemaVersion: 1,
        levelRange: [first, last],
        levelCount: packLevels.length,
        levels: packLevels.map((entry) => ({
            levelId: entry.levelId,
            prefix: entry.prefix,
            data: entry.data,
        })),
    };
    const hash = hashJson(payload);
    return {
        id,
        file: path.join('level_packs', id + '.json').split(path.sep).join('/'),
        hash,
        payload: {
            ...payload,
            dataVersion: hash.slice(0, 16),
        },
    };
}

function buildOutput() {
    const levels = collectLevels();
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(outputDir, 'level_packs'), { recursive: true });

    const packs = [];
    const levelCounts = {};
    for (const group of groupLevels(levels)) {
        levelCounts[group.prefix] = group.levels.length;
        for (let offset = 0; offset < group.levels.length; offset += packSize) {
            const pack = buildPack(group, group.levels.slice(offset, offset + packSize));
            const packPath = path.join(outputDir, pack.file);
            writeJson(packPath, pack.payload);
            packs.push({
                id: pack.id,
                kind: pack.payload.kind,
                prefix: pack.payload.prefix,
                url: pack.file,
                hash: pack.hash,
                bytes: fs.statSync(packPath).size,
                levelRange: pack.payload.levelRange,
                levelCount: pack.payload.levelCount,
                levels: pack.payload.levels.map((entry) => entry.levelId),
                levelKeys: pack.payload.levels.map((entry) => entry.prefix + entry.levelId),
            });
        }
    }

    const dataVersion = hashJson({ packs }).slice(0, 16);
    const manifest = {
        manifestVersion: 1,
        dataVersion,
        levelDataVersion: dataVersion,
        schemaVersion: 1,
        minClientBuild: 1,
        generatedAt: new Date().toISOString(),
        source: 'assets/LevelData',
        packSize,
        levelCount: levels.length,
        levelCounts,
        packs,
    };
    writeJson(path.join(outputDir, 'level_live.json'), manifest);
    console.log('wrote ' + path.relative(projectDir, outputDir) + ' packs=' + packs.length + ' levels=' + levels.length + ' dataVersion=' + dataVersion);
}

buildOutput();
