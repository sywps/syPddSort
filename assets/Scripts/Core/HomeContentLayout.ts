import { _decorator, Component, UITransform } from 'cc';

@_decorator.ccclass('HomeContentLayout')
export class HomeContentLayout extends Component {
    private layoutSize = '';
    private actionBaseY: number | undefined;

    lateUpdate() {
        const area = this.node;
        const size = area?.getComponent(UITransform);
        const content = area?.getChildByName('HomeContentGroup');
        const contentSize = content?.getComponent(UITransform);
        const action = content?.getChildByName('ActionArea');
        if (!size || !content || !contentSize || !action) return;
        const key = `${size.width}:${size.height}`;
        if (this.layoutSize === key) return;
        this.layoutSize = key;
        this.actionBaseY ??= action.position.y;
        // Compress only the panel/action gap first, then fit the complete group.
        const gapReduction = Math.min(16, Math.max(0, contentSize.height - size.height));
        action.setPosition(action.position.x, this.actionBaseY + gapReduction, 0);
        const scale = Math.min(1, size.width / contentSize.width,
            size.height / (contentSize.height - gapReduction));
        content.setScale(scale, scale, 1);
    }

}
