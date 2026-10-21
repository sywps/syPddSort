import { assetManager, ImageAsset, Node, Rect, SpriteFrame, Texture2D } from 'cc';
import { getWeChatMiniGameRuntime } from './MiniGamePlatform';

const MAX_AVATAR_EDGE = 256;
const MAX_REMOTE_LOADS = 2;
type OwnedFrame = { image: ImageAsset; canvas: any; users: number; retired: boolean };
const owned = new WeakMap<SpriteFrame, OwnedFrame>();
const bindings = new WeakMap<Node, SpriteFrame>();
const watched = new WeakSet<Node>();
const queue: Array<() => void> = [];
type Waiter = { isCurrent: () => boolean; resolve: (frame: SpriteFrame) => void; reject: (error: unknown) => void };
const pending = new Map<string, Waiter[]>();
let inFlight = 0;

/** Rasterize only the small portrait we display; never upload a full-size remote portrait. */
export function createLeaderboardAvatarFrame(source: ImageAsset | any): SpriteFrame {
    const raw = source instanceof ImageAsset ? source.data : source;
    const width = Number(source?.width || raw?.width);
    const height = Number(source?.height || raw?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw Error('[LeaderboardAvatar] invalid image dimensions');
    }
    const scale = Math.min(1, MAX_AVATAR_EDGE / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));
    const wx = getWeChatMiniGameRuntime() as any;
    const canvas: any = typeof document !== 'undefined' && document.createElement
        ? document.createElement('canvas')
        : wx?.createOffscreenCanvas?.({ type: '2d', width: targetW, height: targetH });
    if (!canvas) throw Error('[LeaderboardAvatar] canvas unavailable');
    canvas.width = targetW; canvas.height = targetH;
    const context = canvas.getContext('2d');
    if (!context) throw Error('[LeaderboardAvatar] 2d context unavailable');
    let image: ImageAsset | null = null, texture: Texture2D | null = null, frame: SpriteFrame | null = null;
    try {
        context.drawImage(raw, 0, 0, targetW, targetH);
        image = new ImageAsset(canvas);
        texture = new Texture2D(); texture.image = image;
        frame = new SpriteFrame(); frame.texture = texture; frame.rect = new Rect(0, 0, targetW, targetH);
        owned.set(frame, { image, canvas, users: 0, retired: false });
        return frame;
    } catch (error) {
        frame?.destroy(); texture?.destroy(); image?.destroy();
        canvas.width = canvas.height = 0;
        throw error;
    }
}

/** Cache eviction can retire a frame, but must not destroy one still displayed in a row. */
export function retireLeaderboardAvatarFrame(frame: SpriteFrame | undefined | null): void {
    if (!frame) return;
    const resource = owned.get(frame);
    if (resource) {
        resource.retired = true;
        if (resource.users > 0) return;
        owned.delete(frame);
    }
    frame.texture?.destroy(); frame.destroy();
    if (resource) {
        resource.image.destroy(); resource.canvas.width = resource.canvas.height = 0;
    }
}

export function releaseLeaderboardAvatarBinding(node: Node): void {
    const frame = bindings.get(node);
    bindings.delete(node);
    const resource = frame && owned.get(frame);
    if (!resource) return;
    resource.users--;
    if (resource.retired && resource.users === 0) retireLeaderboardAvatarFrame(frame);
}

export function bindLeaderboardAvatarFrame(node: Node, frame: SpriteFrame): void {
    if (bindings.get(node) === frame) return;
    releaseLeaderboardAvatarBinding(node);
    const resource = owned.get(frame);
    if (!resource) return;
    bindings.set(node, frame); resource.users++;
    if (!watched.has(node)) {
        watched.add(node);
        node.once(Node.EventType.NODE_DESTROYED, () => releaseLeaderboardAvatarBinding(node));
    }
}

export function hasLeaderboardAvatarUsers(frame: SpriteFrame): boolean {
    return (owned.get(frame)?.users || 0) > 0;
}

export function hasLeaderboardAvatarBinding(node: Node): boolean {
    return bindings.has(node);
}

function drain(): void {
    while (inFlight < MAX_REMOTE_LOADS && queue.length) queue.shift()!();
}

/** The profile+frame branch uses the same concurrency and pixel bounds as plain portraits. */
export function loadLeaderboardAvatarFrame(url: string, isCurrent: () => boolean): Promise<SpriteFrame> {
    return new Promise((resolve, reject) => {
        const waiter = { resolve, reject, isCurrent };
        const existing = pending.get(url);
        if (existing) { existing.push(waiter); return; }
        const waiters = [waiter];
        pending.set(url, waiters);
        queue.push(() => {
            if (!waiters.some(row => row.isCurrent())) {
                pending.delete(url);
                for (const row of waiters) row.reject(Error('[LeaderboardAvatar] stale request'));
                return;
            }
            inFlight++;
            let finished = false;
            const finish = (error: Error | null, image?: ImageAsset | null) => {
                if (finished) return;
                finished = true;
                pending.delete(url);
                try {
                    if (error || !image) throw error || Error('[LeaderboardAvatar] image unavailable');
                    for (const row of waiters) {
                        try {
                            if (!row.isCurrent()) throw Error('[LeaderboardAvatar] stale request');
                            row.resolve(createLeaderboardAvatarFrame(image));
                        } catch (failure) { row.reject(failure); }
                    }
                } catch (failure) { for (const row of waiters) row.reject(failure); }
                finally {
                    // These requests explicitly bypass the shared ImageAsset cache.
                    image?.destroy(); inFlight--; drain();
                }
            };
            try { assetManager.loadRemote<ImageAsset>(url, { ext: '.png', cacheAsset: false, reloadAsset: true }, finish); }
            catch (error) { finish(error instanceof Error ? error : Error(String(error))); }
        });
        drain();
    });
}
