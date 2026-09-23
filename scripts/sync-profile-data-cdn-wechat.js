'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { extractRequiredWechatCdnSlot } = require('./wechat-cdn-slot-config');
async function main() {
    const { target, remainingArgs } = extractRequiredWechatCdnSlot(process.argv.slice(2));
    if (remainingArgs.some(x => x !== '--dry-run')) throw Error('未知参数');
    const dry = remainingArgs.includes('--dry-run');
    const dir = path.resolve(__dirname, '../config/profile-assets');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
    const catalog = require('../cloudfunctions/updateUserProfileAssets/profile-catalog.json');
    const live = JSON.parse(fs.readFileSync(path.join(dir, 'profile_live.json')));
    const geometry = require('../openDataContext/profile-frames');
    const artwork = manifest.items.map(({id,kind,asset,width,height,sha256}) => ({id,kind,asset,width,height,sha256,...(kind === 'frame' ? {bounds:geometry[id].bounds} : {})}));
    if (live.manifestVersion !== 1 || JSON.stringify(live.items) !== JSON.stringify(artwork) || live.dataVersion !== crypto.createHash('sha256').update(JSON.stringify(artwork)).digest('hex')) throw Error('远程美术清单与资源不一致');
    if (manifest.version !== 2 || manifest.items.length !== catalog.length || new Set(manifest.items.map(x => x.id)).size !== catalog.length || JSON.stringify(manifest.items) !== JSON.stringify(catalog)) throw Error('装扮清单无效');
    for (const row of manifest.items) {
        if (!/^\d+\.[a-f0-9]{12}\.png$/.test(row.asset)) throw Error('非法资源路径');
        const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, row.asset))).digest('hex');
        if (hash !== row.sha256 || !row.asset.includes(hash.slice(0, 12))) throw Error(`装扮资源校验失败 ${row.id}`);
        const image = require('pngjs').PNG.sync.read(fs.readFileSync(path.join(dir, row.asset)));
        if (image.width !== row.width || image.height !== row.height) throw Error(`装扮尺寸校验失败 ${row.id}`);
    }
    const base = target.cdnRootUrl + 'profile/';
    const oss = 'oss://game-pdd-v2/' + target.ossRootPath + 'profile/';
    console.log(`${dry ? 'Dry-run' : 'Publish'}: ${manifest.items.length} images + manifests -> ${base}`);
    if (dry) return;
    const upload = file => {
        const result = spawnSync(process.env.PDD_OSSUTIL_BIN || 'ossutil', ['cp', '--acl', 'public-read', '--force', '--meta', file.endsWith('.json') ? 'Cache-Control:no-cache' : 'Cache-Control:public,max-age=31536000,immutable', '--endpoint', 'https://oss-cn-beijing.aliyuncs.com', path.join(dir, file), oss + file], { stdio: 'inherit', shell: false, windowsHide: true });
        if (result.error || result.status !== 0) throw result.error || Error(`上传失败 ${file}`);
    };
    // Immutable PNGs first, verify every byte before publishing the entrypoint.
    for (const row of manifest.items) {
        upload(row.asset);
        const response = await fetch(base + row.asset, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw Error(`远程图片不可用 ${row.id}: ${response.status}`);
        const hash = crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
        if (hash !== row.sha256) throw Error(`远程图片哈希不一致 ${row.id}`);
    }
    upload('manifest.json');
    const response = await fetch(base + 'manifest.json?t=' + Date.now(), { signal: AbortSignal.timeout(15000) });
    if (!response.ok || JSON.stringify(await response.json()) !== JSON.stringify(manifest)) throw Error('远程清单校验失败');
    upload('profile_live.json');
    const liveResponse = await fetch(base + 'profile_live.json?t=' + Date.now(), { signal: AbortSignal.timeout(15000) });
    if (!liveResponse.ok || JSON.stringify(await liveResponse.json()) !== JSON.stringify(live)) throw Error('远程美术入口校验失败');
    console.log('Profile CDN verified');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
