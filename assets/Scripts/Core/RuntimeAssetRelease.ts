import { Asset } from 'cc';

let nextRuntimeAssetId = 0;

/** Cocos 3.8 queues decRef cleanup by _uuid, including manually created assets. */
export function ensureRuntimeAssetReleaseId(asset: Asset): void {
    // Never replace an imported asset's identity or register it in the asset cache.
    if (!asset._uuid) asset._uuid = `pdd-runtime-owned-${++nextRuntimeAssetId}`;
}
