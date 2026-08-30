const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'),
    'utf8',
);

function methodBody(marker) {
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `missing method marker: ${marker}`);
    const open = source.indexOf('{', start);
    assert.ok(open >= 0, `missing method body: ${marker}`);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        const character = source[index];
        if (character === '{') depth += 1;
        if (character !== '}') continue;
        depth -= 1;
        if (depth === 0) return source.slice(open + 1, index);
    }
    throw new Error(`unterminated method body: ${marker}`);
}

const audioCalls = [];
const vibrationCalls = [];
const AudioMgr = {
    inst: {
        play(name) {
            audioCalls.push(name);
        },
        vibratePlace() {
            vibrationCalls.push('place');
        },
    },
};

const getEntranceVisitOrdinal = new Function(
    `return function (carrierIndex) {${methodBody('private getEntranceVisitOrdinal(')}};`,
)();
const handleCarrierAtEntrance = new Function(
    'AudioMgr',
    `return function (carrierIndex) {${methodBody('private handleCarrierAtEntrance(')}};`,
)(AudioMgr);

function makeController(transferResults, carrierCount = 12) {
    const visualCalls = [];
    const results = [...transferResults];
    const controller = {
        beltTravel: 0,
        lastEntranceAudioVisitByCarrier: new Map(),
        rules: {
            carrierCount,
            readyEntryCount: 1,
            transferReadyBeansToCarrier(carrierIndex) {
                const result = results.shift();
                assert.ok(result, `missing transfer result for carrier ${carrierIndex}`);
                return { carrierIndex, ...result };
            },
        },
        getEntranceVisitOrdinal,
        renderConveyorCarrier(carrierIndex) {
            visualCalls.push(`carrier:${carrierIndex}`);
        },
        renderEntranceQueue() {
            visualCalls.push('queue');
        },
        refreshStatus() {
            visualCalls.push('status');
        },
        playEntranceTransferPulse(carrierIndex) {
            visualCalls.push(`pulse:${carrierIndex}`);
        },
    };
    return { controller, visualCalls };
}

audioCalls.length = 0;
vibrationCalls.length = 0;
const emptyCarrier = makeController([{ moved: 3 }]);
emptyCarrier.controller.beltTravel = 11.98;
assert.equal(handleCarrierAtEntrance.call(emptyCarrier.controller, 0), true);
assert.deepEqual(audioCalls, ['place'], 'an empty carrier loading three beans must play once');
assert.deepEqual(vibrationCalls, ['place'], 'an empty carrier loading three beans must vibrate once');

audioCalls.length = 0;
vibrationCalls.length = 0;
const partlyFilledCarrier = makeController([{ moved: 2 }]);
partlyFilledCarrier.controller.beltTravel = 11.98;
assert.equal(handleCarrierAtEntrance.call(partlyFilledCarrier.controller, 0), true);
assert.deepEqual(audioCalls, ['place'], 'a carrier loading its remaining two beans must play once');
assert.deepEqual(vibrationCalls, ['place'], 'a carrier loading its remaining two beans must vibrate once');

audioCalls.length = 0;
vibrationCalls.length = 0;
const fullCarrier = makeController([{ moved: 0 }]);
fullCarrier.controller.beltTravel = 11.98;
assert.equal(handleCarrierAtEntrance.call(fullCarrier.controller, 0), false);
assert.deepEqual(audioCalls, [], 'a full carrier that moves no beans must stay silent');
assert.deepEqual(vibrationCalls, [], 'a full carrier that moves no beans must not vibrate');
assert.equal(fullCarrier.controller.lastEntranceAudioVisitByCarrier.size, 0, 'a failed load must not consume the visit sound');
assert.deepEqual(fullCarrier.visualCalls, [], 'a failed load must not emit transfer visuals');

audioCalls.length = 0;
vibrationCalls.length = 0;
const repeatedVisit = makeController([
    { moved: 1 },
    { moved: 2 },
    { moved: 1 },
    { moved: 1 },
]);
repeatedVisit.controller.beltTravel = 11.98;
assert.equal(getEntranceVisitOrdinal.call(repeatedVisit.controller, 0), 1, 'pre-snap visit must resolve to loop one');
assert.equal(handleCarrierAtEntrance.call(repeatedVisit.controller, 0), true);
repeatedVisit.controller.beltTravel = 12.02;
assert.equal(getEntranceVisitOrdinal.call(repeatedVisit.controller, 0), 1, 'post-snap visit must remain on loop one');
assert.equal(handleCarrierAtEntrance.call(repeatedVisit.controller, 0), true);
assert.deepEqual(audioCalls, ['place'], 'repeated successful transfers in one entrance visit must play once');
assert.deepEqual(vibrationCalls, ['place'], 'repeated successful transfers in one entrance visit must vibrate once');

assert.equal(handleCarrierAtEntrance.call(repeatedVisit.controller, 1), true);
assert.deepEqual(audioCalls, ['place', 'place'], 'an interleaved carrier must keep an independent visit transaction');
assert.deepEqual(vibrationCalls, ['place', 'place'], 'an interleaved carrier must keep an independent vibration transaction');
repeatedVisit.controller.beltTravel = 12.01;
assert.equal(handleCarrierAtEntrance.call(repeatedVisit.controller, 0), true);
assert.deepEqual(audioCalls, ['place', 'place'], 'returning to the first carrier in the same visit must remain deduplicated');
assert.deepEqual(vibrationCalls, ['place', 'place'], 'returning to the first carrier in the same visit must not add vibration');

repeatedVisit.controller.rules.transferReadyBeansToCarrier = (carrierIndex) => ({ carrierIndex, moved: 3 });
repeatedVisit.controller.beltTravel = 23.98;
assert.equal(getEntranceVisitOrdinal.call(repeatedVisit.controller, 0), 2, 'the next loop must produce the next visit ordinal');
assert.equal(handleCarrierAtEntrance.call(repeatedVisit.controller, 0), true);
assert.deepEqual(audioCalls, ['place', 'place', 'place'], 'the same carrier may play again on its next successful loop');
assert.deepEqual(vibrationCalls, ['place', 'place', 'place'], 'the same carrier may vibrate again on its next successful loop');

const stopBody = methodBody('stop(): void');
const expandBody = methodBody('private expandCapacity(');
assert.ok(stopBody.includes('this.lastEntranceAudioVisitByCarrier.clear();'), 'stop must reset entrance audio visits');
assert.ok(expandBody.includes('this.lastEntranceAudioVisitByCarrier.clear();'), 'capacity expansion must reset visit ordinals after carrier-count changes');

console.log('pch-entry-audio-transaction.test.js passed');
