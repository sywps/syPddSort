import { getWeChatMiniGameRuntime } from './MiniGamePlatform';
import { firstLevelExperiment } from './FirstLevelExperiment';

export type FirstLevelContent = 'A' | 'B' | 'C';

export function getFirstLevelPreview(): FirstLevelContent | null {
    const wechat = getWeChatMiniGameRuntime();
    const search = !wechat && typeof window !== 'undefined' ? window.location?.search || '' : '';
    const params = search ? new URLSearchParams(search) : null;
    const query = wechat?.getLaunchOptionsSync?.()?.query;
    const browserValue = /^1=(.*)$/i.exec(params?.get('level') || '')?.[1]
        || params?.get('firstLevelContent');
    const launchValue = /^1=(.*)$/i.exec(String(query?.level || ''))?.[1]
        || query?.firstLevelContent;
    const raw = browserValue || launchValue;
    if (!raw) {
        const previewKeys = ['level', 'levelfile', 'level_file', 'levelfileurl', 'theme', 'ab', 'pick', 'pvppreview', 'cooppost', 'pddWorkbenchOrigin'];
        return previewKeys.some(key => params?.has(key) || query?.[key]) ? 'A' : null;
    }
    const value = String(raw).trim().toUpperCase();
    if (value !== 'A' && value !== 'B' && value !== 'C') {
        throw new Error(`[FirstLevelContent] invalid content: ${value}`);
    }
    return value;
}

let sessionPreview: FirstLevelContent | null | undefined;
export function getFirstLevelContent(): FirstLevelContent {
    if (sessionPreview === undefined) sessionPreview = getFirstLevelPreview();
    return sessionPreview || firstLevelExperiment.decision?.content || 'A';
}

export function getLocalLevelContentPath(levelId: number, prefix: string = 'level_'): string {
    if (levelId !== 1 || prefix !== 'level_') return `LevelData/${prefix}${levelId}`;
    const content = getFirstLevelContent();
    return content === 'A' ? 'LevelData/level_1' : `LevelData/${content}`;
}
