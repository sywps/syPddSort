// Deterministic conversion of the audited extracted frames to Creator 3 source assets.
// Only writes this feature's named assets; original package and extracted evidence stay intact.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const uuid = (name) => {
  const h = crypto.createHash('sha256').update('rotate-pattern-fx:' + name).digest('hex').slice(0, 32);
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
const write = (p, value) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), JSON.stringify(value, null, 2) + '\n'); };
const atlasDir = 'assets/GameAssetsBundle/UI/Atlases/PatternComplete';
const prefabPath = 'assets/GameAssetsBundle/UI/Prefabs/Fx/PatternCompleteBean.prefab';
const animPath = 'assets/GameAssetsBundle/UI/Animations/PatternCompleteBean.anim';
const meta = (name, importer, ver, files = ['.json']) => ({ ver, importer, imported: true, uuid: uuid(name), files, subMetas: {}, userData: {} });
const frameRefs = [];
fs.mkdirSync(path.join(root, atlasDir), { recursive: true });
for (let i = 1; i <= 23; i++) {
  const name = 'baoshishanguang_' + String(i).padStart(4, '0');
  const data = fs.readFileSync(path.join(root, `temp/rotate-completion-fx/png/map/${name}.png`));
  fs.writeFileSync(path.join(root, `${atlasDir}/${name}.png`), data);
  const m = read('assets/GameAssetsBundle/UI/Atlases/HardIntro/hard_intro_stars.png.meta');
  m.uuid = uuid(name);
  m.userData.redirect = m.uuid + '@6c48a';
  for (const [id, sub] of Object.entries(m.subMetas)) { sub.uuid = m.uuid + '@' + id; sub.displayName = name; sub.userData.imageUuidOrDatabaseUri = m.uuid + (id === 'f9941' ? '@6c48a' : ''); }
  const u = m.subMetas.f9941.userData;
  Object.assign(u, { width: 61, height: 61, rawWidth: 61, rawHeight: 61, trimType: 'none', trimX: 0, trimY: 0, offsetX: 0, offsetY: 0 });
  delete u.vertices;
  write(`${atlasDir}/${name}.png.meta`, m);
  frameRefs.push({ __uuid__: m.uuid + '@f9941', __expectedType__: 'cc.SpriteFrame' });
}
const pac = read('assets/GameAssetsBundle/UI/Atlases/HardIntro/hard_intro.pac');
pac._name = 'pattern_complete'; pac._maxWidth = pac._maxHeight = 512;
write(`${atlasDir}/pattern_complete.pac`, pac);
const pacMeta = read('assets/GameAssetsBundle/UI/Atlases/HardIntro/hard_intro.pac.meta');
pacMeta.uuid = uuid('atlas'); pacMeta.userData.maxWidth = pacMeta.userData.maxHeight = 512;
write(`${atlasDir}/pattern_complete.pac.meta`, pacMeta);
write(animPath, {
  __type__: 'cc.AnimationClip', _name: 'PatternCompleteBean', _objFlags: 0, __editorExtras__: {}, _native: '', sample: 60, speed: 1, wrapMode: 1, enableTrsBlending: false,
  _duration: 0.4, _hash: 0,
  _tracks: [{ __type__: 'cc.animation.ObjectTrack', _binding: { __type__: 'cc.animation.TrackBinding', path: { __type__: 'cc.animation.TrackPath', _paths: [{ __type__: 'cc.animation.ComponentPath', component: 'cc.Sprite' }, 'spriteFrame'] }, proxy: null },
    _channel: { __type__: 'cc.animation.Channel', _curve: { __type__: 'cc.ObjectCurve', _times: Array.from({ length: 24 }, (_, i) => i / 60), _values: [null, ...frameRefs] } } }],
  _exoticAnimation: null, _events: [], _embeddedPlayers: [], _auxiliaryCurveEntries: [],
});
write(animPath + '.meta', meta('clip', 'animation-clip', '2.0.4', ['.bin']));
const template = read('assets/GameAssetsBundle/UI/Prefabs/Fx/EndgameHintCell.prefab');
const node = structuredClone(template[1]);
Object.assign(node, { _name: 'PatternCompleteBean', _children: [], _components: [{ __id__: 2 }, { __id__: 3 }, { __id__: 4 }], _prefab: { __id__: 5 } });
const transform = structuredClone(template[4]);
Object.assign(transform, { node: { __id__: 1 }, __prefab: { __id__: 6 }, _contentSize: { __type__: 'cc.Size', width: 61, height: 61 } });
const sprite = structuredClone(template.find((o) => o.__type__ === 'cc.Sprite'));
Object.assign(sprite, { node: { __id__: 1 }, __prefab: { __id__: 7 }, _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 }, _spriteFrame: frameRefs[7], _sizeMode: 0, _isTrimmedMode: false });
const animation = { __type__: 'cc.Animation', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: 1 }, _enabled: true, __prefab: { __id__: 8 }, _clips: [{ __uuid__: uuid('clip'), __expectedType__: 'cc.AnimationClip' }], _defaultClip: { __uuid__: uuid('clip'), __expectedType__: 'cc.AnimationClip' }, playOnLoad: false, _id: '' };
write(prefabPath, [ { ...template[0], _name: 'PatternCompleteBean' }, node, transform, sprite, animation,
  { __type__: 'cc.PrefabInfo', root: { __id__: 1 }, asset: { __id__: 0 }, fileId: 'PatternCompleteBeanRoot', instance: null, targetOverrides: null, nestedPrefabInstanceRoots: null },
  ...['transform', 'sprite', 'animation'].map((fileId) => ({ __type__: 'cc.CompPrefabInfo', fileId })) ]);
const pm = meta('prefab', 'prefab', '1.1.50'); pm.userData.syncNodeName = 'PatternCompleteBean'; write(prefabPath + '.meta', pm);
for (const dir of [atlasDir, 'assets/GameAssetsBundle/UI/Animations']) {
  if (!fs.existsSync(path.join(root, dir + '.meta'))) write(dir + '.meta', meta(dir, 'directory', '1.2.0', []));
}
console.log('Imported 23 unchanged PNGs, auto-atlas, AnimationClip and single-Sprite prefab.');
