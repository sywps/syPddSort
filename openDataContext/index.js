/**
 * 微信开放数据域 - 好友排行榜渲染
 * 运行在隔离的 Worker 中，只能调用 wx.getFriendCloudStorage 等开放数据 API
 */

const Canvas = wx.getSharedCanvas();
const ctx = Canvas.getContext('2d');

const CANVAS_WIDTH = 620;
const CANVAS_HEIGHT = 830;
const ROW_HEIGHT = 84;
const ROW_BOX_HEIGHT = 78;
const LIST_TOP = -4;
const LIST_BOTTOM = 18;
const AVATAR_RADIUS = 20;
const VISIBLE_ROWS = Math.max(1, Math.floor((CANVAS_HEIGHT - LIST_TOP - LIST_BOTTOM) / ROW_HEIGHT));
const MAX_ENTRIES = 100;
const MAX_AVATAR_CACHE = 24;
const OPEN_DATA_DEBUG = false;

try {
    Canvas.width = CANVAS_WIDTH;
    Canvas.height = CANVAS_HEIGHT;
} catch (e) {
    // sharedCanvas 尺寸可能为只读，忽略赋值错误
}

let scrollOffset = 0;
let lastRenderedScrollOffset = -1;

// 头像缓存：openid → Image
const avatarCache = {};
const avatarCacheOrder = [];
const avatarDownloadQueue = [];
let avatarQueueHead = 0;
let isDownloading = false;
let friendRankActive = false;
let avatarLoadVersion = 0;
let didLogDirectAvatarFallback = false;

function debugLog() {
    if (OPEN_DATA_DEBUG) console.log.apply(console, arguments);
}

// 配色
const COLORS = {
    bg: '#F5F0E8',
    rowOdd: '#FFFFFF',
    rowEven: '#F7F1E8',
    text: '#5A4A3A',
    textLight: '#8A7A6A',
    progress: '#8B674F',
    rank1: '#F1C550',
    rank2: '#C8CED8',
    rank3: '#D8A16C',
    rankOther: '#D9C1A2',
    selfRow: '#F4E2BE',
};

function drawBackground() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawHeader() {
    // 好友榜和全国榜统一样式，不再额外绘制表头。
}

function getRankBadgeColor(rank) {
    if (rank === 1) return COLORS.rank1;
    if (rank === 2) return COLORS.rank2;
    if (rank === 3) return COLORS.rank3;
    return COLORS.rankOther;
}

function drawRow(entry, y, rowIndex, options) {
    const rowColor = options?.rowColor || COLORS.rowOdd;
    const badgeText = options?.badgeText || String(entry.rank || (rowIndex + 1));
    const badgeColor = options?.badgeColor || getRankBadgeColor(entry.rank);
    const displayName = getDisplayName(entry);
    const score = typeof entry.progressLevel === 'number' ? entry.progressLevel : extractScore(entry.KVDataList);
    const rowX = 8;
    const rowW = CANVAS_WIDTH - 16;
    const rowCenterY = y + ROW_BOX_HEIGHT / 2;
    const badgeStripW = entry.rank <= 3 ? 76 : 68;

    ctx.fillStyle = rowColor;
    roundRect(ctx, rowX, y, rowW, ROW_BOX_HEIGHT, 18);
    strokeRoundRect(ctx, rowX, y, rowW, ROW_BOX_HEIGHT, 18, '#D8C5A5', 2);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(rowX + 18, y);
    ctx.lineTo(rowX + rowW - 18, y);
    ctx.quadraticCurveTo(rowX + rowW, y, rowX + rowW, y + 18);
    ctx.lineTo(rowX + rowW, y + ROW_BOX_HEIGHT - 18);
    ctx.quadraticCurveTo(rowX + rowW, y + ROW_BOX_HEIGHT, rowX + rowW - 18, y + ROW_BOX_HEIGHT);
    ctx.lineTo(rowX + 18, y + ROW_BOX_HEIGHT);
    ctx.quadraticCurveTo(rowX, y + ROW_BOX_HEIGHT, rowX, y + ROW_BOX_HEIGHT - 18);
    ctx.lineTo(rowX, y + 18);
    ctx.quadraticCurveTo(rowX, y, rowX + 18, y);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = entry.rank === 1 ? '#F5D8A9' : entry.rank === 2 ? '#D9ECFB' : entry.rank === 3 ? '#F9EEC7' : '#FFFDFC';
    ctx.fillRect(rowX, y, badgeStripW, ROW_BOX_HEIGHT);
    ctx.restore();

    if (entry.rank <= 3) {
        ctx.fillStyle = badgeColor;
        ctx.beginPath();
        ctx.arc(rowX + 30, rowCenterY, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8B5A2B';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, rowX + 30, rowCenterY + 1);
    } else {
        ctx.fillStyle = COLORS.text;
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, rowX + 34, rowCenterY + 1);
    }

    drawAvatarCircle(entry.avatarUrl, displayName, 90, rowCenterY, AVATAR_RADIUS);

    ctx.fillStyle = COLORS.text;
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(displayName.slice(0, 10), 135, rowCenterY);

    ctx.fillStyle = COLORS.progress;
    ctx.textAlign = 'right';
    ctx.fillText(`第${score}关`, CANVAS_WIDTH - 24, rowCenterY);
}

