const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
class Sprite {}
class Label {}
function node(name, component, children = []) {
    const result = { name, children, active: true, layer: 1, position: { x: 7, y: -45, z: 0 },
        getChildByName(name) { return this.children.find(child => child.name === name); },
        getComponent(type) { return component instanceof type ? component : null; },
        setPosition(x, y, z) { this.position = { x, y, z }; },
        addChild(child) { this.children.push(child); },
    };
    if (component) component.node = result;
    return result;
}
function row(name) {
    return node(name, null, [
        node('RowBg', Object.assign(new Sprite(), { spriteFrame: {} })),
        node('BadgeLbl', new Label()), node('RankMedal', new Sprite()),
        node('Avatar'), node('Name', new Label()), node('Progress', new Label()),
    ]);
}
const fourth = row('Leaderboard3Row');
fourth.getChildByName('Name').getComponent(Label).string = '第四名';
const parent = node('LeaderboardContent', null, [fourth]);
let cloneCount = 0;
const shared = { Sprite, Label, Layers: { Enum: { UI_2D: 1 } },
    instantiate(source) {
        assert.strictEqual(source, fourth, 'extra rows must clone the existing fourth row');
        cloneCount++;
        const copy = row(source.name);
        copy.getChildByName('Avatar').inheritedAvatar = 'fourth-user';
        return copy;
    },
};
const moduleRef = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../assets/Scripts/Core/GameCtrlModules/FriendRankModule.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module: moduleRef, exports: moduleRef.exports,
    require(id) {
        if (id === '../GameCtrlShared') return shared;
        if (['../DebugPerfTrace', '../RuntimeLog'].includes(id)) return {};
        throw new Error(id);
    }, console,
});
const runtime = { getLeaderboardMedalTexture: () => '',
    loadAvatarToNode(url, avatar) { avatar.inheritedAvatar = null; avatar.url = url; },
};
moduleRef.exports.installFriendRankModule(runtime);
runtime.renderLeaderboardRow(parent, 'Leaderboard4', { rank: 5, displayName: '第五名', progressLevel: 12, avatarUrl: '' }, -200, 4);
const fifth = parent.getChildByName('Leaderboard4Row');
assert.strictEqual(cloneCount, 1);
assert.strictEqual(fourth.active, true, 'clone source must remain visible');
assert.strictEqual(fourth.getChildByName('Name').getComponent(Label).string, '第四名');
assert.strictEqual(fifth.getChildByName('Name').getComponent(Label).string, '第五名');
assert.strictEqual(fifth.getChildByName('BadgeLbl').getComponent(Label).string, '5');
assert.strictEqual(fifth.getChildByName('Progress').getComponent(Label).string, '第12关');
assert.strictEqual(fifth.getChildByName('Avatar').inheritedAvatar, null);
assert.strictEqual(fifth.position.x, 7);
assert.strictEqual(fifth.position.y, -200);
runtime.renderLeaderboardRow(parent, 'Leaderboard4', { rank: 5, displayName: '更新用户', progressLevel: 13, avatarUrl: 'new' }, -210, 4);
assert.strictEqual(cloneCount, 1, 'subsequent refresh must reuse the existing fifth row');
assert.strictEqual(fifth.getChildByName('Avatar').url, 'new');
console.log('leaderboard-row-clone.test.js passed');
