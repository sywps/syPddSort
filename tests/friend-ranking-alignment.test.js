const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'openDataContext/index.js'), 'utf8');
const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/GameAssetsBundle/UI/Prefabs/Panels/LeaderboardPanel.prefab'), 'utf8'));
const child = (node, name) => node._children.map(ref => prefab[ref.__id__]).find(node => node._name === name);
const component = (node, type) => node._components.map(ref => prefab[ref.__id__]).find(item => item.__type__ === type);
const draws = [];
const ctx = {
    drawImage: (...args) => draws.push({ image: args }),
    measureText: text => ({ width: text.length * 26 }),
    fillText(text, x, y) { draws.push({ text, x, y, font: this.font, align: this.textAlign, color: this.fillStyle }); },
};
const art = { row: {}, rank1: {}, rank2: {}, rank3: {} };
const sandbox = { ctx, rankingArt: art, COLORS: { text: '#4B3F47' }, ROW_BOX_HEIGHT: 112, AVATAR_RADIUS: 28,
    getDisplayName: entry => entry.displayName,
    drawAvatarCircle: (...args) => draws.push({ avatar: args }),
};
vm.runInNewContext(source.slice(source.indexOf('const ROW_TEXT_Y'), source.indexOf('function drawEmpty(')), sandbox);
for (let i = 0; i < 6; i++) {
    const row = prefab.find(node => node.__type__ === 'cc.Node' && node._name === `Leaderboard${Math.min(i, 3)}Row`);
    draws.length = 0;
    sandbox.drawRow({ rank: i + 1, displayName: '测试玩家', progressLevel: 23, avatarUrl: '' }, 4 + i * 116, i);
    const centerY = 60 + i * 116;
    const name = child(row, 'Name');
    const progress = child(row, 'Progress');
    const nameDraw = draws.find(item => item.text === '测试玩家');
    const progressDraw = draws.find(item => item.text === '第23关');
    assert.ok(Math.abs(nameDraw.x - (298 + name._lpos.x - 110)) < 0.00001);
    assert.strictEqual(nameDraw.y, centerY - name._lpos.y);
    assert.strictEqual(progressDraw.x, 298 + progress._lpos.x);
    assert.strictEqual(progressDraw.y, centerY - progress._lpos.y);
    assert.strictEqual(progressDraw.align, 'center');
    const avatar = child(row, 'Avatar');
    assert.strictEqual(draws.find(item => item.avatar).avatar[1], 298 + avatar._lpos.x);
    if (i < 3) {
        const medal = child(row, 'RankMedal');
        const draw = draws.find(item => item.image?.[0] === art[`rank${i + 1}`]).image;
        assert.ok(Math.abs(draw[1] - (298 + medal._lpos.x - 36)) < 0.00001);
        assert.strictEqual(draw[2], centerY - medal._lpos.y - 30);
    } else {
        const badge = child(row, 'BadgeLbl');
        const draw = draws.find(item => item.text === String(i + 1));
        assert.ok(Math.abs(draw.x - (298 + badge._lpos.x)) < 0.00001);
        assert.strictEqual(draw.color, '#6B6D7A');
    }
}
draws.length = 0;
sandbox.drawRow({ rank: 4, displayName: '非常非常长的昵称不会被截断而是缩小显示', progressLevel: 1000000 }, 4, 3);
assert.ok(draws.some(item => item.text === '非常非常长的昵称不会被截断而是缩小显示'));
assert.ok(parseFloat(draws.find(item => item.text?.startsWith('非常')).font.split(' ')[1]) < 26);
const viewport = prefab.find(node => node.__type__ === 'cc.Node' && node._name === 'LeaderboardViewport');
assert.strictEqual(component(viewport, 'cc.UITransform')._contentSize.height, 580);
assert.strictEqual(viewport._lpos.y, -4.933);
const hostSource = fs.readFileSync(path.join(root, 'assets/Scripts/Core/GameCtrlModules/FriendRankModule.ts'), 'utf8');
assert.ok(hostSource.includes('host.setPosition(0, -4.933);'));
assert.ok(hostSource.includes('const hostHeight = 580;'));
const maxScrollExpression = source.match(/const maxScroll = (Math.max\(0, \(LIST_TOP[^;]+);/)[1];
for (const count of [0, 1, 4, 5, 6, 100]) {
    const actual = vm.runInNewContext(maxScrollExpression, { LIST_TOP: 4, LIST_BOTTOM: 4, ROW_HEIGHT: 116, CANVAS_HEIGHT: 580, allSortedEntries: Array(count) });
    assert.ok(Math.abs(actual * 116 - Math.max(0, 8 + count * 116 - 580)) < 0.00001);
}
console.log('friend-ranking-alignment.test.js passed');
