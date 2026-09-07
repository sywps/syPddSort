import {
    PVP_RANKED_MODE_CONFIG,
    PVP_RULES_VERSION,
    isPixelPvpMatch,
    clampPvpProgress,
    createSeededPvpBoardState,
    createDemoPvpBattle,
    isPvpRouteReason,
    resolvePvpBoardTimeline,
    resolvePvpOutcome,
} from '../assets/Scripts/Core/PvpModeConfig';
import { botMatchRating } from '../assets/Scripts/Core/PvpBotReplay';
import { HUMAN_REPLAY_PROTOCOL } from '../assets/Scripts/Core/PvpHumanReplay';

function equal(actual: unknown, expected: unknown, label: string): void {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
    }
}

equal(isPvpRouteReason('pvp-ranked'), true, 'ranked route');
equal(botMatchRating({ rating: 1200, gamesPlayed: 0 }), 950, 'novice bot protection');
equal(HUMAN_REPLAY_PROTOCOL, 'pch-events-v1', 'human replay protocol');
equal(isPvpRouteReason('main'), false, 'main route');
equal(clampPvpProgress(-1), 0, 'negative progress');
equal(clampPvpProgress(0.42), 0.42, 'normal progress');
equal(clampPvpProgress(2), 1, 'overflow progress');

equal(PVP_RANKED_MODE_CONFIG.propsEnabled, false, 'ranked props');
equal(PVP_RANKED_MODE_CONFIG.reviveEnabled, false, 'ranked revive');
equal(PVP_RANKED_MODE_CONFIG.adContinueEnabled, false, 'ranked ad continue');
equal(PVP_RANKED_MODE_CONFIG.speedControlEnabled, true, 'ranked speed');
equal(PVP_RANKED_MODE_CONFIG.temporarySlotsEnabled, false, 'ranked temporary slots');
equal(PVP_RANKED_MODE_CONFIG.reuseCurrentConveyor, true, 'ranked conveyor reuse');

equal(resolvePvpOutcome('PASS', 58000, 'PASS', 65000), 'win', 'faster pass');
equal(resolvePvpOutcome('PASS', 70000, 'PASS', 65000), 'lose', 'slower pass');
equal(resolvePvpOutcome('PASS', 65000, 'PASS', 65000), 'draw', 'same pass');
equal(resolvePvpOutcome('PASS', 70000, 'DEAD_TIMEOUT', 60000), 'win', 'pass beats death');
equal(resolvePvpOutcome('DEAD_CONVEYOR_FULL', 42000, 'PASS', 65000), 'lose', 'death loses to pass');
equal(resolvePvpOutcome('DEAD_TIMEOUT', 70000, 'DEAD_CONVEYOR_FULL', 42000), 'win', 'later death wins');
equal(resolvePvpOutcome('DEAD_TIMEOUT', 42000, 'DEAD_CONVEYOR_FULL', 42000), 'draw', 'same death');

const demo = createDemoPvpBattle(0, 1234);
equal(demo.levelId, 1, 'demo level normalization');
equal(demo.startedAtMs, 1234, 'demo start time');
equal(demo.opponent.opponentType, 'ranked', 'demo opponent type');
equal(demo.demo, true, 'demo marker');
equal(demo.levelPrefix, 'zt_level_', 'demo uses original pixel puzzle');
equal(isPixelPvpMatch(demo), true, 'current theme match');
equal(isPixelPvpMatch({ rulesVersion: 'pvp-ranked-v1' }), false, 'legacy match rejected');
equal(isPixelPvpMatch({ levelPrefix: 'level_', rulesVersion: PVP_RULES_VERSION }), false, 'mainline namespace rejected');

const replayCells = resolvePvpBoardTimeline([
    { elapsedMs: 1000, addedCells: [{ row: 1, col: 2, colorId: 3 }] },
    { elapsedMs: 2500, addedCells: [{ row: 2, col: 2, colorId: 4 }] },
], 2000);
equal(replayCells.length, 1, 'board timeline does not reveal future cells');
equal(replayCells[0].row, 1, 'board timeline keeps real cell coordinates');

const boardCells = [
    { row: 0, col: 0, colorId: 1 },
    { row: 0, col: 1, colorId: 2 },
    { row: 1, col: 0, colorId: 3 },
    { row: 1, col: 1, colorId: 4 },
];
const seededA = createSeededPvpBoardState(boardCells, 'fixed-seed', 0.5);
const seededB = createSeededPvpBoardState(boardCells, 'fixed-seed', 0.5);
equal(JSON.stringify(seededA), JSON.stringify(seededB), 'seeded opponent board is frozen');
equal(seededA.length, 2, 'seeded opponent board follows progress');


console.log('PVP_MODE_TESTS_PASSED');
