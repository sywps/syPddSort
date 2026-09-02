const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');
const source = read('assets/Scripts/Core/PchConveyorGameplayController.ts');
const appSession = read('assets/Scripts/Core/AppSession.ts');
const sceneSource = read('assets/BootstrapBundle/Scenes/Game.scene');
const scene = JSON.parse(sceneSource);
const inactiveMeta = JSON.parse(read('assets/BootstrapBundle/GameUI/pch_speed_inactive.png.meta'));
const pngDimensions = (relPath) => {
    const bytes = fs.readFileSync(path.join(root, relPath));
    assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${relPath} must be a PNG`);
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};
const appSessionStorage = new Map();
const appSessionModule = { exports: {} };
vm.runInNewContext(
    ts.transpileModule(appSession, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    {
        module: appSessionModule,
        exports: appSessionModule.exports,
        require(request) {
            if (request === 'cc') {
                return {
                    sys: {
                        localStorage: {
                            getItem: (key) => appSessionStorage.has(key) ? appSessionStorage.get(key) : null,
                            setItem: (key, value) => appSessionStorage.set(key, value),
                        },
                    },
                };
            }
            throw new Error(`unexpected AppSession dependency: ${request}`);
        },
    },
);

const findNode = (name) => {
    const matches = scene
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry?.__type__ === 'cc.Node' && entry._name === name);
    assert.strictEqual(matches.length, 1, `Game.scene must contain exactly one ${name} node`);
    return matches[0];
};
const component = (node, type) => (node._components || [])
    .map((ref) => scene[ref.__id__])
    .find((entry) => entry?.__type__ === type);
const child = (node, name) => (node._children || [])
    .map((ref) => scene[ref.__id__])
    .find((entry) => entry?.__type__ === 'cc.Node' && entry._name === name);

const topBar = findNode('TopBarGroup');
const speed = findNode('PchSpeedButton');
const inactiveState = child(speed.entry, 'InactiveState');
const activeState = child(speed.entry, 'ActiveState');
const badgeNode = child(speed.entry, 'PchSpeedBadge');
const speedUi = component(speed.entry, 'cc.UITransform');
const speedWidget = component(speed.entry, 'cc.Widget');
const speedButton = component(speed.entry, 'cc.Button');
const inactiveSprite = component(inactiveState, 'cc.Sprite');
const activeSprite = component(activeState, 'cc.Sprite');
const badgeLabel = component(badgeNode, 'cc.Label');

assert.ok(
    !source.includes('this.manualSpeedMultiplier = 1;'),
    'starting the next level must not reset the selected speed',
);
assert.ok(
    appSession.includes('export type PchSpeedMultiplier = 1 | 2 | 3;')
        && appSession.includes('private _pchSpeedMultiplier: PchSpeedMultiplier = 1;')
        && appSession.includes("const PCH_SPEED_STORAGE_KEY = 'pdd.setting.pchSpeed';")
        && appSession.includes('this._pchSpeedMultiplier = readPersistedPchSpeedMultiplier();')
        && appSession.includes('get pchSpeedMultiplier(): PchSpeedMultiplier')
        && appSession.includes('setPchSpeedMultiplier(multiplier: number): void')
        && appSession.includes('sys.localStorage.setItem(PCH_SPEED_STORAGE_KEY, String(normalized));')
        && source.includes('private manualSpeedMultiplier: PchSpeedMultiplier = 1;')
        && source.includes('this.manualSpeedMultiplier = AppRoot.tryGet()?.session.pchSpeedMultiplier ?? 1;')
        && source.includes('AppRoot.tryGet()?.session.setPchSpeedMultiplier(multiplier);'),
    'the selected 1X/2X/3X speed must survive controller, scene, and app-session replacement',
);
const PCH_SPEED_STORAGE_KEY = 'pdd.setting.pchSpeed';
const AppSession = appSessionModule.exports.AppSession;
const session = new appSessionModule.exports.AppSession();
assert.strictEqual(session.pchSpeedMultiplier, 1, 'missing persisted speed must default to 1X');
session.setPchSpeedMultiplier(2);
assert.strictEqual(session.pchSpeedMultiplier, 2, 'AppSession must retain 2X across controller replacement');
assert.strictEqual(appSessionStorage.get(PCH_SPEED_STORAGE_KEY), '2', '2X must persist synchronously');
assert.strictEqual(new AppSession().pchSpeedMultiplier, 2, 'a new AppSession must restore persisted 2X');
session.setPchSpeedMultiplier(3);
assert.strictEqual(session.pchSpeedMultiplier, 3, 'AppSession must retain 3X across controller replacement');
assert.strictEqual(appSessionStorage.get(PCH_SPEED_STORAGE_KEY), '3', '3X must persist synchronously');
assert.strictEqual(new AppSession().pchSpeedMultiplier, 3, 'a new AppSession must restore persisted 3X');
session.setPchSpeedMultiplier(1);
assert.strictEqual(appSessionStorage.get(PCH_SPEED_STORAGE_KEY), '1', 'returning to 1X must persist synchronously');
assert.strictEqual(new AppSession().pchSpeedMultiplier, 1, 'a new AppSession must restore persisted 1X');
session.setPchSpeedMultiplier(99);
assert.strictEqual(session.pchSpeedMultiplier, 1, 'unsupported speed values must normalize to 1X');
assert.strictEqual(appSessionStorage.get(PCH_SPEED_STORAGE_KEY), '1', 'normalized setter values must persist as 1X');
appSessionStorage.set(PCH_SPEED_STORAGE_KEY, 'corrupted');
assert.strictEqual(new AppSession().pchSpeedMultiplier, 1, 'corrupted persisted speed must normalize to 1X');
assert.strictEqual(appSessionStorage.get(PCH_SPEED_STORAGE_KEY), '1', 'corrupted persisted speed must self-heal to 1X');

const effectiveSpeedStart = source.indexOf('    private getEffectiveBeltSpeedMultiplier(): PchSpeedMultiplier | 5 {');
const hasStoredBeansStart = source.indexOf('    hasStoredBeans(): boolean {', effectiveSpeedStart);
const effectiveSpeedSource = source.slice(effectiveSpeedStart, hasStoredBeansStart);
assert.ok(effectiveSpeedStart >= 0 && hasStoredBeansStart > effectiveSpeedStart);
assert.ok(effectiveSpeedSource.includes('return this.beforeWinSpeedActive ? 5 : this.manualSpeedMultiplier;'));
assert.doesNotMatch(
    effectiveSpeedSource,
    /setManualSpeedMultiplier|setPchSpeedMultiplier|localStorage/,
    'temporary automatic 5X must never overwrite the persisted manual speed',
);
assert.ok(
    topBar.entry._children.some((ref) => ref.__id__ === speed.index),
    'TopBarGroup must serialize PchSpeedButton as a direct child',
);
assert.deepStrictEqual(
    { active: speed.entry._active, x: speed.entry._lpos.x, y: speed.entry._lpos.y, scale: speed.entry._lscale.x },
    { active: true, x: -182.216, y: 601.571, scale: 1 },
    'the scene must own the speed root default visibility and final gameplay transform',
);
assert.deepStrictEqual(
    { width: speedUi?._contentSize.width, height: speedUi?._contentSize.height },
    { width: 85, height: 85 },
    'the scene must own the 85x85 speed touch area',
);
assert.ok(
    speedWidget && speedWidget._enabled === false && speedButton && speedButton._transition === 3 && speedButton._zoomScale === 0.92,
    'the speed root must serialize its Widget and scale-transition Button',
);
assert.ok(
    inactiveState?._active === true
        && activeState?._active === false
        && inactiveSprite?._spriteFrame?.__uuid__ === inactiveMeta.subMetas.f9941.uuid
        && activeSprite?._spriteFrame?.__uuid__ === inactiveMeta.subMetas.f9941.uuid,
    'both serialized speed states must use only pch_speed_inactive',
);
assert.deepStrictEqual(
    {
        text: badgeLabel?._string,
        bold: badgeLabel?._isBold,
        color: badgeLabel?._color && [badgeLabel._color.r, badgeLabel._color.g, badgeLabel._color.b, badgeLabel._color.a],
    },
    { text: 'X1', bold: true, color: [255, 255, 255, 255] },
    'the scene must serialize the bold white X1 badge default',
);
assert.ok(
    fs.existsSync(path.join(root, 'assets/BootstrapBundle/GameUI/pch_speed_inactive.png')),
    'the hierarchy-owned speed image must exist in BootstrapBundle',
);
assert.deepStrictEqual(
    pngDimensions('assets/BootstrapBundle/GameUI/pch_speed_inactive.png'),
    { width: 96, height: 96 },
    'the single speed image must retain its hierarchy-authored 96x96 canvas',
);
assert.ok(
    source.includes("const speedButton = parent.getChildByName('PchSpeedButton')")
        && source.includes("speedButton.getChildByName('InactiveState')")
        && source.includes("speedButton.getChildByName('ActiveState')")
        && source.includes("speedButton.getChildByName('PchSpeedBadge')")
        && source.includes('const active = this.manualSpeedMultiplier > 1;')
        && source.includes('this.speedBadgeLabel.string = `X${this.manualSpeedMultiplier}`;'),
    'runtime speed logic must bind the required hierarchy and only update state',
);
assert.ok(
    source.includes('this.manualSpeedMultiplier === 1')
        && source.includes('? 2')
        && source.includes('this.manualSpeedMultiplier === 2 ? 3 : 1')
        && source.includes('`${this.manualSpeedMultiplier} 倍速度已开启`'),
    'ordinary speed-button taps must cycle 1X to 2X to 3X to 1X with matching status copy',
);
assert.ok(
    source.includes('if (this.hasDirectButtonTarget(event)) return;')
        && source.includes('const rawPos = event?.getUILocation?.();')
        && source.includes('this.runtime.resolveBoardTapBlock(new Vec3(rawPos.x, rawPos.y, 0), false)')
        && source.includes('bounds.contains(rawPos)')
        && !source.includes('normalizeGameplayUiPosition')
        && !source.includes('handleScaledSettingsButtonTap')
        && !source.includes('handleScaledSpeedButtonTap'),
    'Cocos UI input must keep real Buttons authoritative and route the board through one UI coordinate',
);
assert.ok(
    source.includes("this.runtime._activeGameplayEntryMode === 'main'")
        && source.includes("Math.floor(Number(this.runtime.levelData?.levelId) || 0) === 1")
        && source.includes("const settingsButton = topBar.getChildByName('Settings')")
        && source.includes('settingsButton.active = !hideFirstLevelControls;')
        && source.includes('this.bindSpeedButton(topBar, !hideFirstLevelControls);')
        && source.includes('speedButton.active = visible;'),
    'mainline level 1 must hide Settings and PchSpeedButton while later levels restore them',
);
assert.ok(
    !source.includes("this.makeNode('PchSpeedButton'")
        && !source.includes('private buildSpeedButton(')
        && !source.includes('private drawSpeedButton(')
        && !source.includes("parent.getChildByName('PchSpeedButton')?.destroy()")
        && !source.includes('this.speedButton.children.forEach'),
    'runtime speed logic must not create, draw, rebuild, or destroy the scene-owned control',
);
assert.ok(
    !source.includes('本关两倍速可用')
        && !source.includes('本关可使用两倍速道具')
        && !source.includes('PchSpeedLevelHint')
        && !source.includes('PchSpeedButtonHint'),
    'the 2X speed control must not render availability text',
);

console.log('pch-speed-control.test.js passed');
