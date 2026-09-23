import { assetManager, ImageAsset, Node, Sprite, SpriteFrame, Texture2D } from 'cc';
import { ProfileResourceService } from './ProfileResourceService';
import { reportProfileFailure } from './ProfileDiagnostics';
import { RETIRED_PROFILE_ITEMS } from './ProfileCustomizationConfig';

type Identity = { avatarUrl?: string; avatarId?: number; frameId?: number };
const generations = new WeakMap<Node, number>();
const identities = new WeakMap<Node, string>();
const privateFrames = new WeakMap<Node, SpriteFrame>();
const watched = new WeakSet<Node>();
const retryAfter = new WeakMap<Node, { key: string; until: number }>();
function destroyPrivateFrame(frame: SpriteFrame | undefined): void { if (frame) { frame.texture?.destroy(); frame.destroy(); } }
export function invalidateProfileAvatar(avatar: Node): void { generations.set(avatar, (generations.get(avatar) || 0) + 1); identities.delete(avatar); }
/** Bind existing prefab sprites; stale requests never overwrite a newer selection. */
export async function renderProfileAvatar(avatar: Node, frame: Node, identity: Identity): Promise<void> {
    if (RETIRED_PROFILE_ITEMS.some(row => row.id === identity.avatarId)) identity = { ...identity, avatarId: 1001 };
    if (RETIRED_PROFILE_ITEMS.some(row => row.id === identity.frameId)) identity = { ...identity, frameId: 2001 };
    const key = JSON.stringify([identity.avatarId || 0, identity.avatarUrl || '', identity.frameId || 2001]);
    if (identities.get(avatar) === key) return;
    const failed = retryAfter.get(avatar);
    if (failed?.key === key && failed.until > Date.now()) return;
    identities.set(avatar, key);
    const generation = (generations.get(avatar) || 0) + 1;
    generations.set(avatar, generation);
    const valid = () => avatar.isValid && frame.isValid && generations.get(avatar) === generation;
    const sprite = avatar.getComponent(Sprite)!;
    const border = frame.getComponent(Sprite)!;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM; border.sizeMode = Sprite.SizeMode.CUSTOM;
    if (!watched.has(avatar)) {
        watched.add(avatar);
        avatar.once(Node.EventType.NODE_DESTROYED, () => { destroyPrivateFrame(privateFrames.get(avatar)); privateFrames.delete(avatar); });
    }
    let privateFrame: SpriteFrame | undefined;
    const portrait = identity.avatarId || !identity.avatarUrl
        ? ProfileResourceService.load(identity.avatarId || 1001)
        : new Promise<SpriteFrame>((resolve, reject) => {
            assetManager.loadRemote<ImageAsset>(identity.avatarUrl!, { ext: '.png' }, (error, image) => {
                if (error || !image) { reject(error || Error('头像加载失败')); return; }
                const texture = new Texture2D(); texture.image = image;
                const result = new SpriteFrame(); result.texture = texture; privateFrame = result; resolve(result);
            });
        });
    const imageStarted = Date.now();
    try {
        const results = await Promise.allSettled([portrait, ProfileResourceService.load(identity.frameId || 2001)]);
        const picture = results[0], outline = results[1];
        if (picture.status === 'rejected') throw picture.reason;
        if (outline.status === 'rejected') throw outline.reason;
        if (valid()) {
            sprite.spriteFrame = picture.value; border.spriteFrame = outline.value;
            destroyPrivateFrame(privateFrames.get(avatar)); privateFrames.delete(avatar);
            if (privateFrame) privateFrames.set(avatar, privateFrame);
            retryAfter.delete(avatar);
        }
        else destroyPrivateFrame(privateFrame);
    } catch (error) {
        destroyPrivateFrame(privateFrame);
        if (!valid()) return;
        reportProfileFailure('equipped_image', error, identity.avatarId || 0);
        identities.delete(avatar); retryAfter.set(avatar, { key, until: Date.now() + 30000 });
        // A new view with no cached image can show the default pair, without changing equipment.
        if (!sprite.spriteFrame) {
            const fallback = await Promise.allSettled([ProfileResourceService.loadDefault(1001), ProfileResourceService.loadDefault(2001)]);
            if (valid() && fallback[0].status === 'fulfilled' && fallback[1].status === 'fulfilled') {
                sprite.spriteFrame = fallback[0].value; border.spriteFrame = fallback[1].value;
            }
        }
        throw error;
    } finally {
        console.info('[ProfilePerf]', 'equippedImages', identity.avatarId || 0, identity.frameId || 2001, 'loadMs', Date.now() - imageStarted);
    }
}
