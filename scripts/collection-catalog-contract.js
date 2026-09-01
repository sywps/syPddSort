const fs = require('fs');
const path = require('path');

const COLLECTION_CATALOG_VERSION = 1;
const SUPPORTED_LEVEL_PREFIXES = new Set(['level_']);

function requirePositiveInteger(value, label) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
        throw new Error(label + ' 必须是正整数');
    }
    return number;
}

function expandCollectionCatalog(config, availableLevelKeys, requiredPrefix = '') {
    if (!config || Number(config.version) !== COLLECTION_CATALOG_VERSION || !Array.isArray(config.ranges)) {
        throw new Error('图鉴目录配置 schema 不受支持');
    }
    const availableKeys = availableLevelKeys instanceof Set
        ? availableLevelKeys
        : new Set(availableLevelKeys || []);
    const normalizedRequiredPrefix = String(requiredPrefix || '').trim();
    const entries = [];
    const seenKeys = new Set();
    for (let index = 0; index < config.ranges.length; index++) {
        const range = config.ranges[index] || {};
        const prefix = String(range.prefix || '').trim();
        if (!SUPPORTED_LEVEL_PREFIXES.has(prefix)) {
            throw new Error(`图鉴目录 ranges[${index}].prefix 不受支持: ${prefix || '(empty)'}`);
        }
        if (normalizedRequiredPrefix && prefix !== normalizedRequiredPrefix) continue;
        const from = requirePositiveInteger(range.from, `图鉴目录 ranges[${index}].from`);
        const to = requirePositiveInteger(range.to, `图鉴目录 ranges[${index}].to`);
        const unlockLevelFrom = requirePositiveInteger(
            range.unlockLevelFrom ?? from,
            `图鉴目录 ranges[${index}].unlockLevelFrom`,
        );
        if (to < from) {
            throw new Error(`图鉴目录 ranges[${index}] 结束关卡不能小于开始关卡`);
        }
        for (let levelId = from; levelId <= to; levelId++) {
            const key = prefix + levelId;
            if (seenKeys.has(key)) {
                throw new Error('图鉴目录存在重复关卡 key: ' + key);
            }
            if (!availableKeys.has(key)) {
                throw new Error('图鉴目录指向不存在的关卡 key: ' + key);
            }
            seenKeys.add(key);
            entries.push({
                levelId,
                prefix,
                unlockLevel: unlockLevelFrom + levelId - from,
            });
        }
    }
    if (entries.length < 1 && !normalizedRequiredPrefix) {
        throw new Error('图鉴目录不能为空');
    }
    return {
        version: COLLECTION_CATALOG_VERSION,
        entries,
    };
}

function loadCollectionCatalog(projectDir, availableLevelKeys, requiredPrefix = '') {
    const configPath = path.join(projectDir, 'config', 'collection-catalog.json');
    let config;
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        const reason = error && error.message ? error.message : String(error);
        throw new Error('图鉴目录配置读取失败: ' + path.relative(projectDir, configPath) + ' ' + reason);
    }
    return expandCollectionCatalog(config, availableLevelKeys, requiredPrefix);
}

module.exports = {
    COLLECTION_CATALOG_VERSION,
    expandCollectionCatalog,
    loadCollectionCatalog,
};
