const fs = require('fs');
const path = require('path');

const INPUT_DIR = path.join(__dirname, '..', 'hacked-level');
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'RemoteBundle', 'LevelData');

let converted = 0;

for (let i = 1; i <= 244; i++) {
  const inPath = path.join(INPUT_DIR, `level_${i}.json`);
  if (!fs.existsSync(inPath)) continue;

  const raw = JSON.parse(fs.readFileSync(inPath));
  const targetGrid = raw.target_grid;
  const shuffleGrid = raw.shuffle_grid;
  const rows = targetGrid.length;
  const cols = targetGrid[0].length;

  // Collect unique non-zero color IDs and remap to 1..N
  const colorIds = new Set();
  for (const row of targetGrid)
    for (const v of row)
      if (v > 0) colorIds.add(v);

  const sorted = [...colorIds].sort((a, b) => a - b);
  const remap = {};
  sorted.forEach((id, idx) => remap[id] = idx + 1);

  const correctColorArr = targetGrid.map(row =>
    row.map(v => v > 0 ? remap[v] : 0)
  );

  const initRandomColorArr = shuffleGrid.map(row =>
    row.map(v => v > 0 ? remap[v] : 0)
  );

  const output = {
    levelId: i,
    boardWidth: cols,
    boardHeight: rows,
    timeLimit: raw.limitTime || 180,
    slotTotalCount: 48,
    correctColorArr,
    initRandomColorArr,
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, `level_${i}.json`), JSON.stringify(output));
  converted++;
}

console.log(`Regenerated ${converted} levels (1-244)`);
