const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
const prefab = JSON.parse(read('assets/GameAssetsBundle/UI/Prefabs/Panels/LeaderboardPanel.prefab'));

function validatePrefabRefs(value, location = 'prefab') {
    if (!value || typeof value !== 'object') return;
    if (Number.isInteger(value.__id__)) {
        assert.ok(value.__id__ >= 0 && value.__id__ < prefab.length, `${location} has invalid __id__ ${value.__id__}`);
    }
    for (const [key, childValue] of Object.entries(value)) {
        validatePrefabRefs(childValue, `${location}.${key}`);
    }
}

validatePrefabRefs(prefab);

const reachablePrefabRecords = new Set();
function visitPrefabRecord(index) {
    if (!Number.isInteger(index) || reachablePrefabRecords.has(index)) return;
    reachablePrefabRecords.add(index);
    const visitRefs = (value) => {
        if (!value || typeof value !== 'object') return;
        if (Number.isInteger(value.__id__)) visitPrefabRecord(value.__id__);
        for (const childValue of Object.values(value)) visitRefs(childValue);
    };
    visitRefs(prefab[index]);
}
visitPrefabRecord(0);
assert.strictEqual(reachablePrefabRecords.size, prefab.length, 'prefab must not retain unreachable serialized records');

function byId(ref) {
    return ref && Number.isInteger(ref.__id__) ? prefab[ref.__id__] : null;
}

function child(parent, name) {
    return (parent?._children || []).map(byId).find((node) => node?._name === name) || null;
}

function component(node, type) {
    return (node?._components || []).map(byId).find((entry) => entry?.__type__ === type) || null;
}

function size(node) {
    return component(node, 'cc.UITransform')?._contentSize;
}

function spriteUuid(node) {
    return component(node, 'cc.Sprite')?._spriteFrame?.__uuid__ || '';
}

function labelString(node) {
    return component(node, 'cc.Label')?._string ?? null;
}

function rgba(color) {
    return [color?.r, color?.g, color?.b, color?.a];
}

function assertLabelStyle(node, expected, message) {
    const label = component(node, 'cc.Label');
    assert.ok(label, `${message} must own a Label`);
    assert.strictEqual(label._fontSize, expected.fontSize, `${message} font size`);
    assert.strictEqual(label._actualFontSize, expected.fontSize, `${message} actual font size`);
    assert.strictEqual(label._lineHeight, expected.lineHeight, `${message} line height`);
    assert.strictEqual(label._isBold, expected.bold, `${message} bold`);
    assert.deepStrictEqual(rgba(label._color), expected.color, `${message} color`);
    if (expected.outline !== undefined) {
        assert.strictEqual(label._enableOutline, expected.outline, `${message} outline enabled`);
    }
    if (expected.outlineColor) {
        assert.deepStrictEqual(rgba(label._outlineColor), expected.outlineColor, `${message} outline color`);
    }
    if (expected.outlineWidth !== undefined) {
        assert.strictEqual(label._outlineWidth, expected.outlineWidth, `${message} outline width`);
    }
    if (expected.shadow !== undefined) {
        assert.strictEqual(label._enableShadow, expected.shadow, `${message} shadow enabled`);
    }
    if (expected.shadowColor) {
        assert.deepStrictEqual(rgba(label._shadowColor), expected.shadowColor, `${message} shadow color`);
    }
    if (expected.shadowOffset) {
        assert.deepStrictEqual([label._shadowOffset?.x, label._shadowOffset?.y], expected.shadowOffset, `${message} shadow offset`);
    }
    if (expected.shadowBlur !== undefined) {
        assert.strictEqual(label._shadowBlur, expected.shadowBlur, `${message} shadow blur`);
    }
}

function readPngSize(relativePath) {
    const data = fs.readFileSync(path.join(root, relativePath));
    assert.strictEqual(data.toString('ascii', 1, 4), 'PNG', `${relativePath} must be PNG`);
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

const rootNode = prefab.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'LeaderboardPanel');
const box = child(rootNode, 'Box');
const title = child(box, 'PopupTitleBadge');
const tabs = child(box, 'LeaderboardTabs');
const list = child(box, 'LeaderboardList');
const selfBox = child(box, 'LeaderboardSelfBox');
const viewport = child(list, 'LeaderboardViewport');
const content = child(viewport, 'LeaderboardContent');
const row = child(content, 'Leaderboard3Row');

