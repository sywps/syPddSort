'use strict';
const common = require('./analyticsCommon');
module.exports = async function (params, context) {
    if (!common.adminAllowed(context)) return common.adminFailure(context);
    try {
        const db = await common.database();
        for (const name of ['user_behavior', 'first_level_funnel', 'level_record']) {
            await db.collection(name).createIndex({ analyticsEnvironment: 1, timestamp: 1 }, { name: 'analytics_by_time' });
            await db.collection(name).createIndex({ subjectId: 1, timestamp: 1 }, { name: 'analytics_by_user_time' });
        }
        await db.collection('analytics_users').createIndex({ analyticsEnvironment: 1, firstSeenAt: 1 }, { name: 'analytics_first_seen' });
        return common.reply({ ok: true, reason: 'INDEXES_READY', manualSetupRevision: require('./adminAuth').revision });
    } catch (error) { return common.safeError(error); }
};
