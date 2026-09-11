import { BlockInputEvents, Button, Color, Graphics, Label, Layers, Mask, Node, ScrollView, UITransform, view } from 'cc';
import { AppRoot } from '../AppRoot';
import { CoopServiceMgr } from '../CoopServiceMgr';
import { COOP_ROUTE_REASON, type CoopLevelEntry, type CoopPost, type CoopRun } from '../CoopModeConfig';
import { renderPixelPosterPreview, releasePixelPosterPreviewTree } from '../PixelPosterPreviewRenderer';

const ink = '#44345E', purple = '#8064D9', pale = '#F3F0FF';
export function coopNode(parent: Node, name: string, x: number, y: number, w: number, h: number): Node {
    const node = new Node(name); node.layer = parent.layer || Layers.Enum.UI_2D;
    parent.addChild(node); node.setPosition(x, y); node.addComponent(UITransform).setContentSize(w, h); return node;
}
export function coopText(parent: Node, text: string, x: number, y: number, size = 24, width = 600): Label {
    const node = coopNode(parent, 'Text', x, y, width, size * 2.5);
    const label = node.addComponent(Label); label.string = text; label.fontSize = size; label.lineHeight = size + 6;
    label.color = new Color(ink); label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER; label.overflow = Label.Overflow.SHRINK; return label;
}
export function coopButton(parent: Node, text: string, x: number, y: number, action: () => void, width = 260): Node {
    const node = coopNode(parent, text, x, y, width, 60); const graphics = node.addComponent(Graphics);
    graphics.fillColor = new Color(purple); graphics.roundRect(-width / 2, -30, width, 60, 18); graphics.fill();
    coopText(node, text, 0, 0, 23, width - 18).color = Color.WHITE;
    node.addComponent(Button); node.on(Button.EventType.CLICK, action); return node;
}

export class CoopPanelController {
    private root: Node | null = null;
    private status: Label | null = null;
    private body: Node | null = null;
    private revision = 0;
    private busy = false;
    constructor(private readonly runtime: any) {}

    open(tab: 'mine' | 'square' | 'collection' = 'mine', postId = ''): void {
        this.close();
        const root = coopNode(this.runtime.requireCanvasUiRoot('OverlayRoot'), 'CoopLobby', 0, 0, 720, 1280);
        this.root = root; root.addComponent(BlockInputEvents);
        const bg = root.addComponent(Graphics); const visible = view.getVisibleSize();
        bg.fillColor = new Color(pale); bg.rect(-Math.max(720, visible.width) / 2, -Math.max(1280, visible.height) / 2, Math.max(720, visible.width), Math.max(1280, visible.height)); bg.fill();
        coopText(root, '合作拼图', 0, 553, 40);
        const mgr = CoopServiceMgr.inst;
        if (mgr.isLocalSimulation()) {
            coopButton(root, `本地玩家 ${mgr.localPlayer} · 切换`, -165, 501, () => {
                if (this.busy) return;
                try { mgr.switchLocalPlayer(); this.open(); }
                catch (error) { if (this.status) this.status.string = String(error); }
            }, 310);
            coopButton(root, '打开模拟邀请', 165, 501, () => {
                if (this.busy) return;
                const id = mgr.localInvitation();
                if (id) void this.detail(id);
                else if (this.status) this.status.string = '先完成半图并点击分享，再切换玩家打开邀请';
            }, 300);
        } else coopText(root, '我拼一半，另一半交给你', 0, 501, 23);
        coopButton(root, '返回', -268, 554, () => { if (!this.busy) this.close(); }, 130);
        coopButton(root, '参与记录', 258, 554, () => { if (!this.busy) void this.history(); }, 150);
        for (const [i, item] of (['mine', 'square'] as const).entries()) {
            coopButton(root, ['我的合作', '合作广场'][i], (i - 0.5) * 330, 431, () => {
                if (!this.busy) void this.navigate(item);
            }, 310);
        }
        this.body = coopNode(root, 'Content', 0, 0, 680, 740);
        this.status = coopText(root, '', 0, -543, 20);
        void (postId ? this.detail(postId) : this.navigate(tab));
    }

