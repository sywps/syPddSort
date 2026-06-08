import { director } from 'cc';
import { AppSession, type AppSceneName } from './AppSession';

function isSceneTraceEnabled(): boolean {
    try {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            return params.get('debug') === '1' || params.get('log') === '1' || !!params.get('ab');
        }
    } catch (_) { /* ignore */ }
    try {
        const wx = (globalThis as any).__rawWx || (globalThis as any).wx;
        const query = wx?.getLaunchOptionsSync?.()?.query;
        return query?.debug === '1' || query?.log === '1' || !!query?.ab;
    } catch (_) {
        return false;
    }
}

function logSceneTrace(...args: unknown[]): void {
    if (!isSceneTraceEnabled()) return;
    console.log(...args);
}

export class SceneRouter {
    readonly loadingSceneName: AppSceneName = 'Loading';
    readonly homeSceneName: AppSceneName = 'Home';
    readonly gameSceneName: AppSceneName = 'Game';
    private _transitioning = false;

    constructor(private readonly session: AppSession) {}

    get isTransitioning(): boolean {
        return this._transitioning;
    }

    attachCurrentScene(sceneName: AppSceneName): void {
        this.session.setCurrentSceneName(sceneName);
    }

    requestHomeScene(): void {
        this.session.requestScene(this.homeSceneName);
    }

    requestGameScene(): void {
        this.session.requestScene(this.gameSceneName);
    }

    logTransitionTrace(label: string, extra: Record<string, unknown> = {}): void {
        logSceneTrace(
            label,
            JSON.stringify({
                current: this.session.currentSceneName,
                requested: this.session.requestedSceneName,
                visualState: this.session.visualState,
                hasPendingGameplay: !!this.session.pendingGameplayRequest,
                hasActiveGameplay: !!this.session.activeGameplayContext,
                ...extra,
            }),
        );
    }

    async toLoading(): Promise<void> {
        await this.loadScene(this.loadingSceneName);
    }

    async toHome(): Promise<void> {
        await this.loadScene(this.homeSceneName);
    }

    async toGame(): Promise<void> {
        await this.loadScene(this.gameSceneName);
    }

    private async loadScene(sceneName: AppSceneName): Promise<void> {
        if (this._transitioning) {
            throw new Error(`[SceneRouter] scene transition already in flight: ${this.session.requestedSceneName}`);
        }
        this._transitioning = true;
        logSceneTrace(
            '[SceneSplitTrace] loadScene:start',
            JSON.stringify({
                from: this.session.currentSceneName,
                requestedBefore: this.session.requestedSceneName,
                to: sceneName,
                visualState: this.session.visualState,
                hasPendingGameplay: !!this.session.pendingGameplayRequest,
                hasActiveGameplay: !!this.session.activeGameplayContext,
            }),
        );
        this.session.requestScene(sceneName);
        try {
            await new Promise<void>((resolve, reject) => {
                try {
                    director.loadScene(sceneName, () => {
                        this.session.setCurrentSceneName(sceneName);
                        logSceneTrace(
                            '[SceneSplitTrace] loadScene:callback',
                            JSON.stringify({
                                current: this.session.currentSceneName,
                                requested: this.session.requestedSceneName,
                                to: sceneName,
                                visualState: this.session.visualState,
                                hasPendingGameplay: !!this.session.pendingGameplayRequest,
                                hasActiveGameplay: !!this.session.activeGameplayContext,
                            }),
                        );
                        resolve();
                    });
                } catch (error) {
                    reject(error);
                }
            });
        } finally {
            this._transitioning = false;
            logSceneTrace(
                '[SceneSplitTrace] loadScene:finish',
                JSON.stringify({
                    current: this.session.currentSceneName,
                    requested: this.session.requestedSceneName,
                    to: sceneName,
                    visualState: this.session.visualState,
                    hasPendingGameplay: !!this.session.pendingGameplayRequest,
                    hasActiveGameplay: !!this.session.activeGameplayContext,
                }),
            );
        }
    }
}
