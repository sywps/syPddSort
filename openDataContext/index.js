/**
 * 微信开放数据域 - 好友排行榜渲染
 * 运行在隔离的 Worker 中，只能调用 wx.getFriendCloudStorage 等开放数据 API
 */

const Canvas = wx.getSharedCanvas();
const ctx = Canvas.getContext('2d');

const CANVAS_WIDTH = 596;
const CANVAS_HEIGHT = 580;
const ROW_HEIGHT = 85.512;
const ROW_BOX_HEIGHT = 112;
const ROW_CENTERS_Y = [210.945, 126.14, 40.194, -45.318];
const LIST_BOTTOM = 4;
const AVATAR_RADIUS = 28;
function getRowTop(index) {
    const centerY = index < 4 ? ROW_CENTERS_Y[index] : ROW_CENTERS_Y[3] - (index - 3) * ROW_HEIGHT;
    return CANVAS_HEIGHT / 2 - centerY - ROW_BOX_HEIGHT / 2;
}
const MAX_ENTRIES = 100;
const MAX_AVATAR_CACHE = 24;
const OPEN_DATA_DEBUG = false;

Canvas.width = CANVAS_WIDTH;
Canvas.height = CANVAS_HEIGHT;

let scrollOffset = 0;
let lastRenderedScrollOffset = -1;

// 头像缓存：openid → Image
const avatarCache = {};
const avatarCacheOrder = [];
const avatarDownloadQueue = [];
let avatarQueueHead = 0;
let isDownloading = false;
let friendRankActive = false;
let friendRankDataState = 'idle';
let friendRankDataError = '';
let avatarLoadVersion = 0;
let didLogDirectAvatarFallback = false;
let lastSelfData;

const RANKING_ART_PATHS = {
    avatarDefault: 'openDataContext/ranking/leaderboard_avatar_default.png',
    avatarFrame: 'openDataContext/ranking/leaderboard_avatar_frame.png',
    row: 'openDataContext/ranking/leaderboard_row_standard.png',
    rank1: 'openDataContext/ranking/medal_gold_rank_1.png',
    rank2: 'openDataContext/ranking/medal_silver_rank_2.png',
    rank3: 'openDataContext/ranking/medal_bronze_rank_3.png',
};
const rankingArt = {};
let rankingArtState = 'loading';
let rankingArtError = '';

function debugLog() {
    if (OPEN_DATA_DEBUG) console.log.apply(console, arguments);
}

// 配色
const COLORS = {
    text: '#4B3F47',
    textLight: '#71869A',
};

function drawBackground() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawHeader() {
    // 好友榜和全国榜统一样式，不再额外绘制表头。
}

function drawContainedImage(image, centerX, centerY, maxWidth, maxHeight) {
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.drawImage(image, centerX - width / 2, centerY - height / 2, width, height);
}

function drawRankingArtState() {
    if (rankingArtState === 'ready') return true;
    drawBackground();
    drawEmpty(rankingArtState === 'error' ? '排行榜资源加载失败' : '加载排行榜样式中...');
    return false;
}

function loadRankingArt() {
    const entries = Object.entries(RANKING_ART_PATHS);
    let remaining = entries.length;
    for (const [key, assetPath] of entries) {
        const image = wx.createImage();
        image.onload = () => {
            if (rankingArtState === 'error') return;
            rankingArt[key] = image;
            remaining -= 1;
            if (remaining > 0) return;
            rankingArtState = 'ready';
            if (friendRankActive) {
                renderVisibleRows('wechat-friend', true);
            } else if (lastSelfData !== undefined) {
                renderSelfRanking(lastSelfData);
            }
        };
        image.onerror = (error) => {
            if (rankingArtState === 'error') return;
            rankingArtState = 'error';
            rankingArtError = `${key}: ${error?.errMsg || error || 'unknown error'}`;
            console.error('[OpenData] leaderboard art load failed:', rankingArtError);
            drawRankingArtState();
        };
        image.src = assetPath;
    }
}

// Manual snapshot of the saved nationwide rows; independent of runtime Prefab changes.
const ROW_TEXT_Y = [0.692, 3.863, 2.277, 0];

function drawRowText(text, x, y, fontSize, maxWidth, align, color) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    const measuredWidth = ctx.measureText(text).width;
    if (measuredWidth > maxWidth) {
        ctx.font = `bold ${fontSize * maxWidth / measuredWidth}px sans-serif`;
    }
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}

