const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const USER_PROFILE_COLLECTION = 'user_profile';
const NEW_USER_STARTER_PROP_COUNT = 3;
const USER_STATE_SCHEMA_VERSION = 2;
const SKIN_STATE_SCHEMA_VERSION = 1;

function cleanString(value, maxLength = 96) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1;
}

function normalizeTimestamp(value, fallback = 0) {
  const num = Math.floor(Number(value) || 0);
  return num > 0 ? num : fallback;
}

function latestPositiveTimestamp(...values) {
  return values.reduce((latest, value) => Math.max(latest, normalizeTimestamp(value, 0)), 0);
}

function earliestPositiveTimestamp(...values) {
  const normalized = values
    .map((value) => normalizeTimestamp(value, 0))
    .filter((value) => value > 0);
  return normalized.length > 0 ? Math.min(...normalized) : 0;
}

function normalizeNonNegativeInt(value, fallback = 0) {
  const num = Math.floor(Number(value) || 0);
  return num >= 0 ? num : fallback;
}

function normalizePositiveInt(value, fallback = 1) {
  const num = Math.floor(Number(value) || 0);
  return num > 0 ? num : fallback;
}

function readPositiveInt(value) {
  const num = Math.floor(Number(value) || 0);
  return num > 0 ? num : 0;
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function normalizeThemeUnlockedIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((item) => Math.floor(Number(item) || 0))
    .filter((item) => item > 0);
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function normalizeThemeCompletedIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((item) => Math.floor(Number(item) || 0))
    .filter((item) => item > 0);
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function normalizeBackgroundSkinId(value) {
  const id = Math.floor(Number(value) || 0);
  if (id === 0) return 1000;
  if (id > 0 && id < 1000) return id + 1000;
  return id > 0 ? id : 0;
}

function normalizeBackgroundSkinIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map(normalizeBackgroundSkinId)
    .filter((item) => item > 0);
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function normalizeBackgroundSkinAdProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    const id = normalizeBackgroundSkinId(key);
    const count = Math.floor(Number(raw) || 0);
    if (id > 0 && count > 0) result[String(id)] = count;
  }
  return result;
}
function mergeSortedThemeIds(currentValue, sourceValue, normalizer) {
  return Array.from(new Set([
    ...normalizer(currentValue),
    ...normalizer(sourceValue),
  ])).sort((a, b) => a - b);
}

function mergeThemeUnlockedIds(currentValue, sourceValue) {
  return mergeSortedThemeIds(currentValue, sourceValue, normalizeThemeUnlockedIds);
}

function mergeThemeCompletedIds(currentValue, sourceValue) {
  return mergeSortedThemeIds(currentValue, sourceValue, normalizeThemeCompletedIds);
}

function mergeBackgroundSkinIds(currentValue, sourceValue) {
  return Array.from(new Set([
    ...normalizeBackgroundSkinIds(currentValue),
    ...normalizeBackgroundSkinIds(sourceValue),
  ])).sort((a, b) => a - b);
}

function mergeBackgroundSkinAdProgress(currentValue, sourceValue) {
  const current = normalizeBackgroundSkinAdProgress(currentValue);
  const source = normalizeBackgroundSkinAdProgress(sourceValue);
  const result = { ...current };
  for (const [id, count] of Object.entries(source)) {
    result[id] = Math.max(Math.floor(Number(result[id]) || 0), count);
  }
  return result;
}

function isCollectionMissing(error) {
  const message = String(error?.message || error?.errMsg || '');
  return /collection/i.test(message) && /(not exist|does not exist|不存在)/i.test(message);
}

async function findUserProfile(openid) {
  try {
    const res = await db.collection(USER_PROFILE_COLLECTION).where({ openid }).limit(1).get();
    return Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
  } catch (error) {
    if (isCollectionMissing(error)) {
      throw new Error(`missing ${USER_PROFILE_COLLECTION} collection`);
    }
    throw error;
  }
}

function resolveRestorableProgress(doc) {
  return typeof doc?.savedLevel === 'number' ? readPositiveInt(doc.savedLevel) : 0;
}

