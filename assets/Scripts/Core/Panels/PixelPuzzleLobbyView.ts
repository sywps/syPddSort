import { Button, Label, Node, Prefab, instantiate } from 'cc';

const PREFAB_PATH = 'UI/Prefabs/Panels/PixelPuzzleLobby';
const pending = new WeakSet<object>();

/** The prefab owns layout and artwork; callers only bind actions and update data. */
export function mountPixelPuzzleLobby(
    runtime: any,
    bind: (overlay: Node) => void,
    onError: () => void,
): void {
    const parent: Node = runtime.requireCanvasUiRoot('OverlayRoot');
    if (pending.has(runtime) || parent.getChildByName('PvpLobbyOverlay')) return;
    pending.add(runtime);
    let finished = false;
    const finish = (): boolean => {
        if (finished) return false;
        finished = true;
        clearTimeout(timer);
        pending.delete(runtime);
        parent.off(Node.EventType.NODE_DESTROYED, cancel);
        return true;
    };
    const cancel = () => { finish(); };
    const fail = (error: unknown) => {
        if (!finish() || !parent.isValid) return;
        console.error('[pixel-lobby-prefab] failed to open lobby', error);
        onError();
        runtime.showToast('大厅加载失败，请重试');
    };
    const timer = setTimeout(() => fail(new Error('PixelPuzzleLobby prefab load timed out')), 8000);
    parent.once(Node.EventType.NODE_DESTROYED, cancel);
    try {
        runtime._withGameAssetsBundle((bundle: any) => {
            if (finished || !parent.isValid) { finish(); return; }
            if (!bundle) { fail(new Error('GameAssetsBundle unavailable')); return; }
            const mount = (error: Error | null, prefab: Prefab | null) => {
                if (finished || !parent.isValid) { finish(); return; }
                if (error || !prefab) { fail(error || new Error('PixelPuzzleLobby prefab missing')); return; }
                let overlay: Node | null = null;
                try {
                    overlay = instantiate(prefab);
                    // Creator synchronizes the saved root name with the asset filename.
                    overlay.name = 'PvpLobbyOverlay';
                    prefab.addRef();
                    overlay.once(Node.EventType.NODE_DESTROYED, () => prefab.decRef());
                    parent.addChild(overlay);
                    bind(overlay);
                    finish();
                } catch (bindError) {
                    if (overlay?.isValid) { overlay.active = false; overlay.destroy(); }
                    fail(bindError);
                }
            };
            const cached = bundle.get(PREFAB_PATH, Prefab);
            if (cached) mount(null, cached);
            else bundle.load(PREFAB_PATH, Prefab, mount);
        });
    } catch (error) { fail(error); }
}

export function lobbyNode(parent: Node, path: string): Node {
    const node = parent.getChildByPath(path);
    if (!node) throw new Error(`[pixel-lobby-prefab] missing node: ${parent.name}/${path}`);
    return node;
}

export function lobbyLabel(parent: Node, path: string): Label {
    const label = lobbyNode(parent, path).getComponent(Label);
    if (!label) throw new Error(`[pixel-lobby-prefab] missing Label: ${path}`);
    return label;
}

export function bindLobbyButton(parent: Node, path: string, onClick: () => void): Node {
    const node = lobbyNode(parent, path);
    if (!node.getComponent(Button)) throw new Error(`[pixel-lobby-prefab] missing Button: ${path}`);
    node.on(Button.EventType.CLICK, onClick);
    return node;
}
