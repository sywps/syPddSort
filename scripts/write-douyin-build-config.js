#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { readAssetUuid } = require('./minigame-build-common.js');

const [outputPath, startSceneUrl, startSceneUuid, modeArg] = process.argv.slice(2);

if (!outputPath || !startSceneUrl || !startSceneUuid || !modeArg) {
    console.error('用法: node scripts/write-douyin-build-config.js <outputPath> <startSceneUrl> <startSceneUuid> <--release|--debug>');
    process.exit(1);
}

const debugMode = modeArg === '--debug' || modeArg === 'debug';
const releaseMode = modeArg === '--release' || modeArg === 'release';
const projectRoot = path.resolve(__dirname, '..');
const douyinAppId = process.env.DOUYIN_APPID || 'ttf45082ed6a36c15802';

if (!debugMode && !releaseMode) {
    console.error('未知抖音构建模式: ' + modeArg);
    console.error('用法: node scripts/write-douyin-build-config.js <outputPath> <startSceneUrl> <startSceneUuid> <--release|--debug>');
    process.exit(1);
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
    platform: 'bytedance-mini-game',
    buildMode: 'minify',
    mangleProperties: 'true',
    skipCompressTexture: 'false',
    nativeCodeBundleMode: 'wasm',
    wasmCompressionMode: 'true',
    scenes: makeRuntimeScenes(),
    startScene: startSceneUuid,
    outputName: 'bytedance-mini-game',
    taskName: 'bytedance-mini-game',
    mainBundleCompressionType: 'subpackage',
    packages: {
        'bytedance-mini-game': {
            appid: douyinAppId,
            orientation: 'portrait',
            separateEngine: false,
        },
    },
    name: 'NewProject',
    server: '',
    engineModulesConfigKey: 'defaultConfig',
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
    experimentalEraseModules: false,
    startSceneAssetBundle: false,
    bundleConfigs: [
        {
            root: 'db://assets/BootstrapBundle',
            name: 'bootstrap',
            output: true,
        },
        {
            root: 'db://assets/GameAssetsBundle',
            name: 'gameAssets',
            compressionType: 'subpackage',
            isRemote: false,
            output: true,
        },
        {
            root: 'db://assets/HomeAssetsBundle',
            name: 'homeAssets',
            compressionType: 'subpackage',
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

if (debugMode) {
    config.bundleConfigs.push({
        root: 'db://assets/LevelData',
        name: 'levelData',
        compressionType: 'subpackage',
        isRemote: false,
        output: true,
    });
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(config, null, 2) + '\n');
console.log('已生成抖音构建配置(' + (debugMode ? 'debug' : 'release') + '): ' + outputPath);
