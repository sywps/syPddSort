#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const platformConfig = require('./minigame-platform-config.js');

const [outputPath, startSceneUrl, startSceneUuid, modeArg, outputNameArg] = process.argv.slice(2);

if (!outputPath || !startSceneUrl || !startSceneUuid || !modeArg) {
    console.error('用法: node scripts/write-wechat-build-config.js <outputPath> <startSceneUrl> <startSceneUuid> <--release|--debug> [outputName]');
    process.exit(1);
}

const debugMode = modeArg === '--debug' || modeArg === 'debug';
const releaseMode = modeArg === '--release' || modeArg === 'release';
const projectRoot = path.resolve(__dirname, '..');
const WECHAT_WASM_SUBPACKAGE = process.env.WECHAT_WASM_SUBPACKAGE !== '0';
const WECHAT_LOAD_SPINE_MANUALLY = process.env.WECHAT_LOAD_SPINE_MANUALLY !== '0';
const MINIGAME_ENGINE_MODULES = [
    '2d',
    'affine-transform',
    'animation',
    'audio',
    'base',
    'gfx-webgl',
    'graphics',
    'intersection-2d',
    'legacy-pipeline',
    'mask',
    'rich-text',
    'spine-3.8',
    'tween',
    'ui',
];

if (!debugMode && !releaseMode) {
    console.error('未知微信构建模式: ' + modeArg);
    console.error('用法: node scripts/write-wechat-build-config.js <outputPath> <startSceneUrl> <startSceneUuid> <--release|--debug> [outputName]');
    process.exit(1);
}

function normalizeOutputName(value) {
    const name = String(value || 'wechatgame').trim();
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes('/') || name.includes('\\')) {
        console.error('微信构建 outputName 非法: ' + name);
        process.exit(1);
    }
    return name;
}

function resolveSeparateEngine() {
    const override = process.env.WECHAT_SEPARATE_ENGINE;
    if (override === '1') return true;
    if (override === '0') return false;
    return false;
}

function readAssetUuid(assetUrl) {
    const relPath = assetUrl.replace(/^db:\/\/assets\//, '');
    const metaPath = path.join(projectRoot, 'assets', relPath + '.meta');
    if (!fs.existsSync(metaPath)) {
        console.error('缺少微信运行态场景 meta: ' + metaPath);
        process.exit(1);
    }
    const uuid = JSON.parse(fs.readFileSync(metaPath, 'utf8')).uuid;
    if (!uuid) {
        console.error('微信运行态场景 meta 缺少 uuid: ' + metaPath);
        process.exit(1);
    }
    return uuid;
}

function makeRuntimeScenes() {
    const scenes = [
        { url: startSceneUrl, uuid: startSceneUuid },
    ];
    const seen = new Set();
    return scenes.filter((scene) => {
        const key = scene.url + '|' + scene.uuid;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

const config = {
    platform: 'wechatgame',
    buildMode: 'minify',
    mangleProperties: 'true',
    skipCompressTexture: 'false',
    nativeCodeBundleMode: 'wasm',
    wasmCompressionMode: 'true',
    scenes: makeRuntimeScenes(),
    startScene: startSceneUuid,
    outputName: normalizeOutputName(outputNameArg),
    taskName: 'wechatgame',
    mainBundleCompressionType: 'subpackage',
    packages: {
        wechatgame: {
            orientation: platformConfig.common.orientation,
            appid: process.env.WECHAT_APPID || platformConfig.wechat.appId,
            buildOpenDataContextTemplate: '',
            separateEngine: resolveSeparateEngine(),
            highPerformanceMode: false,
        },
    },
    name: 'NewProject',
    server: '',
    engineModulesConfigKey: 'defaultConfig',
    includeModules: MINIGAME_ENGINE_MODULES,
    flags: {
        WASM_SUBPACKAGE: WECHAT_WASM_SUBPACKAGE,
        LOAD_SPINE_MANUALLY: WECHAT_LOAD_SPINE_MANUALLY,
    },
    buildPath: 'project://build',
    debug: false,
    md5Cache: true,
    sourceMaps: false,
    overwriteProjectSettings: {
        macroConfig: {
            cleanupImageCache: 'on',
        },
        includeModules: {
            animation: 'off',
            physics: 'inherit-project-setting',
            'physics-2d': 'inherit-project-setting',
            'gfx-webgl2': 'off',
            'rich-text': 'off',
        },
    },
    polyfills: {
        asyncFunctions: false,
    },
    experimentalEraseModules: true,
    startSceneAssetBundle: false,
    bundleConfigs: [
        {
            root: 'db://assets/BootstrapBundle',
            name: 'bootstrap',
            isRemote: false,
            output: true,
        },
        {
            root: 'db://assets/GameAssetsBundle',
            name: 'gameAssets',
            isRemote: false,
            output: true,
        },
        {
            root: 'db://assets/HomeAssetsBundle',
            name: 'homeAssets',
            isRemote: false,
            output: true,
        },
    ],
    inlineEnum: true,
    useBuiltinServer: false,
    md5CacheOptions: {
        excludes: [],
        includes: [],
        replaceOnly: [],
        handleTemplateMd5Link: true,
    },
    mainBundleIsRemote: false,
    useSplashScreen: true,
    bundleCommonChunk: false,
    packAutoAtlas: true,
    binGroupConfig: {
        threshold: 16,
        enable: false,
    },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(config, null, 2) + '\n');
console.log('已生成微信构建配置(' + (debugMode ? 'debug' : 'release') + '): ' + outputPath);
