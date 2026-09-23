// Deterministic editor-owned layout, reusing this project's popup art.
const fs = require('fs');
const crypto = require('crypto');
const clone = x => JSON.parse(JSON.stringify(x));
const source = JSON.parse(fs.readFileSync('assets/GameAssetsBundle/UI/Prefabs/Panels/FeedbackPanel.prefab'));
const template = name => source.find(n => n.__type__ === 'cc.Node' && n._name === name);
const component = (n, type) => source[n._components.find(r => source[r.__id__].__type__ === type).__id__];
const meta = (path, importer, ver) => { if (!fs.existsSync(path + '.meta')) fs.writeFileSync(path + '.meta', JSON.stringify({ ver, importer, imported: true, uuid: crypto.randomUUID(), files: importer === 'prefab' ? ['.json'] : [], subMetas: {}, userData: {} }, null, 2)); };
const items = JSON.parse(fs.readFileSync('config/profile-assets/manifest.json')).items;
const dir = 'assets/HomeAssetsBundle/GameUI/Profile';
const referenceDir = 'assets/GameAssetsBundle/Textures/UI/ProfileReference';
meta(referenceDir, 'directory', '1.2.0');
fs.mkdirSync(dir, { recursive: true }); meta(dir, 'directory', '1.2.0');
for (const id of [1001, 2001]) {
  const row = items.find(r => r.id === id), file = `${dir}/${id}.png`;
  fs.copyFileSync(`config/profile-assets/${row.asset}`, file);
  {
    const exists=fs.existsSync(file+'.meta');
    const m = JSON.parse(fs.readFileSync(exists?file+'.meta':'assets/HomeAssetsBundle/GameUI/home_settings_icon.png.meta'));
    const uuid = exists?m.uuid:crypto.randomUUID(), old = m.uuid;
    const out = JSON.parse(JSON.stringify(m).split(old).join(uuid).split('home_settings_icon').join(String(id)));
    const u = out.subMetas.f9941.userData;
    Object.assign(u, { offsetX: 0, offsetY: 0, trimX: 0, trimY: 0, width: row.width, height: row.height, rawWidth: row.width, rawHeight: row.height, trimType: 'none' });
    delete u.vertices;
    fs.writeFileSync(file + '.meta', JSON.stringify(out, null, 2));
  }
}
// Ranking fallback art must use the same default pair, including the open-data worker.
for(const [id,name] of [[1001,'leaderboard_avatar_default'],[2001,'leaderboard_avatar_frame']]) {
  const row=items.find(x=>x.id===id);
  for(const base of ['openDataContext/ranking','assets/GameAssetsBundle/Textures/UI/Atlases/LeaderboardV2']) {
    const file=`${base}/${name}.png`;fs.copyFileSync(`config/profile-assets/${row.asset}`,file);
    if(fs.existsSync(file+'.meta')) { const m=JSON.parse(fs.readFileSync(file+'.meta'));Object.assign(m.subMetas.f9941.userData,{width:row.width,height:row.height,rawWidth:row.width,rawHeight:row.height,trimType:'none',offsetX:0,offsetY:0,trimX:0,trimY:0});delete m.subMetas.f9941.userData.vertices;fs.writeFileSync(file+'.meta',JSON.stringify(m,null,2)); }
  }
}
// Editor/browser mirror in the existing bundle stripped by formal mini-game builds.
const previewDir='assets/LevelData/ProfilePreview';
fs.mkdirSync(previewDir,{recursive:true}); meta(previewDir,'directory','1.2.0');
for(const row of items) {
  const file=`${previewDir}/${row.id}.png`;
  fs.copyFileSync(`config/profile-assets/${row.asset}`,file);
  {
    const exists=fs.existsSync(file+'.meta');
    const m=JSON.parse(fs.readFileSync(exists?file+'.meta':`${dir}/${row.kind==='avatar'?1001:2001}.png.meta`));
    const old=m.uuid,out=JSON.parse(JSON.stringify(m).split(old).join(exists?old:crypto.randomUUID()));
    Object.assign(out.subMetas.f9941.userData,{width:row.width,height:row.height,rawWidth:row.width,rawHeight:row.height,trimType:'none',offsetX:0,offsetY:0,trimX:0,trimY:0});
    delete out.subMetas.f9941.userData.vertices;
    fs.writeFileSync(file+'.meta',JSON.stringify(out,null,2));
  }
}
// Artwork-only updates preserve any editor-owned prefab layout changes.
// The shared ranking subtree also supplies PVP/coop avatars and offline defaults.
const rankingPath = 'assets/GameAssetsBundle/UI/Prefabs/Panels/LeaderboardPanel.prefab';
const ranking = JSON.parse(fs.readFileSync(rankingPath));
const defaultGeometry = require('../openDataContext/profile-frames')[2001];
for (const node of ranking.filter(n => n.__type__ === 'cc.Node')) {
  const children = node._children.map(r => ranking[r.__id__]);
  const mask = children.find(n => n._name === 'AvatarMask'), frame = children.find(n => n._name === 'AvatarFrame');
  if (!mask || !frame) continue;
  const comp = (n, type) => n._components.map(r => ranking[r.__id__]).find(c => c.__type__ === type);
  const g = defaultGeometry, b = g.bounds, scale = comp(frame, 'cc.UITransform')._contentSize.width / g.width;
  const side = Math.min(b[2] - b[0], b[3] - b[1]) * scale;
  comp(mask, 'cc.Mask')._type = 0; // GRAPHICS_RECT
  mask._lpos.x = frame._lpos.x + ((b[0] + b[2]) / 2 - g.width / 2) * scale;
  mask._lpos.y = frame._lpos.y + (g.height / 2 - (b[1] + b[3]) / 2) * scale;
  for (const child of [mask, ...mask._children.map(r => ranking[r.__id__])]) {
    if (!['AvatarMask', 'AvatarDefault', 'AvatarSpriteNode'].includes(child._name)) continue;
    Object.assign(comp(child, 'cc.UITransform')._contentSize, { width: side, height: side });
  }
}
fs.writeFileSync(rankingPath, JSON.stringify(ranking, null, 2));
if (process.argv.includes('--assets-only')) process.exit(0);
// ProfilePanel is editor-owned. Never regenerate a hand-edited layout during an art update.
if (fs.existsSync('assets/GameAssetsBundle/UI/Prefabs/Panels/ProfilePanel.prefab')) {
  console.log('Updated artwork; preserved editor-owned ProfilePanel prefab');
  process.exit(0);
}
function build(name, nickname) {
  const a = [clone(source[0])]; a[0]._name = name;
  function add(parent, name, from, x, y, width, height, types) {
    const t = template(from), n = clone(t), idx = a.length;
    Object.assign(n, { _name: name, _parent: parent == null ? null : { __id__: parent }, _children: [], _components: [], _prefab: null, _active: true, _id: '' });
    n._lpos = { __type__: 'cc.Vec3', x, y, z: 0 }; a.push(n);
    if (parent != null) a[parent]._children.push({ __id__: idx });
    for (const type of types || t._components.map(r => source[r.__id__].__type__)) {
      const c = clone(component(t, type)); c.node = { __id__: idx }; c.__prefab = null; c._id = '';
      if (type === 'cc.UITransform') c._contentSize = { __type__: 'cc.Size', width, height };
      if (type === 'cc.Button') { c._target = { __id__: idx }; c.clickEvents = []; }
      if (type === 'cc.Label') { c._string = name; c._fontSize = 24; c._lineHeight = 30; c._horizontalAlign = 1; c._verticalAlign = 1; c._color={__type__:'cc.Color',r:77,g:58,b:75,a:255}; }
      a[idx]._components.push({ __id__: a.length }); a.push(c);
    }
    return idx;
  }
  const comp = (i, type) => a[a[i]._components.find(r => a[r.__id__].__type__ === type).__id__];
  const art = (i, path) => { const s=comp(i,'cc.Sprite'); s._spriteFrame={__uuid__:JSON.parse(fs.readFileSync(path+'.meta')).uuid+'@f9941',__expectedType__:'cc.SpriteFrame'}; s._sizeMode=0; s._type=0; };
  const label = (p,n,x,y,w=400,h=36,text=n) => { const i=add(p,n,'Status',x,y,w,h); comp(i,'cc.Label')._string=text; return i; };
  const rich = (p,n,x,y,w,h,text,size) => {
    const i=add(p,n,'Box',x,y,w,h,['cc.UITransform']);
    a[i]._components.push({__id__:a.length});
    a.push({__type__:'cc.RichText',_name:'',_objFlags:0,node:{__id__:i},_enabled:true,__prefab:null,_id:'',_string:text,_horizontalAlign:1,_verticalAlign:1,_fontSize:size,_lineHeight:size+8,_maxWidth:w,_fontFamily:'Arial',_font:null,_isSystemFontUsed:true,_fontColor:{__type__:'cc.Color',r:148,g:80,b:43,a:255},_handleTouchEvent:false});
    return i;
  };
  const button = (p,n,x,y,w,h,text) => { const i=add(p,n,'Submit',x,y,w,h); const l=label(i,'Caption',0,0,w-8,h,text); comp(l,'cc.Label')._fontSize=26; comp(l,'cc.Label')._isBold=true; return i; };
  const root = add(null,name,'FeedbackPanel',0,0,720,1280);
  add(root,'Shade','Shade',0,0,720,1280);
  const box=add(root,'Box','Box',0,0,580,nickname?440:1000);
  if (!nickname) a[box]._lscale={__type__:'cc.Vec3',x:1.06,y:1.06,z:1};
  const background=add(box,'SettingsFrame','SettingsFrame',0,0,580,nickname?440:1000);
  if(!nickname) {
    // Keep the supplied bitmap intact; scale the fixed nine-slice borders uniformly.
    const panelArt='assets/GameAssetsBundle/Textures/UI/profile_panel_aqua_v2.png';
    const nativeWidth=JSON.parse(fs.readFileSync(panelArt+'.meta')).subMetas.f9941.userData.width;
    const scale=580/nativeWidth;
    art(background,panelArt); comp(background,'cc.Sprite')._type=1;
    comp(background,'cc.UITransform')._contentSize={__type__:'cc.Size',width:nativeWidth,height:1000/scale};
    a[background]._lscale={__type__:'cc.Vec3',x:scale,y:scale,z:1};
  }
  const title=label(box,'Title',0,nickname?170:450,400,44,nickname?'修改昵称':'个人信息'); comp(title,'cc.Label')._fontSize=34; comp(title,'cc.Label')._isBold=true;
  add(box,'XBtn','XBtn',245,nickname?175:450,64,64);
  if (nickname) {
    add(box,'InputBackground','InputBackground',0,25,430,70);
    const input=add(box,'Input','Input',0,25,430,70);
    const text=label(input,'Text',0,0,410,60,''), placeholder=label(input,'Placeholder',0,0,410,60,'请输入昵称');
    for (const id of [text, placeholder]) {
      comp(id,'cc.UITransform')._anchorPoint={__type__:'cc.Vec2',x:0,y:1};
      comp(id,'cc.Label')._horizontalAlign=0; comp(id,'cc.Label')._verticalAlign=1; comp(id,'cc.Label')._enableWrapText=false;
    }
    const edit=comp(input,'cc.EditBox');
    Object.assign(edit, { _textLabel: { __id__: a[text]._components.find(r=>a[r.__id__].__type__==='cc.Label').__id__ }, _placeholderLabel: { __id__: a[placeholder]._components.find(r=>a[r.__id__].__type__==='cc.Label').__id__ }, _maxLength:24, _string:'', _inputMode:6 });
    label(box,'Status',0,-55,490,50,''); button(box,'Save',0,-140,230,70,'保存');
  } else {
    const avatar=add(box,'Avatar','InputBackground',-160,310,100,100); comp(avatar,'cc.Sprite')._spriteFrame={__uuid__:JSON.parse(fs.readFileSync(`${dir}/1001.png.meta`)).uuid+'@f9941',__expectedType__:'cc.SpriteFrame'};
    const frame=add(box,'Frame','InputBackground',-160,310,190,176); comp(frame,'cc.Sprite')._spriteFrame={__uuid__:JSON.parse(fs.readFileSync(`${dir}/2001.png.meta`)).uuid+'@f9941',__expectedType__:'cc.SpriteFrame'};
    comp(title,'cc.Label')._fontSize=42; comp(title,'cc.Label')._lineHeight=50; comp(title,'cc.UITransform')._contentSize.height=52;
    const nick=label(box,'Nickname',65,332,300,44,'我的昵称'); comp(nick,'cc.Label')._fontSize=30;comp(nick,'cc.Label')._isBold=true;
    rich(box,'Cleared',65,286,300,42,'<b>已通关 <color=#45b72b>0</color> 关</b>',30);
    for(const [n,x,t] of [['AvatarTab',-130,'头像'],['FrameTab',130,'头像框']]) {
      const tab=button(box,n,x,200,240,62,t); art(tab,referenceDir+'/grxx_04.png'); comp(tab,'cc.Sprite')._type=1;
      const active=add(tab,'Active','InputBackground',0,0,240,62); art(active,referenceDir+'/grxx_03.png'); comp(active,'cc.Sprite')._type=1;
      a[tab]._children.unshift(a[tab]._children.pop());
      comp(a[tab]._children.find(r=>a[r.__id__]._name==='Caption').__id__,'cc.Label')._color={__type__:'cc.Color',r:255,g:255,b:255,a:255};
      comp(a[tab]._children.find(r=>a[r.__id__]._name==='Caption').__id__,'cc.Label')._fontSize=34;
    }
    for(const [name,x] of [['AvatarDot',-28],['FrameDot',232]]) {
      const dot=add(box,name,'InputBackground',x,218,27,27);art(dot,referenceDir+'/zjm_011.png');
    }
    const wall=add(box,'ListBackground','InputBackground',0,-95,530,530); art(wall,referenceDir+'/grxx_05.png'); comp(wall,'cc.Sprite')._type=1;
    const viewport=add(box,'Viewport','Box',0,-95,510,510,['cc.UITransform']);
    const content=add(viewport,'Content','Box',0,0,510,510,['cc.UITransform']);
    for (const c of [
      { __type__: 'cc.Mask', _type: 0, _inverted: false, _alphaThreshold: 0.1, _segments: 64 },
      { __type__: 'cc.ScrollView', _content: { __id__: content }, horizontal: false, vertical: true, inertia: true, brake: 0.5, elastic: true, bounceDuration: 0.3, cancelInnerEvents: true, scrollEvents: [], _horizontalScrollBar: null, _verticalScrollBar: null },
    ]) { Object.assign(c, { _name:'', _objFlags:0, node:{__id__:viewport}, _enabled:true, __prefab:null, _id:'' }); a[viewport]._components.push({__id__:a.length}); a.push(c); }
    const cell=button(content,'ItemTemplate',-170,100,155,155,''); a[cell]._active=false;
    art(cell,referenceDir+'/grxx_06.png'); comp(cell,'cc.Sprite')._type=1;
    const placeholder=add(cell,'Placeholder','InputBackground',0,0,110,110); art(placeholder,referenceDir+'/grxx_06.png');
    comp(placeholder,'cc.Sprite')._color={__type__:'cc.Color',r:223,g:235,b:230,a:255};
    for(const [i,x,y] of [[0,-22,22],[1,22,22],[2,-22,-22],[3,22,-22]]) {
      const tile=add(placeholder,`Tile${i}`,'InputBackground',x,y,29,29); art(tile,'assets/GameAssetsBundle/Textures/UI/collection_card_unlocked.png');
      comp(tile,'cc.Sprite')._color={__type__:'cc.Color',r:202,g:220,b:215,a:150};
    }
    const icon=add(cell,'Icon','InputBackground',0,0,110,110); comp(icon,'cc.Sprite')._spriteFrame=null; comp(icon,'cc.Sprite')._sizeMode=0; comp(icon,'cc.Sprite')._type=0;
    const decoration=(parent,name,file,x,y,w,h,sliced=false)=>{const n=add(parent,name,'InputBackground',x,y,w,h);art(n,referenceDir+'/'+file+'.png');comp(n,'cc.Sprite')._type=sliced?1:0;return n;};
    const locked=decoration(cell,'Locked','grxx_07',0,0,155,155,true);
    comp(locked,'cc.Sprite')._color={__type__:'cc.Color',r:255,g:255,b:255,a:180};
    decoration(locked,'Lock','grxx_09',0,0,38,55);
    decoration(locked,'Video','sl_08',0,25,44,45);
    const adLabel=label(locked,'AdProgress',0,-30,146,64,'免费解锁\n（0/1）'); comp(adLabel,'cc.Label')._fontSize=24;comp(adLabel,'cc.Label')._lineHeight=30;comp(adLabel,'cc.Label')._isBold=true;comp(adLabel,'cc.Label')._color={__type__:'cc.Color',r:255,g:255,b:255,a:255};
    decoration(cell,'Selected','grxx_08',0,0,169,169,true);
    decoration(cell,'New','red_xin',57,53,46,47);
    decoration(cell,'Equipped','zhd_04',57,53,43,42);
    decoration(box,'ConditionBackground','grxx_05',0,-414,500,76,true);
    rich(box,'Condition',0,-414,490,70,'<b>请选择头像或头像框</b>',32);
    const status=label(box,'Status',0,-365,500,26,''); comp(status,'cc.Label')._fontSize=22;
    const action=button(box,'Action',0,-414,279,90,'装扮'); art(action,referenceDir+'/sl_05.png');
    const gold=decoration(action,'GoldBackground','sl_06',0,0,279,90); a[action]._children.unshift(a[action]._children.pop());
    decoration(action,'Coin','item_102',-66,4,42,42);
    comp(a[action]._children.find(r=>a[r.__id__]._name==='Caption').__id__,'cc.Label')._color={__type__:'cc.Color',r:255,g:255,b:255,a:255};
    comp(a[action]._children.find(r=>a[r.__id__]._name==='Caption').__id__,'cc.Label')._fontSize=30;
  }
  const file=`assets/GameAssetsBundle/UI/Prefabs/Panels/${name}.prefab`;
  require('./profile-prefab-metadata').ensureProfilePrefabMetadata(a, name);
  fs.writeFileSync(file,JSON.stringify(a,null,2)+'\n'); meta(file,'prefab','1.1.50');
}
build('ProfilePanel',false);
for(const file of ['ProfileArtManifest','ProfileCustomizationConfig','ProfileCustomizationMgr','ProfileResourceService','ProfileAvatarView','ProfileDiagnostics','Panels/ProfilePanelController']) meta(`assets/Scripts/Core/${file}.ts`,'typescript','4.0.24');
console.log('Prepared default assets and profile prefabs');

