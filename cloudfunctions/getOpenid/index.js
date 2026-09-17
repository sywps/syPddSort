const cloud = require('wx-server-sdk');
const { resolveAssignment } = require('./first-level-experiment');
const { resolveAssignment: resolveBeanSelection } = require('./bean-selection-experiment');
const { resolveAssignment: resolveEncouragement } = require('./encouragement-experiment');

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

function buildStarterInventoryFields() {
  return {
    gold: 0,
    expandSlotCount: 0,
    magicWandCount: 0,
    freezeCount: NEW_USER_STARTER_PROP_COUNT,
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
    const firstLevelExperiment = resolveAssignment(openid, current, event.firstLevelExperiment, now);
    const beanSelectionExperiment = resolveBeanSelection(openid, current, event.beanSelectionExperiment, now);
    const encouragementExperiment = resolveEncouragement(openid, current, event.encouragementExperiment, now);

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
        firstLevelExperiment,
        beanSelectionExperiment,
        encouragementExperiment,
        ...buildStarterInventoryFields(),
      };

      await collection.add({ data: profile });
      return {
        ok: true,
        openid,
        isNewUser: true,
        firstLevelExperiment,
        beanSelectionExperiment,
        encouragementExperiment,
        profile,
      };
    }

    const patch = {
      lastLoginTime: now,
      ...buildInventoryPatch(current),
    };
    if (event.firstLevelExperiment?.test !== true && event.firstLevelExperiment?.exclusionReason
        && current.firstLevelExperiment?.status === 'enrolled') {
      patch.firstLevelExperiment = firstLevelExperiment;
    }

    if (channel && channel !== current.channel) patch.channel = channel;
    if (event.beanSelectionExperiment?.id === beanSelectionExperiment.id && event.beanSelectionExperiment?.test !== true
        && (!current.beanSelectionExperiment || event.beanSelectionExperiment.exclusionReason)) {
      patch.beanSelectionExperiment = beanSelectionExperiment;
    }
    if (event.encouragementExperiment?.id === encouragementExperiment.id && event.encouragementExperiment?.test !== true
        && (!current.encouragementExperiment || event.encouragementExperiment.exclusionReason)) {
      patch.encouragementExperiment = encouragementExperiment;
    }
    if (device && device !== current.device) patch.device = device;
    if (system && system !== current.system) patch.system = system;

    await collection.doc(current._id).update({ data: patch });

    return {
      ok: true,
      openid,
      isNewUser: false,
      firstLevelExperiment,
      beanSelectionExperiment,
      encouragementExperiment,
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
