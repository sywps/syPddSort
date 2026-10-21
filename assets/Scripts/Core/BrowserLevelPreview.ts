import { PREVIEW } from 'cc/env';
import { isMiniGameRuntime } from './MiniGamePlatform';
import { getCreatorWebConfig, type CreatorWebConfig } from './CreatorWeb';

/** Scene changes retain this state; reloading the page starts from the URL again. */
export class BrowserLevelPreviewState {
    readonly active: boolean = false;
    readonly error: string = '';
    currentLevel = 0;
    private creator: { config: CreatorWebConfig; storage: Pick<Storage, 'getItem' | 'setItem'> } | null = null;

    constructor(enabled: boolean, search: string, hash = '', creator: BrowserLevelPreviewState['creator'] = null) {
        if (creator) {
            this.active = true;
            this.creator = creator;
            const saved = creator.storage.getItem('pdd.creator.selectedLevel');
            try { this.setLevel(saved === null ? creator.config.mainLevels[0] : Number(saved)); }
            catch (error) { this.error = error instanceof Error ? error.message : String(error); }
            return;
        }
        if (!enabled || /(?:^#|&)pddWorkbench(?:Origin|Token)=/.test(hash)) return;
        const params = new URLSearchParams(search);
        const value = params.get('level');
        if (value === null || /^1=[ABC]$/i.test(value)) return;
        if (['theme', 'pvppreview', 'cooppost', 'levelfile', 'level_file', 'levelfileurl'].some(key => params.has(key))) return;
        this.active = true;
        const normalized = /^3=[ABC]$/i.test(value) ? '3' : value;
        const level = Number(normalized);
        if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(level) || level < 1) {
            this.error = '预览关卡参数无效，请使用 ?level=8 这样的正整数关卡号。';
            return;
        }
        this.currentLevel = level;
    }

    getLevel(): number {
        if (this.error) throw new Error(this.error);
        return this.currentLevel;
    }

    setLevel(level: number): void {
        if (!this.active) return;
        if (!Number.isSafeInteger(level) || level < 1) throw new Error('预览关卡号必须为正整数');
        if (this.creator) {
            if (!this.creator.config.mainLevels.includes(level)) throw new Error('此版本未包含此关卡，请输入已提供的关卡号');
            this.creator.storage.setItem('pdd.creator.selectedLevel', String(level));
        }
        this.currentLevel = level;
    }

    completeLevel(level: number): void {
        if (!this.creator) { this.setLevel(level + 1); return; }
        const completed = this.completedLevels();
        if (!completed.includes(level)) completed.push(level);
        this.creator.storage.setItem('pdd.creator.completedLevels', JSON.stringify(completed));
        this.setLevel(this.creator.config.mainLevels.find(id => id > level) ?? level);
    }

    completedLevels(): number[] {
        if (!this.creator) return [];
        const levels = JSON.parse(this.creator.storage.getItem('pdd.creator.completedLevels') || '[]');
        if (!Array.isArray(levels) || levels.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error('通关存档损坏');
        return levels;
    }
}

let state: BrowserLevelPreviewState | undefined;
export function getBrowserLevelPreview(): BrowserLevelPreviewState {
    if (!state) {
        const browser = typeof window !== 'undefined';
        const creator = getCreatorWebConfig();
        state = new BrowserLevelPreviewState(PREVIEW && browser && !isMiniGameRuntime(),
            browser ? window.location.search : '', browser ? window.location.hash : '',
            creator ? { config: creator, storage: window.localStorage } : null);
    }
    return state;
}
