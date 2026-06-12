const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const assetsDir = path.join(projectDir, 'assets');
const imageExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const forbiddenAssetFiles = [
    'assets/GameAssetsBundle/Audio/README.md',
    'assets/GameAssetsBundle/Audio/button.wav',
    'assets/GameAssetsBundle/Audio/pindd/click.mp3',
    'assets/GameAssetsBundle/Audio/pindd/pick_up.mp3',
    'assets/GameAssetsBundle/Audio/pindd/victory.mp3',
    'assets/GameAssetsBundle/Textures/UI/home_bg1.png',
    'assets/GameAssetsBundle/Textures/UI/banner_lives.png',
    'assets/GameAssetsBundle/Textures/Slot/slot_row_solid.png',
    'assets/GameAssetsBundle/Textures/UI/icon_clock.png',
    'assets/GameAssetsBundle/Textures/UI/icon_settings.png',
    'assets/GameAssetsBundle/Textures/Slot/slot_empty.png',
    'assets/GameAssetsBundle/Textures/Slot/slot_bg.png',
    'assets/GameAssetsBundle/Textures/UI/btn_add_home.png',
    'assets/GameAssetsBundle/Textures/Pindd/UI/slot_row_bg_pindd.png',
    'assets/GameAssetsBundle/Textures/UI/home_bg.png',
    'assets/GameAssetsBundle/Textures/UI/主关卡按键 (2).png',
    'assets/GameAssetsBundle/Textures/UI/主页标题.png',
    'assets/GameAssetsBundle/Textures/UI/主题挑战.png',
    'assets/GameAssetsBundle/Textures/UI/图鉴1.png',
    'assets/GameAssetsBundle/Textures/UI/排行榜1.png',
    'assets/GameAssetsBundle/Textures/UI/爱心框.png',
    'assets/GameAssetsBundle/Textures/UI/签到1.png',
    'assets/GameAssetsBundle/Textures/UI/设置.png',
    'assets/GameAssetsBundle/Textures/UI/部件底板.png',
    'assets/GameAssetsBundle/Textures/UI/金币框 (2).png',
    'assets/GameAssetsBundle/Textures/UI/预览框.png',
    'assets/GameAssetsBundle/Textures/UI/倒计时.png',
    'assets/GameAssetsBundle/Textures/UI/unlock_button.png',
    'assets/GameAssetsBundle/Textures/UI/popup_gameplay_tool_slot_plate.png',
    'assets/GameAssetsBundle/Textures/UI/popup_tool_wand_icon.png',
    'assets/GameAssetsBundle/Textures/UI/popup_tool_brush_icon.png',
    'assets/GameAssetsBundle/Textures/UI/popup_tool_magnet_icon.png',
    'assets/BootstrapBundle/GameUI/home_bg.png',
    'assets/BootstrapBundle/GameUI/主关卡按键 (2).png',
    'assets/BootstrapBundle/GameUI/主页标题.png',
    'assets/BootstrapBundle/GameUI/主题挑战.png',
    'assets/BootstrapBundle/GameUI/图鉴1.png',
    'assets/BootstrapBundle/GameUI/排行榜1.png',
    'assets/BootstrapBundle/GameUI/爱心框.png',
    'assets/BootstrapBundle/GameUI/签到1.png',
    'assets/BootstrapBundle/GameUI/部件底板.png',
    'assets/BootstrapBundle/GameUI/金币框 (2).png',
    'assets/BootstrapBundle/GameUI/预览框.png',
    'assets/HomeAssetsBundle/GameUI/主关卡按键 (2).png',
    'assets/HomeAssetsBundle/GameUI/主题挑战.png',
    'assets/HomeAssetsBundle/GameUI/部件底板.png',
];
const forbiddenAssetDirs = [
    'assets/GameAssetsBundle/Textures/Pindd/Beans',
];
const requiredBootstrapStartupAssetFiles = [
    'assets/BootstrapBundle/GameUI/设置.png',
    'assets/BootstrapBundle/GameUI/slot_row_lock_dash_ui.png',
    'assets/BootstrapBundle/GameUI/slot_row_lock_mask_ui.png',
    'assets/BootstrapBundle/GameUI/倒计时.png',
    'assets/BootstrapBundle/GameUI/unlock_button.png',
    'assets/BootstrapBundle/GameUI/popup_ad_play_icon.png',
    'assets/BootstrapBundle/GameUI/popup_gameplay_tool_slot_plate.png',
    'assets/BootstrapBundle/GameUI/popup_tool_wand_icon.png',
    'assets/BootstrapBundle/GameUI/popup_tool_brush_icon.png',
    'assets/BootstrapBundle/GameUI/popup_tool_magnet_icon.png',
];
const requiredHomeStartupAssetFiles = [
    'assets/HomeAssetsBundle/Scenes/Home.scene',
    'assets/HomeAssetsBundle/GameUI/home_bg.jpeg',
    'assets/HomeAssetsBundle/GameUI/home_main_level_button.png',
    'assets/HomeAssetsBundle/GameUI/主页标题.png',
    'assets/HomeAssetsBundle/GameUI/home_theme_button.png',
    'assets/HomeAssetsBundle/GameUI/图鉴1.png',
    'assets/HomeAssetsBundle/GameUI/排行榜1.png',
    'assets/HomeAssetsBundle/GameUI/爱心框.png',
    'assets/HomeAssetsBundle/GameUI/签到1.png',
    'assets/HomeAssetsBundle/GameUI/home_icon_background.png',
    'assets/HomeAssetsBundle/GameUI/home_icon_title_plate.png',
    'assets/HomeAssetsBundle/GameUI/金币框 (2).png',
    'assets/HomeAssetsBundle/GameUI/预览框.png',
];
const requiredHomeStartupSpriteFrameUuids = [
    'e82626ae-c0c9-aa40-532e-293d6db5eaf2@f9941',
    'd301f7b8-b783-6861-36c5-31dbb54a2ac0@f9941',
    '8885ec69-f7f4-bb71-8fd7-e110a5061a63@f9941',
    '47b2f68a-ec42-b2e7-59e3-7ceba831b196@f9941',
    'f7446f73-3160-35a9-ff10-9a1c6940e181@f9941',
    '69f9cc1c-e9a2-8e2a-c828-fbeab6bacd79@f9941',
    '75cae3b3-5efb-4d61-a32c-bbe6addd9369@f9941',
    'f27b64cc-2534-4939-a213-f7b380e0a442@f9941',
    'cedf8dec-7628-40a4-a330-516ee01b04df@f9941',
    '7eca609a-adaf-43b5-98c8-533ed332b8d5@f9941',
    '68e9eb2e-772d-f1ab-a25c-b2f79daa0083@f9941',
    '91a910e0-aaeb-094c-4b24-0ee12b074d31@f9941',
    '382d81c2-e3f4-5d6e-c6de-abcaed0907fd@f9941',
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
    if (relative.startsWith('assets/HomeAssetsBundle/')) return 'homeAssets';
    if (relative.startsWith('assets/GameAssetsBundle/')) return 'gameAssets';
    return 'other';
}

