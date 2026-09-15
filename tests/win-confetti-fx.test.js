const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/GameplayResultPanelController.ts'),
    'utf8',
);

const componentStart = source.indexOf("@ccclass('WinConfettiFx')");
const componentEnd = source.indexOf('export class GameplayResultPanelController', componentStart);
const clearStart = source.indexOf('private clearWinConfettiFx(panel: Node): void');
const methodStart = source.indexOf('private loadWinConfettiFrames(');
const methodEnd = source.indexOf('playWinSettlementBannerFx(panel?: Node | null): void', methodStart);
assert.ok(
    componentStart >= 0 && componentEnd > componentStart && clearStart >= 0 && methodStart > clearStart && methodEnd > methodStart,
    'win confetti component and loading entry must remain identifiable',
);
const component = source.slice(componentStart, componentEnd);
const clearMethod = source.slice(clearStart, methodStart);
const method = source.slice(methodStart, methodEnd);

assert.ok(
    source.includes("const WIN_CONFETTI_ATLAS_PATH = 'UI/Images/win_confetti_atlas';")
        && source.includes('const WIN_CONFETTI_PIECE_COUNT = 48;')
        && source.includes('const WIN_CONFETTI_BURST_COUNT = 32;')
        && source.includes('const WIN_CONFETTI_EMISSION_SECONDS = 0.35;')
        && source.includes('const WIN_CONFETTI_RAIN_START_SECONDS = 1.05;')
        && source.includes('const WIN_CONFETTI_RAIN_INTERVAL_MIN = 0.22;')
        && source.includes('const WIN_CONFETTI_RAIN_INTERVAL_RANGE = 0.12;')
        && source.includes('const WIN_CONFETTI_HORIZONTAL_COVERAGE = 0.9;')
        && source.includes('const WIN_CONFETTI_LANE_COUNT = 12;'),
    'confetti must use the shared atlas, a 32-piece opening burst, and a bounded 48-piece continuous pool',
);
assert.ok(
    source.includes('const shapeSlot = index % 6;')
        && source.includes('shapeSlot < 3 ? 0 : shapeSlot < 5 ? 1 : 2')
        && source.includes('minWidth: 22')
        && source.includes('minHeight: 54')
        && source.includes('minHeight: 78'),
    'confetti must retain distinct background, middle, and foreground shapes at readable sizes',
);
assert.ok(
    component.includes('const side = index % 2 === 0 ? -1 : 1;')
        && component.includes('const x = side * (width * 0.43 + sample(5) * 20);')
        && component.includes('const y = -height * (0.31 - sample(6) * 0.07);')
        && component.includes('const targetX = this.getStratifiedX(index, 22);')
        && component.includes('const lane = (sequence * 5) % WIN_CONFETTI_LANE_COUNT;')
        && component.includes("complete: index >= WIN_CONFETTI_BURST_COUNT"),
    'opening confetti must launch from both lower sides toward stratified targets across the top',
);
assert.ok(
    component.includes('const apexY = height * (0.40 + sample(20) * 0.07);')
        && component.includes('Math.sqrt(2 * launchGravity * (apexY - y))')
        && component.includes("particle.phase = 'fall';")
        && component.includes('particle.y = particle.apexY;')
        && component.includes('-particle.maxFallSpeed')
        && component.includes('Math.pow(particle.decay, dt * 60)')
        && !component.includes('Math.pow(0.994, dt * 60)')
        && component.includes('particle.drift')
        && component.includes('Math.sin(particle.wobble) * particle.sway')
        && component.includes('Math.abs(Math.cos(particle.tilt))'),
    'each piece must reach a controlled top apex before switching to limited-speed drift, wobble, and tilt',
);
const sample = (index, channel) => {
    const raw = Math.sin((index + 1) * 12.9898 + channel * 78.233) * 43758.5453;
    return raw - Math.floor(raw);
};
const coverage = 0.9;
const laneCount = 12;
const stratifiedX = (sequence, channel, width) => {
    const span = width * coverage;
    const laneWidth = span / laneCount;
    const lane = (sequence * 5) % laneCount;
    const jitter = (sample(sequence, channel) - 0.5) * laneWidth * 0.55;
    return -span * 0.5 + (lane + 0.5) * laneWidth + jitter;
};
const burstLaneCounts = Array(laneCount).fill(0);
const burstTargets = [];
for (let index = 0; index < 32; index += 1) {
    const height = 1280;
    const width = 720;
    const startY = -height * (0.31 - sample(index, 6) * 0.07);
    const apexY = height * (0.40 + sample(index, 20) * 0.07);
    const launchGravity = 2100 + sample(index, 21) * 260;
    const launchTime = Math.sqrt(2 * (apexY - startY) / launchGravity);
    const launchVelocityY = Math.sqrt(2 * launchGravity * (apexY - startY));
    const lane = (index * 5) % laneCount;
    burstLaneCounts[lane] += 1;
    burstTargets.push(stratifiedX(index, 22, width));
    assert.ok(apexY >= 512 && apexY <= 602, `piece ${index} apex must stay near the visible top`);
    assert.ok(launchTime >= 0.8 && launchTime <= 1.02, `piece ${index} must reach the top with a clear short launch`);
    assert.ok(launchVelocityY >= 1800, `piece ${index} must have a visibly strong upward impulse`);
}
assert.ok(Math.min(...burstTargets) < -285 && Math.max(...burstTargets) > 285, 'opening targets must span at least 80% of the 720px screen');
assert.ok(burstLaneCounts.every((count) => count >= 2 && count <= 3), 'opening targets must be balanced across all 12 horizontal lanes');

