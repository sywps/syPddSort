import { Label, Graphics, Color, BlockInputEvents } from 'cc';
import { AppRoot } from '../AppRoot';
import { CoopServiceMgr } from '../CoopServiceMgr';
import { COOP_ROUTE_REASON } from '../CoopModeConfig';
import { CoopPanelController, coopButton, coopNode, coopText } from '../Panels/CoopPanelController';
import { renderPixelPosterPreview, releasePixelPosterPreviewTree } from '../PixelPosterPreviewRenderer';

export function installCoopModeModule(target: any): void {
    Object.assign(target, {
        isCoopMode(): boolean {
            const session = AppRoot.tryGet()?.session;
            return !!CoopServiceMgr.inst.active && (session?.activeGameplayContext || session?.pendingGameplayRequest)?.routeReason === COOP_ROUTE_REASON;
        },
        openCoopLobby(tab: 'mine' | 'square' | 'collection' = 'mine', postId = ''): void {
            this._coopPanel ||= new CoopPanelController(this);
            this._coopPanel.open(tab, postId);
        },
        checkCoopInvitation(): void {
            const mgr = CoopServiceMgr.inst;
            const postId = mgr.launchPostId();
            if (postId && postId !== this._coopConsumedInvite && !this.isCoopMode()) {
                if (AppRoot.tryGet()?.session.currentSceneName === 'Game') {
                    void this.requestHomeRoute('coop-invite', 'none'); return;
                }
                this._coopConsumedInvite = postId;
                this.openCoopLobby('mine', postId);
            } else if (mgr.returnToLobby) { mgr.returnToLobby = false; this.openCoopLobby(); }
        },
        restoreCoopBoard(): void {
            if (!this.isCoopMode()) { this._coopReplayResumeState = null; return; }
            const active = CoopServiceMgr.inst.active!;
            this._coopReplayResumeState = active.replay;
            this.boardModel = active.replay.board;
            this._coopTerminal = false;
        },
        mountCoopHud(): void {
            if (!this.isCoopMode()) return;
            const active = CoopServiceMgr.inst.active!;
            const top = this.getGameplayFixedGroup('TopBarGroup');
            this.getGameplayBottomHudChild('SkillArea').active = true;
            top.getChildByName('CoopHud')?.destroy();
            const title = top.getChildByName('LevelTitle')!;
            title.active = true;
            if (this.levelLabel) this.levelLabel.string = '合作模式';
            top.getChildByName('LevelTitleLevel1')!.active = false;
            title.getChildByName('保存失败 · 点击重试')?.destroy();
            const retry = coopButton(title, '保存失败 · 点击重试', 0, -48, () => { void this.retryCoopSave(); }, 320);
            retry.active = false;
            this._coopRetryButton = retry;
            this._freezeTimeLeft = active.replay.freezeRemaining;
            this._freezeTimeTotal = active.replay.freezeRemaining;
            if (this._freezeTimeLeft) this.refreshFreezeTimerLabel?.();
            if (active.replay.firstTap >= 0) this.ensureTimerStarted();
        },
        recordCoopRuleEvent(kind: number, ...args: number[]): void {
            if (!this.isCoopMode() || this._coopTerminal) return;
            CoopServiceMgr.inst.record(kind, args);
        },
        getCoopBoardContentBounds(): { minRow: number; maxRow: number; minCol: number; maxCol: number } | null {
            if (!this.isCoopMode()) return null;
            const active = CoopServiceMgr.inst.active!;
            const offset = active.run.role === 'creator' ? 0 : active.half.boardWidth;
            return { minRow: 0, maxRow: active.full.boardHeight - 1,
                minCol: -offset, maxCol: active.full.boardWidth - offset - 1 };
        },
        clearCoopBoardPartner(): void {
            const partner = this.boardNode?.getChildByName('CoopPartnerHalf');
            if (partner) { releasePixelPosterPreviewTree(partner); partner.removeFromParent(); partner.destroy(); }
        },
        mountCoopBoardPartner(): void {
            this.clearCoopBoardPartner();
            if (!this.isCoopMode()) return;
            const active = CoopServiceMgr.inst.active!;
            const creator = active.run.role === 'creator';
            const columns = active.half.boardWidth;
            const step = this.cellSize + this.cellGap;
            const width = columns * step, height = active.full.boardHeight * step;
            const partner = coopNode(this.boardNode, 'CoopPartnerHalf', creator ? width : -width, 0, width, height);
            partner.addComponent(BlockInputEvents);
            const start = creator ? columns : 0;
            renderPixelPosterPreview(partner, active.full.correctColorArr.map(row => row.slice(start, start + columns)), {
                name: 'PartnerCompletedPattern', maxW: width, maxH: height, padding: 0,
                maxCellSize: this.cellSize, cellGap: this.cellGap, cropToContent: false, flatCells: true, grayscale: creator,
            });
            if (creator) {
                const mask = coopNode(partner, 'PartnerMask', 0, 0, width, height);
                const graphics = mask.addComponent(Graphics);
                graphics.fillColor = new Color(68, 52, 94, 175);
                graphics.rect(-width / 2, -height / 2, width, height); graphics.fill();
                coopText(mask, '等待伙伴完成', 0, 0, 22, width - 16).color = Color.WHITE;
            }
        },
        getCoopElapsedMs(): number { return CoopServiceMgr.inst.active?.elapsedMs || 0; },
        updateCoopClock(dt: number): void {
            if (!this.isCoopMode()) return;
            const mgr = CoopServiceMgr.inst, active = mgr.active!;
            const controller = this._pchConveyorGameplayController;
            if (!controller?.isActive()) return;
            const blocked = !!active.error || !!this._coopLeaving || this._gameForeground === false;
            controller?.setExternalInputBlocked(blocked);
            if (blocked && controller && !controller.isSettingsPaused()) {
                controller.pauseForSettings(); this._coopOwnPause = true;
            } else if (!blocked && this._coopOwnPause) {
                controller?.resumeAfterSettings(); this._coopOwnPause = false;
            }
            if (!this.isGameEnd && !this._coopLeaving && !active.error
                && this._gameForeground !== false && !controller?.isPresentationPaused()) active.elapsedMs += Math.max(0, dt) * 1000;
            if (this._coopRetryButton?.isValid) this._coopRetryButton.active = !!active.error;
        },
        async retryCoopSave(): Promise<void> {
            try { await CoopServiceMgr.inst.flushAll(); }
            catch (error) { this.showToast?.(`保存失败：${error instanceof Error ? error.message : error}`, 4); }
        },
        async restartCoop(): Promise<void> {
            if (this._coopRestarting) return;
            this._coopRestarting = true;
            try {
                const mgr = CoopServiceMgr.inst;
                const active = mgr.active!;
                await mgr.prepare(this, active.post, active.run);
                this.doRestart();
            } catch (e) { this.showToast?.(`重新开始失败：${e instanceof Error ? e.message : e}`, 4); }
            finally { this._coopRestarting = false; }
        },
        async leaveCoop(): Promise<void> {
            if (this._coopLeaving) return;
            const savedActive = CoopServiceMgr.inst.active;
            this._coopLeaving = true;
            this._pchConveyorGameplayController?.setExternalInputBlocked(true);
            if (!this._pchConveyorGameplayController?.isSettingsPaused()) {
                this._pchConveyorGameplayController?.pauseForSettings(); this._coopOwnPause = true;
            }
            try {
                if (savedActive?.completed) await CoopServiceMgr.inst.flushAll();
                CoopServiceMgr.inst.active = null; CoopServiceMgr.inst.returnToLobby = true;
                await AppRoot.tryGet()!.requestHomeRoute('coop', 'none');
            } catch (error) {
                CoopServiceMgr.inst.active = savedActive;
                CoopServiceMgr.inst.returnToLobby = false;
                this.showToast?.(`返回失败：${error instanceof Error ? error.message : error}`, 4);
            }
            finally { this._coopLeaving = false; }
        },
        handleCoopTerminal(passed: boolean): boolean {
            if (!this.isCoopMode() || !passed) return false;
            if (this._coopTerminal) return true;
            this._coopTerminal = true; this.isGameEnd = true;
            CoopServiceMgr.inst.active!.completed = true;
            this.unschedule(this.tickTimer);
            this._pchConveyorGameplayController?.pauseForSettlement();
            const panel = coopNode(this.requireCanvasUiRoot('OverlayRoot'), 'CoopResult', 0, 0, 650, 540);
            const graphics = panel.addComponent(Graphics); graphics.fillColor = new Color('#F3F0FF');
            graphics.roundRect(-325, -270, 650, 540, 24); graphics.fill();
            panel.addComponent(BlockInputEvents);
            const status = coopText(panel, '正在保存结果…', 0, 90, 27);
            const share = coopButton(panel, '分享给好友', -155, -145, () => {
                try {
                    CoopServiceMgr.inst.share(CoopServiceMgr.inst.active!.post);
                    if (CoopServiceMgr.inst.isLocalSimulation()) status.string = '模拟邀请已生成，返回大厅切换玩家后打开邀请';
                }
                catch (e) { status.string = String(e); }
            });
            share.active = false;
            const publish = coopButton(panel, '发布到广场', 155, -145, () => {
                void (async () => {
                    try {
                        const a = CoopServiceMgr.inst.active!;
                        await CoopServiceMgr.inst.call('publish', { postId: a.post.id, published: true });
                        a.post.published = true;
                        if (status.isValid) status.string = '已发布到合作广场，等待伙伴来拼';
                    } catch (e) { if (status.isValid) status.string = `发布失败：${e instanceof Error ? e.message : e}`; }
                })();
            });
            publish.active = false;
            const save = async () => {
                try {
                    await CoopServiceMgr.inst.flushAll();
                    const a = CoopServiceMgr.inst.active!;
                    if (a.run.status !== 'complete') throw new Error('服务端尚未确认完成，请重试保存');
                    share.active = true;
                    publish.active = a.run.role === 'creator';
                    status.string = a.run.role === 'creator' ? '你的一半已完成！\n邀请伙伴完成后解锁图鉴' : '合作完成！完整图案已收入图鉴';
                } catch (e) { if (status.isValid) status.string = `结果未保存：${e instanceof Error ? e.message : e}`; }
            };
            coopButton(panel, '重试保存', -155, -55, () => { void save(); });
            coopButton(panel, '保存并返回', 155, -55, () => { void this.leaveCoop(); });
            void save(); return true;
        },
        flushCoopOnHide(): void {
            if (!this.isCoopMode()) return;
            if (!this._pchConveyorGameplayController?.isSettingsPaused()) {
                this._pchConveyorGameplayController?.pauseForSettings(); this._coopOwnPause = true;
            }
        },
        disposeCoop(): void { this.clearCoopBoardPartner(); this._coopPanel?.close(); },
    });
}
