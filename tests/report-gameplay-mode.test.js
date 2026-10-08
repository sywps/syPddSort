const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REPORT_MODES, reportGameplayMode } = require('../scripts/report-gameplay-mode');
for (const mode of Object.keys(REPORT_MODES)) assert.equal(reportGameplayMode({ gameplayEntryMode: mode }), mode);
assert.equal(reportGameplayMode({ levelId: 1 }), 'unknown');
assert.equal(reportGameplayMode({ gameplayEntryMode: 'new_mode' }), 'unknown');
assert.equal(reportGameplayMode({ gameplayEntryMode: 'main', extra: { entryMode: 'theme' } }), 'unknown');
assert.equal(reportGameplayMode({ extra: { gameplayEntryMode: 'theme' } }), 'theme');
assert.equal(reportGameplayMode({ eventName: 'enter_level', page: 'theme_level' }), 'theme');
assert.equal(reportGameplayMode({ eventName: 'ad_show', page: 'theme_level' }), 'unknown');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-mode-'));
try {
  const date = '2026-09-30', envId = 'fixture';
  const rows = [];
  for (const mode of Object.keys(REPORT_MODES)) for (const eventName of ['enter_level', 'ad_click', 'ad_show', 'ad_finish', 'revive_panel_show']) {
    rows.push({ openid: `fixture-${mode}`, eventName, gameplayEntryMode: mode === 'unknown' ? '' : mode, levelId: 1, page: 'pch_buffer_full_revive', timestamp: Date.parse(`${date}T01:00:00+08:00`) });
  }
  const collections = {};
  for (const name of ['user_behavior', 'level_record', 'first_level_funnel', 'ad_stat', 'daily_stat']) {
    const dir = path.join(root, name); fs.mkdirSync(dir);
    const localPath = path.join(dir, `database_export-fixture-${name}-${date}.json`);
    fs.writeFileSync(localPath, name === 'user_behavior' ? rows.map(r => JSON.stringify(r)).join('\n') : '');
    collections[name] = { exportInfo: { localPath, totalRecords: name === 'user_behavior' ? rows.length : 0 } };
  }
  fs.writeFileSync(path.join(root, 'combined_summary.json'), JSON.stringify({ date, envId, collections }));
  const run = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/user-behavior-daily-job.js'), '--date', date, '--reuse-existing', '--out-dir', root], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr);
  const index = JSON.parse(fs.readFileSync(path.join(root, 'mode_index.json')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'combined_summary.json'))).reportMode, 'main');
  assert.equal(Object.values(index.modes).reduce((n,m) => n + m.counts.user_behavior, 0), rows.length);
  for (const mode of Object.keys(REPORT_MODES)) {
    const s = JSON.parse(fs.readFileSync(path.join(root, 'modes', mode, 'combined_summary.json')));
    assert.equal(s.reportMode, mode);
    assert.equal(s.collections.user_behavior.summary.uniqueUsers, 1);
    assert.equal(s.dailyDiagnosis.reviveAdFunnel[0].showNum, 1);
    assert.equal(s.effectiveAdStat.totalShowNum, 1);
    assert.equal(s.dailyDiagnosis.first20Levels[0].enterUv, 1);
    assert.equal(s.scopedEventCounts.user_behavior.ad_show, 1);
  }
  console.log('Mode isolation: classifier, raw reconciliation, lifecycle, revive, ads, scoped outputs passed.');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
