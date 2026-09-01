const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

const settlement = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const colorFx = read('assets/Scripts/Core/GameCtrlModules/GameplayColorCompleteFxModule.ts');
const resultPanel = read('assets/Scripts/Core/GameplayResultPanelController.ts');
const state = read('assets/Scripts/Core/GameCtrlState.ts');
const session = read('assets/Scripts/Core/GameplaySessionController.ts');

assert.ok(
    settlement.includes("panel.getChildByName('SettlementTopHud')"),
    'win settlement must bind the static HUD owned by WinPanel',
);
assert.ok(
    !settlement.includes("this.syncTopHud(panel, 'winSettlement')"),
    'win settlement must not depend on the route-external TopHud prefab',
);
assert.ok(
    settlement.includes("throw new Error('[WinPanel] missing route-owned SettlementTopHud widgets')"),
    'missing settlement-owned widgets must fail explicitly',
);
assert.ok(
    state.includes("_settlementRevealState: 'idle'") && state.includes('_settlementRevealToken: 0'),
    'runtime state must own an explicit settlement reveal state and token',
);
assert.ok(
    session.includes("runtime._settlementRevealState = 'idle'")
        && session.includes('runtime._settlementRevealToken = (Number(runtime._settlementRevealToken) || 0) + 1'),
    'each gameplay session must invalidate stale settlement callbacks',
);
assert.ok(
    settlement.includes("this._settlementRevealState === 'shown'")
        && settlement.includes("this._settlementRevealState === 'revealing'")
        && settlement.includes("this._settlementRevealState === 'failed'"),
    'win reveal must reject duplicate or terminal callbacks',
);
assert.ok(
    settlement.includes("this._settlementRevealState = 'failed'")
        && settlement.includes("console.error('[settlement] failed to reveal win panel:'"),
    'terminal settlement failures must be recorded once instead of escaping the scheduler',
);
assert.ok(
    settlement.includes('this.requestWinSettlementReveal?.(logicalLevelId, revealToken);'),
    'the scheduled completion callback must enter the guarded reveal path',
);
assert.ok(
    !settlement.includes('PATTERN_COMPLETE_COLOR_HOLD')
        && settlement.includes('PATTERN_COMPLETE_SETTLEMENT_HOLD = 0.5'),
    'final colors must gate the next stage by b1 completion while the Shader keeps its fixed presentation hold',
);
assert.ok(
    colorFx.includes('flushPendingColorCompleteEffectsSequentially(onDone?: () => void, gapSeconds: number = 0.12): void')
        && colorFx.includes('const entries = Array.from(pending.entries());')
        && colorFx.includes('this.playColorCompleteEffect(colorId, true, () => {'),
    'global completion must play the actual queued colors serially, with one audio cue per color',
);
assert.match(
    settlement,
    /this\.flushPendingColorCompleteEffectsSequentially\(scheduleBoardCompleteShrink\);/,
    'board shrink must wait for the final queued b1 sequence to finish',
);
assert.match(
    settlement,
    /this\.playPatternCompleteMatchFx\(showSettlement\);/,
    'win settlement must wait for the complete Shader sweep before scheduling panel reveal',
);
assert.ok(
    !settlement.includes('this.playPatternCompleteMatchFx();'),
    'win settlement must not schedule the panel while the Shader sweep is still playing',
);
assert.match(
    resultPanel,
    /this\.bindPanelButton\(adBonusBtn, \(\) => \{\s*AudioMgr\.inst\.play\('button'\);\s*runtime\.claimWinAdBonusReward\(\);/,
    'win 5x reward must remain bound to its real Cocos Button',
);
assert.match(
    resultPanel,
    /createReviveSettlementPanel\(\)[\s\S]*?for \(const node of giveUpNodes\) \{\s*this\.bindPanelButton\(node,/,
    'timeout revive close actions must remain bound to their real Cocos Buttons',
);
assert.match(
    resultPanel,
    /createBufferFullSettlementPanel\(\)[\s\S]*?for \(const node of giveUpNodes\) \{\s*this\.bindPanelButton\(node,/,
    'buffer-full close actions must remain bound to their real Cocos Buttons',
);
assert.match(
    resultPanel,
    /this\.bindPanelButton\(primaryBtn, runPrimaryAction\);/,
    'win primary action must remain bound to its real Cocos Button',
);
assert.match(
    resultPanel,
    /this\.bindPanelButton\(homeBtn,[\s\S]*?this\.bindPanelButton\(replayBtn,/,
    'final lose home and replay actions must remain bound to their real Cocos Buttons',
);
assert.ok(
    settlement.includes('this.bindResultPanelButton(settingsBtn, () => {'),
    'win settlement settings must remain bound to its real Cocos Button',
);
assert.strictEqual(
    (resultPanel.match(/runtime\.bindPanelButton\(/g) || []).length,
    1,
    'all result-panel actions must route through the shared direct Button binder',
);

console.log('win-settlement-readiness.test.js passed');