    close(): void {
        this.revision++;
        if (this.root?.isValid) { releasePixelPosterPreviewTree(this.root); this.root.destroy(); }
        this.root = null; this.body = null; this.status = null;
    }

    private reset(): number {
        this.revision++;
        if (this.body) { releasePixelPosterPreviewTree(this.body); for (const child of this.body.children.slice()) { child.removeFromParent(); child.destroy(); } }
        return this.revision;
    }

    private async perform(work: () => Promise<void>): Promise<void> {
        if (this.busy || !this.root?.isValid) return;
        this.busy = true; if (this.status) this.status.string = '正在加载…';
        try { await work(); if (this.status?.isValid) this.status.string = ''; }
        catch (error) { if (this.status?.isValid) this.status.string = error instanceof Error ? error.message : String(error); }
        finally { this.busy = false; }
    }

    private async picture(parent: Node, levelId: number, x: number, y: number, width: number, height: number, gray = false, halfDone = false): Promise<void> {
        const level = await CoopServiceMgr.inst.fullLevel(this.runtime, levelId);
        if (!parent.isValid || !this.root?.isValid) return;
        const holder = coopNode(parent, `Picture${levelId}`, x, y, width, height);
        if (halfDone) {
            for (let side = 0; side < 2; side++) renderPixelPosterPreview(holder,
                level.correctColorArr.map(row => row.slice(side * 32, side * 32 + 32)), {
                    name: `Half${side}`, offsetX: (side ? 1 : -1) * width / 4, maxW: width / 2, maxH: height,
                    cropToContent: false, grayscale: side === 1, flatCells: true, cellGap: 0,
                });
            return;
        }
        renderPixelPosterPreview(holder, level.correctColorArr, { name: 'CoopPattern',
            maxW: width, maxH: height, cropToContent: false, grayscale: gray, flatCells: true, cellGap: 0 });
    }

    private async scrollList<T>(top: number, height: number, columns: number, rowHeight: number,
        load: (cursor: string) => Promise<{ items: T[]; next: string }>,
        render: (row: Node, item: T) => Promise<void>, emptyText: string): Promise<void> {
        const rev = this.revision;
        const scroll = coopNode(this.body!, 'CoopScroll', 0, top - height / 2, 660, height);
        const scrollView = scroll.addComponent(ScrollView);
        scrollView.horizontal = false; scrollView.vertical = true;
        const viewport = coopNode(scroll, 'View', 0, 0, 660, height);
        viewport.addComponent(Mask);
        const content = coopNode(viewport, 'Rows', 0, height / 2, 660, height);
        const transform = content.getComponent(UITransform)!;
        transform.setAnchorPoint(0.5, 1);
        scrollView.content = content;
        let cursor = '', count = 0, finished = false, loading = false;
        const append = async () => {
            if (loading || finished || rev !== this.revision) return;
            loading = true;
            const added: Node[] = [];
            try {
                const result = await load(cursor);
                if (rev !== this.revision || !content.isValid) return;
                for (const [index, item] of result.items.entries()) {
                    if (rev !== this.revision || !content.isValid) return;
                    const i = count + index;
                    const row = coopNode(content, `Row${i}`, columns === 2 ? (i % 2 ? 164 : -164) : 0,
                        -rowHeight * (Math.floor(i / columns) + 0.5), columns === 2 ? 310 : 640, rowHeight);
                    added.push(row);
                    await render(row, item);
                }
                if (rev !== this.revision || !content.isValid) return;
                count += result.items.length; cursor = result.next; finished = !cursor;
                transform.setContentSize(660, Math.max(height + (finished ? 0 : 1), Math.ceil(count / columns) * rowHeight));
                if (!count) coopText(content, emptyText, 0, -height / 2, 23);
            } catch (error) {
                for (const row of added) if (row.isValid) { releasePixelPosterPreviewTree(row); row.removeFromParent(); row.destroy(); }
                throw error;
            } finally { loading = false; }
        };
        scroll.on(ScrollView.EventType.SCROLL_TO_BOTTOM, () => {
            if (rev === this.revision && !loading && !finished) void this.perform(append);
        });
        await append();
    }

