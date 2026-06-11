#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const scriptsRoot = path.join(projectDir, 'assets', 'Scripts');

// Phase 1 freeze list: these files already contain legacy runtime-built stable UI
// and must shrink over time. New files must not introduce the same ownership drift.
// Extracted panel controllers below are transitional moves of existing legacy
// runtime-built UI logic; they are frozen and must also shrink over time.
const LEGACY_RUNTIME_UI_FILES = new Set([
    'assets/Scripts/Core/GameCtrlModules/PlayerMetaStateModule.ts',
    'assets/Scripts/Core/GameCtrlModules/FirstLevelRouteModule.ts',
    'assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts',
    'assets/Scripts/Core/GameCtrlModules/HomeCommerceModule.ts',
    'assets/Scripts/Core/GameCtrlModules/SceneHomeEntryModule.ts',
    'assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts',
    'assets/Scripts/Core/GameCtrlModules/GuideLeaderboardModule.ts',
    'assets/Scripts/Core/GameCtrlModules/FriendRankModule.ts',
    'assets/Scripts/Core/GameCtrlModules/CollectionAvatarModule.ts',
    'assets/Scripts/Core/GameCtrlModules/ThemePanelFlowModule.ts',
    'assets/Scripts/Core/GameCtrlModules/ThemeLoadingOverlayModule.ts',
    'assets/Scripts/Core/GameCtrlModules/TutorialGuideModule.ts',
    'assets/Scripts/Core/GameplaySkillUiController.ts',
    'assets/Scripts/Core/GameplaySlotUiController.ts',
    'assets/Scripts/Core/Panels/CommercePanelController.ts',
    'assets/Scripts/Core/GameplayResultPanelController.ts',
    'assets/Scripts/Core/Panels/LeaderboardPanelController.ts',
    'assets/Scripts/Core/Panels/SettingsPanelController.ts',
    'assets/Scripts/Core/Panels/ThemePanelController.ts',
]);

// Dynamic gameplay and FX nodes are code-owned by v1. They are still reported so
// audits can distinguish them from stable panel/scene UI ownership drift.
const CODE_OWNED_DYNAMIC_UI_FILES = new Set([
    'assets/Scripts/Core/AppRoot.ts',
    'assets/Scripts/Core/GameCtrlState.ts',
    'assets/Scripts/Core/GameSceneRuntimeController.ts',
    'assets/Scripts/Core/GameplayViewController.ts',
    'assets/Scripts/Core/GameCtrlModules/AssetBootstrapModule.ts',
    'assets/Scripts/Core/GameCtrlModules/BoardInputViewportModule.ts',
    'assets/Scripts/Core/GameCtrlModules/EndgameHintModule.ts',
    'assets/Scripts/Core/GameCtrlModules/GameplayPlacementFxModule.ts',
    'assets/Scripts/Core/GameCtrlModules/GameplaySkillWandModule.ts',
]);

