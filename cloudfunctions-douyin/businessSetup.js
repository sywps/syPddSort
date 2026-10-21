'use strict';
const common = require('./businessCommon');
module.exports = async (params, context) => {
    if (!common.adminAllowed(context)) return common.adminFailure(context);
    let db, probeId;
    try {
        const connection = await common.database(); db = connection.db;
        const { profiles, requests, meta } = common.COLLECTIONS;
        // Creating collections/indexes is outside transactions (MongoDB 4.0 requirement).
        await db.collection(profiles).createIndex({ openid: 1 }, { unique: true, name: 'business_owner_unique' });
        await db.collection(requests).createIndex({ openid: 1, createdAt: 1 }, { name: 'business_owner_requests' });
        await db.collection(meta).createIndex({ version: 1 }, { name: 'business_setup_version' });
        probeId = 'probe-' + require('crypto').randomBytes(16).toString('hex');
        try {
            await common.transaction(connection.client, async session => {
                common.ack(await db.collection(meta).insertOne({ _id: probeId, stage: 'rollback' }, { session }));
                throw common.failure('EXPECTED_ROLLBACK');
            });
        } catch (error) { if (error.businessCode !== 'EXPECTED_ROLLBACK') throw error; }
        if (await db.collection(meta).findOne({ _id: probeId })) throw common.failure('TRANSACTION_ROLLBACK_FAILED');
        await common.transaction(connection.client, async session => {
            common.ack(await db.collection(meta).insertOne({ _id: probeId, stage: 'commit' }, { session }));
            common.ack(await db.collection(requests).insertOne({ _id: probeId, probe: true }, { session }));
        });
        const committed = await db.collection(meta).findOne({ _id: probeId });
        if (!committed || committed.stage !== 'commit' || !await db.collection(requests).findOne({ _id: probeId })) throw common.failure('TRANSACTION_COMMIT_FAILED');
        common.ack(await db.collection(meta).updateOne({ _id: 'setup-v1' }, { $set: { version: 1, transactionsVerified: true, verifiedAt: Date.now() } }, { upsert: true, writeConcern: { w: 'majority', wtimeout: 5000 } }));
        return common.reply({ ok: true, reason: 'BUSINESS_READY', transactionsVerified: true, collections: [profiles, requests, meta],
            manualSetupRevision: require('./adminAuth').revision });
    } catch (error) { return common.safeError(error); }
    finally {
        if (db && probeId) {
            // Only delete this invocation's randomly named diagnostic records; never player data.
            for (const name of [common.COLLECTIONS.meta, common.COLLECTIONS.requests]) {
                await db.collection(name).deleteOne({ _id: probeId }).catch(() => console.error('[DouyinBusiness] PROBE_CLEANUP_FAILED'));
            }
        }
    }
};
