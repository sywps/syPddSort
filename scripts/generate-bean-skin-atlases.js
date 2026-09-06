const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const projectDir = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectDir, 'temp', 'rainbow_original_bean_skins_5sets');
const sourceManifestPath = path.join(
    projectDir,
    '.planning',
    'five_skin_runtime_integration_design_20260901',
    'new_four_skin_source_manifest.json',
);
const outputRoot = path.join(projectDir, 'assets', 'GameAssetsBundle', 'BeanSkins');
const provenanceRoot = path.join(projectDir, 'temp', 'bean-skin-atlas-generation');
const currentAtlasDataPath = path.join(projectDir, 'assets', 'BootstrapBundle', 'Beans', 'bean-atlas-data.json');
const currentAtlasImagePath = path.join(projectDir, 'assets', 'BootstrapBundle', 'Beans', 'bean-atlas.png');

const ATLAS_SIZE = 1024;
const CELL_SIZE = 128;
const COLUMNS = ATLAS_SIZE / CELL_SIZE;
const DEFAULT_SKIN_ID = 2000;
const EXPECTED_NEW_FRAME_COUNT = 240;
const EXPECTED_SOURCE_BYTES = 2169653;
const NEW_SKINS = [
    { sourceSkinId: 2001, id: 2001, key: 'bean_skin_02', directory: 'skin_02', previewColorId: 4 },
    { sourceSkinId: 2002, id: 2002, key: 'bean_skin_03', directory: 'skin_03', previewColorId: 6 },
    { sourceSkinId: 2003, id: 2003, key: 'bean_skin_04', directory: 'skin_04', previewColorId: 9 },
    { sourceSkinId: 2004, id: 2004, key: 'bean_skin_05', directory: 'skin_05', previewColorId: 13 },
];

