#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PLAYER_UID_PATTERN = /^[1-9]\d{7}$/;
const DATABASE_PAGE_SIZE = 1000;
const DEFAULT_MAX_RECORDS = 5000;
const MAX_RECORDS = 10000;

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function normalizePlayerUid(value) {
  const uid = typeof value === 'string' ? value.trim() : '';
  if (!PLAYER_UID_PATTERN.test(uid)) {
    throw new Error('UID must be an 8-digit number that does not start with 0');
  }
  return uid;
}

function normalizePositiveInt(value, fallback, max) {
  const numberValue = Math.floor(Number(value) || fallback);
  return Math.max(1, Math.min(max, numberValue));
}

function parseArgs(argv) {
  const args = {
    mode: 'query',
    maxRecords: DEFAULT_MAX_RECORDS,
    batchSize: 20,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--uid' && next) {
      args.uid = next;
      index += 1;
    } else if (token === '--out' && next) {
      args.outPath = next;
      index += 1;
    } else if (token === '--max-records' && next) {
      args.maxRecords = normalizePositiveInt(next, DEFAULT_MAX_RECORDS, MAX_RECORDS);
      index += 1;
    } else if (token === '--backfill') {
      args.mode = 'backfill';
    } else if (token === '--apply') {
      args.apply = true;
    } else if (token === '--batch-size' && next) {
      args.batchSize = normalizePositiveInt(next, 20, 50);
      index += 1;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!args.help && args.mode === 'query') {
    args.uid = normalizePlayerUid(args.uid || '');
  }
  if (args.mode === 'backfill' && args.uid) {
    throw new Error('--uid and --backfill cannot be used together');
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/player-uid-admin.js --uid 12345678
  node scripts/player-uid-admin.js --uid 12345678 --out artifacts/player-analytics/12345678-recheck.json
  node scripts/player-uid-admin.js --backfill
  node scripts/player-uid-admin.js --backfill --apply --batch-size 20

Required environment variables:
  TCB_ENV_ID                  CloudBase environment ID
  TCB_API_KEY                 Server-side CloudBase API key
  PLAYER_UID_BACKFILL_TOKEN   Required only for --backfill; must match the
                              getOpenid cloud-function environment variable

Query behavior:
  Looks up user_profile.UID, then exports that user's user_behavior and
  first_level_funnel records. It never exposes an arbitrary-user query in the game client.

Backfill behavior:
  --backfill is dry-run only. --apply assigns at most one controlled batch.
  Repeat --apply until the reported remaining count is 0.

Cloud database preparation:
  Store the player field as UID (String) in user_profile and create a normal
  ascending index for user_profile.UID before using customer-service queries.
`);
}

function createApiBundle() {
  const envId = requireEnv('TCB_ENV_ID');
  return {
    apiKey: requireEnv('TCB_API_KEY'),
    baseUrl: String(process.env.TCB_API_BASE_URL || `https://${envId}.api.tcloudbasegateway.com`).replace(/\/$/, ''),
  };
}

function parseDatabaseValue(value) {
  if (Array.isArray(value)) return value.map(parseDatabaseValue);
  if (!value || typeof value !== 'object') return value;
  if (Object.prototype.hasOwnProperty.call(value, '$numberInt')) return Number(value.$numberInt);
  if (Object.prototype.hasOwnProperty.call(value, '$numberLong')) return Number(value.$numberLong);
  if (Object.prototype.hasOwnProperty.call(value, '$numberDouble')) return Number(value.$numberDouble);
  if (Object.prototype.hasOwnProperty.call(value, '$date')) {
    const raw = value.$date;
    return raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, '$numberLong')
      ? Number(raw.$numberLong)
      : raw;
  }
  const output = {};
  for (const [key, raw] of Object.entries(value)) output[key] = parseDatabaseValue(raw);
  return output;
}

function toErrorSnippet(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || null);
  return text.length > 400 ? `${text.slice(0, 400)}...` : text;
}

