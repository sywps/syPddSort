const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
);

function methodBody(marker) {
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `missing method: ${marker}`);
    const signatureEnd = source.indexOf('): void {', start);
    assert.ok(signatureEnd >= 0, `missing method signature end: ${marker}`);
    const open = source.indexOf('{', signatureEnd);
    assert.ok(open >= 0, `missing method body: ${marker}`);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(open + 1, index);
    }
    throw new Error(`unterminated method: ${marker}`);
}

const resetAnalytics = new Function(methodBody('private resetAnalyticsStats(): void'));
const resetRuntime = {
    rules: {},
    analyticsStats: null,
    firstStoreEventSent: true,
    firstReturnEventSent: true,
};
resetAnalytics.call(resetRuntime);
assert.deepStrictEqual(
    resetRuntime.analyticsStats,
    { magnetUses: 0, brushUses: 0, freezeUses: 0 },
    'a PCH attempt snapshot must contain only the three successful skill-use counters',
);
assert.strictEqual(resetRuntime.firstStoreEventSent, false);
assert.strictEqual(resetRuntime.firstReturnEventSent, false);

const tracked = [];
const AnalyticsMgr = {
    inst: {
        trackFunnelEvent(event) { tracked.push(event); },
    },
};
const trackPch = new Function(
    'AnalyticsMgr',
    'PCH_GAMEPLAY_MODE',
    'PCH_GAMEPLAY_SCHEMA_VERSION',
    'eventName',
    'options',
    methodBody('private trackPchFunnelEvent('),
);
const runtime = {
    logicalLevelId: 1,
    getActiveLogicalLevelId() { return this.logicalLevelId; },
    getAnalyticsLevelId() { return this.logicalLevelId; },
    getActivePhysicalLevelId() { return 101; },
    getAnalyticsPage() { return 'level_game'; },
};
const controller = { runtime };
for (const logicalLevelId of [1, 2, 3, 4, 99]) {
    runtime.logicalLevelId = logicalLevelId;
    trackPch.call(controller, AnalyticsMgr, 'pch_conveyor', 1, 'pch_first_store_success', {});
}
assert.deepStrictEqual(
    tracked.map((event) => event.logicalLevelId),
    [1, 2, 3],
    'PCH milestone emission must be limited to logical L1-L3',
);

for (const eventName of [
    'pch_first_store_success',
    'pch_first_return_success',
    'pch_guide_step_shown',
    'pch_guide_tap_result',
    'pch_guide_step_done',
]) {
    assert.ok(source.includes(`'${eventName}'`), `missing approved PCH event ${eventName}`);
}
assert.match(
    source,
    /if \(!this\.firstStoreEventSent\)[\s\S]*?this\.firstStoreEventSent = true;[\s\S]*?'pch_first_store_success'/,
    'first store must emit at most once per attempt',
);
assert.match(
    source,
    /if \(!this\.firstReturnEventSent\)[\s\S]*?this\.firstReturnEventSent = true;[\s\S]*?'pch_first_return_success'/,
    'first return must emit at most once per attempt',
);

console.log('pch-analytics-client-contract.test.js passed');
