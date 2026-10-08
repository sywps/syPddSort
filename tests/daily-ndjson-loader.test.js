const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadNdjsonRecords } = require('../scripts/user-behavior-daily-job');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-ndjson-'));
const file = path.join(dir, 'fixture.ndjson');
try {
  const rows = [{ text: '豆豆'.repeat(200000), value: 1 }, { text: '跨块汉字🙂'.repeat(190000), value: 2 }, { value: 3 }];
  fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\r\n\r\n'));
  assert.deepEqual(loadNdjsonRecords(file), rows);
  fs.writeFileSync(file, '\n\r\n');
  assert.deepEqual(loadNdjsonRecords(file), []);
  fs.writeFileSync(file, '{"ok":true}\n{malformed}\n');
  assert.throws(() => loadNdjsonRecords(file), /Failed to parse NDJSON line 2/);
  fs.writeFileSync(file, '');
  assert.deepEqual(loadNdjsonRecords(file), []);
  console.log('PASS NDJSON chunking, UTF-8, CRLF, empty input, unterminated final row, explicit malformed-row failure.');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
