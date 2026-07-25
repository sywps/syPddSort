#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { LEVEL_DATA_CLIENT_BUILD, LEVEL_DATA_SCHEMA_VERSION, validateSlotPolicy } = require('./slot-policy-contract');
const { normalizeWechatCdnSlot } = require('./wechat-cdn-slot-config');

const projectDir = path.resolve(__dirname, '..');
const cdnSlot = readOptionalWechatCdnSlot(process.env.PDD_WECHAT_CDN_SLOT);
const options = parseArgs(process.argv.slice(2));
const sourceLevelDir = path.resolve(options.source || path.join(projectDir, 'assets', 'LevelData'));
const overlayLevelDir = options.overlaySource ? path.resolve(options.overlaySource) : '';
const outputDir = path.resolve(options.output || path.join(projectDir, 'build', 'level-data-cdn'));
const packSize = Math.max(1, Math.floor(Number(process.env.PDD_LEVEL_PACK_SIZE || 100) || 100));
const levelFileKinds = [
    { prefix: 'level_', kind: 'mainline', pattern: /^level_(\d+)\.json$/ },
    { prefix: 'zt_level_', kind: 'theme', pattern: /^zt_level_(\d+)\.json$/ },
];

function parseArgs(args) {
    const parsed = {
        output: '',
        source: '',
        overlaySource: '',
        prefix: '',
    };
    const positionals = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--source') {
            parsed.source = args[++i] || '';
        } else if (arg.startsWith('--source=')) {
            parsed.source = arg.slice('--source='.length);
        } else if (arg === '--overlay-source') {
            parsed.overlaySource = args[++i] || '';
        } else if (arg.startsWith('--overlay-source=')) {
            parsed.overlaySource = arg.slice('--overlay-source='.length);
        } else if (arg === '--prefix') {
            parsed.prefix = args[++i] || '';
        } else if (arg.startsWith('--prefix=')) {
            parsed.prefix = arg.slice('--prefix='.length);
        } else if (!arg.startsWith('-')) {
            positionals.push(arg);
        } else {
            fail('未知参数: ' + arg);
        }
    }
    parsed.output = positionals[0] || '';
    return parsed;
}

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function readOptionalWechatCdnSlot(value) {
    if (!String(value || '').trim()) return '';
    try {
        return normalizeWechatCdnSlot(value);
    } catch (error) {
        fail(error && error.message ? error.message : String(error));
    }
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
    const requiredPrefix = String(options.prefix || '').trim();
    const readLevelEntry = (sourceDir, entry) => {
        const name = entry.name;
        const info = entry.info;
        const levelId = info.levelId;
        const data = readJson(path.join(sourceDir, name));
        if (!data || typeof data !== 'object') {
            fail('关卡 JSON 不是对象: ' + name);
        }
        const dataLevelId = Math.max(1, Math.floor(Number(data.levelId || levelId) || levelId));
        if (dataLevelId !== levelId) {
            fail('关卡文件名与 levelId 不一致: ' + name + ' levelId=' + dataLevelId);
        }
        try {
            validateSlotPolicy(data, name);
        } catch (err) {
            fail(err && err.message ? err.message : String(err));
        }
        return { levelId, file: name, data, prefix: info.prefix, kind: info.kind };
    };
    let levels = fs.readdirSync(sourceLevelDir)
        .map((name) => ({ name, info: parseLevelFileName(name) }))
        .filter((entry) => entry.info)
        .filter((entry) => !requiredPrefix || entry.info.prefix === requiredPrefix)
        .map((entry) => readLevelEntry(sourceLevelDir, entry))
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
    if (overlayLevelDir) {
        if (!fs.existsSync(overlayLevelDir)) {
            fail('关卡覆盖目录不存在: ' + path.relative(projectDir, overlayLevelDir));
        }
        const levelsByKey = new Map(levels.map((level) => [level.prefix + level.levelId, level]));
        const overlays = fs.readdirSync(overlayLevelDir)
            .map((name) => ({ name, info: parseLevelFileName(name) }))
            .filter((entry) => entry.info)
            .filter((entry) => !requiredPrefix || entry.info.prefix === requiredPrefix)
            .map((entry) => readLevelEntry(overlayLevelDir, entry));
        if (overlays.length < 1) {
            fail('关卡覆盖目录没有符合生成范围的关卡 JSON');
        }
        for (const overlay of overlays) {
            const key = overlay.prefix + overlay.levelId;
            if (!levelsByKey.has(key)) {
                fail('关卡覆盖包含稳定真源不存在的 key: ' + key);
            }
            levelsByKey.set(key, overlay);
        }
        levels = Array.from(levelsByKey.values()).sort((a, b) => {
            const kindOrder = a.kind.localeCompare(b.kind);
            return kindOrder || a.levelId - b.levelId;
        });
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
        schemaVersion: LEVEL_DATA_SCHEMA_VERSION,
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
    const sourceLabel = path.relative(projectDir, sourceLevelDir).split(path.sep).join('/') || sourceLevelDir;
    const overlayLabel = overlayLevelDir
        ? (path.relative(projectDir, overlayLevelDir).split(path.sep).join('/') || overlayLevelDir)
        : '';
    const manifest = {
        manifestVersion: 1,
        ...(cdnSlot ? { cdnSlot } : {}),
        dataVersion,
        levelDataVersion: dataVersion,
        schemaVersion: LEVEL_DATA_SCHEMA_VERSION,
        minClientBuild: LEVEL_DATA_CLIENT_BUILD,
        generatedAt: new Date().toISOString(),
        source: overlayLabel ? sourceLabel + ' + ' + overlayLabel : sourceLabel,
        packSize,
        levelCount: levels.length,
        levelCounts,
        packs,
    };
    writeJson(path.join(outputDir, 'level_live.json'), manifest);
    console.log('wrote ' + path.relative(projectDir, outputDir) + ' packs=' + packs.length + ' levels=' + levels.length + ' dataVersion=' + dataVersion);
}

buildOutput();
