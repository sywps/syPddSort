import { getDouyinMiniGameRuntime, getMiniGameBuildPlatform } from './MiniGamePlatform';

type Data = Record<string, any>;
type Config = { mode: 'dev'; envID: string; serviceID: string; buildId: string };
const PUBLIC_PAGES = new Set(['app', 'startup', 'home', 'main_menu', 'douyin_sidebar',
    'gold_acquire_reward', 'vigor_recover', 'bean_skin_unlock', 'background_skin_unlock']);
const PLAY_MODES = new Set(['main', 'coop', 'pvp']);
// Load attempts are independent of played rounds (a previous settlement may still be alive).
export const RECOVERY_EVENTS = new Set(('level_preparation_failed level_recovery_started level_resources_prepared level_recovery_exhausted ' +
    'gameplay_entry_recovery_failed gameplay_recovery_home_failed gameplay_entry_vigor_refunded gameplay_entry_vigor_refund_failed ' +
    'level_recovery_playable next_level_prefetch_failed level_entry_draw_ready app_transition_asset_failed home_game_entry_failed ' +
    'level_manifest_request_failed level_manifest_cache_restored level_manifest_cache_write_failed level_manifest_cache_invalid ' +
    'level_pack_cache_invalid gameplay_fx_unavailable opening_guide_resource_failed gameplay_audio_failed').split(' '));

export function douyinMultiplayerLobbyEvent(event: Data): boolean {
    return ['coop', 'pvp'].includes(event.gameplayEntryMode)
        && event.page === event.gameplayEntryMode + '_lobby'
        && ['multiplayer_lobby_open', 'multiplayer_service_result'].includes(event.eventName);
}

function containsReplay(value: any, depth = 0): boolean {
    if (!value || typeof value !== 'object') return false;
    if (depth > 5) return true;
    return Object.keys(value).some(key => /replay|actions|boardTimeline|progressTimeline/i.test(key)
        || containsReplay(value[key], depth + 1));
}

export function douyinProfileAdEvent(event: Data): boolean {
    return ['profile_avatar_unlock', 'profile_frame_unlock'].includes(event.page)
        && /^(rewarded_ad_[a-z_]+|ad_click|ad_show|ad_finish|ad_reward_success)$/.test(event.eventName || '');
}

export function isDouyinAnalyticsPlatform(): boolean { return getMiniGameBuildPlatform() === 'douyin'; }

export function douyinAnalyticsConfig(): Config | null {
    const value = (globalThis as any).__PDD_DOUYIN_ANALYTICS__;
    // Production remains fail-closed until runtime-version semantics and production environment are verified.
    if (!isDouyinAnalyticsPlatform() || !value || value.mode !== 'dev' ||
        value.envID !== 'env-nvk6FNcrq5' || value.serviceID !== '1m0ub3f29wtv7' ||
        typeof value.buildId !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(value.buildId)) return null;
    return value;
}

export function douyinAnalyticsAllowed(): boolean {
    if (!douyinAnalyticsConfig()) return false;
    try { return ['ios', 'android'].includes(getDouyinMiniGameRuntime()?.getSystemInfoSync?.()?.platform); }
    catch (_) { return false; }
}

/** Explicitly public signals never inherit a previous gameplay round. */
export function douyinPublicEvent(event: Data): boolean {
    return /^(app_launch|game_start|app_show|app_hide|app_resume|app_background|analytics_quality)$|^startup_/.test(event.eventName || '')
        || PUBLIC_PAGES.has(event.page || '') || douyinProfileAdEvent(event) || RECOVERY_EVENTS.has(event.eventName);
}

export function douyinEventAllowed(name: string, event: Data): boolean {
    const modes = [event.gameplayEntryMode, event.extra?.gameplayEntryMode, event.extra?.entryMode].filter(Boolean);
    if (modes.some(mode => !PLAY_MODES.has(mode)) || new Set(modes).size > 1) return false;
    if (/(replay|experiment)/i.test(event.eventName || '') || /^(theme|external)(_|$)/i.test(event.page || '')) return false;
    const pageMode = /^(coop|pvp)(_|$)/i.exec(event.page || '')?.[1];
    if (pageMode && pageMode !== event.gameplayEntryMode) return false;
    if (containsReplay(event)) return false;
    if (douyinProfileAdEvent(event) && modes.some(mode => mode !== 'main')) return false;
    if (name === 'saveLevelRecord') return PLAY_MODES.has(event.gameplayEntryMode) && !!event.roundId;
    if (['coop', 'pvp'].includes(event.gameplayEntryMode)) return !!event.roundId || douyinMultiplayerLobbyEvent(event);
    return event.gameplayEntryMode === 'main' || douyinPublicEvent(event);
}

