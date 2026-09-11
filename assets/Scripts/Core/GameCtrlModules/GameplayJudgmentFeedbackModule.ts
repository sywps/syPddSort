import {
    AudioMgr,
    Layers,
    Node,
    Sprite,
    SpriteFrame,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
} from '../GameCtrlShared';
import type { SfxName } from '../AudioManifest';

export const GAMEPLAY_JUDGMENT_DURATION_SECONDS = 1;
export const GAMEPLAY_JUDGMENT_VOICE_LOCK_MS = 1180;

type GameplayJudgmentEntry = {
    key: string;
    textureName: string;
    voice: SfxName;
};

export const GAMEPLAY_JUDGMENT_ENTRIES: ReadonlyArray<GameplayJudgmentEntry> = [
    { key: 'great', textureName: 'judgment_Great_green', voice: 'judgmentGreat' },
    { key: 'awesome', textureName: 'judgment_Awesome_orange', voice: 'judgmentAwesome' },
    { key: 'amazing', textureName: 'judgment_Amazing_red', voice: 'judgmentAmazing' },
    { key: 'excellent', textureName: 'judgment_Excellent_blue', voice: 'judgmentExcellent' },
    { key: 'perfect', textureName: 'judgment_Perfect_purple', voice: 'judgmentPerfect' },
    { key: 'unbelievable', textureName: 'judgment_Unbelievable_pink', voice: 'judgmentUnbelievable' },
];

export const GAMEPLAY_JUDGMENT_TEXTURE_NAMES = [
    ...GAMEPLAY_JUDGMENT_ENTRIES.map((entry) => entry.textureName),
];

export const GAMEPLAY_JUDGMENT_PRELOAD_SFX_NAMES: SfxName[] = [
    'winColor',
    ...GAMEPLAY_JUDGMENT_ENTRIES.map((entry) => entry.voice),
];

const GAMEPLAY_JUDGMENT_ROOT_NAME = 'GameplayJudgmentFeedback';
const GAMEPLAY_JUDGMENT_MAX_WIDTH = 640;
const GAMEPLAY_JUDGMENT_SCALE_MULTIPLIER = 0.85;
const GAMEPLAY_JUDGMENT_VERTICAL_RATIO = 0.31;
const GAMEPLAY_JUDGMENT_WORD_START_SECONDS = 0.067;
const GAMEPLAY_JUDGMENT_DELAYED_WORD_START_SECONDS = 0.167;
const GAMEPLAY_JUDGMENT_FADE_OUT_START_SECONDS = 0.85;
const GAMEPLAY_JUDGMENT_FADE_OUT_SECONDS = 0.15;

function createGameplayJudgmentError(message: string): Error {
    return new Error(`[gameplay-judgment] ${message}`);
}

function getSpriteFrameSize(frame: SpriteFrame): { width: number; height: number } {
    const originalSize = frame.originalSize;
    const rect = frame.rect;
    return {
        width: Math.max(1, Number(originalSize?.width || rect?.width) || 1),
        height: Math.max(1, Number(originalSize?.height || rect?.height) || 1),
    };
}

function createSpriteNode(name: string, frame: SpriteFrame): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    const transform = node.addComponent(UITransform);
    const size = getSpriteFrameSize(frame);
    transform.setContentSize(size.width, size.height);
    const sprite = node.addComponent(Sprite);
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    return node;
}

