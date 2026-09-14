'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process'),assert=require('node:assert/strict');
const {resolveWechatCdnSlot}=require('./wechat-cdn-slot-config');
const root=path.resolve(__dirname,'..');
const args=process.argv.slice(2),apply=args.includes('--apply');
const backupFlag=args.indexOf('--backup');
assert(backupFlag>=0 && args[backupFlag+1], 'Provide --backup <verified online snapshot directory>');
assert(args.every((arg,i)=>arg==='--apply'||arg==='--backup'||i===backupFlag+1),'Unknown arguments');
const backup=path.resolve(args[backupFlag+1]);
const baseline=JSON.parse(fs.readFileSync(path.join(backup,'level_live.json')));
assert.equal(baseline.cdnSlot,'A');
const target=resolveWechatCdnSlot('A');
const out=path.join(root,'build/coop-variety-cdn');fs.mkdirSync(path.join(out,'level_packs'),{recursive:true});
const source=path.join(root,'tools/generated_levels/coop-variety-10');
const entries=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'))).levels;
const validation=JSON.parse(fs.readFileSync(path.join(source,'validation.json')));
assert.equal(validation.passed,true);assert.equal(validation.levels.length,10);
const {coopLevelHash}=require('../cloudfunctions/coopService/runtime/CoopModeConfig');
const levels=entries.map(entry=>{
    const raw=fs.readFileSync(path.join(root,'assets/LevelData',entry.file));
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),entry.sha256);
    const data=JSON.parse(raw);
    assert.equal(validation.levels.find(v=>v.levelId===entry.levelId)?.hash,coopLevelHash(data),'Validation is stale');
    assert(data.coopRegions && entry.beanCount>1000);
    return {levelId:entry.levelId,prefix:'coop_level_',data};
});
assert.deepEqual(levels.map(e=>e.levelId),[11,12,13,14,15,16,17,18,19,20]);
assert(!baseline.packs.some(p=>(p.levelKeys||[]).some(k=>levels.some(l=>k==='coop_level_'+l.levelId))),'New IDs already published: inspect current deployment before replacing');
const payload={packVersion:1,id:'coop_0011_0020',kind:'coop',prefix:'coop_level_',schemaVersion:3,levelRange:[11,20],levelCount:10,levels};
const hash=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const text=JSON.stringify({...payload,dataVersion:hash.slice(0,16)},null,2)+'\n';
const url=`level_packs/coop_0011_0020.${hash.slice(0,16)}.json`;
const pack={id:payload.id,kind:'coop',prefix:'coop_level_',url,hash,bytes:Buffer.byteLength(text),levelRange:[11,20],levelCount:10,
    levels:levels.map(l=>l.levelId),levelKeys:levels.map(l=>'coop_level_'+l.levelId)};
const version=crypto.createHash('sha256').update(JSON.stringify([baseline.dataVersion,hash])).digest('hex').slice(0,16);
const manifest={...baseline,dataVersion:version,levelDataVersion:version,generatedAt:new Date().toISOString(),
    levelCount:baseline.levelCount+10,levelCounts:{...baseline.levelCounts,coop_level_:baseline.levelCounts.coop_level_+10},packs:[...baseline.packs,pack]};
assert.deepEqual(manifest.packs.slice(0,-1),baseline.packs,'Existing pack references must remain unchanged');
function writeChunks(file,text){const lines=text.match(/[^\n]*(?:\n|$)/g).filter(Boolean);fs.writeFileSync(file,lines.slice(0,300).join(''));for(let i=300;i<lines.length;i+=300)fs.appendFileSync(file,lines.slice(i,i+300).join(''));}
writeChunks(path.join(out,url),text);writeChunks(path.join(out,'level_live.json'),JSON.stringify(manifest,null,2)+'\n');
function remote(relative){return JSON.parse(cp.execFileSync('curl',['-fLsS','--max-time','40',target.levelDataCdnUrl+relative+'?t='+Date.now()],{maxBuffer:12*1024*1024}).toString());}
if(apply){
    const before=remote('level_live.json');
    assert.equal(before.dataVersion,baseline.dataVersion,'Online changed after backup; refusing to overwrite');
    assert.deepEqual(before.packs,baseline.packs,'Online packs changed after backup');
    const upload=(local,remotePath)=>cp.execFileSync(process.env.PDD_OSSUTIL_BIN||'ossutil',['cp','--acl','public-read','--force','--endpoint','https://oss-cn-beijing.aliyuncs.com',local,'oss://game-pdd-v2/'+target.levelDataOssPath+remotePath],{stdio:'inherit'});
    upload(path.join(out,url),url);
    const readPack=remote(url);delete readPack.dataVersion;
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(readPack)).digest('hex'),hash,'Uploaded pack checksum mismatch');
    assert.equal(remote('level_live.json').dataVersion,baseline.dataVersion,'Online changed during pack upload');
    upload(path.join(out,'level_live.json'),'level_live.json');
    const after=remote('level_live.json');
    assert.equal(after.dataVersion,version);assert.deepEqual(after.packs,manifest.packs);
    writeChunks(path.join(out,'remote-verified.json'),JSON.stringify(after,null,2)+'\n');
}
console.log(JSON.stringify({published:apply,slot:'A',previousVersion:baseline.dataVersion,version,added:10,total:manifest.levelCount,unchangedPacks:baseline.packs.length,url}));
