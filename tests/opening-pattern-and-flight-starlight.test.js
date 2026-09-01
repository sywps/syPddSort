const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const sha256 = (relativePath) => crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(root, relativePath)))
    .digest('hex');
const section = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing section start: ${startMarker}`);
    assert.ok(end > start, `missing section end: ${endMarker}`);
    return source.slice(start, end);
};

const helperSource = read('assets/Scripts/Core/OpeningPatternTransition.ts');
const helperOutput = ts.transpileModule(helperSource, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
}).outputText;
const helperSandbox = {
    exports: {},
    module: { exports: {} },
    require() {
        throw new Error('OpeningPatternTransition must remain dependency-free');
    },
};
helperSandbox.exports = helperSandbox.module.exports;
vm.runInNewContext(helperOutput, helperSandbox, { filename: 'OpeningPatternTransition.ts' });

const {
    buildOpeningPatternMoves,
    getOpeningPatternStaggerDelay,
} = helperSandbox.module.exports;

const correct = [
    [1, 1, 2],
    [2, 0, 1],
];
const shuffled = [
    [2, 1, 1],
    [1, 0, 2],
];
const beforeCorrect = JSON.stringify(correct);
const beforeShuffled = JSON.stringify(shuffled);
const moves = JSON.parse(JSON.stringify(buildOpeningPatternMoves(correct, shuffled)));
assert.deepStrictEqual(moves, [
    { colorId: 1, source: { row: 0, col: 0 }, target: { row: 0, col: 1 } },
    { colorId: 1, source: { row: 0, col: 1 }, target: { row: 0, col: 2 } },
    { colorId: 2, source: { row: 0, col: 2 }, target: { row: 0, col: 0 } },
    { colorId: 2, source: { row: 1, col: 0 }, target: { row: 1, col: 2 } },
    { colorId: 1, source: { row: 1, col: 2 }, target: { row: 1, col: 0 } },
]);
assert.strictEqual(JSON.stringify(correct), beforeCorrect, 'mapping must not mutate correctColors');
assert.strictEqual(JSON.stringify(shuffled), beforeShuffled, 'mapping must not mutate currentColors');
assert.strictEqual(new Set(moves.map((move) => `${move.target.row},${move.target.col}`)).size, moves.length);
for (const move of moves) {
    assert.strictEqual(shuffled[move.target.row][move.target.col], move.colorId, 'every visual bean must land on the same color');
}

assert.throws(
    () => buildOpeningPatternMoves([[1, 0]], [[0, 1]]),
    /playable-cell mask mismatch/,
    'hole-mask drift must fail visibly',
);
assert.throws(
    () => buildOpeningPatternMoves([[1, 1]], [[1, 2]]),
    /count mismatch/,
    'per-color count drift must fail visibly',
);
assert.strictEqual(getOpeningPatternStaggerDelay(0), 0);
assert.strictEqual(getOpeningPatternStaggerDelay(1), 0);
assert.strictEqual(getOpeningPatternStaggerDelay(3), 0.05, 'small groups retain the competitor 0.05-second cadence');
const largeDelay = getOpeningPatternStaggerDelay(100);
assert.ok(largeDelay <= 0.05);
assert.ok(Math.abs(largeDelay * 99 - 0.24) < 1e-9, 'large boards must keep the launch window bounded');

const pch = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const session = read('assets/Scripts/Core/GameplaySessionController.ts');
const pchStart = section(pch, '    start(): void {', '    playOpeningPatternShuffle(): void {');
assert.ok(pchStart.includes('this.inputLocked = true;'), 'input must be gated before PCH handlers become usable');
assert.ok(pchStart.includes('this.prepareOpeningPatternShuffle();'), 'completed-pattern visuals must be prepared before loading release');
assert.ok(pchStart.includes("typeof this.runtime.acquireFlyBeanNode !== 'function'"), 'PCH must fail fast when the shared FlyBean pool acquire contract is absent');
assert.ok(pchStart.includes("typeof this.runtime.recycleFlyBeanNode !== 'function'"), 'PCH must fail fast when the shared FlyBean pool recycle contract is absent');

const opening = section(pch, '    playOpeningPatternShuffle(): void {', '    stop(): void {');
const openingMotion = section(pch, '    playOpeningPatternShuffle(): void {', '    private prepareOpeningPatternShuffle(): void {');
assert.ok(opening.includes("this.openingPatternState = 'running';"));
assert.ok(opening.includes('generation !== this.openingPatternGeneration'));
assert.ok(opening.includes('this.restoreOpeningPatternVisuals(false, true);'));
assert.ok(opening.includes('this.inputLocked = false;'), 'only the guarded completion may release gameplay input');
assert.ok(opening.includes('this.runtime.renderBoard();'), 'completion must reveal the authoritative shuffled model');
assert.ok(!openingMotion.includes('angle:'), 'opening shuffle must not rotate beans');
assert.ok(!openingMotion.includes('getOpeningPatternSpin'), 'opening shuffle must not calculate a bean spin');
assert.ok(!pch.includes('private getOpeningPatternSpin('), 'unused opening-spin helper must be removed');
const openingComplete = section(pch, '    private completeOpeningPatternShuffle(', '    private cancelOpeningPatternShuffle(');
const guideIndex = openingComplete.indexOf('this.showOpeningFeatureGuide(');
const openingSkillSyncIndex = openingComplete.indexOf('this.runtime.syncSkillButtonRuntimeStates?.();');
assert.ok(guideIndex >= 0 && openingSkillSyncIndex > guideIndex, 'opening completion must refresh skill buttons after the final guide lock is known');
const openingGuideDismiss = section(pch, '    private dismissOpeningGuide(): void {', '    private clearOpeningGuideNodes(): void {');
assert.ok(openingGuideDismiss.includes('this.runtime.syncSkillButtonRuntimeStates?.();'), 'closing the opening guide must restore the final skill button state');

const inbound = section(pch, '    private animateBeanIntoConveyor(', '    private animateBeanReturn(');
const returning = section(pch, '    private animateBeanReturn(', '    private finishReturnAnimation(');
const skills = section(pch, '    private runConveyorSkill(', '    private resolveSkillSourceVisual(');
const flyCreate = section(pch, '    private createFlyBean(', '    private attachSphereFlyEffect(');
const flyDestroy = section(pch, '    private destroyFlyBean(', '    private getBoardCellWorldPosition(');
const flyEffectAttach = section(pch, '    private attachSphereFlyEffect(', '    private createSphereFlyEffectNode(');
const uiManifest = read('assets/Scripts/Core/UiManifest.ts');
const assetBootstrap = read('assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts');
const bootstrapPatch = read('scripts/patch-bootstrap-dynamic-assets.js');
assert.ok(inbound.includes('this.attachSphereFlyEffect(bean, sourceBeanSize, flightDelay);'), 'normal Board-to-Entry flights must attach the pooled package effect');
assert.ok(inbound.includes('const flightDelay = staggerIndex * PCH_ENTRY_STAGGER_SECONDS;'));
assert.ok(returning.includes('const flightDelay = staggerIndex * PCH_RETURN_STAGGER_SECONDS;'), 'automatic returns must honor the package return stagger');
assert.ok(returning.includes('this.attachSphereFlyEffect(bean, sourceBeanSize, flightDelay);'), 'conveyor exit-to-target flights must attach the same pooled package effect');
assert.ok(returning.includes('.delay(flightDelay)'), 'automatic return beans must apply their indexed launch delay');
assert.ok(!skills.includes('attachSphereFlyEffect'), 'skill flights must remain outside the proven competitor scope');
assert.ok(!pch.includes('PchInboundHalo'), 'the rejected local halo approximation must be removed');
assert.ok(!pch.includes('PchInboundSpark-'), 'the rejected code-drawn four-point stars must be removed');
assert.ok(!pch.includes('drawInboundSparkle'), 'Graphics-based sparkle drawing must be removed');
assert.ok(!pch.includes('attachBrightOverlay'), 'normal inbound flight must use the original package textures');
assert.ok(flyCreate.includes('this.runtime.acquireFlyBeanNode(name, size, spriteFrame)'), 'PCH FlyBean bodies must reuse the shared node pool');
assert.ok(flyCreate.includes("bean.getChildByName('BrightOverlay')"), 'PCH must locate the shared pool glow explicitly');
assert.ok(flyCreate.includes('brightOverlay.active = false;'), 'the shared local glow must stay hidden under the package Star/Trail effect');
assert.ok(!flyCreate.includes('this.makeNode('), 'PCH FlyBean bodies must not allocate a fresh node per flight');
assert.ok(!flyCreate.includes('bean.addComponent(Sprite)'), 'pooled FlyBeans must reuse their Sprite component');

assert.ok(pch.includes('private readonly sphereFlyEffectPool = new NodePool();'), 'the competitor effect wrapper must have a dedicated pool');
assert.ok(pch.includes('private readonly sphereFlyStarPool = new NodePool();'), 'distance-emitted stars must be recycled instead of recreated indefinitely');
assert.ok(pch.includes('this.sphereFlyEffectPool.get() ?? this.createSphereFlyEffectNode()'));
assert.ok(pch.includes('this.sphereFlyEffectPool.put(state.node);'));
assert.ok(pch.includes('this.sphereFlyStarPool.get() ?? this.createSphereFlyStarNode()'));
assert.ok(pch.includes('this.sphereFlyStarPool.put(star);'));
assert.ok(flyDestroy.indexOf('this.recycleSphereFlyEffect(bean);') < flyDestroy.indexOf('this.runtime.recycleFlyBeanNode(bean);'), 'arrival cleanup must recycle the package effect before returning the FlyBean body to the shared pool');
assert.ok(!flyDestroy.includes('bean.destroy();'), 'normal PCH cleanup must not destroy a reusable FlyBean body');
assert.ok(pch.includes('this.recycleAllSphereFlyEffects();'), 'controller stop must force-recycle any attached effects');
assert.ok(pch.includes('this.updateSphereFlyEffects(deltaTime);'), 'the existing gameplay update must drive distance emission and trail history');

assert.ok(pch.includes('const SPHERE_FLY_STAR_MIN_LIFETIME_SECONDS = 0.1;'));
assert.ok(pch.includes('const SPHERE_FLY_STAR_MAX_LIFETIME_SECONDS = 0.3;'));
assert.ok(pch.includes('const SPHERE_FLY_MAX_STARS_PER_EFFECT = 60;'));
assert.ok(pch.includes('const SPHERE_FLY_STAR_EMISSION_SPACING_RATIO = 0.25 / ORIGINAL_SPHERE_VISUAL_WIDTH;'), 'distance rate 4 must map to one star per 0.25 Unity unit');
assert.ok(pch.includes('const SPHERE_FLY_TRAIL_LIFETIME_SECONDS = 1;'));
assert.ok(pch.includes('const SPHERE_FLY_TRAIL_WIDTH_OVER_TRAIL = 0.8;'));
assert.ok(pch.includes('const SPHERE_FLY_TRAIL_ALPHA_MID_TIME = 26719 / 65535;'));
assert.ok(pch.includes('const SPHERE_FLY_TRAIL_ALPHA_MID_VALUE = 0.37266355752944946;'));
assert.ok(pch.includes('sprite.type = Sprite.Type.FILLED;'), 'Trail slices must preserve the package texture while applying its spatial alpha gradient');
assert.ok(pch.includes('sprite.fillType = Sprite.FillType.HORIZONTAL;'));
assert.ok(flyEffectAttach.indexOf('sprite.spriteFrame = trailSpriteFrame;') < flyEffectAttach.indexOf('sprite.type = Sprite.Type.FILLED;'), 'Trail frame must exist before FILLED UV calculation');
assert.ok(pch.includes('new Color(255, 238, 161, 255)'), 'trail tint must match the serialized warm-white start color');
assert.ok(pch.includes('state.trail.angle = Math.atan2(backwardY, backwardX) * 180 / Math.PI;'), 'trail texture must follow the real movement direction');

for (const textureName of ['pdpx_eff_Star_01', 'pdpx_eff_Trail_02']) {
    assert.ok(uiManifest.includes(`'${textureName}'`), `${textureName} must be a strict board-effect preload`);
    assert.ok(assetBootstrap.includes(`missing required SpriteFrame: ${textureName}`), `${textureName} must fail fast when absent`);
    assert.ok(bootstrapPatch.includes(`'GameUI/${textureName}'`), `${textureName} must remain in the bootstrap image allowlist`);
    assert.ok(fs.existsSync(path.join(root, `assets/BootstrapBundle/GameUI/${textureName}.png`)));
    assert.ok(fs.existsSync(path.join(root, `assets/BootstrapBundle/GameUI/${textureName}.png.meta`)));
}
assert.strictEqual(sha256('assets/BootstrapBundle/GameUI/pdpx_eff_Star_01.png'), '58f22153aba2cae44aaad0ea1c2b1f198f68fd1eef2c1e3b0d2e531e72253cd4');
assert.strictEqual(sha256('assets/BootstrapBundle/GameUI/pdpx_eff_Trail_02.png'), 'ec071f6c12d4f7fcc32ca161908c129bf78cd6a381618588ff09e4c24a407f26');

const hideIndex = session.indexOf('runtime.hideLoadingOverlayAfterGameplayReady?.();');
const playIndex = session.indexOf('pchController.playOpeningPatternShuffle();');
assert.ok(hideIndex >= 0 && playIndex > hideIndex, 'the opening motion must begin only after the loading cover is released');

console.log('opening-pattern-and-flight-starlight.test.js passed');
