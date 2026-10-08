const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8');
const parsed = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
const declaration = parsed.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'PchConveyorGameplayController');
const names = ['enqueueOrdinaryReturn', 'updateOrdinaryReturnQueue', 'clearPchColorCompleteSequence'];
const methods = declaration.members.filter(n => names.includes(n.name?.getText(parsed))).map(n => n.getText(parsed)).join('\n');
const compiled = ts.transpileModule(`class Harness { ${methods} }`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const interval = Number(source.match(/const PCH_RETURN_STAGGER_SECONDS = ([\d.]+);/)[1]);
assert.equal(interval, 0.07);
let frame = 0;
const Harness = new Function('PCH_RETURN_STAGGER_SECONDS', 'director', `${compiled}; return Harness;`)(interval, { getTotalFrames: () => frame });
function setup() {
 const h = new Harness();
 Object.assign(h, { ordinaryReturnQueue: [], ordinaryReturnClock: 0, ordinaryReturnLastLaunchFrame: -1, runtime: {}, presentationCompletions: new Map(), pendingPchReturnColorSettles: new Set(), pchColorCompleteSequenceGeneration: 1 });
 const launches = [];
 const enqueue = (id, index = 0) => h.enqueueOrdinaryReturn(index, () => launches.push({ id, time: h.ordinaryReturnClock, frame }));
 const tick = dt => { frame++; h.updateOrdinaryReturnQueue(dt); };
 return { h, launches, enqueue, tick };
}
{
 const { h, launches, enqueue, tick } = setup();
 enqueue('A0'); enqueue('A1', 1); enqueue('A2', 2);
 tick(0.07); tick(0.03);
 enqueue('B0'); enqueue('B1', 1); enqueue('B2', 2);
 tick(0.040001); tick(0.03); tick(0.07);
 assert.deepEqual(launches.map(x => x.id), ['A0', 'A1', 'B0', 'A2', 'B1', 'B2']);
 assert.ok(Math.abs(launches.at(-1).time - 0.24) < 0.00001, 'B deadlines do not wait for A to finish');
 assert.equal(h.ordinaryReturnQueue.length, 0);
}
{
 const { h, launches, enqueue, tick } = setup();
 for (let i = 0; i < 12; i++) enqueue(i);
 assert.equal(launches.length, 1, 'same-frame arrivals only launch once');
 tick(2);
 assert.equal(launches.length, 2, 'stall does not burst overdue launches');
 enqueue(12); h.updateOrdinaryReturnQueue(0);
 assert.equal(launches.length, 2, 'enqueue after update cannot bypass frame guard');
 for (let i = 0; i < 11; i++) tick(1 / 60);
 assert.deepEqual(launches.map(x => x.id), Array.from({ length: 13 }, (_, i) => i));
 assert.equal(new Set(launches.map(x => x.frame)).size, 13);
}
{
 const { h, launches, enqueue, tick } = setup();
 enqueue('first'); enqueue('later', 1);
 tick(0.03);
 for (const flag of ['settingsPaused', 'settlementPaused', 'skillMovementPaused']) {
  h[flag] = true; tick(10); assert.equal(launches.length, 1); h[flag] = false;
 }
 for (const flag of ['_adShowing', '_rewardedGrantTransaction', 'isGameEnd']) {
  h.runtime[flag] = true; tick(10); assert.equal(launches.length, 1); h.runtime[flag] = false;
 }
 h.runtime._gameForeground = false; tick(10); h.runtime._gameForeground = true;
 assert.equal(h.ordinaryReturnClock, 0.03);
 tick(0.040001); assert.equal(launches.length, 2);
 enqueue('cancel', 2); h.clearPchColorCompleteSequence(); tick(1);
 assert.equal(launches.length, 2); assert.equal(h.pchColorCompleteSequenceGeneration, 2);
 enqueue('new'); assert.equal(launches.at(-1).id, 'new');
}
// Simulate continuous full carriers at 60fps, using actual arrival cadence for every speed.
for (const speed of [1, 2, 3, 5]) {
 const { h, launches, enqueue, tick } = setup();
 let batches = 0;
 const dueTimes = new Map();
 for (let f = 0; f < 600; f++) {
  tick(1 / 60);
  const arrivals = Math.floor((f / 60) / (0.3 / speed)) + 1;
  while (batches < arrivals) {
   for (let index = 0; index < 3; index++) {
    const id = `${batches}:${index}`;
    dueTimes.set(id, h.ordinaryReturnClock + index * interval);
    enqueue(id, index);
   }
   batches++;
  }
 }
 for (let f = 0; f < 30; f++) tick(1 / 60);
 assert.equal(launches.length, batches * 3, `speed ${speed}: every bean launches`);
 assert.equal(new Set(launches.map(x => x.frame)).size, launches.length);
 const maxLate = Math.max(...launches.map(x => x.time - dueTimes.get(x.id)));
 assert.ok(maxLate < 0.051, `speed ${speed}: no growing backlog, max late ${maxLate}`);
 console.log(`60fps speed ${speed}: ${launches.length} launches, max deadline delay ${(maxLate * 1000).toFixed(1)}ms`);
}
console.log('pch-return-global-queue.test.js passed');
