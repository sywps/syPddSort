'use strict';
const packaged = require('./profile-assets');
const packagedFrames = require('./profile-frames');
let current = null;
function accept(snapshot) {
    if (!snapshot) { current = null; return; }
    if (!/^https:\/\/game-pdd-v2\.oss-cn-beijing\.aliyuncs\.com\/syGame\/pdd_v2\/remote_wechat(?:_b)?\/profile\/$/.test(snapshot.baseUrl) || snapshot.manifest?.manifestVersion !== 1 || !Array.isArray(snapshot.manifest.items)) throw Error('Invalid profile artwork snapshot');
    const assets = {}, frames = {};
    for (const row of snapshot.manifest.items) {
        if (!Number.isSafeInteger(row.id) || row.id < 1 || assets[row.id] || !['avatar', 'frame'].includes(row.kind) || !/^[a-f0-9]{64}$/.test(row.sha256) || row.asset !== `${row.id}.${row.sha256.slice(0, 12)}.png` || ![row.width, row.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096)) throw Error('Invalid profile artwork item');
        assets[row.id] = { kind: row.kind, asset: row.asset };
        if (row.kind === 'frame') {
            const b = row.bounds;
            if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isInteger) || b[0] < 0 || b[1] < 0 || b[2] > row.width || b[3] > row.height || b[2] <= b[0] || b[3] <= b[1]) throw Error('Invalid profile frame geometry');
            frames[row.id] = { width: row.width, height: row.height, bounds: b.slice() };
        }
    }
    for (const id of Object.keys(packaged)) if (assets[id]?.kind !== packaged[id].kind) throw Error('Incomplete profile artwork snapshot');
    current = { baseUrl: snapshot.baseUrl, assets, frames };
}
module.exports = {
    accept,
    assets: () => current ? Object.fromEntries(Object.keys(packaged).map(id => [id, current.assets[id]])) : packaged,
    url: (oldUrl, id) => current ? current.baseUrl + current.assets[id].asset : oldUrl,
    geometry: id => current ? current.frames[id] : packagedFrames[id],
};
