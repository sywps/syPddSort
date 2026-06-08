var sharedContext = void 0;
var log = void 0;

var LIST_WIDTH = 490;
var LIST_HEIGHT = 520;
var ITEM_HEIGHT = 52;
var AVATAR_SIZE = 34;
var FONT_SIZE_NAME = 18;
var FONT_SIZE_RANK = 16;
var FONT_SIZE_SCORE = 16;
var HEADER_HEIGHT = 40;
var PADDING_LEFT = 30;
var RANK_BADGE_WIDTH = 44;
var RANK_BADGE_HEIGHT = 28;

var RANK_COLORS = [
    '#F1C550', // 1st gold
    '#C8CED8', // 2nd silver
    '#D8A16C', // 3rd bronze
    '#D9C1A2', // 4th+
];

var avatarCache = {};
var avatarDownloadQueue = [];
var avatarProcessing = false;

function extractScore(kvItem) {
    try {
        var value = kvItem.value;
        if (typeof value === 'string') {
            value = JSON.parse(value);
        }
        if (value && value.wxgame) {
            return {
                score: value.wxgame.score || 0,
                updateTime: value.wxgame.update_time || 0
            };
        }
    } catch (e) {
        log('parse score failed:', e);
    }
    return { score: 0, updateTime: 0 };
}

function downloadAvatar(url, callback) {
    if (avatarCache[url]) {
        callback(avatarCache[url]);
        return;
    }
    if (typeof wx.downloadFile !== 'function') {
        if (typeof wx.createImage !== 'function') {
            callback(null);
            return;
        }
        var directImg = wx.createImage();
        directImg.onload = function() {
            avatarCache[url] = directImg;
            callback(directImg);
        };
        directImg.onerror = function() {
            callback(null);
        };
        directImg.src = url;
        return;
    }
    wx.downloadFile({
        url: url,
        success: function(res) {
            if (res.statusCode === 200) {
                var img = wx.createImage();
                img.onload = function() {
                    avatarCache[url] = img;
                    callback(img);
                };
                img.onerror = function() {
                    callback(null);
                };
                img.src = res.tempFilePath;
            } else {
                callback(null);
            }
        },
        fail: function() {
            callback(null);
        }
    });
}

function processAvatarQueue() {
    if (avatarDownloadQueue.length === 0 || avatarProcessing) return;
    avatarProcessing = true;
    var item = avatarDownloadQueue.shift();
    downloadAvatar(item.url, function(img) {
        item.callback(img);
        avatarProcessing = false;
        processAvatarQueue();
    });
}

function drawRoundRect(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
}

function drawCircle(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
}

