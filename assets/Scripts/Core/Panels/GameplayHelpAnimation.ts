import { _decorator, BlockInputEvents, Button, Component, Node, Prefab, UITransform, instantiate, sp } from 'cc';
import { AudioMgr } from '../AudioMgr';

const { ccclass } = _decorator;

/** Play the authorized original tutorial, including its baked text and hand animation. */
@ccclass('GameplayHelpAnimation')
export class GameplayHelpAnimation extends Component {
    configure(_runtime: any, close: () => void): void {
        const box = this.node.getChildByName('Box');
        const skeleton = box?.getChildByName('OriginalAnimation')?.getComponent(sp.Skeleton);
        if (!box || !skeleton?.skeletonData || !skeleton.findAnimation('Idle')) {
            throw new Error('[gameplay-help] original Spine animation Idle unavailable');
        }
        this.node.addComponent(BlockInputEvents);
        box.addComponent(BlockInputEvents);
        for (const name of ['Close', 'Confirm']) {
            const button = box.getChildByName(name);
            if (!button?.getComponent(Button)) throw new Error(`[gameplay-help] missing button: ${name}`);
            button.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('button');
                close();
            }, this);
        }
        skeleton.setAnimation(0, 'Idle', true);
    }
}

const activePanels = new WeakMap<object, () => void>();

/** Own the modal and pause independently of every other panel. */
export function openGameplayHelp(runtime: any): void {
    if (activePanels.has(runtime) || runtime.isGameEnd || runtime._patternCompleteWinPending
        || runtime._gameplayTransitionPromise || runtime.isPvpMode?.() || runtime.isCoopMode?.()) return;
    const parent = runtime.requireCanvasUiRoot('PopupRoot') as Node;
    const blocker = new Node('GameplayHelpLoading');
    blocker.layer = parent.layer;
    blocker.addComponent(UITransform).setContentSize(parent.getComponent(UITransform)!.contentSize);
    blocker.addComponent(BlockInputEvents);
    parent.addChild(blocker);
    let closed = false;
    let help: Node | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timerToken = '';
    let focusToken = '';
    let conveyorPaused = false;
    const conveyor = runtime._pchConveyorGameplayController;
    const close = () => {
        if (closed) return;
        closed = true;
        activePanels.delete(runtime);
        runtime.node.off(Node.EventType.NODE_DESTROYED, close);
        if (timeout) clearTimeout(timeout);
        if (blocker.isValid) { blocker.active = false; blocker.destroy(); }
        if (focusToken) runtime.endModalFocus(focusToken);
        if (timerToken) runtime.resumeTimerForProp(timerToken);
        if (conveyorPaused) conveyor.resumeAfterSettings();
    };
    activePanels.set(runtime, close);
    runtime.node.once(Node.EventType.NODE_DESTROYED, close);
    const fail = (error: unknown) => {
        if (closed) return;
        console.error('[gameplay-help] open failed', error);
        close();
        if (parent.isValid) runtime.showToast('玩法说明加载失败，请重试', 2);
    };
    timeout = setTimeout(() => fail(new Error('prefab load timed out')), 8000);
    try {
        timerToken = runtime.pauseTimerForProp('gameplay-help');
        focusToken = runtime.beginModalFocus('gameplay-help');
        if (conveyor?.isActive()) {
            conveyor.pauseForSettings();
            conveyorPaused = true;
        }
        runtime._withGameAssetsBundle((bundle: any) => {
            if (closed) return;
            if (!bundle) { fail(new Error('gameAssets unavailable')); return; }
            bundle.load('UI/Prefabs/Panels/GameplayHelpPanel', Prefab, (error: Error | null, prefab: Prefab | null) => {
                if (closed) return;
                if (error || !prefab) { fail(error || new Error('prefab missing')); return; }
                if (!parent.isValid || !parent.activeInHierarchy) { close(); return; }
                if (timeout) clearTimeout(timeout);
                try {
                    help = instantiate(prefab);
                    help.name = 'GameplayHelpOverlay';
                    prefab.addRef();
                    help.once(Node.EventType.NODE_DESTROYED, () => prefab.decRef());
                    blocker.addChild(help);
                    const box = help.getChildByName('Box')!;
                    const size = parent.getComponent(UITransform)!.contentSize;
                    const scale = Math.min(1, (size.width - 24) / 680, (size.height - 40) / 1061);
                    box.setScale(scale, scale, 1);
                    help.addComponent(GameplayHelpAnimation).configure(runtime, close);
                } catch (error) { fail(error); }
            });
        });
    } catch (error) { fail(error); }
}
