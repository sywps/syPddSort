'use strict';

function validateHard(data, label = 'level data') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(label + ' must be an object');
    }
    if (data.Hard !== 0 && data.Hard !== 1) {
        throw new Error(label + ' Hard must be 0 or 1');
    }
    return data.Hard;
}

module.exports = { validateHard };