    private async navigate(tab: 'mine' | 'square' | 'collection'): Promise<void> {
        await this.perform(async () => {
            const rev = this.reset(); const mgr = CoopServiceMgr.inst;
            const catalog = await mgr.catalog(this.runtime);
            if (rev !== this.revision) return;
            if (tab === 'square') {
                await this.scrollList<CoopPost>(380, 890, 1, 172, async cursor => {
                    const result = await mgr.call<{ posts: CoopPost[]; next: string }>('square', { cursor });
                    return { items: result.posts, next: result.next };
                }, async (row, post) => {
                    await this.picture(row, post.levelId, -225, 0, 135, 125, false, true);
                    coopText(row, `${post.creatorName} 已拼好一半`, 75, 26, 23, 420);
                    coopButton(row, '帮他完成', 80, -34, () => void this.detail(post.id), 260);
                }, '还没有半成品，先发起一张吧');
                return;
            }
            const { overview } = await mgr.overview();
            if (rev !== this.revision) return;
            if (tab === 'mine') {
                coopText(this.body!, '自己最多发起 1 张，同时协助 1 张', 0, 350, 21);
                if (overview.activeCreated) coopButton(this.body!, '继续我的合作', -165, 295, () => void this.detail(overview.activeCreated!), 300);
                if (overview.activeJoined) coopButton(this.body!, '继续帮忙拼图', 165, 295, () => void this.detail(overview.activeJoined!), 300);
            } else coopText(this.body!, `已收藏 ${catalog.filter(e => overview.unlocked[e.collectionId]).length} / 10`, 0, 350, 25);
            await this.scrollList<CoopLevelEntry>(250, 740, 2, 280, async cursor => {
                const offset = Number(cursor) || 0, end = offset + 6;
                return { items: catalog.slice(offset, end), next: end < catalog.length ? String(end) : '' };
            }, async (card, entry) => {
                card.name = `CoopCard${entry.levelId}`;
                const unlocked = !!overview.unlocked[entry.collectionId];
                await this.picture(card, entry.levelId, 0, 25, 260, 175, !unlocked);
                coopText(card, `${entry.name} · ${entry.beanCount}颗`, 0, -75, 19, 310);
                coopButton(card, tab === 'collection' ? (unlocked ? '查看图案' : '合作后解锁') : '发起合作', 0, -121, () => {
                    if (tab === 'collection') { if (unlocked) void this.showPattern(entry); }
                    else void this.create(entry);
                }, 230);
            }, '暂无合作图案');
        });
    }