assert.ok(box && title && tabs && list && selfBox && viewport && content && row, 'leaderboard prefab hierarchy must remain intact');
assert.strictEqual(content._children.length, 4, 'content must own four rows, with fourth used for cloning');
assert.strictEqual(child(content, 'LeaderboardRowTemplate'), null, 'separate hidden template must be removed');
assert.deepStrictEqual(size(title), { __type__: 'cc.Size', width: 420, height: 137 }, 'title must preserve v2 plaque aspect ratio');
assert.strictEqual(title._lpos.y, 517.769, 'title must keep the current approved vertical position');
assert.strictEqual(spriteUuid(title), '65a3249d-d89e-4a90-8e45-779dad3a8d9c@f9941', 'title must use compressed v2 art');
assertLabelStyle(child(title, 'PopupTitleLabel'), {
    fontSize: 48,
    lineHeight: 58,
    bold: true,
    color: [255, 255, 255, 255],
    outline: true,
    outlineColor: [44, 91, 184, 255],
    outlineWidth: 4,
    shadow: true,
    shadowColor: [30, 61, 145, 190],
    shadowOffset: [0, -3],
    shadowBlur: 2,
}, 'leaderboard title');
assert.strictEqual(tabs._lpos.y, 379.733, 'tabs must keep the current approved vertical position');
const tabStyles = [
    ['PopupTabGlobalBg', 'PopupTabGlobalLbl', '全国排名', true, 65],
    ['PopupTabFriendBg', 'PopupTabFriendLbl', '好友排名', false, 65],
    ['PopupTabGlobalInactiveBg', 'PopupTabGlobalInactiveLbl', '全国排名', false, 65],
    ['PopupTabFriendActiveBg', 'PopupTabFriendActiveLbl', '好友排名', true, 65],
];
for (const [backgroundName, labelName, copy, active, height] of tabStyles) {
    const tabBackground = child(tabs, backgroundName);
    const tabLabel = child(tabBackground, labelName);
    assert.deepStrictEqual(size(tabBackground), { __type__: 'cc.Size', width: 212, height }, `${backgroundName} size`);
    assert.strictEqual(
        spriteUuid(tabBackground),
        active ? 'b7ee0a15-dbd0-4adb-a875-af4d72fff454@f9941' : 'b3a5a27b-7151-452d-b1c4-17fcf5d5f9b6@f9941',
        `${backgroundName} art`,
    );
    assert.strictEqual(labelString(tabLabel), copy, `${labelName} copy`);
    assertLabelStyle(tabLabel, {
        fontSize: 26,
        lineHeight: 34,
        bold: true,
        color: active ? [255, 255, 255, 255] : [103, 107, 130, 255],
        outline: active,
        outlineColor: active ? [67, 94, 183, 255] : undefined,
        outlineWidth: 2,
    }, labelName);
}
assert.strictEqual(component(tabs, 'cc.Sprite'), null, 'tab wrapper must not retain an empty Sprite component');
assert.deepStrictEqual(size(list), { __type__: 'cc.Size', width: 596, height: 480 }, 'list host must match open-data canvas');
const statusTitle = child(list, 'LeaderboardStatusTitle');
assert.ok(statusTitle, 'prefab must own the loading status title');
assert.strictEqual(statusTitle._active, false, 'loading status title must be hidden in the editor preview');
assert.strictEqual(statusTitle._lpos.y, 74, 'loading status title position');
assert.deepStrictEqual(size(statusTitle), { __type__: 'cc.Size', width: 420, height: 44 }, 'loading status title size');
assert.strictEqual(labelString(statusTitle), '加载中...', 'loading copy must remain prefab-owned');
assertLabelStyle(statusTitle, { fontSize: 28, lineHeight: 40, bold: true, color: [75, 63, 71, 255] }, 'loading status title');
assert.strictEqual(viewport._active, true, 'prefab viewport must show the four example rows in the editor');
assert.deepStrictEqual(size(viewport), { __type__: 'cc.Size', width: 596, height: 580 }, 'main viewport must preserve the current approved editor layout');
assert.deepStrictEqual(size(row), { __type__: 'cc.Size', width: 560, height: 90 }, 'clone source must preserve fourth row size');
assert.strictEqual(spriteUuid(child(row, 'RowBg')), 'a6a6af75-24fc-47a2-8e25-42633560737c@f9941', 'row must use compressed v2 art');
const templateMedal = child(row, 'RankMedal');
assert.ok(templateMedal, 'row template must own its medal slot');
assert.strictEqual(templateMedal._active, false, 'template medal must stay hidden');
assert.deepStrictEqual(size(templateMedal), { __type__: 'cc.Size', width: 72, height: 60 }, 'template medal size must be prefab-owned');
assertLabelStyle(child(row, 'BadgeLbl'), { fontSize: 28, lineHeight: 34, bold: true, color: [107, 109, 122, 255] }, 'template rank');
assertLabelStyle(child(row, 'Name'), { fontSize: 26, lineHeight: 34, bold: true, color: [75, 63, 71, 255] }, 'template name');
assertLabelStyle(child(row, 'Progress'), { fontSize: 24, lineHeight: 34, bold: true, color: [75, 63, 71, 255] }, 'template progress');

