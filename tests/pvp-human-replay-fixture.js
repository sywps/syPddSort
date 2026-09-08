'use strict';
// Test-only driver of the original controller; never seeded into a production pool.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { BoardModel } = require('../cloudfunctions/pvpService/bot-runtime/BoardModel');
const { PchConveyorRules } = require('../cloudfunctions/pvpService/bot-runtime/PchConveyorRules');
const geometry = require('../cloudfunctions/pvpService/bot-runtime/PchConveyorGeometry');
const { pixelLevelHash } = require('../cloudfunctions/pvpService/bot-runtime/PvpBotReplay');
const { HUMAN_REPLAY_PROTOCOL } = require('../cloudfunctions/pvpService/bot-runtime/PvpHumanReplay');
class Vector { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } clone() { return new Vector(this.x, this.y, this.z); } }
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/PchConveyorGameplayController.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', 'require', code)(loaded, loaded.exports, id => {
  if (id.endsWith('PchConveyorGeometry')) return geometry;
  if (id.endsWith('PchConveyorRules')) return { PchConveyorRules };
  if (id.endsWith('AppRoot')) return { AppRoot: { tryGet: () => null } };
  if (id.endsWith('AnalyticsMgr')) return { AnalyticsMgr: { inst: {} } };
  if (id.endsWith('GameCtrlShared')) return new Proxy({ Vec2: Vector, Vec3: Vector,
    AudioMgr: { inst: { play() {}, vibratePlace() {} } } }, { get: (target, key) => target[key] || class {} });
  if (id.endsWith('OpeningPatternTransition')) return {};
  throw new Error(`unmocked fixture dependency ${id}`);
});
function controllerReplay(level, { timeout = false, frameMs = 50 } = {}) {
  let now = 0;
  const events = [[0, 0, 1]];
  const ready = [];
  const runtime = { isGameEnd: false, recordPvpRuleEvent: (kind, ...args) => events.push([now, kind, ...args]),
    renderBoardCells() {}, gameLose() { this.isGameEnd = true; } };
  const controller = new loaded.exports.PchConveyorGameplayController(runtime);
  controller.rules = new PchConveyorRules(new BoardModel(level), level.conveyorCapacity, level.singleSelectionLimit);
  controller.exitPathProgress = geometry.conveyorExitProgress();
  controller.firstStoreEventSent = true;
  controller.firstReturnEventSent = true;
  for (const key of ['updateSphereFlyEffects', 'updateExitArrowAnimation', 'updateBeltPositions', 'renderEntranceQueue', 'refreshStatus',
    'renderConveyorCarrier', 'playEntranceTransferPulse', 'animateBeanReturn', 'playExitPulse']) controller[key] = () => {};
  controller.getBoardCellWorldPosition = () => new Vector();
  controller.animateBeanIntoConveyor = (_color, _source, index) => ready.push(now + 160 + index * 12);
  controller.carrierNodes = Array.from({ length: controller.rules.carrierCount }, () => ({ isValid: true,
    getChildByName: () => ({ isValid: true, getComponent: () => ({ convertToWorldSpaceAR: () => new Vector() }) }) }));
  let firstTap = -1;
  const limit = level.timeLimit * 1000;
  for (now = frameMs; now <= limit + 200; now += frameMs) {
    for (let index = ready.length - 1; index >= 0; index--) if (ready[index] <= now) {
      runtime.recordPvpRuleEvent(3);
      controller.rules.markQueuedBeansReady(1);
      controller.tryTransferAtCurrentEntrance();
      ready.splice(index, 1);
    }
    if (now === 1000) controller.setManualSpeedMultiplier(3);
    controller.update(frameMs / 1000);
    if (controller.rules.board.isAllLocked() || runtime.isGameEnd) break;
    if (now % 200 !== 0 || (timeout && firstTap >= 0) || controller.rules.bufferCount >= controller.rules.bufferCapacity) continue;
    let best;
    let cost = -1;
    const held = new Set([...controller.rules.entryColors, ...controller.rules.carriers.flat()]);
    for (let row = 0; row < level.boardHeight; row++) for (let col = 0; col < level.boardWidth; col++) {
      const block = controller.rules.selectBoard(row, col);
      if (!block) continue;
      const score = block.cells.length + block.cells.filter(cell => held.has(controller.rules.board.correctColors[cell.row][cell.col])).length * 4;
      if (score > cost) { cost = score; best = { row, col }; }
    }
    if (best) { controller.handleBoardTap(best.row, best.col); if (firstTap < 0) firstTap = now; }
  }
  const terminalType = controller.rules.board.isAllLocked() ? 'PASS' : runtime.isGameEnd ? 'DEAD_CONVEYOR_FULL' : 'DEAD_TIMEOUT';
  const terminalTimeMs = Math.min(now, limit + 200);
  return { envelope: { protocol: HUMAN_REPLAY_PROTOCOL, levelHash: pixelLevelHash(level), events }, terminalType, terminalTimeMs,
    board: controller.rules.board, rules: controller.rules };
}
module.exports = { controllerReplay };
