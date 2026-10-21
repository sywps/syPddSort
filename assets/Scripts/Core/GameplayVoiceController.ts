import { sys } from 'cc';
import { AppRoot } from './AppRoot';
import { AudioMgr, type VoiceKind } from './AudioMgr';
import { GAMEPLAY_VOICE_NAMES, type SfxName } from './AudioManifest';

const DAILY_VOICE_KEY = 'pdd.voice.daily';
type DailyVoiceRecord = {
    date: string; count: number; hintCount: number; lastHintAt: number; lastHintVoiceCount: number; lastWin: string;
};

function canRemind(record: DailyVoiceRecord): boolean {
    if (record.hintCount >= 3) return false;
    return record.hintCount === 0 ? record.count >= 5
        : record.count - record.lastHintVoiceCount >= 10 && Date.now() - record.lastHintAt >= 10 * 60 * 1000;
}

function readDailyRecord(): DailyVoiceRecord {
    const now = new Date();
    const date = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const empty = { date, count: 0, hintCount: 0, lastHintAt: 0, lastHintVoiceCount: 0, lastWin: '' };
    try {
        const raw = sys.localStorage.getItem(DAILY_VOICE_KEY);
        if (!raw) return empty;
        const record = JSON.parse(raw);
        if (record.date !== date) return empty;
        if (!Number.isInteger(record.count) || record.count < 0) {
            throw new Error('Invalid daily voice record');
        }
        // The previous version only stored whether today's reminder had started.
        // Preserve that occurrence and start a conservative cooldown on migration.
        if (record.hintCount === undefined && typeof record.hinted === 'boolean') {
            const migrated = { ...empty, count: record.count, lastWin: record.lastWin || '',
                hintCount: record.hinted ? 1 : 0, lastHintAt: record.hinted ? Date.now() : 0,
                lastHintVoiceCount: record.hinted ? record.count : 0 };
            saveDailyRecord(migrated);
            return migrated;
        }
        if (!Number.isInteger(record.hintCount) || record.hintCount < 0
            || !Number.isFinite(record.lastHintAt) || record.lastHintAt < 0
            || !Number.isInteger(record.lastHintVoiceCount) || record.lastHintVoiceCount < 0
            || record.lastHintVoiceCount > record.count) throw new Error('Invalid reminder history');
        return { ...empty, ...record };
    } catch (error) {
        console.warn('[Voice] Cannot read daily playback record:', error);
        return empty;
    }
}

function saveDailyRecord(record: DailyVoiceRecord): void {
    try { sys.localStorage.setItem(DAILY_VOICE_KEY, JSON.stringify(record)); }
    catch (error) { console.error('[Voice] Cannot save daily playback record:', error); }
}

/** Gameplay owns trigger lifetime; AudioMgr owns the single narrator channel. */
export class GameplayVoiceController {
    private warningAttempted = false;
    private winAttempted = false;
    private revivePanel: any = null;
    private homeReady = false;
    private homeAttempted = false;
    private homeIdleSeconds = 0;
    private homeAudioVersion = 0;

    constructor(private readonly runtime: any) {}

    private isAlive(): boolean { return !!this.runtime.node?.isValid; }

    private isSinglePlayer(): boolean {
        const mode = this.runtime._activeGameplayEntryMode;
        return (mode === 'main' || mode === 'theme')
            && !this.runtime.isRankedPvpMode?.() && !this.runtime.isCoopMode?.();
    }

    private isTransitioning(): boolean {
        const app = AppRoot.tryGet();
        return !!this.runtime._gameplayTransitionPromise || !!this.runtime._settlementNextTransitioning || !!app?.router.isTransitioning
            || !!app?.session.pendingGameplayRequest;
    }

    beginLevel(): void {
        this.dispose();
        this.warningAttempted = false;
        this.winAttempted = false;
        this.revivePanel = null;
        if (!this.isSinglePlayer()) return;
        for (const name of GAMEPLAY_VOICE_NAMES) {
            AudioMgr.inst.preload(name, error => {
                if (error) console.error('[Voice] Gameplay voice preload failed:', name, error);
            });
        }
    }

    private request(name: SfxName, kind: VoiceKind, isCurrent: () => boolean): boolean {
        const initSeq = this.runtime._gameplayInitSeq;
        const sceneName = this.runtime.getRuntimeSceneName('Game');
        const accepted = AudioMgr.inst.playVoice(name, kind, {
            isCurrent,
            finishSentence: true,
            canContinue: () => this.isAlive() && this.runtime._gameplayInitSeq === initSeq
                && this.runtime.getRuntimeSceneName('Game') === sceneName && !this.isTransitioning()
                && !this.runtime._adShowing && !this.runtime._shareShowing,
            onStarted: () => {
                if (name === 'voiceHint') return;
                const record = readDailyRecord();
                record.count += 1;
                if (name === 'voiceWin1' || name === 'voiceWin2') record.lastWin = name;
                saveDailyRecord(record);
            },
            onCompleted: () => {
                if (name !== 'voiceHint') return;
                const record = readDailyRecord();
                record.hintCount += 1;
                record.lastHintAt = Date.now();
                record.lastHintVoiceCount = record.count;
                saveDailyRecord(record);
            },
        });
        return accepted;
    }

