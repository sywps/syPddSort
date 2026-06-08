const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const USER_PROFILE_COLLECTION = 'user_profile';
const NEW_USER_STARTER_PROP_COUNT = 3;

function normalizeNonNegativeInt(value) {
  const num = Math.floor(Number(value) || 0);
  return num >= 0 ? num : 0;
}

function cleanString(value, maxLength = 64) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function buildInventoryFields(source = {}) {
  return {
    gold: normalizeNonNegativeInt(source.gold),
    expandSlotCount: normalizeNonNegativeInt(source.expandSlotCount),
    magicWandCount: normalizeNonNegativeInt(source.magicWandCount),
    brushCount: normalizeNonNegativeInt(source.brushCount),
    magnetCount: normalizeNonNegativeInt(source.magnetCount),
    addTimeCount: normalizeNonNegativeInt(source.addTimeCount),
  };
}

function buildStarterInventoryFields() {
  return {
    gold: 0,
    expandSlotCount: 0,
    magicWandCount: NEW_USER_STARTER_PROP_COUNT,
    brushCount: NEW_USER_STARTER_PROP_COUNT,
    magnetCount: NEW_USER_STARTER_PROP_COUNT,
    addTimeCount: 0,
  };
}

function buildInventoryPatch(source = {}) {
  const next = buildInventoryFields(source);
  const patch = {};
  for (const [key, value] of Object.entries(next)) {
    if (Number(source[key]) !== value) {
      patch[key] = value;
    }
  }
  return patch;
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

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return {
      ok: false,
      errorMessage: 'missing openid',
    };
  }

  const now = Date.now();
  const channel = cleanString(event.channel);
  const device = cleanString(event.device);
  const system = cleanString(event.system);

  try {
    const collection = db.collection(USER_PROFILE_COLLECTION);
    const current = await findUserProfile(openid);

    if (!current) {
      const profile = {
        openid,
        channel,
        device,
        system,
        firstLoginTime: now,
        lastLoginTime: now,
        totalPlayTimes: 0,
        isPay: false,
        createTime: now,
        ...buildStarterInventoryFields(),
      };

      await collection.add({ data: profile });
      return {
        ok: true,
        openid,
        isNewUser: true,
        profile,
      };
    }

    const patch = {
      lastLoginTime: now,
      ...buildInventoryPatch(current),
    };

    if (channel && channel !== current.channel) patch.channel = channel;
    if (device && device !== current.device) patch.device = device;
    if (system && system !== current.system) patch.system = system;

    await collection.doc(current._id).update({ data: patch });

    return {
      ok: true,
      openid,
      isNewUser: false,
      profile: {
        ...current,
        ...patch,
      },
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error?.message || 'getOpenid failed',
    };
  }
};
