import { sys } from 'cc';
import { eligibleChapterRewards } from './ChapterRewardPolicy';
const KEY = 'pdd.preview.inventory.v1';
type Save = { version: 1; gold: number; props: Record<string, number>; avatars: number[]; frames?: number[]; beanSkins?: number[]; backgrounds?: number[]; claimed: string[] };
function read(): Save {
    const raw = sys.localStorage.getItem(KEY);
    if (!raw) return { version: 1, gold: 0, props: {}, avatars: [], claimed: [] };
    const value = JSON.parse(raw);
    if (value.version !== 1 || !Number.isSafeInteger(value.gold) || value.gold < 0 || !value.props || !Array.isArray(value.avatars) || !Array.isArray(value.claimed)
        || Object.values(value.props).some(n => !Number.isSafeInteger(n) || Number(n) < 0)) throw Error('本地测试存档损坏');
    for (const field of ['frames', 'beanSkins', 'backgrounds']) if (value[field] !== undefined && (!Array.isArray(value[field]) || value[field].some((id: number) => !Number.isSafeInteger(id) || id <= 0))) throw Error('本地测试装饰存档损坏');
    return value;
}
function write(value: Save): void { sys.localStorage.setItem(KEY, JSON.stringify(value)); }
export const PreviewRewardSave = {
    ensureStarterProps(count: number) {
        const save = read();
        for (const kind of ['freeze', 'brush', 'magnet']) if (save.props[kind] === undefined) save.props[kind] = count;
        write(save);
    },
    gold: () => read().gold,
    setGold(value: number) { const save = read(); save.gold = Math.max(0, Math.floor(value)); write(save); },
    prop: (kind: string) => read().props[kind] || 0,
    setProp(kind: string, value: number) { const save = read(); save.props[kind] = Math.max(0, Math.floor(value)); write(save); },
    avatars: () => read().avatars,
    frames: () => read().frames || [],
    beanSkins: () => read().beanSkins || [],
    backgrounds: () => read().backgrounds || [],
    claim(cleared: number) {
        const save = read(), granted = eligibleChapterRewards(cleared, save.claimed);
        for (const reward of granted) {
            save.gold += reward.gold;
            save.props.brush = (save.props.brush || 0) + reward.brushCount;
            save.props.magnet = (save.props.magnet || 0) + reward.magnetCount;
            if (reward.avatarId && !save.avatars.includes(reward.avatarId)) save.avatars.push(reward.avatarId);
            for (const [field, id] of [['frames', reward.frameId], ['beanSkins', reward.beanSkinId], ['backgrounds', reward.backgroundSkinId]] as const) {
                const owned = save[field] || (save[field] = []);
                if (id && !owned.includes(id)) owned.push(id);
            }
            save.claimed.push(reward.key);
        }
        write(save); // One atomic local receipt includes inventory and claim markers.
        return { granted, claimed: save.claimed };
    },
};
