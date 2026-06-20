import { getMiniGameBuildMode } from './MiniGamePlatform';

export function isRuntimeDebugLogEnabled(): boolean {
    return getMiniGameBuildMode() !== 'release';
}

export function runtimeLog(...args: unknown[]): void {
    if (isRuntimeDebugLogEnabled()) console.log(...args);
}

export function runtimeWarn(...args: unknown[]): void {
    if (isRuntimeDebugLogEnabled()) console.warn(...args);
}
