const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function readProjectFile(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const experimentService = readProjectFile('assets/Scripts/Core/LevelExperimentService.ts');
assert.ok(experimentService.includes("FRONT_LEVEL_EXPERIMENT_ID = 'front10_v1'"), 'experiment id must be front10_v1');
assert.ok(experimentService.includes('FRONT_LEVEL_EXPERIMENT_MIN_LEVEL = 2'), 'experiment must start at logical level 2');
assert.ok(experimentService.includes('FRONT_LEVEL_EXPERIMENT_MAX_LEVEL = 9'), 'experiment must end at logical level 9');
assert.ok(experimentService.includes('0722_levels/front10_v1/treatment/'), 'treatment CDN path must be versioned and isolated');
assert.ok(experimentService.includes('/remote_wechat_b/0722_levels/front10_v1/treatment/'), 'treatment CDN path must use the B CDN slot outside stable levels');
assert.ok(experimentService.includes('pdd.exp.${FRONT_LEVEL_EXPERIMENT_ID}.assignment'), 'bucket assignment must be persisted');
assert.ok(experimentService.includes('front10Variant'), 'local/debug override must support front10Variant');
assert.ok(experimentService.includes('front10BaseUrl'), 'browser preview must support a localhost treatment CDN override');
assert.ok(experimentService.includes('isLocalBrowserPreview'), 'treatment CDN override must be limited to local browser preview');
assert.ok(experimentService.includes('getLaunchOptionsSync'), 'WeChat devtools launch query must support forcing the experiment variant');
assert.ok(experimentService.includes("return 'off'"), 'override must support disabling the experiment');
assert.ok(experimentService.includes("prefix === DEFAULT_LEVEL_PREFIX"), 'experiment must only target mainline level data');
assert.ok(experimentService.includes('isFrontLevelExperimentAnalyticsTarget'), 'analytics cohort target must be independent from resource routing');
assert.ok(experimentService.includes('normalizedLevelId >= FRONT_LEVEL_EXPERIMENT_MIN_LEVEL'), 'analytics cohort must continue after level 9 for reach-rate reporting');

const cdnService = readProjectFile('assets/Scripts/Core/LevelDataCdnService.ts');
assert.ok(cdnService.includes('getFrontLevelExperimentDiagnostics'), 'CDN diagnostics must expose experiment state');
assert.ok(cdnService.includes('resolveFrontLevelExperimentContext(levelId, prefix)'), 'CDN routing must resolve experiment context per level');
assert.ok(cdnService.includes("experiment?.variant === 'treatment'"), 'only treatment should route to the treatment CDN baseUrl');
assert.ok(cdnService.includes("namespace: 'stable'"), 'control and non-experiment levels must keep stable namespace');

const analyticsMgr = readProjectFile('assets/Scripts/Core/AnalyticsMgr.ts');
assert.ok(analyticsMgr.includes('abId?: string'), 'behavior and funnel analytics must accept abId');
assert.ok(analyticsMgr.includes('abBucket?: string'), 'behavior and funnel analytics must accept abBucket');
assert.ok(analyticsMgr.includes('abId: opt.abId ?? this.levelContext.abId'), 'behavior analytics must include experiment id');
assert.ok(analyticsMgr.includes('abBucket: opt.abBucket ?? this.levelContext.abBucket'), 'behavior analytics must include experiment bucket');

const gameplaySessionController = readProjectFile('assets/Scripts/Core/GameplaySessionController.ts');
assert.ok(gameplaySessionController.includes('getFrontLevelExperimentAnalyticsContext'), 'gameplay session must attach experiment analytics context');
assert.ok(gameplaySessionController.includes("gameplayEntryMode === 'main'"), 'experiment analytics must be limited to mainline gameplay');
assert.ok(gameplaySessionController.includes('abId: experimentAnalyticsContext?.abId'), 'beginLevel must explicitly set or clear experiment id');
assert.ok(gameplaySessionController.includes('abBucket: experimentAnalyticsContext?.abBucket'), 'beginLevel must explicitly set or clear experiment bucket');

console.log('front10-level-experiment-routing.test.js passed');