function isRemoteLegacyBean(filePath) {
    return rel(filePath).startsWith('assets/GameAssetsBundle/Textures/Beans/');
}

function isRemotePinddBean(filePath) {
    return rel(filePath).startsWith('assets/GameAssetsBundle/Textures/Pindd/Beans/');
}

function resolveProjectPath(relPath) {
    return path.join(projectDir, ...relPath.split('/'));
}

function readPngInfo(filePath) {
    const buffer = fs.readFileSync(filePath);
    const signature = '89504e470d0a1a0a';
    if (buffer.length < 33 || buffer.subarray(0, 8).toString('hex') !== signature) {
        return null;
    }
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
        bitDepth: buffer[24],
        colorType: buffer[25],
    };
}

function collectSpriteFrameUuids(dir) {
    const uuids = new Set();
    for (const filePath of walk(dir)) {
        if (!filePath.endsWith('.meta')) continue;
        const content = fs.readFileSync(filePath, 'utf8');
        for (const match of content.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@f9941/g) || []) {
            uuids.add(match);
        }
    }
    return uuids;
}

function collectSceneSpriteFrameRefs(content) {
    return Array.from(new Set(content.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@f9941/g) || []));
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
        if (classes.has('root_textures') && (classes.has('bootstrap') || classes.has('homeAssets') || classes.has('gameAssets'))) {
            violations.push({
                reason: 'root Textures duplicates runtime bundle source',
                files: list.map(rel).sort(),
            });
            continue;
        }
        if ((classes.has('bootstrap') || classes.has('homeAssets')) && classes.has('gameAssets')) {
            violations.push({
                reason: 'startup/home bundles and GameAssetsBundle must not contain duplicate images',
                files: list.map(rel).sort(),
            });
            continue;
        }
        if (classes.has('bootstrap') && classes.has('homeAssets')) {
            violations.push({
                reason: 'BootstrapBundle and HomeAssetsBundle must not contain duplicate images',
                files: list.map(rel).sort(),
            });
            continue;
        }
        if (list.some(isRemoteLegacyBean) && list.some(isRemotePinddBean)) {
            violations.push({
                reason: 'GameAssetsBundle keeps duplicate bean PNGs in Textures/Beans and Textures/Pindd/Beans',
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
    for (const relPath of ['assets/GameAssetsBundle/LevelData', 'assets/GameAssetsBundle/LevelData.meta']) {
        const fullPath = resolveProjectPath(relPath);
        if (fs.existsSync(fullPath)) forbiddenFiles.push(relPath);
    }
    if (!fs.existsSync(resolveProjectPath('assets/LevelData'))) {
        violations.unshift({
            reason: 'assets/LevelData source directory is missing',
            files: ['assets/LevelData'],
        });
    }
    const missingBootstrapStartupFiles = [];
    for (const relPath of requiredBootstrapStartupAssetFiles) {
        if (!fs.existsSync(resolveProjectPath(relPath))) missingBootstrapStartupFiles.push(relPath);
        if (!fs.existsSync(resolveProjectPath(relPath + '.meta'))) missingBootstrapStartupFiles.push(relPath + '.meta');
    }
    if (missingBootstrapStartupFiles.length > 0) {
        violations.unshift({
            reason: 'BootstrapBundle startup asset source is missing',
            files: missingBootstrapStartupFiles,
        });
    }
    const missingHomeStartupFiles = [];
    for (const relPath of requiredHomeStartupAssetFiles) {
        if (!fs.existsSync(resolveProjectPath(relPath))) missingHomeStartupFiles.push(relPath);
        if (!fs.existsSync(resolveProjectPath(relPath + '.meta'))) missingHomeStartupFiles.push(relPath + '.meta');
    }
    if (fs.existsSync(resolveProjectPath('assets/HomeAssetsBundle/GameUI/home_bg.png'))
        || fs.existsSync(resolveProjectPath('assets/HomeAssetsBundle/GameUI/home_bg.png.meta'))) {
        missingHomeStartupFiles.push('assets/HomeAssetsBundle/GameUI/home_bg.png should not exist');
    }
    if (missingHomeStartupFiles.length > 0) {
        violations.unshift({
            reason: 'HomeAssetsBundle startup asset source is invalid',
            files: missingHomeStartupFiles,
        });
    }
    const allSpriteFrameUuids = collectSpriteFrameUuids(assetsDir);
    const unresolvedSceneRefs = [];
    const homeSceneRelPath = 'assets/HomeAssetsBundle/Scenes/Home.scene';
    for (const relPath of [homeSceneRelPath, 'assets/Scenes/Game.scene']) {
        const fullPath = resolveProjectPath(relPath);
        const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
        for (const uuid of collectSceneSpriteFrameRefs(content)) {
            if (!allSpriteFrameUuids.has(uuid)) unresolvedSceneRefs.push(`${relPath}: ${uuid}`);
        }
    }
    if (unresolvedSceneRefs.length > 0) {
        violations.unshift({
            reason: 'Scenes must not reference missing SpriteFrame assets',
            files: unresolvedSceneRefs,
        });
    }
    const homeScenePath = resolveProjectPath(homeSceneRelPath);
    const homeSceneContent = fs.existsSync(homeScenePath) ? fs.readFileSync(homeScenePath, 'utf8') : '';
    const missingHomeStartupRefs = requiredHomeStartupSpriteFrameUuids.filter((uuid) => !homeSceneContent.includes(uuid));
    if (missingHomeStartupRefs.length > 0) {
        violations.unshift({
            reason: 'Home.scene startup SpriteFrames must remain in HomeAssetsBundle',
            files: missingHomeStartupRefs,
        });
    }
    const gameAssetsSceneRefs = [];
    const gameAssetsSpriteFrameUuids = collectSpriteFrameUuids(path.join(assetsDir, 'GameAssetsBundle'));
    for (const relPath of [homeSceneRelPath, 'assets/Scenes/Game.scene']) {
        const fullPath = resolveProjectPath(relPath);
        const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
        for (const uuid of gameAssetsSpriteFrameUuids) {
            if (content.includes(uuid)) {
                gameAssetsSceneRefs.push(`${relPath}: ${uuid}`);
            }
        }
    }
    if (gameAssetsSceneRefs.length > 0) {
        violations.unshift({
            reason: 'Scenes must not strong-reference GameAssetsBundle SpriteFrames',
            files: gameAssetsSceneRefs,
        });
    }
    const solidWhiteRelPath = 'assets/BootstrapBundle/GameUI/solid_white.png';
    const solidWhitePath = resolveProjectPath(solidWhiteRelPath);
    const solidWhiteInfo = fs.existsSync(solidWhitePath) ? readPngInfo(solidWhitePath) : null;
    if (!solidWhiteInfo || solidWhiteInfo.width !== 1 || solidWhiteInfo.height !== 1 || solidWhiteInfo.bitDepth !== 8 || solidWhiteInfo.colorType !== 6) {
        violations.unshift({
            reason: 'Bootstrap solid_white.png must stay a 1x1 8-bit RGBA PNG for WeChat image decoding',
            files: [solidWhiteRelPath],
        });
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
