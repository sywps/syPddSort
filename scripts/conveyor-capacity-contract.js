'use strict';

const LEVEL_DATA_CONTRACT = 'v3';
const requestedContract = String(process.env.PDD_LEVEL_DATA_CONTRACT || LEVEL_DATA_CONTRACT).trim().toLowerCase();
if (requestedContract !== LEVEL_DATA_CONTRACT) {
    throw new Error('PDD_LEVEL_DATA_CONTRACT must be v3: ' + requestedContract);
}

const LEVEL_DATA_SCHEMA_VERSION = 3;
const LEVEL_DATA_CLIENT_BUILD = 3;
const CONVEYOR_STACK_DEPTH = 3;

function validateConveyorCapacity(data, label = 'level data', stackDepth = CONVEYOR_STACK_DEPTH) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(label + ' must be an object');
    }
    const capacity = data.conveyorCapacity;
    if (!Number.isInteger(capacity) || capacity <= 0) {
        throw new Error(label + ' conveyorCapacity must be a positive integer');
    }
    if (!Number.isInteger(stackDepth) || stackDepth <= 0) {
        throw new Error(label + ' conveyor stack depth must be a positive integer');
    }
    if (capacity % stackDepth !== 0) {
        throw new Error(label + ' conveyorCapacity must be a multiple of ' + stackDepth);
    }
    return capacity;
}

module.exports = {
    LEVEL_DATA_CONTRACT,
    LEVEL_DATA_SCHEMA_VERSION,
    LEVEL_DATA_CLIENT_BUILD,
    CONVEYOR_STACK_DEPTH,
    validateConveyorCapacity,
};