function drawEmpty(message) {
    ctx.fillStyle = COLORS.textLight;
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
}

function drawAvatarCircle(avatarUrl, nickname, x, y, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();

    const img = avatarCache[avatarUrl];
    if (img && img.width > 0) {
        // 等比缩放填充
        const scale = Math.max(radius * 2 / img.width, radius * 2 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    } else {
        // 无头像时显示背景色 + 首字母
        ctx.fillStyle = '#D9C1A2';
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        ctx.fillStyle = COLORS.text;
        ctx.font = `${radius}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const initial = (nickname || '?').charAt(0);
        ctx.fillText(initial, x, y + 1);
    }

    ctx.restore();

    // 圆形边框
    ctx.strokeStyle = '#C0B098';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
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

function strokeRoundRect(ctx, x, y, w, h, r, color, lineWidth) {
    ctx.save();
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
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.restore();
}

function extractScore(KVDataList) {
    if (!KVDataList || !Array.isArray(KVDataList)) return 0;
    for (const kv of KVDataList) {
        if (kv.key === 'score' && kv.value) {
            try {
                const parsed = JSON.parse(kv.value);
                if (parsed.wxgame && typeof parsed.wxgame.score === 'number') {
                    return parsed.wxgame.score;
                }
            } catch (_) {
                // ignore
            }
        }
    }
    return 0;
}

function getDisplayName(entry) {
    return entry?.displayName || entry?.nickname || entry?.nickName || '微信用户';
}

function formatFriendRankError(err) {
    const errMsg = String(err?.errMsg || '');
    if (errMsg.includes('auth deny') || errMsg.includes('auth denied') || errMsg.includes('authorize')) {
        return '请先开启微信好友权限';
    }
    if (errMsg.includes('scope.WxFriendInteraction')) {
        return '缺少微信好友权限';
    }
    return '好友排行加载失败';
}

function resetAvatarDownloads() {
    avatarLoadVersion += 1;
    avatarDownloadQueue.length = 0;
    avatarQueueHead = 0;
    isDownloading = false;
}

function rememberAvatar(url, img) {
    if (!url || !img) return;
    if (!avatarCache[url]) {
        avatarCacheOrder.push(url);
    }
    avatarCache[url] = img;
    while (avatarCacheOrder.length > MAX_AVATAR_CACHE) {
        const expired = avatarCacheOrder.shift();
        if (expired) delete avatarCache[expired];
    }
}

function clearAvatarCache() {
    avatarCacheOrder.length = 0;
    for (const key in avatarCache) {
        delete avatarCache[key];
    }
}

function deactivateFriendRankView(message) {
    friendRankActive = false;
    scrollOffset = 0;
    lastRenderedScrollOffset = -1;
    lastFriendData = [];
    allSortedEntries = [];
    resetAvatarDownloads();
    clearAvatarCache();
    drawBackground();
    drawEmpty(message || '点击加载好友排行');
}

function downloadAvatar(avatarUrl) {
    if (!friendRankActive || avatarCache[avatarUrl] || !avatarUrl) return;
    // 已在下载中或队列中则跳过
    if (avatarDownloadQueue.some((item) => item.url === avatarUrl)) return;
    avatarDownloadQueue.push({ url: avatarUrl, version: avatarLoadVersion });
    if (!isDownloading) processAvatarQueue();
}

function processAvatarQueue() {
    if (!friendRankActive) {
        isDownloading = false;
        return;
    }
    if (avatarQueueHead >= avatarDownloadQueue.length) {
        avatarDownloadQueue.length = 0;
        avatarQueueHead = 0;
        isDownloading = false;
        return;
    }
    isDownloading = true;
    const item = avatarDownloadQueue[avatarQueueHead++];
    if (avatarQueueHead > 32) {
        avatarDownloadQueue.splice(0, avatarQueueHead);
        avatarQueueHead = 0;
    }
    if (!item) {
        isDownloading = false;
        return;
    }
    const { url, version } = item;
    if (version !== avatarLoadVersion) {
        processAvatarQueue();
        return;
    }

    debugLog('[OpenData] loading avatar:', url ? url.substring(0, 50) : '(empty)');

    // 超时控制：5秒后放弃
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        console.warn('[OpenData] avatar download timeout:', url ? url.substring(0, 50) : '');
        isDownloading = false;
        processAvatarQueue();
    }, 5000);

    const finalizeAvatarLoad = (src) => {
        const createImage = typeof wx.createImage === 'function' ? wx.createImage.bind(wx) : null;
        if (!createImage) {
            clearTimeout(timeout);
            console.warn('[OpenData] wx.createImage unavailable, skip avatar:', url ? url.substring(0, 50) : '');
            isDownloading = false;
            processAvatarQueue();
            return;
        }

        const img = createImage();
        img.onload = () => {
            if (timedOut) return;
            clearTimeout(timeout);
            if (!friendRankActive || version !== avatarLoadVersion) {
                isDownloading = false;
                processAvatarQueue();
                return;
            }
            debugLog('[OpenData] avatar loaded:', url ? url.substring(0, 50) : '');
            rememberAvatar(url, img);
            isDownloading = false;
            renderVisibleRows('wechat-friend', true);
            processAvatarQueue();
        };
        img.onerror = () => {
            if (timedOut) return;
            clearTimeout(timeout);
            console.warn('[OpenData] avatar load failed, url:', url ? url.substring(0, 50) : '');
            isDownloading = false;
            processAvatarQueue();
        };
        try {
            img.src = src;
        } catch (err) {
            if (timedOut) return;
            clearTimeout(timeout);
            console.warn('[OpenData] avatar src assign failed:', err?.message || err);
            isDownloading = false;
            processAvatarQueue();
        }
    };

    if (typeof wx.downloadFile !== 'function') {
        if (!didLogDirectAvatarFallback) {
            didLogDirectAvatarFallback = true;
            debugLog('[OpenData] openDataContext avatar download fallback: direct image src');
        }
        finalizeAvatarLoad(url);
        return;
    }

    // 优先下载到临时文件，再交给 createImage，避免部分环境对远程头像 URL 直接渲染不稳定。
    wx.downloadFile({
        url,
        success: (res) => {
            if (timedOut) return;
            if (!friendRankActive || version !== avatarLoadVersion) {
                clearTimeout(timeout);
                isDownloading = false;
                processAvatarQueue();
                return;
            }
            if (res.statusCode !== 200 || !res.tempFilePath) {
                clearTimeout(timeout);
                console.warn('[OpenData] avatar download failed, status:', res.statusCode, 'url:', url ? url.substring(0, 50) : '');
                isDownloading = false;
                processAvatarQueue();
                return;
            }
            finalizeAvatarLoad(res.tempFilePath);
        },
        fail: (err) => {
            if (timedOut) return;
            clearTimeout(timeout);
            console.warn('[OpenData] avatar download error:', err?.errMsg || err);
            isDownloading = false;
            processAvatarQueue();
        },
    });
}

let lastFriendData = [];
let allSortedEntries = [];

function renderFullLeaderboard(friendData, source) {
    if (!friendRankActive) {
        return;
    }
    lastFriendData = friendData || [];
    allSortedEntries = lastFriendData
        .map((item) => ({
            displayName: getDisplayName(item),
            avatarUrl: item.avatarUrl || '',
            progressLevel: extractScore(item.KVDataList || []),
            KVDataList: item.KVDataList || [],
        }))
        .sort((a, b) => {
            if (b.progressLevel !== a.progressLevel) return b.progressLevel - a.progressLevel;
            return getDisplayName(a).localeCompare(getDisplayName(b));
        })
        .slice(0, MAX_ENTRIES)
        .map((entry, index) => ({
            ...entry,
            rank: index + 1,
        }));

    drawBackground();

    // 诊断日志
    debugLog('[OpenData] renderFullLeaderboard, count:', friendData ? friendData.length : 0, 'sorted:', allSortedEntries.length);
    lastRenderedScrollOffset = -1;

    // 根据 scrollOffset 渲染可见行
    renderVisibleRows(source);
}

function renderVisibleRows(source, force) {
    const shouldForce = !!force;
    const maxScroll = Math.max(0, allSortedEntries.length - VISIBLE_ROWS);
    if (scrollOffset > maxScroll) scrollOffset = maxScroll;
    if (scrollOffset < 0) scrollOffset = 0;
    const normalizedOffset = scrollOffset;
    if (!shouldForce && Math.abs(normalizedOffset - lastRenderedScrollOffset) < 0.01) {
        return;
    }
    lastRenderedScrollOffset = normalizedOffset;
    drawBackground();

    const startIdx = Math.floor(scrollOffset);
    const endIdx = Math.min(startIdx + VISIBLE_ROWS + 1, allSortedEntries.length);
    const yOffset = scrollOffset - startIdx;

    for (let i = startIdx; i < endIdx; i++) {
        const localIdx = i - startIdx;
        const y = LIST_TOP + (localIdx - yOffset) * ROW_HEIGHT;
        if (y > CANVAS_HEIGHT || y + ROW_BOX_HEIGHT < 0) continue;
        if (allSortedEntries[i].avatarUrl) {
            downloadAvatar(allSortedEntries[i].avatarUrl);
        }
        drawRow(allSortedEntries[i], y, i);
    }

    if (allSortedEntries.length > VISIBLE_ROWS) {
        const totalHeight = allSortedEntries.length * ROW_HEIGHT;
        const visibleHeight = VISIBLE_ROWS * ROW_HEIGHT;
        const trackHeight = CANVAS_HEIGHT - LIST_TOP - LIST_BOTTOM;
        const indicatorHeight = Math.max(20, (visibleHeight / totalHeight) * trackHeight);
        const maxTravel = trackHeight - indicatorHeight;
        const indicatorY = LIST_TOP + (maxScroll <= 0 ? 0 : (scrollOffset / maxScroll) * maxTravel);
        ctx.fillStyle = 'rgba(90,74,58,0.16)';
        roundRect(ctx, CANVAS_WIDTH - 6, indicatorY, 4, indicatorHeight, 2);
    }

    if (allSortedEntries.length === 0) {
        drawEmpty(source === 'wechat-friend' ? '暂无好友排行数据' : '尚未提交成绩');
    }
}

function renderSelfRanking(selfData) {
    drawBackground();

    const kvDataList = Array.isArray(selfData) ? selfData : selfData?.KVDataList;
    if (!kvDataList || kvDataList.length === 0) {
        drawEmpty('尚未提交成绩');
        return;
    }

    drawRow({
        rank: 0,
        displayName: '我',
        avatarUrl: '',
        progressLevel: extractScore(kvDataList),
        KVDataList: kvDataList,
    }, CANVAS_HEIGHT / 2 - ROW_BOX_HEIGHT / 2, 0, {
        badgeText: '我',
        badgeColor: COLORS.rankOther,
        rowColor: COLORS.selfRow,
    });
}

// 监听主域消息
wx.onMessage((data) => {
    if (data?.type === 'engine' || data?.fromEngine) {
        return;
    }

    debugLog('[OpenData] onMessage:', data);

    if (data.type === 'getFriendRankings') {
        friendRankActive = true;
        resetAvatarDownloads();
        scrollOffset = 0;
        lastRenderedScrollOffset = -1;
        debugLog('[OpenData] Received getFriendRankings request');
        drawBackground();
        drawEmpty('加载好友排行中...');
        wx.getFriendCloudStorage({
            keyList: ['score'],
            success: (res) => {
                const friendData = res.data || [];
                debugLog('[OpenData] getFriendCloudStorage SUCCESS, count:', friendData.length);
                if (friendData.length > 0) {
                    debugLog('[OpenData] First entry keys:', Object.keys(friendData[0]));
                    debugLog('[OpenData] First entry:', JSON.stringify({
                        openid: friendData[0].openid || friendData[0].openId,
                        nickname: getDisplayName(friendData[0]),
                        avatarUrl: friendData[0].avatarUrl,
                        kvList: friendData[0].KVDataList
                    }));
                } else {
                    debugLog('[OpenData] WARNING: No friend data returned. This is expected if no WeChat friends have submitted scores via wx.setUserCloudStorage.');
                }
                // 按 score 降序排序
                friendData.sort((a, b) => {
                    const scoreA = extractScore(a.KVDataList);
                    const scoreB = extractScore(b.KVDataList);
                    if (scoreB !== scoreA) return scoreB - scoreA;
                    return 0;
                });
                debugLog('[OpenData] sorted data:', JSON.stringify(friendData.map(function(d) {
                    return { nickname: getDisplayName(d), avatarUrl: d.avatarUrl ? 'has' : 'empty', kvCount: d.KVDataList ? d.KVDataList.length : 0 };
                })));
                renderFullLeaderboard(friendData, 'wechat-friend');
            },
            fail: (err) => {
                console.warn('[OpenData] getFriendCloudStorage failed:', err);
                drawBackground();
                drawEmpty(formatFriendRankError(err));
            },
        });
    } else if (data.type === 'getSelfRanking') {
        wx.getUserCloudStorage({
            keyList: ['score'],
            success: (res) => {
                renderSelfRanking(res.KVDataList);
            },
            fail: (err) => {
                console.warn('[OpenData] getUserCloudStorage failed:', err);
                renderSelfRanking(null);
            },
        });
    } else if (data.type === 'clearCanvas') {
        drawBackground();
        drawEmpty('加载中...');
    } else if (data.type === 'scroll') {
        if (!friendRankActive) return;
        const offset = Number.isFinite(data.offset)
            ? Number(data.offset)
            : (Number.isFinite(data.offsetPx) ? Number(data.offsetPx) / ROW_HEIGHT : 0);
        scrollOffset = Math.max(0, offset || 0);
        renderVisibleRows('wechat-friend');
    } else if (data.type === 'deactivate') {
        deactivateFriendRankView('点击加载好友排行');
    }
});

// 延迟初始化绘制，等待主域 sharedCanvas 父节点就绪
setTimeout(() => {
    drawBackground();
    drawEmpty('点击加载好友排行');
}, 500);
