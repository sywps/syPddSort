const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),ts=require('typescript');
test('main domain caches local files, retries expired files and failed downloads',async()=>{
 const source=fs.readFileSync('assets/Scripts/Core/GameCtrlModules/FriendRankModule.ts','utf8');
 const section=source.slice(source.indexOf('const friendProfileFiles'),source.indexOf('function requireFriendRankNode'));
 const js=ts.transpileModule(section,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 const load=new Function(js+';return downloadFriendProfileArt')();
 let count=0, fail=false;const valid=new Set();
 const wx={getFileSystemManager:()=>({accessSync(p){if(!valid.has(p))throw Error('missing')}}),downloadFile(o){count++;if(fail)return o.fail(Error('offline'));const p='wxfile://tmp/'+count;valid.add(p);o.success({statusCode:200,tempFilePath:p})}};
 const snap={baseUrl:'https://example/',manifest:{items:[{id:1,asset:'a.png'}]}};
 const first=await load(wx,snap);assert.equal(first['https://example/a.png'],'wxfile://tmp/1');
 await load(wx,snap);assert.equal(count,1);valid.clear();await load(wx,snap);assert.equal(count,2);
 valid.clear();fail=true;assert.deepEqual(await load(wx,snap),{});fail=false;assert(Object.keys(await load(wx,snap)).length===1);assert.equal(count,4);
});
test('open data routes custom CDN through main-domain file mapping',()=>{
 const source=fs.readFileSync('openDataContext/index.js','utf8');
 const start=source.indexOf('    if (/^https:');
 const end=source.indexOf("    if (typeof wx.downloadFile",start);
 assert(start>=0&&end>start);
 const route=source.slice(start,end);let received='';
 const run=new Function('url','profileLocalFiles','finalizeAvatarLoad','clearTimeout','timeout','console','processAvatarQueue','let isDownloading=true;'+route);
 const url='https://game-pdd-v2.oss-cn-beijing.aliyuncs.com/syGame/pdd_v2/remote_wechat/profile/2001.png';
 run(url,{[url]:'wxfile://tmp/frame'},s=>received=s,()=>{},0,console,()=>{});
 assert.equal(received,'wxfile://tmp/frame');received='';
 run(url,{},s=>received=s,()=>{},0,{warn(){}},()=>{});assert.equal(received,'');
});
