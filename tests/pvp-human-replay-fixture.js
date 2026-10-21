'use strict';
// Test-only driver of the original controller; never seeded into a production pool.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const runtimeRoot = path.join(__dirname, process.env.PDD_REPLAY_TEST_PLATFORM === 'douyin'
  ? '../cloudfunctions-douyin/multiplayer/pvp/bot-runtime' : '../cloudfunctions/pvpService/bot-runtime');
const { BoardModel } = require(path.join(runtimeRoot, 'BoardModel'));
const { PchConveyorRules } = require(path.join(runtimeRoot, 'PchConveyorRules'));
const geometry = require(path.join(runtimeRoot, 'PchConveyorGeometry'));
const { pixelLevelHash } = require(path.join(runtimeRoot, 'PvpBotReplay'));
const { HUMAN_REPLAY_PROTOCOL } = require(path.join(runtimeRoot, 'PvpHumanReplay'));
class Vector { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } clone() { return new Vector(this.x, this.y, this.z); } }
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/PchConveyorGameplayController.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', 'require', code)(loaded, loaded.exports, id => {
  if (id === 'cc') return { sp: { Skeleton: class Skeleton {} } };
  if (id === './OriginalBeanSelection' || id === './BeanSelectionPreview') {
    const exports = {};
    const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core', id + '.ts'), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    new Function('exports', 'require', js)(exports, dependency => {
      if (dependency === 'cc/env') return { PREVIEW: false };
      if (dependency === './BeanSelectionExperiment') return { beanSelectionExperiment: { content: () => 'A' } };
      if (dependency === './MiniGamePlatform') return { isMiniGameRuntime: () => false };
      throw new Error(`unmocked preview dependency ${dependency}`);
    });
    return exports;
  }
  if (id.endsWith('PchConveyorGeometry')) return geometry;
  if (id.endsWith('PchConveyorRules')) return { PchConveyorRules };
  if (id.endsWith('AppRoot')) return { AppRoot: { tryGet: () => null } };
  if (id.endsWith('AnalyticsMgr')) return { AnalyticsMgr: { inst: { getCurrentRoundId: () => '', isCollectionEnabled: () => false } } };
  if (id.endsWith('GameCtrlShared')) return new Proxy({ Vec2: Vector, Vec3: Vector, Color: Vector,
    AudioMgr: { inst: { play() {}, vibratePlace() {} } } }, { get: (target, key) => target[key] || class {} });
  if (id.endsWith('OpeningPatternTransition')) return {};
  if (id === './FirstLevelContent') return { getFirstLevelContent: () => 'A' };
  if (id === './DebugPerfTrace') return { collectActiveBlockInputEvents: () => [] };
  if (id === './CsdInteractionMonitor') return { CsdInteractionMonitor: class {} };
  if (id === './GuideCorgiBubble') return { createGuideCorgiBubble() { throw Error('PVP fixture must not render tutorial'); } };
  throw new Error(`unmocked fixture dependency ${id}`);
});
function controllerReplay(level, { timeout = false, frameMs = 50, speedUpAtMs = 1000 } = {}) {
  let now = 0;
  const events = [[0, 0, 1]];
  const ready = [];
  const runtime = { isGameEnd: false, recordPvpRuleEvent: (kind, ...args) => events.push([now, kind, ...args]),
    renderBoardCells() {}, gameLose() { this.isGameEnd = true; } };
  const controller = new loaded.exports.PchConveyorGameplayController(runtime);
  controller.rules = new PchConveyorRules(new BoardModel(level), level.conveyorCapacity, level.singleSelectionLimit, undefined, level.autoConveyorFinishSpeed);
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
    if (now === speedUpAtMs) controller.setManualSpeedMultiplier(3);
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
