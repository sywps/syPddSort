import { BlockInputEvents, Button, EditBox, Label, Node, Prefab, instantiate } from 'cc';
import { AudioMgr } from '../AudioMgr';
import { PlatformCloudMgr } from '../PlatformCloudMgr';
import { SETTINGS_PANEL_TEXTURE_NAMES } from '../GameCtrlShared';

const controllers = new WeakMap<object, FeedbackPanelController>();

export function openFeedbackPanel(runtime: any): void {
    let controller = controllers.get(runtime);
    if (!controller) {
        controller = new FeedbackPanelController(runtime);
        controllers.set(runtime, controller);
    }
    void controller.open();
}

export function disposeFeedbackPanel(runtime: any): void {
    controllers.get(runtime)?.dispose();
    controllers.delete(runtime);
}

class FeedbackPanelController {
    private overlay: Node | null = null;
    private opening = false;
    private disposed = false;
    private focus = '';
    private retained = false;
    private draft = '';
    private requestId = '';
    private requestText = '';
    private submitting = false;

    constructor(private readonly runtime: any) {}

    async open(): Promise<void> {
        if (this.disposed || this.opening || this.overlay?.isValid) return;
        this.opening = true;
        try {
            this.runtime._retainPanelTextureOwner('feedback', SETTINGS_PANEL_TEXTURE_NAMES);
            this.retained = true;
            const prefab = await new Promise<Prefab>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('feedback prefab timeout')), 8000);
                this.runtime._withGameAssetsBundle((bundle: any) => {
                    if (!bundle) { clearTimeout(timer); reject(new Error('gameAssets unavailable')); return; }
                    bundle.load('UI/Prefabs/Panels/FeedbackPanel', Prefab, (error: Error | null, asset: Prefab) => {
                        clearTimeout(timer);
                        if (error || !asset) reject(error || new Error('feedback prefab missing'));
                        else resolve(asset);
                    });
                });
            });
            if (this.disposed || !this.runtime.node?.isValid) return;
            const overlay = instantiate(prefab);
            this.overlay = overlay;
            this.runtime.requireCanvasUiRoot('PopupRoot').addChild(overlay);
            overlay.addComponent(BlockInputEvents);
            this.focus = this.runtime.beginModalFocus('feedback');
            const box = overlay.getChildByName('Box')!;
            const input = box.getChildByName('Input')!.getComponent(EditBox)!;
            const submit = box.getChildByName('Submit')!.getComponent(Button)!;
            const close = box.getChildByName('XBtn')!.getComponent(Button)!;
            const status = box.getChildByName('Status')!.getComponent(Label)!;
            const caption = submit.node.getChildByName('SubmitLabel')!.getComponent(Label)!;
            const titleBadge = box.getChildByName('PopupTitleBadge')!;
            const title = titleBadge.getChildByName('PopupTitleLabel')!;
            const successTitle = titleBadge.getChildByName('SuccessTitle')!;
            const successMessage = box.getChildByName('SuccessMessage')!;
            const confirmLabel = submit.node.getChildByName('ConfirmLabel')!;
            if (!input || !submit || !close || !status || !caption || !title || !successTitle || !successMessage || !confirmLabel) throw new Error('feedback prefab contract broken');
            let submitted = false;
            const originalCaption = caption.string;
            input.string = this.draft;
            input.node.on(EditBox.EventType.TEXT_CHANGED, () => { this.draft = input.string; }, this);
            close.node.on(Button.EventType.CLICK, () => {
                AudioMgr.inst.play('button');
                this.draft = input.string;
                this.close();
            }, this);
            submit.node.on(Button.EventType.CLICK, async () => {
                if (this.submitting) return;
                if (submitted) {
                    AudioMgr.inst.play('button');
                    this.close();
                    return;
                }
                const content = input.string.trim();
                if (!content) { status.string = '请先填写您的问题或建议'; return; }
                if (content.length > 500) { status.string = '请将内容控制在500字以内'; return; }
                if (PlatformCloudMgr.inst.getPlatform() !== 'wechat') {
                    status.string = '请在微信小游戏内提交反馈';
                    return;
                }
                if (this.requestText !== content || !this.requestId) {
                    this.requestText = content;
                    this.requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
                }
                this.submitting = true;
                this.draft = input.string;
                submit.interactable = false;
                close.interactable = false;
                input.enabled = false;
                caption.string = '提交中…';
                status.string = '';
                let timeout: ReturnType<typeof setTimeout> | undefined;
                try {
                    const device = PlatformCloudMgr.inst.getSystemInfo();
                    const result = await Promise.race([
                        PlatformCloudMgr.inst.callFunction<{ ok: boolean; code?: string; feedbackId?: string }>('submitFeedback', {
                            requestId: this.requestId,
                            content,
                            source: 'home',
                            levelId: this.runtime.getAnalyticsLevelId?.() || 0,
                            device: device.device,
                            system: device.system,
                        }),
                        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('feedback submit timeout')), 15000); }),
                    ]);
                    if (this.disposed || !overlay.isValid) return;
                    if (!result?.ok || !result.feedbackId) {
                        status.string = result?.code === 'RATE_LIMITED' ? '提交太频繁，请稍后再试' : '提交未成功，请稍后重试';
                        return;
                    }
                    this.draft = '';
                    this.requestId = '';
                    this.requestText = '';
                    submitted = true;
                    input.string = '';
                    input.node.active = false;
                    status.node.active = false;
                    close.node.active = false;
                    title.active = false;
                    caption.node.active = false;
                    successTitle.active = true;
                    successMessage.active = true;
                    confirmLabel.active = true;
                } catch (error) {
                    console.error('[feedback] submit failed', error);
                    if (!this.disposed && overlay.isValid) status.string = '未能确认提交结果，请重试，内容已保留';
                } finally {
                    if (timeout) clearTimeout(timeout);
                    this.submitting = false;
                    if (!this.disposed && overlay.isValid) {
                        submit.interactable = true;
                        close.interactable = true;
                        if (!submitted) {
                            input.enabled = true;
                            caption.string = originalCaption;
                        }
                    }
                }
            }, this);
        } catch (error) {
            console.error('[feedback] open failed', error);
            this.close();
            if (!this.disposed && this.runtime.node?.isValid) this.runtime.showToast('反馈界面加载失败，请重试', 2);
        } finally {
            this.opening = false;
        }
    }

    private close(): void {
        const overlay = this.overlay;
        this.overlay = null;
        if (this.focus) { this.runtime.endModalFocus(this.focus); this.focus = ''; }
        if (overlay?.isValid) {
            overlay.active = false;
            this.runtime._closePanelWithTextureOwner(overlay, 'feedback', 'feedback-close');
            this.retained = false;
        }
        if (this.retained) {
            this.retained = false;
            this.runtime._releasePanelTextureOwner('feedback', 'feedback-close');
        }
    }

    dispose(): void { this.disposed = true; this.close(); }
}