export function douyinAnalyticsPayload(name: string, data: Data): Data {
    const result = { ...data };
    if (['coop', 'pvp'].includes(result.gameplayEntryMode) && ['theme_level', 'level_game'].includes(result.page)) {
        result.page = result.gameplayEntryMode + '_game';
    }
    // Experimental allocation remains a separate WeChat feature. CDN slot is not an experiment bucket.
    const experimentField = /experiment|abId|abBucket|^(firstLevelContentVersion|firstLevelEnrolledAt|thirdLevelEnrolledAt|beanSelectionEnrolledAt|encouragementEnrolledAt)$/i;
    for (const key of Object.keys(result)) if (experimentField.test(key)) delete result[key];
    if (result.extra) {
        result.extra = { ...result.extra };
        for (const key of Object.keys(result.extra)) if (experimentField.test(key)) delete result.extra[key];
        if (result.source === 'level_data') {
            // FirstLevelRouteModule already exposes the useful CDN state as flat fields.
            // Do not send its full availability object (arrays and nested runtime state).
            delete result.extra.levelDataCdn;
            if (Array.isArray(result.extra.jsonKeys) && result.extra.jsonKeys.every((key: unknown) => typeof key === 'string')) {
                result.extra.jsonKeys = result.extra.jsonKeys.slice(0, 12).map((key: string) => key.slice(0, 64)).join(',');
            }
            result.extra.loadingDiagnosticsVersion = 1;
        }
        result.extra.clientBuildId = douyinAnalyticsConfig()?.buildId || '';
        result.extra.clientBuildIdSource = 'douyin_build_marker';
    }
    if (name !== 'saveLevelRecord' && douyinPublicEvent(result)) {
        if (RECOVERY_EVENTS.has(result.eventName)) {
            result.extra = { ...result.extra, targetLevelId: result.extra?.targetLevelId ?? (result.levelId || 0) };
            result.page = 'app';
        }
        result.roundId = ''; result.gameplayEntryMode = ''; result.levelId = 0;
        result.logicalLevelId = 0; result.physicalLevelId = 0;
        if (!result.page) result.page = 'app';
    }
    if (name !== 'saveLevelRecord' && douyinProfileAdEvent(result)) {
        // Profile ads have an ad transaction, but no gameplay round or inherited level clock.
        for (const key of ['gameplayMode', 'gameplaySchemaVersion', 'levelDataSource',
            'elapsedMsFromRoundStart', 'elapsedMsFromLevelReady', 'failureId', 'failureReason']) delete result[key];
        if (result.extra) for (const key of ['gameplayMode', 'gameplaySchemaVersion', 'gameplayEntryMode',
            'entryMode', 'roundId', 'levelId', 'logicalLevelId', 'physicalLevelId', 'levelDataSource']) delete result.extra[key];
    }
    result.clientBuildId = douyinAnalyticsConfig()?.buildId || '';
    result.cdnSlot = (globalThis as any).__PDD_CDN_SLOT__ || '';
    result.platform = 'douyin';
    return result;
}

export class DouyinAnalyticsTransport {
    async identity(): Promise<string> {
        const result = await this.call('analyticsIdentity', {});
        if (!result?.ok || !/^[a-f0-9]{64}$/.test(result.subjectId || '')) throw new Error('douyin analytics identity unavailable');
        return result.subjectId;
    }
    async call(name: string, data: Data): Promise<any> {
        if (!['analyticsIdentity', 'addFunnelEvents', 'addBehaviorData', 'saveLevelRecord'].includes(name)) {
            throw new Error('douyin analytics endpoint not allowed');
        }
        if (!douyinAnalyticsAllowed()) throw new Error('douyin analytics runtime disabled');
        const config = douyinAnalyticsConfig()!;
        const api = getDouyinMiniGameRuntime();
        if (typeof api?.createCloud !== 'function') throw new Error('douyin analytics createCloud unavailable');
        const cloud = api.createCloud({ envID: config.envID, serviceID: config.serviceID });
        return new Promise((resolve, reject) => {
            let done = false;
            const finish = (error: Error | null, value?: any) => {
                if (done) return; done = true; clearTimeout(timer);
                if (error) reject(error); else resolve(value);
            };
            const timer = setTimeout(() => finish(new Error('douyin analytics request timeout')), 16000);
            try {
                const request = cloud.callContainer({ path: '/' + name,
                    init: { method: 'POST', header: { 'content-type': 'application/json' }, body: data, timeout: 15000 },
                    success(res: any) {
                        if (res?.statusCode !== 200) return finish(new Error('douyin analytics HTTP request failed'));
                        let result;
                        try { result = typeof res.data === 'string' ? JSON.parse(res.data) : res.data; }
                        catch (_) { return finish(new Error('douyin analytics invalid JSON response')); }
                        if (!result || typeof result.ok !== 'boolean' || result.analyticsEnvironment !== 'douyin_dev') {
                            return finish(new Error('douyin analytics invalid acknowledgement'));
                        }
                        // Only structured status fields used by delivery; never expose raw server error messages.
                        finish(null, { ok: result.ok, subjectId: result.subjectId, count: result.count,
                            acknowledgedIds: result.acknowledgedIds, rejectedIds: result.rejectedIds,
                            errorCode: /^[A-Z_]{1,64}$/.test(result.errorCode || '') ? result.errorCode : '',
                            errorMessage: result.ok ? '' : 'douyin analytics rejected request' });
                    }, fail() { finish(new Error('douyin analytics network request failed')); }
                });
                if (request?.catch) request.catch(() => finish(new Error('douyin analytics request rejected')));
            } catch (_) { finish(new Error('douyin analytics request failed')); }
        });
    }
}