function drawText(ctx, text, x, y, size, color, align) {
    ctx.font = size + 'px sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}

function renderList(friendData) {
    var ctx = sharedContext;
    if (!ctx) return;

    ctx.clearRect(0, 0, LIST_WIDTH, LIST_HEIGHT);

    if (!friendData || friendData.length === 0) {
        drawText(ctx, '暂无好友数据', LIST_WIDTH / 2, LIST_HEIGHT / 2 - 20, 20, '#8A7A6A', 'center');
        drawText(ctx, '先闯几关再回来看看', LIST_WIDTH / 2, LIST_HEIGHT / 2 + 20, 16, '#B09A84', 'center');
        return;
    }

    for (var i = 0; i < friendData.length; i++) {
        var item = friendData[i];
        var y = HEADER_HEIGHT + i * ITEM_HEIGHT;
        var isEven = i % 2 === 0;
        var rowColor = isEven ? 'rgba(255,255,255,0.54)' : 'rgba(255,255,255,0.42)';

        // 行背景
        drawRoundRect(ctx, 5, y, LIST_WIDTH - 10, ITEM_HEIGHT - 4, 12, rowColor);

        // 排名徽章
        var badgeColor = RANK_COLORS[i] || RANK_COLORS[3];
        var badgeX = 5 + (LIST_WIDTH - 10) / 2 - 155 - RANK_BADGE_WIDTH / 2 + 5;
        drawRoundRect(ctx, badgeX, y + (ITEM_HEIGHT - 4 - RANK_BADGE_HEIGHT) / 2, RANK_BADGE_WIDTH, RANK_BADGE_HEIGHT, 14, badgeColor);
        drawText(ctx, String(item.rank), badgeX + RANK_BADGE_WIDTH / 2, y + ITEM_HEIGHT / 2 - 2, FONT_SIZE_RANK, '#5A4A3A', 'center');

        // 头像占位（圆形）
        var avatarX = 5 + (LIST_WIDTH - 10) / 2 - 210 - AVATAR_SIZE / 2;
        var avatarY = y + ITEM_HEIGHT / 2 - 2;
        drawCircle(ctx, avatarX, avatarY, AVATAR_SIZE / 2, '#D9C1A2');
        if (item.initial) {
            drawText(ctx, item.initial, avatarX, avatarY, 14, '#5A4A3A', 'center');
        }

        // 昵称
        var nameX = 5 + (LIST_WIDTH - 10) / 2 + 10 - 105;
        drawText(ctx, item.displayName || '未知', nameX, y + ITEM_HEIGHT / 2 - 2, FONT_SIZE_NAME, '#5A4A3A', 'left');

        // 关卡进度
        var scoreX = 5 + (LIST_WIDTH - 10) / 2 + 160 - 60;
        drawText(ctx, '第' + (item.score || 1) + '关', scoreX, y + ITEM_HEIGHT / 2 - 2, FONT_SIZE_SCORE, '#8B674F', 'right');

        // 下载头像
        if (item.avatarUrl && !avatarCache[item.avatarUrl]) {
            (function(idx, avY, avX, avUrl) {
                avatarDownloadQueue.push({
                    url: avUrl,
                    callback: function(img) {
                        if (img) {
                            // 重绘该行头像
                            var ctx2 = sharedContext;
                            ctx2.save();
                            ctx2.beginPath();
                            ctx2.arc(avX, avY, AVATAR_SIZE / 2, 0, Math.PI * 2);
                            ctx2.clip();
                            ctx2.drawImage(img, avX - AVATAR_SIZE / 2, avY - AVATAR_SIZE / 2, AVATAR_SIZE, AVATAR_SIZE);
                            ctx2.restore();
                        }
                    }
                });
                processAvatarQueue();
            })(i, avatarY, avatarX, item.avatarUrl);
        } else if (item.avatarUrl && avatarCache[item.avatarUrl]) {
            var img = avatarCache[item.avatarUrl];
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX, avatarY, AVATAR_SIZE / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, avatarX - AVATAR_SIZE / 2, avatarY - AVATAR_SIZE / 2, AVATAR_SIZE, AVATAR_SIZE);
            ctx.restore();
        }
    }
}

module.exports = function handleMessage(data) {
    switch (data.type) {
        case 'init':
            sharedContext = data.sharedContext;
            log = data.createLogger('friend_rank');
            log('friend_rank module initialized');
            break;

        case 'getFriendRankings':
            log('getFriendRankings called');
            wx.getFriendCloudStorage({
                keyList: ['score'],
                success: function(res) {
                    log('getFriendCloudStorage success:', JSON.stringify(res.data));
                    var friendData = [];
                    if (res.data && res.data.length > 0) {
                        for (var i = 0; i < res.data.length; i++) {
                            var item = res.data[i];
                            var scoreInfo = extractScore(item);
                            var initial = '';
                            if (item.nickname) {
                                initial = item.nickname.charAt(0);
                            }
                            friendData.push({
                                rank: i + 1,
                                avatarUrl: item.avatarUrl || '',
                                displayName: item.nickname || '微信用户',
                                nickname: item.nickname,
                                score: scoreInfo.score,
                                updateTime: scoreInfo.updateTime,
                                initial: initial
                            });
                        }
                    }
                    // 按分数降序
                    friendData.sort(function(a, b) {
                        return b.score - a.score;
                    });
                    // 重新分配排名
                    for (var j = 0; j < friendData.length; j++) {
                        friendData[j].rank = j + 1;
                    }
                    renderList(friendData);
                },
                fail: function(err) {
                    log('getFriendCloudStorage failed:', JSON.stringify(err));
                    var ctx = sharedContext;
                    if (ctx) {
                        ctx.clearRect(0, 0, LIST_WIDTH, LIST_HEIGHT);
                        drawText(ctx, '加载好友成绩失败', LIST_WIDTH / 2, LIST_HEIGHT / 2 - 20, 20, '#B04040', 'center');
                        drawText(ctx, '请检查网络或稍后重试', LIST_WIDTH / 2, LIST_HEIGHT / 2 + 20, 16, '#8A7A6A', 'center');
                    }
                }
            });
            break;
    }
};