async function requestJson(url, options, context) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = text;
  }
  if (!response.ok) {
    const detail = body && typeof body === 'object' ? body.message || body.code : '';
    throw new Error(`${context} failed: ${detail || toErrorSnippet(body) || `HTTP ${response.status}`}`);
  }
  return body;
}

async function queryCollection(api, collection, query, sort, maxRecords) {
  const records = [];
  let offset = 0;
  let truncated = false;
  while (records.length < maxRecords) {
    const limit = Math.min(DATABASE_PAGE_SIZE, maxRecords - records.length);
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
      query: JSON.stringify(query),
      sort: JSON.stringify(sort),
    });
    const body = await requestJson(
      `${api.baseUrl}/v1/database/instances/(default)/databases/(default)/collections/${encodeURIComponent(collection)}/documents?${params}`,
      {
        headers: {
          Authorization: `Bearer ${api.apiKey}`,
          Accept: 'application/json',
        },
      },
      `CloudBase query for ${collection}`,
    );
    const items = Array.isArray(body?.list) ? body.list.map(parseDatabaseValue) : [];
    records.push(...items);
    if (items.length < limit) break;
    offset += items.length;
    if (records.length >= maxRecords) truncated = true;
  }
  return { records, truncated };
}

function findCloudFunctionResult(body) {
  const queue = [body];
  while (queue.length) {
    const value = queue.shift();
    if (typeof value === 'string') {
      try {
        queue.push(JSON.parse(value));
      } catch (_) {
        // Ignore non-JSON wrapper strings.
      }
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    if (Object.prototype.hasOwnProperty.call(value, 'ok')) return value;
    queue.push(value.result, value.data, value.response_data, value.responseData, value.body);
  }
  return null;
}

async function runQuery(args, api) {
  const profileResult = await queryCollection(api, 'user_profile', { UID: args.uid }, {}, 2);
  if (profileResult.records.length !== 1) {
    throw new Error(`Expected exactly one user_profile record for UID ${args.uid}, found ${profileResult.records.length}`);
  }
  const profile = profileResult.records[0];
  const openid = String(profile.openid || '').trim();
  if (!openid) throw new Error(`UID ${args.uid} has no openid in user_profile`);

  const [behavior, funnel] = await Promise.all([
    queryCollection(api, 'user_behavior', { openid }, { timestamp: 1 }, args.maxRecords),
    queryCollection(api, 'first_level_funnel', { openid }, { timestamp: 1 }, args.maxRecords),
  ]);
  const outputPath = args.outPath || path.join('artifacts', 'player-analytics', `${args.uid}.json`);
  if (fs.existsSync(outputPath)) {
    throw new Error(`Refusing to overwrite ${outputPath}; choose another --out path`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    UID: args.uid,
    openid,
    userBehavior: behavior.records,
    firstLevelFunnel: funnel.records,
    truncated: {
      userBehavior: behavior.truncated,
      firstLevelFunnel: funnel.truncated,
    },
  }, null, 2));
  console.log(`UID ${args.uid}: exported ${behavior.records.length} user_behavior and ${funnel.records.length} first_level_funnel records to ${outputPath}`);
}

async function runBackfill(args, api) {
  const token = requireEnv('PLAYER_UID_BACKFILL_TOKEN');
  const body = await requestJson(
    `${api.baseUrl}/v1/functions/getOpenid`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${api.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        action: 'backfill',
        adminToken: token,
        apply: args.apply === true,
        batchSize: args.batchSize,
      }),
    },
    'CloudBase UID backfill',
  );
  const result = findCloudFunctionResult(body);
  if (!result || result.ok !== true) {
    throw new Error(`UID backfill returned an invalid result: ${toErrorSnippet(body)}`);
  }
  console.log(`UID backfill ${result.dryRun ? 'dry-run' : 'apply'}: missing=${result.missingProfiles}, processed=${result.processed}, remaining=${result.remaining}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const api = createApiBundle();
  if (args.mode === 'backfill') {
    await runBackfill(args, api);
    return;
  }
  await runQuery(args, api);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[player-uid-admin] ${error.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  findCloudFunctionResult,
  normalizePlayerUid,
  parseArgs,
  parseDatabaseValue,
  queryCollection,
  runQuery,
};
