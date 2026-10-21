'use strict';

function chooseAction(state, scenario, rng, lastTarget) {
    const button = (names, pathPart = '') => state.buttons?.find(b => names.includes(b.name) && b.path.includes(pathPart));
    const click = (target, reason) => target ? { type: 'click', ...target.point, target: target.path, reason }
        : { type: 'wait', reason: reason + ': target unavailable' };
    if (state.phase === 'home') return click(button(['StartBtn']), 'start-game');
    if (state.phase === 'win') return click(button(['PrimaryBtn'], state.panels?.length ? '' : 'Win'), 'next-level');
    if (state.phase === 'revive' || state.phase === 'lose') {
        return click(button(['ContinueBtn']), 'revive');
    }
    if (state.phase === 'guide') {
        if (state.guideTarget) return { type: 'click', ...state.guideTarget, target: state.guide, reason: 'guide-target' };
        const guideButton = state.buttons?.find(b => /Guide/.test(b.path));
        return click(guideButton, 'guide-button');
    }
    if (state.phase !== 'playing' || state.expectedWait || state.inputLocked || state.externalInputBlocked) {
        return { type: 'wait', reason: state.expectedWait || state.phase };
    }
    const available = state.cells.filter(c => c.point && c.current > 0 && !c.locked);
    if (!available.length) return { type: 'wait', reason: 'await-return-or-settlement' };
    // A normal player gives the conveyor time to return beans; the revive scenario deliberately fills it.
    if (scenario === 'core' && state.bufferCount > 0 && state.entryCount > 0) {
        return { type: 'wait', reason: 'await-conveyor' };
    }
    const different = available.filter(c => `${c.row},${c.col}` !== lastTarget);
    let candidates = different.length ? different : available;
    if (scenario === 'revive') {
        // Fill with colors whose correct destinations remain occupied, without modifying game state.
        const empty = new Set(state.cells.filter(c => !c.locked && c.current === 0).map(c => c.target));
        const blocked = candidates.filter(c => !empty.has(c.current) && !(state.transportColors?.[c.target] > 0));
        if (blocked.length) candidates = blocked;
        if (state.bufferCount >= state.bufferCapacity) return { type: 'wait', reason: 'await-full-buffer-judgment' };
    }
    const cell = candidates[Math.floor(rng() * candidates.length)];
    return { type: 'click', ...cell.point, target: `${cell.row},${cell.col}`, reason: 'board-cell',
        row: cell.row, col: cell.col, color: cell.current };
}

function invariantFailures(state) {
    if (!state.cells) return [];
    const errors = [];
    if (!Number.isInteger(state.bufferCount) || state.bufferCount < 0 || state.bufferCount > state.bufferCapacity) {
        errors.push('buffer-out-of-range');
    }
    if (state.cells.some(c => c.locked && (c.current <= 0 || c.current !== c.target))) errors.push('invalid-locked-cell');
    const ids = new Set([...Object.keys(state.colors), ...Object.keys(state.targetColors)]);
    if ([...ids].some(id => (state.colors[id] || 0) !== (state.targetColors[id] || 0))) errors.push('bean-color-conservation');
    if (state.phase === 'win' && state.cells.some(c => !c.locked)) errors.push('premature-victory');
    if (state.carrierSizes.some((size, i) => size < 0 || size > state.carrierCapacities[i])) errors.push('carrier-stack-out-of-range');
    return errors;
}

function createCoverage(scenario) {
    return { scenario, initialLevel: null, initialRound: null, milestones: {},
        required: scenario === 'core' ? ['gameplayReady', 'validBoardAction', 'victory', 'nextLevelReady']
            : ['gameplayReady', 'validBoardAction', 'revivePanel', 'reviveClicked', 'resumedAfterRevive', 'actionAfterRevive'] };
}

function updateCoverage(coverage, state, action) {
    const m = coverage.milestones;
    const mark = key => { if (!m[key]) m[key] = state.observedAt; };
    if (state.cells && coverage.initialLevel === null) {
        coverage.initialLevel = state.level;
        coverage.initialRound = state.round;
    }
    if (['playing', 'guide'].includes(state.phase)) mark('gameplayReady');
    if (state.validActions > 0) mark('validBoardAction');
    if (state.phase === 'win') mark('victory');
    if (m.victory && state.level !== coverage.initialLevel && ['playing', 'guide'].includes(state.phase)) mark('nextLevelReady');
    if (state.phase === 'revive' || state.phase === 'lose') mark('revivePanel');
    if (action?.reason === 'revive' && action.type === 'click') {
        mark('reviveClicked');
        coverage.actionsBeforeRevive = state.validActions;
    }
    if (m.reviveClicked && state.level === coverage.initialLevel && state.round === coverage.initialRound
        && state.phase === 'playing') {
        mark('resumedAfterRevive');
        if (state.validActions > coverage.actionsBeforeRevive) mark('actionAfterRevive');
    }
    coverage.missing = coverage.required.filter(key => !m[key]);
    return !coverage.missing.length;
}

module.exports = { chooseAction, invariantFailures, createCoverage, updateCoverage };
