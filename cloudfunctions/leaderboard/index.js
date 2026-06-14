const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;
const COLLECTION_NAME = 'leaderboard';
const USER_PROFILE_COLLECTION = 'user_profile';
const PAGE_SIZE = 100;
const MAX_SCAN_SIZE = 5000;

function normalizeProgress(value) {
  return Math.max(1, Math.floor(Number(value) || 1));
}

function normalizeDisplayName(value, uuid) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name) return name.slice(0, 24);
  const suffix = typeof uuid === 'string' && uuid ? uuid.slice(0, 8).toUpperCase() : 'PLAYER';
  return `玩家${suffix}`;
}

function clampLimit(value) {
  const normalized = Math.floor(Number(value) || 10);
  return Math.max(1, Math.min(100, normalized));
}

function isCollectionMissing(error) {
  const message = String(error?.message || error?.errMsg || '');
  return /collection/i.test(message) && /(not exist|does not exist|不存在)/i.test(message);
}

function formatEntry(entry, rank, profile) {
  const profileAvatarUrl = typeof profile?.avatarUrl === 'string' ? profile.avatarUrl : '';
  return {
    rank,
    uuid: typeof entry.uuid === 'string' ? entry.uuid : '',
    displayName: normalizeDisplayName(entry.displayName, entry.uuid),
    avatarUrl: profileAvatarUrl || (typeof entry.avatarUrl === 'string' ? entry.avatarUrl : ''),
    progressLevel: normalizeProgress(entry.progressLevel),
    updatedAt: Math.floor(Number(entry.updatedAt) || 0),
  };
}

async function findEntryByOpenId(openid) {
  try {
    const res = await db.collection(COLLECTION_NAME).where({ openid }).limit(1).get();
    return Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
  } catch (error) {
    if (isCollectionMissing(error)) return null;
    throw error;
  }
}

async function submitProgress(event, wxContext) {
  const openid = wxContext.OPENID;
  if (!openid) throw new Error('missing openid');

  const progressLevel = normalizeProgress(event.progressLevel);
  const uuid = typeof event.uuid === 'string' ? event.uuid : '';
  const displayName = normalizeDisplayName(event.displayName, uuid);
  const avatarUrl = typeof event.avatarUrl === 'string' ? event.avatarUrl : '';
  const now = Date.now();
  const collection = db.collection(COLLECTION_NAME);
  const current = await findEntryByOpenId(openid);

  console.log('[submitProgress] openid:', openid, 'progressLevel:', progressLevel, 'displayName:', displayName, 'avatarUrl:', avatarUrl ? 'yes' : 'no');

  if (!current) {
    try {
      await collection.add({
        data: {
          openid,
          uuid,
          displayName,
          avatarUrl,
          progressLevel,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (error) {
      if (isCollectionMissing(error)) {
        throw new Error('missing leaderboard collection');
      }
      throw error;
    }
    return {
      ok: true,
      progressLevel,
      displayName,
    };
  }

  const currentProgress = normalizeProgress(current.progressLevel);
  const nextProgress = Math.max(currentProgress, progressLevel);
  const patch = {};

  if (uuid && current.uuid !== uuid) patch.uuid = uuid;
  if (displayName && current.displayName !== displayName) patch.displayName = displayName;
  if (avatarUrl && current.avatarUrl !== avatarUrl) patch.avatarUrl = avatarUrl;
  if (nextProgress > currentProgress) {
    patch.progressLevel = nextProgress;
    patch.updatedAt = now;
  }

  if (Object.keys(patch).length > 0) {
    await collection.doc(current._id).update({ data: patch });
  }

  return {
    ok: true,
    progressLevel: nextProgress,
    displayName: patch.displayName || current.displayName || displayName,
  };
}

async function fetchAllEntriesSorted() {
  const collection = db.collection(COLLECTION_NAME);
  const all = [];

  for (let skip = 0; skip < MAX_SCAN_SIZE; skip += PAGE_SIZE) {
    let res;
    try {
      res = await collection
        .orderBy('progressLevel', 'desc')
        .orderBy('updatedAt', 'asc')
        .orderBy('createdAt', 'asc')
        .skip(skip)
        .limit(PAGE_SIZE)
        .get();
    } catch (error) {
      if (isCollectionMissing(error)) return [];
      throw error;
    }

    const list = Array.isArray(res.data) ? res.data : [];
    all.push(...list);
    if (list.length < PAGE_SIZE) break;
  }

  return all;
}

async function fetchUserProfilesByOpenids(openids) {
  const uniqueOpenids = Array.from(new Set((openids || []).filter((openid) => typeof openid === 'string' && openid)));
  const profiles = new Map();
  if (!uniqueOpenids.length) {
    return profiles;
  }

  for (let index = 0; index < uniqueOpenids.length; index += 100) {
    const batch = uniqueOpenids.slice(index, index + 100);
    try {
      const res = await db.collection(USER_PROFILE_COLLECTION).where({
        openid: _.in(batch),
      }).get();
      for (const row of (res.data || [])) {
        if (row?.openid) {
          profiles.set(row.openid, row);
        }
      }
    } catch (error) {
      if (isCollectionMissing(error)) {
        return profiles;
      }
      throw error;
    }
  }

  return profiles;
}

async function getLeaderboard(event, wxContext) {
  const limit = clampLimit(event.limit);
  const openid = wxContext.OPENID;
  const allEntries = await fetchAllEntriesSorted();
  const selfIndex = allEntries.findIndex((entry) => entry.openid === openid);
  const selfEntry = selfIndex >= 0 ? allEntries[selfIndex] : null;
  const profileMap = await fetchUserProfilesByOpenids([
    ...allEntries.slice(0, limit).map((entry) => entry.openid),
    selfEntry?.openid || '',
  ]);
  const topEntries = allEntries
    .slice(0, limit)
    .map((entry, index) => formatEntry(entry, index + 1, profileMap.get(entry.openid)));

  return {
    ok: true,
    source: 'wechat-cloud',
    entries: topEntries,
    self: selfEntry ? formatEntry(selfEntry, selfIndex + 1, profileMap.get(selfEntry.openid)) : null,
    total: allEntries.length,
  };
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext();

  try {
    switch (event.action) {
      case 'submitProgress':
        return await submitProgress(event, wxContext);
      case 'getLeaderboard':
        return await getLeaderboard(event, wxContext);
      default:
        return {
          ok: false,
          errorMessage: 'unknown action',
        };
    }
  } catch (error) {
    return {
      ok: false,
      errorMessage: error?.message || 'leaderboard error',
    };
  }
};
