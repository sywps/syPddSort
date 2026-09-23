import { assetManager, ImageAsset, SpriteFrame, Texture2D } from 'cc';
import { profileItem, PROFILE_ITEMS, PROFILE_FRAME_GEOMETRY } from './ProfileCustomizationConfig';
import { ProfileArtItem, ProfileArtManifest, validateProfileArtManifest } from './ProfileArtManifest';
import { normalizeCdnBaseUrl, requestCdnText, shouldUseLocalLevelDataMirror, readCdnStorageObject, writeCdnStorageObject } from './RemoteDataCdnClient';
import { reportProfileFailure } from './ProfileDiagnostics';

type Geometry = { width: number; height: number; bounds: number[] };
type ManifestState = { value?: ProfileArtManifest; pending?: Promise<ProfileArtManifest>; unavailableUntil: number };
export function profileCdnBase(): string {
    const g: any = globalThis;
    const w: any = typeof window === 'undefined' ? null : window;
    const explicit = normalizeCdnBaseUrl(g.__PDD_PROFILE_DATA_CDN_URL__ || w?.__PDD_PROFILE_DATA_CDN_URL__);
    if (explicit) return explicit;
    const level = normalizeCdnBaseUrl(g.__PDD_LEVEL_DATA_CDN_URL__ || w?.__PDD_LEVEL_DATA_CDN_URL__);
    return level ? (/\/levels\/$/i.test(level) ? level.replace(/\/levels\/$/i, '/profile/') : level + 'profile/') : '';
}
export function profileAssetUrl(id: number): string {
    const base = profileCdnBase();
    return base ? base + ProfileResourceService.descriptor(id).asset : '';
}

export class ProfileResourceService {
    private static cache = new Map<string, Promise<SpriteFrame>>();
    private static manifests = new Map<string, ManifestState>();
    private static frameGeometry = new WeakMap<SpriteFrame, Geometry>();
    static descriptor(id: number): ProfileArtItem {
        const local = profileItem(id);
        const manifest = !shouldUseLocalLevelDataMirror() && this.manifests.get(profileCdnBase())?.value;
        return (manifest && manifest.items.find(row => row.id === id)) || { ...local, ...(local.kind === 'frame' ? { bounds: PROFILE_FRAME_GEOMETRY[id].bounds } : {}) };
    }
    static geometry(frame: SpriteFrame, id: number): Geometry {
        return this.frameGeometry.get(frame) || PROFILE_FRAME_GEOMETRY[id] || PROFILE_FRAME_GEOMETRY[2001];
    }
    static async prepare(): Promise<void> {
        if (!shouldUseLocalLevelDataMirror()) await this.ensureManifest(profileCdnBase());
    }
    static openDataArt(): { baseUrl: string; manifest: ProfileArtManifest } | null {
        const baseUrl = profileCdnBase(), manifest = this.manifests.get(baseUrl)?.value;
        return manifest ? { baseUrl, manifest } : null;
    }
    static async load(id: number): Promise<SpriteFrame> {
        const local = profileItem(id);
        if (shouldUseLocalLevelDataMirror()) return this.loadLocal(id);
        try {
            const base = profileCdnBase(), manifest = await this.ensureManifest(base);
            const item = manifest.items.find(row => row.id === id)!;
            const url = base + item.asset;
            return await this.cached(url, id, () => new Promise<SpriteFrame>((resolve, reject) => {
                assetManager.loadRemote<ImageAsset>(url, { ext: '.png' }, (err, image) => {
                    if (err || !image) { reject(err || Error(`头像加载失败 ${id}`)); return; }
                    if (image.width !== item.width || image.height !== item.height) { reject(Error(`头像尺寸错误 ${id}`)); return; }
                    const texture = new Texture2D(); texture.image = image;
                    const frame = new SpriteFrame(); frame.texture = texture;
                    if (item.bounds) this.frameGeometry.set(frame, { width: item.width, height: item.height, bounds: item.bounds });
                    resolve(frame);
                });
            }));
        } catch (error) {
            // Defaults remain visible during offline startup; all failures are still diagnosed.
            if (local.unlock === 'default') return this.loadLocal(id);
            throw error;
        }
    }
    static loadDefault(id: 1001 | 2001): Promise<SpriteFrame> { return this.loadLocal(id); }
    private static loadLocal(id: number): Promise<SpriteFrame> {
        const defaults = id === 1001 || id === 2001;
        const bundleName = defaults ? 'homeAssets' : 'levelData';
        const path = defaults ? `GameUI/Profile/${id}/spriteFrame` : `ProfilePreview/${id}/spriteFrame`;
        return this.cached(`local:${id}`, id, () => new Promise<SpriteFrame>((resolve, reject) => {
            const load = (bundle: any) => bundle.load(path, SpriteFrame, (error: Error, frame: SpriteFrame) => {
                if (error || !frame) { reject(error || Error('头像资源缺失')); return; }
                if (PROFILE_FRAME_GEOMETRY[id]) this.frameGeometry.set(frame, PROFILE_FRAME_GEOMETRY[id]);
                resolve(frame);
            });
            const bundle = assetManager.getBundle(bundleName);
            if (bundle) load(bundle);
            else assetManager.loadBundle(bundleName, (error, loaded) => error || !loaded ? reject(error || Error('头像资源包缺失')) : load(loaded));
        }));
    }
    private static cached(key: string, id: number, load: () => Promise<SpriteFrame>): Promise<SpriteFrame> {
        const cached = this.cache.get(key);
        if (cached) return cached;
        const pending = this.retry(load).catch(error => { reportProfileFailure('resource_load', error, id, 2); throw error; });
        this.cache.set(key, pending);
        void pending.then(frame => frame.addRef(), () => this.cache.delete(key));
        return pending;
    }
    private static async retry<T>(load: () => Promise<T>): Promise<T> {
        try { return await load(); }
        catch (_) { await new Promise(resolve => setTimeout(resolve, 1200)); return load(); }
    }
    private static async ensureManifest(base: string): Promise<ProfileArtManifest> {
        if (!base) { const error = Error('头像资源地址未配置'); reportProfileFailure('resource_config', error); throw error; }
        let state = this.manifests.get(base);
        if (!state) { state = { unavailableUntil: 0 }; this.manifests.set(base, state); }
        if (state.value) return state.value; // One consistent artwork snapshot per launch/base URL.
        if (state.pending) return state.pending;
        if (Date.now() < state.unavailableUntil) throw Error('头像资源清单暂不可用');
        const storageKey = 'pdd.profile.artManifest.v1:' + base;
        state.pending = this.retry(async () => validateProfileArtManifest(JSON.parse(await requestCdnText(base + 'profile_live.json?t=' + Date.now(), 8000)), PROFILE_ITEMS))
            .then(manifest => {
                state!.value = manifest;
                writeCdnStorageObject(storageKey, manifest);
                return manifest;
            }).catch(error => {
                reportProfileFailure('manifest', error, 0, 2);
                state!.unavailableUntil = Date.now() + 30000;
                const previous = readCdnStorageObject(storageKey);
                if (previous) {
                    try { state!.value = validateProfileArtManifest(previous, PROFILE_ITEMS); return state!.value; }
                    catch (cacheError) { reportProfileFailure('manifest_cache', cacheError); }
                }
                throw error;
            }).finally(() => { state!.pending = undefined; });
        return state.pending;
    }
}
