import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../../assets/Scripts/Core/WorkbenchPreviewService.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 } }).outputText;
function harness({ active = true, background = null, failEvent = '' } = {}) {
    const calls = [], config = { schemaVersion: 1, source: 'client-preview', sessionId: 'test-session', configHash: 'a'.repeat(64),
        expires: Date.now() + 3600000, variant: 'B', level: { levelId: 3, correctColorArr: [[1]], initRandomColorArr: [[1]], conveyorCapacity: 66 }, background };
    const sandbox = { exports: {}, window: { location: { hostname: '127.0.0.1', hash: active ? '#pddWorkbenchOrigin=http%3A%2F%2F127.0.0.1%3A4318&pddWorkbenchToken=' + 'b'.repeat(64) : '' } },
        URL, URLSearchParams, AbortController, setTimeout, clearTimeout, console, requestAnimationFrame: fn => fn(),
        require(name) { if (name === './MiniGamePlatform') return { isMiniGameRuntime: () => false }; return {}; },
        async fetch(url, options) {
            const body = JSON.parse(options.body); calls.push({ url, options, body });
            if (body.type === failEvent) return { ok: false, json: async () => ({ error: '明确失败' }) };
            return { ok: true, json: async () => url.endsWith('/config') ? config : { accepted: true } };
        },
    };
    vm.runInNewContext(output, sandbox);
    return { ...sandbox.exports, calls, config };
}

test('客户端仅显式试玩入口启用，冻结配置与事件顺序', async () => {
    const inactive = harness({ active: false });
    assert.equal(inactive.isWorkbenchPreviewRequested(), false);
    assert.equal(inactive.calls.length, 0);
    const h = harness(), service = h.WorkbenchPreviewService.inst;
    assert.equal(h.isWorkbenchPreviewRequested(), true);
    const level = await service.loadLevel(3, 'level_');
    assert.equal(level.conveyorCapacity, 66);
    level.conveyorCapacity = 99;
    assert.equal(h.config.level.conveyorCapacity, 66);
    await service.prepare({}, 3);
    await service.ready({ isValid: true, isGameEnd: false, getActivePhysicalLevelId: () => 3 }, 3);
    await service.complete(3);
    assert.deepEqual(h.calls.filter(c => c.body.type).map(c => c.body.type), ['loaded', 'exposure', 'complete']);
    assert.ok(h.calls.every(c => c.options.credentials === 'omit' && c.options.headers.Authorization === 'Bearer ' + 'b'.repeat(64)));
    await assert.rejects(service.complete(4), /有效配置/);
});

test('客户端错误目标、个人背景与上报失败显性停止', async () => {
    const wrong = harness();
    await assert.rejects(wrong.WorkbenchPreviewService.inst.loadLevel(4, 'level_'), /目标关卡/);
    assert.equal(wrong.calls.length, 1);
    const bg = harness({ background: { id: 'c'.repeat(64), width: 64, height: 64 } });
    await bg.WorkbenchPreviewService.inst.loadLevel(3, 'level_');
    await assert.rejects(bg.WorkbenchPreviewService.inst.prepare({ getEquippedBackgroundSkinId: () => 1001 }, 3), /个人背景/);
    const failed = harness({ failEvent: 'exposure' }), service = failed.WorkbenchPreviewService.inst;
    await service.loadLevel(3, 'level_');
    await assert.rejects(service.ready({ isValid: true, isGameEnd: false, getActivePhysicalLevelId: () => 3 }, 3), /明确失败/);
    await assert.rejects(service.complete(3), /明确失败/);
    assert.ok(!failed.calls.some(c => c.body.type === 'complete'));
});
