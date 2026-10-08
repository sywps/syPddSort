const assert = require('node:assert/strict');
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync('assets/GameAssetsBundle/UI/Prefabs/Panels/SettingsPanel.prefab', 'utf8'));
const node = name => data.find(n => n.__type__ === 'cc.Node' && n._name === name);
const child = (n, name) => n._children.map(ref => data[ref.__id__]).find(n => n._name === name);
const component = (n, type) => n._components.map(ref => data[ref.__id__]).find(c => c.__type__ === type);
const box = node('Box');
const rows = box._children.map(ref => data[ref.__id__]).filter(n => /^SettingsRow/.test(n._name)).sort((a,b) => b._lpos.y-a._lpos.y);
assert.equal(rows.length, 4);
assert.deepEqual(rows.map(row => component(child(child(row,'LabelAnchor'),'PreviewLabel'), 'cc.Label')._string), ['音乐','音效','语音','震动']);
for (const row of rows) {
    assert.equal(data[row._parent.__id__], box, 'rows must remain editor-owned children');
    const toggle = child(row, 'ToggleWrap');
    const on = child(toggle, 'ToggleOnState'), off = child(toggle, 'ToggleOffState');
    assert.ok(on && off && on._active !== off._active, 'exactly one visible switch state');
    for (const n of [on,off,child(row,'IconAnchor')]) {
        assert.ok(component(n, 'cc.Sprite')._spriteFrame.__uuid__);
    }
    assert.ok(component(row,'cc.UITransform')._contentSize.height >= 56, 'row bounds contain the existing icon and switch');
}
for (let i=1; i<rows.length; i++) {
    const gap=rows[i-1]._lpos.y-rows[i]._lpos.y;
    assert.ok(gap>=70, 'row hit regions must not overlap');
}
const lastBottom=rows.at(-1)._lpos.y-component(rows.at(-1),'cc.UITransform')._contentSize.height/2;
const contentFrame = child(box, 'Node');
assert.equal(contentFrame._active, false, 'the redundant inner border must remain hidden');
for(const name of ['Home','Restart']) {
    const button=node(name), size=component(button,'cc.UITransform')._contentSize;
    assert.ok(lastBottom>button._lpos.y+size.height/2+10, 'last switch row must clear the action buttons');
}
function checkRefs(value) {
    if (!value || typeof value !== 'object') return;
    if (Number.isInteger(value.__id__)) assert.ok(data[value.__id__], `invalid serialized reference ${value.__id__}`);
    for(const v of Object.values(value)) checkRefs(v);
}
checkRefs(data);
const voice=node('SettingsRow3');
function checkOwnership(n) {
    for(const ref of n._components) assert.equal(data[data[ref.__id__].node.__id__], n, 'cloned components must refer to cloned nodes');
    for(const ref of n._children) { const c=data[ref.__id__]; assert.equal(data[c._parent.__id__],n); checkOwnership(c); }
}
checkOwnership(voice);
console.log('settings-voice-toggle.test.js passed');
