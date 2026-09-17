import { PREVIEW } from 'cc/env';
import { isMiniGameRuntime } from './MiniGamePlatform';
import { encouragementExperiment } from './EncouragementExperiment';

export function resolveEncouragementBucket(mode: string, level: number, multiplayer: boolean,
    assigned: 'A' | 'B', preview: boolean, search: string): 'A' | 'B' {
    if (mode !== 'main' || !Number.isInteger(level) || level < 2 || multiplayer) return 'A';
    if (!preview) return assigned;
    const value = new URLSearchParams(search).get('encourage')?.trim().toUpperCase() || 'A';
    if (value !== 'A' && value !== 'B') throw new Error('鼓励预览参数无效，请使用 encourage=A 或 encourage=B。');
    return value;
}

export function isEncouragementEnabled(runtime: any): boolean {
    const browser = typeof window !== 'undefined';
    return resolveEncouragementBucket(runtime._activeGameplayEntryMode,
        Number(runtime.getActiveLogicalLevelId?.() || 0),
        !!(runtime.isRankedPvpMode?.() || runtime.isCoopMode?.()), encouragementExperiment.content(),
        PREVIEW && browser && !isMiniGameRuntime(), browser ? window.location.search : '') === 'A';
}