const rowSamples = [
    { name: '玩家小美', level: '第25关', y: 210.945, medal: '493ab60f-2e63-405d-b6aa-681e46c76350@f9941' },
    { name: '快乐豆豆', level: '第20关', y: 126.14, medal: '19440a0a-7697-4101-a13e-bcf26910867a@f9941' },
    { name: '拼图达人', level: '第18关', y: 40.194, medal: '7e1ea4f5-87cd-4666-a445-3ced259c8690@f9941' },
    { name: '游客1234', level: '第15关', y: -45.318, medal: '' },
];
for (const [index, sample] of rowSamples.entries()) {
    const prefabRow = child(content, `Leaderboard${index}Row`);
    assert.ok(prefabRow, `rank ${index + 1} row must be preplaced in prefab`);
    assert.strictEqual(prefabRow._active, true, `rank ${index + 1} example row must be visible in prefab`);
    assert.strictEqual(prefabRow._lpos.y, sample.y, `rank ${index + 1} row position must match runtime layout`);
    assert.deepStrictEqual(size(prefabRow), { __type__: 'cc.Size', width: 560, height: 90 }, `rank ${index + 1} row size`);
    for (const nodeName of ['RowBg', 'RankMedal', 'BadgeLbl', 'Avatar', 'Name', 'Progress']) {
        assert.ok(child(prefabRow, nodeName), `rank ${index + 1} row must own ${nodeName}`);
    }
    assert.strictEqual(labelString(child(prefabRow, 'Name')), sample.name, `rank ${index + 1} example name`);
    assert.strictEqual(labelString(child(prefabRow, 'Progress')), sample.level, `rank ${index + 1} example progress`);
    assertLabelStyle(child(prefabRow, 'BadgeLbl'), { fontSize: 28, lineHeight: 34, bold: true, color: [107, 109, 122, 255] }, `rank ${index + 1} numeric rank`);
    assertLabelStyle(child(prefabRow, 'Name'), { fontSize: 26, lineHeight: 34, bold: true, color: [75, 63, 71, 255] }, `rank ${index + 1} name`);
    assertLabelStyle(child(prefabRow, 'Progress'), { fontSize: 24, lineHeight: 34, bold: true, color: [75, 63, 71, 255] }, `rank ${index + 1} progress`);
    const medal = child(prefabRow, 'RankMedal');
    assert.strictEqual(medal._active, index < 3, `rank ${index + 1} medal visibility`);
    if (sample.medal) assert.strictEqual(spriteUuid(medal), sample.medal, `rank ${index + 1} medal art`);
    assert.strictEqual(child(prefabRow, 'BadgeLbl')._active, index === 3, `rank ${index + 1} numeric badge visibility`);
}

