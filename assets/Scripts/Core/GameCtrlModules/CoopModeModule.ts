import { Label, Graphics, Color, BlockInputEvents, Sprite } from 'cc';
import { BOARD_SLOT_BATCH_MAX_CELLS, BoardSlotBatchRenderer } from '../BoardSlotBatchRenderer';
import type { BoardSlotBatchCell } from '../BoardSlotBatchRenderer';
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
            this._coopFocusOwnBoard = false;
            this._coopViewportRestricted = false;
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
            title.getChildByName('等待同步 · 点击继续')?.destroy();
            const retry = coopButton(title, '等待同步 · 点击继续', 0, -48, () => { void this.retryCoopSave(); }, 320);
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
            if (this._coopFocusOwnBoard) {
                return { minRow: 0, maxRow: active.half.boardHeight - 1,
                    minCol: 0, maxCol: active.half.boardWidth - 1 };
            }
            return { minRow: 0, maxRow: active.full.boardHeight - 1,
                minCol: -offset, maxCol: active.full.boardWidth - offset - 1 };
        },
        clearCoopBoardPartner(): void {
            const partner = this.boardNode?.getChildByName('CoopPartnerHalf');
            if (partner) { releasePixelPosterPreviewTree(partner); partner.removeFromParent(); partner.destroy(); }
        },
        getCoopBoardPanBounds(scale: number): { left: number; right: number; bottom: number; top: number } | null {
            if (!this.isCoopMode() || !this._coopViewportRestricted) return null;
            const half = CoopServiceMgr.inst.active!.half;
            const rect = this.getBoardInitialFitRect();
            const centerX = (rect.left + rect.right) / 2;
            const centerY = (rect.bottom + rect.top) / 2;
            const step = this.cellSize + this.cellGap;
            const atMinimum = scale <= this.boardViewport.minScale + 0.001;
            const panX = atMinimum ? 0 : Math.max(0, (half.boardWidth * step * scale - (rect.right - rect.left)) / 2);
            const panY = atMinimum ? 0 : Math.max(0, (half.boardHeight * step * scale - (rect.top - rect.bottom)) / 2);
            return { left: centerX - panX, right: centerX + panX,
                bottom: centerY - panY, top: centerY + panY };
        },
        restrictCoopBoardViewport(): void {
            if (!this.isCoopMode()) return;
            const viewport = this.boardViewport;
            const home = viewport.getHomeTransform();
            this._coopViewportRestricted = true;
            viewport.setScaleBounds(home.scale, viewport.maxScale);
            viewport.resetToHome();
            this.boardViewScale = viewport.scale;
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
            if (creator) {
                const preview = coopNode(partner, 'PartnerInitialBeans', 0, 0, width, height);
                for (const beans of [false, true]) {
                    const groups = new Map<unknown, BoardSlotBatchCell[]>();
                    for (let row = 0; row < active.full.boardHeight; row++) {
                        for (let col = 0; col < columns; col++) {
                            const target = active.full.correctColorArr[row]?.[start + col];
                            const initial = active.full.initRandomColorArr[row]?.[start + col];
                            if (!Number.isInteger(target) || !Number.isInteger(initial) || target < 0 || initial < 0) {
                                throw new Error(`合作伙伴半图颜色数据无效：${row},${start + col}`);
                            }
                            const colorId = beans ? initial : target;
                            if (colorId === 0) continue;
                            const spriteFrame = this.requireRenderReadySpriteFrame(
                                beans ? this.getBeanSpriteFrame(colorId, initial === target) : this.getSlotSpriteFrame(colorId),
                                `coop-partner:${beans ? 'bean' : 'slot'}:${row},${col}:color:${colorId}`,
                            );
                            if (beans) {
                                const size = this.getBoardBeanVisualSize();
                                const node = coopNode(preview, `Bean_${row}_${col}`,
                                    -width / 2 + step / 2 + col * step, height / 2 - step / 2 - row * step, size, size);
                                const sprite = node.addComponent(Sprite);
                                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                                sprite.spriteFrame = spriteFrame;
                                sprite.color = new Color(255, 255, 255, 77);
                                continue;
                            }
                            const texture = spriteFrame.texture;
                            const cells = groups.get(texture) || [];
                            cells.push({ row, col, x: -width / 2 + step / 2 + col * step,
                                y: height / 2 - step / 2 - row * step,
                                size: this.getBoardSlotVisualSize(), spriteFrame });
                            groups.set(texture, cells);
                        }
                    }
                    let batchIndex = 0;
                    for (const cells of groups.values()) {
                        for (let offset = 0; offset < cells.length; offset += BOARD_SLOT_BATCH_MAX_CELLS) {
                            const node = coopNode(preview, `Slots_${batchIndex++}`, 0, 0, width, height);
                            const renderer = node.addComponent(BoardSlotBatchRenderer);
                            renderer.color = new Color(255, 255, 255, 77);
                            renderer.configure(cells.slice(offset, offset + BOARD_SLOT_BATCH_MAX_CELLS));
                        }
                    }
                }
                coopText(partner, '等待伙伴完成', 0, 0, 22, width - 16).color = Color.WHITE;
            } else {
                renderPixelPosterPreview(partner, active.full.correctColorArr.map(row => row.slice(start, start + columns)), {
                    name: 'PartnerCompletedPattern', maxW: width, maxH: height, padding: 0,
                    maxCellSize: this.cellSize, cellGap: this.cellGap, cropToContent: false, flatCells: true, grayscale: false,
                });
            }
        },
        getCoopElapsedMs(): number { return CoopServiceMgr.inst.active?.elapsedMs || 0; },
        updateCoopClock(dt: number): void {
            if (!this.isCoopMode()) return;
            const mgr = CoopServiceMgr.inst, active = mgr.active!;
            const controller = this._pchConveyorGameplayController;
            if (!controller?.isActive()) return;
            const blocked = !!active.error || !!this._coopLeaving || this._gameForeground === false;
            const opening = controller.isCoopOpening();
            controller.setExternalInputBlocked(blocked || opening);
            if (blocked && controller && !controller.isSettingsPaused()) {
                controller.pauseForSettings(); this._coopOwnPause = true;
            } else if (!blocked && this._coopOwnPause) {
                controller?.resumeAfterSettings(); this._coopOwnPause = false;
            }
            if (!opening && !this.isGameEnd && !this._coopLeaving && !active.error
                && this._gameForeground !== false && !controller?.isPresentationPaused()) active.elapsedMs += Math.max(0, dt) * 1000;
            if (this._coopRetryButton?.isValid) this._coopRetryButton.active = !!active.error;
        },
        async retryCoopSave(): Promise<void> {
            try { await CoopServiceMgr.inst.flushAll(); }
            catch (error) { console.error('[coop] save failed', error); this.showToast?.('结果待同步，请稍后再试', 3); }
        },
        async restartCoop(): Promise<void> {
            if (this._coopRestarting) return;
            this._coopRestarting = true;
            try {
                const mgr = CoopServiceMgr.inst;
                const active = mgr.active!;
                await mgr.prepare(this, active.post, active.run);
                this.doRestart();
            } catch (e) { console.error('[coop] restart failed', e); this.showToast?.('暂时无法开始，请稍后再试', 3); }
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
                console.error('[coop] leave failed', error);
                this.showToast?.('暂时无法返回，请稍后再试', 3);
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
                catch (e) { console.error('[coop] share failed', e); status.string = '暂时无法分享，请稍后再试'; }
            });
            share.active = false;
            const publish = coopButton(panel, '发布到广场', 155, -145, () => {
                void (async () => {
                    try {
                        const a = CoopServiceMgr.inst.active!;
                        await CoopServiceMgr.inst.call('publish', { postId: a.post.id, published: true });
                        a.post.published = true;
                        if (status.isValid) status.string = '已发布到合作广场，等待伙伴来拼';
                    } catch (e) { console.error('[coop] publish failed', e); if (status.isValid) status.string = '暂时无法发布，请稍后再试'; }
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
                } catch (e) { console.error('[coop] result submission failed', e); if (status.isValid) status.string = '本局结果待同步\n点击继续同步后解锁分享与收藏'; }
            };
            coopButton(panel, '继续同步', -155, -55, () => { void save(); });
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
