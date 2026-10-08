'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/PchConveyorGeometry.ts'), 'utf8');
const geometry = {};
new Function('exports', ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(geometry);
const angleDelta = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
// Historical exit values are protocol fixtures, not recomputed from the new curve.
assert.equal(geometry.conveyorExitProgress(2), 0.5344395919157496);
assert.equal(geometry.conveyorExitProgress(3), 0.5606097214541232);
for (const scale of [0.6, 1, 1.2]) {
    const route = geometry.createRoundedConveyorPath(2, scale);
    const sample = distance => {
        const point = { x: 0, y: 0 };
        const angle = geometry.sampleRoundedConveyorPath(route, distance / route.totalLength, point);
        return { ...point, angle };
    };
    const entrance = sample(0), exit = sample(route.totalLength * geometry.conveyorExitProgress());
    near(entrance.x, -219 * scale); near(entrance.y, -99 * scale);
    near(exit.x, 152 * scale); near(exit.y, 104.2 * scale);
    near(route.waypointDistances[3] / route.totalLength, geometry.conveyorExitProgress(), 1e-12);
    const turns = route.segments.filter(s => s.kind === 'smooth');
    assert.equal(turns.length, 4);
    for (const turn of turns) {
        const duration = turn.length / route.totalLength * 2;
        assert.ok(duration > 0.075 && duration < 0.085, '3X turn duration stays near 0.08s');
        const start = sample(turn.startDistance), end = sample(turn.startDistance + turn.length);
        const first = sample(turn.startDistance + turn.length * 0.01);
        const last = sample(turn.startDistance + turn.length * 0.99);
        assert.ok(angleDelta(first.angle, start.angle) < 0.05, 'gentle entry curvature');
        assert.ok(angleDelta(last.angle, end.angle) < 0.05, 'gentle exit curvature');
        for (const boundary of [turn.startDistance, turn.startDistance + turn.length]) {
            const a = sample(boundary - 1e-5), b = sample(boundary + 1e-5);
            near(Math.hypot(a.x - b.x, a.y - b.y), 2e-5, 1e-8);
            assert.ok(angleDelta(a.angle, b.angle) < 0.001, 'no join heading jump');
        }
    }
    for (let i = 0; i < 12000; i++) {
        const distance = (i + 0.123) / 12000 * route.totalLength;
        const a = sample(distance), b = sample(distance + route.totalLength * 1e-6);
        near(Math.hypot(a.x - b.x, a.y - b.y) / (route.totalLength * 1e-6), 1, 0.00002);
    }
    for (const fps of [30, 60]) {
        let peak = 0;
        for (let i = 0; i < 12000; i++) {
            const d = route.totalLength * i / 12000;
            peak = Math.max(peak, angleDelta(sample(d).angle, sample(d + route.totalLength / (2 * fps)).angle));
        }
        assert.ok(peak < (fps === 60 ? 22 : 44), '3X frame heading change is below old path peak');
    }
}
assert.throws(() => geometry.createRoundedConveyorPath(2, 0), /invalid conveyor path scale/);
assert.throws(() => geometry.createRoundedConveyorPath(2, NaN), /invalid conveyor path scale/);
const route = geometry.createRoundedConveyorPath(2, 0.6);
for (const runtime of ['cloudfunctions/pvpService/bot-runtime', 'cloudfunctions/coopService/runtime']) {
    const cloud = require(path.join(root, runtime, 'PchConveyorGeometry.js'));
    assert.equal(cloud.conveyorExitProgress(), geometry.conveyorExitProgress());
    const cloudRoute = cloud.createRoundedConveyorPath(2, 0.6);
    assert.deepEqual(cloudRoute, route);
    for (let i = 0; i <= 2000; i++) {
        const a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
        assert.equal(cloud.sampleRoundedConveyorPath(cloudRoute, i / 2000, a), geometry.sampleRoundedConveyorPath(route, i / 2000, b));
        assert.deepEqual(a, b);
        assert.deepEqual(cloud.conveyorEntranceCarrier(i / 37, 20), geometry.conveyorEntranceCarrier(i / 37, 20));
    }
}
console.log('pch-conveyor-smooth-turn: PASS (constant-speed, gradual joins, historical gates, cloud parity)');