    warn(isDangerous: () => boolean): void {
        if (this.warningAttempted || !this.isSinglePlayer()) return;
        const initSeq = this.runtime._gameplayInitSeq;
        const isCurrent = () => this.isAlive() && this.runtime._gameplayInitSeq === initSeq
            && !this.runtime.isGameEnd && !this.isTransitioning()
            && !this.runtime._adShowing && !this.runtime._shareShowing
            && !this.runtime._modalFocusRefs
            && !this.runtime._pchConveyorGameplayController?.isOpeningGuideActive?.()
            && isDangerous();
        if (this.request('voiceWarn', 'warning', isCurrent)) this.warningAttempted = true;
    }

    win(panel: any, levelId: number): void {
        if (this.winAttempted || !this.isSinglePlayer()) return;
        this.winAttempted = true;
        const last = readDailyRecord().lastWin;
        const firstLevel = this.runtime._activeGameplayEntryMode === 'main' && levelId === 1;
        const name = firstLevel || last === 'voiceWin2' ? 'voiceWin1'
            : last === 'voiceWin1' ? 'voiceWin2'
            : Math.random() < 0.5 ? 'voiceWin1' : 'voiceWin2';
        this.request(name, 'result', this.resultIsCurrent(panel));
    }

    revive(panel: any): void {
        if (this.revivePanel === panel || !this.isSinglePlayer()) return;
        this.revivePanel = panel;
        const percent = this.runtime.getBoardCompletionStats().completePercent;
        if (!Number.isFinite(percent)) {
            console.error('[Voice] Revive completion percentage is invalid:', percent);
            return;
        }
        const candidates: SfxName[] = ['voiceRebirth1', 'voiceRebirth2'];
        if (percent >= 80) candidates.push('voiceRebirth3');
        this.request(candidates[Math.floor(Math.random() * candidates.length)], 'result', this.resultIsCurrent(panel));
    }

    private resultIsCurrent(panel: any): () => boolean {
        const initSeq = this.runtime._gameplayInitSeq;
        return () => this.isAlive() && this.runtime._gameplayInitSeq === initSeq
            && this.runtime.isGameEnd && !!panel?.activeInHierarchy && !this.isTransitioning()
            && !this.runtime._adShowing && !this.runtime._shareShowing;
    }

    resumedAfterRevive(): void {
        this.revivePanel = null;
        AudioMgr.inst.cancelPendingResultVoice();
    }

    homeShown(): void {
        this.homeReady = true;
        this.homeAttempted = false;
        this.homeIdleSeconds = 0;
        this.homeAudioVersion = AudioMgr.inst.getVoiceCancellationVersion();
        const record = readDailyRecord();
        if (canRemind(record)) {
            AudioMgr.inst.preload('voiceHint', error => {
                if (error) console.error('[Voice] Settings reminder preload failed:', error);
            });
        }
    }

    private isHomeIdle(): boolean {
        if (!this.isAlive() || this.runtime.getRuntimeSceneName('Game') !== 'Home' || this.isTransitioning()) return false;
        if (this.runtime._modalFocusRefs || this.runtime._adShowing || this.runtime._shareShowing) return false;
        const popupRoot = this.runtime.requireCanvasUiRoot('PopupRoot');
        return !popupRoot.children.some((node: any) => node.activeInHierarchy);
    }

    update(dt: number): void {
        AudioMgr.inst.updateVoicePlayback();
        if (!this.homeReady) return;
        if (this.homeAudioVersion !== AudioMgr.inst.getVoiceCancellationVersion()) {
            this.homeAudioVersion = AudioMgr.inst.getVoiceCancellationVersion();
            this.homeAttempted = false;
            this.homeIdleSeconds = 0;
        }
        if (this.homeAttempted) return;
        if (!AudioMgr.inst.canPlayVoice() || !this.isHomeIdle()) {
            this.homeIdleSeconds = 0;
            return;
        }
        this.homeIdleSeconds += Math.max(0, Math.min(dt, 0.25));
        if (this.homeIdleSeconds < 3) return;
        const record = readDailyRecord();
        if (!canRemind(record)) return;
        this.homeAttempted = this.request('voiceHint', 'hint', () => this.homeReady && this.isHomeIdle());
    }

    dispose(): void {
        this.homeReady = false;
        AudioMgr.inst.stopVoice();
    }
}

export function ensureGameplayVoiceController(runtime: any): GameplayVoiceController {
    if (!runtime._gameplayVoiceController) runtime._gameplayVoiceController = new GameplayVoiceController(runtime);
    return runtime._gameplayVoiceController;
}
