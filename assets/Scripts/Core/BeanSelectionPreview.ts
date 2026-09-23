export function resolveBeanSelectionPreview(enabled: boolean, search: string, mode: string, level: number): 'A' | 'B' {
    if (!enabled || mode !== 'main' || level < 2) return 'A';
    const raw = new URLSearchParams(search).get('pick');
    if (raw === null) return 'A';
    const value = raw.trim().toUpperCase();
    if (value !== 'A' && value !== 'B') throw new Error('选豆预览参数无效，请使用 pick=A 或 pick=B。');
    return value;
}

export function getBeanSelectionPreview(_mode: string, _level: number): 'A' | 'B' {
    return 'A'; // Experiment retired; applies to saved B assignments and preview overrides too.
}
