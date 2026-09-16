import { PREVIEW } from 'cc/env';
import { isMiniGameRuntime } from './MiniGamePlatform';

/** Scene changes retain this state; reloading the page starts from the URL again. */
export class BrowserLevelPreviewState {
    readonly active: boolean = false;
    readonly error: string = '';
    currentLevel = 0;

    constructor(enabled: boolean, search: string, hash = '') {
        if (!enabled || /(?:^#|&)pddWorkbench(?:Origin|Token)=/.test(hash)) return;
        const params = new URLSearchParams(search);
        const value = params.get('level');
        if (value === null || /^1=[ABC]$/i.test(value)) return;
        if (['theme', 'pvppreview', 'cooppost', 'levelfile', 'level_file', 'levelfileurl'].some(key => params.has(key))) return;
        this.active = true;
        const level = Number(value);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(level) || level < 1) {
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
        this.currentLevel = level;
    }
}

let state: BrowserLevelPreviewState | undefined;
export function getBrowserLevelPreview(): BrowserLevelPreviewState {
    if (!state) {
        const browser = typeof window !== 'undefined';
        state = new BrowserLevelPreviewState(PREVIEW && browser && !isMiniGameRuntime(),
            browser ? window.location.search : '', browser ? window.location.hash : '');
    }
    return state;
}