function drawRow(entry, y, rowIndex, options) {
    const badgeText = options?.badgeText || String(entry.rank || (rowIndex + 1));
    const displayName = getDisplayName(entry);
    const score = typeof entry.progressLevel === 'number' ? entry.progressLevel : extractScore(entry.KVDataList);
    const rowX = 18;
    const rowW = 560;
    const rowCenterY = y + ROW_BOX_HEIGHT / 2;
    ctx.drawImage(rankingArt.row, rowX, y, rowW, ROW_BOX_HEIGHT);

    const medal = rankingArt[`rank${entry.rank}`];
    if (medal) {
        ctx.drawImage(medal, 77.383 - 36, rowCenterY - 1.809 - 30, 72, 60);
    } else {
        drawRowText(badgeText, 78.373, rowCenterY, 28, 72, 'center', '#6B6D7A');
    }

    drawAvatarCircle(entry.avatarUrl, 150, rowCenterY, AVATAR_RADIUS);

    const textY = rowCenterY - ROW_TEXT_Y[Math.min(rowIndex, 3)];
    drawRowText(displayName, 196.071, textY, 26, 220, 'left', COLORS.text);
    drawRowText(`第${score}关`, 488, textY, 24, 124, 'center', COLORS.text);
}

function drawEmpty(message) {
    ctx.fillStyle = COLORS.textLight;
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
}

function drawAvatarCircle(avatarUrl, x, y, radius) {
    ctx.save();
    ctx.beginPath();
    const innerRadius = radius * 52 / 56;
    ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
    ctx.clip();

    const img = avatarCache[avatarUrl] || rankingArt.avatarDefault;
    if (img && img.width > 0) {
        // 等比缩放填充
        const scale = Math.max(innerRadius * 2 / img.width, innerRadius * 2 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    } else {
        // 无头像时只显示中性底色，避免游客昵称被截成单独的“游”字。
        ctx.fillStyle = '#D9DADF';
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    ctx.restore();

    ctx.drawImage(rankingArt.avatarFrame, x - radius, y - radius, radius * 2, radius * 2);
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
    friendRankDataState = 'idle';
    friendRankDataError = '';
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
    friendRankDataState = 'ready';
    friendRankDataError = '';
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
    if (!drawRankingArtState()) return;
    if (friendRankDataState === 'loading') {
        drawBackground();
        drawEmpty('加载好友排行中...');
        return;
    }
    if (friendRankDataState === 'error') {
        drawBackground();
        drawEmpty(friendRankDataError || '好友排行加载失败');
        return;
    }
    const shouldForce = !!force;
    const contentBottom = allSortedEntries.length
        ? getRowTop(allSortedEntries.length - 1) + ROW_BOX_HEIGHT + LIST_BOTTOM
        : 0;
    const maxScroll = Math.max(0, (contentBottom - CANVAS_HEIGHT) / ROW_HEIGHT);
    if (scrollOffset > maxScroll) scrollOffset = maxScroll;
    if (scrollOffset < 0) scrollOffset = 0;
    const normalizedOffset = scrollOffset;
    if (!shouldForce && Math.abs(normalizedOffset - lastRenderedScrollOffset) < 0.01) {
        return;
    }
    lastRenderedScrollOffset = normalizedOffset;
    drawBackground();

    for (let i = 0; i < allSortedEntries.length; i++) {
        const y = getRowTop(i) - scrollOffset * ROW_HEIGHT;
        if (y > CANVAS_HEIGHT || y + ROW_BOX_HEIGHT < 0) continue;
        if (allSortedEntries[i].avatarUrl) {
            downloadAvatar(allSortedEntries[i].avatarUrl);
        }
        drawRow(allSortedEntries[i], y, i);
    }

    if (allSortedEntries.length === 0) {
        drawEmpty(source === 'wechat-friend' ? '暂无好友排行数据' : '尚未提交成绩');
    }
}

function renderSelfRanking(selfData) {
    lastSelfData = selfData;
    if (!drawRankingArtState()) return;
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
        friendRankDataState = 'loading';
        friendRankDataError = '';
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
                friendRankDataState = 'error';
                friendRankDataError = formatFriendRankError(err);
                drawBackground();
                drawEmpty(friendRankDataError);
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
loadRankingArt();
setTimeout(() => {
    if (friendRankActive || lastSelfData !== undefined) return;
    drawBackground();
    drawEmpty(rankingArtState === 'error' ? '排行榜资源加载失败' : '点击加载好友排行');
}, 500);
