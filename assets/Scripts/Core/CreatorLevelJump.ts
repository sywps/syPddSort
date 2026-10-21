import { Color, EditBox, Graphics, Label, Node, UITransform } from 'cc';
import { getCreatorWebConfig } from './CreatorWeb';

function node(parent: Node, name: string, width: number, height: number, x = 0, y = 0): Node {
    const result = new Node(name);
    result.layer = parent.layer;
    result.setParent(parent);
    result.setPosition(x, y);
    result.addComponent(UITransform).setContentSize(width, height);
    return result;
}

function text(parent: Node, name: string, value: string, width: number, height: number, x = 0, y = 0): Label {
    const label = node(parent, name, width, height, x, y).addComponent(Label);
    label.string = value;
    label.fontSize = 25;
    label.lineHeight = 30;
    label.color = new Color(88, 63, 45);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    return label;
}

function background(target: Node, width: number, height: number, color: Color): void {
    const graphics = target.addComponent(Graphics);
    graphics.fillColor = new Color(188, 143, 91);
    graphics.roundRect(-width / 2, -height / 2, width, height, 12);
    graphics.fill();
    graphics.fillColor = color;
    graphics.roundRect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6, 9);
    graphics.fill();
}

/** Only the creator build adds this row; the shared scene and Start button stay authored. */
export function drawCreatorLevelJump(parent: Node, start: Node, level: number, onSelect: (level: number) => void): (() => number | null) | undefined {
    const config = getCreatorWebConfig();
    if (!config) return;
    let row = parent.getChildByName('CreatorLevelJump');
    if (!row) {
        row = node(parent, 'CreatorLevelJump', 450, 90, start.position.x, start.position.y - 110);
        text(row, 'Caption', '跳到第', 100, 54, -80);
        const input = node(row, 'LevelInput', 100, 54, 25);
        // Assign labels before EditBox.onLoad; otherwise it creates default labels as well.
        input.active = false;
        background(input, 100, 54, new Color(255, 255, 255));
        const edit = input.addComponent(EditBox);
        edit.textLabel = text(input, 'Text', '', 90, 50);
        edit.placeholderLabel = text(input, 'Placeholder', '关卡号', 90, 50);
        edit.textLabel.node.getComponent(UITransform)!.setAnchorPoint(0, 1);
        edit.placeholderLabel.node.getComponent(UITransform)!.setAnchorPoint(0, 1);
        edit.inputMode = EditBox.InputMode.NUMERIC;
        edit.maxLength = 6;
        // EditBox initially uses multiline/top alignment; restore the numeric field's style
        // after assigning its mode, and keep a fixed label box instead of auto-sizing text.
        for (const label of [edit.textLabel, edit.placeholderLabel]) {
            label.overflow = Label.Overflow.CLAMP;
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
        }
        edit.textLabel.color = new Color(0, 0, 0);
        edit.textLabel.isBold = true;
        input.active = true;
        text(row, 'Unit', '关', 45, 54, 107.5);
        const status = text(row, 'Status', '', 510, 30, 0, -43);
        status.fontSize = 19;
        status.lineHeight = 24;
        // Reserve the new bottom row in the existing responsive group.
        const group = parent.parent?.parent;
        if (group?.name === 'HomeContentGroup') {
            const size = group.getComponent(UITransform)!;
            size.setContentSize(size.width, size.height + 110);
            for (const child of group.children) child.setPosition(child.position.x, child.position.y + 55, child.position.z);
        }
    }
    const edit = row.getChildByName('LevelInput')!.getComponent(EditBox)!;
    const status = row.getChildByName('Status')!.getComponent(Label)!;
    edit.string = String(level);
    const rangeText = `可选 ${config.mainLevels[0]}—${config.mainLevels[config.mainLevels.length - 1]} 关，点击上方开始`;
    status.string = rangeText;
    const select = (): number | null => {
        const value = edit.string.trim();
        const selected = Number(value);
        if (!/^\d+$/.test(value) || !config.mainLevels.includes(selected)) {
            status.string = '请输入此版本包含的有效关卡号';
            return null;
        }
        try {
            onSelect(selected);
            status.string = rangeText;
            return selected;
        }
        catch (error) {
            status.string = error instanceof Error ? error.message : String(error);
            console.error('[creator-web] level jump failed', error);
            return null;
        }
    };
    edit.node.off(EditBox.EventType.TEXT_CHANGED);
    edit.node.on(EditBox.EventType.TEXT_CHANGED, select);
    return select;
}