function resolveStateUpdatedAt(doc, savedLevel) {
  const fromProfile = normalizeTimestamp(doc?.stateUpdatedAt, 0);
  return fromProfile > 0 ? fromProfile : (savedLevel > 1 ? Date.now() : 0);
}

function buildBaseProfile(openid, timestamp) {
  return {
    openid,
    channel: '',
    device: '',
    system: '',
    firstLoginTime: timestamp,
    lastLoginTime: timestamp,
    totalPlayTimes: 0,
    isPay: false,
    createTime: timestamp,
    gold: 0,
    expandSlotCount: 0,
    magicWandCount: 0,
    freezeCount: NEW_USER_STARTER_PROP_COUNT,
    brushCount: NEW_USER_STARTER_PROP_COUNT,
    magnetCount: NEW_USER_STARTER_PROP_COUNT,
    addTimeCount: 0,
  };
}

function extractProfile(doc) {
  if (!doc) return null;
  const uuid = cleanString(doc.clientUuid, 64);
  if (!uuid && !doc.displayName && !doc.avatarUrl && typeof doc.lastLevelId !== 'number') {
    return null;
  }
  return {
    version: normalizePositiveInt(doc.profileVersion, 1),
    uuid,
    displayName: cleanString(doc.displayName, 64),
    avatarUrl: cleanString(doc.avatarUrl, 512),
    isGuest: doc.isGuest !== false,
    createdAt: normalizeTimestamp(doc.createdAt, Date.now()),
    lastActiveAt: normalizeTimestamp(doc.lastActiveAt, Date.now()),
    loginCount: normalizeNonNegativeInt(doc.loginCount, 0),
    lastLevelId: normalizePositiveInt(doc.lastLevelId, 1),
  };
}