assert.deepStrictEqual(size(selfBox), { __type__: 'cc.Size', width: 596, height: 164 }, 'self panel must preserve v2 art aspect ratio');
assert.strictEqual(spriteUuid(selfBox), '428c6d93-8219-4da8-bd8a-921346759c40@f9941', 'self panel must use compressed v2 art');
assert.strictEqual(child(selfBox, 'LeaderboardSelfTitleLabel'), null, 'baked-in self title must not retain a duplicate Label node');
for (const nodeName of ['LeaderboardSelfBadgeLbl', 'LeaderboardSelfAvatar', 'LeaderboardSelfName', 'LeaderboardSelfProgress']) {
    assert.ok(child(selfBox, nodeName), `self panel must own ${nodeName}`);
}
assert.strictEqual(labelString(child(selfBox, 'LeaderboardSelfBadgeLbl')), '第12名', 'self rank preview copy');
assert.strictEqual(labelString(child(selfBox, 'LeaderboardSelfName')), '我的昵称', 'self name preview copy');
assert.strictEqual(labelString(child(selfBox, 'LeaderboardSelfProgress')), '第12关', 'self progress preview copy');
for (const nodeName of ['LeaderboardSelfBadgeLbl', 'LeaderboardSelfName', 'LeaderboardSelfProgress']) {
    assertLabelStyle(child(selfBox, nodeName), { fontSize: 24, lineHeight: 34, bold: true, color: [75, 63, 71, 255] }, nodeName);
}
for (const removedName of [
    'LeaderboardHeaderBg',
    'LeaderboardHeaderRank',
    'LeaderboardHeaderPlayer',
    'LeaderboardHeaderProgress',
    'OpenDataDebug',
    'HintAnchor',
    'HintBottomAnchor',
    'LeaderboardStatusSub',
    'GlobalLoading',
    'LeaderboardEmpty',
    'LeaderboardEmptySub',
    'FriendRankLoading',
    'FriendRankNoWx',
    'FriendRankEmpty',
    'FriendRankEmptySub',
    'FriendRankError',
    'FriendRankUnsupported',
    'FriendRankUnsupportedSub',
    'OpenDataNotAvailable',
    'AuthHint',
    'AuthHint2',
    'AuthBtn',
    'AuthBtnLabel',
    'GuestAuthBtn',
    'GuestAuthBtnLabel',
    'SkipAuthBtn',
    'SkipAuthLabel',
]) {
    assert.strictEqual(
        prefab.find((entry) => entry?.__type__ === 'cc.Node' && entry._name === removedName),
        undefined,
        `${removedName} must be removed from the prefab`,
    );
}

const expectedImages = new Map([
    ['leaderboard_row_standard', [820, 164]],
    ['leaderboard_tab_active', [424, 116]],
    ['leaderboard_tab_inactive', [424, 116]],
    ['leaderboard_title_plaque', [720, 234]],
    ['medal_bronze_rank_3', [192, 157]],
    ['medal_gold_rank_1', [192, 156]],
    ['medal_silver_rank_2', [192, 155]],
    ['my_ranking_panel', [830, 228]],
]);
const atlasDir = 'assets/GameAssetsBundle/Textures/UI/Atlases/LeaderboardV2';
for (const [name, expectedSize] of expectedImages) {
    const imagePath = `${atlasDir}/${name}.png`;
    assert.deepStrictEqual(readPngSize(imagePath), expectedSize, `${name} compressed dimensions`);
    const metaPath = `${imagePath}.meta`;
    assert.ok(fs.existsSync(path.join(root, metaPath)), `${name} Cocos meta must exist`);
    const meta = JSON.parse(read(metaPath));
    const spriteFrameMeta = Object.values(meta.subMetas || {}).find((entry) => entry?.importer === 'sprite-frame');
    assert.ok(spriteFrameMeta, `${name} sprite-frame meta must exist`);
    assert.deepStrictEqual(
        [spriteFrameMeta.userData.width, spriteFrameMeta.userData.height],
        expectedSize,
        `${name} sprite-frame dimensions`,
    );
    assert.deepStrictEqual(
        [spriteFrameMeta.userData.rawWidth, spriteFrameMeta.userData.rawHeight],
        expectedSize,
        `${name} sprite-frame raw dimensions`,
    );
}

