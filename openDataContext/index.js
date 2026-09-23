/**
 * 微信开放数据域 - 好友排行榜渲染
 * 运行在隔离的 Worker 中，只能调用 wx.getFriendCloudStorage 等开放数据 API
 */

const Canvas = wx.getSharedCanvas();
const ctx = Canvas.getContext('2d');

const CANVAS_WIDTH = 596;
const CANVAS_HEIGHT = 640;
// Keep the saved row origin fixed while extending only the viewport bottom.
const ROW_ORIGIN_FROM_TOP = 290;
const ROW_HEIGHT = 101.082731;
const ROW_BOX_HEIGHT = 134.4;
const ROW_CENTERS_Y = [203.023049, 102.647317, 1.130585, -99.952146];
const LIST_BOTTOM = 4;
const AVATAR_RADIUS = 48;
function getRowTop(index) {
    const centerY = index < 4 ? ROW_CENTERS_Y[index] : ROW_CENTERS_Y[3] - (index - 3) * ROW_HEIGHT;
    return ROW_ORIGIN_FROM_TOP - centerY - ROW_BOX_HEIGHT / 2;
}
const MAX_ENTRIES = 100;
const MAX_AVATAR_CACHE = 24;
const OPEN_DATA_DEBUG = false;

// Shared canvas dimensions are owned by main-domain Cocos SubContextView.
// The open-data view is read-only; drawing coordinates remain 596 x 640.

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
    avatarDefault: 'subpackages/rankingArt/leaderboard_avatar_default.png',
    avatarFrame: 'subpackages/rankingArt/leaderboard_avatar_frame.png',
    row: 'subpackages/rankingArt/leaderboard_row_standard.png',
    rank1: 'subpackages/rankingArt/medal_gold_rank_1.png',
    rank2: 'subpackages/rankingArt/medal_silver_rank_2.png',
    rank3: 'subpackages/rankingArt/medal_bronze_rank_3.png',
};
const rankingArt = {};
let rankingArtState = 'idle';
let rankingArtError = '';
let rankingArtLoadVersion = 0;

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
    if (rankingArtState === 'ready' || rankingArtState === 'loading') return;
    rankingArtState = 'loading';
    rankingArtError = '';
    const version = ++rankingArtLoadVersion;
    const fail = (key, error) => {
        if (version !== rankingArtLoadVersion || rankingArtState !== 'loading') return;
        clearTimeout(timeout);
        rankingArtState = 'error';
        rankingArtError = `${key}: ${error?.errMsg || error || 'unknown error'}`;
        console.error('[OpenData] leaderboard art load failed:', rankingArtError);
        if (friendRankActive || lastSelfData !== undefined) drawRankingArtState();
    };
    const timeout = setTimeout(() => fail('images', '加载超时'), 10000);
    const entries = Object.entries(RANKING_ART_PATHS);
    let remaining = entries.length;
    for (const [key, assetPath] of entries) {
        const image = wx.createImage();
        image.onload = () => {
            if (version !== rankingArtLoadVersion || rankingArtState !== 'loading') return;
            rankingArt[key] = image;
            remaining -= 1;
            if (remaining > 0) return;
            clearTimeout(timeout);
            rankingArtState = 'ready';
            if (friendRankActive) {
                renderVisibleRows('wechat-friend', true);
            } else if (lastSelfData !== undefined) {
                renderSelfRanking(lastSelfData);
            }
        };
        image.onerror = (error) => fail(key, error);
        image.src = assetPath;
    }
}

// Manual snapshot of the saved nationwide rows; independent of runtime Prefab changes.
const ROW_TEXT_Y = [0, 0, 0, 0];

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
        ctx.drawImage(medal, 67 - 43.2, rowCenterY - 36, 86.4, 72);
    } else {
        drawRowText(badgeText, 67, rowCenterY, 28, 86.4, 'center', '#6B6D7A');
    }

    drawAvatarCircle(entry.avatarUrl, 162, rowCenterY, AVATAR_RADIUS, entry);

    const textY = rowCenterY - ROW_TEXT_Y[Math.min(rowIndex, 3)];
    drawRowText(displayName, 220, textY, 26, 208, 'left', COLORS.text);
    drawRowText(`通关${Math.max(0, Math.floor(Number(score) || 1) - 1)}关`, 500, textY, 24, 136, 'center', COLORS.text);
}

function drawEmpty(message) {
    ctx.fillStyle = COLORS.textLight;
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
}

