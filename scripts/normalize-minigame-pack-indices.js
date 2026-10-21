const fs = require('fs');
const path = require('path');

function decodeUuid(value) {
    const [base, suffix] = value.split('@');
    if (base.length !== 22) return value;
    const hex = base.slice(0, 2) + Buffer.from(base.slice(2), 'base64').toString('hex');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}${suffix ? '@' + suffix : ''}`;
}

function normalizePackIndices(config, readPack) {
    if (config.debug !== false) return 0;
    const uuids = config.uuids || [];
    const indices = new Map(uuids.map((uuid, index) => [decodeUuid(uuid), index]));
    let changes = 0;
    for (const [pack, members] of Object.entries(config.packs || {})) {
        for (let position = 0; position < members.length; position++) {
            const value = members[position];
            if (Number.isInteger(value) && typeof uuids[value] === 'string') continue;
            if (typeof value !== 'string') throw Error(`Invalid pack index: ${pack}[${position}]=${value}`);
            const uuid = decodeUuid(value);
            if (!indices.has(uuid)) {
                // Creator can emit an atlas SpriteFrame in a pack without adding its UUID
                // to the release table. Preserve the pack slot; never drop packed content.
                if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:@\w+)?$/i.test(uuid)) throw Error(`Invalid packed UUID: ${value}`);
                const payload = readPack(pack);
                if (!Array.isArray(payload) || !Array.isArray(payload[5]) || payload[5].length !== members.length || payload[5][position] == null) {
                    throw Error(`Cannot verify packed member: ${pack}[${position}]`);
                }
                indices.set(uuid, uuids.length);
                uuids.push(uuid);
            }
            members[position] = indices.get(uuid);
            changes++;
        }
    }
    return changes;
}

function normalizeRuntimePackIndices(root) {
    let changes = 0;
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(file); continue; }
            if (!/^config(?:\.[a-f0-9]+)?\.json$/.test(entry.name)) continue;
            const config = JSON.parse(fs.readFileSync(file, 'utf8'));
            const count = normalizePackIndices(config, pack => {
                const folder = path.join(dir, config.importBase || 'import', pack.slice(0,2));
                const names = fs.readdirSync(folder).filter(name => name === pack + '.json' || (name.startsWith(pack + '.') && name.endsWith('.json')));
                if (!names.length) throw Error(`Missing pack: ${pack}`);
                return JSON.parse(fs.readFileSync(path.join(folder, names[0]), 'utf8'));
            });
            if (count) fs.writeFileSync(file, JSON.stringify(config));
            changes += count;
        }
    }
    walk(root);
    return changes;
}

module.exports = { normalizePackIndices, normalizeRuntimePackIndices };
