const fs = require('fs'), ts = require('typescript'), assert = require('node:assert/strict');
const source = fs.readFileSync('assets/Scripts/Core/GameCtrlModules/PvpModeModule.ts', 'utf8');
const ast = ts.createSourceFile('pvp.ts', source, ts.ScriptTarget.Latest, true);
const helper = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === 'adaptPvpScreenOverlay');
const js = ts.transpileModule(helper.getText(ast) + '\nexports.adapt = adaptPvpScreenOverlay;', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
class UITransform { contentSize = { width: 720, height: 1280 }; }
class Graphics { clear() {} rect(...args) { this.rectArgs = args; } fill() {} moveTo() {} lineTo() {} close() {} }
class Color {}
class Widget {
    static AlignMode = { ALWAYS: 2 };
    updateAlignment() {
        if (this.isAlignTop && this.isAlignBottom) {
            this.node.getComponent(UITransform).contentSize = { ...(this.target || this.node.parent).getComponent(UITransform).contentSize };
            this.node.events.get('size')?.();
        } else this.node.position = { x: this.horizontalCenter, y: this.verticalCenter };
    }
}
class Node {
    static EventType = { SIZE_CHANGED: 'size' };
    children = []; components = new Map(); events = new Map();
    constructor(name) { this.name = name; this.addComponent(UITransform); }
    addComponent(T) { const c = new T(); c.node = this; this.components.set(T, c); return c; }
    getComponent(T) { return this.components.get(T); }
    addChild(child) { if (child.parent) child.parent.children = child.parent.children.filter(n => n !== child); child.parent = this; this.children.push(child); }
    on(event, callback) { this.events.set(event, callback); }
    setScale(x, y) { this.scale = { x, y }; }
}
let width, height, safe;
const exports_ = {};
new Function('exports', 'Node', 'UITransform', 'Widget', 'Graphics', 'Color', 'view', 'sys', 'ensureTransform', js)(
    exports_, Node, UITransform, Widget, Graphics, Color,
    { getVisibleSize: () => ({ width, height }) }, { getSafeAreaRect: () => safe },
    (n, w, h) => { n.getComponent(UITransform).contentSize = { width: w, height: h }; });
for (const split of [false, true]) {
    const screen = new Node('OverlayRoot'), lobby = new Node('FixedSizeLobby'), root = new Node('Modal'), button = new Node('Return');
    screen.addChild(lobby); lobby.addChild(root); root.addChild(button); root.addComponent(Graphics);
    width = 720; height = 1280; safe = { x: 0, y: 0, width, height };
    screen.getComponent(UITransform).contentSize = { width, height };
    const content = exports_.adapt(root, split);
    assert.equal(root.getComponent(Widget).target, screen, 'anchor to screen, not fixed-size lobby');
    assert.equal(button.parent, content, 'existing controls retain one common adaptive coordinate space');
    for (const dimensions of [[720, 1280, 0, 0], [720, 1600, 90, 34], [720, 1000, 50, 20], [960, 1280, 40, 20]]) {
        [width, height] = dimensions;
        const [, , top, bottom] = dimensions;
        safe = { x: 0, y: bottom, width, height: height - top - bottom };
        screen.getComponent(UITransform).contentSize = { width, height };
        root.getComponent(Widget).updateAlignment();
        assert.deepEqual(root.getComponent(Graphics).rectArgs, [-width / 2, -height / 2, width, height]);
        assert.equal(content.position.y, (bottom - top) / 2);
        assert.equal(content.scale.x, content.scale.y);
        assert.ok(content.scale.x <= 1, 'large screens keep original artwork scale');
        assert.ok(1120 * content.scale.y <= safe.height - 32 + 1e-8);
        assert.ok(680 * content.scale.x <= safe.width - 32 + 1e-8);
    }
}
assert.equal((source.match(/adaptPvpScreenOverlay\((root|reveal|failed|overlay)(, true)?\)/g) || []).length, 4,
    'matchmaking, opponent reveal, failed submit and result all use the adaptive layout');
console.log('PVP overlay layout passed: full-screen bounds, safe area, small-screen scaling and resize.');
