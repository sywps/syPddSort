const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const audioMgr = fs.readFileSync(
    path.join(root, 'assets/Scripts/Core/AudioMgr.ts'),
    'utf8',
).replace(/\r\n/g, '\n');

assert.ok(!audioMgr.includes("type: 'heavy'"), 'AudioMgr must not request heavy WeChat vibration');
assert.ok(!audioMgr.includes("type: 'medium'"), 'AudioMgr must not request medium WeChat vibration');
assert.strictEqual(
    (audioMgr.match(/wx\.vibrateShort\(\{ type: 'light' \}\);/g) || []).length,
    2,
    'both WeChat vibration paths must explicitly request light strength',
);
assert.ok(!audioMgr.includes('wx.vibrateShort({});'), 'WeChat vibration must not fall back to an untyped strength');
assert.ok(
    audioMgr.includes('navigator.vibrate(Math.min(ms, 12));'),
    'legacy Web vibration must be capped at the light 12ms duration',
);
assert.ok(
    audioMgr.includes('navigator.vibrate(12);'),
    'shared Web vibration must use the light 12ms duration',
);
assert.strictEqual(
    (audioMgr.match(/w\.tt\.vibrateShort\(\{\}\);/g) || []).length,
    2,
    'ByteDance must retain its supported short-vibration call shape',
);

console.log('audio vibration profile tests passed');