const rainLaneCounts = Array(laneCount).fill(0);
for (let sequence = 0; sequence < 24; sequence += 1) {
    rainLaneCounts[(sequence * 5) % laneCount] += 1;
    const x = stratifiedX(sequence, 31, 720);
    assert.ok(x >= -324 && x <= 324, `rain piece ${sequence} must stay inside the approved 90% width`);
}
assert.deepStrictEqual(rainLaneCounts, Array(laneCount).fill(2), 'continuous rain must rotate evenly through every horizontal lane');
assert.ok(
    component.includes('this.elapsed >= this.nextRainAt')
        && component.includes('this.particles.find((particle) => particle.complete)')
        && component.includes('this.configureRainParticle(available, this.rainSequence)')
        && component.includes('particle.y = this.viewportHeight * (0.515 + sample(32) * 0.035);')
        && component.includes('particle.life = 6.2 + sample(30) * 1.2;')
        && component.includes('particle.maxFallSpeed = 205 + sample(37) * 40;')
        && component.includes('particle.phase = \'fall\';')
        && component.includes('particle.y < -this.viewportHeight * 0.56')
        && component.includes('particle.life - particle.age')
        && component.includes('particle.node.active = false;')
        && !component.includes('this.node.destroy();'),
    'the effect must continuously reuse off-screen pieces from the full-width top until its panel destroys the layer',
);
assert.ok(
    source.includes('this.playWinConfettiFx(targetPanel!);'),
    'the visible win settlement animation entry must trigger confetti',
);
assert.ok(
    method.includes("const topHud = panel.getChildByName('SettlementTopHud');")
        && method.includes('layer.setSiblingIndex(topHud.getSiblingIndex());'),
    'confetti must render below the settlement top HUD',
);
assert.ok(
    method.includes('bundle.load(candidates[index], SpriteFrame')
        && method.includes('layer.addComponent(WinConfettiFx).play(frames'),
    'confetti must load one atlas and hand it to the update-driven component',
);
assert.ok(
    clearMethod.includes('layer.removeFromParent();')
        && clearMethod.includes('layer.destroy();'),
    'replaying or closing the settlement must retain an explicit confetti cleanup path',
);
assert.ok(!component.includes('tween(') && !component.includes('addComponent(Graphics)'), 'confetti must not regress to Graphics or fixed Tween paths');
assert.ok(!component.includes('repeatForever'), 'continuous confetti must use the bounded update pool rather than endless tweens');
assert.ok(!method.includes('BlockInputEvents') && !method.includes('addComponent(Button)'), 'confetti must not intercept settlement input');

const atlasPath = path.join(root, 'assets/GameAssetsBundle/UI/Images/win_confetti_atlas.png');
const atlasMetaPath = `${atlasPath}.meta`;
assert.ok(fs.existsSync(atlasPath) && fs.existsSync(atlasMetaPath), 'the original shared confetti atlas and Cocos meta must exist');
const atlas = PNG.sync.read(fs.readFileSync(atlasPath));
assert.deepStrictEqual([atlas.width, atlas.height], [128, 128], 'confetti atlas must stay at the approved 128x128 size');
let opaquePixels = 0;
for (let offset = 3; offset < atlas.data.length; offset += 4) {
    if (atlas.data[offset] > 0) opaquePixels += 1;
}
assert.ok(opaquePixels > 1000 && opaquePixels < 12000, 'atlas must contain isolated shapes on a mostly transparent background');
const atlasMeta = JSON.parse(fs.readFileSync(atlasMetaPath, 'utf8'));
assert.strictEqual(atlasMeta.userData.hasAlpha, true, 'atlas must preserve transparency');
assert.strictEqual(atlasMeta.subMetas.f9941.userData.trimType, 'none', 'atlas frame must retain stable sub-frame coordinates');

console.log('win-confetti-fx.test.js passed');
