#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { normalizeWechatCdnSlot } = require('./wechat-cdn-slot-config');

const projectDir = path.resolve(__dirname, '..');
const cdnSlot = readOptionalWechatCdnSlot(process.env.PDD_WECHAT_CDN_SLOT);
const skinConfigPath = path.join(projectDir, 'assets', 'GameAssetsBundle', 'Skins', 'skins.json');
const bootstrapRoot = path.join(projectDir, 'assets', 'BootstrapBundle');
const gameAssetsRoot = path.join(projectDir, 'assets', 'GameAssetsBundle');
const levelDataRoot = path.join(projectDir, 'assets', 'LevelData');
const outputDir = path.resolve(process.argv[2] || path.join(projectDir, 'build', 'skin-cdn'));

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

function hashBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hashJson(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function normalizeAssetKey(value) {
    return String(value || '').trim().replace(/^\/+/, '').replace(/\/spriteFrame$/, '');
}

function toSkinId(value, fallback = 0) {
    const id = Math.floor(Number(value) || 0);
    return id > 0 ? id : fallback;
}

function toSkinShortId(value, fallback = 0) {
    const id = Math.floor(Number(value));
    return Number.isFinite(id) && id >= 0 ? id : fallback;
}

function readPngSize(buffer) {
    if (
        buffer.length >= 24
        && buffer[0] === 0x89
        && buffer[1] === 0x50
        && buffer[2] === 0x4e
        && buffer[3] === 0x47
    ) {
        return {
            width: buffer.readUInt32BE(16),
            height: buffer.readUInt32BE(20),
            format: 'png',
        };
    }
    return null;
}

function readJpegSize(buffer) {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) return null;
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        if (length < 2) return null;
        if (marker >= 0xc0 && marker <= 0xc3) {
            return {
                width: buffer.readUInt16BE(offset + 7),
                height: buffer.readUInt16BE(offset + 5),
                format: 'jpg',
            };
        }
        offset += 2 + length;
    }
    return null;
}

function readImageMeta(filePath) {
    const buffer = fs.readFileSync(filePath);
    const size = readPngSize(buffer) || readJpegSize(buffer);
    if (!size || !size.width || !size.height) {
        fail('无法识别图片尺寸: ' + path.relative(projectDir, filePath));
    }
    return {
        hash: hashBuffer(buffer),
        bytes: buffer.length,
        width: size.width,
        height: size.height,
        format: size.format,
        buffer,
    };
}