const OWNERSHIP_RISK_PATTERNS = [
    { name: 'getOrCreateCanvasUiRoot', regex: /\bgetOrCreateCanvasUiRoot\s*\(/g },
    { name: 'getOrCreateUiChild', regex: /\bgetOrCreateUiChild\s*\(/g },
    { name: 'ensureSpriteNode', regex: /\bensureSpriteNode\s*\(/g },
    { name: 'ensureLabelNode', regex: /\bensureLabelNode\s*\(/g },
    { name: 'drawRoundRect', regex: /\bdrawRoundRect\s*\(/g },
    { name: 'drawFilledRect', regex: /\bdrawFilledRect\s*\(/g },
    { name: 'paintRoundRect', regex: /\bpaintRoundRect\s*\(/g },
    { name: 'addImage', regex: /\baddImage\s*\(/g },
    { name: 'addLabel', regex: /\baddLabel\s*\(/g },
    { name: 'forceSize', regex: /forceSize:\s*true/g },
    { name: 'forcePosition', regex: /forcePosition:\s*true/g },
    { name: 'new Node', regex: /\bnew\s+Node\s*\(/g },
    { name: 'Graphics', regex: /\.addComponent\s*\(\s*Graphics\s*\)/g },
    { name: 'setContentSize', regex: /\.setContentSize\s*\(/g },
    { name: 'Label.fontSize', regex: /\.fontSize\s*=/g },
    { name: 'Label.lineHeight', regex: /\.lineHeight\s*=/g },
    { name: 'node.color', regex: /\.color\s*=/g },
];

function rel(filePath) {
    return path.relative(projectDir, filePath).split(path.sep).join('/');
}

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, out);
        } else if (entry.isFile() && fullPath.endsWith('.ts')) {
            out.push(fullPath);
        }
    }
    return out;
}

function collectMatches(source, regex) {
    const matches = [];
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
            matches.push(i + 1);
        }
        regex.lastIndex = 0;
    }
    return matches;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function findSceneNodeByPath(sceneJson, rootName, childPath) {
    const rootIndex = sceneJson.findIndex((entry) => entry && entry.__type__ === 'cc.Node' && entry._name === rootName);
    if (rootIndex < 0) return null;
    let current = sceneJson[rootIndex];
    if (!childPath) return current;
    for (const segment of childPath.split('/')) {
        const childRef = (current._children || []).find((ref) => sceneJson[ref.__id__]?._name === segment);
        if (!childRef) return null;
        current = sceneJson[childRef.__id__];
    }
    return current;
}

function getNodeComponent(sceneJson, node, componentType) {
    const componentRef = (node?._components || []).find((ref) => sceneJson[ref.__id__]?.__type__ === componentType);
    return componentRef ? sceneJson[componentRef.__id__] : null;
}

function getDirectChildNames(sceneJson, node) {
    return (node?._children || []).map((ref) => sceneJson[ref.__id__]?._name || '');
}

function assertSpriteFrame(failures, sceneJson, rootName, childPath, expectedUuid) {
    const node = findSceneNodeByPath(sceneJson, rootName, childPath);
    if (!node) {
        failures.push(`Game.scene missing node ${rootName}/${childPath}`);
        return;
    }
    const sprite = getNodeComponent(sceneJson, node, 'cc.Sprite');
    if (!sprite) {
        failures.push(`Game.scene ${rootName}/${childPath} must keep a Sprite component`);
        return;
    }
    if (sprite._spriteFrame?.__uuid__ !== expectedUuid) {
        failures.push(`Game.scene ${rootName}/${childPath} must keep static SpriteFrame ${expectedUuid}`);
    }
}

function assertGameSceneStaticUiOwnership(failures) {
    const scenePath = path.join(projectDir, 'assets', 'Scenes', 'Game.scene');
    const sceneText = fs.readFileSync(scenePath, 'utf8');
    const sceneJson = JSON.parse(sceneText);
    const canvas = findSceneNodeByPath(sceneJson, 'Canvas', '');
    const screenRoot = findSceneNodeByPath(sceneJson, 'Canvas', 'ScreenRoot');
    const gameplayRoot = findSceneNodeByPath(sceneJson, 'ScreenRoot', 'GameplayRoot');
    const gameplayFixedRoot = findSceneNodeByPath(sceneJson, 'GameplayRoot', 'GameplayFixedRoot');
    const gameplayRuntimeRoot = findSceneNodeByPath(sceneJson, 'GameplayRoot', 'GameplayRuntimeRoot');
    const topBarGroup = findSceneNodeByPath(sceneJson, 'GameplayFixedRoot', 'TopBarGroup');
    const bottomHudGroup = findSceneNodeByPath(sceneJson, 'GameplayFixedRoot', 'BottomHudGroup');
    const boardArea = findSceneNodeByPath(sceneJson, 'GameplayFixedRoot', 'BoardArea');
    const slotArea = findSceneNodeByPath(sceneJson, 'GameplayFixedRoot', 'BottomHudGroup/SlotAreaGroup/SlotArea');
    if (!canvas || !screenRoot || !gameplayRoot || !gameplayFixedRoot || !gameplayRuntimeRoot || !topBarGroup || !bottomHudGroup || !boardArea || !slotArea) {
        failures.push('Game.scene must keep ScreenRoot/GameplayRoot/GameplayFixedRoot/GameplayRuntimeRoot and stable HUD scene-owned nodes');
        return;
    }
    if (getDirectChildNames(sceneJson, canvas).join('/') !== 'Camera/Game/ScreenRoot') {
        failures.push('Game.scene Canvas must only directly host Camera, Game, and ScreenRoot');
    }
    if (getDirectChildNames(sceneJson, screenRoot).join('/') !== 'GameplayRoot/PopupRoot/OverlayRoot/FxRoot/BootRoot') {
        failures.push('Game.scene ScreenRoot must directly host GameplayRoot, PopupRoot, OverlayRoot, FxRoot, and BootRoot');
    }
    if (getDirectChildNames(sceneJson, gameplayRoot).join('/') !== 'GameplayFixedRoot/GameplayRuntimeRoot') {
        failures.push('Game.scene GameplayRoot must directly host GameplayFixedRoot and GameplayRuntimeRoot');
    }

    if (getNodeComponent(sceneJson, gameplayFixedRoot, 'cc.SafeArea')) {
        failures.push('GameplayFixedRoot must not own SafeArea; top and bottom HUD groups own their own SafeArea components');
    }
    for (const [label, node] of [['TopBarGroup', topBarGroup], ['BottomHudGroup', bottomHudGroup]]) {
        const safeArea = getNodeComponent(sceneJson, node, 'cc.SafeArea');
        if (!safeArea || safeArea._enabled !== true) {
            failures.push(`${label} must keep an enabled SafeArea component`);
        } else if (safeArea.node?.__id__ !== sceneJson.indexOf(node)) {
            failures.push(`${label} SafeArea component must point back to ${label}`);
        }
    }
    if (getNodeComponent(sceneJson, boardArea, 'cc.Widget') || sceneText.includes('BoardArea_widget_static_viewport_20260608')) {
        failures.push('BoardArea must not own a static Widget viewport; board safe rect is computed at runtime from top/bottom HUD bounds');
    }
    const slotWidget = getNodeComponent(sceneJson, slotArea, 'cc.Widget');
    if (!slotWidget || slotWidget._bottom !== 110) {
        failures.push('SlotArea must keep the expanded-board scene bottom anchor 110');
    }
    if (slotArea._lpos?.y !== -448.5) {
        failures.push('SlotArea must keep the expanded-board scene y baseline -448.5');
    }

    for (const [pathInScene, expectedUuid] of [
        ['TopBarGroup/TimerWrap', '5683ea7b-fe35-4af6-9ec4-7dd5404f28f4@f9941'],
        ['BottomHudGroup/SlotAreaGroup/SlotArea/SlotRowLockedBtn', 'f695951c-15e0-425c-a013-409f05fc40a8@f9941'],
        ['BottomHudGroup/SkillArea/SkillWand', '0c10f393-7b94-4d57-a033-435838eb6272@f9941'],
        ['BottomHudGroup/SkillArea/SkillBrush', '0c10f393-7b94-4d57-a033-435838eb6272@f9941'],
        ['BottomHudGroup/SkillArea/SkillMagnet', '0c10f393-7b94-4d57-a033-435838eb6272@f9941'],
        ['BottomHudGroup/SkillArea/SkillWand/ToolIcon', 'fe3b21fb-5bb1-4134-86c7-f04c12f51e4e@f9941'],
        ['BottomHudGroup/SkillArea/SkillBrush/ToolIcon', 'c4c67346-098c-476e-8cb0-1e41de104528@f9941'],
        ['BottomHudGroup/SkillArea/SkillMagnet/ToolIcon', '500dcf3a-feba-4274-91dc-ff3f696bab43@f9941'],
    ]) {
        assertSpriteFrame(failures, sceneJson, 'GameplayFixedRoot', pathInScene, expectedUuid);
    }

    const boardViewportModule = fs.readFileSync(path.join(projectDir, 'assets', 'Scripts', 'Core', 'GameCtrlModules', 'BoardInputViewportModule.ts'), 'utf8');
    if (boardViewportModule.includes("getGameplayFixedGroup?.('BoardArea')")) {
        failures.push('BoardInputViewportModule must not use BoardArea bounds as the board safe viewport');
    }
}

function assertCollectionPanelPrefabContract(failures) {
    const prefabJson = readJson(path.join(projectDir, 'assets', 'GameAssetsBundle', 'UI', 'Prefabs', 'Panels', 'CollectionPanel.prefab'));
    const root = prefabJson[1];
    for (const name of ['ArrowLeft', 'ArrowRight']) {
        const childRef = (root?._children || []).find((ref) => prefabJson[ref.__id__]?._name === name);
        if (childRef) {
            failures.push(`CollectionPanel.prefab must not keep obsolete ${name}`);
        }
    }
}

function describeFileHit(relativePath, patternHits) {
    return Object.entries(patternHits)
        .map(([name, lines]) => `${name}@${lines.slice(0, 3).join(',')}${lines.length > 3 ? '…' : ''}`)
        .join(' | ');
}

function main() {
    const sourceOwnershipFailures = [];
    assertGameSceneStaticUiOwnership(sourceOwnershipFailures);
    assertCollectionPanelPrefabContract(sourceOwnershipFailures);
    if (sourceOwnershipFailures.length > 0) {
        console.error('[verify-ui-ownership] failed: Cocos scene/prefab ownership drift detected.');
        for (const failure of sourceOwnershipFailures) {
            console.error('  - ' + failure);
        }
        process.exit(1);
    }

    const trackedFiles = new Set([...LEGACY_RUNTIME_UI_FILES, ...CODE_OWNED_DYNAMIC_UI_FILES]);
    const missingTrackedFiles = [...trackedFiles]
        .filter((relativePath) => !fs.existsSync(path.join(projectDir, relativePath)))
        .sort();
    if (missingTrackedFiles.length > 0) {
        console.error('[verify-ui-ownership] tracked runtime UI owner list is stale:');
        for (const relativePath of missingTrackedFiles) {
            console.error('  - missing: ' + relativePath);
        }
        process.exit(1);
    }

    const violations = [];
    const legacySummaries = [];
    const dynamicSummaries = [];
    const files = walk(scriptsRoot).sort();
    for (const filePath of files) {
        const relativePath = rel(filePath);
        const source = fs.readFileSync(filePath, 'utf8');
        const patternHits = {};
        for (const pattern of OWNERSHIP_RISK_PATTERNS) {
            const lines = collectMatches(source, pattern.regex);
            if (lines.length > 0) {
                patternHits[pattern.name] = lines;
            }
        }
        const hitNames = Object.keys(patternHits);
        if (hitNames.length === 0) {
            continue;
        }
        const summary = {
            file: relativePath,
            totalHits: hitNames.reduce((sum, name) => sum + patternHits[name].length, 0),
            summary: describeFileHit(relativePath, patternHits),
        };
        if (CODE_OWNED_DYNAMIC_UI_FILES.has(relativePath)) {
            dynamicSummaries.push(summary);
            continue;
        }
        if (!LEGACY_RUNTIME_UI_FILES.has(relativePath)) {
            violations.push({
                file: relativePath,
                summary: summary.summary,
            });
            continue;
        }
        legacySummaries.push(summary);
    }

    if (violations.length > 0) {
        console.error('[verify-ui-ownership] failed: new runtime stable-UI owner files detected.');
        console.error('Only the explicit legacy runtime UI owner list may use these helper patterns during Phase 1.');
        for (const violation of violations) {
            console.error('  - ' + violation.file);
            console.error('    ' + violation.summary);
        }
        process.exit(1);
    }

    legacySummaries.sort((a, b) => a.file.localeCompare(b.file));
    dynamicSummaries.sort((a, b) => a.file.localeCompare(b.file));
    console.log(
        `[verify-ui-ownership] passed: ${legacySummaries.length} frozen stable-UI owner files and ${dynamicSummaries.length} code-owned dynamic UI files are tracked; no untracked files joined the list.`,
    );
    if (legacySummaries.length > 0) {
        console.log('[verify-ui-ownership] frozen stable UI owners:');
    }
    for (const item of legacySummaries) {
        console.log(`  - ${item.file} (${item.totalHits} hits)`);
    }
    if (dynamicSummaries.length > 0) {
        console.log('[verify-ui-ownership] code-owned dynamic UI / FX owners:');
    }
    for (const item of dynamicSummaries) {
        console.log(`  - ${item.file} (${item.totalHits} hits)`);
    }
}

main();