function drawAvatarCircle(avatarUrl, x, y, radius, profile = {}) {
    const frameGeometry = require('./profile-frames');
    const geometry = frameGeometry[2001];
    const hole = geometry && geometry.bounds;
    const scale = geometry ? radius * 2 / geometry.width : 1;
    const portraitX = hole ? x + ((hole[0] + hole[2]) / 2 - geometry.width / 2) * scale : x;
    const portraitY = hole ? y + ((hole[1] + hole[3]) / 2 - geometry.height / 2) * scale : y;
    ctx.save();
    ctx.beginPath();
    const innerRadius = hole ? Math.min(hole[2]-hole[0],hole[3]-hole[1]) * scale / 2 : radius * 52 / 56;
    ctx.rect(portraitX - innerRadius, portraitY - innerRadius, innerRadius * 2, innerRadius * 2);
    ctx.clip();

    const img = avatarCache[avatarUrl] || rankingArt.avatarDefault;
    if (img && img.width > 0) {
        // 等比缩放填充
        const scale = Math.max(innerRadius * 2 / img.width, innerRadius * 2 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, portraitX - w / 2, portraitY - h / 2, w, h);
    } else {
        // 无头像时只显示中性底色，避免游客昵称被截成单独的“游”字。
        ctx.fillStyle = '#D9DADF';
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    ctx.restore();

    const border = rankingArt.avatarFrame;
    if (border) {
        const height = hole ? geometry.height * scale : radius * 2;
        ctx.drawImage(border, x - radius, y - height / 2, radius * 2, height);
    }
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

let profileLocalFiles = {};

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

    if (/^https:\/\/game-pdd-v2\.oss-cn-beijing\.aliyuncs\.com\//.test(url)) {
        const local = profileLocalFiles[url];
        if (local) finalizeAvatarLoad(local);
        else {
            clearTimeout(timeout);
            console.warn('[OpenData] profile local image unavailable:', url);
            isDownloading = false; processAvatarQueue();
        }
        return;
    }

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

function readGameProfile(item) {
    const defaults = { avatarId: 0, avatarUrl: item.avatarUrl || '', frameId: 2001, frameUrl: '' };
    const kv = (item.KVDataList || []).find(row => row.key === 'profile_v1');
    if (!kv) return defaults;
    try {
        const p = JSON.parse(kv.value);
        if (p.version !== 1 || typeof p.displayName !== 'string') return defaults;
        return { ...defaults, displayName: p.displayName.slice(0, 24) };
    } catch (error) { console.warn('[FriendRank] invalid game profile', error); return defaults; }
}

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
            ...readGameProfile(item),
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
        if (allSortedEntries[i].frameUrl) downloadAvatar(allSortedEntries[i].frameUrl);
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

// Bounded stage measurements; no friend identities or URLs are recorded.
const friendRankTimings = [];
function measureFriendRank(stage, started) {
    const ms = Date.now() - started;
    friendRankTimings.push({ stage, ms });
    if (friendRankTimings.length > 32) friendRankTimings.shift();
    if (ms >= 50) console.info('[FriendRankPerf]', stage, ms + 'ms');
}
// 监听主域消息
wx.onMessage((data) => {
    const messageStarted = Date.now();
    try {
    if (data?.type === 'engine' || data?.fromEngine) {
        return;
    }

    debugLog('[OpenData] onMessage:', data);

    if (data.type === 'getFriendRankings') {
        profileLocalFiles = data.profileFiles || {};
        friendRankActive = true;
        loadRankingArt(); // 主域确认 rankingArt 分包加载成功后才会发送本消息。
        friendRankDataState = 'loading';
        friendRankDataError = '';
        resetAvatarDownloads();
        const requestVersion = avatarLoadVersion;
        scrollOffset = 0;
        lastRenderedScrollOffset = -1;
        debugLog('[OpenData] Received getFriendRankings request');
        drawBackground();
        drawEmpty('加载好友排行中...');
        wx.getFriendCloudStorage({
            keyList: ['score', 'profile_v1'],
            success: (res) => {
                if (!friendRankActive || requestVersion !== avatarLoadVersion) return;
                const renderStarted = Date.now();
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
                measureFriendRank('friend-data-sort-render', renderStarted);
            },
            fail: (err) => {
                if (!friendRankActive || requestVersion !== avatarLoadVersion) return;
                console.warn('[OpenData] getFriendCloudStorage failed:', err);
                friendRankDataState = 'error';
                friendRankDataError = formatFriendRankError(err);
                drawBackground();
                drawEmpty(friendRankDataError);
            },
        });
    } else if (data.type === 'getSelfRanking') {
        loadRankingArt(); // 调用方同样必须先加载 rankingArt 分包。
        wx.getUserCloudStorage({
            keyList: ['score', 'profile_v1'],
            success: (res) => {
                renderSelfRanking(res.KVDataList);
            },
            fail: (err) => {
                console.warn('[OpenData] getUserCloudStorage failed:', err);
                renderSelfRanking(null);
            },
        });
    } else if (data.type === 'rankingArtError') {
        drawBackground();
        drawEmpty('排行榜资源加载失败，请重新进入');
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
    } finally {
        if (data && ['getFriendRankings', 'scroll', 'clearCanvas'].includes(data.type)) measureFriendRank('message:' + data.type, messageStarted);
    }
});

// 延迟初始化绘制，等待主域 sharedCanvas 父节点就绪
setTimeout(() => {
    if (friendRankActive || lastSelfData !== undefined) return;
    drawBackground();
    drawEmpty(rankingArtState === 'error' ? '排行榜资源加载失败' : '点击加载好友排行');
}, 500);
