import {
    PVP_RANKED_MODE_CONFIG,
    PVP_RULES_VERSION,
    isPixelPvpMatch,
    clampPvpProgress,
    createSeededPvpBoardState,
    reconcilePvpBoardProgress,
    createDemoPvpBattle,
    isPvpRouteReason,
    resolvePvpBoardTimeline,
    resolvePvpBoardFallbackSeed,
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
const reconciledEmptyBot = reconcilePvpBoardProgress(boardCells, [], 'fixed-seed', 0.5);
equal(reconciledEmptyBot.length, 2, 'bot board remains visible when its recorded cells lag behind progress');
const reconciledPartialBot = reconcilePvpBoardProgress(boardCells, [{ row: 1, col: 1, colorId: 99 }], 'fixed-seed', 0.75);
equal(reconciledPartialBot.length, 3, 'bot board supplements a partial recorded state up to its visible progress');
equal(reconciledPartialBot.some((cell) => cell.row === 1 && cell.col === 1 && cell.colorId === 4), true, 'bot board keeps valid recorded coordinates and canonical board colors');
const reconciledInvalidBot = reconcilePvpBoardProgress(boardCells, [{ row: 9, col: 9, colorId: 1 }], 'fixed-seed', 0.25);
equal(reconciledInvalidBot.length, 1, 'invalid recorded coordinates cannot leave a progressed bot thumbnail gray');
equal(resolvePvpBoardFallbackSeed({ opponentBoardSeed: '', opponentReplayId: '', matchId: 'match-fallback' }), 'match-fallback', 'old cloud matches use stable match fallback seed');
equal(resolvePvpBoardFallbackSeed({ opponentBoardSeed: 'board-seed', opponentReplayId: 'replay', matchId: 'match' }), 'board-seed', 'server board seed has priority');


console.log('PVP_MODE_TESTS_PASSED');
