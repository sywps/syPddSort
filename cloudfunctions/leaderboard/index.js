const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const COLLECTION_NAME = 'leaderboard';

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

function formatEntry(entry, rank) {
  return {
    rank,
    uuid: typeof entry.uuid === 'string' ? entry.uuid : '',
    displayName: normalizeDisplayName(entry.displayName, entry.uuid),
    avatarUrl: typeof entry.avatarUrl === 'string' ? entry.avatarUrl : '',
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

async function fetchTopEntriesSorted(limit) {
  const collection = db.collection(COLLECTION_NAME);
  try {
    const res = await collection
      .orderBy('progressLevel', 'desc')
      .limit(clampLimit(limit))
      .get();
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.sort((a, b) => {
      const progressDiff = normalizeProgress(b.progressLevel) - normalizeProgress(a.progressLevel);
      if (progressDiff !== 0) return progressDiff;
      const updatedDiff = Math.floor(Number(a.updatedAt) || 0) - Math.floor(Number(b.updatedAt) || 0);
      if (updatedDiff !== 0) return updatedDiff;
      return Math.floor(Number(a.createdAt) || 0) - Math.floor(Number(b.createdAt) || 0);
    });
  } catch (error) {
    if (isCollectionMissing(error)) {
      return [];
    }
    throw error;
  }
}

async function getLeaderboard(event, wxContext) {
  const startedAt = Date.now();
  const limit = clampLimit(event.limit);
  const openid = wxContext.OPENID;
  const topEntriesRaw = await fetchTopEntriesSorted(limit);
  const selfIndex = topEntriesRaw.findIndex((entry) => entry.openid === openid);
  const selfEntry = selfIndex >= 0 ? topEntriesRaw[selfIndex] : null;
  const topEntries = topEntriesRaw
    .map((entry, index) => formatEntry(entry, index + 1));

  console.log('[getLeaderboard] success:', {
    limit,
    topCount: topEntries.length,
    selfInTop: selfIndex >= 0,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    ok: true,
    source: 'wechat-cloud',
    entries: topEntries,
    self: selfEntry ? formatEntry(selfEntry, selfIndex >= 0 ? selfIndex + 1 : 0) : null,
    total: topEntries.length,
    totalKnown: false,
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