const manifest = read('assets/Scripts/Core/UiManifest.ts');
for (const name of expectedImages.keys()) {
    assert.ok(manifest.includes(`'${name}'`), `${name} must be retained by leaderboard texture owner`);
    assert.ok(
        manifest.includes(`'gameAssets:${name}': 'Textures/UI/Atlases/LeaderboardV2/${name}'`),
        `${name} must have an exact local atlas route`,
    );
}

const shared = read('assets/Scripts/Core/GameCtrlShared.ts');
const friendRank = read('assets/Scripts/Core/GameCtrlModules/FriendRankModule.ts');
const selfRank = read('assets/Scripts/Core/GameCtrlModules/CollectionAvatarModule.ts');
const guideRank = read('assets/Scripts/Core/GameCtrlModules/GuideLeaderboardModule.ts');
const panelController = read('assets/Scripts/Core/Panels/LeaderboardPanelController.ts');
for (const removedName of [
    'LeaderboardHeaderBg',
    'LeaderboardHeaderRank',
    'LeaderboardHeaderPlayer',
    'LeaderboardHeaderProgress',
    'OpenDataDebug',
    'HintAnchor',
    'HintBottomAnchor',
    'LeaderboardStatusSub',
    'GlobalLoading',
    'LeaderboardEmpty',
    'LeaderboardEmptySub',
    'FriendRankLoading',
    'FriendRankNoWx',
    'FriendRankEmpty',
    'FriendRankEmptySub',
    'FriendRankError',
    'FriendRankUnsupported',
    'FriendRankUnsupportedSub',
    'OpenDataNotAvailable',
    'AuthHint',
    'AuthHint2',
    'AuthBtn',
    'GuestAuthBtn',
    'SkipAuthBtn',
]) {
    assert.ok(!friendRank.includes(`'${removedName}'`), `${removedName} must not retain a runtime lookup`);
    assert.ok(!guideRank.includes(`'${removedName}'`), `${removedName} must not retain a guide runtime lookup`);
}
assert.ok(friendRank.includes('function setFriendRankLoadingVisible(listNode: Node, visible: boolean): void'), 'runtime must expose one loading visibility helper');
assert.ok(friendRank.includes("requireFriendRankNode(listNode, 'LeaderboardStatusTitle')"), 'runtime must reuse the prefab-owned loading title');
assert.ok(friendRank.includes('node.active = visible;'), 'runtime must only control loading title visibility');
assert.ok(!friendRank.includes('showLeaderboardStatus'), 'runtime must not expose empty/error status copy to players');
assert.ok(!guideRank.includes('showLeaderboardStatus'), 'unsupported friend ranking must remain silent');
assert.ok(!friendRank.includes("'暂无排行数据'"), 'global empty ranking must remain silent');
assert.ok(!friendRank.includes("'暂无好友排行数据'"), 'friend empty ranking must remain silent');
assert.ok(!friendRank.includes("'全国排行加载失败，请稍后重试'"), 'global loading errors must remain internal');
assert.ok(!friendRank.includes('addAuthButtonForGuest'), 'friend ranking must not retain the Cocos guest authorization button path');
assert.ok(!friendRank.includes('showAuthButton'), 'global ranking must not retain the dead Cocos authorization button path');
assert.ok(!friendRank.includes('clearLeaderboardAuthButtons'), 'ranking switches must not manage removed Cocos authorization buttons');
assert.ok(!guideRank.includes('getLeaderboardHintNode'), 'hint text must no longer switch between top and bottom anchors');
const authorizationCall = guideRank.indexOf('const authorizationRequest = UserMgr.inst.createUserInfoButton(');
const authorizationAwait = guideRank.indexOf('const authorized = await authorizationRequest;', authorizationCall);
assert.ok(authorizationCall >= 0, 'friend tab click must call the WeChat native authorization API directly');
assert.ok(authorizationAwait > authorizationCall, 'native authorization must start before the friend-tab flow awaits it');
assert.ok(guideRank.includes('if (!box.isValid || !this.isLeaderboardTabRequestCurrent(requestToken)) return;'), 'native authorization completion must reject stale tab requests');
assert.ok(guideRank.includes('await this.loadWeChatFriendLeaderboard(box, listNode, selfBox, requestToken);'), 'authorized friend ranking must preserve the request token');
assert.ok(guideRank.includes('await this.loadGlobalLeaderboard(box, listNode, selfBox, requestToken);'), 'cancelled authorization must preserve the existing global fallback with the request token');
assert.ok(guideRank.includes('UserMgr.inst.destroyUserInfoButtons();'), 'tab switches must clean up a pending legacy WeChat native button');
assert.ok(panelController.includes('UserMgr.inst.destroyUserInfoButtons();'), 'closing the leaderboard must clean up a pending legacy WeChat native button');
assert.ok(!panelController.includes("requirePanelChild(box, 'HintAnchor')"), 'panel controller must not require the removed hint node');
assert.ok(shared.includes('const LEADERBOARD_ROW_PITCH = 116;'), 'main/open-data scroll conversion must use v2 row pitch');
assert.ok(friendRank.includes("if (rank === 1) return 'medal_gold_rank_1';"), 'rank 1 must use gold medal art');
assert.ok(friendRank.includes("if (rank === 2) return 'medal_silver_rank_2';"), 'rank 2 must use silver medal art');
assert.ok(friendRank.includes("if (rank === 3) return 'medal_bronze_rank_3';"), 'rank 3 must use bronze medal art');
assert.ok(friendRank.includes("const medalNode = requireFriendRankNode(resolvedRow, 'RankMedal');"), 'runtime must reuse the prefab medal slot');
assert.ok(!friendRank.includes("new Node('RankMedal')"), 'runtime must not create medal nodes');
assert.ok(friendRank.includes('const resolvedRow = existingRow || instantiate(rowTemplate);'), 'runtime must reuse preplaced rows before cloning the template');
assert.ok(friendRank.includes('viewport.active = false;'), 'runtime reset must hide editor examples before loading real data');
assert.ok(friendRank.includes('viewport.active = true;'), 'runtime render must reveal rows after writing real data');
assert.ok(friendRank.includes('badge.node.active = false;'), 'top-three rows must hide duplicate numeric rank labels');
assert.ok(friendRank.includes('badge.node.active = true;'), 'ordinary rows must retain numeric rank labels');
assert.ok(!friendRank.includes("headerBg.active = true;"), 'global list must not restore the removed one-sided header');
assert.ok(!selfRank.includes("requireCollectionAvatarLabel(parent, 'LeaderboardSelfTitleLabel')"), 'runtime must not reactivate the title baked into the new self panel art');
assert.ok(!selfRank.includes('getRankTextColor'), 'runtime must not replace the prefab-owned self rank color');
assert.ok(!selfRank.includes('badgeLabel.color ='), 'runtime must leave the prefab-owned self rank style intact');
assert.ok(selfRank.includes("requireCollectionAvatarNode(parent, 'LeaderboardSelfAvatar')"), 'runtime must reuse the prefab-owned self avatar slot');
assert.ok(!selfRank.includes("new Node('LeaderboardSelfAvatar')"), 'runtime must not create the self avatar slot');
assert.ok(!selfRank.includes('syncCollectionAvatarLabelNode'), 'runtime must not construct self labels dynamically');
assert.ok(friendRank.includes('selfBox.active = false;'), 'global loading must hide prefab example self data');
assert.ok(guideRank.includes('selfBox.active = false;'), 'friend loading and tab switches must hide prefab example self data');
assert.ok(selfRank.includes('parent.active = true;'), 'real self data rendering must reveal the self panel');
assert.ok(friendRank.includes('this.loadAvatarToNode(entry.avatarUrl, avatarNode);'), 'main-domain rows must use prefab-owned avatar sizing');
assert.ok(!selfRank.includes('AvatarFallbackInitial'), 'missing avatars must use artwork instead of nickname initials');

