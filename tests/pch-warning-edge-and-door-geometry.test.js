const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/Scripts/Core/PchConveyorGameplayController.ts'), 'utf8');
assert.ok(source.includes('sprite.spriteFrame = this.runtime.requireWarningMaskSpriteFrame();'));
assert.ok(!source.includes('drawWarningOverlayEdges'), 'warning must use the original texture, not procedural borders');
const { PNG } = require('pngjs');
const mask = PNG.sync.read(fs.readFileSync(path.join(root, 'assets/BootstrapBundle/GameUI/Atlases/BoardEffects/pdpx_eff_Mask_01.png')));
assert.equal(mask.width, 512);
assert.equal(mask.height, 512);
let edgeVisible = false;
for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    const alpha = mask.data[(y * mask.width + x) * 4 + 3];
    if (x >= 80 && x < mask.width - 80 && y >= 80 && y < mask.height - 80) {
        assert.equal(alpha, 0, 'original resource interior must not tint gameplay');
    } else if (alpha > 0) edgeVisible = true;
}
assert.ok(edgeVisible, 'edge warning must remain visible');
const scene = JSON.parse(fs.readFileSync(path.join(root, 'assets/BootstrapBundle/Scenes/Game.scene'), 'utf8'));
for (const [side, anchor, closedLeft, closedRight] of [['l', 0, -36.532, -1.532], ['r', 1, -1.927, 33.073]]) {
    const ui = scene.find(o => o._id === `ConveyorV2_RainbowConveyorNormalEntry_scene_20260826_pieces_${side}_ui`);
    const node = scene[ui.node.__id__];
    assert.equal(ui._anchorPoint.x, anchor);
    const bounds = width => [node._lpos.x - anchor * width, node._lpos.x + (1 - anchor) * width];
    assert.ok(Math.abs(bounds(35)[0] - closedLeft) < 1e-6);
    assert.ok(Math.abs(bounds(35)[1] - closedRight) < 1e-6);
    assert.equal(bounds(0)[anchor], bounds(35)[anchor], 'outer edge must stay fixed while opening');
}
console.log('pch-warning-edge-and-door-geometry: PASS');
