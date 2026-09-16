const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../tools/cloudbase-report.html'), 'utf8');
const extract = (name) => {
    const match = html.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
    assert.ok(match, `Missing ${name}`);
    return match[0];
};
const context = { URLSearchParams, window: { location: { search: '' } } };
vm.createContext(context);
vm.runInContext(`${extract('getParamDate')}\n${extract('isCalendarDate')}`, context);
for (const [query, expected] of [
    ['?date=2026-09-4', '2026-09-04'],
    ['?date=2026-9-4', '2026-09-04'],
    ['?date=2026-09-04', '2026-09-04'],
    ['?date=2024-2-29', '2024-02-29'],
    ['?date=2026-2-29', '2026-2-29'],
    ['?date=2026-13-1', '2026-13-1'],
    ['?date=invalid', 'invalid'],
    ['', ''],
]) {
    context.window.location.search = query;
    assert.equal(vm.runInContext('getParamDate()', context), expected);
}
console.log('cloudbase-report-date-param.test.js passed');
