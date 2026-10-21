import { Button, Color, Label, Node } from 'cc';
import { openCollectionShellOverlay } from './Panels/CollectionShellOverlay';
import { getPhysicalMainLevelId } from './LevelRouteService';
import { renderCompletedPatternPreview, releaseCompletedPatternPreviewTree } from './CompletedPatternPreview';

import { AudioMgr } from './AudioMgr';

export function openHomeArtworkPreview(runtime: any, levels: number[], selectedLevel: number): void {
    let index = levels.indexOf(selectedLevel);
    if (index < 0) return;
    openCollectionShellOverlay(runtime, {
        overlayName: 'HomeArtworkPreview', hidePager: false,
        onError: () => runtime.showToast?.('作品预览加载失败，请重试'),
        onReady: ({ overlay, box, content, leftArrow, rightArrow }) => {
            let token = 0;
            const draw = () => {
                const request = ++token;
                releaseCompletedPatternPreviewTree(content);
                for (const child of [...content.children]) { child.removeFromParent(); child.destroy(); }
                leftArrow!.active = index > 0;
                rightArrow!.active = index < levels.length - 1;
                const statusNode = new Node('LoadingStatus');
                statusNode.layer = content.layer;
                content.addChild(statusNode);
                const status = statusNode.addComponent(Label);
                status.fontSize = 24;
                status.color = new Color(112, 72, 38, 255);
                status.string = '';
                runtime.loadLevelData(getPhysicalMainLevelId(levels[index]), (data: { correctColorArr?: number[][] } | null) => {
                    if (!overlay.isValid || !overlay.active || request !== token || !statusNode.isValid) return;
                    const grid = data?.correctColorArr;
                    if (!Array.isArray(grid) || !grid.some(row => row.some(value => value > 0))) {
                        status.string = '图案加载失败';
                        console.error('[home-artwork-preview] Missing level data', levels[index]);
                        return;
                    }
                    statusNode.destroy();
                    renderCompletedPatternPreview(content, grid, {
                        name: 'Artwork', maxW: 540, maxH: 540, padding: 12, cropToContent: true, hideLoadingStatus: true,
                    }, runtime);
                }, 'level_');
            };
            for (const arrow of [leftArrow!, rightArrow!]) {
                if (!arrow.getComponent(Button)) throw new Error(`[artwork-preview] missing authored Button on ${arrow.name}`);
                arrow.targetOff(runtime);
            }
            leftArrow!.on(Button.EventType.CLICK, () => { if (index > 0) { AudioMgr.inst.play('button'); index--; draw(); } }, runtime);
            rightArrow!.on(Button.EventType.CLICK, () => { if (index < levels.length - 1) { AudioMgr.inst.play('button'); index++; draw(); } }, runtime);
            draw();
        },
    });
}
