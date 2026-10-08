const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('assets/Scripts/Core/PchConveyorGameplayController.ts', 'utf8');
const ast = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
const cls = ast.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'PchConveyorGameplayController');
const names = ['prepareCarrierReturn', 'handleCarriersAtExit', 'handleCarrierAtExit'];
const methods = cls.members.filter(n => names.includes(n.name?.getText(ast))).map(n => n.getText(ast)).join('\n');
const js = ts.transpileModule(`class Harness { ${methods} }`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const Harness = new Function('UITransform', 'Vec3', `${js}; return Harness;`)({}, class {});
const h = new Harness();
const targets = [0, 1, 2];
const reserved = [], flights = [], events = [];
h.rules = {
    carriers: [[1, 1], [1, 1]],
    topColor: () => 1,
    board: { isAllLocked: () => targets.length === 0 },
    autoPlaceAvailableLayers(index) {
        events.push(`reserve:${index}`);
        const boardCells = [];
        while (this.carriers[index].length && targets.length) {
            this.carriers[index].pop();
            const col = targets.shift();
            reserved.push(col);
            boardCells.push({ row: 0, col });
        }
        return { moved: boardCells.length, boardCells, colorIds: boardCells.map(() => 1), sourceLayerIndices: boardCells.map((_, i) => i) };
    },
};
const bean = { isValid: true, getComponent: () => ({ convertToWorldSpaceAR: () => ({ x: 0, y: 0, z: 0 }) }) };
h.carrierNodes = [0, 1].map(() => ({ getChildByName: () => bean }));
h.runtime = {};
h.firstReturnEventSent = true;
h.returnBatchInProgress = false;
h.renderConveyorCarrier = () => assert.equal(reserved.length, 3, 'all frame targets must be reserved before rendering');
h.refreshStatus = () => {};
h.playExitPulse = () => {};
h.animateBeanReturn = (_color, _world, _size, target, index) => {
    assert.equal(reserved.length, 3, 'all frame targets must be reserved before any launch');
    assert.equal(h.returnBatchInProgress, true);
    events.push('flight');
    flights.push([target.col, index]);
};
let finishChecks = 0;
h.tryCommitFinishAfterPchColorCompleteEffects = () => { if (!h.returnBatchInProgress) finishChecks++; };
h.handleCarriersAtExit([0, 1]);
assert.deepEqual(events.slice(0, 2), ['reserve:0', 'reserve:1']);
assert.deepEqual(flights, [[0, 0], [1, 1], [2, 0]], 'each carrier retains its own stagger index');
assert.equal(new Set(reserved).size, 3);
assert.deepEqual(h.rules.carriers, [[], [1]], 'unmatched bean stays on its carrier');
assert.equal(h.returnBatchInProgress, false);
assert.equal(finishChecks, 1, 'only check completion outside batch guard after all launches');
h.handleCarriersAtExit([]);
assert.equal(finishChecks, 1, 'empty plans have no presentation side effects');
console.log('pch-exit-frame-batch.test.js passed');
