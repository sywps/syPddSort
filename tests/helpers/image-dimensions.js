const assert = require('node:assert/strict');
const { PNG } = require('pngjs');

module.exports = function imageDimensions(buffer) {
    if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
        const png = PNG.sync.read(buffer);
        return { width: png.width, height: png.height };
    }
    assert.equal(buffer.readUInt16BE(0), 0xffd8, 'expected PNG or JPEG');
    let offset = 2;
    while (offset < buffer.length) {
        assert.equal(buffer[offset++], 0xff, 'invalid JPEG marker');
        while (buffer[offset] === 0xff) offset++;
        const marker = buffer[offset++];
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        const length = buffer.readUInt16BE(offset);
        assert(length >= 2 && offset + length <= buffer.length, 'invalid JPEG segment length');
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            assert(length >= 8, 'invalid JPEG frame');
            const height = buffer.readUInt16BE(offset + 3);
            const width = buffer.readUInt16BE(offset + 5);
            assert(width > 0 && height > 0, 'invalid JPEG dimensions');
            return { width, height };
        }
        offset += length;
    }
    throw new Error('JPEG frame dimensions not found');
};
