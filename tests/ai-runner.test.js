const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { invariantFailures, createCoverage, updateCoverage, chooseAction } = require('../tools/ai-runner/game-policy');
const { createRng } = require('../tools/ai-runner/browser-session');
const { combinedStatus } = require('../scripts/ai-runner');

function state(overrides = {}) {
    return { phase: 'playing', observedAt: 100, level: 1, round: 1, validActions: 0,
        bufferCount: 1, bufferCapacity: 3, entryCount: 0, stackDepth: 3, carrierSizes: [1], carrierCapacities: [3],
        cells: [{ row: 0, col: 0, target: 1, current: 0, locked: false, point: { x: 10, y: 20 } }],
        colors: { 1: 1 }, targetColors: { 1: 1 }, buttons: [], ...overrides };
}

test('color checks account for beans in transit and catch loss, duplication, wrong color and invalid locks', () => {
    assert.deepEqual(invariantFailures(state()), []);
    for (const colors of [{}, { 1: 2 }, { 2: 1 }]) assert.ok(invariantFailures(state({ colors })).includes('bean-color-conservation'));
    assert.ok(invariantFailures(state({ cells: [{ target: 1, current: 2, locked: true }] })).includes('invalid-locked-cell'));
    assert.ok(invariantFailures(state({ bufferCount: 4 })).includes('buffer-out-of-range'));
    assert.ok(invariantFailures(state({ phase: 'win' })).includes('premature-victory'));
    assert.deepEqual(invariantFailures(state({ bufferCount: 6, bufferCapacity: 120, carrierSizes: [6], carrierCapacities: [6] })), [],
        'level-specific carrier capacity can legitimately exceed the default stack depth');
    assert.ok(invariantFailures(state({ carrierSizes: [7], carrierCapacities: [6] })).includes('carrier-stack-out-of-range'));
});

test('random clicks and visual activity cannot satisfy core flow; victory alone is insufficient', () => {
    const c = createCoverage('core');
    assert.equal(updateCoverage(c, state()), false);
    assert.ok(c.missing.includes('validBoardAction'));
    assert.equal(updateCoverage(c, state({ phase: 'win', validActions: 2 })), false);
    assert.deepEqual(c.missing, ['nextLevelReady']);
    assert.equal(updateCoverage(c, state({ level: 2, round: 2 })), true);
});

test('revive success requires same round recovery and a subsequent valid action', () => {
    const c = createCoverage('revive');
    updateCoverage(c, state({ validActions: 3 }));
    updateCoverage(c, state({ phase: 'revive', validActions: 3 }), { type: 'click', reason: 'revive' });
    assert.equal(updateCoverage(c, state({ round: 2, validActions: 4 })), false, 'restart must not count as revive');
    assert.equal(updateCoverage(c, state({ validActions: 3 })), false);
    assert.ok(c.missing.includes('actionAfterRevive'));
    assert.equal(updateCoverage(c, state({ validActions: 4 })), true);
});

test('guide input has priority, unavailable controls wait, and blocked gameplay is not bypassed', () => {
    const rng = createRng(0);
    assert.equal(chooseAction(state({ phase: 'guide', guideTarget: { x: 3, y: 4 }, guide: 'guide' }), 'core', rng).reason, 'guide-target');
    assert.equal(chooseAction(state({ phase: 'win' }), 'core', rng).type, 'wait');
    assert.equal(chooseAction(state({ inputLocked: true }), 'core', rng).type, 'wait');
    assert.equal(chooseAction(state({ externalInputBlocked: true }), 'core', rng).type, 'wait');
});

test('recorded zero seed is reproducible and distinct from seed one', () => {
    const sample = seed => { const rng = createRng(seed); return Array.from({ length: 8 }, () => rng()); };
    assert.deepEqual(sample(0), sample(0));
    assert.notDeepEqual(sample(0), sample(1));
});

test('CLI rejects invalid and duplicate batch arguments; dry run performs no browser launch', () => {
    const cli = path.resolve(__dirname, '../scripts/ai-runner.js');
    for (const args of [['--runs', '0'], ['--steps', 'NaN'], ['--seed', '-1'], ['--levels', '1,1'],
        ['--scenario', 'core', '--url', 'https://example.com/']]) {
        const result = spawnSync(process.execPath, [cli, ...args, '--dry-run'], { encoding: 'utf8' });
        assert.equal(result.status, 1, JSON.stringify(args));
    }
    const result = spawnSync(process.execPath, [cli, '--scenario', 'core', '--levels', '1,15', '--runs', '2', '--dry-run'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).levels, [1, 15]);
});

test('batch summary distinguishes uncovered scenarios, environment failures and observed failures', () => {
    assert.equal(combinedStatus([{ status: 'passed' }, { status: 'incomplete' }]), 'incomplete');
    assert.equal(combinedStatus([{ status: 'tool_failed' }]), 'tool_failed');
    assert.equal(combinedStatus([{ status: 'failed' }, { status: 'incomplete' }]), 'failed');
});
