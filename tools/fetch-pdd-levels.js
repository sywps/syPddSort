const https = require('https');
const fs = require('fs');
const path = require('path');
const { decodeUuid } = require('./decode-uuid');

const CDN_BASE = 'https://hsyq.zhejing.tech/diamond_flow/wx82f62749252c81a1/26040802/remote/json';
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'LevelData');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Parse pdd level format: string with width/height
// Characters map to cell types
function parsePddLevel(jsonObj) {
  const { width, height, data } = jsonObj;
  if (!data || !width || !height) return null;

  const lines = data.split('\n');
  const cols = Math.ceil(width / 2); // each char = 2 units? Let's see

  // Count actual columns from data
  const maxLen = Math.max(...lines.map(l => l.length));

  // Map pdd chars to our color indices
  // From the sample: 2=wall/boundary, 8=color, j=color, spaces=empty
  // We need to figure out the char mapping
  // Let's collect all unique chars first
  const chars = new Set();
  for (const line of lines) {
    for (const ch of line) chars.add(ch);
  }

  return { width, height, data, lines, chars: [...chars], maxLen };
}

async function main() {
  console.log('Fetching json bundle config...');
  const configRes = await fetch(`${CDN_BASE}/config.json`);
  const config = JSON.parse(configRes.data);

  const uuids = config.uuids;
  const paths = config.paths;

  // Collect all entries
  const entries = [];
  for (const [idx, info] of Object.entries(paths)) {
    const name = info[0];
    const uuid = decodeUuid(uuids[parseInt(idx)]);
    entries.push({ name, uuid, idx: parseInt(idx) });
  }

  console.log(`Total entries: ${entries.length}`);

  // Categorize
  const levelEntries = entries.filter(e => /^level_\d+$/.test(e.name));
  const sagaEntries = entries.filter(e => /^Saga_\d+$/.test(e.name));
  const dlEntries = entries.filter(e => /^DL_\d+$/.test(e.name));
  const otherEntries = entries.filter(e => !/^(level_\d+|Saga_\d+|DL_\d+)$/.test(e.name));

  console.log(`Levels: ${levelEntries.length}, Saga: ${sagaEntries.length}, DL: ${dlEntries.length}, Other: ${otherEntries.length}`);
  if (otherEntries.length > 0) {
    console.log('Other names:', otherEntries.slice(0, 10).map(e => e.name));
  }

  // Sort levels numerically
  levelEntries.sort((a, b) => {
    const na = parseInt(a.name.replace('level_', ''));
    const nb = parseInt(b.name.replace('level_', ''));
    return na - nb;
  });

  console.log(`Level range: ${levelEntries[0]?.name} to ${levelEntries[levelEntries.length-1]?.name}`);

  // Download first 5 to analyze format
  const samples = [];
  for (const entry of levelEntries.slice(0, 5)) {
    const prefix = entry.uuid.substring(0, 2);
    const url = `${CDN_BASE}/import/${prefix}/${entry.uuid}.json`;
    const res = await fetch(url);
    if (res.status === 200) {
      const parsed = JSON.parse(res.data);
      // Cocos JsonAsset format: array [version, ?, ?, types, data, instances]
      // The json field is in the instance data
      const jsonData = extractJson(parsed);
      samples.push({ name: entry.name, json: jsonData });
      console.log(`\n${entry.name}:`, JSON.stringify(jsonData).substring(0, 200));
    }
    await sleep(50);
  }

  // Now download ALL levels and save
  console.log('\n\nDownloading all levels...');

  // Combine: levels first, then saga, then DL
  const allLevels = [...levelEntries, ...sagaEntries.sort((a,b) => {
    return parseInt(a.name.replace('Saga_', '')) - parseInt(b.name.replace('Saga_', ''));
  }), ...dlEntries.sort((a,b) => {
    return parseInt(a.name.replace('DL_', '')) - parseInt(b.name.replace('DL_', ''));
  })];

  let successCount = 0;
  let failCount = 0;
  const allLevelData = [];

  // Batch download with concurrency
  const BATCH = 20;
  for (let i = 0; i < allLevels.length; i += BATCH) {
    const batch = allLevels.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (entry) => {
      const prefix = entry.uuid.substring(0, 2);
      const url = `${CDN_BASE}/import/${prefix}/${entry.uuid}.json`;
      try {
        const res = await fetch(url);
        if (res.status === 200) {
          const parsed = JSON.parse(res.data);
          const jsonData = extractJson(parsed);
          return { name: entry.name, json: jsonData, ok: true };
        }
        return { name: entry.name, ok: false, status: res.status };
      } catch (e) {
        return { name: entry.name, ok: false, error: e.message };
      }
    }));

    for (const r of results) {
      if (r.ok) {
        allLevelData.push(r);
        successCount++;
      } else {
        failCount++;
        if (failCount <= 5) console.log(`Failed: ${r.name} - ${r.status || r.error}`);
      }
    }

    process.stdout.write(`\r  Downloaded ${i + batch.length}/${allLevels.length} (ok: ${successCount}, fail: ${failCount})`);
    await sleep(100);
  }

  console.log(`\n\nTotal downloaded: ${successCount}, failed: ${failCount}`);

  // Save raw level data
  const outputFile = path.join(__dirname, 'pdd-levels-raw.json');
  fs.writeFileSync(outputFile, JSON.stringify(allLevelData, null, 2));
  console.log(`Saved raw data to ${outputFile}`);

  // Now convert to our format and save as level files
  console.log('\nConverting levels...');
  convertAndSave(allLevelData);
}

