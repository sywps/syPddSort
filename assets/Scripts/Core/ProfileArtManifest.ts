export type ProfileArtItem = {
    id: number; kind: 'avatar' | 'frame'; asset: string; sha256: string;
    width: number; height: number; bounds?: number[];
};
export type ProfileArtManifest = { manifestVersion: 1; dataVersion: string; items: ProfileArtItem[] };

/** Artwork may change independently; IDs and economic rules remain client/server contracts. */
export function validateProfileArtManifest(data: any, required: readonly { id: number; kind: string }[]): ProfileArtManifest {
    if (data?.manifestVersion !== 1 || !/^[a-f0-9]{64}$/.test(data.dataVersion) || !Array.isArray(data.items) || data.items.length > 500) throw Error('装扮美术清单格式不正确');
    const ids = new Set<number>();
    const items: ProfileArtItem[] = data.items.map((row: any) => {
        if (!Number.isSafeInteger(row?.id) || row.id < 1 || ids.has(row.id) || !['avatar', 'frame'].includes(row.kind)) throw Error('装扮美术编号不正确');
        ids.add(row.id);
        if (!/^[a-f0-9]{64}$/.test(row.sha256) || row.asset !== `${row.id}.${row.sha256.slice(0, 12)}.png`) throw Error('装扮美术资源路径不正确');
        if (![row.width, row.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096)) throw Error('装扮美术尺寸不正确');
        const item: ProfileArtItem = { id: row.id, kind: row.kind, asset: row.asset, sha256: row.sha256, width: row.width, height: row.height };
        if (row.kind === 'frame') {
            const b = row.bounds;
            if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isInteger) || b[0] < 0 || b[1] < 0 || b[2] > row.width || b[3] > row.height || b[2] <= b[0] || b[3] <= b[1]) throw Error('头像框内圈范围不正确');
            item.bounds = [...b];
        }
        return item;
    });
    for (const row of required) if (!items.some(item => item.id === row.id && item.kind === row.kind)) throw Error('装扮美术清单缺少客户端所需编号');
    return { manifestVersion: 1, dataVersion: data.dataVersion, items };
}
