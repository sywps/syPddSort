const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function readProjectFile(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function transpile(relPath) {
    return ts.transpileModule(readProjectFile(relPath), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText;
}

function loadExperimentHarness(options = {}) {
    const storage = new Map();
    if (options.uid) storage.set('pdd.analytics.openid.v1', options.uid);
    const sandbox = {
        exports: {},
        module: { exports: {} },
        URLSearchParams,
        window: {
            location: { search: '' },
        },
        require(request) {
            if (request === 'cc') {
                return {
                    sys: {
                        localStorage: {
                            getItem: (key) => storage.get(key) || '',
                        },
                    },
                };
            }
            if (request === './MiniGamePlatform') {
                return {
                    getMiniGameBuildPlatform: () => options.platform || 'wechat',
                    getWeChatMiniGameRuntime: () => null,
                    isWeChatMiniGameRuntime: () => (options.platform || 'wechat') === 'wechat',
                };
            }
            if (request === './RemoteDataCdnClient') {
                return {
                    isLocalBrowserPreview: () => false,
                    normalizeCdnBaseUrl: (value) => String(value || ''),
                };
            }
            return {};
        },
    };
    if (options.forced) {
        sandbox.__PDD_LEVEL_EXPERIMENT_BUCKET__ = options.forced;
    }
    sandbox.exports = sandbox.module.exports;
    vm.runInNewContext(
        transpile('assets/Scripts/Core/LevelExperimentService.ts'),
        sandbox,
        { filename: 'LevelExperimentService.ts' },
    );
    return {
        exports: sandbox.module.exports,
        setUid(uid) {
            if (uid) storage.set('pdd.analytics.openid.v1', uid);
            else storage.delete('pdd.analytics.openid.v1');
        },
    };
}

function loadCdnContextResolver(experimentExports, stableBaseUrl) {
    const sandbox = {
        exports: {},
        module: { exports: {} },
        __PDD_LEVEL_DATA_CDN_URL__: stableBaseUrl,
        require(request) {
            if (request === './LevelExperimentService') return experimentExports;
            if (request === './MiniGamePlatform') {
                return {
                    getMiniGameBuildPlatform: () => 'wechat',
                    isDouyinMiniGameRuntime: () => false,
                    isMiniGameRuntime: () => true,
                    isWeChatMiniGameRuntime: () => true,
                };
            }
            if (request === './RemoteDataCdnClient') {
                return {
                    canUseCdn: () => true,
                    getCdnPlatformRequester: () => null,
                    getCdnUnavailableReason: () => '',
                    isBrowserBackedRequester: () => false,
                    isLocalBrowserCdnOptIn: () => false,
                    joinCdnUrl: (baseUrl, suffix) => baseUrl + suffix,
                    normalizeCdnBaseUrl: (value) => String(value || ''),
                    parseJsonText: JSON.parse,
                    readCdnStorageObject: () => null,
                    requestCdnText: async () => '',
                    withCdnQuery: (url) => url,
                    writeCdnStorageObject() {},
                };
            }
            if (request === './RuntimeLog') return { runtimeWarn() {} };
            if (request === './LevelConfig') {
                return {
                    validateConveyorCapacity: () => 60,
                };
            }
            return {};
        },
        console,
        setTimeout,
    };
    sandbox.exports = sandbox.module.exports;
    vm.runInNewContext(
        transpile('assets/Scripts/Core/LevelDataCdnService.ts'),
        sandbox,
        { filename: 'LevelDataCdnService.ts' },
    );
    const service = sandbox.module.exports.LevelDataCdnService.inst;
    return (levelId, prefix = 'level_') => service.resolveCdnContext(levelId, prefix);
}

const experimentService = readProjectFile('assets/Scripts/Core/LevelExperimentService.ts');
assert.ok(experimentService.includes("FRONT_LEVEL_EXPERIMENT_ID = 'ly_0224'"), 'experiment id must be the fixed ly_0224 salt');
assert.ok(experimentService.includes('FRONT_LEVEL_EXPERIMENT_MIN_LEVEL = 2'), 'experiment must start at logical level 2');
assert.ok(experimentService.includes('FRONT_LEVEL_EXPERIMENT_TREATMENT_ENABLED = false'), 'treatment rollout must remain paused');
assert.ok(!experimentService.includes('FRONT_LEVEL_EXPERIMENT_MAX_LEVEL'), 'experiment CDN routing must not stop at level 9');
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
assert.ok(experimentService.includes('sessionAssignmentResolved'), 'one app session must pin its first eligible assignment decision');

const cdnService = readProjectFile('assets/Scripts/Core/LevelDataCdnService.ts');
assert.ok(cdnService.includes('getFrontLevelExperimentDiagnostics'), 'CDN diagnostics must expose experiment state');
assert.ok(cdnService.includes('resolveFrontLevelExperimentContext(levelId, prefix)'), 'CDN routing must resolve experiment context per level');
assert.ok(cdnService.includes("experiment?.variant === 'exp'"), 'only exp should route to the experiment CDN baseUrl');
assert.ok(cdnService.includes("namespace: 'stable'"), 'base, null, and non-experiment levels must keep stable namespace');

const stableA = 'https://stable.example/a/';
const stableB = 'https://stable.example/b/';
const forcedExpHarness = loadExperimentHarness({ forced: 'exp' });
const resolveForcedExp = loadCdnContextResolver(forcedExpHarness.exports, stableA);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(resolveForcedExp(1))),
    { baseUrl: stableA, namespace: 'stable' },
    'level 1 must remain outside remote EXP routing',
);
for (const levelId of [2, 9, 10, 999, 1643]) {
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(resolveForcedExp(levelId))),
        { baseUrl: stableA, namespace: 'stable' },
        'paused treatment must keep forced EXP traffic on stable Base data',
    );
}
assert.strictEqual(
    forcedExpHarness.exports.getFrontLevelExperimentAnalyticsContext(2),
    null,
    'paused treatment must not emit a false EXP analytics exposure',
);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(forcedExpHarness.exports.getFrontLevelExperimentDiagnostics())),
    {
        id: 'ly_0224',
        status: 'paused',
        treatmentEnabled: false,
        levelRange: [2, null],
        levelRangeLabel: '2+',
        enabledForPlatform: false,
        forcedVariant: 'exp',
        assignedVariant: '',
        bucketIndex: null,
        sessionAssignmentResolved: true,
        cachedOpenidAvailable: false,
        localBrowserTreatmentBaseUrl: '',
        treatmentBaseUrl: forcedExpHarness.exports.FRONT_LEVEL_TREATMENT_CDN_BASE_URL,
    },
);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(resolveForcedExp(10, 'other_'))),
    { baseUrl: stableA, namespace: 'stable' },
    'non-mainline prefixes must remain outside the mainline experiment',
);

