// Shared report routing. A level number is never evidence of a gameplay mode.
const REPORT_MODES = { main: '正式主线关卡', theme: '主题／像素拼图', external: '外部关卡', coop: '合作玩法', pvp: 'PvP 玩法', unknown: '归属未知／公共事件' };
function reportGameplayMode(record) {
  const values = [record?.gameplayEntryMode, record?.extra?.gameplayEntryMode, record?.extra?.entryMode]
    .filter(v => typeof v === 'string' && v.trim()).map(v => v.trim());
  if (new Set(values).size > 1) return 'unknown';
  const value = values[0];
  if (value) return Object.hasOwn(REPORT_MODES, value) ? value : 'unknown';
  // Only explicitly named legacy lifecycle pages can be recovered safely.
  if (['enter_level', 'level_pass', 'level_fail', 'level_exit'].includes(record?.eventName) && record?.page === 'theme_level') return 'theme';
  return 'unknown';
}
module.exports = { REPORT_MODES, reportGameplayMode };
