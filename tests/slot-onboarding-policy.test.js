const assert = require('assert');

require('ts-node').register({
    transpileOnly: true,
    skipProject: true,
    compilerOptions: {
        module: 'commonjs',
        moduleResolution: 'node',
        target: 'es2019',
        ignoreDeprecations: '6.0',
    },
});

const {
    resolveSlotRowPolicy,
    resolveSlotOnboardingTimeLimit,
    getSlotUnlockMode,
    shouldAppendLockedSlotRowAfterUnlock,
    shouldShowGameplaySkillArea,
} = require('../assets/Scripts/Core/SlotOnboardingPolicy.ts');

function policy(levelId, configuredUnlockedRows) {
    return resolveSlotRowPolicy({
        levelId,
        entryMode: 'main',
        maxRows: 4,
        configuredUnlockedRows,
    });
}

assert.deepStrictEqual(
    policy(1, 4),
    {
        unlockedRows: 1,
        rowCount: 1,
        appendLockedRowAfterUnlock: false,
        unlockMode: 'ad',
        showSkillArea: false,
        showSlotUnlockGuide: false,
    },
    'level 1 must stay one-row and hide skill area even if JSON asks for more rows',
);

assert.deepStrictEqual(
    policy(2, 4),
    {
        unlockedRows: 1,
        rowCount: 2,
        appendLockedRowAfterUnlock: false,
        unlockMode: 'free',
        showSkillArea: true,
        showSlotUnlockGuide: true,
    },
    'level 2 must be one unlocked row plus a free second row tutorial',
);

for (const levelId of [3, 4, 5]) {
    assert.deepStrictEqual(
        policy(levelId, 1),
        {
            unlockedRows: 2,
            rowCount: 3,
            appendLockedRowAfterUnlock: false,
            unlockMode: 'ad',
            showSkillArea: true,
            showSlotUnlockGuide: false,
        },
        `level ${levelId} must start with two rows and ad-gate the third row`,
    );
}

assert.deepStrictEqual(
    policy(6, 2),
    {
        unlockedRows: 1,
        rowCount: 2,
        appendLockedRowAfterUnlock: true,
        unlockMode: 'ad',
        showSkillArea: true,
        showSlotUnlockGuide: false,
    },
    'level 6+ must ignore old two-row JSON and return to one unlocked row plus ad expansion',
);

const external = resolveSlotRowPolicy({
    levelId: 6,
    entryMode: 'external',
    maxRows: 4,
    configuredUnlockedRows: 3,
});
assert.strictEqual(external.unlockedRows, 3, 'external preview must preserve configured unlocked rows');
assert.strictEqual(external.rowCount, 4, 'external preview must keep one locked preview row when possible');
assert.strictEqual(getSlotUnlockMode(2, 'main'), 'free');
assert.strictEqual(getSlotUnlockMode(2, 'theme'), 'ad');
assert.strictEqual(shouldAppendLockedSlotRowAfterUnlock(5, 'main'), false);
assert.strictEqual(shouldAppendLockedSlotRowAfterUnlock(6, 'main'), true);
assert.strictEqual(shouldShowGameplaySkillArea(1, 'main'), false);
assert.strictEqual(shouldShowGameplaySkillArea(2, 'main'), true);
assert.strictEqual(resolveSlotOnboardingTimeLimit({ levelId: 1, entryMode: 'main', configuredTimeLimit: 60 }), 600);
assert.strictEqual(resolveSlotOnboardingTimeLimit({ levelId: 2, entryMode: 'main', configuredTimeLimit: 120 }), 600);
assert.strictEqual(resolveSlotOnboardingTimeLimit({ levelId: 3, entryMode: 'main', configuredTimeLimit: 120 }), 120);
assert.strictEqual(resolveSlotOnboardingTimeLimit({ levelId: 2, entryMode: 'theme', configuredTimeLimit: 120 }), 120);

console.log('slot onboarding policy checks passed');
