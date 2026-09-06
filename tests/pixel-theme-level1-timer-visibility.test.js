const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');
const source = read('assets/Scripts/Core/GameplayViewController.ts');

function extractMethod(signature) {
    const start = source.indexOf(`    ${signature}`);
    assert.ok(start >= 0, `missing method: ${signature}`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index++) {
        if (source[index] === '{') depth++;
        if (source[index] === '}') {
            depth--;
            if (depth === 0) return source.slice(start, index + 1).trim();
        }
    }
    throw new Error(`unterminated method: ${signature}`);
}

const buildTopBar = extractMethod('buildTopBar(root: Node)').replace('buildTopBar(root: Node)', 'buildTopBar(root)');
const buildLightweightTopBar = extractMethod('buildLightweightTopBar(root: Node)')
    .replace('buildLightweightTopBar(root: Node)', 'buildLightweightTopBar(root)');

class Label {}
class UITransform {}
class Widget {}

const Controller = new Function(
    'Label',
    'UITransform',
    'Widget',
    `return class TestGameplayViewController {
        constructor(runtime) { this.runtime = runtime; }
        requireSceneSpriteFrame() {}
        drawLevelTitleLabel() {}
        ${buildTopBar}
        ${buildLightweightTopBar}
    };`,
)(Label, UITransform, Widget);

function createScenario(entryMode, logicalLevelId, lightweight) {
    const timerLabel = { string: 'unchanged' };
    const timerNode = {
        getComponent(component) {
            return component === Label ? timerLabel : null;
        },
    };
    const timerWrap = {
        active: true,
        getComponent(component) {
            return component === UITransform || component === Widget ? {} : null;
        },
    };
    const runtime = {
        _activeGameplayEntryMode: entryMode,
        getActiveLogicalLevelId: () => logicalLevelId,
        shouldHideTopBar: () => false,
        shouldUseLightweightTopBar: () => lightweight,
        requireUiChild(_parent, name) {
            if (name === 'TimerWrap') return timerWrap;
            if (name === 'Timer') return timerNode;
            throw new Error(`unexpected UI child: ${name}`);
        },
        formatCurrentTimerText: () => '05:00',
        timerLabel: { stale: true },
    };
    const topBar = { active: false };
    new Controller(runtime).buildTopBar(topBar);
    return { runtime, timerLabel, timerWrap, topBar };
}

const themeLevelOne = JSON.parse(read('assets/LevelData/zt_level_1.json'));
assert.strictEqual(themeLevelOne.timeLimit, 300, 'pixel theme level 1 must retain its five-minute limit');

for (const lightweight of [false, true]) {
    const main = createScenario('main', 1, lightweight);
    assert.strictEqual(main.topBar.active, true, 'main level 1 must retain the top bar');
    assert.strictEqual(main.timerWrap.active, false, 'main level 1 must keep its unlimited-time timer hidden');
    assert.strictEqual(main.runtime.timerLabel, null, 'hidden main level 1 must not retain a timer label');

    const theme = createScenario('theme', 1, lightweight);
    assert.strictEqual(theme.topBar.active, true, 'pixel theme level 1 must retain the top bar');
    assert.strictEqual(theme.timerWrap.active, true, 'pixel theme level 1 must show its timer');
    assert.strictEqual(theme.timerLabel.string, '05:00', 'pixel theme level 1 must render its five-minute timer');
    assert.strictEqual(theme.runtime.timerLabel, theme.timerLabel, 'visible pixel theme timer must remain bound');
}

console.log('pixel-theme-level1-timer-visibility.test.js passed');
