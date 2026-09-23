export function resolveEncouragementBucket(mode: string, level: number, multiplayer: boolean,
    assigned: 'A' | 'B', preview: boolean, search: string): 'A' | 'B' {
    if (mode !== 'main' || !Number.isInteger(level) || level < 2 || multiplayer) return 'A';
    if (!preview) return assigned;
    const value = new URLSearchParams(search).get('encourage')?.trim().toUpperCase() || 'A';
    if (value !== 'A' && value !== 'B') throw new Error('鼓励预览参数无效，请使用 encourage=A 或 encourage=B。');
    return value;
}

export function isEncouragementEnabled(_runtime: any): boolean {
    return true; // Retired experiment: keep both voice and text for everyone.
}
