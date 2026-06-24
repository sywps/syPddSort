export function readExperimentBucketOverrideFromSearch(options: {
    search: string;
    experimentId: string;
}): string {
    const experimentId = String(options.experimentId || '').trim().toLowerCase();
    if (!experimentId) return '';
    const params = new URLSearchParams(options.search || '');
    return readCombinedExperimentBucket(params, experimentId);
}

function readCombinedExperimentBucket(params: URLSearchParams, experimentId: string): string {
    const bucket = readBucketFromSemicolonValue(params.get('ab') || '', experimentId);
    if (bucket) return bucket;
    return '';
}

function readBucketFromSemicolonValue(value: string, experimentId: string): string {
    const entries = String(value || '').split(';');
    for (const entry of entries) {
        const pair = entry.split(',');
        if (pair.length < 2) continue;
        const id = String(pair[0] || '').trim().toLowerCase();
        const bucket = String(pair[1] || '').trim();
        if (id === experimentId && bucket) return bucket;
    }
    return '';
}
