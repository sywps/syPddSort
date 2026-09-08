'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const assetDirectory = path.join(root, 'assets/BootstrapBundle/GameUI/RainbowConveyor/Atlases/PchCapacity');

function readImage(name) {
    return PNG.sync.read(fs.readFileSync(path.join(assetDirectory, name)));
}

function readMeta(name) {
    return JSON.parse(fs.readFileSync(path.join(assetDirectory, `${name}.meta`), 'utf8'));
}

function pixel(image, x, y) {
    const index = (y * image.width + x) * 4;
    return Array.from(image.data.slice(index, index + 4));
}

function hasAntialiasedAlpha(image) {
    for (let index = 3; index < image.data.length; index += 4) {
        const alpha = image.data[index];
        if (alpha > 0 && alpha < 255) return true;
    }
    return false;
}

function partialAlphaLevelCount(image) {
    const levels = new Set();
    for (let index = 3; index < image.data.length; index += 4) {
        const alpha = image.data[index];
        if (alpha > 0 && alpha < 255) levels.add(alpha);
    }
    return levels.size;
}

const track = readImage('pch_capacity_track_sliced.png');
const fill = readImage('pch_capacity_fill_sliced.png');
const trackMeta = readMeta('pch_capacity_track_sliced.png');
const fillMeta = readMeta('pch_capacity_fill_sliced.png');
const trackFrame = trackMeta.subMetas.f9941.userData;
const fillFrame = fillMeta.subMetas.f9941.userData;

assert.deepEqual([track.width, track.height], [720, 96], 'dark track source must be authored at 4x the 180x24 NormalLayout size');
assert.deepEqual([fill.width, fill.height], [720, 72], 'green fill source must preserve 4x 18px inset height');
assert.deepEqual(
    [trackFrame.borderTop, trackFrame.borderBottom, trackFrame.borderLeft, trackFrame.borderRight],
    [48, 48, 48, 48],
    'dark track must declare 4x circular nine-slice borders',
);
assert.deepEqual(
    [fillFrame.borderTop, fillFrame.borderBottom, fillFrame.borderLeft, fillFrame.borderRight],
    [36, 36, 36, 36],
    'green fill must declare 4x circular nine-slice borders',
);
assert.equal(trackFrame.trimType, 'none', 'dark track must not lose its rounded bounds through auto-trimming');
assert.equal(fillFrame.trimType, 'none', 'green fill must not lose its rounded bounds through auto-trimming');
assert.equal(trackMeta.subMetas['6c48a'].userData.minfilter, 'linear', 'dark track must use linear minification');
assert.equal(trackMeta.subMetas['6c48a'].userData.magfilter, 'linear', 'dark track must use linear magnification');
assert.equal(fillMeta.subMetas['6c48a'].userData.minfilter, 'linear', 'green fill must use linear minification');
assert.equal(fillMeta.subMetas['6c48a'].userData.magfilter, 'linear', 'green fill must use linear magnification');

assert.deepEqual(pixel(track, 0, 48), [45, 45, 45, 255], 'dark outer rim must remain opaque at its horizontal center edge');
assert.deepEqual(pixel(track, 4, 48), [68, 68, 68, 255], 'gray inner body must begin after the 1px logical rim');
assert.deepEqual(pixel(fill, 0, 36), [119, 239, 67, 255], 'green fill must remain opaque at its horizontal center edge');
assert.equal(pixel(track, 0, 0)[3], 0, 'dark track corners must stay transparent outside the pill silhouette');
assert.equal(pixel(fill, 0, 0)[3], 0, 'green fill corners must stay transparent outside the pill silhouette');
assert.equal(hasAntialiasedAlpha(track), true, 'dark track must contain fractional-alpha anti-aliased edge pixels');
assert.equal(hasAntialiasedAlpha(fill), true, 'green fill must contain fractional-alpha anti-aliased edge pixels');
assert.ok(partialAlphaLevelCount(track) >= 32, 'dark track must retain fine-grained alpha coverage along both rounded caps');
assert.ok(partialAlphaLevelCount(fill) >= 32, 'green fill must retain fine-grained alpha coverage along both rounded caps');

console.log('pch-normal-capacity-sliced-assets.test.js passed');