function extractJson(cocosData) {
  // Cocos 3.x serialized format: [ver, ?, ?, types, templates, instances, ...]
  // instances[0] = [typeIdx, nameValue, jsonValue, flags]
  // The json data is at instances[0][2]
  if (Array.isArray(cocosData) && cocosData.length >= 6) {
    const instances = cocosData[5];
    if (Array.isArray(instances) && instances[0] && Array.isArray(instances[0])) {
      return instances[0][2];
    }
  }
  if (cocosData && cocosData.json) return cocosData.json;
  return cocosData;
}

function convertAndSave(allLevelData) {
  // First, analyze what format the pdd levels use
  const sample = allLevelData[0];
  if (!sample) return;

  console.log('Sample level format:', typeof sample.json);
  if (typeof sample.json === 'object') {
    console.log('Keys:', Object.keys(sample.json));
  }
  if (typeof sample.json === 'string') {
    console.log('String preview:', sample.json.substring(0, 200));
  }

  // Our game uses: { boardData: number[][], slots: {color, positions}[] }
  // We need to understand pdd format first, then convert

  // For now, save the raw extracted json for each level
  const STARTING_LEVEL = 245;
  let saved = 0;

  for (let i = 0; i < allLevelData.length; i++) {
    const level = allLevelData[i];
    const levelNum = STARTING_LEVEL + i;
    const converted = convertLevel(level.json, level.name);
    if (converted) {
      const outPath = path.join(OUTPUT_DIR, `level_${levelNum}.json`);
      fs.writeFileSync(outPath, JSON.stringify(converted));
      saved++;
    }
  }

  console.log(`Saved ${saved} levels (level_${STARTING_LEVEL} to level_${STARTING_LEVEL + saved - 1})`);
}

function convertLevel(pddJson, name) {
  // pdd format: { width, height, data: "string grid" }
  // data is a multi-line string, each char represents a cell
  // We need to parse the char types and map to our color system

  if (!pddJson || typeof pddJson !== 'object') return null;

  const { width, height, data } = pddJson;
  if (!data || !width || !height) {
    // Maybe different format - save as-is for now
    return pddJson;
  }

  const lines = data.split('\n').filter(l => l.length > 0);
  const rows = lines.length;
  const cols = Math.max(...lines.map(l => l.length));

  // Collect unique non-space chars to determine colors
  const charSet = new Set();
  for (const line of lines) {
    for (const ch of line) {
      if (ch !== ' ') charSet.add(ch);
    }
  }

  // Map chars to color indices (1-based, 0 = empty)
  const charList = [...charSet].sort();
  const charMap = {};
  charList.forEach((ch, i) => charMap[ch] = i + 1);

  // Build board grid
  const boardData = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    const line = lines[r] || '';
    for (let c = 0; c < cols; c++) {
      const ch = c < line.length ? line[c] : ' ';
      row.push(ch === ' ' ? 0 : charMap[ch]);
    }
    boardData.push(row);
  }

  // Group cells by color for slots
  const colorGroups = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = boardData[r][c];
      if (val > 0) {
        if (!colorGroups[val]) colorGroups[val] = [];
        colorGroups[val].push([r, c]);
      }
    }
  }

  const slots = Object.entries(colorGroups).map(([color, positions]) => ({
    color: parseInt(color),
    positions
  }));

  return {
    boardData,
    slots,
    rows,
    cols,
    colorCount: charList.length,
    _source: name,
    _charMap: charMap
  };
}

main().catch(console.error);
