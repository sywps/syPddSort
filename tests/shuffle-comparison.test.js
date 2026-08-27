'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shuffle = require('../tools/shuffle-comparison.js');

const root = path.resolve(__dirname, '..');
const levels = [];
for (let levelId = 1; levelId <= 182; levelId += 1) {
    const file = path.join(root, 'tools', 'dbt', `level_${levelId}.json`);
    levels.push(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function inventoryObject(grid) {
    return Object.fromEntries([...shuffle.colorInventory(grid)].sort((a, b) => a[0] - b[0]));
}

const profile = shuffle.learnProfile(levels);
assert.equal(profile.count, 182);
const aggregate = { old: [], firstPrototype: [], next: [] };
for (const level of levels) {
    const generated = shuffle.generate(level.correctColorArr, { levelId: level.levelId, profile, outlineGrid: level.initRandomColorArr });
    const repeated = shuffle.generate(level.correctColorArr, { levelId: level.levelId, profile, outlineGrid: level.initRandomColorArr });
    assert.deepEqual(generated, repeated, `level ${level.levelId} must be deterministic`);
    assert.deepEqual(inventoryObject(generated), inventoryObject(level.correctColorArr), `level ${level.levelId} inventory`);
    assert.doesNotThrow(() => shuffle.assertOutline(level.initRandomColorArr, generated), `level ${level.levelId} outline`);
    assert.deepEqual(generated.map(row => row.map(Number)), generated, `level ${level.levelId} numeric grid`);
    aggregate.old.push(shuffle.metrics(level.correctColorArr, level.initRandomColorArr));
    aggregate.firstPrototype.push(shuffle.metrics(level.correctColorArr, shuffle.generateInterleaved(level.correctColorArr, { levelId: level.levelId })));
    aggregate.next.push(shuffle.metrics(level.correctColorArr, generated));
}

function average(key, items) {
    return items.reduce((sum, item) => sum + item[key], 0) / items.length;
}

const summary = {
    count: levels.length,
    old: {
        displacement: average('displacement', aggregate.old),
        sameNeighborRatio: average('sameNeighborRatio', aggregate.old),
        singletonRatio: average('singletonRatio', aggregate.old),
        componentsPerColor: average('componentsPerColor', aggregate.old),
        largestCluster: average('largestCluster', aggregate.old),
        similarCountSwapRatio: average('similarCountSwapRatio', aggregate.old),
    },
    firstPrototype: {
        displacement: average('displacement', aggregate.firstPrototype),
        sameNeighborRatio: average('sameNeighborRatio', aggregate.firstPrototype),
        singletonRatio: average('singletonRatio', aggregate.firstPrototype),
        componentsPerColor: average('componentsPerColor', aggregate.firstPrototype),
        largestCluster: average('largestCluster', aggregate.firstPrototype),
        similarCountSwapRatio: average('similarCountSwapRatio', aggregate.firstPrototype),
    },
    next: {
        displacement: average('displacement', aggregate.next),
        sameNeighborRatio: average('sameNeighborRatio', aggregate.next),
        singletonRatio: average('singletonRatio', aggregate.next),
        componentsPerColor: average('componentsPerColor', aggregate.next),
        largestCluster: average('largestCluster', aggregate.next),
        outlineRetention: average('outlineRetention', aggregate.next),
        similarCountSwapRatio: average('similarCountSwapRatio', aggregate.next),
    },
};

assert.equal(summary.count, 182);
function aggregateDistance(candidate, source) {
    return Math.abs(candidate.displacement - source.displacement) * 4
        + Math.abs(candidate.sameNeighborRatio - source.sameNeighborRatio) * 4
        + Math.abs(candidate.singletonRatio - source.singletonRatio) * 2
        + Math.abs(candidate.componentsPerColor - source.componentsPerColor) / Math.max(3, source.componentsPerColor)
        + Math.abs(candidate.largestCluster - source.largestCluster) / Math.max(12, source.largestCluster);
}

summary.firstPrototype.distanceToOld = aggregateDistance(summary.firstPrototype, summary.old);
summary.next.distanceToOld = aggregateDistance(summary.next, summary.old);
console.log(JSON.stringify(summary, null, 2));
assert.ok(summary.next.displacement >= 0.85, 'learned shuffle should displace at least 85% on average');
assert.equal(summary.next.outlineRetention, 1, 'learned shuffle must preserve the original outline exactly');
assert.ok(summary.next.distanceToOld < summary.firstPrototype.distanceToOld * 0.6, 'learned shuffle should be substantially closer to the source style');
assert.ok(Math.abs(summary.next.sameNeighborRatio - summary.old.sameNeighborRatio) < 0.18, 'learned adjacency should track the source cohort');
assert.ok(summary.next.largestCluster >= summary.old.largestCluster * 0.95, 'learned shuffle should retain source-scale large clusters');
assert.ok(summary.next.largestCluster <= summary.old.largestCluster * 1.2, 'learned shuffle should not collapse into oversized monolithic regions');
assert.ok(summary.next.sameNeighborRatio >= summary.old.sameNeighborRatio, 'cohesion mode should keep same-color adjacency at or above the source average');
assert.ok(summary.next.singletonRatio <= summary.old.singletonRatio * 1.1, 'cohesion mode should keep isolated beans near or below the source average');
assert.ok(summary.next.componentsPerColor <= summary.old.componentsPerColor, 'cohesion mode should use fewer color components than the source average');
assert.ok(summary.next.largestCluster >= summary.old.largestCluster, 'cohesion mode should produce source-scale or larger primary clusters');
assert.ok(summary.next.similarCountSwapRatio >= 0.3, 'similar-count pairing should exchange at least 30% of active cells with paired-color target regions');
assert.ok(summary.next.similarCountSwapRatio > summary.firstPrototype.similarCountSwapRatio, 'similar-count pairing should beat the unpaired prototype');
