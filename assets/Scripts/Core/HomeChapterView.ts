import { Label, Node, UITransform, UIOpacity, Tween, tween, Vec3 } from 'cc';
import { getPhysicalMainLevelId } from './LevelRouteService';
import { getBrowserLevelPreview } from './BrowserLevelPreview';
import { openHomeArtworkPreview } from './HomeArtworkPreview';
import { renderCompletedPatternPreview, releaseCompletedPatternPreviewTree } from './CompletedPatternPreview';

// Survives Home/Game scene switches, but never replays historical progress on launch.
let lastShownProgress: number | undefined;
let lastShownPreviewProgress: number | undefined;

/** Chapters group the existing mainline progress; they do not own a second save. */
export function getHomeChapter(currentLevel: number, savedLevel: number) {
    if (!Number.isInteger(currentLevel) || currentLevel < 1
        || !Number.isInteger(savedLevel) || savedLevel < 1) {
        throw new Error('[home-chapter] Invalid mainline progress');
    }
    const chapter = Math.floor((currentLevel - 1) / 9) + 1;
    const firstLevel = (chapter - 1) * 9 + 1;
    const cells = Array.from({ length: 9 }, (_, index) => {
        const level = firstLevel + index;
        return { level, completed: level < savedLevel, current: level === currentLevel };
    });
    return { chapter, cells, completed: cells.filter(cell => cell.completed).length };
}

function child(parent: Node, name: string): Node {
    const node = parent.getChildByName(name);
    if (!node) throw new Error(`[home-chapter] Missing scene node ${parent.name}/${name}`);
    return node;
}

function label(node: Node): Label {
    const component = node.getComponent(Label);
    if (!component) throw new Error(`[home-chapter] Missing Label on ${node.name}`);
    return component;
}

export function renderHomeChapter(runtime: any, heroCard: Node, currentLevel: number): void {
    const previewState = getBrowserLevelPreview();
    const savedLevel = previewState.active ? previewState.getLevel() : runtime.getSavedLevel();
    const model = getHomeChapter(currentLevel, savedLevel);
    const previous = (previewState.active ? lastShownPreviewProgress : lastShownProgress) ?? savedLevel;
    if (previewState.active) lastShownPreviewProgress = savedLevel;
    else lastShownProgress = savedLevel;
    const reveals: Array<() => void> = [];
    let waiting = model.cells.filter(cell => cell.completed && cell.level >= previous).length;
    const settled = () => {
        if (--waiting === 0) reveals.forEach(reveal => reveal());
    };
    let revealIndex = 0;
    label(child(heroCard, 'ChapterTitle')).string = `第 ${model.chapter} 章`;
    label(child(heroCard, 'ChapterProgress')).string = `已完成 ${model.completed} / 9`;
    const grid = child(heroCard, 'ChapterGrid');
    model.cells.forEach((cell, index) => {
        const slot = child(grid, `Cell${index + 1}`);
        const number = label(child(slot, 'LevelNumber'));
        const preview = child(slot, 'PreviewAnchor');
        const status = label(child(slot, 'Status'));
        const token = {};
        (slot as any).__homeChapterToken = token;
        const oldClick = (slot as any).__homeArtworkClick;
        if (oldClick) slot.off(Node.EventType.TOUCH_END, oldClick);
        const click = (event: any) => {
            event.propagationStopped = true;
            if (!cell.completed) return;
            openHomeArtworkPreview(runtime, model.cells.filter(item => item.completed).map(item => item.level), cell.level);
        };
        (slot as any).__homeArtworkClick = click;
        slot.on(Node.EventType.TOUCH_END, click);
        const wanted = () => slot.isValid && preview.isValid && (slot as any).__homeChapterToken === token;
        const animate = cell.completed && cell.level >= previous;
        const delay = animate ? revealIndex++ * 0.1 : 0;
        const opacity = preview.getComponent(UIOpacity) || preview.addComponent(UIOpacity);
        const numberOpacity = number.node.getComponent(UIOpacity) || number.node.addComponent(UIOpacity);
        [slot, preview, opacity, numberOpacity].forEach(target => Tween.stopAllByTarget(target));
        slot.setScale(1, 1, 1); preview.setScale(1, 1, 1);
        opacity.opacity = animate ? 0 : 255;
        numberOpacity.opacity = 255;
        releaseCompletedPatternPreviewTree(preview);
        for (const old of [...preview.children]) { old.removeFromParent(); old.destroy(); }
        preview.active = cell.completed;
        const showCompleted = () => {
            child(slot, 'CompletedBackground').active = cell.completed;
            child(slot, 'PendingBackground').active = !cell.completed;
            number.node.active = !cell.completed;
        };
        showCompleted();
        if (animate) {
            child(slot, 'CompletedBackground').active = false;
            child(slot, 'PendingBackground').active = true;
            number.node.active = true;
        }
        number.string = `${cell.level}`;
        status.node.active = cell.completed;
        status.string = cell.completed ? '加载中' : '';
        if (!cell.completed) return;
        runtime.loadLevelData(getPhysicalMainLevelId(cell.level), (data: { correctColorArr?: number[][] } | null) => {
            if (!slot.isValid || !preview.isValid || (slot as any).__homeChapterToken !== token) return;
            const gridData = data?.correctColorArr;
            if (!Array.isArray(gridData) || !gridData.some(row => row.some(value => value > 0))) {
                status.string = '加载失败';
                console.error(`[home-chapter] Level ${cell.level} preview unavailable`);
                if (animate) { showCompleted(); opacity.opacity = 255; settled(); }
                return;
            }
            status.node.active = false;
            const size = preview.getComponent(UITransform)!;
            renderCompletedPatternPreview(preview, gridData, {
                name: 'CompletedPreview', maxW: size.width, maxH: size.height,
                padding: 4, cropToContent: true,
            }, runtime, animate ? success => {
                if (!wanted()) return;
                if (!success) { showCompleted(); opacity.opacity = 255; settled(); return; }
                reveals.push(() => {
                    if (!wanted()) return;
                    tween(numberOpacity).delay(delay).to(0.12, { opacity: 0 }).start();
                    tween(slot).delay(delay + 0.12)
                        .to(0.14, { scale: new Vec3(0.04, 1, 1) })
                        .call(() => { if (wanted()) showCompleted(); })
                        .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
                        .call(() => {
                            if (!wanted()) return;
                            preview.setScale(0.82, 0.82, 1);
                            opacity.opacity = 255;
                            tween(preview).to(0.24, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
                        }).start();
                });
                settled();
            } : undefined);
        }, 'level_');
    });
}
