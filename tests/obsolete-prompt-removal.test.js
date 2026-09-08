const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));
const nodeNames = (document) => document
    .filter((entry) => entry?.__type__ === 'cc.Node')
    .map((entry) => entry._name);

const gameSceneNames = nodeNames(readJson('assets/BootstrapBundle/Scenes/Game.scene'));
const homeSceneNames = nodeNames(readJson('assets/HomeAssetsBundle/Scenes/Home.scene'));
const acquirePrefabNames = nodeNames(readJson('assets/GameAssetsBundle/UI/Prefabs/Panels/AcquireResourcePanel.prefab'));

for (const name of ['GuideDemoAssistTemplate', 'AdPendingStripTemplate', 'LoadingSlowActions']) {
    assert(!gameSceneNames.includes(name), `Game.scene must not contain obsolete ${name}`);
}
assert(!homeSceneNames.includes('AdPendingStripTemplate'), 'Home.scene must not contain the ad-result waiting strip');
assert(!acquirePrefabNames.includes('AcquireCancelBtn'), 'acquire prefab must not contain the end-wait button');
assert(!fs.existsSync(path.join(root, 'assets/BootstrapBundle/GameUI/guide_prompt_button.png')));
assert(!fs.existsSync(path.join(root, 'assets/BootstrapBundle/GameUI/guide_prompt_button.png.meta')));

const guideSource = read('assets/Scripts/Core/GameCtrlModules/GuideLeaderboardModule.ts');
const settlementSource = read('assets/Scripts/Core/GameCtrlModules/SettlementHudModule.ts');
const stateSource = read('assets/Scripts/Core/GameCtrlState.ts');
for (const source of [guideSource, settlementSource, stateSource]) {
    assert(!source.includes('GuideDemoAssist'));
    assert(!source.includes('guideDemo'));
}

const adSource = read('assets/Scripts/Core/GameCtrlModules/HomeAdFlowModule.ts');
const commerceSource = read('assets/Scripts/Core/Panels/CommercePanelController.ts');
for (const token of ['AdPendingStrip', 'recoverable_endable', 'onRecoverableEndable', '结束等待', '正在确认广告结果']) {
    assert(!adSource.includes(token), `rewarded-ad flow must not contain ${token}`);
    assert(!commerceSource.includes(token), `commerce panel must not contain ${token}`);
}
assert(adSource.includes("showRewardedGrantToast(this, '广告结果确认失败，请重试');"));
assert(adSource.includes('}, 1000);'));

const loadingSources = [
    read('assets/Scripts/Core/GameCtrlModules/GameplayShareLoadingModule.ts'),
    read('assets/Scripts/Core/GameCtrlModules/ThemeLoadingOverlayModule.ts'),
    read('assets/Scripts/Core/GameSceneRuntimeController.ts'),
    stateSource,
];
for (const token of ['LoadingSlowActions', '_loadingSlowActionHandler', 'loading_wait_slow', 'retryGameplayLoading', 'exitGameplayLoading']) {
    for (const source of loadingSources) {
        assert(!source.includes(token), `loading flow must not contain ${token}`);
    }
}

console.log('obsolete-prompt-removal.test.js passed');
