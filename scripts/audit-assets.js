const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const assetsDir = path.join(projectDir, 'assets');
const imageExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const forbiddenAssetFiles = [
    'assets/RemoteBundle/Audio/README.md',
    'assets/RemoteBundle/Audio/button.wav',
    'assets/RemoteBundle/Audio/pindd/click.mp3',
    'assets/RemoteBundle/Audio/pindd/pick_up.mp3',
    'assets/RemoteBundle/Audio/pindd/victory.mp3',
    'assets/RemoteBundle/Textures/UI/home_bg1.png',
    'assets/RemoteBundle/Textures/UI/banner_lives.png',
    'assets/RemoteBundle/Textures/Slot/slot_row_solid.png',
    'assets/RemoteBundle/Textures/UI/icon_clock.png',
    'assets/RemoteBundle/Textures/UI/icon_settings.png',
    'assets/RemoteBundle/Textures/Slot/slot_empty.png',
    'assets/RemoteBundle/Textures/Slot/slot_bg.png',
    'assets/RemoteBundle/Textures/UI/btn_add_home.png',
    'assets/RemoteBundle/Textures/Pindd/UI/slot_row_bg_pindd.png',
];
const forbiddenAssetDirs = [
    'assets/RemoteBundle/Textures/Pindd/Beans',
];

function rel(filePath) {
    return path.relative(projectDir, filePath).split(path.sep).join('/');
}

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, out);
        } else if (entry.isFile()) {
            out.push(fullPath);
        }
    }
    return out;
}

function hashFile(filePath) {
    return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

function classify(filePath) {
    const relative = rel(filePath);
    if (relative.startsWith('assets/Textures/')) return 'root_textures';
    if (relative.startsWith('assets/BootstrapBundle/')) return 'bootstrap';
    if (relative.startsWith('assets/RemoteBundle/')) return 'remote';
    return 'other';
}

function isRemoteLegacyBean(filePath) {
    return rel(filePath).startsWith('assets/RemoteBundle/Textures/Beans/');
}

function isRemotePinddBean(filePath) {
    return rel(filePath).startsWith('assets/RemoteBundle/Textures/Pindd/Beans/');
}

function resolveProjectPath(relPath) {
    return path.join(projectDir, ...relPath.split('/'));
}

function main() {
    const files = walk(assetsDir);
    const dsStores = files.filter((filePath) => path.basename(filePath) === '.DS_Store').map(rel);
    const groups = new Map();

    for (const filePath of files) {
        if (path.basename(filePath) === '.DS_Store') continue;
        if (filePath.endsWith('.meta')) continue;
        if (!imageExts.has(path.extname(filePath).toLowerCase())) continue;
        const key = hashFile(filePath);
        const list = groups.get(key) || [];
        list.push(filePath);
        groups.set(key, list);
    }

    const violations = [];
    for (const list of groups.values()) {
        if (list.length < 2) continue;
        const classes = new Set(list.map(classify));
        if (classes.has('root_textures') && (classes.has('bootstrap') || classes.has('remote'))) {
            violations.push({
                reason: 'root Textures duplicates runtime bundle source',
                files: list.map(rel).sort(),
            });
            continue;
        }
        if (list.some(isRemoteLegacyBean) && list.some(isRemotePinddBean)) {
            violations.push({
                reason: 'RemoteBundle keeps duplicate bean PNGs in Textures/Beans and Textures/Pindd/Beans',
                files: list.map(rel).sort(),
            });
        }
    }

    if (dsStores.length > 0) {
        violations.unshift({
            reason: 'assets contains .DS_Store files',
            files: dsStores.sort(),
        });
    }

    const forbiddenFiles = [];
    for (const relPath of forbiddenAssetFiles) {
        const fullPath = resolveProjectPath(relPath);
        if (fs.existsSync(fullPath)) forbiddenFiles.push(relPath);
        if (fs.existsSync(fullPath + '.meta')) forbiddenFiles.push(relPath + '.meta');
    }
    for (const relPath of forbiddenAssetDirs) {
        const fullPath = resolveProjectPath(relPath);
        if (fs.existsSync(fullPath)) forbiddenFiles.push(relPath);
        if (fs.existsSync(fullPath + '.meta')) forbiddenFiles.push(relPath + '.meta');
    }
    for (const filePath of walk(path.join(assetsDir, 'BootstrapBundle', 'Beans'))) {
        const relative = rel(filePath);
        if (/^assets\/BootstrapBundle\/Beans\/b\d{3}_[124]\.png(?:\.meta)?$/.test(relative)) {
            forbiddenFiles.push(relative);
        }
    }
    if (forbiddenFiles.length > 0) {
        violations.unshift({
            reason: 'assets contains cleaned legacy runtime resources',
            files: Array.from(new Set(forbiddenFiles)).sort(),
        });
    }

    if (violations.length > 0) {
        console.error('[audit-assets] failed:');
        for (const violation of violations) {
            console.error('- ' + violation.reason);
            for (const filePath of violation.files) {
                console.error('  ' + filePath);
            }
        }
        process.exit(1);
    }

    console.log('[audit-assets] passed');
}

main();
