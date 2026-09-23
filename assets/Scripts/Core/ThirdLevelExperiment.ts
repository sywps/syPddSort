import { PREVIEW } from 'cc/env';
import { isMiniGameRuntime } from './MiniGamePlatform';

export const THIRD_LEVEL_EXPERIMENT_ID = 'third_level_abc_v1';
const STORAGE_KEY = 'pdd.third_level_abc_v1.decision';
export type ThirdLevelBucket = 'A' | 'B' | 'C';
type Decision = { id: string; status: 'enrolled' | 'excluded' | 'test'; content: ThirdLevelBucket;
    enrolledAt: number; reason: string; openid?: string };
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function getThirdLevelPreview(): ThirdLevelBucket | null {
    if (!PREVIEW || typeof window === 'undefined' || isMiniGameRuntime()) return null;
    const value = new URLSearchParams(window.location.search).get('level') || '';
    const match = /^3=(.*)$/i.exec(value);
    if (!match) return 'A';
    const bucket = match[1].toUpperCase();
    if (!['A', 'B', 'C'].includes(bucket)) throw new Error('第三关预览请使用 ?level=3=A、B 或 C');
    return bucket as ThirdLevelBucket;
}

export class ThirdLevelExperimentState {
    decision: Decision | null = null;
    private storage: Storage | null = null;
    private storageError: Error | null = null;
    initialize(storage: Storage, official: boolean, preview: ThirdLevelBucket | null): void {
        this.storage = storage;
        if (!official || preview !== null) {
            this.decision = { id: THIRD_LEVEL_EXPERIMENT_ID, status: 'test', content: preview || 'A', enrolledAt: 0, reason: 'preview' };
            return;
        }
        try {
            const raw = storage.getItem(STORAGE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            this.validate(saved);
            if (saved.status === 'enrolled' && !saved.openid) throw new Error('第三关实验缺少账号标识');
            this.decision = saved;
        } catch (error) {
            this.storageError = error instanceof Error ? error : new Error(String(error));
            console.error('[ThirdLevelExperiment] storage unavailable:', this.storageError);
        }
    }
    assertStorageReady(): void { if (this.storageError) throw this.storageError; }
    private validate(d: any): void {
        if (d?.id !== THIRD_LEVEL_EXPERIMENT_ID || !['enrolled', 'excluded'].includes(d.status)
            || !['A', 'B', 'C'].includes(d.content)
            || (d.status === 'enrolled' && !(d.enrolledAt > 0))) throw new Error('第三关实验分组无效');
    }
    accept(openid: string, receipt: any): void {
        this.assertStorageReady();
        this.validate(receipt);
        if (!openid) throw new Error('第三关实验缺少账号标识');
        const old = this.decision;
        if (old?.openid && (old.openid !== openid || old.content !== receipt.content || old.status !== receipt.status
            || old.enrolledAt !== receipt.enrolledAt)) throw new Error('第三关实验分组发生变化');
        const next = { ...receipt, openid };
        if (!this.storage) throw new Error('第三关实验存储未初始化');
        this.storage.setItem(STORAGE_KEY, JSON.stringify(next));
        this.decision = next;
    }
    content(): ThirdLevelBucket {
        if (!this.decision) throw new Error('第三关实验尚未准备完成');
        return this.decision.content;
    }
    fields(): Record<string, string | number> {
        const d = this.decision;
        return d ? { thirdLevelExperimentId: d.id, thirdLevelExperimentStatus: d.status,
            thirdLevelExperimentBucket: d.content, thirdLevelEnrolledAt: d.enrolledAt,
            thirdLevelExperimentReason: d.reason } : {};
    }
}
export const thirdLevelExperiment = new ThirdLevelExperimentState();
