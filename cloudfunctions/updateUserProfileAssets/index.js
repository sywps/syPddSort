const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const USER_PROFILE_COLLECTION = 'user_profile';
const NEW_USER_STARTER_PROP_COUNT = 3;
const ASSET_FIELDS = [
  'gold',
  'expandSlotCount',
  'magicWandCount',
  'freezeCount',
  'brushCount',
  'magnetCount',
  'addTimeCount',
];

function cleanString(value, maxLength = 64) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeNonNegativeInt(value) {
  const num = Math.floor(Number(value) || 0);
  return num >= 0 ? num : 0;
}

function normalizeInt(value) {
  return Math.floor(Number(value) || 0);
}

function buildInventoryFields(source = {}) {
  const magicWandCount = normalizeNonNegativeInt(source.magicWandCount);
  const freezeCount = Object.prototype.hasOwnProperty.call(source, 'freezeCount')
    ? normalizeNonNegativeInt(source.freezeCount)
    : magicWandCount;
  return {
    gold: normalizeNonNegativeInt(source.gold),
    expandSlotCount: normalizeNonNegativeInt(source.expandSlotCount),
    magicWandCount,
    freezeCount,
    brushCount: normalizeNonNegativeInt(source.brushCount),
    magnetCount: normalizeNonNegativeInt(source.magnetCount),
    addTimeCount: normalizeNonNegativeInt(source.addTimeCount),
  };
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

function applyAssetUpdates(current, event) {
  const next = {
    ...buildInventoryFields(current),
  };
  const patch = {};

  for (const field of ASSET_FIELDS) {
    const deltaKey = `${field}Delta`;
    const hasSet = Object.prototype.hasOwnProperty.call(event, field);
    const hasDelta = Object.prototype.hasOwnProperty.call(event, deltaKey);

    if (hasSet && hasDelta) {
      throw new Error(`conflicting ${field} and ${deltaKey}`);
    }

    if (hasSet) {
      const value = normalizeNonNegativeInt(event[field]);
      next[field] = value;
      patch[field] = value;
      continue;
    }

    if (hasDelta) {
      const delta = normalizeInt(event[deltaKey]);
      const value = Math.max(0, next[field] + delta);
      next[field] = value;
      patch[field] = value;
    }
  }

  return { next, patch };
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || cleanString(event.openid, 96);

  if (!openid) {
    return {
      ok: false,
      errorMessage: 'missing openid',
    };
  }

  const timestamp = Date.now();

  try {
    const collection = db.collection(USER_PROFILE_COLLECTION);
    let current = await findUserProfile(openid);

    if (!current) {
      const profile = buildBaseProfile(openid, timestamp);
      const addResult = await collection.add({ data: profile });
      current = {
        _id: addResult?._id,
        ...profile,
      };
    }

    const { next, patch } = applyAssetUpdates(current, event);
    const profilePatch = {
      lastLoginTime: timestamp,
      ...patch,
    };

    // 老用户补齐缺失字段，即使这次没有传更新值也会一并写回
    for (const field of ASSET_FIELDS) {
      if (Number(current[field]) !== next[field] && !Object.prototype.hasOwnProperty.call(profilePatch, field)) {
        profilePatch[field] = next[field];
      }
    }

    if (current._id) {
      await collection.doc(current._id).update({ data: profilePatch });
    }

    return {
      ok: true,
      openid,
      profile: {
        ...current,
        ...profilePatch,
      },
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error?.message || 'updateUserProfileAssets failed',
    };
  }
};
