import { Button, Label, Node } from '../../Core/GameCtrlShared';
import { getDouyinMiniGameRuntime } from '../../Core/MiniGamePlatform';
import { bindDouyinDesktopGuideTouch } from './DouyinDesktopModule';
import { canUseDouyinSubscription, douyinSubscriptionService } from './DouyinSubscriptionService';

export const DOUYIN_VERSION_TEMPLATE_ID = 'MSG21797007137157690496699164461350';

/** Consent only: official version-update delivery is configured in the Douyin console. */
export function installDouyinVersionSubscriptionModule(target: any): void {
    Object.assign(target, {
        attachDouyinVersionSubscription(overlay: Node, box: Node, canInteract: () => boolean): () => void {
            const entry = box.getChildByName('DouyinVersionSubscription');
            if (!entry) throw new Error('[douyin-version-subscribe] missing prefab entry');
            const tt = getDouyinMiniGameRuntime();
            if (!canUseDouyinSubscription(tt)) { entry.active = false; return () => {}; }
            const label = entry.getComponent(Label);
            if (!label) throw new Error('[douyin-version-subscribe] missing entry Label');
            const button = entry.getComponent(Button) || entry.addComponent(Button);
            let disposed = false, pending = false, accepted = false;
            const alive = () => !disposed && overlay.isValid && overlay.activeInHierarchy;
            const render = () => {
                if (!alive()) return;
                label.string = pending ? '正在请求订阅…' : accepted ? '已订阅版本更新提醒' : '订阅版本更新提醒';
                button.interactable = !pending && !accepted;
            };
            const toast = (message: string) => { if (alive()) this.showToast?.(message); };
            const request = () => {
                if (!alive() || !canInteract() || pending || accepted) return;
                pending = true;
                render();
                // No await/login/network before this call: preserve the native user gesture.
                const result = douyinSubscriptionService.start({ runtime: tt, templateId: DOUYIN_VERSION_TEMPLATE_ID,
                    onComplete: response => {
                        pending = false;
                        accepted = response.status === 'accepted';
                        render();
                        if (accepted) toast('订阅成功，更新提醒由抖音按规则发送');
                        else if (response.status === 'declined') toast('未订阅，不影响游戏');
                        else if (response.status === 'blocked') toast('暂时无法订阅，请检查抖音订阅设置');
                        else if (response.status === 'timeout') toast('未确认订阅结果，请稍后重试');
                        else toast('订阅失败，请稍后重试');
                    },
                });
                if (!result.started) {
                    pending = false;
                    render();
                    toast('订阅暂不可用，请稍后重试');
                }
            };
            entry.active = true;
            render();
            const unbind = bindDouyinDesktopGuideTouch(tt, entry, () => alive() && canInteract(), request);
            if (!unbind) entry.active = false;
            const cleanup = () => { if (disposed) return; disposed = true; unbind?.(); };
            overlay.once(Node.EventType.NODE_DESTROYED, cleanup);
            return cleanup;
        },
    });
}
