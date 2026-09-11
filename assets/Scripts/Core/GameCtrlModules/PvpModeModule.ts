import {
    AudioMgr,
    BlockInputEvents,
    Button,
    Color,
    Graphics,
    Label,
    Layers,
    Node,
    UITransform,
    Widget,
} from '../GameCtrlShared';
import { AppRoot } from '../AppRoot';
import { Mask, ScrollView, Sprite, view } from 'cc';
import { COLOR_HEX } from '../LevelConfig';
import { renderPixelPosterPreview } from '../PixelPosterPreviewRenderer';
import { PvpServiceMgr, type PvpLeaderboardEntry, type PvpEconomyState } from '../PvpServiceMgr';
import { CoopServiceMgr } from '../CoopServiceMgr';
import {
    PVP_RANKED_MODE_CONFIG,
    PVP_ROUTE_REASON,
    PVP_LEVEL_PREFIX,
    isPixelPvpMatch,
    clampPvpProgress,
    createSeededPvpBoardState,
    createDemoPvpBattle,
    isPvpRouteReason,
    resolvePvpBoardTimeline,
    resolvePvpOutcome,
    type PvpBattleContext,
    type PvpBoardTimelinePoint,
    type PvpLockedCell,
    type PvpTerminalType,
} from '../PvpModeConfig';
import { replayHumanEvents, HUMAN_REPLAY_PROTOCOL } from '../PvpHumanReplay';
import { pixelLevelHash } from '../PvpBotReplay';

const COLORS = {
    ink: new Color(37, 48, 93, 255),
    violet: new Color(102, 87, 200, 255),
    violetDark: new Color(53, 48, 133, 245),
    blue: new Color(77, 139, 239, 255),
    coral: new Color(242, 92, 107, 255),
    gold: new Color(255, 200, 61, 255),
    pale: new Color(238, 241, 255, 248),
    white: new Color(255, 255, 255, 255),
    muted: new Color(119, 128, 157, 255),
};

const PVP_THUMBNAIL_DRAW_WIDTH = 164;
const PVP_THUMBNAIL_DRAW_HEIGHT = 238;
const PVP_BATTLE_UTILITY_CENTER_TOP = 50.5;
const PVP_BATTLE_ARTWORK_OPTICAL_TOP_OFFSET = -5;

function ensureTransform(node: Node, width: number, height: number): UITransform {
    const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
    transform.setContentSize(width, height);
    return transform;
}

function alignPvpUtilityCenter(node: Node, widget: Widget, opticalTopOffset: number = 0): void {
    const transform = node.getComponent(UITransform);
    if (!transform) throw new Error(`[PvpMode] ${node.name} requires a UITransform for top-row alignment`);
    widget.top = PVP_BATTLE_UTILITY_CENTER_TOP - (transform.height * Math.abs(node.scale.y)) / 2 + opticalTopOffset;
    widget.updateAlignment();
}

function drawPanel(node: Node, width: number, height: number, color: Color, radius: number = 18): Graphics {
    ensureTransform(node, width, height);
    const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = color;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    return graphics;
}

function drawPixelPanel(node: Node, width: number, height: number, color: Color, cut: number = 12): Graphics {
    ensureTransform(node, width, height);
    const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = color;
    graphics.moveTo(-width / 2 + cut, -height / 2);
    graphics.lineTo(width / 2 - cut, -height / 2);
    graphics.lineTo(width / 2, -height / 2 + cut);
    graphics.lineTo(width / 2, height / 2 - cut);
    graphics.lineTo(width / 2 - cut, height / 2);
    graphics.lineTo(-width / 2 + cut, height / 2);
    graphics.lineTo(-width / 2, height / 2 - cut);
    graphics.lineTo(-width / 2, -height / 2 + cut);
    graphics.close();
    graphics.fill();
    return graphics;
}

function addLabel(parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color = COLORS.ink): Label {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    ensureTransform(node, Math.max(80, text.length * size), size + 14);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size + 6;
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    return label;
}

function addBoundedLabel(parent: Node, name: string, text: string, x: number, y: number, size: number, color: Color, width: number): Label {
    const label = addLabel(parent, name, text, x, y, size, color);
    ensureTransform(label.node, width, size + 14);
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = false;
    return label;
}

function addButton(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, color: Color, onClick: () => void): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    drawPanel(node, width, height, color, 18);
    node.addComponent(Button);
    addLabel(node, 'Label', text, 0, 0, 28, COLORS.white);
    node.on(Button.EventType.CLICK, onClick);
    return node;
}

function addLobbySurface(parent: Node, name: string, x: number, y: number, width: number, height: number, border: Color): Node {
    const shadow = new Node(`${name}Shadow`);
    shadow.layer = Layers.Enum.UI_2D;
    parent.addChild(shadow);
    shadow.setPosition(x, y - 7, 0);
    drawPanel(shadow, width, height, new Color(53, 48, 133, 34), 20);
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    const g = drawPanel(node, width, height, new Color(251, 251, 255, 255), 20);
    g.strokeColor = border;
    g.lineWidth = 2;
    g.roundRect(-width / 2, -height / 2, width, height, 20);
    g.stroke();
    g.strokeColor = COLORS.white;
    g.roundRect(-width / 2 + 5, -height / 2 + 5, width - 10, height - 10, 16);
    g.stroke();
    g.fillColor = border;
    for (const side of [-1, 1]) {
        g.rect(side * (width / 2 - 19) - 4, height / 2 - 22, 8, 8);
        g.rect(side * (width / 2 - 29) - 3, height / 2 - 13, 6, 6);
    }
    g.fill();
    return node;
}

function styleLobbyButton(node: Node, border: Color, textColor: Color = COLORS.white): void {
    const ui = node.getComponent(UITransform)!;
    const g = node.getComponent(Graphics)!;
    const fill = new Color(g.fillColor.r, g.fillColor.g, g.fillColor.b, g.fillColor.a);
    g.clear();
    g.fillColor = new Color(53, 48, 133, 36);
    g.roundRect(-ui.width / 2, -ui.height / 2 - 5, ui.width, ui.height, 18);
    g.fill();
    g.fillColor = fill;
    g.roundRect(-ui.width / 2, -ui.height / 2, ui.width, ui.height, 18);
    g.fill();
    g.strokeColor = border;
    g.lineWidth = 3;
    g.roundRect(-ui.width / 2, -ui.height / 2, ui.width, ui.height, 18);
    g.stroke();
    g.fillColor = new Color(255, 255, 255, 66);
    g.roundRect(-ui.width / 2 + 8, ui.height / 2 - 13, ui.width - 16, 6, 3);
    g.fill();
    const label = node.getChildByName('Label')!.getComponent(Label)!;
    label.color = textColor;
    label.isBold = true;
    ensureTransform(label.node, ui.width - 20, ui.height - 8);
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = false;
}

