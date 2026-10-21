import { instantiate, Node, Sprite, sp, UITransform } from 'cc';

/** Scene-owned assets are ready with Game.scene, before the first guide can speak. */
export function createGuideCorgiBubble(runtime: any, parent: Node, width: number, height: number): Node {
    const source = runtime.requireCanvasUiRoot('OverlayRoot').getChildByName('TutorialGuideCorgiBubble') as Node | null;
    const sourceCharacter = source?.getChildByName('Character');
    const sourcePaw = source?.getChildByName('RestingPaw');
    if (!source?.getComponent(UITransform)
        || !sourceCharacter?.getComponent(sp.Skeleton)?.skeletonData
        || !source?.getChildByName('Frame')?.getComponent(Sprite)?.spriteFrame
        || !sourcePaw?.getComponent(Sprite)?.spriteFrame) {
        throw new Error('[guide] Game.scene is missing the complete TutorialGuideCorgiBubble template');
    }
    const bubble = instantiate(source);
    bubble.name = 'OpeningGuideBubbleBackground';
    parent.addChild(bubble);
    bubble.getComponent(UITransform)!.setContentSize(width, height);
    const frame = bubble.getChildByName('Frame')!;
    frame.getComponent(UITransform)!.setContentSize(width, height);
    const sourceSize = source.getComponent(UITransform)!;
    const baseScale = Math.min(width / sourceSize.width, 0.72);
    const scale = baseScale * 1.15 * 1.05;
    const pawOffsetX = sourcePaw.position.x + sourceSize.width / 2;
    const pawOffsetY = sourcePaw.position.y - sourceSize.height / 2;
    const character = bubble.getChildByName('Character')!;
    // Enlarge around the resting paw so its contact point on the frame stays fixed.
    character.setPosition(-width / 2 + pawOffsetX * (baseScale - scale),
        height / 2 + pawOffsetY * (baseScale - scale), 0);
    character.setScale(scale, scale, 1);
    const paw = bubble.getChildByName('RestingPaw')!;
    paw.setPosition(-width / 2 + pawOffsetX * baseScale,
        height / 2 + pawOffsetY * baseScale, 0);
    paw.setScale(scale, scale, 1);
    bubble.active = true;
    const skeleton = character.getComponent(sp.Skeleton)!;
    if (!skeleton.findAnimation('qicr')) {
        bubble.destroy();
        throw new Error('[guide] corgi Spine is missing animation qicr');
    }
    skeleton.setAnimation(0, 'qicr', true);
    return bubble;
}
