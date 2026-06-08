const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const levelDir = path.join(projectDir, 'assets', 'RemoteBundle', 'LevelData');
const manifestPath = path.join(levelDir, 'level-manifest.json');
const manifestMetaPath = manifestPath + '.meta';

function fail(message) {
    console.error('ERROR: ' + message);
    process.exit(1);
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        fail('JSON 读取失败: ' + path.relative(projectDir, filePath) + ' ' + err.message);
    }
}

function writeJson(filePath, payload) {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n');
}

function visitColors(value, colors) {
    if (!Array.isArray(value)) return;
    for (const item of value) {
        if (Array.isArray(item)) {
            visitColors(item, colors);
            continue;
        }
        const color = Math.floor(Number(item) || 0);
        if (color > 0) colors.add(color);
    }
}

function createManifest() {
    if (!fs.existsSync(levelDir)) fail('LevelData 目录不存在: ' + path.relative(projectDir, levelDir));
    const entries = fs.readdirSync(levelDir)
        .filter((name) => /^level_\d+\.json$/.test(name))
        .map((name) => {
            const filePath = path.join(levelDir, name);
            const data = readJson(filePath);
            const levelId = Math.max(1, Math.floor(Number(data.levelId || name.match(/\d+/)[0]) || 1));
            const colors = new Set();
            visitColors(data.correctColorArr, colors);
            visitColors(data.initRandomColorArr, colors);
            return {
                levelId,
                file: 'LevelData/' + name,
                boardWidth: Math.max(0, Math.floor(Number(data.boardWidth) || 0)),
                boardHeight: Math.max(0, Math.floor(Number(data.boardHeight) || 0)),
                filledCellCount: Math.max(0, Math.floor(Number(data.filledCellCount) || 0)),
                colorIds: [...colors].sort((a, b) => a - b),
                colorCount: colors.size,
                slotTotalCount: Math.max(0, Math.floor(Number(data.slotTotalCount) || 0)),
                timeLimit: Math.max(0, Math.floor(Number(data.timeLimit) || 0)),
                isMainline: true,
                isTutorial: levelId <= 2,
            };
        })
        .sort((a, b) => a.levelId - b.levelId);

    return {
        version: 1,
        generatedAt: new Date(0).toISOString(),
        levelCount: entries.length,
        entries,
    };
}

function ensureMeta() {
    if (fs.existsSync(manifestMetaPath)) return;
    writeJson(manifestMetaPath, {
        ver: '2.0.1',
        importer: 'json',
        imported: true,
        uuid: crypto.randomUUID(),
        files: ['.json'],
        subMetas: {},
        userData: {},
    });
}

const manifest = createManifest();
writeJson(manifestPath, manifest);
ensureMeta();
console.log('wrote ' + path.relative(projectDir, manifestPath) + ' levels=' + manifest.levelCount);
