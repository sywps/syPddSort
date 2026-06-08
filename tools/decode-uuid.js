// Cocos Creator compressed UUID decoder
// Based on cocos2d/core/utils/decode-uuid.js

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const Base64Values = new Array(128).fill(-1);
for (let i = 0; i < BASE64_CHARS.length; i++) {
  Base64Values[BASE64_CHARS.charCodeAt(i)] = i;
}

const HexChars = '0123456789abcdef'.split('');

function decodeUuid(base64) {
  if (base64.length !== 22) {
    // Already a full UUID or other format
    return base64;
  }

  const _t = ['', '', '', ''];
  const UuidTemplate = [].concat(_t, _t, ['-'], _t, ['-'], _t, ['-'], _t, ['-'], _t, _t, _t);
  const Indices = UuidTemplate.map((x, i) => x === '-' ? NaN : i).filter(isFinite);

  // First 2 chars are directly hex
  UuidTemplate[Indices[0]] = base64[0];
  UuidTemplate[Indices[1]] = base64[1];

  // Remaining 20 base64 chars → 30 hex chars (pairs of base64 → 3 hex each)
  for (let i = 2, j = 2; i < 22; i += 2) {
    const lhs = Base64Values[base64.charCodeAt(i)];
    const rhs = Base64Values[base64.charCodeAt(i + 1)];
    UuidTemplate[Indices[j++]] = HexChars[lhs >> 2];
    UuidTemplate[Indices[j++]] = HexChars[((lhs & 3) << 2) | rhs >> 4];
    UuidTemplate[Indices[j++]] = HexChars[rhs & 0xF];
  }

  return UuidTemplate.join('');
}

// Test with known mapping
const test = decodeUuid('b892abUehCfY46UWwejIUy');
console.log('Test decode:', test);
console.log('Expected:   b8f7669b-51e8-427d-8e3a-516c1e8c8532');
console.log('Match:', test === 'b8f7669b-51e8-427d-8e3a-516c1e8c8532');

module.exports = { decodeUuid };
