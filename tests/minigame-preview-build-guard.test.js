const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const buildCommon = require('../scripts/minigame-build-common.js');

const root = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdd-preview-guard-'));

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

try {
    const profileDir = path.join(tempRoot, 'profiles', 'v2', 'packages');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'server.json'), JSON.stringify({ server_port: 8123 }));

    assert.deepStrictEqual(
        buildCommon.resolveCocosPreviewPorts(tempRoot, { COCOS_PREVIEW_PORT_SCAN_COUNT: '3' }),
        [8123, 8124, 8125],
        'preview guard must scan from the project-configured Cocos port',
    );
    assert.deepStrictEqual(
        buildCommon.resolveCocosPreviewPorts(tempRoot, { COCOS_PREVIEW_PORTS: '9001, 9003,9001' }),
        [9001, 9003],
        'explicit preview ports must be normalized and deduplicated',
    );

    const activeOptions = {
        ports: [8123, 8124, 8125],
        probePorts: (ports) => [ports[1]],
    };
    assert.deepStrictEqual(
        buildCommon.findActiveCocosPreviewPorts(tempRoot, activeOptions),
        [8124],
        'preview guard must report the reachable preview port',
    );
    assert.throws(
        () => buildCommon.assertNoActiveCocosPreview(tempRoot, activeOptions),
        /关卡切换时出现 404/,
        'active preview must fail with the concrete stale-resource symptom',
    );

    for (const relPath of ['library/keep.txt', 'temp/programming/keep.txt']) {
        const filePath = path.join(tempRoot, relPath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, 'keep');
    }
    assert.throws(
        () => buildCommon.cleanCocosGeneratedCacheDirs(
            tempRoot,
            () => {},
            undefined,
            {
                ...activeOptions,
                fail: (message) => { throw new Error(message); },
            },
        ),
        /localhost 仍默认读取本地 assets\/LevelData/,
        'cache deletion must stop before touching a live localhost preview',
    );
    assert.ok(fs.existsSync(path.join(tempRoot, 'library/keep.txt')), 'blocked clean must preserve library');
    assert.ok(fs.existsSync(path.join(tempRoot, 'temp/programming/keep.txt')), 'blocked clean must preserve preview programming output');

    buildCommon.cleanCocosGeneratedCacheDirs(
        tempRoot,
        () => {},
        undefined,
        {
            ports: [8123, 8124, 8125],
            probePorts: () => [],
            fail: (message) => { throw new Error(message); },
        },
    );
    assert.ok(!fs.existsSync(path.join(tempRoot, 'library')), 'inactive preview must retain the normal clean-build behavior');
    assert.ok(!fs.existsSync(path.join(tempRoot, 'temp/programming')), 'inactive preview must allow programming cache cleanup');

    for (const relPath of ['scripts/build-wechat.js', 'scripts/build-douyin.js']) {
        const source = read(relPath);
        const entryMarker = relPath.includes('wechat') ? "console.log('=== 微信小游戏打包 ===');" : "console.log('=== 抖音小游戏打包 ===');";
        const entrySource = source.slice(source.indexOf(entryMarker));
        const guardIndex = entrySource.indexOf('buildCommon.guardCocosPreviewOrFail(projectDir);');
        const firstBuildDeleteIndex = entrySource.indexOf(relPath.includes('wechat') ? 'rm(buildDir);' : 'buildCommon.rm(buildDir);');
        assert.ok(guardIndex >= 0, `${relPath} must guard active preview before building`);
        assert.ok(guardIndex < firstBuildDeleteIndex, `${relPath} must guard before deleting any build output`);
    }
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('minigame-preview-build-guard.test.js passed');
