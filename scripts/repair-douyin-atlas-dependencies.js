'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { buildBundleSourceRecord, materializeBundleEntry } = require('./patch-bootstrap-dynamic-assets');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function files(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
        const file = path.join(dir, item.name);
        return item.isDirectory() ? files(file) : [file];
    });
}
function bundles(root) {
    return files(root).filter(file => path.basename(file) === 'config.json').map(file => ({
        dir: path.dirname(file), config: json(file)
    })).filter(row => row.config.name && Array.isArray(row.config.uuids));
}
function references(bundle) {
    const found = new Set();
    function visit(value) {
        // Only Creator-generated atlas Texture2D IDs; source UUIDs follow the existing build path.
        if (typeof value === 'string' && /^[a-f0-9]{9}@6c48a$/i.test(value)) found.add(value);
        else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    }
    for (const file of files(path.join(bundle.dir, bundle.config.importBase || 'import'))) {
        if (file.endsWith('.json')) visit(json(file));
    }
    return found;
}
function version(config, kind, uuid) {
    const entries = config.versions?.[kind] || [], index = config.uuids.indexOf(uuid);
    for (let i = 0; i < entries.length; i += 2) {
        if (entries[i] === index || entries[i] === uuid || entries[i] === String(index)) return entries[i + 1];
    }
    return '';
}
function importFile(bundle, uuid) {
    const suffix = version(bundle.config, 'import', uuid);
    const file = path.join(bundle.dir, bundle.config.importBase || 'import', uuid.slice(0, 2), uuid + (suffix ? '.' + suffix : '') + '.json');
    if (!fs.existsSync(file)) throw Error('Atlas import missing: ' + bundle.config.name + '/' + uuid);
    return file;
}
function texturePayload(bundle, uuid) {
    if (!bundle.config.uuids.includes(uuid)) throw Error('Atlas texture not registered: ' + bundle.config.name + '/' + uuid);
    for (const [id, members] of Object.entries(bundle.config.packs || {})) {
        const position = members.findIndex(ref => (typeof ref === 'number' ? bundle.config.uuids[ref] : ref) === uuid);
        if (position < 0) continue;
        const pack = json(importFile(bundle, id));
        if (pack.type !== 'cc.Texture2D' || pack.data?.length !== members.length || !Array.isArray(pack.data[position])) {
            throw Error('Atlas texture pack invalid: ' + bundle.config.name + '/' + id);
        }
        return pack.data[position];
    }
    throw Error('Atlas texture has no packed payload: ' + bundle.config.name + '/' + uuid);
}
function closure(bundle, uuid) {
    const payload = texturePayload(bundle, uuid), image = uuid.split('@')[0];
    if (!Array.isArray(payload[1]) || payload[1].length !== 1 || payload[1][0] !== image) throw Error('Atlas image dependency invalid: ' + uuid);
    if (!bundle.config.uuids.includes(image)) throw Error('Atlas image not registered: ' + bundle.config.name + '/' + image);
    const imageData = json(importFile(bundle, image));
    const nativeVersion = version(bundle.config, 'native', image);
    const nativeDir = path.join(bundle.dir, bundle.config.nativeBase || 'native', image.slice(0, 2));
    const prefix = image + (nativeVersion ? '.' + nativeVersion : '') + '.';
    const natives = fs.existsSync(nativeDir) ? fs.readdirSync(nativeDir).filter(name => name.startsWith(prefix) && /\.(png|jpe?g|webp)$/i.test(name)) : [];
    if (natives.length !== 1) throw Error('Atlas native missing/ambiguous: ' + bundle.config.name + '/' + image);
    return JSON.stringify({ payload, imageData, nativeHash: hash(path.join(nativeDir, natives[0])) });
}
function verifyAtlasDependencies(root) {
    const checked = [];
    for (const bundle of bundles(root)) for (const uuid of references(bundle)) {
        closure(bundle, uuid);
        checked.push({ bundle: bundle.config.name, texture: uuid });
    }
    return checked;
}
function repairAtlasDependencies(root) {
    const all = bundles(root), repaired = [];
    for (const target of all) {
        const missing = [...references(target)].filter(uuid => !target.config.uuids.includes(uuid));
        for (const uuid of missing) {
            const donors = all.filter(row => row !== target && row.config.uuids.includes(uuid));
            if (!donors.length) throw Error('No built atlas donor: ' + target.config.name + '/' + uuid);
            const expected = closure(donors[0], uuid);
            for (const donor of donors.slice(1)) if (closure(donor, uuid) !== expected) throw Error('Conflicting built atlas: ' + uuid);
            const donor = donors[0];
            const source = buildBundleSourceRecord(donor.config.name, donor.dir, donor.config);
            // Reuse the verified packed-Texture2D extraction and recursive ImageAsset/native copy.
            const state = { visited: new Set(), imports: new Set(), native: new Set(), packed: new Set() };
            materializeBundleEntry(target.config, source, target.dir, uuid, new Set(), state);
            if (closure(target, uuid) !== expected) throw Error('Localized atlas differs from donor: ' + uuid);
            repaired.push({ bundle: target.config.name, texture: uuid, donor: donor.config.name });
        }
        if (missing.length) {
            for (const name of fs.readdirSync(target.dir).filter(name => /^config(?:\.[a-f0-9]+)?\.json$/i.test(name))) {
                fs.writeFileSync(path.join(target.dir, name), JSON.stringify(target.config));
            }
        }
    }
    const verified = verifyAtlasDependencies(root);
    return { repaired, verified };
}
module.exports = { repairAtlasDependencies, verifyAtlasDependencies };
