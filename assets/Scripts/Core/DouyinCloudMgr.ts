import { _decorator } from 'cc';
import { getDouyinMiniGameRuntime, isDouyinMiniGameRuntime } from './MiniGamePlatform';

const { ccclass } = _decorator;

type DouyinCloudCallOptions = {
    name?: string;
    path?: string;
    method?: string;
    data?: Record<string, unknown>;
    config?: Record<string, unknown>;
    success?: (res: any) => void;
    fail?: (err: any) => void;
};

type DouyinCloudClient = {
    init?: (options?: Record<string, unknown>) => unknown;
    callFunction?: (options: DouyinCloudCallOptions) => unknown;
    callContainer?: (options: DouyinCloudCallOptions) => unknown;
};

function readGlobalString(name: string): string {
    const globalScope: any = typeof globalThis !== 'undefined' ? globalThis : null;
    const windowScope: any = typeof window !== 'undefined' ? window : null;
    return String(globalScope?.[name] || windowScope?.[name] || '');
}

function unwrapCloudResult(result: any): any {
    if (result && typeof result === 'object') {
        if (Object.prototype.hasOwnProperty.call(result, 'result')) return result.result || {};
        if (Object.prototype.hasOwnProperty.call(result, 'data')) return result.data || {};
    }
    return result || {};
}

@ccclass('DouyinCloudMgr')
export class DouyinCloudMgr {
    private static _inst: DouyinCloudMgr | null = null;

    static get inst(): DouyinCloudMgr {
        if (!DouyinCloudMgr._inst) {
            DouyinCloudMgr._inst = new DouyinCloudMgr();
        }
        return DouyinCloudMgr._inst;
    }

    private cloudInitPromise: Promise<boolean> | null = null;
    private cloudReady = false;
    private cloudClient: DouyinCloudClient | null = null;

    private constructor() {}

    canUseCloud(): boolean {
        const client = this.getCloudClient();
        return !!(client?.callFunction || client?.callContainer);
    }

    getDiagnostics(): Record<string, unknown> {
        const tt = getDouyinMiniGameRuntime();
        const client = this.getCloudClient();
        return {
            platform: 'douyin',
            hasTt: !!tt,
            hasCreateDouyinCloud: typeof tt?.createDouyinCloud === 'function',
            hasCreateDouyinCloudPascal: typeof tt?.CreateDouyinCloud === 'function',
            hasCloud: !!tt?.cloud,
            hasInit: typeof client?.init === 'function',
            hasCallFunction: typeof client?.callFunction === 'function',
            hasCallContainer: typeof client?.callContainer === 'function',
            cloudEnv: this.getCloudEnv() || '',
            cloudReady: this.cloudReady,
        };
    }

    async init(): Promise<boolean> {
        if (!isDouyinMiniGameRuntime() || !this.canUseCloud()) {
            return false;
        }
        if (this.cloudInitPromise) {
            return this.cloudInitPromise;
        }

        this.cloudInitPromise = Promise.resolve().then(() => {
            try {
                const client = this.getCloudClient();
                if (!client) return false;
                const env = this.getCloudEnv();
                if (typeof client.init === 'function') {
                    client.init(env ? { env } : {});
                }
                this.cloudReady = true;
                return true;
            } catch (error) {
                this.cloudReady = false;
                console.warn('[DouyinCloudMgr] douyin cloud init failed:', error);
                return false;
            }
        });

        return this.cloudInitPromise;
    }

    async callFunction<T = any>(name: string, data: Record<string, unknown> = {}): Promise<T> {
        if (!(await this.init())) {
            throw new Error('douyin cloud is not ready');
        }
        const client = this.getCloudClient();
        if (!client) {
            throw new Error('douyin cloud client is unavailable');
        }

        const config = this.getCloudConfig();
        if (typeof client.callFunction === 'function') {
            const result = await this.invokeCloudMethod(client, client.callFunction, { name, data, config });
            return unwrapCloudResult(result) as T;
        }

        if (typeof client.callContainer === 'function') {
            const pathPrefix = readGlobalString('__PDD_DOUYIN_CLOUD_PATH_PREFIX__').replace(/\/+$/g, '');
            const path = `${pathPrefix}/${name}`.replace(/\/{2,}/g, '/');
            const result = await this.invokeCloudMethod(client, client.callContainer, {
                path,
                method: 'POST',
                data,
                config,
            });
            return unwrapCloudResult(result) as T;
        }

        throw new Error('douyin cloud callFunction/callContainer is unavailable');
    }

    get isCloudReady(): boolean {
        return this.cloudReady;
    }

    private getCloudClient(): DouyinCloudClient | null {
        if (this.cloudClient) return this.cloudClient;
        const tt = getDouyinMiniGameRuntime();
        if (!tt) return null;
        if (typeof tt.createDouyinCloud === 'function') {
            this.cloudClient = tt.createDouyinCloud();
        } else if (typeof tt.CreateDouyinCloud === 'function') {
            this.cloudClient = tt.CreateDouyinCloud();
        } else if (tt.cloud) {
            this.cloudClient = tt.cloud;
        }
        return this.cloudClient;
    }

    private getCloudEnv(): string {
        return readGlobalString('__PDD_DOUYIN_CLOUD_ENV__');
    }

    private getCloudConfig(): Record<string, unknown> | undefined {
        const env = this.getCloudEnv();
        return env ? { env } : undefined;
    }

    private invokeCloudMethod(
        client: DouyinCloudClient,
        method: (options: DouyinCloudCallOptions) => unknown,
        options: DouyinCloudCallOptions,
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (ok: boolean, payload: any) => {
                if (settled) return;
                settled = true;
                ok ? resolve(payload) : reject(payload);
            };
            try {
                const result = method.call(client, {
                    ...options,
                    success: (res: any) => finish(true, res),
                    fail: (err: any) => finish(false, err),
                });
                if (result && typeof (result as any).then === 'function') {
                    (result as Promise<any>).then((res) => finish(true, res), (err) => finish(false, err));
                } else if (result && typeof result === 'object' && !('abort' in result)) {
                    finish(true, result);
                }
            } catch (error) {
                finish(false, error);
            }
        });
    }
}
