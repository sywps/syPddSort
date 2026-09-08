const assert = require('assert');

const {
    findAutoAtlasRemovableNativeUuids,
    findAutoAtlasStandaloneSources,
} = require('../scripts/bundle-artifact-utils.js');

function imageArtifacts(name, uuid, autoAtlasRemoveImage) {
    const source = `C:/project/assets/GameAssetsBundle/${name}.png.meta`;
    return [
        {
            uuid,
            native: true,
            importer: 'image',
            assetPath: name,
            autoAtlasRemoveImage,
            source,
        },
        {
            uuid: `${uuid}@texture`,
            native: false,
            importer: 'texture',
            assetPath: name,
            source,
        },
        {
            uuid: `${uuid}@spriteFrame`,
            native: false,
            importer: 'sprite-frame',
            assetPath: name,
            source,
        },
    ];
}

const fragmentPath = 'UI/Images/fragment';
const fragmentArtifacts = imageArtifacts(fragmentPath, 'fragment-image');
const fragmentConfig = {
    paths: {
        10: [fragmentPath, 2, 1],
        11: [`${fragmentPath}/texture`, 3, 1],
        12: [`${fragmentPath}/spriteFrame`, 4, 1],
    },
    packs: {
        ordinaryJsonPack: [12],
    },
};

assert.deepStrictEqual(
    [...findAutoAtlasStandaloneSources(fragmentConfig, fragmentArtifacts)],
    [],
    'ordinary fragment assets must still be patched even when their SpriteFrame is in a regular JSON pack',
);

const atlasPath = 'UI/Atlases/HardIntro/atlas_member';
const atlasArtifacts = imageArtifacts(atlasPath, 'atlas-image', true);
const atlasSource = atlasArtifacts[0].source;
const atlasConfig = {
    paths: {
        20: [atlasPath, 2, 1],
        22: [`${atlasPath}/spriteFrame`, 4, 1],
    },
    packs: {
        atlasPack: [22],
    },
};

assert.deepStrictEqual(
    [...findAutoAtlasStandaloneSources(atlasConfig, atlasArtifacts)],
    [atlasSource],
    'an atlas-routed image must not have missing standalone imports/native restored from cache',
);

assert.deepStrictEqual(
    [...findAutoAtlasRemovableNativeUuids(atlasConfig, atlasArtifacts)],
    ['atlas-image'],
    'an atlas-routed image may be deleted only when its Auto Atlas explicitly removes images',
);

const atlasConfigWithoutBasePath = {
    paths: {
        22: [`${atlasPath}/spriteFrame`, 4, 1],
    },
    packs: {
        atlasPack: [22],
    },
};

assert.deepStrictEqual(
    [...findAutoAtlasStandaloneSources(atlasConfigWithoutBasePath, atlasArtifacts)],
    [atlasSource],
    'an atlas-routed image must still be recognized when Creator removes its bare image path',
);

assert.deepStrictEqual(
    [...findAutoAtlasRemovableNativeUuids(atlasConfigWithoutBasePath, atlasArtifacts)],
    ['atlas-image'],
    'a packed atlas member without a bare image path may remove its original native when the Auto Atlas permits it',
);

const unpackedConfig = {
    paths: {
        20: [atlasPath, 2, 1],
        22: [`${atlasPath}/spriteFrame`, 4, 1],
    },
    packs: {},
};

assert.deepStrictEqual(
    [...findAutoAtlasStandaloneSources(unpackedConfig, atlasArtifacts)],
    [],
    'a missing texture path alone must not suppress artifacts when the SpriteFrame is not packed',
);

const retainedArtifacts = imageArtifacts(atlasPath, 'retained-atlas-image', false);
assert.deepStrictEqual(
    [...findAutoAtlasStandaloneSources(atlasConfig, retainedArtifacts)],
    [retainedArtifacts[0].source],
    'a retained image can still be identified as atlas-routed for missing standalone import suppression',
);
assert.deepStrictEqual(
    [...findAutoAtlasRemovableNativeUuids(atlasConfig, retainedArtifacts)],
    [],
    'removeImageInBundle=false must preserve any Cocos-generated original native',
);

console.log('bundle-artifact-utils.test.js passed');
