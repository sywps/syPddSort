import { PREVIEW } from 'cc/env';
import { isMiniGameRuntime } from './MiniGamePlatform';
import { beanSelectionExperiment } from './BeanSelectionExperiment';

export function resolveBeanSelectionPreview(enabled: boolean, search: string, mode: string, level: number): 'A' | 'B' {
    if (!enabled || mode !== 'main' || level < 2) return 'A';
    const raw = new URLSearchParams(search).get('pick');
    if (raw === null) return 'A';
    const value = raw.trim().toUpperCase();
    if (value !== 'A' && value !== 'B') throw new Error('选豆预览参数无效，请使用 pick=A 或 pick=B。');
    return value;
}

export function getBeanSelectionPreview(mode: string, level: number): 'A' | 'B' {
    const browser = typeof window !== 'undefined';
    if (mode !== 'main' || level < 2) return 'A';
    if (PREVIEW && browser && !isMiniGameRuntime()) {
        return resolveBeanSelectionPreview(true, window.location.search, mode, level);
    }
    return beanSelectionExperiment.content();
}