function extractGameState(doc) {
  const savedLevel = resolveRestorableProgress(doc);
  const state = {};

  if (savedLevel !== 0) {
    state.savedLevel = savedLevel;
    state.stateUpdatedAt = resolveStateUpdatedAt(doc, savedLevel);
  } else if (typeof doc?.stateUpdatedAt === 'number') {
    state.stateUpdatedAt = normalizeTimestamp(doc.stateUpdatedAt, 0);
  }

  if (typeof doc?.vigor === 'number') state.vigor = normalizeNonNegativeInt(doc.vigor, 10);
  if (typeof doc?.vigorTime === 'number') state.vigorTime = normalizeNonNegativeInt(doc.vigorTime, 0);
  if (typeof doc?.gold === 'number') state.gold = normalizeNonNegativeInt(doc.gold, 0);
  if (typeof doc?.expandSlotCount === 'number') state.expandSlotCount = normalizeNonNegativeInt(doc.expandSlotCount, 0);
  if (typeof doc?.magicWandCount === 'number') {
    const legacyMagicWandCount = normalizeNonNegativeInt(doc.magicWandCount, 0);
    state.magicWandCount = legacyMagicWandCount;
    if (typeof doc?.freezeCount !== 'number') state.freezeCount = legacyMagicWandCount;
  }
  if (typeof doc?.freezeCount === 'number') state.freezeCount = normalizeNonNegativeInt(doc.freezeCount, 0);
  if (typeof doc?.brushCount === 'number') state.brushCount = normalizeNonNegativeInt(doc.brushCount, 0);
  if (typeof doc?.magnetCount === 'number') state.magnetCount = normalizeNonNegativeInt(doc.magnetCount, 0);
  if (typeof doc?.dailySignInClaimedCount === 'number') state.dailySignInClaimedCount = normalizeNonNegativeInt(doc.dailySignInClaimedCount, 0);
  if (typeof doc?.dailySignInLastClaimDateKey === 'number') state.dailySignInLastClaimDateKey = normalizeNonNegativeInt(doc.dailySignInLastClaimDateKey, 0);
  if (Array.isArray(doc?.themeUnlockedIds)) state.themeUnlockedIds = normalizeThemeUnlockedIds(doc.themeUnlockedIds);
  if (Array.isArray(doc?.themeCompletedIds)) state.themeCompletedIds = normalizeThemeCompletedIds(doc.themeCompletedIds);
  const ownedBackgroundSkinIds = mergeBackgroundSkinIds(doc?.ownedBackgroundSkinIds, doc?.backgroundSkinOwnedIds);
  if (ownedBackgroundSkinIds.length > 0) state.ownedBackgroundSkinIds = ownedBackgroundSkinIds;
  if (doc?.backgroundSkinAdProgress && typeof doc.backgroundSkinAdProgress === 'object') state.backgroundSkinAdProgress = normalizeBackgroundSkinAdProgress(doc.backgroundSkinAdProgress);
  const equippedBackgroundSkinId = normalizeBackgroundSkinId(doc?.equippedBackgroundSkinId);
  const equippedBackgroundSkinUpdatedAt = normalizeTimestamp(
    doc?.equippedBackgroundSkinUpdatedAt,
    normalizeTimestamp(doc?.stateUpdatedAt, normalizeTimestamp(doc?.lastLoginTime, 0)),
  );
  if (equippedBackgroundSkinId > 0 && equippedBackgroundSkinUpdatedAt > 0) {
    state.equippedBackgroundSkinId = equippedBackgroundSkinId;
    state.equippedBackgroundSkinUpdatedAt = equippedBackgroundSkinUpdatedAt;
  }
  const wechatRecommendRecommended = normalizeBoolean(doc?.wechatRecommendRecommended)
    || normalizeTimestamp(doc?.wechatRecommendRecommendedAt, 0) > 0
    || normalizeTimestamp(doc?.wechatRecommendFirstSuccessAt, 0) > 0;
  if (wechatRecommendRecommended) {
    const recommendedAt = latestPositiveTimestamp(
      doc?.wechatRecommendRecommendedAt,
      doc?.wechatRecommendFirstSuccessAt,
    ) || Date.now();
    state.wechatRecommendRecommended = true;
    state.wechatRecommendRecommendedAt = recommendedAt;
    state.wechatRecommendFirstSuccessAt = earliestPositiveTimestamp(
      doc?.wechatRecommendFirstSuccessAt,
      doc?.wechatRecommendRecommendedAt,
      recommendedAt,
    );
  }

  return Object.keys(state).length > 0 ? state : null;
}

function buildProfilePatch(source = {}, current = {}) {
  const now = Date.now();
  const currentIsGuest = current.isGuest !== false;
  const sourceIsGuest = Object.prototype.hasOwnProperty.call(source, 'isGuest')
    ? normalizeBoolean(source.isGuest)
    : currentIsGuest;
  const preserveAuthorizedIdentity = !currentIsGuest && sourceIsGuest;
  const currentLoginCount = normalizeNonNegativeInt(current.loginCount, 0);
  const sourceLoginCount = normalizeNonNegativeInt(source.loginCount, currentLoginCount);
  const currentLastLevelId = normalizePositiveInt(current.lastLevelId, 1);
  const sourceLastLevelId = normalizePositiveInt(source.lastLevelId, currentLastLevelId);

  return {
    profileVersion: Math.max(
      normalizePositiveInt(source.version, 1),
      normalizePositiveInt(current.profileVersion, 1)
    ),
    clientUuid: cleanString(current.clientUuid || source.uuid, 64),
    displayName: preserveAuthorizedIdentity
      ? cleanString(current.displayName, 64)
      : cleanString(source.displayName || current.displayName, 64),
    avatarUrl: preserveAuthorizedIdentity
      ? cleanString(current.avatarUrl, 512)
      : cleanString(source.avatarUrl || current.avatarUrl, 512),
    isGuest: currentIsGuest && sourceIsGuest,
    createdAt: Math.min(
      normalizeTimestamp(source.createdAt, normalizeTimestamp(current.createdAt, now)),
      normalizeTimestamp(current.createdAt, normalizeTimestamp(source.createdAt, now))
    ),
    lastActiveAt: Math.max(
      normalizeTimestamp(source.lastActiveAt, 0),
      normalizeTimestamp(current.lastActiveAt, now)
    ),
    loginCount: Math.max(currentLoginCount, sourceLoginCount),
    lastLevelId: Math.max(currentLastLevelId, sourceLastLevelId),
  };
}