const avatarSlots = prefab.filter((record) => record?.__type__ === 'cc.Node' && ['Avatar', 'LeaderboardSelfAvatar'].includes(record._name));
assert.strictEqual(avatarSlots.length, 5, 'four rows and self must own circular avatars');
for (const slot of avatarSlots) {
    const mask = child(slot, 'AvatarMask');
    assert.strictEqual(component(mask, 'cc.Mask')._type, 1, 'avatars must use an ellipse Mask');
    assert.strictEqual(component(mask, 'cc.Mask')._inverted, false);
    assert.strictEqual(size(mask).width, size(mask).height, 'ellipse must be circular');
    assert.ok(spriteUuid(child(mask, 'AvatarDefault')).startsWith('802f198f-'));
    assert.ok(component(child(mask, 'AvatarSpriteNode'), 'cc.Sprite'));
    assert.ok(spriteUuid(child(slot, 'AvatarFrame')).startsWith('d58e5cab-'));
    assert.strictEqual(byId(slot._children.at(-1))._name, 'AvatarFrame', 'frame must render above masked images');
    assert.ok(size(mask).width < size(child(slot, 'AvatarFrame')).width);
}
for (const name of ['leaderboard_avatar_default', 'leaderboard_avatar_frame']) {
    const relative = `assets/GameAssetsBundle/Textures/UI/Atlases/LeaderboardV2/${name}.png`;
    assert.deepStrictEqual(readPngSize(relative), [128, 128]);
    assert.ok(fs.readFileSync(path.join(root, relative)).equals(fs.readFileSync(path.join(root, `openDataContext/ranking/${name}.png`))));
}

