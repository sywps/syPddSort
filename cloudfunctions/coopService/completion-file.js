'use strict';
const crypto = require('crypto');
const MAX_REPLAY_BYTES = 64 * 1024 * 1024;

function createCompletionFileHandler(execute, storage) {
    return async (owner, event) => {
        if (event.action !== 'completeUpload' && !(event.action === 'complete' && event.replayFileID)) return execute(owner, event);
        if (!/^[a-f0-9]{24}$/.test(event.postId || '') || !/^[a-f0-9-]{16,80}$/.test(event.requestId || '')) throw new Error('完成记录上传标识无效');
        const detail = await execute(owner, { ...event, action: 'detail' });
        if (!detail.run) throw new Error('尚未加入这张合作图');
        const user = crypto.createHash('sha256').update(owner).digest('hex');
        const cloudPath = `coop-results/${user}/${event.postId}/${event.requestId}.json`;
        if (event.action === 'completeUpload') return detail.run.status === 'complete' ? { post: detail.post, run: detail.run } : { cloudPath };
        const fileID = event.replayFileID;
        if (typeof fileID !== 'string' || !/^cloud:\/\/[^/]+\//.test(fileID) || !fileID.endsWith('/' + cloudPath)) throw new Error('完成记录文件归属不匹配');
        // A previous request may have committed and deleted its file before its response was lost.
        if (detail.run.status === 'complete') return { post: detail.post, run: detail.run };
        const downloaded = await storage.downloadFile({ fileID });
        if (!Buffer.isBuffer(downloaded.fileContent) || downloaded.fileContent.length > MAX_REPLAY_BYTES) throw new Error('完成记录文件过大或读取失败');
        const events = JSON.parse(downloaded.fileContent.toString('utf8'));
        const result = await execute(owner, { ...event, events });
        try {
            const deleted = await storage.deleteFile({ fileList: [fileID] });
            if (deleted.fileList?.some(item => item.status !== undefined && item.status !== 0)) console.warn('[coopService] completion file cleanup failed', fileID);
        } catch (error) { console.warn('[coopService] completion file cleanup failed', error); }
        return result;
    };
}
module.exports = { createCompletionFileHandler };
