const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function readProjectFile(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

const experimentService = readProjectFile('assets/Scripts/Core/LevelExperimentService.ts');
assert.ok(experimentService.includes("FRONT_LEVEL_EXPERIMENT_ID = 'ly_0224'"), 'experiment id must be the fixed ly_0224 salt');
assert.ok(experimentService.includes('FRONT_LEVEL_EXPERIMENT_MIN_LEVEL = 2'), 'experiment must start at logical level 2');
assert.ok(experimentService.includes('FRONT_LEVEL_EXPERIMENT_MAX_LEVEL = 9'), 'experiment must end at logical level 9');
assert.ok(experimentService.includes('0722_levels/front10_v1/treatment/'), 'treatment CDN path must be versioned and isolated');
assert.ok(experimentService.includes('/remote_wechat_b/0722_levels/front10_v1/treatment/'), 'treatment CDN path must use the B CDN slot outside stable levels');
assert.ok(experimentService.includes('crc32Utf8'), 'bucket assignment must use CRC32 over UTF-8 input');
assert.ok(experimentService.includes('assignExperimentBucket'), 'bucket assignment must be exposed as deterministic uid/name logic');
assert.ok(experimentService.includes('`${uid}:${experimentName}`'), 'hash input must be uid + ":" + experimentName');
assert.ok(experimentService.includes("bucketNumber < 50 ? 'base' : 'exp'"), 'bucket 0-49 must be base and 50-99 must be exp');
assert.ok(experimentService.includes('bucket: null'), 'missing uid or experimentName must return a real null bucket');
assert.ok(!experimentService.includes('EXPERIMENT_INSTALL_ID_STORAGE_KEY'), 'experiment bucketing must not create or use an install id');
assert.ok(!experimentService.includes('createInstallId'), 'experiment bucketing must not use local random ids');
assert.ok(!experimentService.includes('writePersistedAssignment'), 'experiment bucketing must not persist random assignments');
assert.ok(!experimentService.includes('Math.random'), 'experiment bucketing must not use randomness');
assert.ok(!experimentService.includes('Date.now().toString'), 'experiment bucketing must not use timestamps as uid fallback');
assert.ok(experimentService.includes("params.get('ab')"), 'local/debug override must support ab=experiment,bucket format');
assert.ok(!experimentService.includes("normalizedKey === 'level_exp'"), 'debug ab alias level_exp must not target this experiment');
assert.ok(!experimentService.includes("normalizedKey === 'front10_v1'"), 'debug ab alias front10_v1 must not target this experiment');
assert.ok(!experimentService.includes("normalizedKey === 'front10'"), 'debug ab alias front10 must not target this experiment');
assert.ok(experimentService.includes("normalized === 'c'"), 'debug ab bucket C must force the exp bucket');
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
assert.ok(cdnService.includes("experiment?.variant === 'exp'"), 'only exp should route to the experiment CDN baseUrl');
assert.ok(cdnService.includes("namespace: 'stable'"), 'base, null, and non-experiment levels must keep stable namespace');

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