const openData = read('openDataContext/index.js');
assert.ok(openData.includes('const CANVAS_WIDTH = 596;'), 'friend canvas width must match prefab host');
assert.ok(openData.includes('const CANVAS_HEIGHT = 580;'), 'friend canvas height must match the nationwide viewport snapshot');
assert.ok(openData.includes('const ROW_HEIGHT = 116;'), 'friend rows must match main row pitch');
assert.ok(openData.includes('const ROW_BOX_HEIGHT = 112;'), 'friend rows must match main art height');
assert.ok(openData.includes('ctx.drawImage(rankingArt.row, rowX, y, rowW, ROW_BOX_HEIGHT);'), 'friend rows must draw compressed row art');
assert.ok(openData.includes('ctx.drawImage(medal, 77.383 - 36, rowCenterY - 1.809 - 30, 72, 60);'), 'friend medals must match saved prefab positions and custom size');
assert.ok(openData.includes("text: '#4B3F47'"), 'friend text must use the reference dark gray');
assert.ok(openData.includes("drawRowText(badgeText, 78.373, rowCenterY, 28, 72, 'center', '#6B6D7A');"), 'friend ordinary ranks must use the saved rank typography');
assert.ok(openData.includes("drawRowText(displayName, 196.071, textY, 26, 220, 'left', COLORS.text);"), 'friend names must match saved prefab typography');
assert.ok(openData.includes("drawRowText(`第${score}关`, 488, textY, 24, 124, 'center', COLORS.text);"), 'friend progress must match saved alignment and typography');
assert.ok(openData.includes("ctx.fillStyle = '#D9DADF';"), 'friend missing avatars must retain a neutral placeholder');
assert.ok(!openData.includes("charAt(0)"), 'friend missing avatars must not draw a nickname initial');
assert.ok(!openData.includes('fillText(initial'), 'friend missing avatars must not draw a standalone character');
assert.ok(openData.includes("rankingArtState === 'error' ? '排行榜资源加载失败'"), 'friend art failures must be explicit');
for (const name of ['leaderboard_row_standard', 'medal_bronze_rank_3', 'medal_gold_rank_1', 'medal_silver_rank_2']) {
    assert.ok(fs.existsSync(path.join(root, `openDataContext/ranking/${name}.png`)), `open-data art missing: ${name}`);
}

console.log('leaderboard-v2-layout.test.js passed');
