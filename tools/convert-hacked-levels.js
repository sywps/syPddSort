#!/usr/bin/env node
// Convert levels 1-244 from hacked-level/ format to game level format
const fs = require('fs');
const path = require('path');

const INPUT_DIR = path.join(__dirname, '..', 'hacked-level');
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'RemoteBundle', 'LevelData');

let converted = 0;

for (let levelId = 1; levelId <= 244; levelId++) {
  const inPath = path.join(INPUT_DIR, `level_${levelId}.json`);
  if (!fs.existsSync(inPath)) {
    console.log(`Skipping level ${levelId}: file not found`);
    continue;
  }

  const raw = JSON.parse(fs.readFileSync(inPath, 'utf-8'));
  const targetGrid = raw.target_grid;
  const shuffleGrid = raw.shuffle_grid;
  const h = targetGrid.length;
  const w = targetGrid[0].length;
  const timeLimit = raw.limitTime || 180;

  // Collect unique non-zero color values and remap to 1..N
  const colorSet = new Set();
  for (const row of targetGrid)
    for (const v of row)
      if (v !== 0) colorSet.add(v);

  const sorted = [...colorSet].sort((a, b) => a - b);
  const remap = {};
  sorted.forEach((v, idx) => remap[v] = idx + 1);

  const correctColorArr = targetGrid.map(row =>
    row.map(v => v !== 0 ? remap[v] : 0)
  );

  const initRandomColorArr = shuffleGrid.map(row =>
    row.map(v => v !== 0 ? remap[v] : 0)
  );

  // Count non-zero cells for slot count
  let slotCount = 0;
  for (const row of correctColorArr)
    for (const v of row)
      if (v !== 0) slotCount++;

  const output = {
    levelId,
    boardWidth: w,
    boardHeight: h,
    timeLimit,
    slotTotalCount: slotCount,
    correctColorArr,
    initRandomColorArr,
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, `level_${levelId}.json`), JSON.stringify(output, null, 4) + '\n');
  converted++;
}

console.log(`Converted ${converted} levels from hacked-level/ (1-244)`);
