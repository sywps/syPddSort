import { _decorator, Component, Node, Sprite, UITransform } from 'cc';
import { EDITOR } from 'cc/env';
const { ccclass, property, executeInEditMode } = _decorator;

/** Prefab-owned presentation settings. No player state or network access. */
@ccclass('ProfilePanelView')
@executeInEditMode
export class ProfilePanelView extends Component {
    @property({ min: 1, step: 1, tooltip: '列表列数' }) columns = 3;
    @property({ tooltip: '格子横向间距' }) gapX = 15;
    @property({ tooltip: '格子纵向间距' }) gapY = 22;
    @property({ tooltip: '列表顶部边距' }) paddingTop = 12.5;
    @property({ tooltip: '列表底部边距' }) paddingBottom = 21.5;
    @property({ tooltip: '头像缩略图尺寸' }) avatarSize = 110;
    @property({ tooltip: '头像框缩略图尺寸' }) frameSize = 148;
    @property({ tooltip: '仅编辑器：切换示例格子为头像框，不修改玩家数据' }) previewFrames = false;
    @property({ tooltip: '错误提示停留秒数' }) statusSeconds = 2.5;
    @property({ tooltip: '飘字停留秒数' }) floatHold = 1;
    @property({ tooltip: '飘字淡出秒数' }) floatFade = 0.8;
    @property({ tooltip: '感叹号最大晃动角度' }) badgeAngle = 12;
    @property({ tooltip: '感叹号晃动时长倍率' }) badgeSpeed = 1;
    @property({ tooltip: '感叹号两次晃动间隔秒数' }) badgePause = 1.3;
    @property({ multiline: true }) clearedFormat = '<b>已通关 <color=#45b72b>{count}</color> 关</b>';
    @property({ multiline: true }) conditionFormat = '<b>累计通过主线<color=#45b72b>{count}</color>关解锁</b>';
    @property({ multiline: true }) activityText = '<b>活动暂未开放</b>';
    @property({ multiline: true }) adProgressFormat = '免费解锁\n（{count}/{total}）';
    @property equipText = '装扮';
    @property adActionFormat = '免费解锁（{count}/{total}）';
    @property goldActionFormat = '×{total}';

    layout(cells: Node[]): void {
        const viewport = this.node.getChildByName('Viewport')!;
        const content = viewport.getChildByName('Content')!;
        const template = content.getChildByName('ItemTemplate')!;
        const size = template.getComponent(UITransform)!.contentSize;
        const viewportSize = viewport.getComponent(UITransform)!.contentSize;
        const columns = Math.max(1, Math.floor(this.columns));
        const rows = Math.ceil(cells.length / columns);
        const height = Math.max(viewportSize.height, this.paddingTop + this.paddingBottom + rows * size.height + Math.max(0, rows - 1) * this.gapY);
        content.getComponent(UITransform)!.setContentSize(viewportSize.width, height);
        content.setPosition(0, (viewportSize.height - height) / 2);
        const left = -(columns - 1) * (size.width + this.gapX) / 2;
        cells.forEach((cell, i) => cell.setPosition(left + i % columns * (size.width + this.gapX), height / 2 - this.paddingTop - size.height / 2 - Math.floor(i / columns) * (size.height + this.gapY)));
    }
    update(): void {
        if (!EDITOR) return;
        const content = this.node.getChildByName('Viewport')?.getChildByName('Content');
        if (content?.getChildByName('ItemTemplate')) {
            const cells = content.children.filter(n => n.name.startsWith('PreviewItem') && n.active);
            this.layout(cells);
            const sprite = this.node.getChildByName(this.previewFrames ? 'Frame' : 'Avatar')?.getComponent(Sprite);
            for (const cell of cells) {
                const icon = cell.getChildByName('Icon')!;
                icon.getComponent(Sprite)!.spriteFrame = sprite?.spriteFrame || null;
                const side = this.previewFrames ? this.frameSize : this.avatarSize;
                icon.getComponent(UITransform)!.setContentSize(side, side);
            }
        }
    }
}
