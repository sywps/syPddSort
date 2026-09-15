const { createHash } = require('crypto');
const COLLECTION = 'user_feedback';
const LIMIT_COLLECTION = 'user_feedback_limits';
const string = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : '';
const hash = value => createHash('sha256').update(value).digest('hex');

// Only a missing document is treated as absent; infrastructure failures must propagate.
async function read(doc) {
    try { return (await doc.get()).data || null; }
    catch (error) {
        const message = String(error.errMsg || error.message || '');
        if (!/collection\s+.*(?:not exist|not found)|集合.*不存在/i.test(message)
            && /document.*(?:not exist|not found)|文档不存在/i.test(message)) return null;
        throw error;
    }
}

function createSubmitFeedback({ runTransaction, now }) {
    return async (event, openid) => {
        if (typeof openid !== 'string' || !openid) return { ok: false, code: 'UNAUTHORIZED' };
        if (!event || typeof event.content !== 'string' || !event.content.trim() || event.content.length > 500) {
            return { ok: false, code: 'INVALID_CONTENT' };
        }
        if (typeof event.requestId !== 'string' || !/^[a-zA-Z0-9-]{12,100}$/.test(event.requestId)) {
            return { ok: false, code: 'INVALID_REQUEST' };
        }
        const content = event.content.trim();
        const feedbackId = hash(`${openid}:${event.requestId}`);
        return runTransaction(async transaction => {
            const feedbackDoc = transaction.collection(COLLECTION).doc(feedbackId);
            const existing = await read(feedbackDoc);
            if (existing) return existing.content === content
                ? { ok: true, feedbackId }
                : { ok: false, code: 'REQUEST_CONFLICT' };
            const limitDoc = transaction.collection(LIMIT_COLLECTION).doc(hash(openid));
            const limit = await read(limitDoc);
            const timestamp = now();
            if (limit && timestamp - limit.lastSubmittedAt < 60000) return { ok: false, code: 'RATE_LIMITED' };
            await feedbackDoc.set({ data: {
                openid,
                content,
                source: 'home',
                platform: 'wechat',
                levelId: Number.isSafeInteger(event.levelId) && event.levelId > 0 ? event.levelId : 0,
                device: string(event.device, 120),
                system: string(event.system, 120),
                status: 'pending',
                createdAt: new Date(timestamp),
            } });
            await limitDoc.set({ data: { lastSubmittedAt: timestamp } });
            return { ok: true, feedbackId };
        });
    };
}

module.exports = { createSubmitFeedback };
