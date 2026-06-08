const fs = require('fs');
const path = require('path');

const RAW_FILE = path.join(__dirname, 'pdd-levels-raw.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'LevelData');
const STARTING_LEVEL = 245;

const raw = JSON.parse(fs.readFileSync(RAW_FILE));

function convertStringLevel(json) {
  const { width, height, data } = json;
  if (!data) return null;

  const lines = data.split('\n');
  const rows = lines.length;
  const cols = Math.max(...lines.map(l => l.length));

  const charSet = new Set();
  for (const line of lines) {
    for (const ch of line) {
      if (ch !== ' ') charSet.add(ch);
    }
  }

  const charList = [...charSet].sort();
  const charMap = {};
  charList.forEach((ch, i) => charMap[ch] = i + 1);

  const correctColorArr = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    const line = lines[r] || '';
    for (let c = 0; c < cols; c++) {
      const ch = c < line.length ? line[c] : ' ';
      row.push(ch === ' ' ? 0 : (charMap[ch] || 0));
    }
    correctColorArr.push(row);
  }

  const colorCount = charList.length;
  const nonZeroCells = correctColorArr.flat().filter(c => c > 0);

  // Generate shuffled starting positions
  const initRandomColorArr = JSON.parse(JSON.stringify(correctColorArr));
  shuffleNonZero(initRandomColorArr);

  return {
    levelId: 0,
    boardWidth: cols,
    boardHeight: rows,
    timeLimit: Math.max(60, Math.min(300, Math.round(nonZeroCells.length * 0.3))),
    slotTotalCount: 48,
    correctColorArr,
    initRandomColorArr
  };
}

function convertMonoBehaviourLevel(json) {
  const board = json.MonoBehaviour?.references?.RefIds?.[0]?.data;
  if (!board || !board._layout) return null;

  const { x: w, y: h } = board._layoutSize;
  const layout = board._layout;

  const correctColorArr = Array.from({ length: h }, () => new Array(w).fill(0));

  for (const block of layout) {
    const { x, y } = block._position;
    const color = block._color;
    if (x >= 0 && x < w && y >= 0 && y < h) {
      correctColorArr[y][x] = color;
    }
  }

  const nonZeroCells = correctColorArr.flat().filter(c => c > 0);

  const initRandomColorArr = JSON.parse(JSON.stringify(correctColorArr));
  shuffleNonZero(initRandomColorArr);

  return {
    levelId: 0,
    boardWidth: w,
    boardHeight: h,
    timeLimit: Math.max(60, Math.min(300, Math.round(nonZeroCells.length * 0.3))),
    slotTotalCount: board._stashSize || 48,
    correctColorArr,
    initRandomColorArr
  };
}

function shuffleNonZero(grid) {
  const positions = [];
  const values = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] > 0) {
        positions.push([r, c]);
        values.push(grid[r][c]);
      }
    }
  }

  // Fisher-Yates shuffle
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }

  // Ensure not identical to solution
  let same = true;
  for (let i = 0; i < positions.length; i++) {
    const [r, c] = positions[i];
    if (grid[r][c] !== values[i]) { same = false; break; }
  }
  if (same && values.length > 1) {
    [values[0], values[1]] = [values[1], values[0]];
  }

  for (let i = 0; i < positions.length; i++) {
    const [r, c] = positions[i];
    grid[r][c] = values[i];
  }
}

let saved = 0;
let skipped = 0;

for (let i = 0; i < raw.length; i++) {
  const entry = raw[i];
  const json = entry.json;
  let converted = null;

  if (json && json.data && typeof json.data === 'string') {
    converted = convertStringLevel(json);
  } else if (json && json.MonoBehaviour) {
    converted = convertMonoBehaviourLevel(json);
  }

  if (converted) {
    const levelNum = STARTING_LEVEL + saved;
    converted.levelId = levelNum;
    const outPath = path.join(OUTPUT_DIR, `level_${levelNum}.json`);
    fs.writeFileSync(outPath, JSON.stringify(converted));
    saved++;
  } else {
    skipped++;
  }
}

console.log(`Converted ${saved} levels (level_${STARTING_LEVEL} to level_${STARTING_LEVEL + saved - 1})`);
console.log(`Skipped ${skipped} entries`);