function resolveSourceImage(rootDir, assetKey, label) {
    const key = normalizeAssetKey(assetKey);
    if (!key) fail(label + ' 缺少 assetKey');
    const candidates = [
        path.join(rootDir, key),
        path.join(rootDir, key + '.png'),
        path.join(rootDir, key + '.jpg'),
        path.join(rootDir, key + '.jpeg'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    fail(label + ' 源图片不存在: ' + key);
}

function getBundleRoot(bundleName, label) {
    const safeName = String(bundleName || '').trim();
    if (safeName === 'bootstrap') return bootstrapRoot;
    if (safeName === 'gameAssets') return gameAssetsRoot;
    if (safeName === 'levelData') return levelDataRoot;
    fail(label + ' assetBundle 不支持: ' + safeName);
}

function resolveBundleSourceImage(bundleName, assetKey, label) {
    return resolveSourceImage(getBundleRoot(bundleName, label), assetKey, label);
}

function copySkinAsset(sourcePath, targetRelPath, skinId, kind) {
    const meta = readImageMeta(sourcePath);
    const targetPath = path.join(outputDir, targetRelPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, meta.buffer);
    return {
        skinId,
        kind,
        url: targetRelPath.split(path.sep).join('/'),
        hash: meta.hash,
        bytes: meta.bytes,
        width: meta.width,
        height: meta.height,
        format: meta.format,
    };
}

function getTargetImageName(code, sourcePath) {
    const ext = path.extname(sourcePath).toLowerCase();
    return code + (ext === '.jpg' || ext === '.jpeg' ? '.jpg' : '.png');
}

function normalizeSkinRows(config) {
    const rows = Array.isArray(config && config.skins) ? config.skins : [];
    const normalized = rows
        .filter((raw) => raw && raw.type === 'background' && raw.enabled !== false)
        .map((raw) => {
            const id = toSkinId(raw.id);
            const code = String(raw.code || '').trim();
            if (!id || !code) fail('皮肤配置缺少 id/code: ' + JSON.stringify(raw));
            return {
                id,
                shortId: toSkinShortId(raw.shortId, id),
                type: 'background',
                code,
                name: String(raw.name || raw.code || raw.id || ''),
                isDefault: !!raw.isDefault,
                unlockType: String(raw.unlockType || 'draw'),
                unlockValue: Math.max(0, Math.floor(Number(raw.unlockValue) || 0)),
                price: Math.max(0, Math.floor(Number(raw.price) || 0)),
                sort: Math.floor(Number(raw.sort) || 0),
                enabled: true,
                assetBundle: String(raw.assetBundle || 'levelData'),
                assetKey: normalizeAssetKey(raw.assetKey),
                iconBundle: String(raw.iconBundle || 'gameAssets'),
                iconKey: normalizeAssetKey(raw.iconKey),
            };
        })
        .sort((a, b) => a.sort - b.sort || a.id - b.id);
    if (!normalized.length) fail('皮肤配置没有可用 background rows');
    const seen = new Set();
    for (const row of normalized) {
        if (seen.has(row.id)) fail('皮肤配置 id 重复: ' + row.id);
        seen.add(row.id);
        if (!row.assetKey || !row.iconKey) fail('皮肤配置缺少资源路径: ' + row.id);
    }
    return normalized;
}

function buildOutput() {
    const config = readJson(skinConfigPath);
    const rows = normalizeSkinRows(config);
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(outputDir, 'assets'), { recursive: true });

    const skins = rows.map((row) => {
        const backgroundSource = resolveBundleSourceImage(row.assetBundle, row.assetKey, '背景皮肤 ' + row.id);
        const iconSource = resolveBundleSourceImage(row.iconBundle, row.iconKey, '背景皮肤图标 ' + row.id);
        const background = copySkinAsset(
            backgroundSource,
            path.join('assets', 'background', getTargetImageName(row.code, backgroundSource)),
            row.id,
            'background',
        );
        const thumbnail = copySkinAsset(
            iconSource,
            path.join('assets', 'thumbnails', getTargetImageName(row.code, iconSource)),
            row.id,
            'thumbnail',
        );
        const icon = {
            ...thumbnail,
            kind: 'icon',
        };
        return {
            ...row,
            assets: {
                background,
                thumbnail,
                icon,
            },
        };
    });

    const defaultEquipped = toSkinId(config.defaultEquipped)
        || (skins.find((row) => row.isDefault) || skins[0]).id;
    const assetCount = skins.length * 2;
    const skinDataVersion = hashJson({
        defaultEquipped,
        skins: skins.map((row) => ({
            id: row.id,
            code: row.code,
            unlockType: row.unlockType,
            unlockValue: row.unlockValue,
            sort: row.sort,
            assets: row.assets,
        })),
    }).slice(0, 16);
    const manifest = {
        manifestVersion: 1,
        ...(cdnSlot ? { cdnSlot } : {}),
        skinDataVersion,
        schemaVersion: 1,
        minClientBuild: 1,
        generatedAt: new Date().toISOString(),
        source: {
            config: 'assets/GameAssetsBundle/Skins/skins.json',
            bundles: {
                bootstrap: 'assets/BootstrapBundle',
                gameAssets: 'assets/GameAssetsBundle',
                levelData: 'assets/LevelData',
            },
        },
        defaultEquipped,
        skinCount: skins.length,
        assetCount,
        skins,
    };
    writeJson(path.join(outputDir, 'skin_live.json'), manifest);
    console.log('wrote ' + path.relative(projectDir, outputDir) + ' skins=' + skins.length + ' assets=' + assetCount + ' skinDataVersion=' + skinDataVersion);
}

buildOutput();