function buildGameStatePatch(source = {}, current = {}) {
  const currentStateUpdatedAt = normalizeTimestamp(current.stateUpdatedAt, 0);
  const sourceStateUpdatedAt = normalizeTimestamp(
    source.stateUpdatedAt,
    currentStateUpdatedAt || Date.now()
  );
  const currentSavedLevel = readPositiveInt(current.savedLevel);
  const sourceSavedLevel = hasOwn(source, 'savedLevel') ? readPositiveInt(source.savedLevel) : 0;
  const mergedSavedLevel = Math.max(currentSavedLevel, sourceSavedLevel);
  const currentGold = normalizeNonNegativeInt(current.gold, 0);
  const sourceGold = normalizeNonNegativeInt(source.gold, currentGold);
  const currentExpandSlotCount = normalizeNonNegativeInt(current.expandSlotCount, 0);
  const sourceExpandSlotCount = normalizeNonNegativeInt(source.expandSlotCount, currentExpandSlotCount);
  const currentMagicWandCount = normalizeNonNegativeInt(current.magicWandCount, 0);
  const sourceMagicWandCount = normalizeNonNegativeInt(source.magicWandCount, currentMagicWandCount);
  const currentFreezeCount = hasOwn(current, 'freezeCount')
    ? normalizeNonNegativeInt(current.freezeCount, 0)
    : currentMagicWandCount;
  const sourceFreezeCount = hasOwn(source, 'freezeCount')
    ? normalizeNonNegativeInt(source.freezeCount, currentFreezeCount)
    : sourceMagicWandCount;
  const currentBrushCount = normalizeNonNegativeInt(current.brushCount, 0);
  const sourceBrushCount = normalizeNonNegativeInt(source.brushCount, currentBrushCount);
  const currentMagnetCount = normalizeNonNegativeInt(current.magnetCount, 0);
  const sourceMagnetCount = normalizeNonNegativeInt(source.magnetCount, currentMagnetCount);
  const currentDailySignInClaimedCount = normalizeNonNegativeInt(current.dailySignInClaimedCount, 0);
  const sourceDailySignInClaimedCount = normalizeNonNegativeInt(source.dailySignInClaimedCount, currentDailySignInClaimedCount);
  const currentDailySignInLastClaimDateKey = normalizeNonNegativeInt(current.dailySignInLastClaimDateKey, 0);
  const sourceDailySignInLastClaimDateKey = normalizeNonNegativeInt(source.dailySignInLastClaimDateKey, currentDailySignInLastClaimDateKey);
  const mergedThemeUnlockedIds = mergeThemeUnlockedIds(current.themeUnlockedIds, source.themeUnlockedIds);
  const mergedThemeCompletedIds = mergeThemeCompletedIds(current.themeCompletedIds, source.themeCompletedIds);
  const currentBackgroundSkinIds = mergeBackgroundSkinIds(current.ownedBackgroundSkinIds, current.backgroundSkinOwnedIds);
  const sourceBackgroundSkinIds = mergeBackgroundSkinIds(source.ownedBackgroundSkinIds, source.backgroundSkinOwnedIds);
  const mergedBackgroundSkinIds = mergeBackgroundSkinIds(currentBackgroundSkinIds, sourceBackgroundSkinIds);
  const mergedBackgroundSkinAdProgress = mergeBackgroundSkinAdProgress(current.backgroundSkinAdProgress, source.backgroundSkinAdProgress);
  const currentEquippedBackgroundSkinId = normalizeBackgroundSkinId(current.equippedBackgroundSkinId);
  const sourceEquippedBackgroundSkinId = hasOwn(source, 'equippedBackgroundSkinId') ? normalizeBackgroundSkinId(source.equippedBackgroundSkinId) : 0;
  const currentEquippedBackgroundSkinUpdatedAt = normalizeTimestamp(current.equippedBackgroundSkinUpdatedAt, 0);
  const sourceEquippedBackgroundSkinUpdatedAt = normalizeTimestamp(source.equippedBackgroundSkinUpdatedAt, 0);
  const currentWechatRecommendRecommended = normalizeBoolean(current.wechatRecommendRecommended)
    || normalizeTimestamp(current.wechatRecommendRecommendedAt, 0) > 0
    || normalizeTimestamp(current.wechatRecommendFirstSuccessAt, 0) > 0;
  const sourceWechatRecommendRecommended = normalizeBoolean(source.wechatRecommendRecommended)
    || normalizeTimestamp(source.wechatRecommendRecommendedAt, 0) > 0
    || normalizeTimestamp(source.wechatRecommendFirstSuccessAt, 0) > 0;
  const currentEquippedBackgroundSkinValid = currentEquippedBackgroundSkinId > 0 && currentEquippedBackgroundSkinUpdatedAt > 0;
  const sourceEquippedBackgroundSkinValid = sourceEquippedBackgroundSkinId > 0 && sourceEquippedBackgroundSkinUpdatedAt > 0;
  let equippedBackgroundSkinId = currentEquippedBackgroundSkinValid ? currentEquippedBackgroundSkinId : 0;
  let equippedBackgroundSkinUpdatedAt = currentEquippedBackgroundSkinValid ? currentEquippedBackgroundSkinUpdatedAt : 0;
  if (sourceEquippedBackgroundSkinValid) {
    const shouldUseSourceEquipped =
      !currentEquippedBackgroundSkinValid ||
      sourceEquippedBackgroundSkinUpdatedAt > currentEquippedBackgroundSkinUpdatedAt;
    if (shouldUseSourceEquipped) {
      equippedBackgroundSkinId = sourceEquippedBackgroundSkinId;
      equippedBackgroundSkinUpdatedAt = sourceEquippedBackgroundSkinUpdatedAt;
    }
  }
  if (equippedBackgroundSkinId > 0 && !mergedBackgroundSkinIds.includes(equippedBackgroundSkinId)) {
    mergedBackgroundSkinIds.push(equippedBackgroundSkinId);
    mergedBackgroundSkinIds.sort((a, b) => a - b);
  }
  const shouldPreserveCurrentVolatileState =
    currentStateUpdatedAt > 0 &&
    (
      (hasOwn(source, 'savedLevel') && sourceSavedLevel < currentSavedLevel) ||
      mergedThemeUnlockedIds.length > normalizeThemeUnlockedIds(source.themeUnlockedIds).length ||
      mergedThemeCompletedIds.length > normalizeThemeCompletedIds(source.themeCompletedIds).length ||
      mergedBackgroundSkinIds.length > sourceBackgroundSkinIds.length ||
      Object.keys(mergedBackgroundSkinAdProgress).some((id) => {
        const sourceProgress = normalizeBackgroundSkinAdProgress(source.backgroundSkinAdProgress);
        return mergedBackgroundSkinAdProgress[id] > (sourceProgress[id] || 0);
      })
    );

  const patch = {
    vigor: shouldPreserveCurrentVolatileState
      ? normalizeNonNegativeInt(current.vigor, 10)
      : normalizeNonNegativeInt(source.vigor, normalizeNonNegativeInt(current.vigor, 10)),
    vigorTime: shouldPreserveCurrentVolatileState
      ? normalizeNonNegativeInt(current.vigorTime, 0)
      : normalizeNonNegativeInt(source.vigorTime, normalizeNonNegativeInt(current.vigorTime, 0)),
    gold: shouldPreserveCurrentVolatileState ? currentGold : sourceGold,
    expandSlotCount: shouldPreserveCurrentVolatileState ? currentExpandSlotCount : sourceExpandSlotCount,
    magicWandCount: shouldPreserveCurrentVolatileState ? currentMagicWandCount : sourceMagicWandCount,
    freezeCount: shouldPreserveCurrentVolatileState ? currentFreezeCount : sourceFreezeCount,
    brushCount: shouldPreserveCurrentVolatileState ? currentBrushCount : sourceBrushCount,
    magnetCount: shouldPreserveCurrentVolatileState ? currentMagnetCount : sourceMagnetCount,
    dailySignInClaimedCount: shouldPreserveCurrentVolatileState ? currentDailySignInClaimedCount : sourceDailySignInClaimedCount,
    dailySignInLastClaimDateKey: shouldPreserveCurrentVolatileState ? currentDailySignInLastClaimDateKey : sourceDailySignInLastClaimDateKey,
    themeUnlockedIds: mergedThemeUnlockedIds,
    themeCompletedIds: mergedThemeCompletedIds,
    ownedBackgroundSkinIds: mergedBackgroundSkinIds,
    backgroundSkinAdProgress: mergedBackgroundSkinAdProgress,
    equippedBackgroundSkinId,
    equippedBackgroundSkinUpdatedAt,
    stateUpdatedAt: shouldPreserveCurrentVolatileState
      ? currentStateUpdatedAt
      : Math.max(currentStateUpdatedAt, sourceStateUpdatedAt),
  };
  if (mergedSavedLevel > 0) {
    patch.savedLevel = mergedSavedLevel;
  }
  if (currentWechatRecommendRecommended || sourceWechatRecommendRecommended) {
    const recommendedAt = latestPositiveTimestamp(
      current.wechatRecommendRecommendedAt,
      current.wechatRecommendFirstSuccessAt,
      source.wechatRecommendRecommendedAt,
      source.wechatRecommendFirstSuccessAt,
    ) || Date.now();
    patch.wechatRecommendRecommended = true;
    patch.wechatRecommendRecommendedAt = recommendedAt;
    patch.wechatRecommendFirstSuccessAt = earliestPositiveTimestamp(
      current.wechatRecommendFirstSuccessAt,
      current.wechatRecommendRecommendedAt,
      source.wechatRecommendFirstSuccessAt,
      source.wechatRecommendRecommendedAt,
      recommendedAt,
    );
  }
  return patch;
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || cleanString(event.openid, 96);
  const action = cleanString(event.action || 'get', 16) || 'get';

  if (!openid) {
    return {
      ok: false,
      errorMessage: 'missing openid',
    };
  }

  try {
    const collection = db.collection(USER_PROFILE_COLLECTION);
    let current = await findUserProfile(openid);

    if (action === 'get') {
      const gameState = extractGameState(current);
      return {
        ok: true,
        userStateSchemaVersion: USER_STATE_SCHEMA_VERSION,
        skinStateSchemaVersion: SKIN_STATE_SCHEMA_VERSION,
        profile: extractProfile(current),
        gameState,
      };
    }

    if (action !== 'save') {
      return {
        ok: false,
        errorMessage: `unsupported action: ${action}`,
      };
    }

    const timestamp = Date.now();
    if (!current) {
      const profile = buildBaseProfile(openid, timestamp);
      const addResult = await collection.add({ data: profile });
      current = {
        _id: addResult?._id,
        ...profile,
      };
    }

    const patch = {
      lastLoginTime: timestamp,
    };

    if (event.profile && typeof event.profile === 'object') {
      Object.assign(patch, buildProfilePatch(event.profile, current));
    }
    if (event.gameState && typeof event.gameState === 'object') {
      Object.assign(patch, buildGameStatePatch(event.gameState, current));
    }
    if (current._id) {
      await collection.doc(current._id).update({ data: patch });
    }

    const merged = {
      ...current,
      ...patch,
    };

    return {
      ok: true,
      userStateSchemaVersion: USER_STATE_SCHEMA_VERSION,
      skinStateSchemaVersion: SKIN_STATE_SCHEMA_VERSION,
      profile: extractProfile(merged),
      gameState: extractGameState(merged),
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error?.message || 'syncUserState failed',
    };
  }
};
