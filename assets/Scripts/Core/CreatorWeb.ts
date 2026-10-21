import { isMiniGameRuntime } from './MiniGamePlatform';

export type CreatorWebConfig = { version: 1; mainLevels: number[] };

/** Set only by the dedicated web build, before any game module is evaluated. */
export function getCreatorWebConfig(): CreatorWebConfig | null {
    if (typeof window === 'undefined' || isMiniGameRuntime()) return null;
    const config = (window as any).__PDD_CREATOR_WEB__;
    return config?.version === 1 ? config : null;
}

export function isCreatorWeb(): boolean { return getCreatorWebConfig() !== null; }
