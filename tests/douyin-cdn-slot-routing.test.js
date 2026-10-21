'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { configureDouyinCdnEnvironment, extractRequiredDouyinCdnSlot, resolveDouyinCdnSlot,
    assertDouyinCdnManifest, assertRuntimeDouyinCdnTarget } = require('../scripts/douyin-cdn-slot-config');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const cleanEnv = { ...process.env };
for (const key of Object.keys(cleanEnv)) {
    if (/^(PDD_.*(?:CDN|OSS)|DOUYIN_BUILD_MODE)/.test(key)) delete cleanEnv[key];
}
const fixture = fs.mkdtempSync(path.join(root, '.planning/douyin-ab-tests-'));
function run(script, args, env = {}) {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
        cwd: root, env: { ...cleanEnv, ...env }, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024,
    });
    return { ...result, output: result.stdout + result.stderr };
}
try {
    const a = resolveDouyinCdnSlot('a'), b = resolveDouyinCdnSlot('B');
    assert.strictEqual(a.levelDataCdnUrl, 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_douyin/levels/');
    assert.strictEqual(b.skinDataCdnUrl, 'https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_douyin_b/skin/');
    assert.strictEqual(b.levelDataOssPath, 'syGame/pdd_v2/remote_douyin_b/levels/');
    for (const args of [[], ['--cdn-slot'], ['--cdn-slot=EXP'], ['--cdn-slot=C'], ['--cdn-slot=A', '--cdn-slot=B']]) {
        assert.throws(() => extractRequiredDouyinCdnSlot(args));
    }
    assert.deepStrictEqual(extractRequiredDouyinCdnSlot(['--release', '--cdn-slot', 'b']).remainingArgs, ['--release']);
    for (const [key, value] of Object.entries({ PDD_DOUYIN_CDN_SLOT: 'A', PDD_LEVEL_DATA_CDN_URL: a.levelDataCdnUrl,
        PDD_SKIN_DATA_CDN_URL: a.skinDataCdnUrl, PDD_PROFILE_DATA_CDN_URL: a.profileDataCdnUrl, PDD_LEVEL_DATA_OSS_PATH: a.levelDataOssPath,
        PDD_SKIN_DATA_OSS_PATH: a.skinDataOssPath, PDD_PROFILE_DATA_OSS_PATH: a.profileDataOssPath, PDD_OSS_BUCKET: 'game-pdd-v4' })) {
        assert.throws(() => configureDouyinCdnEnvironment(b, { [key]: value }), /槽位不一致/);
    }
    assert.throws(() => assertDouyinCdnManifest({ cdnPlatform: 'douyin', cdnSlot: 'A' }, b, 'fixture'));
    assert.throws(() => assertDouyinCdnManifest({ cdnPlatform: 'wechat', cdnSlot: 'B' }, b, 'fixture'));

    // Missing/conflicting input must exit before touching build output or starting upload.
    for (const [script, args, env] of [
        ['build-douyin.js', ['--release'], {}],
        ['build-douyin.js', ['--debug', '--cdn-slot=EXP'], {}],
        ['build-douyin.js', ['--release', '--cdn-slot=B'], { PDD_SKIN_DATA_CDN_URL: a.skinDataCdnUrl }],
        ['postbuild-douyin.js', [fixture], {}],
        ['sync-douyin-cdn.js', ['all', '--dry-run'], {}],
        ['sync-douyin-cdn.js', ['all', '--cdn-slot=B', '--dry-run'], { PDD_OSS_BUCKET: 'game-pdd-v4' }],
        ['sync-douyin-cdn.js', ['all', '--cdn-slot=B', '--unknown'], {}],
        ['sync-level-data-cdn-wechat.js', ['--dry-run'], { PDD_CDN_PLATFORM: 'douyin' }],
        ['sync-skin-data-cdn-wechat.js', ['--dry-run'], { PDD_CDN_PLATFORM: 'douyin' }],
    ]) {
        const result = run(script, args, env);
        assert.notStrictEqual(result.status, 0, script + ' should reject invalid arguments');
        assert.match(result.output, /槽位|cdn-slot|未知参数/);
        assert.ok(!result.output.includes('wrote '), 'invalid command must not generate data');
    }

    // Execute the actual entry patch on an existing A entry, switch to B, and repeat.
    const postbuild = read('scripts/postbuild-douyin.js');
    const markerSource = postbuild.slice(postbuild.indexOf('function ensureDouyinRuntimeMarker('), postbuild.indexOf('function normalizeSettings('));
    const runtime = path.join(fixture, 'runtime');
    fs.mkdirSync(runtime);
    const gamePath = path.join(runtime, 'game.js');
    fs.writeFileSync(gamePath, 'globalThis.engineStarted=true;\n');
    for (const target of [a, b]) {
        const context = { fs, path, douyinCdnTarget: target, buildMode: 'release',
            levelDataCdnUrl: target.levelDataCdnUrl, skinDataCdnUrl: target.skinDataCdnUrl,
            douyinCloudEnv: '', douyinCloudPathPrefix: '', runtime };
        vm.runInNewContext(markerSource + '\nensureDouyinRuntimeMarker(runtime);', context);
        const entry = fs.readFileSync(gamePath, 'utf8');
        assertRuntimeDouyinCdnTarget(entry, target);
        const globals = {};
        vm.runInNewContext(entry, globals);
        assert.strictEqual(globals.__PDD_CDN_SLOT__, target.slot);
        assert.strictEqual(globals.__PDD_LEVEL_DATA_CDN_URL__, target.levelDataCdnUrl);
        assert.strictEqual(globals.__PDD_SKIN_DATA_CDN_URL__, target.skinDataCdnUrl);
        assert.strictEqual(globals.__PDD_PROFILE_DATA_CDN_URL__, target.profileDataCdnUrl);
        vm.runInNewContext(markerSource + '\nensureDouyinRuntimeMarker(runtime);', context);
        assert.strictEqual(fs.readFileSync(gamePath, 'utf8'), entry, 'entry patch must be idempotent');
        assert.throws(() => assertRuntimeDouyinCdnTarget(entry + '\nglobalThis.__PDD_CDN_SLOT__="A";', target));
    }

    // Run the real generators, validators and both dry-run upload commands for each slot.
    for (const target of [a, b]) {
        const levelDir = path.join(fixture, target.slot, 'levels');
        const skinDir = path.join(fixture, target.slot, 'skin');
        const result = run('sync-douyin-cdn.js', ['all', '--cdn-slot=' + target.slot, '--dry-run'], {
            PDD_LEVEL_DATA_CDN_DIR: levelDir, PDD_SKIN_DATA_CDN_DIR: skinDir,
            PDD_WECHAT_CDN_SLOT: target.slot === 'A' ? 'B' : 'A',
            PDD_OSSUTIL_BIN: '__must_not_execute_during_dry_run__',
        });
        assert.strictEqual(result.status, 0, result.output);
        for (const [dir, file] of [[levelDir, 'level_live.json'], [skinDir, 'skin_live.json']]) {
            assertDouyinCdnManifest(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')), target, file);
        }
        assert.ok(result.output.includes('oss://game-pdd-v2/' + target.levelDataOssPath));
        assert.ok(result.output.includes('oss://game-pdd-v2/' + target.skinDataOssPath));
        assert.ok(result.output.includes(target.levelDataCdnUrl));
        assert.ok(result.output.includes(target.skinDataCdnUrl));
        assert.ok(result.output.includes(target.profileDataCdnUrl));
        assert.ok(result.output.includes('oss://game-pdd-v2/' + target.profileDataOssPath));
        assert.ok(!result.output.includes('remote_wechat'));
        assert.strictEqual((result.output.match(/Dry-run 校验完成，未上传/g) || []).length, 2);
        console.log('verified Douyin ' + target.slot + ': generated levels/skin, validated manifests, dry-run upload paths');
    }

    // Verify the all wrapper forwards identical slot/dry-run flags and stops after a failed stage.
    const wrapper = read('scripts/sync-douyin-cdn.js');
    for (const failFirst of [false, true]) {
        const calls = [];
        const exit = new Error('process-exit');
        const context = { __dirname: path.join(root, 'scripts'), console: { error() {} },
            process: { argv: ['node', 'wrapper', 'all', '--cdn-slot=B', '--dry-run'], execPath: process.execPath, env: {},
                exit(code) { assert.strictEqual(code, 7); throw exit; } },
            require(name) {
                if (name === 'path') return path;
                if (name === 'child_process') return { spawnSync(exe, args, options) {
                    calls.push({ args, env: { ...options.env } }); return { status: failFirst ? 7 : 0 };
                } };
                return require('../scripts/douyin-cdn-slot-config');
            } };
        if (failFirst) assert.throws(() => vm.runInNewContext(wrapper, context), err => err === exit);
        else vm.runInNewContext(wrapper, context);
        assert.strictEqual(calls.length, failFirst ? 1 : 3);
        for (const call of calls) {
            assert.deepStrictEqual(Array.from(call.args.slice(1)), ['--cdn-slot=B', '--dry-run']);
            assert.strictEqual(call.env.PDD_DOUYIN_CDN_SLOT, 'B');
        }
    }
    const scripts = JSON.parse(read('package.json')).scripts;
    for (const suffix of ['', ':all']) {
        assert.strictEqual(scripts['sync:cdn:douyin' + suffix], 'node scripts/sync-douyin-cdn.js all');
        assert.strictEqual(scripts['sync:cdn:douyin' + suffix + ':dry'], 'node scripts/sync-douyin-cdn.js all --dry-run');
    }
    console.log('douyin-cdn-slot-routing.test.js passed');
} finally {
    if (path.dirname(fixture) !== path.join(root, '.planning') || !path.basename(fixture).startsWith('douyin-ab-tests-')) throw new Error('Invalid test cleanup path');
    fs.rmSync(fixture, { recursive: true, force: true });
}