function addLobbyIcon(parent: Node, kind: 'back' | 'settings' | 'rank' | 'history' | 'rules' | 'lock', x: number, y: number, color: Color): void {
    const icon = new Node(`${kind}Icon`);
    icon.layer = Layers.Enum.UI_2D;
    parent.addChild(icon);
    icon.setPosition(x, y, 0);
    ensureTransform(icon, 48, 48);
    const g = icon.addComponent(Graphics);
    g.fillColor = color;
    g.strokeColor = color;
    g.lineWidth = 4;
    if (kind === 'back') {
        g.moveTo(16, 0); g.lineTo(-16, 0); g.lineTo(-3, 13);
        g.moveTo(-16, 0); g.lineTo(-3, -13); g.stroke();
    } else if (kind === 'settings') {
        for (let i = 0; i < 32; i++) {
            const angle = i * Math.PI / 16;
            const radius = i % 4 < 2 ? 23 : 17;
            if (i === 0) g.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
            else g.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        g.close(); g.fill();
        g.fillColor = COLORS.white; g.circle(0, 0, 8); g.fill();
    } else if (kind === 'rank') {
        for (const [dx, height] of [[-17, 21], [0, 38], [17, 14]]) {
            g.roundRect(dx - 7, -20, 14, height, 2);
        }
        g.fill();
    } else if (kind === 'lock') {
        g.roundRect(-12, -17, 24, 23, 4); g.fill();
        g.roundRect(-8, -2, 16, 22, 8); g.stroke();
        g.strokeColor = COLORS.pale; g.moveTo(0, -3); g.lineTo(0, -10); g.stroke();
    } else {
        g.roundRect(-18, -22, 36, 44, 4); g.stroke();
        if (kind === 'history') {
            g.roundRect(-9, 16, 18, 9, 3); g.fill();
            for (const dy of [6, -4, -14]) { g.moveTo(-10, dy); g.lineTo(10, dy); }
            g.stroke();
        } else {
            g.moveTo(-10, -21); g.lineTo(-10, 20); g.stroke();
            addLabel(icon, 'Question', '?', 5, 0, 28, color);
        }
    }
}

function addProgress(parent: Node, name: string, x: number, y: number, width: number, labelX: number, color: Color): { fill: Graphics; label: Label; width: number } {
    const track = new Node(name);
    track.layer = Layers.Enum.UI_2D;
    parent.addChild(track);
    track.setPosition(x, y, 0);
    const trackGraphics = drawPanel(track, width, 22, new Color(202, 207, 229, 255), 9);
    trackGraphics.strokeColor = new Color(255, 255, 255, 235);
    trackGraphics.lineWidth = 3;
    trackGraphics.roundRect(-width / 2, -11, width, 22, 9);
    trackGraphics.stroke();
    const fillNode = new Node('Fill');
    fillNode.layer = Layers.Enum.UI_2D;
    track.addChild(fillNode);
    fillNode.setPosition(-width / 2, 0, 0);
    const fill = drawPanel(fillNode, 1, 18, color, 8);
    const label = addLabel(parent, `${name}Label`, '0%', labelX, y, 18, COLORS.ink);
    return { fill, label, width };
}

function setProgress(widget: { fill: Graphics; label: Label; width: number }, value: number, color: Color): void {
    const progress = clampPvpProgress(value);
    const width = Math.max(1, widget.width * progress);
    const node = widget.fill.node;
    ensureTransform(node, width, 18);
    node.setPosition(-widget.width / 2 + width / 2, 0, 0);
    widget.fill.clear();
    widget.fill.fillColor = color;
    widget.fill.roundRect(-width / 2, -9, width, 18, 8);
    widget.fill.fill();
    widget.label.string = `${Math.round(progress * 100)}%`;
}

function computeBoardProgress(runtime: any): number {
    const board = runtime.boardModel;
    if (!board?.correctColors || !board?.locked) return 0;
    let total = 0;
    let locked = 0;
    for (let row = 0; row < board.correctColors.length; row++) {
        for (let col = 0; col < (board.correctColors[row]?.length || 0); col++) {
            if (Number(board.correctColors[row][col]) <= 0) continue;
            total += 1;
            if (board.locked[row]?.[col] === true) locked += 1;
        }
    }
    return total > 0 ? locked / total : 0;
}

function rankDivisionGlyph(rankName: string): string {
    const match = String(rankName || '').trim().match(/(V|IV|III|II|I)$/);
    return match?.[1] || '★';
}

function opponentTypeLabel(context: PvpBattleContext): string {
    if (context.matchType === 'friend' || context.opponent.opponentType === 'friend') return '好友挑战';
    return '排位对手';
}

function opponentProgressAt(context: PvpBattleContext, elapsedMs: number): number | null {
    if (context.matchType === 'friend' && context.friendRole === 'creator') return null;
    const timeline = Array.isArray(context.opponentTimeline) ? context.opponentTimeline : [];
    if (timeline.length === 0) return null;
    let progress = 0;
    for (const point of timeline) {
        if (Number(point.elapsedMs) > elapsedMs) break;
        progress = clampPvpProgress(point.progress);
    }
    return progress;
}

function addAvatar(runtime: any, parent: Node, name: string, profile: any, x: number, y: number, accent: Color, diameter: number = 58): Node {
    const avatar = new Node(name);
    avatar.layer = Layers.Enum.UI_2D;
    parent.addChild(avatar);
    avatar.setPosition(x, y, 0);
    ensureTransform(avatar, diameter, diameter);
    const radius = diameter / 2;
    const ring = avatar.addComponent(Graphics);
    ring.fillColor = COLORS.white;
    ring.circle(0, 0, radius);
    ring.fill();
    ring.strokeColor = accent;
    ring.lineWidth = Math.max(4, diameter * 0.055);
    ring.circle(0, 0, radius - 2);
    ring.stroke();
    const portraitSize = Math.max(24, diameter - 12);
    runtime.loadAvatarToNode?.(profile.avatarUrl || '', avatar, portraitSize, portraitSize, profile.displayName || '玩家');
    return avatar;
}

function drawOpponentThumbnail(runtime: any, parent: Node, lockedCells: ReadonlyArray<PvpLockedCell> = []): void {
    const graphics = parent.getComponent(Graphics) || parent.addComponent(Graphics);
    graphics.clear();
    const colors = runtime.boardModel?.correctColors || [];
    const cells: Array<{ row: number; col: number; color: number }> = [];
    for (let row = 0; row < colors.length; row++) {
        for (let col = 0; col < (colors[row]?.length || 0); col++) {
            const color = Number(colors[row][col]) || 0;
            if (color > 0) cells.push({ row, col, color });
        }
    }
    if (cells.length === 0) return;
    const minRow = Math.min(...cells.map((cell) => cell.row));
    const maxRow = Math.max(...cells.map((cell) => cell.row));
    const minCol = Math.min(...cells.map((cell) => cell.col));
    const maxCol = Math.max(...cells.map((cell) => cell.col));
    const columnCount = maxCol - minCol + 1;
    const rowCount = maxRow - minRow + 1;
    const cellSize = Math.min(PVP_THUMBNAIL_DRAW_WIDTH / columnCount, PVP_THUMBNAIL_DRAW_HEIGHT / rowCount);
    const drawWidth = columnCount * cellSize;
    const drawHeight = rowCount * cellSize;
    const lockedKeys = new Set(lockedCells.map((cell) => `${Number(cell.row)}:${Number(cell.col)}`));
    cells.forEach((cell) => {
        const isVisible = lockedKeys.has(`${cell.row}:${cell.col}`);
        const tone = isVisible
            ? new Color(COLOR_HEX[cell.color] || '#CCCCCC')
            : new Color(190, 196, 216, 170);
        graphics.fillColor = tone;
        graphics.rect(
            -drawWidth / 2 + (cell.col - minCol) * cellSize,
            drawHeight / 2 - (cell.row - minRow + 1) * cellSize,
            Math.max(1, cellSize - 0.5),
            Math.max(1, cellSize - 0.5),
        );
        graphics.fill();
    });
}

function collectBoardCells(runtime: any): PvpLockedCell[] {
    const colors = runtime.boardModel?.correctColors || [];
    const cells: PvpLockedCell[] = [];
    for (let row = 0; row < colors.length; row += 1) {
        for (let col = 0; col < (colors[row]?.length || 0); col += 1) {
            const colorId = Number(colors[row][col]) || 0;
            if (colorId > 0) cells.push({ row, col, colorId });
        }
    }
    return cells;
}

function opponentBoardStateAt(runtime: any, context: PvpBattleContext, elapsedMs: number, progress: number): { available: boolean; cells: PvpLockedCell[]; revision: string } {
    const timeline = Array.isArray(context.opponentBoardTimeline) ? context.opponentBoardTimeline : [];
    if (timeline.length > 0 || context.replayProtocol === HUMAN_REPLAY_PROTOCOL) {
        const cells = resolvePvpBoardTimeline(timeline, elapsedMs);
        return { available: true, cells, revision: `replay:${cells.length}` };
    }
    if (context.opponentBoardSeed) {
        const cells = createSeededPvpBoardState(collectBoardCells(runtime), context.opponentBoardSeed, progress);
        return { available: true, cells, revision: `seeded:${cells.length}` };
    }
    return { available: false, cells: [], revision: 'unavailable' };
}

function appendPvpBoardDelta(runtime: any, elapsedMs: number): void {
    const timeline = (runtime._pvpBoardTimeline || (runtime._pvpBoardTimeline = [])) as PvpBoardTimelinePoint[];
    const recorded = (runtime._pvpRecordedLockedKeys || (runtime._pvpRecordedLockedKeys = new Set<string>())) as Set<string>;
    const addedCells = collectLockedCells(runtime).filter((cell) => {
        const key = `${cell.row}:${cell.col}`;
        if (recorded.has(key)) return false;
        recorded.add(key);
        return true;
    });
    if (addedCells.length === 0) return;
    if (timeline.length < 512) {
        timeline.push({ elapsedMs: Math.max(0, Math.floor(elapsedMs)), addedCells });
        return;
    }
    timeline[timeline.length - 1].addedCells.push(...addedCells);
}

function collectLockedCells(runtime: any): Array<{ row: number; col: number; colorId: number }> {
    const board = runtime.boardModel;
    if (!board?.correctColors || !board?.locked) return [];
    const cells: Array<{ row: number; col: number; colorId: number }> = [];
    for (let row = 0; row < board.correctColors.length; row++) {
        for (let col = 0; col < (board.correctColors[row]?.length || 0); col++) {
            if (board.locked[row]?.[col] === true) cells.push({ row, col, colorId: Number(board.correctColors[row][col]) || 1 });
        }
    }
    return cells;
}

function getPvpContext(): PvpBattleContext | null {
    const appRoot = AppRoot.tryGet();
    if (!appRoot) return null;
    const active = appRoot.session.pvpBattleContext;
    if (active) {
        if (!isPixelPvpMatch(active)) throw new Error('[PvpMode] incompatible pixel-puzzle match');
        return active;
    }
    const routeReason = appRoot.session.activeGameplayContext?.routeReason
        || appRoot.session.pendingGameplayRequest?.routeReason;
    if (!isPvpRouteReason(routeReason)) return null;
    const persisted = PvpServiceMgr.inst.isLocalPreview() ? null : PvpServiceMgr.inst.loadPersistedBattle();
    if (persisted) {
        appRoot.session.setPvpBattleContext(persisted);
        return persisted;
    }
    if (!PvpServiceMgr.inst.isLocalPreview()) return null;
    const levelId = appRoot.session.pendingGameplayRequest?.levelId
        || appRoot.session.activeGameplayContext?.activeLevelId
        || 1;
    const preview = createDemoPvpBattle(levelId);
    appRoot.session.setPvpBattleContext(preview);
    return preview;
}

function createPvpEconomyModal(parent: Node, name: string, title: string, height: number, onClose: () => void): { root: Node; card: Node } {
    parent.getChildByName(name)?.destroy();
    const root = new Node(name);
    root.layer = Layers.Enum.UI_2D;
    parent.addChild(root);
    const visibleSize = view.getVisibleSize();
    drawPanel(root, Math.max(720, visibleSize.width), Math.max(1280, visibleSize.height), new Color(26, 23, 61, 190), 0);
    root.addComponent(BlockInputEvents);
    const card = new Node('Card');
    card.layer = Layers.Enum.UI_2D;
    root.addChild(card);
    drawPixelPanel(card, 640, height, COLORS.pale, 24);
    const ribbon = new Node('Ribbon');
    ribbon.layer = Layers.Enum.UI_2D;
    card.addChild(ribbon);
    ribbon.setPosition(0, height / 2 - 12, 0);
    drawPixelPanel(ribbon, 430, 88, COLORS.gold, 16);
    addLabel(ribbon, 'Title', title, 0, 0, 38, COLORS.violetDark);
    addButton(card, 'Close', '×', 282, height / 2 - 30, 54, 54, COLORS.violet, () => {
        root.active = false;
        root.destroy();
        onClose();
    });
    return { root, card };
}

export function installPvpModeModule(target: any): void {
    Object.assign(target, {
        isRankedPvpMode(): boolean {
            const appRoot = AppRoot.tryGet();
            const context = getPvpContext();
            if (!appRoot || !context) return false;
            const gameplay = appRoot.session.activeGameplayContext;
            const request = gameplay || appRoot.session.pendingGameplayRequest;
            return isPvpRouteReason(request?.routeReason)
                && request?.entryMode === 'theme'
                && request.prefix === PVP_LEVEL_PREFIX;
        },

        openPvpLobby(): void {
            this._pvpMatchStarting = false;
            AppRoot.inst.session.pixelPuzzleLobbyActive = true;
            const overlayRoot = this.requireCanvasUiRoot('OverlayRoot');
            overlayRoot.getChildByName('PvpLobbyOverlay')?.destroy();
            const overlay = new Node('PvpLobbyOverlay');
            overlay.layer = Layers.Enum.UI_2D;
            overlayRoot.addChild(overlay);
            ensureTransform(overlay, 720, 1280);
            drawPanel(overlay, 720, 1280, new Color(238, 241, 255, 255), 0);
            overlay.addComponent(BlockInputEvents);

            const decor = new Node('LobbyBackdropDecor');
            decor.layer = Layers.Enum.UI_2D;
            overlay.addChild(decor);
            ensureTransform(decor, 720, 1280);
            const decorGraphics = decor.addComponent(Graphics);
            decorGraphics.fillColor = new Color(102, 87, 200, 18);
            decorGraphics.moveTo(-360, 640);
            decorGraphics.lineTo(40, 640);
            decorGraphics.lineTo(-360, 240);
            decorGraphics.close();
            decorGraphics.fill();
            decorGraphics.fillColor = new Color(77, 139, 239, 16);
            decorGraphics.moveTo(360, -640);
            decorGraphics.lineTo(-20, -640);
            decorGraphics.lineTo(360, -260);
            decorGraphics.close();
            decorGraphics.fill();
            for (const [x, y] of [[-318, 438], [-286, 438], [286, -420], [318, -420], [318, -452]]) {
                decorGraphics.fillColor = new Color(255, 200, 61, 42);
                decorGraphics.rect(x - 8, y - 8, 16, 16);
                decorGraphics.fill();
            }

            const backButton = addButton(overlay, 'Close', '‹', -292, 558, 76, 72, COLORS.white, () => {
                if (this._pvpMatchStarting) return;
                AppRoot.inst.session.pixelPuzzleLobbyActive = false;
                overlay.destroy();
            });
            styleLobbyButton(backButton, new Color(215, 207, 242), COLORS.violetDark);
            backButton.getChildByName('Label')!.active = false;
            addLobbyIcon(backButton, 'back', 0, 0, COLORS.violetDark);
            const settingsButton = addButton(overlay, 'LobbySettings', '设置', 292, 558, 76, 72, COLORS.white, () => {
                if (!this._pvpMatchStarting) this.openSettingsPanel();
            });
            styleLobbyButton(settingsButton, new Color(215, 207, 242), COLORS.violetDark);
            settingsButton.getChildByName('Label')!.active = false;
            addLobbyIcon(settingsButton, 'settings', 0, 0, COLORS.violetDark);
            settingsButton.active = false;
            addLabel(overlay, 'Title', '像素拼图', 0, 554, 46, COLORS.ink);
            const seasonPill = new Node('SeasonPill');
            seasonPill.layer = Layers.Enum.UI_2D;
            overlay.addChild(seasonPill);
            seasonPill.setPosition(0, 305, 0);
            const seasonGraphics = drawPanel(seasonPill, 300, 42, new Color(255, 255, 255, 220), 20);
            seasonGraphics.strokeColor = new Color(198, 205, 235, 255);
            seasonGraphics.lineWidth = 2;
            seasonGraphics.roundRect(-150, -21, 300, 42, 20);
            seasonGraphics.stroke();
            addLabel(seasonPill, 'Season', '闯关练习 · 异步竞技', 0, 0, 19, COLORS.violet);

            const stageShadow = new Node('RankStageShadow');
            stageShadow.layer = Layers.Enum.UI_2D;
            overlay.addChild(stageShadow);
            stageShadow.setPosition(0, 460, 0);
            stageShadow.setScale(0.8, 0.8, 1);
            drawPixelPanel(stageShadow, 152, 142, new Color(53, 48, 133, 42), 22);
            const stage = new Node('RankStage');
            stage.layer = Layers.Enum.UI_2D;
            overlay.addChild(stage);
            stage.setPosition(0, 466, 0);
            stage.setScale(0.8, 0.8, 1);
            const stageGraphics = drawPixelPanel(stage, 152, 142, new Color(255, 255, 255, 244), 22);
            stageGraphics.strokeColor = new Color(178, 170, 231, 255);
            stageGraphics.lineWidth = 3;
            stageGraphics.stroke();
            const starsLabel = addLabel(overlay, 'Stars', '☆☆☆☆☆', 0, 347, 32, COLORS.gold);

            const medalWings = new Node('RankMedalWings');
            medalWings.layer = Layers.Enum.UI_2D;
            overlay.addChild(medalWings);
            medalWings.setPosition(0, 466, 0);
            medalWings.setScale(0.65, 0.65, 1);
            ensureTransform(medalWings, 320, 180);
            const wingGraphics = medalWings.addComponent(Graphics);
            wingGraphics.fillColor = COLORS.gold;
            wingGraphics.moveTo(-70, 25);
            wingGraphics.lineTo(-148, 64);
            wingGraphics.lineTo(-126, 4);
            wingGraphics.lineTo(-154, -40);
            wingGraphics.lineTo(-66, -18);
            wingGraphics.close();
            wingGraphics.fill();
            wingGraphics.moveTo(70, 25);
            wingGraphics.lineTo(148, 64);
            wingGraphics.lineTo(126, 4);
            wingGraphics.lineTo(154, -40);
            wingGraphics.lineTo(66, -18);
            wingGraphics.close();
            wingGraphics.fill();
            const crest = new Node('RankCrest');
            crest.layer = Layers.Enum.UI_2D;
            overlay.addChild(crest);
            crest.setPosition(0, 466, 0);
            crest.setScale(0.56, 0.56, 1);
            const crestGraphics = drawPixelPanel(crest, 184, 184, COLORS.violetDark, 30);
            crestGraphics.strokeColor = COLORS.gold;
            crestGraphics.lineWidth = 7;
            crestGraphics.stroke();
            const medalCore = new Node('RankMedalCore');
            medalCore.layer = Layers.Enum.UI_2D;
            crest.addChild(medalCore);
            medalCore.setPosition(0, 12, 0);
            ensureTransform(medalCore, 112, 112);
            const coreGraphics = medalCore.addComponent(Graphics);
            coreGraphics.fillColor = COLORS.gold;
            coreGraphics.circle(0, 0, 55);
            coreGraphics.fill();
            coreGraphics.fillColor = COLORS.violet;
            coreGraphics.circle(0, 0, 43);
            coreGraphics.fill();
            const divisionLabel = addLabel(medalCore, 'RankDivision', 'III', 0, 0, 38, COLORS.white);
            const rankLabel = addBoundedLabel(overlay, 'RankName', '排位数据加载中', 0, 390, 28, COLORS.violetDark, 440);
            const status = addBoundedLabel(overlay, 'Status', '', 0, -626, 16, COLORS.muted, 640);

            const chapterCard = addLobbySurface(overlay, 'ChapterCard', 0, 150, 620, 240, new Color(155, 191, 251));
            const chapterPreview = addLobbySurface(chapterCard, 'ChapterPreview', -198, 0, 176, 192, new Color(196, 209, 241));
            const previewStatus = addBoundedLabel(chapterPreview, 'PreviewStatus', '加载中…', 0, 0, 18, COLORS.muted, 156);
            addBoundedLabel(chapterCard, 'ChapterTitle', '闯关模式', 112, 73, 36, COLORS.ink, 310);
            const chapterLevel = addBoundedLabel(chapterCard, 'ChapterLevel', '正在读取关卡…', 112, 27, 22, COLORS.violetDark, 310);
            addBoundedLabel(chapterCard, 'ChapterHint', '熟悉玩法，不影响段位', 112, -10, 18, COLORS.muted, 310);
            let chapterLevelId = 0;
            let chapterLevelData: any = null;
            const chapterButton = addButton(chapterCard, 'StartChapter', '开始闯关', 112, -70, 270, 64, COLORS.blue, () => {
                if (this._pvpMatchStarting || !chapterLevelId) return;
                this._pvpMatchStarting = true;
                AudioMgr.inst.play('button');
                AppRoot.inst.session.clearPvpBattleContext();
                void Promise.resolve(this.startThemeLevel(chapterLevelId, { suppressFailureToast: true }))
                    .then((started) => {
                        this._pvpMatchStarting = false;
                        if (started && overlay.isValid) overlay.destroy();
                        else if (overlay.isValid) status.string = '未进入关卡，请检查体力后重试';
                    }).catch((error) => {
                        this._pvpMatchStarting = false;
                        if (overlay.isValid) status.string = `闯关启动失败：${error instanceof Error ? error.message : '请重试'}`;
                    });
            });
            styleLobbyButton(chapterButton, new Color(100, 160, 255));
            chapterButton.getComponent(Button)!.interactable = false;
            this.loadThemeConfig(() => {
                if (!overlay.isValid) return;
                const levelId = this.getThemeDirectPlayLevelId();
                chapterLevel.string = `第 ${this.getThemeLevelDisplayNumber(levelId)} 关 · 继续闯关`;
                this.loadLevelData(levelId, (data: any) => {
                    if (!overlay.isValid) return;
                    if (!data?.correctColorArr?.length) {
                        previewStatus.string = '关卡加载失败';
                        status.string = '像素关卡资源不可用，请返回后重试';
                        return;
                    }
                    renderPixelPosterPreview(chapterPreview, data.correctColorArr, { maxW: 160, maxH: 176, cropToContent: true, mode: 'poster' });
                    previewStatus.node.active = false;
                    chapterLevelId = levelId;
                    chapterLevelData = data;
                    chapterButton.getComponent(Button)!.interactable = true;
                }, 'zt_level_');
            }, (error: Error) => {
                if (!overlay.isValid) return;
                previewStatus.string = '关卡目录不可用';
                chapterLevel.string = '加载失败';
                status.string = `${error.message}，请返回后重试`;
            });

            const coopCard = addLobbySurface(overlay, 'CoopCard', 0, -105, 620, 220, new Color(181, 164, 239));
            const coopPreview = addLobbySurface(coopCard, 'CoopPreview', -198, 0, 176, 180, new Color(196, 209, 241));
            const coopPreviewStatus = addBoundedLabel(coopPreview, 'CoopPreviewStatus', '加载中…', 0, 0, 18, COLORS.muted, 156);
            addBoundedLabel(coopCard, 'CoopTitle', '双人合作', 112, 65, 36, COLORS.ink, 310);
            addBoundedLabel(coopCard, 'CoopHint', '一人拼一半，共同完成', 112, 22, 22, COLORS.violetDark, 310);
            addBoundedLabel(coopCard, 'CoopRules', '邀请伙伴 · 完成收录图鉴', 112, -12, 18, COLORS.muted, 310);
            const coopButton = addButton(coopCard, 'CoopEntry', '开始合作', 112, -65, 270, 64, COLORS.blue, () => {
                if (!this._pvpMatchStarting) this.openCoopLobby();
            });
            styleLobbyButton(coopButton, new Color(100, 160, 255));
            void CoopServiceMgr.inst.fullLevel(this, 1).then((data) => {
                if (!overlay.isValid) return;
                renderPixelPosterPreview(coopPreview, data.correctColorArr, { maxW: 160, maxH: 164, cropToContent: true, mode: 'poster' });
                coopPreviewStatus.node.active = false;
            }).catch(() => {
                if (overlay.isValid) coopPreviewStatus.string = '图案加载失败';
            });

            const rankedCard = addLobbySurface(overlay, 'RankedCard', 0, -365, 620, 252, COLORS.gold);
            addLabel(rankedCard, 'RankedVersus', 'VS', -198, 48, 66, new Color(255, 166, 40));
            const ticketLabel = addBoundedLabel(rankedCard, 'TicketCount', '门票 --/3', -219, -26, 20, COLORS.violetDark, 134);
            const vigorLabel = addBoundedLabel(rankedCard, 'EntryCost', '每局 1 体力 + 1 门票', -195, -88, 14, COLORS.muted, 180);
            let economyState: PvpEconomyState | null = null;
            let economyLoading = false;
            let economyRefreshAt = 0;
            const refreshEconomy = async (): Promise<void> => {
                if (economyLoading || !overlay.isValid) return;
                economyLoading = true;
                try {
                    await PvpServiceMgr.inst.syncInventory(this);
                    const state = await PvpServiceMgr.inst.getEconomy();
                    this.applyPvpEconomySnapshot?.(state.inventory);
                    if (!overlay.isValid) return;
                    economyState = state;
                    ticketLabel.string = `门票 ${state.tickets}/${state.capacity}`;
                    vigorLabel.string = `体力 ${this.getVigor()} · 每局各扣 1`;
                    economyRefreshAt = Date.now() + Math.max(1000, state.resetAt - state.serverTime);
                } catch (error) {
                    if (overlay.isValid) status.string = `门票加载失败：${error instanceof Error ? error.message : '请重试'}`;
                    economyRefreshAt = Date.now() + 30000;
                } finally { economyLoading = false; }
            };
            const ticketMore = addButton(rankedCard, 'TicketMore', '+', -126, -26, 40, 40, COLORS.gold, () => {
                if (!this._pvpMatchStarting) void this.openPvpTickets(overlay, status, refreshEconomy);
            });
            ticketMore.getChildByName('Label')!.getComponent(Label)!.color = COLORS.violetDark;
            const rankRewards = addButton(overlay, 'RankRewards', '段位奖励', -256, 355, 144, 62, COLORS.gold, () => {
                if (!this._pvpMatchStarting) void this.openPvpRankRewards(overlay, status, refreshEconomy);
            });
            styleLobbyButton(rankRewards, new Color(231, 176, 47), COLORS.violetDark);
            rankRewards.getChildByName('Label')!.getComponent(Label)!.fontSize = 23;
            void refreshEconomy();
            const refreshDailyTickets = () => {
                if (overlay.isValid && !this._pvpMatchStarting && !this._pvpEconomyClaiming && Date.now() >= economyRefreshAt) void refreshEconomy();
            };
            this.schedule?.(refreshDailyTickets, 1);
            overlay.on(Node.EventType.NODE_DESTROYED, () => this.unschedule?.(refreshDailyTickets));
            addBoundedLabel(rankedCard, 'RankedTitle', '排位对战', 112, 78, 36, COLORS.violetDark, 310);
            addBoundedLabel(rankedCard, 'RankedHint', '挑战对手成绩，争夺星级', 112, 33, 18, COLORS.violetDark, 310);
            addBoundedLabel(rankedCard, 'RankedRules', '异步对战 · 无道具 · 无复活', 112, -2, 17, COLORS.muted, 310);
            if (PvpServiceMgr.inst.isLocalPreview()) {
                rankLabel.string = '永恒钻石 III';
                divisionLabel.string = 'III';
                starsLabel.string = '★★☆☆☆';
            } else {
                void PvpServiceMgr.inst.getProfile().then((profile) => {
                    if (!overlay?.isValid) return;
                    rankLabel.string = profile.rankName;
                    divisionLabel.string = rankDivisionGlyph(profile.rankName);
                    const stars = Math.max(0, Math.min(5, Number(profile.stars) || 0));
                    starsLabel.string = `${'★★★★★'.slice(0, stars)}${'☆☆☆☆☆'.slice(stars)}`;
                }).catch((error) => {
                    if (overlay?.isValid) status.string = `段位加载失败：${error instanceof Error ? error.message : '服务异常'}`;
                });
            }
            let activeMatchId = '';
            let activeMatchChecked = PvpServiceMgr.inst.isLocalPreview();
            const startMatchButton = addButton(rankedCard, 'StartMatch', '开始排位', 112, -72, 270, 64, COLORS.violet, () => {
                if (this._pvpMatchStarting) return;
                if (!activeMatchChecked) {
                    checkActiveMatch();
                    return;
                }
                if (!activeMatchId && !chapterLevelId) {
                    status.string = '像素关卡尚未就绪，请等待加载或返回重试';
                    return;
                }
                this._pvpMatchStarting = true;
                AudioMgr.inst.play('button');
                if (activeMatchId) {
                    status.string = '正在核对云端对局…';
                    void PvpServiceMgr.inst.getActiveMatch().then((match) => {
                        this._pvpMatchStarting = false;
                        if (!overlay.isValid) return;
                        if (!match) {
                            activeMatchId = '';
                            PvpServiceMgr.inst.clearPersistedBattle();
                            startLabel.string = '开始排位';
                            status.string = '上局已结束或过期，可以开始新排位';
                            return;
                        }
                        const context = PvpServiceMgr.inst.toBattleContext(match);
                        const persistedBattle = PvpServiceMgr.inst.loadPersistedBattle();
                        if (persistedBattle?.matchId === match.matchId) {
                            context.resumeElapsedMs = Math.max(context.resumeElapsedMs || 0, persistedBattle.resumeElapsedMs || 0);
                        }
                        context.startedAtMs = Date.now() - (context.resumeElapsedMs || 0);
                        PvpServiceMgr.inst.persistBattle(context);
                        AppRoot.inst.session.setPvpBattleContext(context);
                        this.showPvpOpponentReveal(overlay, context);
                    }).catch((error) => {
                        this._pvpMatchStarting = false;
                        if (overlay.isValid) status.string = `恢复失败：${error instanceof Error ? error.message : '请重试'}`;
                    });
                    return;
                }
                const levelId = chapterLevelId;
                if (!economyState) {
                    this._pvpMatchStarting = false;
                    void refreshEconomy();
                    status.string = '正在加载体力与门票，请稍后重试';
                    return;
                }
                if (economyState.tickets < 1) {
                    this._pvpMatchStarting = false;
                    void this.openPvpTickets(overlay, status, refreshEconomy);
                    return;
                }
                this.updateVigor();
                if (this.getVigor() < 1) {
                    this._pvpMatchStarting = false;
                    this.showNoLivesAdModal({ source: 'pvp_start', onResult: () => { void refreshEconomy(); } });
                    return;
                }
                status.string = '匹配中… 正在寻找实力相近的对手';
                void PvpServiceMgr.inst.syncInventory(this).then(async () => {
                    if (PvpServiceMgr.inst.isLocalPreview()) return PvpServiceMgr.inst.matchmake(levelId, chapterLevelData);
                    const offer = await PvpServiceMgr.inst.getRankedLevel();
                    const data = await new Promise<any>((resolve, reject) => this.loadLevelData(offer.levelId, (value: any) => {
                        if (!value) reject(new Error('排位关卡加载失败'));
                        else resolve(value);
                    }, 'zt_level_'));
                    if (pixelLevelHash(data) !== offer.levelHash) throw new Error('排位关卡版本不一致，请更新资源');
                    return PvpServiceMgr.inst.matchmake(offer.levelId, data, offer.poolVersion);
                }).then((context) => {
                    if (context.demo) {
                        if (!this.costVigorForLevel(levelId, 'theme')) throw new Error('体力不足');
                    } else this.applyPvpEconomySnapshot(context.entryInventory);
                    this._pvpMatchStarting = false;
                    if (!overlay?.isValid) return;
                    AppRoot.ensure('Home').session.setPvpBattleContext(context);
                    this.showPvpOpponentReveal(overlay, context);
                }).catch((error) => {
                    this._pvpMatchStarting = false;
                    if (overlay?.isValid) status.string = `匹配失败：${error instanceof Error ? error.message : '服务异常'}`;
                    void refreshEconomy();
                });
            });
            styleLobbyButton(startMatchButton, COLORS.gold);
            const startLabel = startMatchButton.getChildByName('Label')!.getComponent(Label)!;
            let checkingActive = false;
            const checkActiveMatch = () => {
                if (checkingActive) return;
                checkingActive = true;
                startLabel.string = '正在检查…';
                void PvpServiceMgr.inst.getActiveMatch().then((match) => {
                    checkingActive = false;
                    if (!overlay.isValid) return;
                    activeMatchChecked = true;
                    activeMatchId = match?.matchId || '';
                    startLabel.string = match ? '恢复对局' : '开始排位';
                    if (match) status.string = '检测到未完成对局，可继续挑战';
                }).catch((error) => {
                    checkingActive = false;
                    if (!overlay.isValid) return;
                    startLabel.string = '重试检查';
                    status.string = `对局检查失败：${error instanceof Error ? error.message : '服务异常'}`;
                });
            };
            if (!activeMatchChecked) checkActiveMatch();
            const leaderboard = addButton(overlay, 'PvpLeaderboard', '排行榜', -210, -542, 190, 72, COLORS.white, () => {
                void this.openPvpLeaderboard(overlay, status);
            });
            const history = addButton(overlay, 'History', '对战记录', 0, -542, 190, 72, COLORS.white, () => {
                void this.openPvpHistory(overlay, status);
            });
            const rules = addButton(overlay, 'Rules', '玩法规则', 210, -542, 190, 72, COLORS.white, () => {
                this.openPvpRules(overlay);
            });
            for (const button of [leaderboard, history, rules]) styleLobbyButton(button, new Color(210, 203, 236), COLORS.violetDark);
            const replayConsent = addButton(overlay, 'ReplayConsent', '', 0, -596, 610, 28, COLORS.white, () => {
                PvpServiceMgr.inst.setReplayConsent(!PvpServiceMgr.inst.hasReplayConsent());
                refreshReplayConsent();
            });
            const refreshReplayConsent = () => {
                replayConsent.getChildByName('Label')!.getComponent(Label)!.string =
                    `${PvpServiceMgr.inst.hasReplayConsent() ? '✓' : '○'} 允许本局成绩供其他玩家异步挑战`;
                replayConsent.getChildByName('Label')!.getComponent(Label)!.fontSize = 18;
            };
            refreshReplayConsent();
            for (const [button, kind] of [[leaderboard, 'rank'], [history, 'history'], [rules, 'rules']] as const) {
                addLobbyIcon(button, kind, 0, 14, COLORS.violet);
                const label = button.getChildByName('Label')!;
                label.setPosition(0, -20, 0);
                label.getComponent(Label)!.fontSize = 20;
                ensureTransform(label, 170, 28);
            }
        },

        async openPvpTickets(parent: Node, lobbyStatus: Label, onChange: () => Promise<void>): Promise<void> {
            if (this._pvpEconomyPanelOpening) return;
            this._pvpEconomyPanelOpening = true;
            lobbyStatus.string = '正在加载门票…';
            try {
                await PvpServiceMgr.inst.syncInventory(this);
                let state = await PvpServiceMgr.inst.getEconomy();
                this.applyPvpEconomySnapshot?.(state.inventory);
                if (!parent.isValid) return;
                const { root, card } = createPvpEconomyModal(parent, 'PvpTicketsOverlay', '排位门票', 650, () => { void onChange(); });
                addLabel(card, 'DailyRule', '每日 0 点补足 3 张 · 最多持有 3 张', 0, 226, 21, COLORS.violetDark);
                const count = addLabel(card, 'Balance', `${state.tickets}/${state.capacity}`, 0, 142, 58, COLORS.violet);
                addLabel(card, 'EntryCost', '每场排位消耗 1 体力 + 1 门票', 0, 80, 20, COLORS.muted);
                const localPreview = PvpServiceMgr.inst.isLocalPreview();
                const message = addBoundedLabel(card, 'Message', localPreview ? '本地模拟：点击广告或分享可加票，不影响正式账号' : '获得的门票立即到账；恢复对局不重复扣费', 0, -226, 18, COLORS.muted, 560);
                let busy = false;
                let ad: Node;
                let share: Node;
                let retry: Node;
                const refresh = () => {
                    if (!root.isValid) return;
                    count.string = `${state.tickets}/${state.capacity}`;
                    const pending = PvpServiceMgr.inst.hasPendingTicketReward();
                    ad.getComponent(Button)!.interactable = !busy && !pending && state.tickets < state.capacity;
                    share.getComponent(Button)!.interactable = !busy && !pending && state.tickets < state.capacity && state.shareUsed < state.shareLimit;
                    for (const [node, color] of [[ad, COLORS.gold], [share, COLORS.blue]] as const) {
                        const enabled = node.getComponent(Button)!.interactable;
                        drawPanel(node, 510, 68, enabled ? color : new Color(211, 212, 224));
                        styleLobbyButton(node, enabled ? color : new Color(196, 196, 215), enabled && node === share ? COLORS.white : COLORS.violetDark);
                    }
                    ad.getChildByName('Label')!.getComponent(Label)!.string = state.tickets >= state.capacity ? '门票已满' : '看广告 +1 张';
                    share.getChildByName('Label')!.getComponent(Label)!.string = state.shareUsed >= state.shareLimit ? '今日分享次数已用完（2/2）' : `分享 +1 张（${state.shareUsed}/${state.shareLimit}）`;
                    retry.active = pending;
                    retry.getComponent(Button)!.interactable = !busy;
                };
                const finalize = () => { busy = false; this._pvpEconomyClaiming = false; refresh(); void onChange(); };
                const acquire = async (source: 'ad' | 'share') => {
                    if (busy || this._pvpEconomyClaiming) return;
                    busy = true;
                    this._pvpEconomyClaiming = true;
                    refresh();
                    try {
                        if (localPreview) {
                            state = await PvpServiceMgr.inst.simulateTicketReward(source);
                            if (root.isValid) message.string = `本地模拟${source === 'ad' ? '广告' : '分享'}完成，门票 +1`;
                            finalize();
                            return;
                        }
                        const reward = await PvpServiceMgr.inst.beginTicketReward(source);
                        if (!root.isValid) { finalize(); return; }
                        const grant = async () => {
                            state = await PvpServiceMgr.inst.claimTicketReward(reward.claimId);
                            if (root.isValid) message.string = '门票 +1，已到账';
                        };
                        const options = { claimKey: reward.claimId, busyFlag: '_pvpTicketPlatformBusy',
                            adFailToast: '广告未完成，未获得门票', shareFailToast: '分享未完成，未获得门票',
                            grantFailToast: '到账确认失败，请点击补领门票重试',
                            shareType: 'pvp_ticket', title: () => '来一起挑战像素拼图排位！',
                            onFinally: finalize };
                        const started = source === 'ad' ? this.runRewardedGrant('pvp_ticket', grant, options)
                            : this.runShareGrant('pvp_ticket', grant, options);
                        if (!started) finalize();
                    } catch (error) {
                        if (root.isValid) message.string = error instanceof Error ? error.message : '门票获取失败';
                        finalize();
                    }
                };
                ad = addButton(card, 'WatchAd', '看广告 +1 张', 0, 0, 510, 68, COLORS.gold, () => { void acquire('ad'); });
                styleLobbyButton(ad, new Color(226, 177, 44), COLORS.violetDark);
                share = addButton(card, 'Share', '', 0, -86, 510, 68, COLORS.blue, () => { void acquire('share'); });
                styleLobbyButton(share, new Color(80, 123, 192));
                addLabel(card, 'Limits', '广告不限次数 · 分享每天最多 2 次', 0, -149, 18, COLORS.muted);
                retry = addButton(card, 'RetryTicketClaim', '补领已完成奖励的门票', 0, -282, 410, 44, COLORS.violet, () => {
                    if (busy || this._pvpEconomyClaiming) return;
                    busy = true;
                    this._pvpEconomyClaiming = true;
                    refresh();
                    void PvpServiceMgr.inst.claimTicketReward().then(next => {
                        state = next;
                        if (root.isValid) message.string = '已核对，门票到账';
                    }).catch(error => { if (root.isValid) message.string = error.message; }).finally(finalize);
                });
                refresh();
                lobbyStatus.string = '';
            } catch (error) {
                if (parent.isValid) lobbyStatus.string = error instanceof Error ? error.message : '门票加载失败';
            } finally { this._pvpEconomyPanelOpening = false; }
        },

        async openPvpRankRewards(parent: Node, lobbyStatus: Label, onChange: () => Promise<void>): Promise<void> {
            if (this._pvpEconomyPanelOpening) return;
            this._pvpEconomyPanelOpening = true;
            lobbyStatus.string = '正在加载段位奖励…';
            try {
                await PvpServiceMgr.inst.syncInventory(this);
                const state: PvpEconomyState = await PvpServiceMgr.inst.getEconomy();
                this.applyPvpEconomySnapshot?.(state.inventory);
                const icons: any = {};
                await Promise.all(['brush', 'magnet'].map(kind => new Promise<void>((resolve, reject) => {
                    const name = `popup_tool_${kind}_icon`;
                    const cached = this.getSF?.(name);
                    if (cached) { icons[kind] = cached; resolve(); return; }
                    const timeout = setTimeout(() => reject(new Error(`奖励图标加载超时：${name}`)), 8000);
                    this._loadSpriteFrameByName(name, (frame: any) => {
                        clearTimeout(timeout);
                        if (!frame) { reject(new Error(`奖励图标缺失：${name}`)); return; }
                        icons[kind] = frame;
                        resolve();
                    });
                })));
                if (!parent.isValid) return;
                const { root, card } = createPvpEconomyModal(parent, 'PvpRankRewardsOverlay', '段位奖励', 1040, () => { void onChange(); });
                addLabel(card, 'Season', `${state.seasonId} 赛季 · 每个大段位仅领一次`, 0, 414, 21, COLORS.violetDark);
                const message = addBoundedLabel(card, 'Message', state.rewardsEnabled ? '按本赛季最高段位解锁，掉段不影响领取' : '奖励暂未开放，可先查看段位奖品', 0, -463, 19, COLORS.muted, 560);
                const scroll = new Node('RewardScroll');
                scroll.layer = Layers.Enum.UI_2D;
                card.addChild(scroll);
                scroll.setPosition(0, -18, 0);
                ensureTransform(scroll, 598, 760);
                const scrollView = scroll.addComponent(ScrollView);
                scrollView.horizontal = false;
                scrollView.vertical = true;
                const viewport = new Node('View');
                viewport.layer = Layers.Enum.UI_2D;
                scroll.addChild(viewport);
                ensureTransform(viewport, 598, 760);
                viewport.addComponent(Mask);
                const content = new Node('Content');
                content.layer = Layers.Enum.UI_2D;
                viewport.addChild(content);
                const contentTransform = ensureTransform(content, 598, state.rewards.length * 116);
                contentTransform.setAnchorPoint(0.5, 1);
                content.setPosition(0, 380, 0);
                scrollView.content = content;
                const accents = [new Color(237, 145, 61), new Color(151, 169, 189), COLORS.gold, COLORS.blue, new Color(174, 119, 239), COLORS.coral, COLORS.gold];
                state.rewards.forEach((reward, index) => {
                    const row = addLobbySurface(content, `Reward_${reward.tier}`, 0, -54 - index * 116, 572, 102, new Color(212, 205, 239));
                    const badge = new Node('RankBadge');
                    badge.layer = Layers.Enum.UI_2D;
                    row.addChild(badge);
                    badge.setPosition(-239, 10, 0);
                    drawPixelPanel(badge, 64, 62, accents[index], 13);
                    addLabel(badge, 'Glyph', '★', 0, 0, 38, COLORS.white);
                    addBoundedLabel(row, 'RankName', reward.name, -217, -33, 18, COLORS.violetDark, 124);
                    if (reward.status !== 'pending') {
                        const icon = new Node('PropIcon');
                        icon.layer = Layers.Enum.UI_2D;
                        row.addChild(icon);
                        icon.setPosition(-92, 11, 0);
                        ensureTransform(icon, 53, 53);
                        const sprite = icon.addComponent(Sprite);
                        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                        sprite.spriteFrame = icons[reward.prop];
                        addLabel(row, 'PropAmount', `×${reward.count}`, -92, -27, 19, COLORS.violetDark);
                        const coin = new Node('GoldIcon');
                        coin.layer = Layers.Enum.UI_2D;
                        row.addChild(coin);
                        coin.setPosition(17, 11, 0);
                        ensureTransform(coin, 50, 50);
                        const coinGraphics = coin.addComponent(Graphics);
                        coinGraphics.fillColor = COLORS.gold;
                        coinGraphics.circle(0, 0, 24);
                        coinGraphics.fill();
                        coinGraphics.strokeColor = new Color(224, 160, 31);
                        coinGraphics.lineWidth = 3;
                        coinGraphics.circle(0, 0, 20);
                        coinGraphics.stroke();
                        addLabel(coin, 'GoldMark', '★', 0, 0, 27, new Color(213, 137, 29));
                        addLabel(row, 'GoldAmount', `×${reward.gold}`, 17, -27, 19, COLORS.violetDark);
                    } else addLabel(row, 'Unconfigured', '奖品待配置', -44, 0, 21, COLORS.muted);
                    const captions = { claimable: '领取', claimed: '已领取', locked: '去挑战', disabled: '待开放', pending: '待配置' };
                    const action = addButton(row, 'Claim', captions[reward.status], 191, 0, 140, 56,
                        reward.status === 'claimable' ? COLORS.gold : new Color(211, 212, 224), () => {
                            if (reward.status === 'locked') { root.active = false; root.destroy(); void onChange(); return; }
                            if (reward.status !== 'claimable' || this._pvpEconomyClaiming) return;
                            this._pvpEconomyClaiming = true;
                            action.getComponent(Button)!.interactable = false;
                            void PvpServiceMgr.inst.syncInventory(this).then(() => PvpServiceMgr.inst.claimRankReward(reward.tier, state.seasonId)).then(next => {
                                this.applyPvpEconomySnapshot(next.inventory);
                                reward.status = 'claimed';
                                if (root.isValid) {
                                    action.getChildByName('Label')!.getComponent(Label)!.string = '已领取';
                                    message.string = `${reward.name}奖励已到账`;
                                }
                            }).catch(error => {
                                if (root.isValid) { message.string = error.message; action.getComponent(Button)!.interactable = true; }
                            }).finally(() => { this._pvpEconomyClaiming = false; void onChange(); });
                        });
                    action.getComponent(Button)!.interactable = reward.status === 'claimable' || reward.status === 'locked';
                    action.getChildByName('Label')!.getComponent(Label)!.color = COLORS.violetDark;
                    action.getChildByName('Label')!.getComponent(Label)!.fontSize = 23;
                });
                lobbyStatus.string = '';
            } catch (error) {
                if (parent.isValid) lobbyStatus.string = `奖励加载失败：${error instanceof Error ? error.message : '服务异常'}`;
            } finally { this._pvpEconomyPanelOpening = false; }
        },

        openPvpFriendBattle(parent: Node, lobbyStatus: Label): void {
            parent.getChildByName('PvpFriendBattleOverlay')?.destroy();
            const panel = new Node('PvpFriendBattleOverlay');
            panel.layer = Layers.Enum.UI_2D;
            parent.addChild(panel);
            panel.setPosition(0, 10, 0);
            drawPixelPanel(panel, 620, 760, new Color(255, 249, 226, 255), 20);
            panel.addComponent(BlockInputEvents);

            const launchCode = PvpServiceMgr.inst.getLaunchChallengeCode();
            addLabel(panel, 'Title', '异步好友对战', 0, 310, 40, COLORS.violetDark);
            addBoundedLabel(panel, 'Subtitle', '不用同时在线 · 同一关卡 · 好友局不影响排位', 0, 258, 20, COLORS.muted, 540);

            const joinCard = new Node('JoinFriendCard');
            joinCard.layer = Layers.Enum.UI_2D;
            panel.addChild(joinCard);
            joinCard.setPosition(0, 112, 0);
            drawPanel(joinCard, 530, 210, new Color(229, 238, 255, 255), 22);
            addLabel(joinCard, 'Title', '去挑战好友', 0, 64, 28, COLORS.violetDark);
            addBoundedLabel(joinCard, 'Description', '回放好友已完成并保存的真实成绩', 0, 25, 18, COLORS.muted, 470);
            const codeText = launchCode ? `已读取挑战码：${launchCode}` : '打开好友分享卡片后，会自动读取挑战码';
            addBoundedLabel(joinCard, 'ChallengeCode', codeText, 0, -12, 18, launchCode ? COLORS.coral : COLORS.muted, 470);
            addButton(joinCard, 'JoinFriendChallenge', launchCode ? '开始挑战' : '等待好友邀请', 0, -66, 310, 58, COLORS.blue, () => {
                if (this._pvpMatchStarting) return;
                if (!launchCode) {
                    panelStatus.string = '请从好友发送的挑战分享卡片进入';
                    return;
                }
                this._pvpMatchStarting = true;
                panelStatus.string = `正在读取好友的已完成挑战 ${launchCode}…`;
                void PvpServiceMgr.inst.joinFriendChallenge(launchCode).then((context) => {
                    this._pvpMatchStarting = false;
                    if (!parent?.isValid) return;
                    AppRoot.ensure('Home').session.setPvpBattleContext(context);
                    panel.destroy();
                    this.showPvpOpponentReveal(parent, context);
                }).catch((error) => {
                    this._pvpMatchStarting = false;
                    if (panel?.isValid) panelStatus.string = `加入失败：${error instanceof Error ? error.message : '服务异常'}`;
                });
            });

            const createCard = new Node('CreateFriendCard');
            createCard.layer = Layers.Enum.UI_2D;
            panel.addChild(createCard);
            createCard.setPosition(0, -130, 0);
            drawPanel(createCard, 530, 210, new Color(255, 233, 237, 255), 22);
            addLabel(createCard, 'Title', '发起好友挑战', 0, 64, 28, COLORS.violetDark);
            addBoundedLabel(createCard, 'Description', '你先完成一局，成绩保存后再分享给好友', 0, 20, 18, COLORS.muted, 470);
            addButton(createCard, 'CreateFriendChallenge', '先玩一局并发起', 0, -55, 350, 64, COLORS.coral, () => {
                if (this._pvpMatchStarting) return;
                this._pvpMatchStarting = true;
                panelStatus.string = '正在创建好友挑战…';
                const levelId = this.getThemeDirectPlayLevelId();
                void PvpServiceMgr.inst.createFriendChallenge(levelId).then((result) => {
                    this._pvpMatchStarting = false;
                    if (!parent?.isValid) return;
                    lobbyStatus.string = '先完成本局，成绩保存后再邀请好友挑战';
                    AppRoot.ensure('Home').session.setPvpBattleContext(result.context);
                    panel.destroy();
                    this.showPvpOpponentReveal(parent, result.context);
                }).catch((error) => {
                    this._pvpMatchStarting = false;
                    if (panel?.isValid) panelStatus.string = `创建失败：${error instanceof Error ? error.message : '服务异常'}`;
                });
            });

            const panelStatus = addBoundedLabel(panel, 'FriendStatus', launchCode ? '好友成绩已准备好，可以开始挑战' : '也可以先发起一局，再把成绩分享给好友', 0, -276, 18, COLORS.muted, 540);
            addButton(panel, 'Close', '返回', 0, -330, 220, 58, COLORS.violetDark, () => {
                if (!this._pvpMatchStarting) panel.destroy();
            });
        },

        openPvpRules(parent: Node): void {
            parent.getChildByName('PvpRulesOverlay')?.destroy();
            const panel = new Node('PvpRulesOverlay');
            panel.layer = Layers.Enum.UI_2D;
            parent.addChild(panel);
            panel.setPosition(0, 10, 0);
            drawPixelPanel(panel, 620, 830, new Color(255, 249, 226, 255), 20);
            panel.addComponent(BlockInputEvents);
            addLabel(panel, 'Title', '排位玩法', 0, 350, 42, COLORS.violetDark);
            const rules = [
                '双方挑战同一像素拼图',
                '先通关的一方获胜',
                '未通关时，先失败的一方落败',
                '排位中可调倍速；没有道具、复活和暂存槽',
                '对手成绩在开局前已冻结，不是实时同步',
                '掉线后从已保存检查点恢复',
                '新局消耗 1 体力 + 1 门票；恢复不重复扣',
                '门票每日补足 3 张，分享限 2 次，广告不限',
                '段位奖品每赛季每个大段位领一次',
            ];
            rules.forEach((rule, index) => addLabel(panel, `Rule${index}`, `${index + 1}. ${rule}`, 0, 262 - index * 57, 21, COLORS.ink));
            addLabel(panel, 'RankTitle', '段位：青铜 → 白银 → 黄金 → 铂金 → 钻石 → 星耀 → 王者', 0, -257, 18, COLORS.violet);
            addButton(panel, 'Close', '我知道了', 0, -340, 250, 66, COLORS.violet, () => panel.destroy());
        },

        async openPvpHistory(parent: Node, status: Label): Promise<void> {
            status.string = '正在加载对战记录…';
            try {
                const history = await PvpServiceMgr.inst.getHistory(20);
                parent.getChildByName('PvpHistoryOverlay')?.destroy();
                const panel = new Node('PvpHistoryOverlay');
                panel.layer = Layers.Enum.UI_2D;
                parent.addChild(panel);
                panel.setPosition(0, 10, 0);
                drawPixelPanel(panel, 620, 850, COLORS.pale, 22);
                panel.addComponent(BlockInputEvents);
                addLabel(panel, 'Title', '对战记录', 0, 360, 40, COLORS.ink);
                history.slice(0, 7).forEach((match: any, index: number) => {
                    const result = match.settlement?.outcome === 'win' ? '胜利' : match.settlement?.outcome === 'lose' ? '失败' : match.status === 'SETTLED' ? '平局' : match.status === 'WAITING_OPPONENT' ? '待好友挑战' : '待结算';
                    const color = result === '胜利' ? COLORS.gold : result === '失败' ? COLORS.coral : COLORS.muted;
                    addLabel(panel, `Result${index}`, result, -235, 280 - index * 82, 22, color);
                    addLabel(panel, `Opponent${index}`, `对手 ${match.opponent?.displayName || '等待好友'} · 第${match.levelId}关`, -30, 280 - index * 82, 19, COLORS.ink);
                    const delta = Number(match.settlement?.rankStarDelta) || 0;
                    addLabel(panel, `Delta${index}`, match.status === 'SETTLED' ? `${delta >= 0 ? '+' : ''}${delta}` : '—', 235, 280 - index * 82, 19, color);
                });
                if (history.length === 0) addLabel(panel, 'Empty', '完成第一场排位后，这里会显示战绩', 0, 80, 21, COLORS.muted);
                addButton(panel, 'Close', '关闭', 0, -360, 190, 60, COLORS.violet, () => panel.destroy());
                status.string = '对战记录已更新';
            } catch (error) {
                status.string = `战绩加载失败：${error instanceof Error ? error.message : '服务异常'}`;
            }
        },

        confirmPvpForfeitAndHome(): Promise<void> {
            return new Promise((resolve) => {
                const context = getPvpContext();
                if (!context) {
                    resolve();
                    return;
                }
                const overlayRoot = this.requireCanvasUiRoot('OverlayRoot');
                overlayRoot.getChildByName('PvpForfeitConfirm')?.destroy();
                const panel = new Node('PvpForfeitConfirm');
                panel.layer = Layers.Enum.UI_2D;
                overlayRoot.addChild(panel);
                ensureTransform(panel, 720, 1280);
                drawPanel(panel, 720, 1280, new Color(18, 22, 48, 210), 0);
                panel.addComponent(BlockInputEvents);
                const card = new Node('Card');
                card.layer = Layers.Enum.UI_2D;
                panel.addChild(card);
                drawPixelPanel(card, 580, 390, new Color(255, 249, 226, 255), 18);
                addLabel(card, 'Title', '认输并退出？', 0, 120, 40, COLORS.coral);
                addLabel(card, 'Body', '认输后本局立即判负，不能恢复。', 0, 52, 22, COLORS.ink);
                addButton(card, 'Continue', '继续对战', -135, -95, 220, 68, COLORS.violet, () => {
                    panel.destroy();
                    resolve();
                });
                addButton(card, 'Forfeit', '认输并退出', 135, -95, 220, 68, COLORS.coral, () => {
                    const elapsedMs = Math.max(1, Date.now() - context.startedAtMs);
                    const progress = computeBoardProgress(this);
                    const leave = context.demo
                        ? Promise.resolve()
                        : PvpServiceMgr.inst.cancelMatch(context, elapsedMs, progress).then(() => undefined);
                    void leave.then(() => {
                        PvpServiceMgr.inst.clearPersistedBattle();
                        AppRoot.tryGet()?.session.clearPvpBattleContext();
                        panel.destroy();
                        return this.requestHomeRoute('pvp-forfeit', 'none');
                    }).then(resolve).catch((error) => {
                        const body = card.getChildByName('Body')?.getComponent(Label);
                        if (body) body.string = `提交认输失败：${error instanceof Error ? error.message : '服务异常'}`;
                    });
                });
            });
        },

        showPvpOpponentReveal(parent: Node, context: PvpBattleContext): void {
            if (!isPixelPvpMatch(context)) throw new Error('[PvpMode] cannot enter legacy mainline match');
            parent.getChildByName('PvpOpponentReveal')?.destroy();
            const reveal = new Node('PvpOpponentReveal');
            reveal.layer = Layers.Enum.UI_2D;
            parent.addChild(reveal);
            ensureTransform(reveal, 720, 1280);
            reveal.addComponent(BlockInputEvents);
            const background = reveal.addComponent(Graphics);
            background.fillColor = new Color(78, 111, 224, 255);
            background.rect(-360, -640, 720, 1280);
            background.fill();
            background.fillColor = new Color(242, 92, 107, 255);
            background.moveTo(-360, -640);
            background.lineTo(360, -640);
            background.lineTo(360, 390);
            background.lineTo(-360, -210);
            background.close();
            background.fill();
            const creatingFriendChallenge = context.matchType === 'friend' && context.friendRole === 'creator';
            addLabel(reveal, 'Title', creatingFriendChallenge ? '创建异步挑战' : '对手成绩已就绪', 0, 490, 48, COLORS.white);
            addAvatar(this, reveal, 'SelfAvatar', context.self, -180, 240, COLORS.blue);
            addAvatar(this, reveal, 'OpponentAvatar', context.opponent, 180, -35, COLORS.coral);
            addLabel(reveal, 'SelfName', context.self.displayName, -180, 180, 24, COLORS.white);
            addLabel(reveal, 'SelfRank', `${context.self.rankName} · ${context.self.stars}星`, -180, 142, 18, COLORS.white);
            addLabel(reveal, 'Vs', 'VS', 0, 90, 60, COLORS.gold);
            addLabel(reveal, 'OpponentName', creatingFriendChallenge ? '好友稍后挑战' : context.opponent.displayName, 180, -95, 24, COLORS.white);
            addLabel(reveal, 'OpponentRank', creatingFriendChallenge ? '你的成绩将成为挑战目标' : `${context.opponent.rankName} · ${context.opponent.stars}星`, 180, -133, 18, COLORS.white);
            const tag = new Node('OpponentType');
            tag.layer = Layers.Enum.UI_2D;
            reveal.addChild(tag);
            tag.setPosition(180, -175, 0);
            drawPixelPanel(tag, 120, 34, COLORS.violetDark, 7);
            addLabel(tag, 'Label', opponentTypeLabel(context), 0, 0, 16, COLORS.white);
            const fairRule = new Node('FairRule');
            fairRule.layer = Layers.Enum.UI_2D;
            reveal.addChild(fairRule);
            fairRule.setPosition(0, -350, 0);
            drawPixelPanel(fairRule, 520, 112, new Color(37, 48, 93, 232), 14);
            addLabel(fairRule, 'Line1', '同一关卡 · 无道具 · 无复活', 0, 22, 21, COLORS.white);
            addLabel(fairRule, 'Line2', creatingFriendChallenge ? '先完成本局，再邀请好友挑战' : '按同一时间轴回放已冻结成绩', 0, -22, 19, COLORS.gold);
            addLabel(reveal, 'Ready', creatingFriendChallenge ? '准备生成挑战成绩' : '准备挑战', 0, -465, 23, COLORS.white);
            this.scheduleOnce(() => {
                if (!reveal?.isValid) return;
                const appRoot = AppRoot.tryGet();
                if (!appRoot) throw new Error('[PvpMode] AppRoot unavailable before gameplay route');
                appRoot.markGameRequested(context.levelId, context.levelPrefix, 'theme', 'none', PVP_ROUTE_REASON);
                void appRoot.router.toGame().catch((error) => {
                    this._pvpMatchStarting = false;
                    if (reveal?.isValid) reveal.destroy();
                    const status = parent.getChildByName('Status')?.getComponent(Label);
                    if (status) status.string = `进入对战失败：${error instanceof Error ? error.message : '场景加载异常'}`;
                });
            }, 1.5);
        },

        mountPvpBattleHud(): void {
            if (!this.isRankedPvpMode()) return;
            const context = getPvpContext();
            if (!context) throw new Error('[PvpMode] ranked route missing battle context');
            PvpServiceMgr.inst.preparePreviewBattle(context, this.levelData);
            if (context.levelHash && pixelLevelHash(this.levelData) !== context.levelHash) throw new Error('[PvpMode] replay level version mismatch');
            this._pvpReplayResumeState = context.resumeReplay ? replayHumanEvents(this.levelData, context.resumeReplay) : null;
            if (this._pvpReplayResumeState) this.boardModel = this._pvpReplayResumeState.board;
            const topBar = this.getGameplayFixedGroup('TopBarGroup');
            if (topBar.parent?.isValid) topBar.setSiblingIndex(topBar.parent.children.length - 1);
            topBar.getChildByName('LevelTitle')!.active = false;
            topBar.getChildByName('LevelTitleLevel1')!.active = false;
            const timerWrap = topBar.getChildByName('TimerWrap');
            const timerLabel = timerWrap?.getChildByName('Timer')?.getComponent(Label);
            if (!timerWrap || !timerLabel) throw new Error('[PvpMode] original TopBarGroup/TimerWrap/Timer is required');
            timerWrap.active = true;
            const timerWidget = timerWrap.getComponent(Widget);
            if (!timerWidget) throw new Error('[PvpMode] PVP timer requires the scene Widget anchor');
            alignPvpUtilityCenter(timerWrap, timerWidget, PVP_BATTLE_ARTWORK_OPTICAL_TOP_OFFSET);
            this._pvpTimerLabel = timerLabel;
            const speedNode = topBar.getChildByName('PchSpeedButton');
            if (!speedNode) throw new Error('[PvpMode] TopBarGroup/PchSpeedButton is required by the formal battle HUD');
            speedNode.active = true;
            const speedWidget = speedNode.getComponent(Widget);
            if (!speedWidget) throw new Error('[PvpMode] PVP speed control requires the scene Widget anchor');
            alignPvpUtilityCenter(speedNode, speedWidget, PVP_BATTLE_ARTWORK_OPTICAL_TOP_OFFSET);
            const settingsNode = topBar.getChildByName('Settings');
            const settingsWidget = settingsNode?.getComponent(Widget);
            if (!settingsNode || !settingsWidget) throw new Error('[PvpMode] PVP settings control requires the scene Widget anchor');
            alignPvpUtilityCenter(settingsNode, settingsWidget);
            this.getGameplayBottomHudChild('SkillArea').active = false;
            topBar.getChildByName('PvpBattleHud')?.destroy();
            const hud = new Node('PvpBattleHud');
            hud.layer = Layers.Enum.UI_2D;
            topBar.addChild(hud);
            hud.setPosition(0, 0, 0);
            ensureTransform(hud, 720, 1280);

            const addIdentityPlate = (name: string, displayName: string, x: number, color: Color): Node => {
                const plateShadow = new Node(`${name}Shadow`);
                plateShadow.layer = Layers.Enum.UI_2D;
                hud.addChild(plateShadow);
                plateShadow.setPosition(x, 433, 0);
                drawPanel(plateShadow, 230, 98, new Color(58, 63, 111, 72), 22);
                const plate = new Node(name);
                plate.layer = Layers.Enum.UI_2D;
                hud.addChild(plate);
                plate.setPosition(x, 441, 0);
                const plateGraphics = drawPanel(plate, 230, 98, color, 22);
                plateGraphics.strokeColor = new Color(255, 255, 255, 225);
                plateGraphics.lineWidth = 3;
                plateGraphics.roundRect(-115, -49, 230, 98, 22);
                plateGraphics.stroke();
                addBoundedLabel(plate, name === 'SelfIdentityPlate' ? 'Self' : 'Opponent', displayName, 0, -20, 23, COLORS.white, 196);
                return plate;
            };
            addIdentityPlate('SelfIdentityPlate', context.self.displayName, -230, COLORS.blue);
            addIdentityPlate('OpponentIdentityPlate', context.opponent.displayName, 8, COLORS.coral);
            addAvatar(this, hud, 'SelfAvatar', context.self, -230, 507, COLORS.blue, 86);
            addAvatar(this, hud, 'OpponentAvatar', context.opponent, 8, 507, COLORS.coral, 86);
            for (const [index, offset] of [[-2, 0], [2, 0], [0, -2], [0, 2]].entries()) {
                addLabel(hud, `VersusOutline${index}`, 'VS', -111 + offset[0], 493 + offset[1], 52, COLORS.white);
            }
            addLabel(hud, 'Versus', 'VS', -111, 493, 52, new Color(255, 166, 35, 255));

            this._pvpSelfProgress = addProgress(hud, 'SelfProgress', -105, 352, 460, -105, COLORS.blue);
            this._pvpOpponentProgress = addProgress(hud, 'OpponentProgress', -105, 307, 460, -105, COLORS.coral);
            this._pvpSyncLabel = addBoundedLabel(hud, 'SyncState', context.friendRole === 'creator' ? '挑战成绩记录中' : '已保存', -105, 272, 13, COLORS.muted, 460);
            this._pvpSyncLabel.node.active = false;
            const thumbnail = new Node('OpponentThumbnail');
            thumbnail.layer = Layers.Enum.UI_2D;
            hud.addChild(thumbnail);
            thumbnail.setPosition(252, 424, 0);
            ensureTransform(thumbnail, 190, 276);
            const thumbnailFrame = thumbnail.addComponent(Graphics);
            thumbnailFrame.fillColor = new Color(255, 255, 255, 244);
            thumbnailFrame.roundRect(-95, -138, 190, 276, 24);
            thumbnailFrame.fill();
            thumbnailFrame.strokeColor = new Color(197, 193, 225, 255);
            thumbnailFrame.lineWidth = 5;
            thumbnailFrame.roundRect(-92, -135, 184, 270, 22);
            thumbnailFrame.stroke();
            const thumbnailPixels = new Node('BoardPixels');
            thumbnailPixels.layer = Layers.Enum.UI_2D;
            thumbnail.addChild(thumbnailPixels);
            ensureTransform(thumbnailPixels, PVP_THUMBNAIL_DRAW_WIDTH, PVP_THUMBNAIL_DRAW_HEIGHT);
            drawOpponentThumbnail(this, thumbnailPixels, []);
            this._pvpOpponentThumbnail = thumbnailPixels;
            if (!hud.getChildByName('OpponentAvatar') || !hud.getChildByName('OpponentProgress') || !hud.getChildByName('OpponentThumbnail')) {
                throw new Error('[PvpMode] opponent HUD failed to mount');
            }
            this._pvpBattleSettled = false;
            this._pvpSubmitting = false;
            this._pvpActions = this._pvpReplayResumeState ? [...this._pvpReplayResumeState.actions] : [];
            this._pvpRuleEvents = context.resumeReplay ? [...context.resumeReplay.events] : [];
            this._pvpProgressTimeline = [{ elapsedMs: 0, progress: 0 }];
            this._pvpBoardTimeline = Array.isArray(context.resumeBoardTimeline) ? [...context.resumeBoardTimeline] : [];
            this._pvpRecordedLockedKeys = new Set<string>();
            for (const point of this._pvpBoardTimeline as PvpBoardTimelinePoint[]) {
                for (const cell of point.addedCells || []) this._pvpRecordedLockedKeys.add(`${cell.row}:${cell.col}`);
            }
            this._pvpLastRecordedProgress = 0;
            this._pvpLastOpponentBoardRevision = '';
            this._pvpNextCheckpointAtMs = 5000;
            this._pvpCheckpointInFlight = false;
            this._pvpSyncFailureCount = 0;
            settingsNode.active = true;
            hud.setSiblingIndex(topBar.children.length - 1);
            timerWrap.setSiblingIndex(topBar.children.length - 1);
            speedNode.setSiblingIndex(topBar.children.length - 1);
            settingsNode.setSiblingIndex(topBar.children.length - 1);
            context.startedAtMs = Date.now() - Math.max(0, Number((context as any).resumeElapsedMs) || 0);
            PvpServiceMgr.inst.persistBattle(context);
        },

        recordPvpAction(row: number, col: number, colorId: number, moved: number): void {
            if (!this.isRankedPvpMode() || this._pvpBattleSettled) return;
            const context = getPvpContext();
            if (!context) return;
            const actions = this._pvpActions || (this._pvpActions = []);
            if (actions.length >= 4096) throw new Error('[PvpMode] action log exceeds safety limit');
            actions.push({
                seq: actions.length + 1,
                elapsedMs: Math.max(0, Date.now() - context.startedAtMs),
                row: Math.floor(Number(row) || 0),
                col: Math.floor(Number(col) || 0),
                colorId: Math.floor(Number(colorId) || 0),
                moved: Math.max(0, Math.floor(Number(moved) || 0)),
            });
        },

        recordPvpRuleEvent(kind: number, ...args: number[]): void {
            if (this.isCoopMode?.()) { this.recordCoopRuleEvent(kind, ...args); return; }
            const context = getPvpContext();
            if (!context?.replayProtocol || this._pvpBattleSettled || !this.isRankedPvpMode()) return;
            const events = this._pvpRuleEvents || (this._pvpRuleEvents = []);
            if (events.length >= 75000) throw new Error('[PvpMode] replay event limit exceeded');
            events.push([Math.max(0, Date.now() - context.startedAtMs), kind, ...args]);
        },

        updatePvpBattle(): void {
            if (!this.isRankedPvpMode() || this._pvpBattleSettled) return;
            const context = getPvpContext();
            if (!context) return;
            const elapsedMs = Math.max(0, Date.now() - context.startedAtMs);
            const ownProgress = computeBoardProgress(this);
            if (ownProgress !== this._pvpLastRecordedProgress) {
                this._pvpLastRecordedProgress = ownProgress;
                if (this._pvpProgressTimeline.length < 512) this._pvpProgressTimeline.push({ elapsedMs, progress: ownProgress });
                appendPvpBoardDelta(this, elapsedMs);
            }
            const opponentProgress = opponentProgressAt(context, elapsedMs);
            setProgress(this._pvpSelfProgress, ownProgress, COLORS.blue);
            if (opponentProgress === null) {
                this._pvpOpponentProgress.label.string = context.friendRole === 'creator' ? '待好友挑战' : '暂不可用';
                if (context.friendRole !== 'creator' && this._pvpSyncLabel) {
                    this._pvpSyncLabel.string = '! 对手成绩不可用';
                    this._pvpSyncLabel.color = COLORS.coral;
                    this._pvpSyncLabel.node.active = true;
                }
            } else {
                setProgress(this._pvpOpponentProgress, opponentProgress, opponentProgress >= 0.9 ? COLORS.gold : COLORS.coral);
                const boardState = opponentBoardStateAt(this, context, elapsedMs, opponentProgress);
                if (boardState.revision !== this._pvpLastOpponentBoardRevision) {
                    this._pvpLastOpponentBoardRevision = boardState.revision;
                    drawOpponentThumbnail(this, this._pvpOpponentThumbnail, boardState.cells);
                }
                if (!boardState.available && this._pvpSyncLabel) {
                    this._pvpSyncLabel.string = '! 对手棋盘暂不可用';
                    this._pvpSyncLabel.color = COLORS.coral;
                    this._pvpSyncLabel.node.active = true;
                }
            }
            if (!context.demo && elapsedMs >= this._pvpNextCheckpointAtMs && !this._pvpCheckpointInFlight) {
                this._pvpNextCheckpointAtMs = elapsedMs + 5000;
                void this.syncPvpCheckpoint(context, elapsedMs, ownProgress);
            }
            if (elapsedMs >= context.opponentTargetMs && !this.isGameEnd) {
                const thresholdTerminal: PvpTerminalType = context.opponentTerminalType === 'PASS' ? 'FORFEIT' : 'SURVIVED_OPPONENT_DEATH';
                void this.finishPvpBattle(thresholdTerminal, elapsedMs, context.opponentTerminalType === 'PASS' ? '对手先通关' : '对手先失败');
            }
        },

        async syncPvpCheckpoint(context: PvpBattleContext, elapsedMs: number, progress: number): Promise<void> {
            this._pvpCheckpointInFlight = true;
            appendPvpBoardDelta(this, elapsedMs);
            if (this._pvpSyncLabel?.node?.isValid) {
                this._pvpSyncLabel.string = '↑ 成绩保存中';
                this._pvpSyncLabel.color = COLORS.violet;
                this._pvpSyncLabel.node.active = false;
            }
            try {
                await PvpServiceMgr.inst.saveCheckpoint(
                    context,
                    elapsedMs,
                    progress,
                    this._pvpActions || [],
                    collectLockedCells(this),
                    this._pvpBoardTimeline || [],
                    context.replayProtocol === HUMAN_REPLAY_PROTOCOL ? { protocol: HUMAN_REPLAY_PROTOCOL,
                        levelHash: context.levelHash!, events: [...(this._pvpRuleEvents || [])] } : undefined,
                );
                this._pvpSyncFailureCount = 0;
                (context as any).resumeElapsedMs = elapsedMs;
                PvpServiceMgr.inst.persistBattle(context);
                this._pchConveyorGameplayController?.setExternalInputBlocked?.(false);
                if (this._pvpSyncLabel?.node?.isValid) {
                    this._pvpSyncLabel.string = '✓ 本局进度已保存';
                    this._pvpSyncLabel.color = new Color(56, 185, 107, 255);
                    this._pvpSyncLabel.node.active = false;
                }
            } catch (_) {
                this._pvpSyncFailureCount = Math.min(3, Number(this._pvpSyncFailureCount) + 1);
                this._pchConveyorGameplayController?.setExternalInputBlocked?.(false);
                if (this._pvpSyncLabel?.node?.isValid) {
                    this._pvpSyncLabel.string = '! 成绩保存失败，正在重试';
                    this._pvpSyncLabel.color = COLORS.coral;
                    this._pvpSyncLabel.node.active = true;
                }
                if (this._pvpSyncFailureCount >= 3) this._pvpNextCheckpointAtMs = elapsedMs + 2000;
            } finally {
                this._pvpCheckpointInFlight = false;
            }
        },

        handlePvpTerminal(terminalType: PvpTerminalType): boolean {
            if (!this.isRankedPvpMode()) return false;
            const context = getPvpContext();
            if (!context || this._pvpBattleSettled) return true;
            const ownTimeMs = Math.max(0, Date.now() - context.startedAtMs);
            void this.finishPvpBattle(terminalType, ownTimeMs, terminalType === 'PASS' ? '通关成绩已提交' : '你先失败');
            return true;
        },

        async finishPvpBattle(terminalType: PvpTerminalType, ownTimeMs: number, reason: string): Promise<void> {
            if (this._pvpBattleSettled || this._pvpSubmitting) return;
            this._pvpSubmitting = true;
            this._pvpBattleSettled = true;
            this.isGameEnd = true;
            this.unschedule(this.tickTimer);
            this._pchConveyorGameplayController?.pauseForSettlement?.();
            const context = getPvpContext();
            if (!context) throw new Error('[PvpMode] missing context during settlement');
            appendPvpBoardDelta(this, ownTimeMs);
            const localOutcome = resolvePvpOutcome(terminalType, ownTimeMs, context.opponentTerminalType, context.opponentTargetMs);
            if (context.demo) PvpServiceMgr.inst.recordPreviewResult(context, localOutcome);
            let outcome = localOutcome;
            let settlement: any = null;
            let waitingForFriend = false;
            let shareableFriendChallenge = false;
            let submittedMatch: any = null;
            if (!context.demo) {
                try {
                    const result = await PvpServiceMgr.inst.submitResult(context, {
                        terminalType,
                        terminalTimeMs: ownTimeMs,
                        progress: computeBoardProgress(this),
                        actions: this._pvpActions || [],
                        progressTimeline: this._pvpProgressTimeline || [],
                        boardTimeline: this._pvpBoardTimeline || [],
                        replay: { protocol: context.replayProtocol, levelHash: context.levelHash,
                            events: this._pvpRuleEvents || [] },
                    });
                    submittedMatch = result;
                    PvpServiceMgr.inst.clearPersistedBattle();
                    if (result.status === 'WAITING_OPPONENT' || result.status === 'WAITING_RESULT') {
                        shareableFriendChallenge = result.status === 'WAITING_OPPONENT';
                        reason = result.status === 'WAITING_OPPONENT'
                            ? '挑战成绩已保存，现在可以邀请好友来挑战'
                            : '成绩已保存，等待异步结算';
                        waitingForFriend = true;
                    } else if (result.settlement) {
                        settlement = result.settlement;
                        outcome = settlement.outcome;
                    }
                } catch (error) {
                    this._pvpSubmitting = false;
                    const overlayRoot = this.requireCanvasUiRoot('OverlayRoot');
                    const failed = new Node('PvpSubmitFailureOverlay');
                    failed.layer = Layers.Enum.UI_2D;
                    overlayRoot.addChild(failed);
                    ensureTransform(failed, 720, 1280);
                    drawPanel(failed, 720, 1280, new Color(18, 22, 48, 230), 0);
                    failed.addComponent(BlockInputEvents);
                    addLabel(failed, 'Title', '成绩提交失败', 0, 220, 54, COLORS.white);
                    addLabel(failed, 'Reason', error instanceof Error ? error.message : '云服务异常', 0, 125, 22, COLORS.coral);
                    addLabel(failed, 'Hint', '本局不会按客户端结果发放段位分', 0, 60, 20, COLORS.muted);
                    addButton(failed, 'Retry', '重新提交', 0, -70, 300, 78, COLORS.violet, () => {
                        failed.destroy();
                        this._pvpBattleSettled = false;
                        void this.finishPvpBattle(terminalType, ownTimeMs, reason);
                    });
                    return;
                }
            }
            this._pvpSubmitting = false;
            const overlayRoot = this.requireCanvasUiRoot('OverlayRoot');
            const overlay = new Node('PvpResultOverlay');
            overlay.layer = Layers.Enum.UI_2D;
            overlayRoot.addChild(overlay);
            ensureTransform(overlay, 720, 1280);
            drawPanel(overlay, 720, 1280, new Color(18, 22, 48, 230), 0);
            overlay.addComponent(BlockInputEvents);
            const title = shareableFriendChallenge ? '挑战已生成' : waitingForFriend ? '等待结算' : outcome === 'win' ? '胜利' : outcome === 'lose' ? '失败' : '平局';
            addLabel(overlay, 'Title', title, 0, 390, 72, outcome === 'win' ? COLORS.gold : COLORS.white);
            const selfPlate = new Node('SelfResultPlate');
            selfPlate.layer = Layers.Enum.UI_2D;
            overlay.addChild(selfPlate);
            selfPlate.setPosition(-165, 210, 0);
            drawPixelPanel(selfPlate, 260, 180, new Color(77, 139, 239, 245), 16);
            addAvatar(this, selfPlate, 'Avatar', context.self, 0, 35, COLORS.white);
            addLabel(selfPlate, 'Name', context.self.displayName, 0, -18, 21, COLORS.white);
            addLabel(selfPlate, 'Time', `${(ownTimeMs / 1000).toFixed(1)}秒`, 0, -55, 25, COLORS.white);
            if (!waitingForFriend && outcome === 'win') addLabel(selfPlate, 'Crown', '♛', 0, 82, 38, COLORS.gold);
            const opponentPlate = new Node('OpponentResultPlate');
            opponentPlate.layer = Layers.Enum.UI_2D;
            overlay.addChild(opponentPlate);
            opponentPlate.setPosition(165, 210, 0);
            drawPixelPanel(opponentPlate, 260, 180, new Color(242, 92, 107, 245), 16);
            addAvatar(this, opponentPlate, 'Avatar', context.opponent, 0, 35, COLORS.white);
            addLabel(opponentPlate, 'Name', context.opponent.displayName, 0, -18, 21, COLORS.white);
            addLabel(opponentPlate, 'Time', waitingForFriend ? '等待好友挑战' : `${(context.opponentTargetMs / 1000).toFixed(1)}秒`, 0, -55, 25, COLORS.white);
            if (!waitingForFriend && outcome === 'lose') addLabel(opponentPlate, 'Crown', '♛', 0, 82, 38, COLORS.gold);
            addLabel(overlay, 'Versus', 'VS', 0, 210, 36, COLORS.gold);
            if (!waitingForFriend && terminalType === 'PASS' && context.opponentTerminalType === 'PASS') {
                const differenceSeconds = Math.abs(context.opponentTargetMs - ownTimeMs) / 1000;
                reason = outcome === 'win' ? `你先通关 ${differenceSeconds.toFixed(1)} 秒` : outcome === 'lose' ? `对手先通关 ${differenceSeconds.toFixed(1)} 秒` : '双方同时通关';
            }
            addLabel(overlay, 'Reason', reason, 0, 80, 26, COLORS.white);
            const deltaText = waitingForFriend ? '好友完成后不改变排位星级' : settlement ? `${settlement.braveryProtected ? '勇者积分保护 · ' : ''}星级 ${settlement.rankStarDelta >= 0 ? '+' : ''}${settlement.rankStarDelta} · ${settlement.rankAfter.displayName}` : (outcome === 'win' ? '段位星级 +1' : outcome === 'lose' ? '段位星级 -1' : '段位星级不变');
            addLabel(overlay, 'RankDelta', deltaText, 0, 15, 27, outcome === 'win' ? COLORS.gold : COLORS.white);
            addLabel(overlay, 'Verify', context.demo ? '本地演示结果' : waitingForFriend ? '成绩已由云端保存' : '结果已由云端结算', 0, -45, 18, COLORS.muted);
            if (shareableFriendChallenge) {
                const shareStatus = addLabel(overlay, 'ShareStatus', `挑战码 ${submittedMatch?.challengeCode || context.challengeCode || '生成中'}`, 0, -105, 18, COLORS.muted);
                addButton(overlay, 'ShareChallenge', '邀请好友挑战', 0, -175, 350, 76, COLORS.coral, () => {
                    const challengeCode = String(submittedMatch?.challengeCode || context.challengeCode || '');
                    if (!challengeCode) {
                        shareStatus.string = '挑战码不可用，请返回大厅后重试';
                        return;
                    }
                    shareStatus.string = PvpServiceMgr.inst.shareFriendChallenge(challengeCode)
                        ? '已打开分享面板'
                        : `挑战码 ${challengeCode} · 当前平台不支持分享`;
                });
            }
            addButton(overlay, 'ReturnLobby', '返回大厅', 0, shareableFriendChallenge ? -275 : -205, 350, 86, COLORS.violet, () => {
                PvpServiceMgr.inst.clearPersistedBattle();
                AppRoot.tryGet()?.session.clearPvpBattleContext();
                AppRoot.inst.session.pixelPuzzleLobbyActive = true;
                void this.requestHomeRoute('pvp-result', 'none');
            });
        },

        async openPvpLeaderboard(parent: Node, status: Label): Promise<void> {
            status.string = '正在加载排位榜…';
            try {
                const result = await PvpServiceMgr.inst.getLeaderboard(20);
                parent.getChildByName('PvpLeaderboardOverlay')?.destroy();
                const panel = new Node('PvpLeaderboardOverlay');
                panel.layer = Layers.Enum.UI_2D;
                parent.addChild(panel);
                panel.setPosition(0, 20, 0);
                drawPanel(panel, 610, 760, COLORS.pale, 28);
                panel.addComponent(BlockInputEvents);
                addLabel(panel, 'Title', '像素排位榜', 0, 320, 38, COLORS.ink);
                result.entries.slice(0, 8).forEach((entry: PvpLeaderboardEntry, index: number) => {
                    addLabel(panel, `Rank${index}`, `${entry.rank}. ${entry.displayName}`, -145, 250 - index * 66, 21, entry.isSelf ? COLORS.coral : COLORS.ink);
                    addLabel(panel, `Score${index}`, `${entry.rankName} · ${entry.stars}星`, 145, 250 - index * 66, 18, COLORS.muted);
                });
                if (result.entries.length === 0) addLabel(panel, 'Empty', '暂无排位数据', 0, 80, 24, COLORS.muted);
                addButton(panel, 'Close', '关闭', 0, -320, 180, 58, COLORS.violet, () => panel.destroy());
                status.string = '排行榜已更新';
            } catch (error) {
                status.string = `排行榜加载失败：${error instanceof Error ? error.message : '服务异常'}`;
            }
        },
    });
    target._pvpRankedModeConfig = PVP_RANKED_MODE_CONFIG;
}
