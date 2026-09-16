'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const legacyDir = path.join(root, 'cloudfunctions/coopService/legacy-levels');
const legacyManifest = JSON.parse(fs.readFileSync(path.join(legacyDir, 'manifest.json'), 'utf8'));
const legacyLevels = Object.fromEntries(legacyManifest.levels.map(entry => [1000 + entry.levelId,
    JSON.parse(fs.readFileSync(path.join(legacyDir, entry.file), 'utf8'))]));
const source = fs.readFileSync(path.join(root, 'cloudfunctions/coopService/core.js'), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('const entries =');
const end = source.indexOf('module.exports =');
if (start < 0 || end < start) throw new Error('合作核心结构已变化，请更新浏览器适配');
let body = source.slice(start, end);
const replace = (from, to) => {
    if (!body.includes(from)) throw new Error('合作核心适配点缺失: ' + from);
    body = body.replace(from, to);
};
replace("const hash = value => crypto.createHash('sha256').update(value).digest('hex');", "const hash = async value => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');");
replace('const runId = (post, user) => hash(`${post}:${user}`).slice(0, 40);', 'const runId = async (post, user) => (await hash(`${post}:${user}`)).slice(0, 40);');
replace('const userId = user => hash(user).slice(0, 40);', 'const userId = async user => (await hash(user)).slice(0, 40);');
replace('return require(`./levels/coop_level_${id}.json`);', 'return getLevel(id);');
replace("const legacyManifest = require('./legacy-levels/manifest.json');", `const legacyManifest = ${JSON.stringify(legacyManifest)};`);
replace('return require(`./legacy-levels/coop_level_${id - 1000}.json`);', 'return legacyLevels[id];');
replace('function newRun(', 'async function newRun(');
body = body.replace(/\brunId\(/g, 'await runId(').replace(/\buserId\(/g, 'await userId(');
replace('const run = newRun(', 'const run = await newRun(');
replace('run = newRun(', 'run = await newRun(');
replace('const digest = hash(', 'const digest = await hash(');
replace("crypto.randomBytes(12).toString('hex')", "Array.from(globalThis.crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('')");
const output = `// @ts-nocheck
// Generated from cloudfunctions/coopService/core.js by scripts/build-coop-browser-runtime.js.
import { PvpHumanReplay } from './PvpHumanReplay';
import { coopHalfLevel, coopLevelHash, COOP_MAX_ELAPSED_MS, COOP_RULES_VERSION, COOP_LEGACY_RULES_VERSION } from './CoopModeConfig';
export function createBrowserCoopService(store, manifest, getLevel, now = Date.now) {
const legacyLevels = ${JSON.stringify(legacyLevels)};
${body}
return createCoopService(store, now);
}
`;
const target = path.join(root, 'assets/Scripts/Core/CoopBrowserRuntime.ts');
if (process.argv.includes('--check')) {
    if (fs.readFileSync(target, 'utf8') !== output) throw new Error('浏览器合作核心过期，请运行 node scripts/build-coop-browser-runtime.js');
} else fs.writeFileSync(target, output);