function fail(message) {
    throw new Error(`[bean-skin-atlas] ${message}`);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function stableUuid(label) {
    const hex = sha256(`syPddSort:${label}`).slice(0, 32).split('');
    hex[12] = '5';
    hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
    const value = hex.join('');
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function writeTextIfChanged(filePath, value) {
    const text = value.endsWith('\n') ? value : `${value}\n`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === text) return false;
    fs.writeFileSync(filePath, text);
    return true;
}

function writeBufferIfChanged(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (fs.existsSync(filePath) && fs.readFileSync(filePath).equals(value)) return false;
    fs.writeFileSync(filePath, value);
    return true;
}

function writeJson(filePath, value) {
    return writeTextIfChanged(filePath, JSON.stringify(value, null, 2));
}

function directoryMeta(label) {
    return {
        ver: '1.2.0',
        importer: 'directory',
        imported: true,
        uuid: stableUuid(`directory:${label}`),
        files: [],
        subMetas: {},
        userData: {},
    };
}

function jsonMeta(label) {
    return {
        ver: '2.0.1',
        importer: 'json',
        imported: true,
        uuid: stableUuid(`json:${label}`),
        files: ['.json'],
        subMetas: {},
        userData: {},
    };
}

function imageMeta(label, displayName, width, height) {
    const uuid = stableUuid(`image:${label}`);
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    return {
        ver: '1.0.27',
        importer: 'image',
        imported: true,
        uuid,
        files: ['.json', '.png'],
        subMetas: {
            '6c48a': {
                importer: 'texture',
                uuid: `${uuid}@6c48a`,
                displayName,
                id: '6c48a',
                name: 'texture',
                userData: {
                    wrapModeS: 'clamp-to-edge',
                    wrapModeT: 'clamp-to-edge',
                    imageUuidOrDatabaseUri: uuid,
                    isUuid: true,
                    visible: false,
                    minfilter: 'linear',
                    magfilter: 'linear',
                    mipfilter: 'none',
                    anisotropy: 0,
                },
                ver: '1.0.22',
                imported: true,
                files: ['.json'],
                subMetas: {},
            },
            f9941: {
                importer: 'sprite-frame',
                uuid: `${uuid}@f9941`,
                displayName,
                id: 'f9941',
                name: 'spriteFrame',
                userData: {
                    trimThreshold: 1,
                    rotated: false,
                    offsetX: 0,
                    offsetY: 0,
                    trimX: 0,
                    trimY: 0,
                    width,
                    height,
                    rawWidth: width,
                    rawHeight: height,
                    borderTop: 0,
                    borderBottom: 0,
                    borderLeft: 0,
                    borderRight: 0,
                    packable: true,
                    pixelsToUnit: 100,
                    pivotX: 0.5,
                    pivotY: 0.5,
                    meshType: 0,
                    vertices: {
                        rawPosition: [-halfWidth, -halfHeight, 0, halfWidth, -halfHeight, 0, -halfWidth, halfHeight, 0, halfWidth, halfHeight, 0],
                        indexes: [0, 1, 2, 2, 1, 3],
                        uv: [0, height, width, height, 0, 0, width, 0],
                        nuv: [0, 0, 1, 0, 0, 1, 1, 1],
                        minPos: [-halfWidth, -halfHeight, 0],
                        maxPos: [halfWidth, halfHeight, 0],
                    },
                    isUuid: true,
                    imageUuidOrDatabaseUri: `${uuid}@6c48a`,
                    atlasUuid: '',
                    trimType: 'auto',
                },
                ver: '1.0.12',
                imported: true,
                files: ['.json'],
                subMetas: {},
            },
        },
        userData: {
            type: 'sprite-frame',
            hasAlpha: true,
            fixAlphaTransparencyArtifacts: true,
            redirect: `${uuid}@6c48a`,
        },
    };
}

function copyPng(source, target, targetX, targetY) {
    if (source.width > CELL_SIZE || source.height > CELL_SIZE) {
        fail(`source frame exceeds ${CELL_SIZE}px cell: ${source.width}x${source.height}`);
    }
    const insetX = Math.floor((CELL_SIZE - source.width) / 2);
    const insetY = Math.floor((CELL_SIZE - source.height) / 2);
    const x = targetX + insetX;
    const y = targetY + insetY;
    for (let row = 0; row < source.height; row++) {
        const sourceStart = row * source.width * 4;
        const targetStart = ((y + row) * target.width + x) * 4;
        source.data.copy(target.data, targetStart, sourceStart, sourceStart + source.width * 4);
    }
    return { x, y, w: source.width, h: source.height };
}

function cropPng(source, frame) {
    const result = new PNG({ width: frame.w, height: frame.h });
    for (let row = 0; row < frame.h; row++) {
        const sourceStart = ((frame.y + row) * source.width + frame.x) * 4;
        const targetStart = row * frame.w * 4;
        source.data.copy(result.data, targetStart, sourceStart, sourceStart + frame.w * 4);
    }
    return result;
}

function writeImageAsset(filePath, png, label) {
    const encoded = PNG.sync.write(png, { colorType: 6 });
    writeBufferIfChanged(filePath, encoded);
    writeJson(`${filePath}.meta`, imageMeta(label, path.basename(filePath, '.png'), png.width, png.height));
    return { bytes: encoded.length, sha256: sha256(encoded), width: png.width, height: png.height };
}

if (!fs.existsSync(sourceManifestPath)) fail(`missing source manifest: ${sourceManifestPath}`);
const sourceManifestBuffer = fs.readFileSync(sourceManifestPath);
const sourceManifest = JSON.parse(sourceManifestBuffer.toString('utf8'));
if (sourceManifest.verification_status !== 'passed') fail('source manifest is not verified');
if (Number(sourceManifest.verified_frame_count) !== EXPECTED_NEW_FRAME_COUNT) fail('source manifest frame count changed');
if (Number(sourceManifest.total_png_bytes) !== EXPECTED_SOURCE_BYTES) fail('source manifest byte total changed');

const entries = Array.isArray(sourceManifest.entries) ? sourceManifest.entries : [];
if (entries.length !== EXPECTED_NEW_FRAME_COUNT) fail(`expected ${EXPECTED_NEW_FRAME_COUNT} source entries, got ${entries.length}`);
const seenSourceBytes = entries.reduce((sum, entry) => sum + Number(entry.png_bytes || 0), 0);
if (seenSourceBytes !== EXPECTED_SOURCE_BYTES) fail(`source entry byte total changed: ${seenSourceBytes}`);

writeJson(`${outputRoot}.meta`, directoryMeta('BeanSkins'));
writeJson(path.join(outputRoot, 'icons.meta'), directoryMeta('BeanSkins/icons'));

const currentAtlasData = readJson(currentAtlasDataPath);
const currentAtlasPng = PNG.sync.read(fs.readFileSync(currentAtlasImagePath));
const defaultPreviewColorId = 1;
const defaultPreviewName = `b${String(defaultPreviewColorId).padStart(3, '0')}_2`;
const defaultPreviewFrame = currentAtlasData.frames?.[defaultPreviewName];
if (!defaultPreviewFrame) fail(`missing default preview frame: ${defaultPreviewName}`);
const defaultIcon = cropPng(currentAtlasPng, defaultPreviewFrame);
const generated = [];
generated.push({
    id: DEFAULT_SKIN_ID,
    key: 'bean_skin_01',
    directory: 'skin_01',
    icon: writeImageAsset(
        path.join(outputRoot, 'icons', 'bean_skin_01.png'),
        defaultIcon,
        'BeanSkins/icons/bean_skin_01',
    ),
});

for (const skin of NEW_SKINS) {
    const skinEntries = entries
        .filter((entry) => Number(entry.skin_id) === skin.sourceSkinId)
        .sort((a, b) => String(a.target_frame).localeCompare(String(b.target_frame)));
    if (skinEntries.length !== 60) fail(`${skin.key} expected 60 frames, got ${skinEntries.length}`);
    if (new Set(skinEntries.map((entry) => String(entry.target_frame))).size !== 60) fail(`${skin.key} target frames are not unique`);

    const atlas = new PNG({ width: ATLAS_SIZE, height: ATLAS_SIZE });
    const atlasFrames = {};
    let iconPng = null;
    for (let index = 0; index < skinEntries.length; index++) {
        const entry = skinEntries[index];
        const sourcePath = path.join(sourceRoot, String(entry.source_file));
        if (!fs.existsSync(sourcePath)) fail(`missing source frame: ${sourcePath}`);
        const sourceBuffer = fs.readFileSync(sourcePath);
        if (sourceBuffer.length !== Number(entry.png_bytes)) fail(`source byte mismatch: ${entry.source_file}`);
        if (sha256(sourceBuffer) !== String(entry.png_sha256)) fail(`source hash mismatch: ${entry.source_file}`);
        const sourcePng = PNG.sync.read(sourceBuffer);
        const column = index % COLUMNS;
        const row = Math.floor(index / COLUMNS);
        atlasFrames[String(entry.target_frame)] = copyPng(sourcePng, atlas, column * CELL_SIZE, row * CELL_SIZE);
        if (Number(entry.current_color_id) === skin.previewColorId && entry.role === 'normal') {
            iconPng = sourcePng;
        }
    }
    if (!iconPng) fail(`missing preview frame for ${skin.key}`);

    const skinDir = path.join(outputRoot, skin.directory);
    writeJson(`${skinDir}.meta`, directoryMeta(`BeanSkins/${skin.directory}`));
    const atlasImage = writeImageAsset(
        path.join(skinDir, 'bean-atlas.png'),
        atlas,
        `BeanSkins/${skin.directory}/bean-atlas`,
    );
    const atlasData = {
        version: 1,
        textureName: 'bean-atlas',
        skinKey: skin.key,
        frames: atlasFrames,
    };
    writeJson(path.join(skinDir, 'bean-atlas-data.json'), atlasData);
    writeJson(path.join(skinDir, 'bean-atlas-data.json.meta'), jsonMeta(`BeanSkins/${skin.directory}/bean-atlas-data`));
    const icon = writeImageAsset(
        path.join(outputRoot, 'icons', `${skin.key}.png`),
        iconPng,
        `BeanSkins/icons/${skin.key}`,
    );
    generated.push({ id: skin.id, key: skin.key, directory: skin.directory, atlasImage, icon });
}

const catalog = {
    version: 1,
    defaultEquipped: DEFAULT_SKIN_ID,
    sourceManifestSha256: sha256(sourceManifestBuffer),
    skins: [
        {
            id: 2000,
            key: 'bean_skin_01',
            sort: 1,
            isDefault: true,
            resourceMode: 'bootstrap_existing',
            iconKey: 'BeanSkins/icons/bean_skin_01',
            previewColorId: 1,
            unlockType: 'default',
            unlockValue: 0,
            enabled: true,
        },
        ...NEW_SKINS.map((skin, index) => ({
            id: skin.id,
            key: skin.key,
            sort: index + 2,
            isDefault: false,
            resourceMode: 'game_assets_atlas',
            atlasDataKey: `BeanSkins/${skin.directory}/bean-atlas-data`,
            atlasTextureKey: `BeanSkins/${skin.directory}/bean-atlas`,
            iconKey: `BeanSkins/icons/${skin.key}`,
            previewColorId: skin.previewColorId,
            unlockType: 'ad',
            unlockValue: 1,
            enabled: true,
        })),
    ],
};
writeJson(path.join(outputRoot, 'bean-skins.json'), catalog);
writeJson(path.join(outputRoot, 'bean-skins.json.meta'), jsonMeta('BeanSkins/bean-skins'));

fs.mkdirSync(provenanceRoot, { recursive: true });
writeJson(path.join(provenanceRoot, 'source-provenance.json'), {
    generatedAt: new Date().toISOString(),
    sourceManifestPath: path.relative(projectDir, sourceManifestPath).replace(/\\/g, '/'),
    sourceManifestSha256: catalog.sourceManifestSha256,
    mappingStatus: sourceManifest.mapping_status,
    generated,
    sources: NEW_SKINS.map((skin) => ({
        productId: skin.id,
        productKey: skin.key,
        productDirectory: skin.directory,
        sourceSkinId: skin.sourceSkinId,
        sourceEntries: entries
            .filter((entry) => Number(entry.skin_id) === skin.sourceSkinId)
            .map((entry) => ({ source_file: entry.source_file, png_sha256: entry.png_sha256 })),
    })),
});

console.log(JSON.stringify({
    status: 'passed',
    outputRoot: path.relative(projectDir, outputRoot).replace(/\\/g, '/'),
    productKeys: catalog.skins.map((skin) => skin.key),
    newAtlasCount: NEW_SKINS.length,
    newFrameCount: EXPECTED_NEW_FRAME_COUNT,
    sourceBytes: EXPECTED_SOURCE_BYTES,
    sourceManifestSha256: catalog.sourceManifestSha256,
}, null, 2));
