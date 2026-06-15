export type AppSceneName = 'Home' | 'Game' | 'Boot';
export type AppVisualState = 'boot' | 'home' | 'game';
export type AppGameplayEntryMode = 'main' | 'theme' | 'external';
export type AppSceneTransitionCoverMode = 'auto' | 'cover' | 'none';
export type AppGameplayEntryCoverMode = AppSceneTransitionCoverMode;

export interface PendingGameplayRequest {
    levelId: number;
    prefix: string;
    entryMode: AppGameplayEntryMode;
    entryCoverMode: AppGameplayEntryCoverMode;
    requestedAt: number;
}

export interface ActiveGameplayContext extends PendingGameplayRequest {
    activeLevelId: number;
    activatedAt: number;
}

export interface PendingHomeToast {
    text: string;
    duration: number;
}

export class AppSession {
    private _currentSceneName: AppSceneName = 'Game';
    private _requestedSceneName: AppSceneName = 'Game';
    private _visualState: AppVisualState = 'boot';
    private _bootRouteGuardKey = '';
    private _bootRouteConsumed = false;
    private _pendingGameplayRequest: PendingGameplayRequest | null = null;
    private _activeGameplayContext: ActiveGameplayContext | null = null;
    private _pendingHomeToast: PendingHomeToast | null = null;

    get currentSceneName(): AppSceneName {
        return this._currentSceneName;
    }

    get requestedSceneName(): AppSceneName {
        return this._requestedSceneName;
    }

    get visualState(): AppVisualState {
        return this._visualState;
    }

    get pendingGameplayRequest(): PendingGameplayRequest | null {
        return this._pendingGameplayRequest;
    }

    get activeGameplayContext(): ActiveGameplayContext | null {
        return this._activeGameplayContext;
    }

    setCurrentSceneName(sceneName: AppSceneName): void {
        this._currentSceneName = sceneName;
    }

    requestScene(sceneName: AppSceneName): void {
        this._requestedSceneName = sceneName;
    }

    markVisualState(state: AppVisualState): void {
        this._visualState = state;
    }

    resetBootRouteGuard(guardKey: string = ''): void {
        if (guardKey && this._bootRouteGuardKey === guardKey) {
            return;
        }
        this._bootRouteGuardKey = guardKey;
        this._bootRouteConsumed = false;
    }

    consumeBootRoute(): boolean {
        if (this._bootRouteConsumed) {
            return false;
        }
        this._bootRouteConsumed = true;
        return true;
    }

    clearPendingGameplayRequest(): void {
        this._pendingGameplayRequest = null;
    }

    clearActiveGameplayContext(): void {
        this._activeGameplayContext = null;
    }

    clearGameplayContext(): void {
        this._pendingGameplayRequest = null;
        this._activeGameplayContext = null;
    }

    setPendingHomeToast(text: string, duration: number = 2.5): void {
        const trimmed = String(text || '').trim();
        if (!trimmed) return;
        this._pendingHomeToast = {
            text: trimmed,
            duration: Math.max(0.5, Number(duration) || 2.5),
        };
    }

    consumePendingHomeToast(): PendingHomeToast | null {
        const toast = this._pendingHomeToast;
        this._pendingHomeToast = null;
        return toast;
    }

    markPendingGameplayRequest(
        levelId: number,
        prefix: string,
        entryMode: AppGameplayEntryMode,
        entryCoverMode: AppGameplayEntryCoverMode = 'auto',
    ): PendingGameplayRequest {
        const request: PendingGameplayRequest = {
            levelId: Math.max(1, Math.floor(Number(levelId) || 1)),
            prefix: String(prefix || 'level_'),
            entryMode,
            entryCoverMode,
            requestedAt: Date.now(),
        };
        this._pendingGameplayRequest = request;
        this._requestedSceneName = 'Game';
        return request;
    }

    markActiveGameplayContext(
        activeLevelId: number,
        prefix: string,
        entryMode: AppGameplayEntryMode,
    ): ActiveGameplayContext {
        const now = Date.now();
        const pending = this._pendingGameplayRequest;
        const context: ActiveGameplayContext = {
            levelId: pending?.levelId ?? Math.max(1, Math.floor(Number(activeLevelId) || 1)),
            prefix: String(prefix || pending?.prefix || 'level_'),
            entryMode,
            entryCoverMode: pending?.entryCoverMode ?? 'auto',
            requestedAt: pending?.requestedAt ?? now,
            activeLevelId: Math.max(1, Math.floor(Number(activeLevelId) || 1)),
            activatedAt: now,
        };
        this._activeGameplayContext = context;
        this._pendingGameplayRequest = null;
        this._requestedSceneName = 'Game';
        this._visualState = 'game';
        return context;
    }
}
