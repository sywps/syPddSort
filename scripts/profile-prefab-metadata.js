'use strict';
// Cocos prefab edit mode requires identity records even when runtime instantiation works.
function ensureProfilePrefabMetadata(data, name) {
    const root = data[0].data.__id__;
    const records = data.slice();
    for (const [index, object] of records.entries()) {
        if (object.__type__ === 'cc.Node' && !object._prefab) {
            object._prefab = { __id__: data.length };
            data.push({ __type__: 'cc.PrefabInfo', root: { __id__: root }, asset: { __id__: 0 },
                fileId: `${name}-node-${index}`, instance: null, targetOverrides: null, nestedPrefabInstanceRoots: null });
        } else if (object.node && !object.__prefab) {
            object.__prefab = { __id__: data.length };
            data.push({ __type__: 'cc.CompPrefabInfo', fileId: `${name}-component-${index}` });
        }
    }
    return data;
}
module.exports = { ensureProfilePrefabMetadata };