export function installGameplayJudgmentFeedbackMethods(target: any): void {
    Object.assign(target, {
        preloadGameplayJudgmentFeedback(onDone?: (error?: Error) => void): void {
            const seq = (Number(this._gameplayJudgmentPreloadSeq) || 0) + 1;
            this._gameplayJudgmentPreloadSeq = seq;
            this._gameplayJudgmentPreloadReady = false;
            this._gameplayJudgmentPreloadError = null;
            if (typeof this._ensureSpriteFramesByName !== 'function') {
                const error = createGameplayJudgmentError('SpriteFrame loader unavailable');
                this._gameplayJudgmentPreloadError = error;
                onDone?.(error);
                return;
            }
            this._ensureSpriteFramesByName(GAMEPLAY_JUDGMENT_TEXTURE_NAMES, (error?: Error) => {
                if (seq !== Number(this._gameplayJudgmentPreloadSeq) || !this.isValid) return;
                if (error) {
                    const wrapped = createGameplayJudgmentError(error.message);
                    this._gameplayJudgmentPreloadError = wrapped;
                    console.error(wrapped.message);
                    onDone?.(wrapped);
                    return;
                }
                this._gameplayJudgmentPreloadReady = true;
                onDone?.();
            });
        },

        requestGameplayJudgmentFeedback(): void {
            const requestTimeMs = Date.now();
            if (requestTimeMs < Math.max(0, Number(this._gameplayJudgmentVoiceLockedUntilMs) || 0)) return;
            this._gameplayJudgmentPending = true;
            this._gameplayJudgmentVisualEndsAtMs = Math.max(
                Math.max(0, Number(this._gameplayJudgmentVisualEndsAtMs) || 0),
                requestTimeMs + GAMEPLAY_JUDGMENT_DURATION_SECONDS * 1000,
            );
            if (this._gameplayJudgmentRequestScheduled) return;
            this._gameplayJudgmentRequestScheduled = true;
            if (typeof this.scheduleOnce !== 'function') {
                throw createGameplayJudgmentError('scheduler unavailable');
            }
            this.scheduleOnce(this.flushGameplayJudgmentFeedback, 0);
        },

        flushGameplayJudgmentFeedback(): void {
            this._gameplayJudgmentRequestScheduled = false;
            if (!this._gameplayJudgmentPending) return;
            this._gameplayJudgmentPending = false;
            if (Date.now() < Math.max(0, Number(this._gameplayJudgmentVoiceLockedUntilMs) || 0)) return;
            const completedColorCount = Math.max(1, Number(this._completedColors?.size) || 1);
            const entryIndex = Math.min(GAMEPLAY_JUDGMENT_ENTRIES.length, completedColorCount) - 1;
            const entry = GAMEPLAY_JUDGMENT_ENTRIES[entryIndex];
            if (!entry) throw createGameplayJudgmentError(`no entry for completedColorCount=${completedColorCount}`);
            const requestGeneration = Number(this._gameplayJudgmentRequestGeneration) || 0;
            const play = () => {
                if (requestGeneration !== (Number(this._gameplayJudgmentRequestGeneration) || 0) || !this.isValid) return;
                this.playGameplayJudgmentFeedback(entry);
            };
            if (this._gameplayJudgmentPreloadError) throw this._gameplayJudgmentPreloadError;
            if (this._gameplayJudgmentPreloadReady) {
                play();
                return;
            }
            this.preloadGameplayJudgmentFeedback((error?: Error) => {
                if (error) throw error;
                play();
            });
        },

        playGameplayJudgmentFeedback(entry: GameplayJudgmentEntry): void {
            const wordFrame = this.getSF?.(entry.textureName) as SpriteFrame | null;
            if (!wordFrame) {
                throw createGameplayJudgmentError(`required SpriteFrame missing: ${entry.textureName}`);
            }
            const fxRoot = typeof this.requireCanvasUiRoot === 'function'
                ? this.requireCanvasUiRoot('FxRoot')
                : null;
            if (!fxRoot?.isValid) throw createGameplayJudgmentError('FxRoot unavailable');

            this.clearGameplayJudgmentVisual();
            const container = new Node(GAMEPLAY_JUDGMENT_ROOT_NAME);
            container.layer = Layers.Enum.UI_2D;
            const wordSize = getSpriteFrameSize(wordFrame);
            const transform = container.addComponent(UITransform);
            transform.setContentSize(wordSize.width, wordSize.height);
            fxRoot.addChild(container);

            const word = createSpriteNode('Word', wordFrame);
            word.setPosition(0, 0, 0);
            word.setScale(0.3, 0.3, 1);
            const wordOpacity = word.addComponent(UIOpacity);
            wordOpacity.opacity = 0;
            container.addChild(word);

            const fxRootSize = fxRoot.getComponent(UITransform)?.contentSize;
            const fxRootWidth = Number(fxRootSize?.width) || 720;
            const fxRootHeight = Number(fxRootSize?.height) || 1280;
            const displayScale = Math.min(
                1,
                Math.max(0.1, Math.min(GAMEPLAY_JUDGMENT_MAX_WIDTH, fxRootWidth - 48)
                    / wordSize.width),
            );
            container.setPosition(0, fxRootHeight * GAMEPLAY_JUDGMENT_VERTICAL_RATIO, 0);
            container.setScale(
                displayScale * GAMEPLAY_JUDGMENT_SCALE_MULTIPLIER,
                displayScale * GAMEPLAY_JUDGMENT_SCALE_MULTIPLIER,
                1,
            );
            this._gameplayJudgmentRoot = container;
            const playSeq = (Number(this._gameplayJudgmentPlaySeq) || 0) + 1;
            this._gameplayJudgmentPlaySeq = playSeq;
            this._gameplayJudgmentVoiceLockedUntilMs = Date.now() + GAMEPLAY_JUDGMENT_VOICE_LOCK_MS;
            this._gameplayJudgmentVisualEndsAtMs = Date.now() + GAMEPLAY_JUDGMENT_DURATION_SECONDS * 1000;
            AudioMgr.inst.play(entry.voice);

            const wordStartSeconds = entry.key === 'awesome' || entry.key === 'amazing'
                ? GAMEPLAY_JUDGMENT_DELAYED_WORD_START_SECONDS
                : GAMEPLAY_JUDGMENT_WORD_START_SECONDS;
            tween(wordOpacity)
                .delay(wordStartSeconds)
                .to(0.03, { opacity: 255 })
                .delay(GAMEPLAY_JUDGMENT_FADE_OUT_START_SECONDS - wordStartSeconds - 0.03)
                .to(GAMEPLAY_JUDGMENT_FADE_OUT_SECONDS, { opacity: 0 })
                .start();
            tween(word)
                .delay(wordStartSeconds)
                .to(0.15, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
                .to(0.15, { scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' })
                .delay(0.15)
                .to(0.12, { position: new Vec3(0, 5, 0) }, { easing: 'sineInOut' })
                .to(0.12, { position: new Vec3(0, 0, 0) }, { easing: 'sineInOut' })
                .start();
            tween(container)
                .delay(GAMEPLAY_JUDGMENT_DURATION_SECONDS)
                .call(() => {
                    if (playSeq !== Number(this._gameplayJudgmentPlaySeq)) return;
                    this.clearGameplayJudgmentVisual();
                })
                .start();
        },

        clearGameplayJudgmentVisual(): void {
            const root = this._gameplayJudgmentRoot as Node | null;
            this._gameplayJudgmentRoot = null;
            this._gameplayJudgmentVisualEndsAtMs = 0;
            if (!root?.isValid) return;
            const stopTweens = (node: Node) => {
                Tween.stopAllByTarget(node);
                const opacity = node.getComponent(UIOpacity);
                if (opacity) Tween.stopAllByTarget(opacity);
                for (const child of node.children) stopTweens(child);
            };
            stopTweens(root);
            root.removeFromParent();
            root.destroy();
        },

        waitForGameplayJudgmentFeedback(onDone?: () => void): void {
            const remainingSeconds = Math.max(
                0,
                (Math.max(0, Number(this._gameplayJudgmentVisualEndsAtMs) || 0) - Date.now()) / 1000,
            );
            if (remainingSeconds <= 0 || typeof this.scheduleOnce !== 'function') {
                onDone?.();
                return;
            }
            this.scheduleOnce(() => this.waitForGameplayJudgmentFeedback(onDone), remainingSeconds);
        },

        clearGameplayJudgmentFeedback(): void {
            this._gameplayJudgmentRequestGeneration = (Number(this._gameplayJudgmentRequestGeneration) || 0) + 1;
            this._gameplayJudgmentPreloadSeq = (Number(this._gameplayJudgmentPreloadSeq) || 0) + 1;
            this._gameplayJudgmentRequestScheduled = false;
            this._gameplayJudgmentPending = false;
            this._gameplayJudgmentVoiceLockedUntilMs = 0;
            this._gameplayJudgmentVisualEndsAtMs = 0;
            this._gameplayJudgmentPreloadReady = false;
            this._gameplayJudgmentPreloadError = null;
            if (typeof this.unschedule === 'function') this.unschedule(this.flushGameplayJudgmentFeedback);
            this.clearGameplayJudgmentVisual();
        },
    });
}
