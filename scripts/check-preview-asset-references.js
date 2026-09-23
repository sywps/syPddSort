const fs = require('fs');
const path = require('path');

function filesUnder(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const file = path.join(dir, entry.name);
        return entry.isDirectory() ? filesUnder(file) : [file];
    });
}

function compressedUuid(uuid) {
    const hex = uuid.replace(/-/g, '');
    if (!/^[0-9a-f]{32}$/i.test(hex)) return uuid;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = hex.slice(0, 5);
    for (let i = 5; i < hex.length; i += 3) {
        const value = parseInt(hex.slice(i, i + 3), 16);
        result += alphabet[value >> 6] + alphabet[value & 63];
    }
    return result;
}

function checkPreviewAssetReferences(projectRoot) {
    const assets = path.join(projectRoot, 'assets');
    const preview = path.join(assets, 'PreviewBundle');
    const identifiers = new Map();
    for (const file of filesUnder(preview).filter(file => file.endsWith('.meta'))) {
        const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!meta.uuid) continue;
        const source = path.relative(projectRoot, file.slice(0, -5));
        identifiers.set(meta.uuid, source);
        identifiers.set(compressedUuid(meta.uuid), source);
    }
    const failures = [];
    for (const file of filesUnder(assets)) {
        if (file.startsWith(preview + path.sep)) continue;
        if (!/\.(scene|prefab|meta|json|mtl|anim|ts|js|effect)$/i.test(file)) continue;
        const text = fs.readFileSync(file, 'utf8');
        const targets = new Set();
        for (const [identifier, source] of identifiers) {
            if (text.includes(identifier)) targets.add(source);
        }
        if (/PreviewBundle[/\\]|loadBundle\s*\(\s*['"]preview['"]/.test(text)) targets.add('assets/PreviewBundle (path/bundle reference)');
        for (const target of targets) failures.push(`${path.relative(projectRoot, file)} -> ${target}`);
    }
    if (failures.length) throw new Error('正式资源引用了试用库，请先将采用的资源移入正式 Bundle：\n' + failures.join('\n'));
}

if (require.main === module) {
    checkPreviewAssetReferences(path.resolve(__dirname, '..'));
    console.log('Preview asset reference check passed');
}
module.exports = { checkPreviewAssetReferences };