    async detail(postId: string): Promise<void> {
        await this.perform(async () => {
            const rev = this.reset(); const mgr = CoopServiceMgr.inst;
            const result = await mgr.call<{ post: CoopPost; run: CoopRun | null; isCreator: boolean }>('detail', { postId });
            if (rev !== this.revision) return;
            const { post, run, isCreator } = result;
            await this.picture(this.body!, post.levelId, 0, 165, 500, 340, false, !run || run.status !== 'complete' || isCreator && !post.completedCount);
            coopText(this.body!, `${post.creatorName} 的合作图案`, 0, -45, 28);
            coopText(this.body!, run?.status === 'complete' ? (isCreator && !post.completedCount ? '你的半区已完成，等待伙伴解锁图鉴' : '已完成') : '各拼一半，完成后获得完整图鉴', 0, -101, 22);
            if (!run || run.status === 'playing') coopButton(this.body!, run ? '开始拼图' : '开始帮忙', 0, -177, () => {
                void this.perform(async () => {
                    const joined = run ? { post, run } : await mgr.call<{ post: CoopPost; run: CoopRun }>('join', { postId });
                    await this.start(joined.post, joined.run);
                });
            }, 360);
            if (isCreator && post.creatorDone) {
                coopButton(this.body!, '邀请好友来拼', -165, -177, () => { try {
                    mgr.share(post);
                    if (mgr.isLocalSimulation()) this.status!.string = '模拟邀请已生成，切换玩家后打开邀请';
                } catch (e) { this.status!.string = String(e); } }, 300);
                const publishButton = coopButton(this.body!, post.published ? '从广场撤下' : '发布到广场', 165, -177, () => {
                    void this.perform(async () => {
                        await mgr.call('publish', { postId, published: !post.published }); post.published = !post.published;
                        const text = publishButton.getChildByName('Text')?.getComponent(Label);
                        if (text) text.string = post.published ? '从广场撤下' : '发布到广场';
                    });
                }, 300);
                coopButton(this.body!, '查看完成 / 未完成人员', 0, -255, () => void this.participants(postId), 450);
            }
            if (run?.status === 'complete') coopText(this.body!, `完成用时 ${Math.floor(run.elapsedMs / 1000)} 秒\n完成于 ${new Date(run.completedAt!).toLocaleString()}`, 0, -345, 20);
            else coopText(this.body!, '中途退出后需重新开始这一半', 0, -345, 20);
        });
    }

    private async create(entry: CoopLevelEntry): Promise<void> {
        await this.perform(async () => {
            const result = await CoopServiceMgr.inst.call<{ post: CoopPost; run: CoopRun }>('create', { levelId: entry.levelId });
            await this.start(result.post, result.run);
        });
    }

    private async start(post: CoopPost, run: CoopRun): Promise<void> {
        const root = this.root;
        if (!root?.isValid) return;
        await CoopServiceMgr.inst.prepare(this.runtime, post, run);
        if (!root.isValid) return;
        const app = AppRoot.ensure('Home');
        app.markGameRequested(post.levelId, 'zt_level_', 'theme', 'none', COOP_ROUTE_REASON);
        await app.router.toGame();
    }

    private async showPattern(entry: CoopLevelEntry): Promise<void> {
        await this.perform(async () => {
            this.reset(); await this.picture(this.body!, entry.levelId, 0, 55, 640, 570);
            coopText(this.body!, entry.name, 0, -310, 32); coopText(this.body!, '已收录到我的合作图鉴', 0, -368, 23);
        });
    }

    private async history(): Promise<void> {
        await this.perform(async () => {
            this.reset();
            await this.scrollList<Pick<CoopRun, 'postId' | 'role' | 'status'>>(380, 890, 2, 90, async cursor => {
                const result = await CoopServiceMgr.inst.call<{ runs: CoopRun[]; next: string }>('history', { cursor });
                return { items: result.runs, next: result.next };
            }, async (row, run) => {
                coopButton(row, `${run.role === 'creator' ? '我发起' : '我参与'} · ${run.status === 'complete' ? '已完成' : '未完成'}`,
                    0, 0, () => void this.detail(run.postId), 310);
            }, '还没有参与记录');
        });
    }

    private async participants(postId: string): Promise<void> {
        await this.perform(async () => {
            this.reset();
            await this.scrollList<Pick<CoopRun, 'displayName' | 'status' | 'elapsedMs' | 'completedAt'>>(380, 890, 1, 130, async cursor => {
                const result = await CoopServiceMgr.inst.call<{ participants: CoopRun[]; next: string }>('participants', { postId, cursor });
                return { items: result.participants, next: result.next };
            }, async (row, p) => {
                coopText(row, `${p.displayName} · ${p.status === 'complete' ? '已完成' : '未完成'} · ${Math.floor(p.elapsedMs / 1000)}秒`, 0, 20, 23);
                coopText(row, p.completedAt ? new Date(p.completedAt).toLocaleString() : '尚未完成', 0, -20, 19);
            }, '还没有人参与，分享给好友吧');
        });
    }
}
