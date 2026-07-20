'use strict';

const DEFAULT_LEVEL_DATA_CONTRACT = 'v2';
const requestedContract = String(process.env.PDD_LEVEL_DATA_CONTRACT || DEFAULT_LEVEL_DATA_CONTRACT).trim().toLowerCase();
if (requestedContract !== 'v1' && requestedContract !== 'v2') {
    throw new Error('PDD_LEVEL_DATA_CONTRACT must be v1 or v2: ' + requestedContract);
}
const LEVEL_DATA_CONTRACT = requestedContract;
const LEVEL_DATA_SCHEMA_VERSION = LEVEL_DATA_CONTRACT === 'v1' ? 1 : 2;
const LEVEL_DATA_CLIENT_BUILD = LEVEL_DATA_CONTRACT === 'v1' ? 1 : 2;
const MAX_SLOT_ROWS = 4;

function validateSlotPolicy(data, label = 'level data', maxRows = MAX_SLOT_ROWS) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(label + ' must be an object');
    }
    const policy = data.slotPolicy;
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
        throw new Error(label + ' missing slotPolicy');
    }
    const values = {};
    for (const [key, minValue] of [['defaultRows', 1], ['freeUnlockRows', 0], ['adUnlockRows', 0]]) {
        const value = policy[key];
        if (!Number.isInteger(value) || value < minValue) {
            throw new Error(label + ' slotPolicy.' + key + ' must be an integer >= ' + minValue);
        }
        values[key] = value;
    }
    if (values.defaultRows + values.freeUnlockRows + values.adUnlockRows > maxRows) {
        throw new Error(label + ' slotPolicy row total exceeds max rows: ' + maxRows);
    }
    if (policy.unlockAllRowsAtOnce !== undefined && typeof policy.unlockAllRowsAtOnce !== 'boolean') {
        throw new Error(label + ' slotPolicy.unlockAllRowsAtOnce must be boolean when present');
    }
    return policy;
}

module.exports = {
    LEVEL_DATA_CONTRACT,
    LEVEL_DATA_SCHEMA_VERSION,
    LEVEL_DATA_CLIENT_BUILD,
    MAX_SLOT_ROWS,
    validateSlotPolicy,
};
