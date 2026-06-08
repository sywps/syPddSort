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

function describeFileHit(relativePath, patternHits) {
    return Object.entries(patternHits)
        .map(([name, lines]) => `${name}@${lines.slice(0, 3).join(',')}${lines.length > 3 ? '…' : ''}`)
        .join(' | ');
}

function main() {
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