const forcedBaseHarness = loadExperimentHarness({ forced: 'base' });
const resolveForcedBase = loadCdnContextResolver(forcedBaseHarness.exports, stableB);
for (const levelId of [2, 10, 1643]) {
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(resolveForcedBase(levelId))),
        { baseUrl: stableB, namespace: 'stable' },
        'base must retain the build-selected stable CDN for every mainline level',
    );
}

const lateUidHarness = loadExperimentHarness();
let expUid = '';
for (let index = 1; index < 10000; index++) {
    const candidate = `exp-user-${index}`;
    if (lateUidHarness.exports.assignExperimentBucket(candidate, 'ly_0224').bucket === 'exp') {
        expUid = candidate;
        break;
    }
}
assert.ok(expUid, 'test must find a deterministic EXP uid');
const resolveLateUid = loadCdnContextResolver(lateUidHarness.exports, stableA);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(resolveLateUid(2))),
    { baseUrl: stableA, namespace: 'stable' },
    'missing uid must select neither base nor exp and therefore use stable data',
);
lateUidHarness.setUid(expUid);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(resolveLateUid(10))),
    { baseUrl: stableA, namespace: 'stable' },
    'a late uid must not switch the current app session from stable to EXP',
);
assert.strictEqual(
    lateUidHarness.exports.getFrontLevelExperimentAnalyticsContext(10),
    null,
    'analytics must reuse the pinned null decision from resource routing',
);

const assignedExpHarness = loadExperimentHarness({ uid: expUid });
const resolveAssignedExp = loadCdnContextResolver(assignedExpHarness.exports, stableB);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(resolveAssignedExp(2))),
    { baseUrl: stableB, namespace: 'stable' },
);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(resolveAssignedExp(1643))),
    { baseUrl: stableB, namespace: 'stable' },
);
assert.strictEqual(
    assignedExpHarness.exports.getFrontLevelExperimentAnalyticsContext(1643),
    null,
    'paused treatment must not attribute hash-assigned users to EXP',
);

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
