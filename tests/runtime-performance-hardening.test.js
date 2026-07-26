const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const debugPerf = read('assets/Scripts/Core/DebugPerfTrace.ts');
const runtimeController = read('assets/Scripts/Core/GameSceneRuntimeController.ts');
const gameplayView = read('assets/Scripts/Core/GameplayViewController.ts');
const rewardedAd = read('assets/Scripts/Platform/RewardedAdProvider.ts');

assert.ok(debugPerf.includes('export function debugPerfFrameStep'), 'debug builds must expose a frame-gap sampling hook');
assert.ok(debugPerf.includes("debugPerfSnapshot('frame.gap'"), 'frame gaps must emit the full runtime/memory snapshot');
assert.ok(debugPerf.includes('FRAME_GAP_TRACE_THRESHOLD_MS = 50'), 'frame-gap tracing must start at the jank threshold');
assert.ok(debugPerf.includes('FRAME_GAP_TRACE_INTERVAL_MS = 1000'), 'frame-gap diagnostics must be throttled');
for (const field of [
    'boardFilledCellCount',
    'activePinddSpineFxCount',
    'reservedPinddSpineFxCount',
    'pinddSpineFxPoolSize',
    'postPlayableWarmupTask',
    'postPlayableWarmupQueueSize',
]) {
    assert.ok(debugPerf.includes(field), `debug snapshots must include ${field}`);
}
assert.ok(runtimeController.includes('debugPerfFrameStep(this.runtime, dt);'), 'the scene update loop must feed real frame deltas to diagnostics');

assert.ok(gameplayView.includes('private renderLegacyBoardSlotCell'), 'legacy node slots must have a side-effect-free cell renderer');
assert.ok(gameplayView.includes('const hasBatchedSlots = this.markBoardSlotBatchRenderersForUpdate();'), 'board operations must dirty slot batches once before traversing cells');
assert.ok(
    !/for \(let r = 0; r < runtime\.boardModel\.height; r\+\+\) \{[\s\S]{0,240}this\.renderBoardSlotCell\(r, c\);/.test(gameplayView),
    'full-board loops must not dirty all slot batches once per cell',
);

assert.ok(rewardedAd.includes('REWARDED_AD_UNUSED_READY_TTL_MS = 45000'), 'unused native ad residency must be bounded');
assert.ok(rewardedAd.includes("this.status !== 'ready'"), 'ready expiry must be state guarded');
assert.ok(rewardedAd.includes('this.currentAdGeneration !== generation'), 'ready expiry must be instance-generation guarded');
assert.ok(rewardedAd.includes('|| this.currentCallback'), 'ready expiry must not touch an active attempt');

console.log('runtime-performance-hardening.test.js passed');
