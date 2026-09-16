type State = Record<'users' | 'posts' | 'runs', Record<string, any>>;
const KEY = 'coop-browser-state-v1';
const clone = <T>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value));

export function createCoopBrowserStore(storage: Pick<Storage, 'getItem' | 'setItem'>) {
    const read = (): State => {
        const text = storage.getItem(KEY);
        const state = text === null ? { users: {}, posts: {}, runs: {} } : JSON.parse(text);
        if (!state || ['users', 'posts', 'runs'].some(kind => !state[kind] || typeof state[kind] !== 'object' || Array.isArray(state[kind]))) {
            throw new Error('浏览器合作存档格式错误');
        }
        return state;
    };
    const reader = (state: State) => ({
        get: async (kind: keyof State, id: string) => clone(state[kind][id] || null),
        list: async (kind: keyof State, filter: Record<string, unknown>, cursor: string, limit: number) => Object.entries(state[kind])
            .filter(([id, value]) => id > cursor && Object.entries(filter).every(([key, wanted]) => value[key] === wanted))
            .sort(([a], [b]) => a.localeCompare(b)).slice(0, limit).map(([, value]) => clone(value)),
    });
    let queue = Promise.resolve();
    return {
        get: (kind: keyof State, id: string) => reader(read()).get(kind, id),
        list: (kind: keyof State, filter: Record<string, unknown>, cursor: string, limit: number) => reader(read()).list(kind, filter, cursor, limit),
        transaction(operation: (tx: any) => Promise<any>): Promise<any> {
            const transact = async () => {
                const draft = read();
                let changed = false;
                const result = await operation({ ...reader(draft), set: async (kind: keyof State, id: string, value: any) => {
                    draft[kind][id] = clone(value); changed = true;
                } });
                if (changed) storage.setItem(KEY, JSON.stringify(draft));
                return result;
            };
            const result = queue.then(() => {
                if (!globalThis.navigator?.locks) throw new Error('本地合作需要支持 Web Locks 的浏览器，请使用新版 Chrome 或 Edge');
                return globalThis.navigator.locks.request(KEY, transact);
            });
            queue = result.then(() => undefined, () => undefined);
            return result;
        },
    };
}
