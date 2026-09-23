const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const ts = require('typescript');
test('generated client and server use the single project catalog and retain 300 gold prices', () => {
 const source = require('../config/profile-art-source/catalog.json');
 const server = require('../cloudfunctions/updateUserProfileAssets/profile-catalog.json');
 const box = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync('assets/Scripts/Core/ProfileCustomizationConfig.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
 new Function('exports', code)(box.exports);
 assert.deepEqual(box.exports.PROFILE_ITEMS, server);
 assert.deepEqual(server.map(({id,kind,name,unlock,value,activityKey})=>({id,kind,name,unlock,value,activityKey})),source.items.map(({source,...row})=>row));
 assert.deepEqual(box.exports.RETIRED_PROFILE_ITEMS, source.retired);
 assert(server.filter(row=>row.unlock==='gold').every(row=>row.value===300));
});
