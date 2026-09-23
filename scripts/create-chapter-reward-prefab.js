const fs = require('fs'), crypto = require('crypto'), { PNG } = require('pngjs');
const path = 'assets/GameAssetsBundle/UI/Prefabs/Panels/WinPanel.prefab';
let source = fs.readFileSync(path, 'utf8');
const a = JSON.parse(source), count = a.length;
const fmt = o => JSON.stringify(o, null, 2).split('\n').map(l => '  ' + l).join('\n');
const find = name => a.findIndex(o => o.__type__ === 'cc.Node' && o._name === name);
if (find('ChapterRewards') >= 0) throw Error('Chapter rewards already exist; edit the prefab instead');
const originals = new Map();
function change(i, fn) { if (i < count && !originals.has(i)) originals.set(i, fmt(a[i])); fn(a[i]); }
const imageMeta = JSON.parse(fs.readFileSync('assets/GameAssetsBundle/Textures/UI/win_home_button.png.meta'));
function copyArt(from, name) {
    const dest = `assets/GameAssetsBundle/Textures/UI/${name}.png`;
    if (fs.existsSync(dest)) throw Error('Asset exists: ' + dest);
    const bytes = fs.readFileSync(from), { width: w, height: h } = PNG.sync.read(bytes);
    const uuid = crypto.randomUUID(), m = JSON.parse(JSON.stringify(imageMeta).replaceAll(imageMeta.uuid, uuid).replaceAll('win_home_button', name));
    const u = m.subMetas.f9941.userData;
    Object.assign(u, { width: w, height: h, rawWidth: w, rawHeight: h, trimType: 'none', trimX: 0, trimY: 0, offsetX: 0, offsetY: 0 });
    Object.assign(u.vertices, { rawPosition: [-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0], uv: [0,h,w,h,0,0,w,0], nuv: [0,0,1,0,0,1,1,1], minPos: [-w/2,-h/2,0], maxPos: [w/2,h/2,0] });
    fs.writeFileSync(dest, bytes); fs.writeFileSync(dest + '.meta', JSON.stringify(m,null,2)+'\n');
    return uuid+'@f9941';
}
const art = {};
for (const name of ['tz_jd1','tz_jd2','tz_libao','tz_libao2']) art[name] = copyArt(`temp/rotating-beads-win-streak/assets/png__game__${name}.png`, 'chapter_'+name);
for (const name of ['brush','magnet']) art[name] = copyArt(`assets/BootstrapBundle/GameUI/Atlases/GameSceneSmall/popup_tool_${name}_icon.png`, 'chapter_'+name);
function node(name,parent,x,y,w,h,type,asset,text,size=24) {
    const template = a[find(type==='label'?'AdBonusBtnLbl':'RewardCoinIcon')];
    const id=a.length, n=structuredClone(template);n._name=name;n._parent={__id__:parent};n._children=[];n._components=[];n._active=true;n._lpos={__type__:'cc.Vec3',x,y,z:0};n._lscale={__type__:'cc.Vec3',x:1,y:1,z:1};a.push(n);
    const ui=structuredClone(a[template._components.find(c=>a[c.__id__].__type__==='cc.UITransform').__id__]);
    ui.node={__id__:id};ui._contentSize.width=w;ui._contentSize.height=h;
    function component(c) { const idx=a.length;c.__prefab={__id__:idx+1};a.push(c,{__type__:'cc.CompPrefabInfo',fileId:crypto.randomUUID()});n._components.push({__id__:idx}); }
    component(ui);
    if(type){const c=structuredClone(a[template._components.find(c=>a[c.__id__].__type__===(type==='label'?'cc.Label':'cc.Sprite')).__id__]);c.node={__id__:id};if(type==='label'){c._string=text;c._fontSize=size;c._actualFontSize=size;c._lineHeight=size+8;c._color={__type__:'cc.Color',r:255,g:255,b:255,a:255};c._overflow=2;}else c._spriteFrame.__uuid__=asset;component(c);}
    n._prefab={__id__:a.length};a.push({__type__:'cc.PrefabInfo',root:{__id__:1},asset:{__id__:0},fileId:crypto.randomUUID(),instance:null,targetOverrides:null,nestedPrefabInstanceRoots:null});
    change(parent,p=>p._children.push({__id__:id}));return id;
}
const bottom=find('BottomGroup');
for(const name of ['ShareBonusBtn','PrimaryBtn'])change(find(name),n=>n._lpos.y=-145);
const group=node('ChapterRewards',bottom,0,22,600,165);
node('ChapterTitle',group,0,66,580,34,'label',null,'第 1 章 · 0/9',24);
node('Track',group,0,7,500,18,'sprite',art.tz_jd1);
const fill=node('Fill',group,-250,7,0,14,'sprite',art.tz_jd2);a[a[fill]._components[0].__id__]._anchorPoint.x=0;
for(const [name,x,text]of [['Milestone4',-28,'4关：金币×25 + 清除×1'],['Milestone9',250,'9关：头像']]){
    const gift=node(name,group,x,15,50,56,'sprite',art.tz_libao);
    const open=node('Opened',gift,0,0,50,56,'sprite',art.tz_libao2);a[open]._active=false;
}
node('Reward4Label',group,-130,-39,310,32,'label',null,'4关：金币×25 + 清除×1',19);
node('Reward9Label',group,175,-39,240,32,'label',null,'9关：头像',19);
node('Status',group,0,-76,580,28,'label',null,'',19);
const overlay=node('ChapterRewardOverlay',1,0,0,720,1280);a[overlay]._active=false;
// Reuse the existing dimming sprite; no reward backing panel.
const shade=a[find('Shade')]._components.map(c=>a[c.__id__]).find(c=>c.__type__==='cc.Sprite');
const shadeId=node('Shade',overlay,0,0,1800,2400,'sprite',shade._spriteFrame.__uuid__);
const shadeSprite=a[a[shadeId]._components.find(c=>a[c.__id__].__type__==='cc.Sprite').__id__];shadeSprite._color={__type__:'cc.Color',r:0,g:0,b:0,a:185};
node('Title',overlay,0,250,600,60,'label',null,'章节奖励',42);
node('Glow',overlay,0,30,600,600,'sprite','be42d22d-0aeb-4a3c-a253-2d2ae53c05cd@f9941');
const coin=a[find('RewardGoldIcon')]._components.map(c=>a[c.__id__]).find(c=>c.__type__==='cc.Sprite')._spriteFrame.__uuid__;
for(let i=0;i<3;i++){const slot=node('Reward'+i,overlay,(i-1)*155,30,130,170);node('Icon',slot,0,25,100,100,'sprite',[coin,art.brush,art.magnet][i]);node('Count',slot,0,-55,140,42,'label',null,'×1',28);}
node('Detail',overlay,0,-125,600,48,'label',null,'点击任意空白处关闭',24);
const confirm=node('Confirm',overlay,0,-255,280,108,'sprite',a[find('ShareBonusBtn')]._components.map(c=>a[c.__id__]).find(c=>c.__type__==='cc.Sprite')._spriteFrame.__uuid__);
node('Label',confirm,0,2,220,50,'label',null,'确定',36);
for(const[i,before]of originals){if(!source.includes(before))throw Error('Serialization mismatch '+i);source=source.replace(before,fmt(a[i]));}
source=source.trimEnd().slice(0,-1).trimEnd()+',\n'+a.slice(count).map(fmt).join(',\n')+'\n]\n';JSON.parse(source);fs.writeFileSync(path,source);
console.log('Chapter reward prefab and six local sprites created');
